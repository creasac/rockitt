# Rockitt

Rockitt is a voice-first Chrome side panel extension for grounded web answers. The extension UI is built with WXT + React, uses ElevenLabs for live voice, and talks to a small Cloudflare Worker that proxies Firecrawl and keeps API keys out of the browser.

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
