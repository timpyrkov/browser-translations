// API compatibility
const brw = typeof browser !== "undefined" ? browser : chrome;

import { translateText, getLastUsage, DEFAULT_LOCAL_CAP_CHARS } from "./translator.js";
import { detectLanguage } from "./language-detect.js";
import { LANGUAGES } from "./languages.js";
import { UI_STRINGS, UI_FLAGS, detectBrowserLanguage, t } from "./i18n.js";

const readingPaneEl = document.getElementById("reading-pane");
const fromLangEl = document.getElementById("fromLang");
const toLangEl = document.getElementById("toLang");
const scopeSelectEl = document.getElementById("scopeSelect");
const translateBtn = document.getElementById("translateBtn");
const historyPrevBtn = document.getElementById("historyPrevBtn");
const historyNextBtn = document.getElementById("historyNextBtn");
const engineSelectEl = document.getElementById("engineSelect");
const engineSettingsBtn = document.getElementById("engineSettingsBtn");
const engineSettingsPanel = document.getElementById("engineSettingsPanel");
const apiKeyGroup = document.getElementById("apiKeyGroup");
const apiKeyInput = document.getElementById("apiKeyInput");
const modelGroup = document.getElementById("modelGroup");
const modelInput = document.getElementById("modelInput");
const baseUrlGroup = document.getElementById("baseUrlGroup");
const baseUrlInput = document.getElementById("baseUrlInput");
const capCharsGroup = document.getElementById("capCharsGroup");
const capCharsInput = document.getElementById("capCharsInput");
const usageHint = document.getElementById("usageHint");
const uiLangSelectEl = document.getElementById("uiLangSelect");
const themeToggleEl = document.getElementById("themeToggle");
const apiKeyLabelText = document.getElementById("apiKeyLabelText");
const modelLabelText = document.getElementById("modelLabelText");
const ollamaUrlLabelText = document.getElementById("ollamaUrlLabelText");
const capCharsLabelText = document.getElementById("capCharsLabelText");

let currentScreen = "welcome";

// Single in-memory back/forward translation history (like a browser's own
// history, not persisted across sidebar reloads) - not per language pair,
// simplest FIFO stack capped at 10 entries. `historyIndex` points at the
// entry currently shown; the newest entry is always the last one in the
// array (the "->"-most position).
const MAX_HISTORY = 10;
let translationHistory = []; // avoid shadowing the global window.history
let historyIndex = -1;

const ENGINES = ["mymemory", "openai", "anthropic", "mistral", "groq", "ollama", "libretranslate"];

// "auto": translate the user's selection if any, otherwise the
// auto-detected main content. "full": translate everything visible on the
// page (header/nav/footer/sidebars included) - see content.js's
// extractBlocks(). Persisted separately from the from/to languages.
const SCOPES = ["auto", "full"];
const SCOPE_LABEL_KEYS = { auto: "scopeAutoLabel", full: "scopeFullLabel" };

// Kept in sync with translator.js's DEFAULT_MODELS (see the comment there
// for why each of these was picked) - duplicated here since the model
// input is now pre-filled with the default text directly rather than just
// showing it as a placeholder/hint.
const MODEL_DEFAULTS = {
  openai: "gpt-5.6-terra",
  anthropic: "claude-sonnet-5",
  mistral: "mistral-small-latest",
  groq: "llama-3.3-70b-versatile",
  ollama: "mistral",
};

function makeOption(value, text) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = text;
  return option;
}

function populateLanguageSelects(uiLang) {
  const strings = UI_STRINGS[uiLang] || UI_STRINGS.en;
  const names = strings.languageNames || UI_STRINGS.en.languageNames;
  const fromSelected = fromLangEl.value;
  const toSelected = toLangEl.value;

  fromLangEl.textContent = "";
  toLangEl.textContent = "";

  fromLangEl.appendChild(makeOption("auto", strings.autodetectLabel));
  for (const l of LANGUAGES) {
    const label = names[l.code] || l.name;
    fromLangEl.appendChild(makeOption(l.code, label));
    toLangEl.appendChild(makeOption(l.code, label));
  }

  if (fromSelected) fromLangEl.value = fromSelected;
  if (toSelected) toLangEl.value = toSelected;
}

const ENGINE_LABEL_KEYS = {
  mymemory: "engineMyMemory",
  openai: "engineOpenAI",
  anthropic: "engineAnthropic",
  mistral: "engineMistral",
  groq: "engineGroq",
  ollama: "engineOllama",
  libretranslate: "engineLibreTranslate",
};

function populateEngineSelect(uiLang) {
  const strings = UI_STRINGS[uiLang] || UI_STRINGS.en;
  const selected = engineSelectEl.value;
  engineSelectEl.textContent = "";
  for (const value of ENGINES) {
    engineSelectEl.appendChild(makeOption(value, strings[ENGINE_LABEL_KEYS[value]]));
  }
  if (selected) engineSelectEl.value = selected;
}

function populateScopeSelect(uiLang) {
  const strings = UI_STRINGS[uiLang] || UI_STRINGS.en;
  const selected = scopeSelectEl.value;
  scopeSelectEl.textContent = "";
  for (const value of SCOPES) {
    scopeSelectEl.appendChild(makeOption(value, strings[SCOPE_LABEL_KEYS[value]]));
  }
  if (selected) scopeSelectEl.value = selected;
}

function populateUiLangSelect() {
  uiLangSelectEl.textContent = "";
  for (const l of LANGUAGES) {
    const label = `${UI_FLAGS[l.code] || ""} ${l.code.toUpperCase()}`.trim();
    uiLangSelectEl.appendChild(makeOption(l.code, label));
  }
}

/**
 * Applies the interface (chrome) language to every static UI string -
 * separate from the source/target languages used for page-content
 * translation. Falls back to English for any missing key/language.
 */
function applyUiLanguage(lang) {
  const strings = UI_STRINGS[lang] || UI_STRINGS.en;

  document.title = strings.appTitle;
  // Firefox shows a fixed title in the sidebar panel's own header bar
  // (separate from the document <title>); Chrome's side panel has no such
  // API, so this is guarded and simply a no-op there.
  if (brw.sidebarAction && brw.sidebarAction.setTitle) {
    brw.sidebarAction.setTitle({ title: strings.appTitle });
  }

  uiLangSelectEl.title = strings.uiLangLabel;
  fromLangEl.title = strings.fromLabel;
  toLangEl.title = strings.toLabel;
  scopeSelectEl.title = strings.scopeLabel;
  engineSelectEl.title = strings.engineLabel;
  engineSettingsBtn.title = strings.engineSettingsLabel;
  translateBtn.textContent = strings.translateBtn;
  translateBtn.title = strings.translateBtn;
  historyPrevBtn.title = strings.historyPrevLabel;
  historyNextBtn.title = strings.historyNextLabel;
  if (themeToggleEl) themeToggleEl.title = strings.themeToggleLabel;
  apiKeyLabelText.textContent = strings.apiKeyLabel;
  modelLabelText.textContent = strings.modelLabel;
  capCharsLabelText.textContent = strings.capCharsLabel;

  populateLanguageSelects(lang);
  populateScopeSelect(lang);
  populateEngineSelect(lang);
  updateEngineFieldVisibility(); // also sets the base-URL label (Ollama vs LibreTranslate) for `lang`

  if (currentScreen === "welcome") showWelcome();
}

async function loadUiLanguage() {
  const settings = await brw.storage.local.get(["uiLanguage"]);
  let lang = settings.uiLanguage;
  if (!lang) {
    const browserLang = detectBrowserLanguage();
    lang = LANGUAGES.some((l) => l.code === browserLang) ? browserLang : "en";
  }
  if (!UI_STRINGS[lang]) lang = "en";
  uiLangSelectEl.value = lang;
  applyUiLanguage(lang);
}

async function loadLanguageSelection() {
  const settings = await brw.storage.local.get(["sourceLanguage", "targetLanguage", "extractionScope"]);
  fromLangEl.value = settings.sourceLanguage || "auto";
  toLangEl.value = settings.targetLanguage || "en";
  scopeSelectEl.value = settings.extractionScope || "auto";
}

function saveLanguageSelection() {
  brw.storage.local.set({
    sourceLanguage: fromLangEl.value,
    targetLanguage: toLangEl.value,
    extractionScope: scopeSelectEl.value,
  });
}

// Providers that run on a locally-hosted server (no bring-your-own API key,
// URL instead) - Ollama and self-hosted LibreTranslate.
const LOCAL_SERVER_ENGINES = ["ollama", "libretranslate"];
const BASE_URL_DEFAULTS = {
  ollama: "http://localhost:11434",
  libretranslate: "http://localhost:5001",
};

// Per-engine settings (apiKey/model/baseUrl), keyed by provider - each
// engine remembers its own values independently, so switching engines in
// the dropdown no longer leaks one provider's leftover field values into
// another's (e.g. a Mistral model name showing up while OpenAI is
// selected). Persisted as a single object under storage.local.engineConfigs.
let engineConfigs = {};
// Tracks which provider's fields are currently shown, so a field edit or an
// engine switch knows which entry in `engineConfigs` to save into before
// moving on.
let activeProvider = "mymemory";

function currentEngineFields() {
  return {
    apiKey: apiKeyInput.value.trim(),
    model: modelInput.value.trim(),
    baseUrl: baseUrlInput.value.trim(),
    capChars: Number(capCharsInput.value) > 0 ? Number(capCharsInput.value) : DEFAULT_LOCAL_CAP_CHARS,
  };
}

function saveActiveEngineFields() {
  engineConfigs[activeProvider] = currentEngineFields();
  brw.storage.local.set({ translationProvider: engineSelectEl.value, engineConfigs });
}

/** Fills the apiKey/model/baseUrl/capChars inputs from `engineConfigs[provider]`, falling back to that provider's defaults. */
function loadEngineFieldsFor(provider) {
  const saved = engineConfigs[provider] || {};
  apiKeyInput.value = saved.apiKey || "";
  modelInput.value = saved.model || MODEL_DEFAULTS[provider] || "";
  baseUrlInput.value = saved.baseUrl || BASE_URL_DEFAULTS[provider] || "";
  capCharsInput.value = saved.capChars || DEFAULT_LOCAL_CAP_CHARS;
}

async function loadEngineSettings() {
  const settings = await brw.storage.local.get(["translationProvider", "engineConfigs"]);
  engineConfigs = settings.engineConfigs || {};
  activeProvider = settings.translationProvider || "mymemory";
  engineSelectEl.value = activeProvider;
  loadEngineFieldsFor(activeProvider);
  updateEngineFieldVisibility();
}

function updateEngineFieldVisibility() {
  const provider = engineSelectEl.value;
  const isLocalServer = LOCAL_SERVER_ENGINES.includes(provider);
  apiKeyGroup.style.display = provider === "mymemory" || isLocalServer ? "none" : "";
  modelGroup.style.display = provider === "mymemory" || provider === "libretranslate" ? "none" : "";
  baseUrlGroup.style.display = isLocalServer ? "" : "none";
  capCharsGroup.style.display = isLocalServer ? "" : "none";

  if (isLocalServer) {
    const strings = UI_STRINGS[uiLangSelectEl.value] || UI_STRINGS.en;
    ollamaUrlLabelText.textContent =
      provider === "libretranslate" ? strings.libretranslateUrlLabel : strings.ollamaUrlLabel;
    baseUrlInput.placeholder = BASE_URL_DEFAULTS[provider];
  }
}

function updateUsageHint() {
  const usage = getLastUsage();
  if (!usage || !usage.tokens) {
    usageHint.textContent = "";
    return;
  }
  usageHint.textContent = `Last translation used ~${usage.tokens} tokens (${usage.provider}).`;
}

function showWelcome() {
  currentScreen = "welcome";
  const strings = UI_STRINGS[uiLangSelectEl.value] || UI_STRINGS.en;
  readingPaneEl.textContent = "";
  const p = document.createElement("p");
  p.className = "welcome-text";
  p.textContent = strings.welcomeText;
  readingPaneEl.appendChild(p);
}

function showLoading() {
  currentScreen = "loading";
  const strings = UI_STRINGS[uiLangSelectEl.value] || UI_STRINGS.en;
  readingPaneEl.textContent = "";
  const p = document.createElement("p");
  p.className = "loading-text";
  p.textContent = strings.loadingText;
  readingPaneEl.appendChild(p);
}

function showError(message) {
  currentScreen = "error";
  readingPaneEl.textContent = "";
  const p = document.createElement("p");
  p.className = "error-text";
  p.textContent = message;
  readingPaneEl.appendChild(p);
}

/**
 * Turns a raw thrown error into a message that actually helps the user,
 * instead of a generic "Translation failed" - localized to the current
 * interface language via t() (see i18n.js / locales/*.js).
 */
function describeError(lang, error) {
  const msg = (error && error.message) || String(error);

  if (/context invalidated/i.test(msg)) {
    return t(lang, "errContextInvalidated");
  }
  if (/could not establish connection|receiving end does not exist/i.test(msg)) {
    return t(lang, "errContentScript");
  }
  if (/ollama failed.*error 403/i.test(msg) || (/ollama/i.test(msg) && /403/.test(msg))) {
    return t(lang, "errOllama403");
  }
  if (/could not reach ollama/i.test(msg)) {
    return t(lang, "errOllamaUnreachable");
  }
  if (/could not reach libretranslate/i.test(msg)) {
    return t(lang, "errLibreTranslateUnreachable");
  }
  if (/quota|limit|MYMEMORY WARNING/i.test(msg)) {
    return t(lang, "errQuota");
  }
  if (/network error reaching the translation server/i.test(msg)) {
    return t(lang, "errNetwork");
  }
  if (/translation server returned http/i.test(msg)) {
    return t(lang, "errServerHttp", msg.match(/\d+/)?.[0] || "error");
  }
  if (/missing host permission/i.test(msg)) {
    return t(lang, "errMissingHostPermission");
  }
  return t(lang, "errGeneric", msg);
}

function updateHistoryButtons() {
  historyPrevBtn.disabled = historyIndex <= 0;
  historyNextBtn.disabled = historyIndex < 0 || historyIndex >= translationHistory.length - 1;
}

/**
 * Records a freshly completed translation as the newest history entry and
 * renders it. If the user had navigated back and then translated again,
 * the abandoned "forward" entries are dropped first - same behavior as a
 * browser's own back/forward history.
 */
function pushHistoryAndRender(blocks, translatedBlocks) {
  translationHistory = translationHistory.slice(0, historyIndex + 1);
  translationHistory.push({ blocks, translatedBlocks });
  if (translationHistory.length > MAX_HISTORY) translationHistory.shift();
  historyIndex = translationHistory.length - 1;
  updateHistoryButtons();
  renderParallelBlocks(blocks, translatedBlocks);
}

function showHistoryEntry(index) {
  const entry = translationHistory[index];
  if (!entry) return;
  historyIndex = index;
  updateHistoryButtons();
  renderParallelBlocks(entry.blocks, entry.translatedBlocks);
}

/**
 * Keeps whole blocks (headings/paragraphs/list items/etc, never splitting a
 * block's own lines across the cutoff unless a single block alone exceeds
 * the cap) from the start of `blocks` until adding the next one would push
 * the total joined line length over `maxChars`. Used for Ollama/
 * LibreTranslate only (see LOCAL_CAPPED_PROVIDERS in translator.js) so the
 * reading pane never prints original-page text past what will actually get
 * translated - unlike the cloud engines/MyMemory, which always show and
 * translate the whole page.
 */
function truncateBlocksForLocalCap(blocks, maxChars) {
  const kept = [];
  let chars = 0;

  for (const block of blocks) {
    const blockChars = block.lines.reduce((sum, line) => sum + line.length + 1, 0);

    if (kept.length === 0 && blockChars > maxChars) {
      // Even the very first block alone exceeds the cap (e.g. one huge
      // paragraph) - keep as many of its own whole lines as fit rather
      // than showing nothing at all.
      const partialLines = [];
      let partialChars = 0;
      for (const line of block.lines) {
        const next = partialChars + line.length + (partialLines.length > 0 ? 1 : 0);
        if (partialLines.length > 0 && next > maxChars) break;
        partialLines.push(line);
        partialChars = next;
      }
      kept.push({ ...block, lines: partialLines });
      return { blocks: kept, truncated: true };
    }

    if (kept.length > 0 && chars + blockChars > maxChars) {
      return { blocks: kept, truncated: true };
    }

    kept.push(block);
    chars += blockChars;
  }

  return { blocks: kept, truncated: false };
}

/**
 * Pulls the main text from the active tab's content script and renders the
 * parallel translation. Pull-based (sidebar asks, content script answers)
 * to avoid the race condition of content.js pushing a message before the
 * sidebar has finished loading and attached its listener.
 */
async function translateActiveTab() {
  try {
    showLoading();

    const [tab] = await brw.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      showError(t(uiLangSelectEl.value, "errNoActiveTab"));
      return;
    }

    if (!tab.url || /^(about|chrome|edge|moz-extension|chrome-extension):/i.test(tab.url)) {
      showError(t(uiLangSelectEl.value, "errSpecialPage"));
      return;
    }

    // Make sure content.js is present, then ask it for the page text.
    // Readability's two files are loaded first, as plain (non-module)
    // scripts sharing the same isolated content-script world, so their
    // top-level `Readability`/`isProbablyReaderable` function declarations
    // are available as globals by the time content.js runs.
    await brw.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["vendor/Readability.js", "vendor/Readability-readerable.js", "content.js"],
    });

    const scope = scopeSelectEl.value === "full" ? "full" : "auto";
    const response = await brw.tabs.sendMessage(tab.id, { command: "extract-text", scope });
    if (!response || response.status !== "success" || !response.payload || response.payload.length === 0) {
      showError(t(uiLangSelectEl.value, "errNoText"));
      return;
    }

    // Blocks preserve the page's structure (headings/paragraphs/list
    // items/blockquotes); flatten to one line-per-entry for translation,
    // then re-slice the translated lines back into the same block shape.
    let blocks = response.payload;

    // Ollama and LibreTranslate (both run on hardware the user controls,
    // see LOCAL_CAPPED_PROVIDERS in translator.js) hard-truncate by whole
    // blocks/sentences *before* anything is shown, at each provider's own
    // configured cap (engine settings panel, default DEFAULT_LOCAL_CAP_CHARS),
    // so the reading pane never prints original-page text beyond what will
    // actually get translated - unlike cloud engines/MyMemory, which always
    // show and translate the whole page.
    const selectedProvider = engineSelectEl.value || "mymemory";
    const engineFields = currentEngineFields();
    let wasTruncatedLocally = false;
    if (LOCAL_SERVER_ENGINES.includes(selectedProvider)) {
      const capChars = engineFields.capChars || DEFAULT_LOCAL_CAP_CHARS;
      const totalChars = blocks.reduce(
        (sum, b) => sum + b.lines.reduce((s, l) => s + l.length, 0),
        0
      );
      if (totalChars > capChars) {
        const result = truncateBlocksForLocalCap(blocks, capChars);
        blocks = result.blocks;
        wasTruncatedLocally = result.truncated;
      }
    }

    const originalLines = blocks.flatMap((b) => b.lines);

    if (originalLines.length === 0) {
      showError(t(uiLangSelectEl.value, "errNoText"));
      return;
    }

    const fromChoice = fromLangEl.value || "auto";
    const destLang = toLangEl.value || "en";
    const sample = originalLines.slice(0, 5).join(" ");
    const sourceLang = fromChoice === "auto" ? detectLanguage(sample) : fromChoice;

    if (sourceLang === destLang) {
      pushHistoryAndRender(blocks, blocks);
      return;
    }

    console.log(`Translating from ${sourceLang} to ${destLang}`);

    const originalText = originalLines.join("\n");
    const translatedText = await translateText(originalText, sourceLang, destLang, {
      provider: selectedProvider,
      ...engineFields,
    });
    const translatedLines = translatedText.split("\n");

    // Backends preserve line count/order, but guard against a short-count
    // mismatch anyway (e.g. an LLM dropping a blank line) by padding.
    let cursor = 0;
    const translatedBlocks = blocks.map((b) => {
      const lines = translatedLines.slice(cursor, cursor + b.lines.length);
      while (lines.length < b.lines.length) lines.push("");
      cursor += b.lines.length;
      return { ...b, lines };
    });

    updateUsageHint();

    // blocks/originalLines were already hard-truncated above for the local
    // Ollama engine (see truncateBlocksForLocalCap) - surface that as a
    // one-off notice block appended to the reading pane so it's clear why
    // the rest of the page is missing entirely.
    let finalBlocks = blocks;
    let finalTranslatedBlocks = translatedBlocks;
    if (wasTruncatedLocally) {
      const notice = { tag: "notice", lines: [t(uiLangSelectEl.value, "noticeOllamaTruncated")] };
      finalBlocks = [...blocks, notice];
      finalTranslatedBlocks = [...translatedBlocks, notice];
    }

    pushHistoryAndRender(finalBlocks, finalTranslatedBlocks);
  } catch (error) {
    console.error("Translation error in sidebar:", error);
    showError(describeError(uiLangSelectEl.value, error));
  }
}

// Set things up once the sidebar first opens. No autorun translation —
// wait for an explicit Translate click so a stale/errored tab state isn't
// shown immediately on every reload.
document.addEventListener("DOMContentLoaded", async () => {
  populateLanguageSelects("en");
  populateUiLangSelect();
  populateScopeSelect("en");
  populateEngineSelect("en");
  await loadLanguageSelection();
  await loadEngineSettings();
  await loadUiLanguage();
});

translateBtn.addEventListener("click", translateActiveTab);

historyPrevBtn.addEventListener("click", () => {
  if (historyIndex > 0) showHistoryEntry(historyIndex - 1);
});

historyNextBtn.addEventListener("click", () => {
  if (historyIndex < translationHistory.length - 1) showHistoryEntry(historyIndex + 1);
});

engineSettingsBtn.addEventListener("click", () => {
  engineSettingsPanel.hidden = !engineSettingsPanel.hidden;
});

engineSelectEl.addEventListener("change", () => {
  // Persist the outgoing provider's fields before switching, then load the
  // newly selected provider's own saved (or default) fields.
  saveActiveEngineFields();
  activeProvider = engineSelectEl.value;
  loadEngineFieldsFor(activeProvider);
  updateEngineFieldVisibility();
  saveActiveEngineFields();
});

uiLangSelectEl.addEventListener("change", () => {
  const lang = uiLangSelectEl.value;
  brw.storage.local.set({ uiLanguage: lang });
  applyUiLanguage(lang);
});

[apiKeyInput, modelInput, baseUrlInput, capCharsInput].forEach((el) => {
  el.addEventListener("change", saveActiveEngineFields);
});

// Just persist the choice - don't auto-retranslate on change. The user
// clicks Translate explicitly (matches the engine-settings inputs' behavior
// below, and avoids firing a network request for every dropdown click).
[fromLangEl, toLangEl, scopeSelectEl].forEach((el) => {
  el.addEventListener("change", saveLanguageSelection);
});

// Builds a single original/translated sentence pair (original line, then
// its translation directly below), used as the base unit inside every
// block type below.
function buildLinePair(originalLine, translatedLine) {
  const pairEl = document.createElement("div");
  pairEl.className = "line-pair";

  const originalLineEl = document.createElement("p");
  originalLineEl.className = "line-original";
  originalLineEl.textContent = originalLine;
  pairEl.appendChild(originalLineEl);

  const translatedLineEl = document.createElement("p");
  translatedLineEl.className = "line-translated";
  translatedLineEl.textContent = translatedLine;
  pairEl.appendChild(translatedLineEl);

  return pairEl;
}

/**
 * Renders the extracted blocks (headings/paragraphs/list items/
 * blockquotes) as line-pairs wrapped in matching HTML so the original
 * page's structure (heading levels, bullet/numbered lists, quotes) is
 * preserved in the reading pane instead of flattening everything into
 * plain paragraphs. `originalBlocks`/`translatedBlocks` must be the same
 * shape (see `translateActiveTab()`).
 */
function renderParallelBlocks(originalBlocks, translatedBlocks) {
  currentScreen = "result";
  readingPaneEl.textContent = "";

  const fragment = document.createDocumentFragment();
  let currentList = null; // open <ul>/<ol> while consecutive li blocks share the same type

  const closeList = () => {
    if (currentList) fragment.appendChild(currentList);
    currentList = null;
  };

  originalBlocks.forEach((block, i) => {
    const translatedBlock = translatedBlocks[i] || block;

    if (block.tag === "notice") {
      // A UI-level notice (e.g. local-Ollama truncation), not a real
      // original/translated pair - render its single line once, muted,
      // instead of duplicating it into both reading columns.
      closeList();
      const noticeEl = document.createElement("p");
      noticeEl.className = "reading-notice";
      noticeEl.textContent = block.lines[0] || "";
      fragment.appendChild(noticeEl);
      return;
    }

    if (block.tag === "li") {
      const listTag = block.ordered ? "ol" : "ul";
      if (!currentList || currentList.tagName.toLowerCase() !== listTag) {
        closeList();
        currentList = document.createElement(listTag);
        currentList.className = "reading-list";
      }
      const liEl = document.createElement("li");
      block.lines.forEach((line, j) => {
        liEl.appendChild(buildLinePair(line, translatedBlock.lines[j] || ""));
      });
      currentList.appendChild(liEl);
      return;
    }

    closeList();

    const wrapperTag = /^h[1-6]$/.test(block.tag) ? block.tag : block.tag === "blockquote" ? "blockquote" : "div";
    const wrapperEl = document.createElement(wrapperTag);
    wrapperEl.className = /^h[1-6]$/.test(block.tag)
      ? "reading-heading"
      : block.tag === "blockquote"
        ? "reading-quote"
        : "reading-paragraph";

    block.lines.forEach((line, j) => {
      wrapperEl.appendChild(buildLinePair(line, translatedBlock.lines[j] || ""));
    });

    fragment.appendChild(wrapperEl);
  });

  closeList();
  readingPaneEl.appendChild(fragment);
}