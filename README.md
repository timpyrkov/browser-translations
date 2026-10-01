<h1><p align="left">
  <img src="https://github.com/timpyrkov/browser-translations/blob/master/src/icons/icon-128.png?raw=true" alt="Browser Translations logo" height="25" style="vertical-align: middle; margin-right: 10px;">
  <span style="font-size:2.5em; vertical-align: middle;"><b>Browser Translations</b></span>
</p></h1>

A simple sidebar for parallel reading: it shows the main text of the current page (news, Wikipedia, blogs, etc.) next to its machine translation, sentence by sentence, so you can compare the original and translated wording line-by-line. Built as a hobby project to help learn **Spanish**, **Russian**, and **Korean**.

Translation defaults to the free [MyMemory](https://mymemory.translated.net) API (no signup required, ~500 words/day per IP — LibreTranslate's public endpoint now requires a paid API key, so it's no longer used). For better quality and no daily word cap, pick **Lingva** (free hosted Google Translate proxy, no key), **OpenAI**, **Gemini**, **Anthropic**, **Mistral**, **Groq**, **DeepSeek**, **Kimi**, or local **Ollama** / **LibreTranslate** from the engine dropdown in the sidebar toolbar and set your API key/URL — see [Optional: LLM-based translation](#optional-llm-based-translation) below.

## 🚀 Quick Start

### Build

```bash
npm run build:firefox    # -> dist/firefox/ (sidebar only)
npm run build:chrome     # -> dist/chrome/  (toolbar popup + side panel)
npm run build:opera      # -> dist/opera/   (toolbar popup + sidebar)
```

### Firefox

```
about:debugging#/runtime/this-firefox
```
Then click **Load Temporary Add-on…** and select `dist/firefox/manifest.json`

### Chrome

```
chrome://extensions/
```
Then click **Load unpacked** and select the `dist/chrome/` folder

---

## ✨ Features

- Sidebar showing each sentence's original text directly above its translation
- Supports 9 languages: English, Spanish, Italian, French, German, Russian, Korean, Japanese, Chinese — automatic source-language detection, or pick languages manually from the sidebar toolbar
- Interface (UI chrome) language selector, fully translated into all 9 languages (separate from the page-translation languages) — defaults to your browser's language if supported, else English
- Dark/light theme toggle (defaults to dark)
- Works on articles, Wikipedia pages, and most content-heavy sites
- Firefox (primary) and Chrome/Opera support via a shared `src/` codebase and per-browser manifests + `targets/` overlays
- Dual mode on Chrome-family builds: clicking the toolbar icon opens a fixed-size **popup** (works on Yandex Browser, which installs from the Chrome/Opera stores but has no sidebar surface), while Chrome's side panel and Opera's sidebar remain available — the popup has an "open in sidebar" ↗ button that appears only where a sidebar API exists

## Installation

Both browsers load the **built** extension (`src/` combined with the right manifest), not `src/` or `manifests/` directly. Build first:

```
npm run build:firefox   # -> dist/firefox
npm run build:chrome    # -> dist/chrome
npm run build:opera     # -> dist/opera
npm run build           # all three
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
- **Gemini** — needs an API key from [Google AI Studio](https://aistudio.google.com/) (free tier available). Defaults to `gemini-3.8-flash`.
- **Anthropic** — needs an API key from [console.anthropic.com](https://console.anthropic.com/). Defaults to `claude-sonnet-5`.
- **Mistral** — needs an API key from [console.mistral.ai](https://console.mistral.ai/). Defaults to `mistral-small-latest`.
- **Groq** — needs an API key from [console.groq.com](https://console.groq.com/). Defaults to `llama-3.3-70b-versatile`.
- **DeepSeek** — needs an API key from [platform.deepseek.com](https://platform.deepseek.com/). Defaults to `deepseek-v4-flash`.
- **Kimi** — needs an API key from [platform.kimi.ai](https://platform.kimi.ai/). Defaults to `kimi-k2.6`.
- **Lingva** — free hosted [Lingva](https://github.com/thedaviddelta/lingva-translate) instance (a privacy-friendly Google Translate proxy), no API key. Defaults to `https://lingva.ml`; the instance URL is configurable in engine settings since community instances come and go. The UI shows alternative instances if the default is unavailable.
- **Ollama** — fully local and free, no API key. Run Ollama and enter its URL (default `http://localhost:11434`) and the model name you've pulled (defaults to `mistral`).
- **LibreTranslate** — fully local and free like Ollama, but a dedicated translation server (not an LLM) with no daily word cap. Run it via Docker: `docker run -it -p 5001:5000 -v libretranslate_models:/home/libretranslate/.local/share libretranslate/libretranslate` (first run downloads language models, can take a while). Enter the server URL in engine settings (default `http://localhost:5001`); no API key needed for a default local instance.

Both Ollama and LibreTranslate also show a **"Local translation cap (characters)"** field (default 2500, independent per engine) — since both run on hardware you control rather than a cloud vendor's, pages longer than this are hard-truncated by whole sentences *before* anything is shown, with a note in the sidebar suggesting a cloud engine for the rest, so an oversized page can't tie up your machine for too long. Lower it further on modest hardware, or raise it if your setup handles longer pages comfortably.

**Important** (Ollama only): by default Ollama only accepts requests with no `Origin` header or one it recognizes as localhost — it does **not** allow browser extension origins (`moz-extension://…`/`chrome-extension://…`) and will return `403 Forbidden` for them, which looks like a generic translation failure. Fix by setting `OLLAMA_ORIGINS` before starting Ollama:
  ```
  OLLAMA_ORIGINS="moz-extension://*,chrome-extension://*" ollama serve
  ```
  If Ollama auto-starts via a LaunchAgent (macOS, e.g. `~/Library/LaunchAgents/com.ollama.serve.plist` for a Homebrew install), add an `EnvironmentVariables` dict with that key to the plist, then `launchctl unload`/`launchctl load` it (or `brew services restart ollama` if managed by Homebrew services) so it persists across restarts.

The **Model** field is optional for OpenAI/Gemini/Anthropic/Mistral/Groq/DeepSeek/Kimi — leave it blank to use the default shown next to the field. The API key is stored only in this browser's local extension storage and is sent only to the selected provider's own API endpoint; the extension validates each request against a hardcoded list of allowed endpoints so the key cannot be sent to an unexpected URL. Engine selection is entirely manual — there is no automatic failover, so if your chosen provider fails for any reason (bad/missing key, network issue, rate limit) its real error is shown directly and you can switch engines yourself. After a successful LLM translation, the panel also shows a rough token-usage note for that request.

**API key safety:** use a dedicated key for this extension, set a low usage/spending limit on the provider side, and revoke the key if you notice anything suspicious. The extension itself does not collect payments or subscriptions; any charges come directly from the provider whose key you enter.

## Local translation with Ollama or LibreTranslate

If you do **not** want page text to leave your computer, run a local engine and select it from the engine dropdown. Note that document and email services (such as Gmail, Google Docs, Microsoft Office Online, Outlook, Notion, etc.) are blocked entirely by the sensitive-sites guardrail — no engine, online or local, is allowed on those pages.

### Ollama

1. Install **Ollama** from [ollama.com](https://ollama.com).
2. Pull a model (the extension defaults to `mistral`):
   ```bash
   ollama pull mistral
   ```
3. Start the Ollama server with browser-extension origins allowed:
   ```bash
   OLLAMA_ORIGINS="moz-extension://*,chrome-extension://*" ollama serve
   ```
   On macOS with the Ollama app, set the environment variable and restart the app:
   ```bash
   launchctl setenv OLLAMA_ORIGINS "moz-extension://*,chrome-extension://*"
   ```
   then quit and reopen Ollama.
4. In the extension, select **Ollama (local)**. The default server URL is `http://localhost:11434` and the default model is `mistral`.

### LibreTranslate

1. Install **Docker Desktop** (or another Docker runtime).
2. Run the LibreTranslate container:
   ```bash
   docker run --rm -d -p 5001:5000 --name libretranslate libretranslate/libretranslate
   ```
   The first launch downloads the language models, which can take a few minutes.
3. In the extension, select **LibreTranslate (local)**. The default server URL is `http://localhost:5001`.

Both engines keep all text on your own machine and have no daily word cap.

## Privacy and data handling

The extension itself does not collect, store, or share any personal data. When you click **Translate**, the readable text of the active page is sent to the translation engine you selected:

- **MyMemory** — anonymous, free, rate-limited by IP.
- **Lingva** — free hosted instance (default `lingva.ml`, configurable), no key.
- **OpenAI, Anthropic, Mistral, Groq, DeepSeek, Kimi, Gemini** — sent only when you provide your own API key; you are responsible for any charges from that provider.
- **Ollama / LibreTranslate** — local/self-hosted by you; text does not leave your machine unless you configure a remote server.

See [PRIVACY.md](PRIVACY.md) for the full policy.

## Troubleshooting

- **"Hubo un error durante la instalación del complemento temporal" / install error in `about:debugging`**: you likely selected `manifests/firefox.json` or the bare `src/` folder directly. Those manifests reference files by path relative to `src/` (icons, `background.js`, etc.) and only resolve correctly after `npm run build:firefox`/`build:chrome` — always load from `dist/firefox/manifest.json` or `dist/chrome/`.
- **"Translation failed: Missing host permission for the tab" on a `file://` page**: Firefox (and Chrome) don't extend `<all_urls>` host permissions to local `file://` pages by default, even though it's declared in the manifest — local file access is a separate, always-opt-in permission that **cannot be granted by the manifest or extension code**, only by the user, by design. Enable it for Browser Translations: in Firefox go to `about:addons` → Browser Translations → **Permissions and data** tab → toggle **"Access local files on your computer"** (older Firefox versions may label this **"Allow access to file URLs"**); in Chrome go to `chrome://extensions` → Browser Translations → Details → toggle **"Allow access to file URLs"**. Then reload the test page. This should never happen on regular `http(s)://` pages, since `<all_urls>` already covers those — testing via a local HTTP server instead of `file://` avoids the issue entirely.
- If the sidebar doesn't open, check the browser console for errors.
- Remember Firefox temporary add-ons disappear on restart — reload from `about:debugging` each session. If the sidebar shows a stale/invalid-context error right after reloading the extension, close the sidebar and reopen it.

## Development Notes

- The extension uses the free [MyMemory](https://mymemory.translated.net) API for translations by default, with optional Lingva/OpenAI/Anthropic/Mistral/Groq/DeepSeek/Kimi/Gemini/Ollama/LibreTranslate providers (`src/translator.js`)
- Main-content extraction uses Mozilla's [Readability.js](https://github.com/mozilla/readability) (the same library behind Firefox's Reader View, Apache-2.0 licensed, vendored in `src/vendor/`) run on a cloned/detached document, falling back to a hand-rolled heuristic (`findContentRoot()` in `src/content.js`) if Readability doesn't consider the page readerable. Wikipedia/MediaWiki pages use a dedicated extractor instead (`extractWikipediaArticle()`), since Readability drops infobox tables and mishandles MediaWiki's edit-section markup. The vendored file has a minimal patch that replaces two internal `innerHTML` assignments with a `DOMParser` helper so AMO's `addons-linter` reports zero warnings.
- There is no separate Options/Settings page — language, engine, API key, and theme choices all live in the sidebar toolbar and are stored in browser storage
- The sidebar shows each original sentence directly above its translation (no scroll sync needed, since it's a single column)
- `npm run build:firefox` / `npm run build:chrome` package the `src/` folder with the matching manifest into `dist/`

---

## 📋 TODO

- **Publish to AMO (addons.mozilla.org)** so Firefox installs it permanently
  instead of disappearing on every restart as a temporary add-on. See
  [`amo_guide.md`](amo_guide.md) (not synced to git) for the step-by-step
  submission guide. Listed public distribution is the goal; unlisted
  ("On your own") self-distribution is also possible if preferred:

  ```bash
  cd dist/firefox && web-ext sign --channel=listed --api-key=KEY --api-secret=SECRET
  ```

  The stable extension ID (`browser_specific_settings.gecko.id`) is already in
  place, which is a prerequisite. Optionally add an `update_url` afterwards for
  automatic updates instead of reinstalling by hand.
- **Publish to the Chrome Web Store**, the Chrome analogue. Unlisted/private
  distribution is available there too (one-time developer registration fee).
  Loading `dist/chrome/` unpacked already persists across restarts, so this is
  only needed for real distribution or to drop the developer-mode nag. Pin the
  extension ID with a `"key"` manifest field if it should stay constant.
- **Label manager** — one place to rename a label everywhere, merge two labels,
  recolour, or delete one globally.
- **More site rules** as they prove necessary — Twitch, Bluesky, Spotify, Amazon.
- **Track focused time** alongside open time, to tell "open 3 weeks, never read"
  from "read daily".

---

## 📝 License

MIT
