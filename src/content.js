// API compatibility
const brw = typeof browser !== "undefined" ? browser : chrome;

brw.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.command === "extract-text") {
    try {
      // "auto" (default): translate the user's current text selection if
      // there is one, otherwise fall back to the auto-detected main
      // content. "full": ignore any selection and translate everything
      // visible on the page, including header/nav/footer/sidebars.
      const scope = message.scope === "full" ? "full" : "auto";
      const blocks = extractBlocks(scope);
      sendResponse({ status: "success", payload: blocks });
    } catch (error) {
      console.error("Error in content script:", error);
      sendResponse({ status: "error", message: error.message });
    }
  }
});

/**
 * Finds the best root element to extract content from: <article>, then
 * <main>, then a few common content-container selectors, then falls back to
 * <body> with obvious non-content chrome (nav/ads/etc.) stripped from a
 * clone so the original page is never mutated.
 */
function findContentRoot() {
  const articleEl = document.querySelector("article");
  if (articleEl) return articleEl;

  const mainEl = document.querySelector("main");
  if (mainEl) return mainEl;

  const contentSelectors = [
    '[role="main"]',
    '.content',
    '.post-content',
    '.article-content',
    '.entry-content',
    '#content',
    '#main-content'
  ];
  for (const selector of contentSelectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }

  const clone = document.body.cloneNode(true);
  const removeSelectors = [
    "nav", "footer", "header", "aside", "script", "noscript",
    ".nav", ".navigation", ".menu", ".sidebar", ".ad", ".advertisement",
    ".social", ".share", ".comments", ".related", ".recommended"
  ];
  removeSelectors.forEach((selector) => {
    clone.querySelectorAll(selector).forEach((el) => el.remove());
  });
  return clone;
}

// Block-level elements we preserve as distinct structure instead of
// flattening into plain paragraphs, so headings/lists/quotes keep their
// shape in the reading pane. `tr` picks up data-table rows (e.g. Wikipedia
// infobox key/value rows), rendered as plain paragraph-like blocks (see
// getBlockText() for the cell-join logic, since these aren't split into
// sentence lines the normal way). `figcaption`/`.thumbcaption`/
// `.infobox-caption` pick up image captions, which otherwise sit inside a
// plain `<div>` that's never walked (Wikipedia's infobox image captions are
// usually already covered by their enclosing `<tr>`, but standalone
// figure/thumbnail captions elsewhere in the article are not). Order
// doesn't matter here - document order is what's used when walking the tree.
const BLOCK_SELECTOR =
  "h1, h2, h3, h4, h5, h6, p, li, blockquote, tr, caption, figcaption, .thumbcaption, .infobox-caption";

// "Chrome" elements that sometimes end up inside otherwise-legitimate block
// text and should never be translated: MediaWiki's per-section "[edit]"
// links (`.mw-editsection`), footnote/citation markers (`sup.reference`,
// rendered as e.g. "[1]"), and their backlinks.
const NOISE_SELECTOR = ".mw-editsection, sup.reference, .mw-cite-backlink";

// Catches short reference/edit-link style bracketed tokens left over as
// plain text after noise-element removal (or on elements NOISE_SELECTOR
// doesn't reach), e.g. footnote markers ("[1]", "[a]", "[nb 3]") or
// MediaWiki's edit links in any language ("[edit]", "[editar]",
// "[modifier]", "[bearbeiten]", ...). Identified generically by being short
// (<=20 chars) and containing no further punctuation/brackets - not by a
// hardcoded per-language word list - so it isn't limited to a handful of
// languages, at the (accepted) cost of also swallowing rare legitimate
// short bracketed asides like "[sic]".
function stripReferenceBrackets(text) {
  return text.replace(/\s*\[[^\[\].!?]{1,20}\]\s*/g, " ");
}

// Single-letter/short tokens that commonly end in a period without ending a
// sentence - abbreviations (any single letter covers era markers like
// Spanish "a. C." / "d. C.", initials like "J. R. R. Tolkien", etc.) plus a
// short list of common multi-letter ones. This is a heuristic, not an
// exhaustive per-language dictionary.
const ABBREVIATIONS = new Set([
  "dr", "sr", "sra", "srta", "mr", "mrs", "ms", "prof", "st", "vs", "etc",
  "no", "nº", "art", "cap", "fig", "ed", "vol", "pp", "approx", "cf",
]);

/**
 * Splits a block's raw text into sentence-sized lines. Improves on a plain
 * "split after every '.'/'!'/'?'" regex by not splitting after a period
 * that likely belongs to an abbreviation (see ABBREVIATIONS and the
 * single-letter check) - otherwise dates like "1000 a. C." or initials get
 * chopped into their own bogus one-word "sentences".
 */
function splitIntoLines(text) {
  const normalized = stripReferenceBrackets(text.replace(/\s+/g, " ")).trim();
  if (!normalized) return [];

  const lines = [];
  let current = "";
  for (let i = 0; i < normalized.length; i++) {
    current += normalized[i];
    const ch = normalized[i];
    const atEnd = i === normalized.length - 1;
    const followedBySpace = atEnd || normalized[i + 1] === " ";
    if ((ch === "." || ch === "!" || ch === "?") && followedBySpace) {
      const wordMatch = current.match(/(\p{L}+)\.$/u);
      const lastWord = wordMatch ? wordMatch[1].toLowerCase() : null;
      const isAbbreviation =
        ch === "." && lastWord !== null && (lastWord.length === 1 || ABBREVIATIONS.has(lastWord));
      if (isAbbreviation && !atEnd) continue;
      lines.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines.filter((l) => l.length > 0);
}

/**
 * Joins a table row's header/data cell texts with a separator so infobox-
 * style key/value rows stay readable (e.g. "Type — Alphabet") instead of
 * running together with no whitespace. Needed because plain `textContent`
 * (used instead of `innerText` here since Readability/selection roots are
 * detached and have no computed layout) doesn't insert any separator
 * between adjacent table cells the way a rendered `innerText` would.
 */
function getRowText(tr) {
  return Array.from(tr.querySelectorAll("th, td"))
    .map((cell) => (cell.textContent || "").trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join(" — ");
}

/**
 * Returns an element's text for extraction, stripping out any nested
 * "noise" elements (see NOISE_SELECTOR) first via a throwaway clone so they
 * never leak into the extracted/translated text - e.g. a heading's
 * MediaWiki "[edit]" link.
 */
function getBlockText(el) {
  if (el.tagName.toLowerCase() === "tr") return getRowText(el);

  if (!el.querySelector(NOISE_SELECTOR)) {
    return el.innerText || el.textContent || "";
  }

  const clone = el.cloneNode(true);
  clone.querySelectorAll(NOISE_SELECTOR).forEach((n) => n.remove());
  return clone.textContent || "";
}

/**
 * Walks a root node (element or DocumentFragment) in document order and
 * collects each block-level element (heading/paragraph/list item/
 * blockquote) as `{ tag, ordered?, lines }`. Nested matches (e.g. a `<p>`
 * inside a `<blockquote>`, or a `<li>` inside another `<li>`'s nested list)
 * are skipped since their text is already captured by the outer block, to
 * avoid duplicating content.
 */
function extractBlocksFromRoot(root) {
  const matched = new Set();
  const blocks = [];

  root.querySelectorAll(BLOCK_SELECTOR).forEach((el) => {
    // Skip if an ancestor (other than the root itself) is already a
    // matched block - its textContent already covers this element.
    let ancestor = el.parentElement;
    while (ancestor && ancestor !== root) {
      if (matched.has(ancestor)) return;
      ancestor = ancestor.parentElement;
    }

    const rawText = getBlockText(el);
    const lines = splitIntoLines(rawText);
    if (lines.length === 0) return;

    matched.add(el);

    const rawTag = el.tagName.toLowerCase();
    if (rawTag === "li") {
      blocks.push({ tag: rawTag, ordered: !!el.closest("ol"), lines });
    } else if (/^h[1-6]$/.test(rawTag) || rawTag === "blockquote") {
      blocks.push({ tag: rawTag, lines });
    } else {
      // Normalize everything else (p, tr, caption, figcaption, and the
      // class-matched thumbcaption/infobox-caption which may land on a
      // div/td/etc.) to a plain paragraph-like block - there's no dedicated
      // rendering for these tags in the sidebar. Table rows are flattened
      // into a single readable line by getRowText() already.
      blocks.push({ tag: "p", lines });
    }
  });

  // No matching block-level tags at all - e.g. a plain <div>-only page, or
  // a text selection entirely within a single element with no nested tags
  // (DocumentFragment.innerText is undefined, hence the fallback to
  // textContent) - use the whole root's text as one paragraph block
  // instead of returning nothing.
  if (blocks.length === 0) {
    const wholeText = root.innerText || root.textContent || "";
    const lines = splitIntoLines(wholeText);
    if (lines.length > 0) blocks.push({ tag: "p", lines });
  }

  return blocks;
}

// Elements stripped for a dedicated MediaWiki/Wikipedia extraction pass -
// broader than the generic NOISE_SELECTOR since these are removed wholesale
// (not just their text), and cover MediaWiki-specific chrome that a generic
// Readability-style content scorer either misclassifies (infobox tables are
// dropped as "unlikely content" by Readability) or never sees in the first
// place (edit-section links, footnote markers, navboxes, table-of-contents,
// category links, hatnotes/disambiguation notices).
const WIKI_NOISE_SELECTOR = [
  ".mw-editsection",
  "sup.reference",
  ".mw-cite-backlink",
  ".reference",
  ".noprint",
  ".mw-empty-elt",
  ".navbox",
  ".vertical-navbox",
  ".hatnote",
  ".dablink",
  "#toc",
  ".toc",
  ".catlinks",
  ".printfooter",
  "table.metadata",
  ".ambox",
  "style",
  "script",
  ".mw-indicators",
].join(", ");

/**
 * Dedicated extraction path for Wikipedia/MediaWiki articles, used instead
 * of Readability.js for such pages: MediaWiki's DOM is non-standard enough
 * (headings sometimes wrap their "[edit]" link as a child, sometimes as a
 * sibling in a `.mw-heading` wrapper div; infobox tables score as "unlikely
 * content" and get dropped by Readability's heuristics) that a purpose-
 * built pass is more reliable than a generic readability algorithm here.
 * Walks `#mw-content-text .mw-parser-output` (the actual rendered article
 * body) directly, so every heading/infobox row/image caption in it is kept
 * - nothing is scored or dropped for "looking unlikely" - after stripping
 * the MediaWiki chrome in WIKI_NOISE_SELECTOR from a clone.
 *
 * Returns `{ root, title }` (title from `#firstHeading`, which - like
 * Readability - lives outside the content root and must be re-added
 * separately by the caller), or null if this doesn't look like a
 * MediaWiki content page.
 */
function extractWikipediaArticle() {
  const contentEl = document.querySelector("#mw-content-text .mw-parser-output") ||
    document.querySelector("#mw-content-text");
  if (!contentEl) return null;

  const clone = contentEl.cloneNode(true);
  clone.querySelectorAll(WIKI_NOISE_SELECTOR).forEach((el) => el.remove());

  const titleEl = document.querySelector("#firstHeading");
  const title = titleEl ? (titleEl.textContent || "").trim() : "";

  return { root: clone, title };
}

/**
 * Dedicated extraction path for Google Docs editors. Readability and the
 * generic heuristics pick up the Google Docs chrome (side panels, menus,
 * comments) instead of the actual document text. Google Docs has moved most
 * of the document content to a canvas-based renderer, so the visible text is
 * no longer reliably present in the live DOM. We therefore try two paths:
 *   1. Live DOM paragraphs (.kix-paragraphtext) if they exist.
 *   2. The DOCS_modelChunk embedded in the page's <script> tags, which still
 *      contains the raw document text.
 */
function extractGoogleDocsArticle() {
  if (!location.hostname.endsWith("docs.google.com")) return null;

  const titleEl =
    document.querySelector("#docs-title-widget .docs-title-input-label-inner") ||
    document.querySelector("input.docs-title-input");
  const title = titleEl ? (titleEl.value || titleEl.textContent || "").trim() : "";
  const titleBlock = title ? [{ tag: "h1", lines: splitIntoLines(title) }] : [];

  const blocks = extractGoogleDocsFromLiveDom();
  if (blocks && blocks.length > 0) {
    return { root: null, title, blocks: titleBlock.concat(blocks) };
  }

  const modelBlocks = extractGoogleDocsFromModelChunk();
  if (modelBlocks && modelBlocks.length > 0) {
    return { root: null, title, blocks: titleBlock.concat(modelBlocks) };
  }

  return null;
}

function extractGoogleDocsFromLiveDom() {
  const editor = document.querySelector("#docs-editor");
  if (!editor) return null;
  const paragraphs = editor.querySelectorAll(".kix-paragraphtext");
  if (paragraphs.length === 0) return null;

  const blocks = [];
  paragraphs.forEach((p) => {
    const text = (p.innerText || p.textContent || "").trim().replace(/\s+/g, " ");
    if (!text) return;
    const lines = splitIntoLines(text);
    if (lines.length > 0) blocks.push({ tag: "p", lines });
  });
  return blocks.length > 0 ? blocks : null;
}

/**
 * Google Docs embeds the document model in a <script> tag as the global
 * DOCS_modelChunk. The text content lives in "s" string fields inside that
 * JSON-like structure. This is a fallback when the live DOM does not expose
 * the document text (canvas rendering).
 */
function extractGoogleDocsFromModelChunk() {
  const scripts = document.querySelectorAll("script");
  let rawText = "";
  scripts.forEach((script) => {
    const text = script.textContent || "";
    if (!text.includes("DOCS_modelChunk = ")) return;
    const matches = text.match(/"s":"(.*?)"/g);
    if (!matches) return;
    for (const match of matches) {
      const extracted = match
        .replace(/^"s":"|"$/g, "")
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
        .replace(/\\u000b/g, "\n\n");
      rawText += extracted + "\n\n";
    }
  });

  if (!rawText.trim()) return null;

  const blocks = [];
  rawText.split(/\n{2,}/).forEach((para) => {
    const text = para.replace(/\s+/g, " ").trim();
    if (!text) return;
    const lines = splitIntoLines(text);
    if (lines.length > 0) blocks.push({ tag: "p", lines });
  });
  return blocks.length > 0 ? blocks : null;
}

// Below this length, a selection is treated as accidental (e.g. a leftover
// double-click on a single word from earlier browsing/inspecting) rather
// than a deliberate "translate this" gesture, and is ignored in favor of
// full auto-extraction - a single stray word would otherwise silently take
// over the whole "auto" scope and hide the entire page's content.
const MIN_SELECTION_LENGTH = 15;

/**
 * Returns a DocumentFragment containing a clone of the user's current text
 * selection (first range only - multi-range selections are a rare Firefox-
 * only feature), or null if there is no meaningfully-sized non-empty
 * selection (see MIN_SELECTION_LENGTH). Cloning keeps the original page
 * untouched.
 */
function getSelectionFragment() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  if (selection.toString().trim().length < MIN_SELECTION_LENGTH) return null;
  return selection.getRangeAt(0).cloneContents();
}

/**
 * Runs Mozilla's Readability.js (bundled in `vendor/`, loaded as a plain
 * script right before this one - see the `files` array passed to
 * `scripting.executeScript()` in sidebar.js) on a *clone* of the document,
 * since `parse()` mutates whatever document it's given. `isProbablyReaderable`
 * is checked first so we don't waste time running the full parser on pages
 * it knows aren't article-like (SPA dashboards, landing pages, etc).
 *
 * Returns `{ root, title }` where `root` is the parsed article's cleaned
 * HTML re-parsed into a detached `<body>` (never inserted into the live
 * page - only walked by `extractBlocksFromRoot()` to pull out text) and
 * `title` is the article's title (Readability strips the page's `<h1>`
 * into `article.title` rather than leaving it in `article.content`, so
 * callers need to re-add it separately). Returns null if Readability isn't
 * available, doesn't think the page is readerable, or fails.
 */
function extractReadabilityArticle() {
  if (typeof Readability !== "function" || typeof isProbablyReaderable !== "function") {
    return null;
  }

  try {
    if (!isProbablyReaderable(document)) return null;

    const docClone = document.cloneNode(true);
    // keepClasses: Readability strips every class attribute from its output
    // by default, which would silently break NOISE_SELECTOR's class-based
    // matches (e.g. ".mw-editsection") against the parsed result.
    const article = new Readability(docClone, { keepClasses: true }).parse();
    if (!article || !article.content) return null;

    const root = new DOMParser().parseFromString(article.content, "text/html").body;
    return { root, title: (article.title || "").trim() };
  } catch (error) {
    console.warn("Readability extraction failed, falling back to heuristics:", error);
    return null;
  }
}

/**
 * Extracts blocks from an already-picked root (Readability's or the
 * Wikipedia extractor's) and prepends the article's title as an `h1` block,
 * unless the root already starts with an equivalent heading. Both callers
 * source their title from an element outside the content root itself
 * (Readability's `article.title`, MediaWiki's `#firstHeading`), so neither
 * naturally ends up inside `blocks` without this.
 */
function extractBlocksWithTitle(root, title) {
  const blocks = extractBlocksFromRoot(root);
  if (blocks.length === 0) return blocks;

  const titleLines = title ? splitIntoLines(title) : [];
  const alreadyHasTitle =
    blocks[0].tag === "h1" && blocks[0].lines.join(" ") === titleLines.join(" ");
  if (titleLines.length > 0 && !alreadyHasTitle) {
    blocks.unshift({ tag: "h1", lines: titleLines });
  }
  return blocks;
}

/**
 * Extracts structured blocks according to the requested scope:
 * - "full": every block on the page, including header/nav/footer/sidebars.
 * - "auto": the user's current selection if there is one; otherwise, on a
 *   Wikipedia/MediaWiki page, the dedicated extractor (see
 *   extractWikipediaArticle() for why Readability isn't used there);
 *   otherwise Readability's cleaned main content; falling back to the
 *   hand-rolled heuristic (`findContentRoot()`) if none of the above is
 *   usable on this page or returns no extractable blocks.
 */
function extractBlocks(scope) {
  if (scope === "full") {
    return extractBlocksFromRoot(document.body);
  }

  const selectionFragment = getSelectionFragment();
  if (selectionFragment) {
    return extractBlocksFromRoot(selectionFragment);
  }

  const googleDocsArticle = extractGoogleDocsArticle();
  if (googleDocsArticle && googleDocsArticle.blocks.length > 0) {
    return googleDocsArticle.blocks;
  }

  const wikiArticle = extractWikipediaArticle();
  if (wikiArticle) {
    const blocks = extractBlocksWithTitle(wikiArticle.root, wikiArticle.title);
    if (blocks.length > 0) return blocks;
  }

  const article = extractReadabilityArticle();
  if (article) {
    const blocks = extractBlocksWithTitle(article.root, article.title);
    if (blocks.length > 0) return blocks;
  }

  return extractBlocksFromRoot(findContentRoot());
}