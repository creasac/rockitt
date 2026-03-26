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
  "ELEVENLABS_AGENT_CONFIG_VERSION": "13",
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

## Updating The Existing Agent

If you keep the same `ELEVENLABS_AGENT_ID`, update the deployed ElevenLabs agent in place:

```bash
cd cloudflare/worker
ELEVENLABS_API_KEY=your_key \
ELEVENLABS_AGENT_ID=agent_... \
node scripts/update-elevenlabs-agent.mjs
```

Or, if your values already exist in `.dev.vars`, load them into your shell first:

```bash
cd cloudflare/worker
set -a
source .dev.vars
set +a
node scripts/update-elevenlabs-agent.mjs
```

Notes:

- Updating the agent prompt/config in ElevenLabs does not require a Worker redeploy if the agent ID stays the same.
- Redeploy the Worker only if you changed Worker vars such as `ELEVENLABS_AGENT_ID` or `ELEVENLABS_AGENT_CONFIG_VERSION`.
- If you use ElevenLabs branches, set `ELEVENLABS_AGENT_BRANCH_ID` before running the update script to patch that branch instead of the default agent config.
