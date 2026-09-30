# Privacy Policy for Browser Translations

**Last updated:** 2026-09-26

## Summary

Browser Translations is a browser extension that shows the main text of the current web page next to a line-by-line translation. The extension itself does not collect, store, or share any personal information on its own servers. However, because the core feature is translation, the text you choose to translate is sent to the third-party translation engine you select.

**If you do not want any page text to leave your computer**, you can run a local engine instead: install and start **Ollama** with a local model, or run a **LibreTranslate** server, then choose either engine from the dropdown menu. When a local engine is selected, no text is sent to any external service.

## Privacy-first design

To make it obvious where your text is going, the extension shows two explicit privacy notices:

1. **Before translating:** the header of the sidebar/popup displays a notice that the text will be sent to the selected third-party engine, and reminds you that you can translate locally by setting up Ollama or LibreTranslate.
2. **After translating:** a short footer line at the end of the result confirms which engine handled the text (for example, `[Translated with MyMemory online, free]` or `[Translated with Ollama local model mistral]`), so you can verify at a glance whether your text left your device.

## Sensitive sites guardrail

To reduce the chance of leaking private documents or email, the extension checks the active tab's domain before translating. If the tab is on a known document/email service (for example Gmail, Google Docs, Microsoft Office Online, Outlook, Notion, Evernote, Dropbox Paper, Zoho Docs or iCloud Pages), the extension **blocks all translation** — no engine, online or local, is allowed on those pages.

When this happens, it shows a message explaining that Browser Translations does not translate pages on document or email services because they may contain sensitive information.

This is a safety net, not a guarantee: you remain responsible for the pages you translate.

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

### Optional: Lingva (free, no key)

- **Provider:** a community-hosted [Lingva](https://github.com/thedaviddelta/lingva-translate) instance (a Google Translate proxy); default `https://lingva.ml`, configurable in engine settings.
- **Data sent:** Individual lines of text to be translated.
- **Authentication:** None.

### Optional cloud LLM providers (bring-your-own API key)

These providers are only used if you explicitly select them and enter your own API key in the engine settings panel. The extension itself does **not** collect payments and has no paid subscription — you are responsible for any charges from the provider according to their own pricing.

| Engine | Endpoint | What is sent |
|--------|----------|--------------|
| OpenAI | `https://api.openai.com/v1/chat/completions` | Lines to translate plus a system prompt asking for a direct translation |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` | Same as above |
| Anthropic | `https://api.anthropic.com/v1/messages` | Same as above |
| Mistral | `https://api.mistral.ai/v1/chat/completions` | Same as above |
| Groq | `https://api.groq.com/openai/v1/chat/completions` | Same as above |
| DeepSeek | `https://api.deepseek.com/v1/chat/completions` | Same as above |
| Kimi (Moonshot AI) | `https://api.moonshot.ai/v1/chat/completions` | Same as above |

Your API key is stored only in your browser's local extension storage and is sent only to the selected provider's API endpoint in the `Authorization` or `x-api-key` header. It is never sent to the extension author or any other server. In addition, the extension validates each request against a hardcoded list of allowed endpoints so an API key cannot be accidentally sent to an unexpected URL.

### API key safety

Other browser extensions cannot directly access another extension's storage. However, malware running outside the browser, a malicious extension with broad permissions, or anyone with access to your unlocked browser profile could potentially read locally stored credentials. We recommend:

- Use a dedicated API key just for this extension.
- Set a low usage/spending limit on the provider side.
- Revoke the key immediately if you notice suspicious activity or stop using the extension.

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
