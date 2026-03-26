import type { ElevenLabsVoiceRuntimeState } from './voice-agent';

export const serviceCatalog = {
  backend: {
    description: 'Cloudflare Worker that brokers app-owned provider access.',
    label: 'Rockitt backend',
  },
  elevenlabs: {
    description: 'Managed voice session auth and agent access.',
    label: 'ElevenLabs',
  },
  firecrawl: {
    description: 'Managed live web search and page fetch access.',
    label: 'Firecrawl',
  },
} as const;

export type ServiceId = keyof typeof serviceCatalog;

export type ServiceStatus = 'checking' | 'ready' | 'degraded' | 'unavailable';

export type ManagedServiceState = {
  checkedAt: string | null;
  detail: string | null;
  status: ServiceStatus;
  summary: string;
};

export type ServiceStatusMap = Record<ServiceId, ManagedServiceState>;

export type ServiceBackgroundMessage = {
  type: 'service-status:get-state';
};

export type ServiceBackgroundResponse =
  | {
      ok: true;
      state: ServiceStatusMap;
      voiceRuntime: ElevenLabsVoiceRuntimeState;
    }
  | {
      ok: false;
      error: string;
      state?: ServiceStatusMap;
      voiceRuntime?: ElevenLabsVoiceRuntimeState;
    };

const defaultCheckingServiceState: ManagedServiceState = {
  checkedAt: null,
  detail: null,
  status: 'checking',
  summary: 'Checking managed service availability.',
};

export const createEmptyServiceState = (): ServiceStatusMap => ({
  backend: { ...defaultCheckingServiceState },
  elevenlabs: { ...defaultCheckingServiceState },
  firecrawl: { ...defaultCheckingServiceState },
});
