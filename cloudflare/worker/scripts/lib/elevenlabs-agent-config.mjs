export const elevenLabsApiBaseUrl = 'https://api.elevenlabs.io/v1';

export const getElevenLabsAgentSettings = (env = process.env) => ({
  agentName: env.ELEVENLABS_AGENT_NAME || 'rockitt voice',
  llm: env.ELEVENLABS_AGENT_LLM || 'gemini-2.0-flash',
  maxDurationSeconds: Number(
    env.ELEVENLABS_AGENT_MAX_DURATION_SECONDS || 600,
  ),
  ttsModelId: env.ELEVENLABS_AGENT_TTS_MODEL_ID || 'eleven_flash_v2',
  turnTimeout: Number(env.ELEVENLABS_AGENT_TURN_TIMEOUT || 6),
  voiceId: env.ELEVENLABS_AGENT_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL',
  voiceLabel: env.ELEVENLABS_AGENT_VOICE_LABEL || 'Sarah',
});

export const buildElevenLabsAgentPrompt = () =>
  [
    'You are Rockitt, a concise voice assistant inside a browser side panel.',
    'Keep answers useful, natural, and proportionate to the user\'s request.',
    'Match response length to the complexity of the question.',
    'For simple questions, answer directly and keep it short.',
    'For demanding questions, explain more fully and cover the important details.',
    'Ask at most one short follow-up question when needed.',
    'Do not use markdown or long lists in voice responses.',
    'If you are unsure, say so directly instead of guessing.',
    'Rockitt may receive recent prior-session context in {{recent_conversation_context}}. Treat it as optional background context for continuity, never as the user\'s current message, and do not mention it unless the user asks about the earlier conversation.',
    'When freshness matters, such as news, prices, releases, changing facts, or anything happening right now, use the Firecrawl search tool before answering.',
    'When the user provides a URL or asks you to inspect a specific public web page, use the Firecrawl scrape tool with that URL before answering.',
    'For recent news or fast-moving topics, prefer the freshest Firecrawl results so the answer reflects the latest available updates.',
    'Do not claim you checked the web unless you actually used a Firecrawl tool in this turn.',
    'If a Firecrawl tool fails, say live web lookup is unavailable right now and answer cautiously.',
    'The user may ask questions unrelated to the current page. Do not inspect the page unless the request is clearly about the current page, screen, tab, what they are looking at, or an ambiguous "this", "here", "that", "above", or "below" reference.',
    'If the user refers to highlighted text, selected text, or "what I selected", use the visible page context tool first. Its result includes the current page selection when available.',
    'When the user is asking about the current page or the referent is unclear, use the visible page context tool before answering.',
    'When the visible page context is not enough and the page is text-heavy, use the readable page context tool with a short question that captures what you need from the page.',
    'Do not claim you can see the current page unless you actually used a page context tool in this turn.',
    'If a page context tool fails, say local page access is unavailable right now and answer cautiously.',
  ].join(' ');

export const buildElevenLabsAgentTools = () => [
  {
    description:
      'Search the live internet for current facts, recent changes, news, prices, or other information that may be outdated in the model. Use before answering when freshness matters.',
    expects_response: true,
    name: 'firecrawl_search_web',
    parameters: {
      properties: {
        limit: {
          description:
            'How many results to retrieve per source. Use 1 to 5. Default is 3.',
          maximum: 5,
          minimum: 1,
          type: 'integer',
        },
        mode: {
          description:
            "Which result source to use. 'web' is the default. 'news' is useful for the latest headlines and recent updates. 'web-and-news' returns both.",
          enum: ['web', 'news', 'web-and-news'],
          type: 'string',
        },
        query: {
          description: 'The web search query to run.',
          type: 'string',
        },
        timeRange: {
          description:
            "Optional freshness filter. This only applies to web results and is ignored for news-only searches. Use 'newest' to sort by date.",
          enum: [
            'any',
            'past-hour',
            'past-day',
            'past-week',
            'past-month',
            'past-year',
            'newest',
          ],
          type: 'string',
        },
      },
      required: ['query'],
      type: 'object',
    },
    type: 'client',
  },
  {
    description:
      'Fetch the current contents of a specific public web page URL. Use when the user gives a URL or asks you to inspect a specific page.',
    expects_response: true,
    name: 'firecrawl_scrape_url',
    parameters: {
      properties: {
        url: {
          description: 'The full public http or https URL to fetch.',
          type: 'string',
        },
      },
      required: ['url'],
      type: 'object',
    },
    type: 'client',
  },
  {
    description:
      'Read a compact summary of what is visible in the active browser tab right now. Include the user\'s current page selection when available. Use only when the user is asking about the current page, screen, tab, highlighted text, or an ambiguous "this" or "here" reference.',
    expects_response: true,
    name: 'get_visible_page_context',
    parameters: {
      properties: {},
      type: 'object',
    },
    type: 'client',
  },
  {
    description:
      'Read more of the current page locally for text-heavy pages such as articles or docs. Include the user\'s current page selection when available. Use after the visible page tool when you need deeper context, and pass a short question so the tool can return only the most relevant sections.',
    expects_response: true,
    name: 'get_readable_page_context',
    parameters: {
      properties: {
        maxSections: {
          description:
            'How many relevant sections to return. Use 1 to 4. Default is 3.',
          maximum: 4,
          minimum: 1,
          type: 'integer',
        },
        question: {
          description:
            'A short description of what you need from the page, based on the user request.',
          type: 'string',
        },
      },
      type: 'object',
    },
    type: 'client',
  },
];

export const buildElevenLabsAgentBody = (env = process.env) => {
  const settings = getElevenLabsAgentSettings(env);

  return {
    conversation_config: {
      agent: {
        first_message: "hi, what's up?",
        language: 'en',
        prompt: {
          llm: settings.llm,
          max_tokens: -1,
          prompt: buildElevenLabsAgentPrompt(),
          temperature: 0.2,
          tools: buildElevenLabsAgentTools(),
        },
      },
      conversation: {
        client_events: [
          'audio',
          'agent_response',
          'agent_response_correction',
          'agent_chat_response_part',
          'user_transcript',
          'tentative_user_transcript',
          'interruption',
          'client_tool_call',
          'agent_tool_request',
          'agent_tool_response',
          'ping',
          'conversation_initiation_metadata',
          'asr_initiation_metadata',
        ],
        max_duration_seconds: settings.maxDurationSeconds,
      },
      tts: {
        model_id: settings.ttsModelId,
        voice_id: settings.voiceId,
      },
      turn: {
        turn_eagerness: 'normal',
        turn_timeout: settings.turnTimeout,
      },
    },
    name: settings.agentName,
    platform_settings: {
      auth: {
        enable_auth: true,
      },
    },
  };
};

export const readElevenLabsErrorMessage = (payload, fallback) =>
  payload?.message || payload?.detail || payload?.error || fallback;
