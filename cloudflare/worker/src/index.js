const elevenLabsApiBaseUrl = 'https://api.elevenlabs.io/v1';
const firecrawlApiBaseUrl = 'https://api.firecrawl.dev/v2';
const firecrawlToolNames = {
  scrape: 'firecrawl_scrape_url',
  search: 'firecrawl_search_web',
};
const firecrawlSearchModes = ['web', 'news', 'web-and-news'];
const firecrawlTimeRanges = [
  'any',
  'past-hour',
  'past-day',
  'past-week',
  'past-month',
  'past-year',
  'newest',
];
const firecrawlTimeRangeToTbs = {
  newest: 'sbd:1',
  'past-day': 'qdr:d',
  'past-hour': 'qdr:h',
  'past-month': 'qdr:m',
  'past-week': 'qdr:w',
  'past-year': 'qdr:y',
};
const maxFirecrawlResultCount = 5;
const maxFirecrawlScrapeMarkdownChars = 12_000;
const encoder = new TextEncoder();

const corsHeaders = {
  'Access-Control-Allow-Headers': 'Content-Type, x-rockitt-install-id',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Origin': '*',
};

const json = (payload, init = {}) =>
  new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders,
      ...(init.headers ?? {}),
    },
  });

const errorResponse = (message, status = 500, detail = null) =>
  json(
    {
      detail,
      error: message,
      message,
    },
    { status },
  );

const isObject = (value) => typeof value === 'object' && value !== null;

const readStringField = (value, key) => {
  if (!isObject(value)) {
    return null;
  }

  const nextValue = value[key];
  return typeof nextValue === 'string' ? nextValue : null;
};

const readNumberField = (value, key) => {
  if (!isObject(value)) {
    return null;
  }

  const nextValue = value[key];
  return typeof nextValue === 'number' && Number.isFinite(nextValue)
    ? nextValue
    : null;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeToolText = (value, maxChars) => {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  if (normalized.length <= maxChars) {
    return {
      text: normalized,
      truncated: false,
    };
  }

  return {
    text: `${normalized.slice(0, maxChars).trimEnd()}...`,
    truncated: true,
  };
};

const normalizePublicUrl = (value) => {
  const url = new URL(value.trim());

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Firecrawl can only fetch public http or https URLs.');
  }

  return url.toString();
};

const parseFirecrawlSearchParameters = (value) => {
  const query = readStringField(value, 'query')?.trim();

  if (!query) {
    throw new Error('Firecrawl search requires a query string.');
  }

  const modeValue = readStringField(value, 'mode');
  const timeRangeValue = readStringField(value, 'timeRange');
  const limitValue = readNumberField(value, 'limit');
  const mode = firecrawlSearchModes.includes(modeValue) ? modeValue : 'web';
  const timeRange = firecrawlTimeRanges.includes(timeRangeValue)
    ? timeRangeValue
    : 'any';
  const limit = clamp(Math.trunc(limitValue ?? 3), 1, maxFirecrawlResultCount);

  return {
    limit,
    mode,
    query,
    timeRange,
  };
};

const parseFirecrawlScrapeParameters = (value) => {
  const url = readStringField(value, 'url')?.trim();

  if (!url) {
    throw new Error('Firecrawl scrape requires a URL.');
  }

  return {
    url: normalizePublicUrl(url),
  };
};

const normalizeFirecrawlResultItems = (value, source) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isObject(item)) {
      return [];
    }

    const url = readStringField(item, 'url');

    if (!url) {
      return [];
    }

    return [
      {
        category: readStringField(item, 'category'),
        date: readStringField(item, 'date'),
        position: readNumberField(item, 'position'),
        snippet:
          readStringField(item, 'snippet') ??
          readStringField(item, 'description'),
        source,
        title: readStringField(item, 'title') ?? url,
        url,
      },
    ];
  });
};

const extractConversationToken = (value) =>
  readStringField(value, 'token') ??
  readStringField(value, 'conversation_token') ??
  readStringField(value, 'conversationToken');

const buildVoiceAgentSnapshot = (env, checkedAt) => {
  if (!env.ELEVENLABS_AGENT_ID) {
    return null;
  }

  const turnEagernessValue = env.ELEVENLABS_AGENT_TURN_EAGERNESS;
  const turnEagerness =
    turnEagernessValue === 'patient' ||
    turnEagernessValue === 'normal' ||
    turnEagernessValue === 'eager'
      ? turnEagernessValue
      : 'normal';

  return {
    agentId: env.ELEVENLABS_AGENT_ID,
    agentName: env.ELEVENLABS_AGENT_NAME || 'rockitt voice',
    configVersion: Number(env.ELEVENLABS_AGENT_CONFIG_VERSION || 11),
    createdAt: env.ELEVENLABS_AGENT_CREATED_AT || checkedAt,
    llm: env.ELEVENLABS_AGENT_LLM || 'gemini-2.0-flash',
    maxDurationSeconds: Number(env.ELEVENLABS_AGENT_MAX_DURATION_SECONDS || 600),
    maxTokens: Number(env.ELEVENLABS_AGENT_MAX_TOKENS || -1),
    ttsModelId: env.ELEVENLABS_AGENT_TTS_MODEL_ID || 'eleven_flash_v2',
    turnEagerness,
    turnTimeout: Number(env.ELEVENLABS_AGENT_TURN_TIMEOUT || 6),
    voiceId: env.ELEVENLABS_AGENT_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL',
    voiceLabel: env.ELEVENLABS_AGENT_VOICE_LABEL || 'Sarah',
  };
};

const buildVoiceRuntime = (env, checkedAt) => {
  const agent = buildVoiceAgentSnapshot(env, checkedAt);
  const ready = Boolean(env.ELEVENLABS_API_KEY && agent);

  return {
    agent,
    costProfile: 'aggressive',
    ready,
  };
};

const buildServiceHealth = (env, checkedAt) => {
  const backendDetail = 'Cloudflare Worker is brokering app-owned provider access.';
  const voiceReady = Boolean(env.ELEVENLABS_API_KEY && env.ELEVENLABS_AGENT_ID);
  const firecrawlReady = Boolean(env.FIRECRAWL_API_KEY);

  return {
    backend: {
      checkedAt,
      detail: backendDetail,
      status: 'ready',
      summary: 'Managed backend reachable.',
    },
    elevenlabs: voiceReady
      ? {
          checkedAt,
          detail: `Using managed agent ${env.ELEVENLABS_AGENT_NAME || env.ELEVENLABS_AGENT_ID}.`,
          status: 'ready',
          summary: 'Managed ElevenLabs voice ready.',
        }
      : {
          checkedAt,
          detail: 'Set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID in Worker secrets or vars.',
          status: 'unavailable',
          summary: 'Managed ElevenLabs voice not configured.',
        },
    firecrawl: firecrawlReady
      ? {
          checkedAt,
          detail: 'Managed Firecrawl search and scrape routes are available.',
          status: 'ready',
          summary: 'Managed Firecrawl lookup ready.',
        }
      : {
          checkedAt,
          detail: 'Set FIRECRAWL_API_KEY in Worker secrets before enabling live web lookup.',
          status: 'unavailable',
          summary: 'Managed Firecrawl lookup not configured.',
        },
  };
};

const readRequestJson = async (request) => {
  try {
    return await request.json();
  } catch {
    throw new Error('The request body must be valid JSON.');
  }
};

const readResponseMessage = async (response) => {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      const value = await response.json();

      if (typeof value === 'string') {
        return value;
      }

      if (Array.isArray(value)) {
        return value.map(String).join(' | ');
      }

      if (isObject(value)) {
        return (
          readStringField(value, 'message') ??
          readStringField(value, 'detail') ??
          readStringField(value, 'error') ??
          JSON.stringify(value)
        );
      }
    } catch {
      return null;
    }
  }

  try {
    const value = await response.text();
    return value.trim() || null;
  } catch {
    return null;
  }
};

const createCacheKey = async (request, kind, payload) => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(JSON.stringify(payload)),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  const url = new URL(request.url);
  url.pathname = `/__cache/${kind}/${hash}`;
  url.search = '';
  return new Request(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
    method: 'GET',
  });
};

const withJsonCache = async (request, ctx, kind, payload, ttlSeconds, producer) => {
  const cache = caches.default;
  const cacheKey = await createCacheKey(request, kind, payload);
  const cached = await cache.match(cacheKey);

  if (cached) {
    return cached;
  }

  const result = await producer();
  const response = json(result, {
    headers: {
      'Cache-Control': `public, max-age=${ttlSeconds}`,
    },
  });

  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};

const maybeRateLimit = async (request, env) => {
  if (!env.ROCKITT_RATE_LIMITER || typeof env.ROCKITT_RATE_LIMITER.limit !== 'function') {
    return null;
  }

  const installId = request.headers.get('x-rockitt-install-id')?.trim();

  if (!installId) {
    return errorResponse('Missing x-rockitt-install-id header.', 400);
  }

  const { success } = await env.ROCKITT_RATE_LIMITER.limit({ key: installId });

  if (!success) {
    return errorResponse('Rate limit exceeded.', 429);
  }

  return null;
};

const fetchFirecrawlJson = async (path, apiKey, body) => {
  const response = await fetch(`${firecrawlApiBaseUrl}${path}`, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(
      (await readResponseMessage(response)) ??
        `Firecrawl request failed (${response.status}).`,
    );
  }

  return response.json();
};

const handleHealth = async (env) => {
  const checkedAt = new Date().toISOString();

  return json({
    checkedAt,
    services: buildServiceHealth(env, checkedAt),
    voice: buildVoiceRuntime(env, checkedAt),
  });
};

const handleVoiceSession = async (request, env) => {
  const rateLimitResponse = await maybeRateLimit(request, env);

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  if (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_AGENT_ID) {
    return errorResponse(
      'Managed ElevenLabs voice is not configured on the backend.',
      503,
    );
  }

  const checkedAt = new Date().toISOString();
  const runtime = buildVoiceRuntime(env, checkedAt);
  const search = new URLSearchParams({
    agent_id: env.ELEVENLABS_AGENT_ID,
  });
  const response = await fetch(
    `${elevenLabsApiBaseUrl}/convai/conversation/token?${search.toString()}`,
    {
      headers: {
        'xi-api-key': env.ELEVENLABS_API_KEY,
      },
    },
  );

  if (!response.ok) {
    return errorResponse(
      (await readResponseMessage(response)) ??
        `Unable to start the ElevenLabs voice session (${response.status}).`,
      response.status,
    );
  }

  const payload = await response.json();
  const conversationToken = extractConversationToken(payload);

  if (!conversationToken) {
    return errorResponse(
      'ElevenLabs did not return a conversation token for the voice session.',
      502,
    );
  }

  return json({
    conversationToken,
    runtime,
  });
};

const handleFirecrawlSearch = async (request, env, ctx) => {
  const rateLimitResponse = await maybeRateLimit(request, env);

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  if (!env.FIRECRAWL_API_KEY) {
    return errorResponse(
      'Managed Firecrawl lookup is not configured on the backend.',
      503,
    );
  }

  const input = parseFirecrawlSearchParameters(await readRequestJson(request));

  return withJsonCache(request, ctx, 'firecrawl-search', input, 45, async () => {
    const sources = input.mode === 'web-and-news' ? ['web', 'news'] : [input.mode];
    const tbs = input.mode === 'news' ? undefined : firecrawlTimeRangeToTbs[input.timeRange];
    const payload = await fetchFirecrawlJson('/search', env.FIRECRAWL_API_KEY, {
      limit: input.limit,
      query: input.query,
      sources,
      ...(tbs ? { tbs } : {}),
      timeout: 15_000,
    });
    const data = isObject(payload) ? payload.data : null;
    const webResults = isObject(data)
      ? normalizeFirecrawlResultItems(data.web, 'web')
      : [];
    const newsResults = isObject(data)
      ? normalizeFirecrawlResultItems(data.news, 'news')
      : [];
    const fallbackResults = Array.isArray(data)
      ? normalizeFirecrawlResultItems(data, input.mode === 'news' ? 'news' : 'web')
      : [];

    return {
      mode: input.mode,
      query: input.query,
      results:
        fallbackResults.length > 0
          ? fallbackResults
          : [...webResults, ...newsResults],
      searchedAt: new Date().toISOString(),
      timeRange: input.timeRange,
      tool: firecrawlToolNames.search,
    };
  });
};

const handleFirecrawlScrape = async (request, env, ctx) => {
  const rateLimitResponse = await maybeRateLimit(request, env);

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  if (!env.FIRECRAWL_API_KEY) {
    return errorResponse(
      'Managed Firecrawl lookup is not configured on the backend.',
      503,
    );
  }

  const input = parseFirecrawlScrapeParameters(await readRequestJson(request));

  return withJsonCache(request, ctx, 'firecrawl-scrape', input, 60, async () => {
    const payload = await fetchFirecrawlJson('/scrape', env.FIRECRAWL_API_KEY, {
      formats: ['markdown'],
      maxAge: 0,
      onlyMainContent: true,
      timeout: 20_000,
      url: input.url,
    });
    const data = isObject(payload) ? payload.data : null;

    if (!isObject(data)) {
      throw new Error('Firecrawl returned an unexpected scrape response.');
    }

    const metadata = isObject(data.metadata) ? data.metadata : null;
    const markdown =
      readStringField(data, 'markdown') ??
      readStringField(data, 'content') ??
      '';
    const normalizedMarkdown = normalizeToolText(
      markdown || 'No markdown content returned.',
      maxFirecrawlScrapeMarkdownChars,
    );

    return {
      description: readStringField(metadata, 'description'),
      fetchedAt: new Date().toISOString(),
      markdown: normalizedMarkdown.text,
      sourceURL: readStringField(metadata, 'sourceURL') ?? input.url,
      statusCode: readNumberField(metadata, 'statusCode'),
      title: readStringField(metadata, 'title'),
      tool: firecrawlToolNames.scrape,
      truncated: normalizedMarkdown.truncated,
      url: input.url,
    };
  });
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders,
        status: 204,
      });
    }

    const url = new URL(request.url);

    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        return await handleHealth(env);
      }

      if (request.method === 'POST' && url.pathname === '/voice/session') {
        return await handleVoiceSession(request, env);
      }

      if (request.method === 'POST' && url.pathname === '/firecrawl/search') {
        return await handleFirecrawlSearch(request, env, ctx);
      }

      if (request.method === 'POST' && url.pathname === '/firecrawl/scrape') {
        return await handleFirecrawlScrape(request, env, ctx);
      }

      return errorResponse('Route not found.', 404);
    } catch (error) {
      return errorResponse(
        error instanceof Error ? error.message : 'Unknown backend error occurred.',
        500,
      );
    }
  },
};
