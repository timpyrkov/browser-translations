// API compatibility
const brw = typeof browser !== "undefined" ? browser : chrome;

import { translateText } from "./translator.js";

const originalEl = document.getElementById("original");
const translatedEl = document.getElementById("translated");

function showLoading() {
  originalEl.innerHTML = `<h2 class='gradient-text'>Original</h2><p class="loading-text">Loading...</p>`;
  translatedEl.innerHTML = `<h2 class='gradient-text-accent'>Translation</h2><p class="loading-text">Translating...</p>`;
}

function showError(message) {
  originalEl.innerHTML = `<h2 class='gradient-text'>Original</h2><p class="error-text">${message}</p>`;
  translatedEl.innerHTML = `<h2 class='gradient-text-accent'>Translation</h2><p class="error-text">Error occurred</p>`;
}

brw.runtime.onMessage.addListener(async (message) => {
  if (message.command === "deliver-main-text") {
    try {
      showLoading();

      const originalText = message.payload;
      const originalLines = originalText.split("\n").filter((l) => l.trim().length > 0);

      if (originalLines.length === 0) {
        showError("No readable text found on this page.");
        return;
      }

      // Get user settings
      const settings = await brw.storage.local.get([
        "engToSpa", 
        "spaToEng", 
        "translationMode"
      ]);

      const sample = originalLines.slice(0, 5).join(" ");
      const asciiRatio = (sample.match(/[a-zA-Z]/g) || []).length / sample.length;
      const sourceLang = asciiRatio > 0.6 ? "en" : "es";
      
      // Determine target language based on settings
      let targetLang;
      if (sourceLang === "en" && settings.engToSpa !== false) {
        targetLang = "es";
      } else if (sourceLang === "es" && settings.spaToEng !== false) {
        targetLang = "en";
      } else {
        // Default fallback
        targetLang = sourceLang === "en" ? "es" : "en";
      }

      console.log(`Translating from ${sourceLang} to ${targetLang}`);

      // Translate the entire text at once (more efficient)
      const translatedText = await translateText(originalText, sourceLang, targetLang);
      const translatedLines = translatedText.split("\n").filter((l) => l.trim().length > 0);

      renderParallelText(originalLines, translatedLines);
    } catch (error) {
      console.error("Translation error in sidebar:", error);
      showError("Translation failed. Please try again.");
    }
  }
});

function renderParallelText(source, target) {
  originalEl.innerHTML = `<h2 class='gradient-text'>Original</h2>`;
  translatedEl.innerHTML = `<h2 class='gradient-text-accent'>Translation</h2>`;

  const maxLines = Math.max(source.length, target.length);

  for (let i = 0; i < maxLines; i++) {
    const originalLine = source[i] || "";
    const translatedLine = target[i] || "";

    const originalLineEl = document.createElement("div");
    originalLineEl.className = "line";
    originalLineEl.textContent = originalLine;
    originalEl.appendChild(originalLineEl);

    const translatedLineEl = document.createElement("div");
    translatedLineEl.className = "line";
    translatedLineEl.textContent = translatedLine;
    translatedEl.appendChild(translatedLineEl);
  }

  enableScrollSync();
}

function enableScrollSync() {
  let isSyncingLeft = false;
  let isSyncingRight = false;

  originalEl.addEventListener("scroll", () => {
    if (!isSyncingRight) {
      isSyncingLeft = true;
      translatedEl.scrollTop = originalEl.scrollTop;
    }
    isSyncingRight = false;
  }, { passive: true });

  translatedEl.addEventListener("scroll", () => {
    if (!isSyncingLeft) {
      isSyncingRight = true;
      originalEl.scrollTop = translatedEl.scrollTop;
    }
    isSyncingLeft = false;
  }, { passive: true });
}