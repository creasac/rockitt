<h3 align="center">rockitt</h3>
<p align="center">
  <img src="https://github.com/user-attachments/assets/d7d82912-6eea-4559-8b71-24d37938c886" alt="" width="250" align="middle">
</p>
<p align="center">"@rock is this true?" for the web</p>

---

Rockitt is a voice-first Chrome side panel extension for grounded web answers. The extension UI is built with WXT + React, uses ElevenLabs for live voice, and talks to a small Cloudflare Worker that proxies Firecrawl and keeps API keys out of the browser.

From "@grok is this true?", and since grok == rock/silicon, thus: ROCK Is This True => ROCKITT. It references how the phrase is used on X, to apply to the broader web, similar to "google it" but instead of asking google, we ask the rock.

## Quick Start

```bash
npm install
cp .env.example .env
```

Set `WXT_BACKEND_BASE_URL` in `.env`, then run:

```bash
npm run dev
```

Load the extension from `.output/chrome-mv3` in Chrome, or build a production bundle with:

```bash
npm run build
```

## Project Layout

- `src/`: extension source, including the side panel, background script, and page-context tools
- `cloudflare/worker/`: managed backend for ElevenLabs session tokens and Firecrawl requests

Backend setup and deployment details live in `cloudflare/worker/README.md`.
