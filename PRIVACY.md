# Privacy Policy for Browser Translations

**Last updated:** 2026-09-26

## Summary

Browser Translations is a browser extension that shows the main text of the current web page next to a line-by-line translation. The extension itself does not collect, store, or share any personal information on its own servers. However, because the core feature is translation, the text you choose to translate is sent to a third-party translation service you select.

## Information the extension accesses

### Web page content

When you click **Translate**, the extension extracts the readable text of the active tab (the same article-style content you see when using Firefox Reader View) and sends it to the selected translation engine. Nothing is sent automatically or in the background — translation only happens when you explicitly press the button.

### Settings and preferences

The following are stored locally in your browser's extension storage and never transmitted anywhere:

- Source/target language preferences
- UI language and theme choice
- Selected translation engine
- Per-engine settings (API key, model name, base URL, local cap)
- Simple in-memory translation history inside the sidebar (not persisted across sidebar closes)

## Third-party translation services

The extension can use several translation backends. Depending on which engine you choose, your selected page text and the surrounding translation prompt are sent to one of these providers:

### Default: MyMemory

- **Provider:** Translated.net MyMemory API (`api.mymemory.translated.net`)
- **Data sent:** Individual lines of text to be translated
- **Authentication:** None required; requests are anonymous and rate-limited by IP
- **Terms/privacy:** https://mymemory.translated.net/doc/spec.php

### Optional cloud LLM providers (bring-your-own API key)

These providers are only used if you explicitly select them and enter your own API key in the engine settings panel. The extension itself does **not** collect payments and has no paid subscription — you are responsible for any charges from the provider according to their own pricing.

| Engine | Endpoint | What is sent |
|--------|----------|--------------|
| OpenAI | `https://api.openai.com/v1/chat/completions` | Lines to translate plus a system prompt asking for a direct translation |
| Anthropic | `https://api.anthropic.com/v1/messages` | Same as above |
| Mistral | `https://api.mistral.ai/v1/chat/completions` | Same as above |
| Groq | `https://api.groq.com/openai/v1/chat/completions` | Same as above |

Your API key is stored only in your browser's local extension storage and is sent only to the selected provider's API endpoint in the `Authorization` or `x-api-key` header.

### Optional local/self-hosted providers

These run on hardware or servers you control. No text leaves your machine unless you point the extension at a server you operate.

- **Ollama** — default `http://localhost:11434`
- **LibreTranslate** — default `http://localhost:5001`

## Data the extension does **not** collect

- No analytics, telemetry, crash reporting, or tracking
- No browsing history, bookmarks, passwords, or cookies
- No data is sold, shared, or stored by the extension author

## Permissions explained

- **`<all_urls>` / `activeTab` / `tabs`:** Required to read the active page's content when you press Translate and to open the sidebar/side panel.
- **`storage`:** Saves your language, engine, theme, and API-key preferences locally.
- **`scripting`:** Injects a small content script to extract the page's main text.

## Changes to this policy

If the extension ever starts handling data differently, this file will be updated and the change will be noted in the release notes.

## Contact

For questions about this privacy policy, open an issue in the repository or contact the maintainer through the support channel listed on the add-on page.
