import type {
  BackgroundMessage,
  BackgroundResponse,
} from './provider-settings';

export const sendBackgroundMessage = async (
  message: BackgroundMessage,
): Promise<BackgroundResponse> =>
  chrome.runtime.sendMessage(message) as Promise<BackgroundResponse>;
