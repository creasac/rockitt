import type {
  BackgroundMessage,
  BackgroundResponse,
} from './provider-settings';
import type {
  ElevenLabsBackgroundMessage,
  ElevenLabsBackgroundResponse,
} from './voice-agent';

export const sendProviderMessage = async (
  message: BackgroundMessage,
): Promise<BackgroundResponse> =>
  chrome.runtime.sendMessage(message) as Promise<BackgroundResponse>;

export const sendVoiceMessage = async (
  message: ElevenLabsBackgroundMessage,
): Promise<ElevenLabsBackgroundResponse> =>
  chrome.runtime.sendMessage(message) as Promise<ElevenLabsBackgroundResponse>;
