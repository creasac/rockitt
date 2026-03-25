import { CheckCircle2, LoaderCircle, Mic, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  type MicrophonePermissionResultMessage,
  type MicrophonePermissionState,
} from '../../lib/microphone-permission';

const getMicrophonePermissionState = async (): Promise<MicrophonePermissionState> => {
  if (!('permissions' in navigator) || !navigator.permissions?.query) {
    return 'unsupported';
  }

  try {
    const result = await navigator.permissions.query({
      name: 'microphone' as PermissionName,
    });

    return result.state;
  } catch {
    return 'unsupported';
  }
};

const isDomException = (value: unknown): value is DOMException =>
  value instanceof DOMException;

const notifySidepanel = async (
  state: MicrophonePermissionState,
  error?: string | null,
) => {
  try {
    await chrome.runtime.sendMessage({
      error: error ?? null,
      state,
      type: 'microphone:permission-result',
    } satisfies MicrophonePermissionResultMessage);
  } catch {
    // Ignore when the sidepanel is not listening.
  }
};

export function App() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [permissionState, setPermissionState] =
    useState<MicrophonePermissionState>('unknown');

  const requestMicrophonePermission = async () => {
    setIsRequesting(true);
    setErrorMessage(null);
    setPermissionState(await getMicrophonePermissionState());

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      stream.getTracks().forEach((track) => track.stop());
      setPermissionState('granted');
      await notifySidepanel('granted');

      window.setTimeout(() => {
        window.close();
      }, 900);
    } catch (error) {
      const nextState = await getMicrophonePermissionState();
      setPermissionState(nextState);

      let nextMessage =
        'Microphone permission was not granted. Click try again, then choose Allow in Chrome.';

      if (isDomException(error) && error.name === 'NotFoundError') {
        nextMessage = 'No microphone was found on this device.';
      } else if (isDomException(error) && error.name === 'NotReadableError') {
        nextMessage =
          'Chrome could not access the microphone. Another app may already be using it.';
      } else if (nextState === 'denied') {
        nextMessage =
          'Chrome is blocking microphone access for this extension. Re-enable it in Chrome permissions, then try again.';
      }

      setErrorMessage(nextMessage);
      await notifySidepanel(nextState, nextMessage);
    } finally {
      setIsRequesting(false);
    }
  };

  useEffect(() => {
    void requestMicrophonePermission();
  }, []);

  const isGranted = permissionState === 'granted';

  return (
    <main className="permission-shell">
      <section className="permission-card">
        <div className="permission-card__icon">
          {isGranted ? (
            <CheckCircle2 size={30} strokeWidth={2.2} />
          ) : errorMessage ? (
            <TriangleAlert size={30} strokeWidth={2.2} />
          ) : isRequesting ? (
            <LoaderCircle className="spin" size={30} strokeWidth={2.2} />
          ) : (
            <Mic size={30} strokeWidth={2.2} />
          )}
        </div>

        <p className="eyebrow">Chrome workaround</p>
        <h1 className="permission-card__title">Grant microphone access</h1>

        <p className="permission-card__copy">
          Rockitt opens this normal extension tab because Chrome may not show
          microphone prompts from a side panel page. Grant access here once,
          then voice can start from the panel.
        </p>

        <div className="permission-card__status">
          <span className="permission-pill">{permissionState}</span>
        </div>

        {isGranted ? (
          <div className="permission-banner permission-banner--success" role="status">
            Microphone permission granted. This tab should close automatically.
          </div>
        ) : null}

        {errorMessage ? (
          <div className="permission-banner permission-banner--error" role="alert">
            {errorMessage}
          </div>
        ) : null}

        {!isGranted ? (
          <button
            className="permission-button"
            disabled={isRequesting}
            type="button"
            onClick={() => {
              void requestMicrophonePermission();
            }}
          >
            {isRequesting ? 'Requesting microphone...' : 'Try again'}
          </button>
        ) : null}
      </section>
    </main>
  );
}
