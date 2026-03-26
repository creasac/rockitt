import { elevenLabsFirecrawlTools } from './firecrawl';
import { elevenLabsPageContextTools } from './page-context';

const elevenLabsAgentTools = [
  ...elevenLabsFirecrawlTools,
  ...elevenLabsPageContextTools,
] as const;

export const elevenLabsVoiceDefaults = {
  agentName: 'rockitt voice',
  configVersion: 7,
  llm: 'gemini-2.0-flash',
  maxDurationSeconds: 600,
  maxTokens: -1,
  prompt: [
    'You are Rockitt, a concise voice assistant inside a browser side panel.',
    'Keep answers brief, useful, and natural for spoken delivery.',
    'Default to 1 to 3 short sentences unless the user explicitly asks for more detail.',
    'Ask at most one short follow-up question when needed.',
    'Do not use markdown or long lists in voice responses.',
    'If you are unsure, say so directly instead of guessing.',
    'When freshness matters, such as news, prices, releases, changing facts, or anything happening right now, use the Firecrawl search tool before answering.',
    'When the user provides a URL or asks you to inspect a specific public web page, use the Firecrawl scrape tool with that URL before answering.',
    'For recent news or fast-moving topics, prefer the freshest Firecrawl results so the answer reflects the latest available updates.',
    'Do not claim you checked the web unless you actually used a Firecrawl tool in this turn.',
    'If a Firecrawl tool fails, say live web lookup is unavailable right now and answer cautiously.',
    'The user may ask questions unrelated to the current page. Do not inspect the page unless the request is clearly about the current page, screen, tab, what they are looking at, or an ambiguous "this", "here", "that", "above", or "below" reference.',
    'When the user is asking about the current page or the referent is unclear, use the visible page context tool before answering.',
    'When the visible page context is not enough and the page is text-heavy, use the readable page context tool with a short question that captures what you need from the page.',
    'Do not claim you can see the current page unless you actually used a page context tool in this turn.',
    'If a page context tool fails, say local page access is unavailable right now and answer cautiously.',
  ].join(' '),
  temperature: 0.2,
  ttsModelId: 'eleven_flash_v2',
  turnEagerness: 'normal',
  turnTimeout: 6,
  voiceId: 'EXAVITQu4vr4xnSDxMaL',
  voiceLabel: 'Sarah',
  tools: elevenLabsAgentTools,
} as const;

export const voiceStorageKeys = {
  agent: 'elevenlabsVoiceAgent',
} as const;

export type StoredElevenLabsVoiceAgent = {
  agentId: string;
  agentName: string;
  configVersion: number;
  createdAt: string;
  llm: string;
  maxDurationSeconds: number;
  maxTokens: number;
  turnEagerness: 'patient' | 'normal' | 'eager';
  turnTimeout: number;
  ttsModelId: string;
  voiceId: string;
  voiceLabel: string;
};

export type ElevenLabsVoiceRuntimeState = {
  agent: StoredElevenLabsVoiceAgent | null;
  costProfile: 'aggressive';
  ready: boolean;
};

export type ElevenLabsBackgroundMessage =
  | { type: 'elevenlabs:get-runtime-state' }
  | { type: 'elevenlabs:start-session' };

export type ElevenLabsBackgroundResponse =
  | {
      ok: true;
      runtime: ElevenLabsVoiceRuntimeState;
      conversationToken?: string;
    }
  | {
      ok: false;
      error: string;
      runtime?: ElevenLabsVoiceRuntimeState;
    };

export const createEmptyVoiceRuntimeState = (): ElevenLabsVoiceRuntimeState => ({
  agent: null,
  costProfile: 'aggressive',
  ready: false,
});
