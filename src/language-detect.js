// Lightweight, dependency-free language detection based on character
// scripts and short lists of very common words. Good enough to tell apart
// the 9 languages this extension currently supports (see languages.js):
// English, Spanish, Italian, French, German, Russian, Korean, Japanese,
// Chinese.

const HANGUL_RE = /[\uac00-\ud7a3]/;
const CYRILLIC_RE = /[\u0400-\u04ff]/;
const KANA_RE = /[\u3040-\u30ff]/; // Hiragana + Katakana -> unambiguously Japanese
const HAN_RE = /[\u4e00-\u9fff]/; // CJK Unified Ideographs - Japanese also uses these
// (via kanji), so this is only checked *after* KANA_RE to land on Chinese.

// Common short words per Latin-script language, used to score plain text
// once none of the script-based checks above matched.
const WORD_LISTS = {
  es: new Set([
    "el", "la", "los", "las", "de", "que", "y", "en", "un", "una",
    "es", "por", "con", "para", "su", "se", "no", "más", "pero",
  ]),
  en: new Set([
    "the", "of", "and", "a", "to", "in", "is", "that", "for", "on",
    "with", "as", "was", "are", "this", "it",
  ]),
  it: new Set([
    "il", "la", "di", "che", "e", "un", "una", "per", "con", "non",
    "è", "gli", "questo", "sono", "del", "della", "sul", "come",
  ]),
  fr: new Set([
    "le", "la", "de", "et", "un", "une", "les", "des", "que", "est",
    "pour", "dans", "ce", "qui", "avec", "vous", "sur", "pas",
  ]),
  de: new Set([
    "der", "die", "das", "und", "ist", "ein", "eine", "nicht", "mit",
    "für", "auf", "den", "von", "sich", "wir", "sind", "aber",
  ]),
};

/**
 * Detects which of the supported languages a sample of text is written in.
 * @param {string} sample A short excerpt of the extracted page text.
 * @returns {"en"|"es"|"it"|"fr"|"de"|"ru"|"ko"|"ja"|"zh"} Best-guess language code.
 */
export function detectLanguage(sample) {
  const text = (sample || "").trim();
  if (!text) return "en";

  if (HANGUL_RE.test(text)) return "ko";
  if (CYRILLIC_RE.test(text)) return "ru";
  if (KANA_RE.test(text)) return "ja";
  if (HAN_RE.test(text)) return "zh";

  const words = text.toLowerCase().match(/[a-zàâçéèêëîïôûùüÿœæñáíóúäöß]+/g) || [];
  const scores = { es: 0, en: 0, it: 0, fr: 0, de: 0 };
  for (const word of words) {
    for (const lang of Object.keys(WORD_LISTS)) {
      if (WORD_LISTS[lang].has(word)) scores[lang]++;
    }
  }

  let best = "en";
  for (const lang of Object.keys(scores)) {
    if (scores[lang] > scores[best]) best = lang;
  }
  return best;
}
