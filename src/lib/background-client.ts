import type {
  FirecrawlBackgroundMessage,
  FirecrawlBackgroundResponse,
} from './firecrawl';
import type {
  PageContextBackgroundMessage,
  PageContextBackgroundResponse,
} from './page-context';
import type {
  ServiceBackgroundMessage,
  ServiceBackgroundResponse,
} from './service-runtime';
import type {
  UsageBackgroundMessage,
  UsageBackgroundResponse,
} from './usage-runtime';
import type { ElevenLabsBackgroundMessage, ElevenLabsBackgroundResponse } from './voice-agent';

export const sendServiceMessage = async (
  message: ServiceBackgroundMessage,
): Promise<ServiceBackgroundResponse> =>
  chrome.runtime.sendMessage(message) as Promise<ServiceBackgroundResponse>;

export const sendUsageMessage = async (
  message: UsageBackgroundMessage,
): Promise<UsageBackgroundResponse> =>
  chrome.runtime.sendMessage(message) as Promise<UsageBackgroundResponse>;

export const sendVoiceMessage = async (
  message: ElevenLabsBackgroundMessage,
): Promise<ElevenLabsBackgroundResponse> =>
  chrome.runtime.sendMessage(message) as Promise<ElevenLabsBackgroundResponse>;

export const sendFirecrawlMessage = async (
  message: FirecrawlBackgroundMessage,
): Promise<FirecrawlBackgroundResponse> =>
  chrome.runtime.sendMessage(message) as Promise<FirecrawlBackgroundResponse>;

export const sendPageContextMessage = async (
  message: PageContextBackgroundMessage,
): Promise<PageContextBackgroundResponse> =>
  chrome.runtime.sendMessage(message) as Promise<PageContextBackgroundResponse>;
