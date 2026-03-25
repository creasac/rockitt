export type MicrophonePermissionState =
  | PermissionState
  | 'unsupported'
  | 'unknown';

export type MicrophonePermissionResultMessage = {
  error?: string | null;
  state: MicrophonePermissionState;
  type: 'microphone:permission-result';
};

export const microphonePermissionPagePath = 'mic-permission.html';
