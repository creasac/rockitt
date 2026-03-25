export const elevenLabsVoiceDefaults = {
  agentName: 'rockitt voice',
  configVersion: 2,
  llm: 'gemini-2.0-flash',
  maxDurationSeconds: 600,
  maxTokens: 120,
  prompt: [
    'You are Rockitt, a concise voice assistant inside a browser side panel.',
    'Keep answers brief, useful, and natural for spoken delivery.',
    'Default to 1 to 3 short sentences unless the user explicitly asks for more detail.',
    'Ask at most one short follow-up question when needed.',
    'Do not use markdown or long lists in voice responses.',
    'If you are unsure, say so directly instead of guessing.',
    "If the user asks about live web or page-specific information, explain that browsing and page grounding are not connected yet.",
  ].join(' '),
  temperature: 0.2,
  ttsModelId: 'eleven_flash_v2',
  turnEagerness: 'normal',
  turnTimeout: 6,
  voiceId: 'EXAVITQu4vr4xnSDxMaL',
  voiceLabel: 'Sarah',
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
