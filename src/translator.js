// Translation backends.
//
// Default: MyMemory (api.mymemory.translated.net) - works anonymously with
// no signup, but is limited to ~500 words/day per IP (libretranslate.com's
// public API now requires a paid key, so it's no longer usable as a
// no-signup default - confirmed with curl: anonymous requests get 400
// "Visit https://portal.libretranslate.com to get an API key").
//
// Optional: bring-your-own-key LLM providers (OpenAI/Anthropic/Mistral) or
// a local Ollama server, configured from the sidebar toolbar's engine
// settings panel. These give better quality and no daily word cap. If no
// key is configured, or an LLM request fails for any reason, translation
// transparently falls back to MyMemory so the extension always works out
// of the box.
import { LANGUAGE_NAMES } from "./languages.js";

const MYMEMORY_URL = "https://api.mymemory.translated.net/get";
const MAX_CHARS_PER_REQUEST = 450; // stay under MyMemory's per-request limit

// Conservative per-request budget for LLM providers, so a very long page
// doesn't get sent as one giant prompt that overflows the model's context
// window. We don't know the actual context window of whichever
// provider/model the user picked (this matters especially for a locally
// configured Ollama model, which can default to as little as ~2K-4K
// tokens), so this is a one-size-fits-all heuristic rather than an exact
// token count: ~4 chars/token is a common rule of thumb, so 6000 chars is
// roughly 1500 tokens of input, leaving generous headroom for the prompt
// wrapper, numbering, and the model's own output in the same context.
const MAX_LLM_CHARS_PER_BATCH = 6000;
// Also cap by line count so many short lines (each cheap on chars but
// adding numbering/formatting overhead) don't pile up into one batch.
const MAX_LLM_LINES_PER_BATCH = 60;

// Providers that run on hardware/infrastructure the *user* controls (their
// own machine, or a self-hosted server they're running) rather than a
// cloud vendor's - an oversized page could tie up either one for a long
// time or overload it entirely, unlike cloud providers (OpenAI/Anthropic/
// Mistral) which are just batched (see MAX_LLM_CHARS_PER_BATCH above).
// Rather than refusing the whole page, translateText() translates only as
// many whole lines as fit under a cap (see truncateLinesForLocalCap()) and
// leaves the rest untranslated, flagging the result as truncated so the UI
// can tell the user to switch to a cloud provider for the full page. The
// cap itself is configurable per-provider from the engine settings panel
// (options.capChars) - this is just the fallback when unset.
const LOCAL_CAPPED_PROVIDERS = ["ollama", "libretranslate"];
export const DEFAULT_LOCAL_CAP_CHARS = 2500;

/**
 * Keeps whole lines (never splitting mid-sentence) from the start of
 * `lines` until adding the next one would push the joined length over
 * `maxChars`. Returns the kept subset and whether anything was left out.
 * If even the very first line alone exceeds the cap, it's still kept alone
 * (same "don't chop a line" tradeoff as chunkLinesForLlm) so at least
 * something gets translated rather than nothing.
 */
function truncateLinesForLocalCap(lines, maxChars) {
  const kept = [];
  let chars = 0;
  for (const line of lines) {
    const nextChars = chars + line.length + (kept.length > 0 ? 1 : 0);
    if (kept.length > 0 && nextChars > maxChars) break;
    kept.push(line);
    chars = nextChars;
  }
  return { kept, truncated: kept.length < lines.length };
}

// Picked for translation workloads specifically (cheap/fast enough for
// bulk per-line requests, still strong multilingual quality) - reviewed
// July 2026 against each vendor's current lineup:
// - gpt-5.6-terra: OpenAI's mid-tier GPT-5.6 model, balances intelligence
//   and cost (the flagship gpt-5.6-sol is overkill/pricier for translation).
// - claude-sonnet-5: Anthropic's current workhorse tier, strong quality at
//   a fraction of Opus 5's cost.
// - mistral-small-latest: kept as-is - an alias Mistral repoints at its
//   current small-tier model (Mistral Small 4 as of mid-2026), so it stays
//   current without needing manual updates here.
// - mistral: lighter local footprint than qwen3:8b on modest/CPU-only
//   hardware, which matters more for Ollama than raw multilingual coverage
//   given the configurable local size cap (DEFAULT_LOCAL_CAP_CHARS) already
//   keeps requests small.
// - groq: llama-3.3-70b-versatile - Groq's OpenAI-compatible cloud runs
//   Llama 3.3 70B at very high tokens/sec, so bulk per-line translation
//   comes back fast; the 70B tier keeps strong multilingual quality while
//   the "versatile" alias stays pointed at Groq's current production build.
const DEFAULT_MODELS = {
  openai: "gpt-5.6-terra",
  anthropic: "claude-sonnet-5",
  mistral: "mistral-small-latest",
  groq: "llama-3.3-70b-versatile",
  ollama: "mistral",
};

// Tracks token usage from the most recent LLM request, so the sidebar can
// show a small "~N tokens used" note. null when the last translation used
// MyMemory (no token concept) or hasn't run yet.
let lastUsage = null;

export function getLastUsage() {
  return lastUsage;
}

function chunkByWords(line) {
  if (line.length <= MAX_CHARS_PER_REQUEST) return [line];

  const words = line.split(" ");
  const chunks = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > MAX_CHARS_PER_REQUEST && current) {
      chunks.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Splits an array of lines into batches that stay under both a character
 * and line-count budget (see MAX_LLM_CHARS_PER_BATCH/MAX_LLM_LINES_PER_BATCH
 * above), so each individual LLM translation request has a good chance of
 * fitting comfortably within the model's context window. In the common
 * case (a normal article) this returns a single batch containing every
 * line, so nothing changes for the vast majority of pages - splitting only
 * kicks in for unusually long pages.
 *
 * A single line longer than the budget is still sent alone in its own
 * (oversized) batch rather than split mid-sentence, since chopping a line
 * into fragments would strip the LLM of the context it needs to translate
 * it accurately; this is a rare edge case (e.g. one huge unbroken
 * paragraph) that we accept as a best-effort limitation.
 */
function chunkLinesForLlm(lines, maxChars = MAX_LLM_CHARS_PER_BATCH, maxLines = MAX_LLM_LINES_PER_BATCH) {
  const batches = [];
  let current = [];
  let currentChars = 0;

  for (const line of lines) {
    const wouldOverflow = current.length > 0 &&
      (currentChars + line.length > maxChars || current.length >= maxLines);
    if (wouldOverflow) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(line);
    currentChars += line.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

async function translateChunk(chunk, sourceLang, targetLang) {
  const url = `${MYMEMORY_URL}?q=${encodeURIComponent(chunk)}&langpair=${sourceLang}|${targetLang}`;

  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    // fetch() itself only throws on network-level failures (offline, DNS,
    // blocked by a VPN/firewall, CORS preflight rejected, etc.) - it does
    // NOT throw for HTTP error status codes, those are handled below.
    throw new Error(`Network error reaching the translation server: ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`Translation server returned HTTP ${response.status}`);
  }

  const result = await response.json();

  if (result.responseStatus && Number(result.responseStatus) !== 200) {
    throw new Error(result.responseDetails || "Translation request failed");
  }

  const translated = result.responseData?.translatedText || chunk;
  if (/MYMEMORY WARNING/i.test(translated)) {
    throw new Error("MyMemory daily translation quota reached");
  }

  return translated;
}

async function translateLine(line, sourceLang, targetLang) {
  const chunks = chunkByWords(line);
  const translatedChunks = [];
  for (const chunk of chunks) {
    translatedChunks.push(await translateChunk(chunk, sourceLang, targetLang));
  }
  return translatedChunks.join(" ");
}

// How many lines to translate concurrently against MyMemory. Fully
// sequential (1 in-flight) was safe but slow for long articles; a small
// pool speeds things up noticeably without hammering the anonymous
// per-IP-rate-limited backend the way unlimited concurrency would.
const MYMEMORY_CONCURRENCY = 4;

/**
 * Runs `lines` through `translateOneLine` with a small worker pool, stopping
 * early (and surfacing the first error) if translation appears to be
 * failing systemically rather than on just one flaky line. Shared by
 * MyMemory and LibreTranslate, since both are plain per-line translation
 * APIs (unlike the LLM providers' single-batch numbered-line prompt).
 */
async function translateLinesWithPool(lines, translateOneLine, concurrency) {
  const translatedLines = new Array(lines.length);
  let firstError = null;
  let failureCount = 0;
  let stopped = false;
  let nextIndex = 0;

  async function worker() {
    while (!stopped) {
      const i = nextIndex++;
      if (i >= lines.length) return;

      try {
        translatedLines[i] = await translateOneLine(lines[i]);
      } catch (error) {
        console.error("Translation error for line:", lines[i], error);
        firstError = firstError || error;
        failureCount += 1;
        translatedLines[i] = "[Translation failed]";

        // A single flaky line is one thing, but if translation is failing
        // systemically (network down, quota exhausted, bad host permission),
        // every remaining line will fail the same way - stop wasting
        // requests and surface one clear error instead of a wall of
        // "[Translation failed]" placeholders.
        if (failureCount >= 3) {
          stopped = true;
        }
      }
    }
  }

  const workerCount = Math.min(concurrency, lines.length);
  await Promise.all(Array.from({ length: workerCount }, worker));

  if (firstError && (stopped || failureCount === lines.length)) {
    throw firstError;
  }

  return translatedLines.join("\n");
}

async function translateWithMyMemory(text, sourceLang, targetLang) {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return "";
  return translateLinesWithPool(
    lines,
    (line) => translateLine(line, sourceLang, targetLang),
    MYMEMORY_CONCURRENCY
  );
}

// Self-hosted, no daily quota, so a slightly higher pool than MyMemory's
// anonymous/rate-limited one is fine.
const LIBRETRANSLATE_CONCURRENCY = 6;
const DEFAULT_LIBRETRANSLATE_URL = "http://localhost:5001";

async function translateLibreTranslateLine(line, sourceLang, targetLang, { baseUrl, apiKey } = {}) {
  const url = `${(baseUrl || DEFAULT_LIBRETRANSLATE_URL).replace(/\/$/, "")}/translate`;
  const body = {
    q: line,
    source: sourceLang === "auto" ? "auto" : sourceLang,
    target: targetLang,
    format: "text",
  };
  if (apiKey) body.api_key = apiKey;

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(`Could not reach LibreTranslate at ${url}: ${error.message}`);
  }
  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(`LibreTranslate error ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const result = await response.json();
  return result.translatedText ?? line;
}

async function translateWithLibreTranslate(text, sourceLang, targetLang, options) {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return "";
  return translateLinesWithPool(
    lines,
    (line) => translateLibreTranslateLine(line, sourceLang, targetLang, options),
    LIBRETRANSLATE_CONCURRENCY
  );
}

/**
 * Builds a single prompt asking an LLM to translate a whole batch of lines
 * at once (one request per page instead of one per line/chunk), numbered so
 * the response can be matched back up to the originals in order.
 */
function buildLlmPrompt(lines, sourceLangName, targetLangName) {
  return [
    `Translate the following ${lines.length} numbered lines from ${sourceLangName} to ${targetLangName}.`,
    `Return ONLY the translated lines, one per line, in the same order, each prefixed with its original number and a period (e.g. "1. ..."). No extra commentary, no explanations, no quotes around lines.`,
    "",
    lines.map((l, i) => `${i + 1}. ${l}`).join("\n"),
  ].join("\n");
}

/**
 * Strips the "N. " numbering back off and places each line at its own
 * numbered index rather than trusting response order positionally - if the
 * model drops, merges, or reorders even one numbered line (which happens
 * occasionally), positional matching would silently shift every following
 * line out of alignment with its original, leaving some lines paired with
 * the wrong translation and others effectively untranslated. Falls back to
 * the old positional behavior only if the response has no numbering at all
 * (model ignored the instruction entirely).
 */
function parseNumberedLines(responseText, expectedCount) {
  const rawLines = responseText.split("\n").map((l) => l.trim()).filter(Boolean);
  const numberedMatches = rawLines.map((l) => l.match(/^(\d+)[.):]\s*(.*)$/));

  if (numberedMatches.some(Boolean)) {
    const result = new Array(expectedCount).fill("");
    numberedMatches.forEach((match) => {
      if (!match) return;
      const index = parseInt(match[1], 10) - 1;
      if (index >= 0 && index < expectedCount) result[index] = match[2];
    });
    return result;
  }

  const parsed = rawLines.map((l) => l.replace(/^\d+[.):]\s*/, ""));
  while (parsed.length < expectedCount) parsed.push("");
  return parsed.slice(0, expectedCount);
}

async function fetchJson(url, requestOptions, providerLabel) {
  let response;
  try {
    response = await fetch(url, requestOptions);
  } catch (error) {
    throw new Error(`Could not reach ${providerLabel}: ${error.message}`);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${providerLabel} error ${response.status}: ${body.slice(0, 200)}`);
  }
  return response.json();
}

async function translateWithOpenAI(lines, sourceLangName, targetLangName, { apiKey, model }) {
  if (!apiKey) throw new Error("Missing OpenAI API key");
  const result = await fetchJson(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || DEFAULT_MODELS.openai,
        messages: [
          { role: "system", content: "You are a precise translation engine." },
          { role: "user", content: buildLlmPrompt(lines, sourceLangName, targetLangName) },
        ],
        temperature: 0,
      }),
    },
    "OpenAI"
  );
  lastUsage = { provider: "openai", tokens: result.usage?.total_tokens };
  return parseNumberedLines(result.choices?.[0]?.message?.content || "", lines.length);
}

async function translateWithAnthropic(lines, sourceLangName, targetLangName, { apiKey, model }) {
  if (!apiKey) throw new Error("Missing Anthropic API key");
  const result = await fetchJson(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        // Anthropic blocks browser-origin requests unless this is set,
        // since it can't verify the key is only used server-side. That
        // tradeoff is inherent to any bring-your-own-key browser extension.
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODELS.anthropic,
        max_tokens: 4096,
        messages: [{ role: "user", content: buildLlmPrompt(lines, sourceLangName, targetLangName) }],
      }),
    },
    "Anthropic"
  );
  const usage = result.usage;
  lastUsage = { provider: "anthropic", tokens: usage ? (usage.input_tokens || 0) + (usage.output_tokens || 0) : undefined };
  return parseNumberedLines(result.content?.[0]?.text || "", lines.length);
}

async function translateWithMistral(lines, sourceLangName, targetLangName, { apiKey, model }) {
  if (!apiKey) throw new Error("Missing Mistral API key");
  const result = await fetchJson(
    "https://api.mistral.ai/v1/chat/completions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || DEFAULT_MODELS.mistral,
        messages: [{ role: "user", content: buildLlmPrompt(lines, sourceLangName, targetLangName) }],
        temperature: 0,
      }),
    },
    "Mistral"
  );
  lastUsage = { provider: "mistral", tokens: result.usage?.total_tokens };
  return parseNumberedLines(result.choices?.[0]?.message?.content || "", lines.length);
}

// Groq exposes an OpenAI-compatible Chat Completions API, so this mirrors
// translateWithOpenAI almost exactly - only the endpoint and default model
// differ.
async function translateWithGroq(lines, sourceLangName, targetLangName, { apiKey, model }) {
  if (!apiKey) throw new Error("Missing Groq API key");
  const result = await fetchJson(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || DEFAULT_MODELS.groq,
        messages: [
          { role: "system", content: "You are a precise translation engine." },
          { role: "user", content: buildLlmPrompt(lines, sourceLangName, targetLangName) },
        ],
        temperature: 0,
      }),
    },
    "Groq"
  );
  lastUsage = { provider: "groq", tokens: result.usage?.total_tokens };
  return parseNumberedLines(result.choices?.[0]?.message?.content || "", lines.length);
}

async function translateWithOllama(lines, sourceLangName, targetLangName, { model, baseUrl }) {
  const url = `${(baseUrl || "http://localhost:11434").replace(/\/$/, "")}/api/chat`;
  const result = await fetchJson(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model || DEFAULT_MODELS.ollama,
        messages: [{ role: "user", content: buildLlmPrompt(lines, sourceLangName, targetLangName) }],
        stream: false,
      }),
    },
    "Ollama"
  );
  lastUsage = { provider: "ollama", tokens: result.eval_count };
  return parseNumberedLines(result.message?.content || "", lines.length);
}

const LLM_PROVIDERS = {
  openai: translateWithOpenAI,
  anthropic: translateWithAnthropic,
  mistral: translateWithMistral,
  groq: translateWithGroq,
  ollama: translateWithOllama,
};

/**
 * @param {string} text - newline-separated lines to translate.
 * @param {string} sourceLang - source language code.
 * @param {string} targetLang - target language code.
 * @param {{provider?: string, apiKey?: string, model?: string, baseUrl?: string, capChars?: number}} [options]
 *   provider defaults to "mymemory" (free, no key). "openai"/"anthropic"/
 *   "mistral"/"ollama" use the corresponding LLM adapter; "libretranslate"
 *   talks to a self-hosted LibreTranslate server (baseUrl, default
 *   http://localhost:5001 - see ~/playground/texttools for a local Docker
 *   setup). All non-MyMemory providers fall back to MyMemory automatically
 *   if the request fails (missing/invalid key, unreachable server, rate
 *   limit, etc.) so translation never hard-fails just because an optional
 *   provider is misconfigured or not running. For "ollama"/"libretranslate"
 *   (see LOCAL_CAPPED_PROVIDERS), `capChars` sets the per-provider local
 *   size cap configured in the engine settings panel, falling back to
 *   DEFAULT_LOCAL_CAP_CHARS if unset/invalid.
 */
export async function translateText(text, sourceLang = "en", targetLang = "es", options = {}) {
  const provider = options.provider || "mymemory";
  const providerFn = LLM_PROVIDERS[provider];
  lastUsage = null;

  // Truncate (not the MyMemory fallback path below, which always uses the
  // full original `text`) before attempting the primary request, for any
  // provider running on hardware the user controls (see
  // LOCAL_CAPPED_PROVIDERS above).
  let effectiveText = text;
  let wasTruncated = false;
  if (LOCAL_CAPPED_PROVIDERS.includes(provider)) {
    const capChars = Number(options.capChars) > 0 ? Number(options.capChars) : DEFAULT_LOCAL_CAP_CHARS;
    if (text.length > capChars) {
      const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
      const { kept, truncated } = truncateLinesForLocalCap(lines, capChars);
      console.warn(
        `Page too large for local ${provider} translation (${text.length} chars, cap ${capChars}) - translating only the first ${kept.length} of ${lines.length} lines; use a cloud provider for the rest`
      );
      effectiveText = kept.join("\n");
      wasTruncated = truncated;
    }
  }

  if (provider === "libretranslate") {
    try {
      const translated = await translateWithLibreTranslate(effectiveText, sourceLang, targetLang, options);
      lastUsage = { provider: "libretranslate", tokens: undefined, truncated: wasTruncated };
      return translated;
    } catch (error) {
      console.error("LibreTranslate translation failed, falling back to MyMemory:", error);
      lastUsage = null;
      try {
        return await translateWithMyMemory(text, sourceLang, targetLang);
      } catch (fallbackError) {
        throw new Error(
          `LibreTranslate failed (${error.message}); MyMemory fallback also failed (${fallbackError.message})`
        );
      }
    }
  }

  if (providerFn) {
    const lines = effectiveText.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === 0) return "";

    try {
      const sourceLangName = LANGUAGE_NAMES[sourceLang] || sourceLang;
      const targetLangName = LANGUAGE_NAMES[targetLang] || targetLang;

      // Split into context-window-sized batches (see chunkLinesForLlm) and
      // translate them sequentially, in order, one request per batch - for
      // the vast majority of pages this is just a single batch and behaves
      // exactly as before.
      const batches = chunkLinesForLlm(lines);
      const translatedLines = [];
      let totalTokens = 0;
      let hasTokenCount = false;
      let providerName = provider;

      for (const batch of batches) {
        const batchTranslated = await providerFn(batch, sourceLangName, targetLangName, options);
        translatedLines.push(...batchTranslated);
        if (lastUsage && typeof lastUsage.tokens === "number") {
          totalTokens += lastUsage.tokens;
          hasTokenCount = true;
        }
        if (lastUsage) providerName = lastUsage.provider;
      }

      lastUsage = {
        provider: providerName,
        tokens: hasTokenCount ? totalTokens : undefined,
        truncated: wasTruncated,
      };
      return translatedLines.join("\n");
    } catch (error) {
      console.error(`${provider} translation failed, falling back to MyMemory:`, error);
      lastUsage = null;

      // If MyMemory *also* fails (e.g. its quota is exhausted), don't let
      // that mask the original provider's error - surface both so the user
      // can actually diagnose which one to fix.
      try {
        return await translateWithMyMemory(text, sourceLang, targetLang);
      } catch (fallbackError) {
        throw new Error(
          `${provider} failed (${error.message}); MyMemory fallback also failed (${fallbackError.message})`
        );
      }
    }
  }

  return translateWithMyMemory(text, sourceLang, targetLang);
}