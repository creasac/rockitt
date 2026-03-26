# Rockitt Managed Backend

This Cloudflare Worker keeps your ElevenLabs and Firecrawl API keys out of the extension.

## Routes

- `GET /health`
- `POST /voice/session`
- `POST /firecrawl/search`
- `POST /firecrawl/scrape`

## Setup

1. Create the ElevenLabs agent once:

```bash
cd cloudflare/worker
ELEVENLABS_API_KEY=your_key node scripts/create-elevenlabs-agent.mjs
```

2. Set Worker secrets:

```bash
cd cloudflare/worker
wrangler secret put ELEVENLABS_API_KEY
wrangler secret put FIRECRAWL_API_KEY
```

3. Set Worker vars for the managed agent metadata. At minimum set `ELEVENLABS_AGENT_ID`.

Example vars:

```json
{
  "ELEVENLABS_AGENT_ID": "agent_...",
  "ELEVENLABS_AGENT_NAME": "rockitt voice",
  "ELEVENLABS_AGENT_LLM": "gemini-2.0-flash",
  "ELEVENLABS_AGENT_VOICE_LABEL": "Sarah"
}
```

4. Deploy the Worker:

```bash
cd cloudflare/worker
wrangler deploy
```

5. Point the extension at the deployed Worker by creating `/home/d11a/projects/rockitt/.env`:

```bash
WXT_BACKEND_BASE_URL=https://your-worker.your-subdomain.workers.dev
```

## Local dev

1. Copy the local env template:

```bash
cd cloudflare/worker
cp .dev.vars.example .dev.vars
```

2. Fill in the real values in `.dev.vars`.

3. Run the Worker locally:

```bash
cd cloudflare/worker
npx wrangler dev
```

4. Point the extension at the local Worker while testing:

```bash
WXT_BACKEND_BASE_URL=http://127.0.0.1:8787
```

## Notes

- The extension only hits the Worker to get an ElevenLabs conversation token and to proxy Firecrawl requests.
- The live voice session still connects directly from the browser to ElevenLabs.
- Firecrawl routes use edge caching to cut latency and vendor spend.
- If you enable the optional `ROCKITT_RATE_LIMITER` binding, the Worker will rate-limit by `x-rockitt-install-id`.
