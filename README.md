<h1><p align="left">
  <img src="https://github.com/timpyrkov/browser-translations/blob/master/src/icons/icon-128.png?raw=true" alt="Browser Translations logo" height="25" style="vertical-align: middle; margin-right: 10px;">
  <span style="font-size:2.5em; vertical-align: middle;"><b>Browser Translations</b></span>
</p></h1>

### Learn languages by reading web pages side-by-side, original and translated (Firefox/Chrome extension)

A simple sidebar that shows the main text of the current page (news, Wikipedia, blogs, etc.) next to its machine translation, so you can compare sentence structure line-by-line while you read. Built as a hobby project to help learn **Spanish**, **Russian**, and **Korean**.

Translation defaults to the free [MyMemory](https://mymemory.translated.net) API (no signup required, ~500 words/day per IP — LibreTranslate's public endpoint now requires a paid API key, so it's no longer used). For better quality and no daily word cap, pick **OpenAI**, **Anthropic Claude**, **Mistral**, or local **Ollama** from the engine dropdown in the sidebar toolbar and set your API key/URL — see [Optional: LLM-based translation](#optional-llm-based-translation) below.

## Features

- Sidebar showing each sentence's original text directly above its translation
- Supports 9 languages: English, Spanish, Italian, French, German, Russian, Korean, Japanese, Chinese — automatic source-language detection, or pick languages manually from the sidebar toolbar
- Interface (UI chrome) language selector, fully translated into all 9 languages (separate from the page-translation languages) — defaults to your browser's language if supported, else English
- Dark/light theme toggle (defaults to dark)
- Works on articles, Wikipedia pages, and most content-heavy sites
- Firefox (primary) and Chrome (secondary) support via a shared `src/` codebase and per-browser manifests

## Installation

Both browsers load the **built** extension (`src/` combined with the right manifest), not `src/` or `manifests/` directly. Build first:

```
npm run build:firefox   # -> dist/firefox
npm run build:chrome    # -> dist/chrome
npm run build           # both
```

### Firefox

1. Run `npm run build:firefox`
2. Open Firefox and navigate to `about:debugging`
3. Click "This Firefox" in the left sidebar
4. Click "Load Temporary Add-on"
5. Select `dist/firefox/manifest.json`
6. The extension should now appear in your add-ons list

> **Temporary add-ons do not survive a browser restart** — Firefox unloads them on quit and you'll need to repeat step 4-5 each session. For a longer-lived unsigned install, use Firefox Developer Edition/Nightly with `xpinstall.signatures.required` set to `false` in `about:config`, or package a signed `.xpi` via [addons.mozilla.org](https://addons.mozilla.org) for real use.

### Chrome

1. Run `npm run build:chrome`
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked"
5. Select the `dist/chrome` folder
6. The extension should now appear in your extensions list

> Unlike Firefox's temporary add-ons, unpacked Chrome extensions loaded this way *do* persist across restarts, as long as the `dist/chrome` folder isn't deleted.

## Testing the Extension

1. Open the test page (`test.html`) in your browser — **serving it over `http://` (e.g. `python3 -m http.server` from the repo root, then visit `http://localhost:8000/test.html`) is recommended over opening it as a `file://` URL**, since Firefox restricts extension access to local files by default (see Troubleshooting below)
2. Click the extension icon in your browser toolbar — this opens the sidebar directly (there's no popup)
3. Pick your From/To languages if needed, then click "Translate"
4. The sidebar should show parallel translations

## Optional: LLM-based translation

By default, translation uses the free MyMemory API — no setup needed, but limited to ~500 words/day per IP. To use a higher-quality/higher-quota provider instead, pick one from the **engine dropdown** in the sidebar toolbar (next to the language selectors), then click the **gear icon** beside it to open the engine settings panel:

- **OpenAI** — needs an API key from [platform.openai.com](https://platform.openai.com/api-keys). Defaults to `gpt-5.6-terra`.
- **Anthropic Claude** — needs an API key from [console.anthropic.com](https://console.anthropic.com/). Defaults to `claude-sonnet-5`.
- **Mistral** — needs an API key from [console.mistral.ai](https://console.mistral.ai/). Defaults to `mistral-small-latest`.
- **Ollama** — fully local and free, no API key. Run Ollama and enter its URL (default `http://localhost:11434`) and the model name you've pulled (defaults to `mistral`).
- **LibreTranslate** — fully local and free like Ollama, but a dedicated translation server (not an LLM) with no daily word cap. Run it via Docker: `docker run -it -p 5001:5000 -v libretranslate_models:/home/libretranslate/.local/share libretranslate/libretranslate` (first run downloads language models, can take a while). Enter the server URL in engine settings (default `http://localhost:5001`); no API key needed for a default local instance.

Both Ollama and LibreTranslate also show a **"Local translation cap (characters)"** field (default 2500, independent per engine) — since both run on hardware you control rather than a cloud vendor's, pages longer than this are hard-truncated by whole sentences *before* anything is shown, with a note in the sidebar suggesting a cloud engine for the rest, so an oversized page can't tie up your machine for too long. Lower it further on modest hardware, or raise it if your setup handles longer pages comfortably.

**Important** (Ollama only): by default Ollama only accepts requests with no `Origin` header or one it recognizes as localhost — it does **not** allow browser extension origins (`moz-extension://…`/`chrome-extension://…`) and will return `403 Forbidden` for them, which looks like a generic translation failure. Fix by setting `OLLAMA_ORIGINS` before starting Ollama:
  ```
  OLLAMA_ORIGINS="moz-extension://*,chrome-extension://*" ollama serve
  ```
  If Ollama auto-starts via a LaunchAgent (macOS, e.g. `~/Library/LaunchAgents/com.ollama.serve.plist` for a Homebrew install), add an `EnvironmentVariables` dict with that key to the plist, then `launchctl unload`/`launchctl load` it (or `brew services restart ollama` if managed by Homebrew services) so it persists across restarts.

The **Model** field is optional for OpenAI/Anthropic/Mistral — leave it blank to use the default shown next to the field. The API key is stored only in this browser's local extension storage and is sent only to the selected provider's own API. If a request to your chosen provider fails for any reason (bad/missing key, network issue, rate limit), translation automatically falls back to MyMemory so the extension keeps working. After a successful LLM translation, the panel also shows a rough token-usage note for that request.

## Troubleshooting

- **"Hubo un error durante la instalación del complemento temporal" / install error in `about:debugging`**: you likely selected `manifests/firefox.json` or the bare `src/` folder directly. Those manifests reference files by path relative to `src/` (icons, `background.js`, etc.) and only resolve correctly after `npm run build:firefox`/`build:chrome` — always load from `dist/firefox/manifest.json` or `dist/chrome/`.
- **"Translation failed: Missing host permission for the tab" on a `file://` page**: Firefox (and Chrome) don't extend `<all_urls>` host permissions to local `file://` pages by default, even though it's declared in the manifest — local file access is a separate, always-opt-in permission that **cannot be granted by the manifest or extension code**, only by the user, by design. Enable it for Browser Translations: in Firefox go to `about:addons` → Browser Translations → **Permissions and data** tab → toggle **"Access local files on your computer"** (older Firefox versions may label this **"Allow access to file URLs"**); in Chrome go to `chrome://extensions` → Browser Translations → Details → toggle **"Allow access to file URLs"**. Then reload the test page. This should never happen on regular `http(s)://` pages, since `<all_urls>` already covers those — testing via a local HTTP server instead of `file://` avoids the issue entirely.
- If the sidebar doesn't open, check the browser console for errors.
- Remember Firefox temporary add-ons disappear on restart — reload from `about:debugging` each session. If the sidebar shows a stale/invalid-context error right after reloading the extension, close the sidebar and reopen it.

## Development Notes

- The extension uses the free [MyMemory](https://mymemory.translated.net) API for translations by default, with optional OpenAI/Anthropic/Mistral/Ollama providers (`src/translator.js`)
- Main-content extraction uses Mozilla's [Readability.js](https://github.com/mozilla/readability) (the same library behind Firefox's Reader View, Apache-2.0 licensed, vendored unmodified in `src/vendor/`) run on a cloned/detached document, falling back to a hand-rolled heuristic (`findContentRoot()` in `src/content.js`) if Readability doesn't consider the page readerable. Wikipedia/MediaWiki pages use a dedicated extractor instead (`extractWikipediaArticle()`), since Readability drops infobox tables and mishandles MediaWiki's edit-section markup
- There is no separate Options/Settings page — language, engine, API key, and theme choices all live in the sidebar toolbar and are stored in browser storage
- The sidebar shows each original sentence directly above its translation (no scroll sync needed, since it's a single column)
- `npm run build:firefox` / `npm run build:chrome` package the `src/` folder with the matching manifest into `dist/`

## TODO

- After testing the extension for a while, prepare it for **registering (without publishing)** with each browser's developer program, so it survives restarts without reloading from `about:debugging`/`chrome://extensions` each session (e.g. a self-signed/unlisted Firefox `.xpi` via addons.mozilla.org, and Chrome's unpacked-load persistence already covers that side).
