import { useConversation } from '@elevenlabs/react';
import { Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ConversationView } from '../../components/ConversationView';
import { SettingsSheet } from '../../components/SettingsSheet';
import { VoiceOrb } from '../../components/VoiceOrb';
import {
  sendProviderMessage,
  sendVoiceMessage,
} from '../../lib/background-client';
import {
  voiceStates,
  type PanelMode,
  type VoiceState,
} from '../../lib/mock-data';
import {
  createEmptyProviderState,
  providerCatalog,
  type ProviderId,
  type ProviderStatusMap,
} from '../../lib/provider-settings';
import {
  createEmptyVoiceRuntimeState,
  type ElevenLabsVoiceRuntimeState,
} from '../../lib/voice-agent';
import {
  microphonePermissionPagePath,
  type MicrophonePermissionResultMessage,
  type MicrophonePermissionState,
} from '../../lib/microphone-permission';

type LiveChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  meta?: string;
  eventId?: number;
};

const emptyDraftState: Record<ProviderId, string> = {
  elevenlabs: '',
  firecrawl: '',
};

const elevenLabsWorkletPaths = {
  audioConcatProcessor: chrome.runtime.getURL(
    'elevenlabs/audioConcatProcessor.js',
  ),
  rawAudioProcessor: chrome.runtime.getURL('elevenlabs/rawAudioProcessor.js'),
};

const isDomException = (value: unknown): value is DOMException =>
  value instanceof DOMException;

const upsertLiveMessage = (
  messages: LiveChatMessage[],
  nextMessage: LiveChatMessage,
) => {
  if (nextMessage.eventId == null) {
    return [...messages, nextMessage];
  }

  const existingIndex = messages.findIndex(
    (message) => message.eventId === nextMessage.eventId,
  );

  if (existingIndex === -1) {
    return [...messages, nextMessage];
  }

  const nextMessages = [...messages];
  nextMessages[existingIndex] = nextMessage;

  return nextMessages;
};

const toVoiceState = (
  status: 'disconnected' | 'connecting' | 'connected' | 'disconnecting',
  isSpeaking: boolean,
  isAwaitingReply: boolean,
): VoiceState => {
  if (status === 'disconnected' || status === 'disconnecting') {
    return 'idle';
  }

  if (status === 'connecting') {
    return 'thinking';
  }

  if (isSpeaking) {
    return 'speaking';
  }

  if (isAwaitingReply) {
    return 'thinking';
  }

  return 'listening';
};

const getVoiceHint = (
  hasVoiceKey: boolean,
  runtime: ElevenLabsVoiceRuntimeState,
  voiceState: VoiceState,
  isStartingVoice: boolean,
) => {
  if (!hasVoiceKey) {
    return 'Add your ElevenLabs key in Settings to enable live voice.';
  }

  if (isStartingVoice) {
    return 'Provisioning the low-cost voice agent and opening a live session.';
  }

  if (!runtime.ready) {
    return 'Tap the orb to provision Rockitt\'s low-cost voice agent for this browser.';
  }

  return voiceStates[voiceState].hint;
};

const formatDisconnectError = (
  details:
    | {
        message?: string;
        reason: 'agent' | 'error' | 'user';
      }
    | undefined,
) => {
  if (!details || details.reason === 'user') {
    return null;
  }

  if (details.reason === 'agent') {
    return 'The voice session ended on the agent side.';
  }

  return details.message ?? 'The voice session ended unexpectedly.';
};

export function App() {
  const [chatDraft, setChatDraft] = useState('');
  const [drafts, setDrafts] = useState<Record<ProviderId, string>>(emptyDraftState);
  const [isAwaitingReply, setIsAwaitingReply] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isStartingVoice, setIsStartingVoice] = useState(false);
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [microphoneState, setMicrophoneState] =
    useState<MicrophonePermissionState>('unknown');
  const [panelMode, setPanelMode] = useState<PanelMode>('voice');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [providerState, setProviderState] =
    useState<ProviderStatusMap>(createEmptyProviderState());
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestNotice, setRequestNotice] = useState<string | null>(null);
  const [voiceRuntime, setVoiceRuntime] = useState<ElevenLabsVoiceRuntimeState>(
    createEmptyVoiceRuntimeState(),
  );

  const conversation = useConversation({
    connectionDelay: {
      android: 750,
      default: 0,
      ios: 0,
    },
    onConnect: () => {
      setRequestError(null);
      setRequestNotice('Voice session live.');
    },
    onDisconnect: (details) => {
      setIsAwaitingReply(false);

      const nextError = formatDisconnectError(details);

      if (nextError) {
        setRequestError(nextError);
        return;
      }

      if (details.reason === 'agent') {
        setRequestNotice('Voice session ended.');
      }
    },
    onError: (message) => {
      setIsAwaitingReply(false);
      setRequestError(message);
    },
    onMessage: ({ event_id, message, role }) => {
      setMessages((currentMessages) =>
        upsertLiveMessage(currentMessages, {
          eventId: event_id,
          id:
            event_id == null
              ? `${role}-${Date.now()}`
              : `${role}-${String(event_id)}`,
          meta: role === 'agent' ? 'Voice reply' : 'You',
          role: role === 'agent' ? 'assistant' : 'user',
          text: message,
        }),
      );

      setIsAwaitingReply(role === 'user');
    },
    onModeChange: ({ mode }) => {
      if (mode === 'speaking') {
        setIsAwaitingReply(false);
      }
    },
    useWakeLock: false,
    workletPaths: elevenLabsWorkletPaths,
  });

  const applyResponse = (nextState: ProviderStatusMap) => {
    setProviderState(nextState);
  };

  const loadProviderState = async (preserveMessages = false) => {
    if (!preserveMessages) {
      setRequestError(null);
      setRequestNotice(null);
    }

    try {
      const response = await sendProviderMessage({
        type: 'provider-settings:get-state',
      });

      if (!response.ok) {
        if (response.state) {
          applyResponse(response.state);
        }

        setRequestError(response.error);
        return;
      }

      applyResponse(response.state);
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : 'Unable to load provider state.',
      );
    }
  };

  const loadVoiceRuntime = async () => {
    try {
      const response = await sendVoiceMessage({
        type: 'elevenlabs:get-runtime-state',
      });

      if (!response.ok) {
        setRequestError(response.error);
        return;
      }

      setVoiceRuntime(response.runtime);
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : 'Unable to load ElevenLabs voice state.',
      );
    }
  };

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

  const refreshMicrophonePermissionState = async () => {
    const nextState = await getMicrophonePermissionState();
    setMicrophoneState(nextState);
    return nextState;
  };

  const openMicrophonePermissionPage = async () => {
    setRequestError(null);
    setRequestNotice(
      'Opened a full extension tab to request microphone access. Allow it there, then return to Rockitt.',
    );

    const permissionPageUrl = chrome.runtime.getURL(microphonePermissionPagePath);
    const permissionPageWindow = window.open(
      permissionPageUrl,
      '_blank',
      'noopener,noreferrer',
    );

    if (permissionPageWindow) {
      return;
    }

    setRequestError(
      'Chrome blocked the microphone permission tab. Try again and make sure popups are allowed for Chrome extensions.',
    );
  };

  const ensureMicrophoneAccess = async () => {
    const beforeState = await refreshMicrophonePermissionState();

    if (beforeState === 'prompt') {
      setRequestNotice(
        'Chrome will ask for microphone access in the main browser toolbar. If no modal appears, look for the mic permission chip near the address bar.',
      );
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      stream.getTracks().forEach((track) => track.stop());

      setMicrophoneState('granted');
      setRequestNotice('Microphone ready. Connecting the live voice session.');
      return true;
    } catch (error) {
      const afterState = await refreshMicrophonePermissionState();
      let nextMessage =
        'Microphone access was dismissed or blocked. Accept the Chrome microphone prompt and try again.';

      if (isDomException(error) && error.name === 'NotFoundError') {
        nextMessage = 'No microphone was found on this device.';
      } else if (isDomException(error) && error.name === 'NotReadableError') {
        nextMessage =
          'Chrome could not access the microphone. It may already be in use by another app.';
      } else if (
        isDomException(error) &&
        error.name === 'NotAllowedError' &&
        afterState === 'prompt'
      ) {
        nextMessage =
          'Chrome could not show the microphone prompt inside the side panel. Open the microphone permission tab below, allow access there, then tap the orb again.';
      } else if (afterState === 'denied') {
        nextMessage =
          'Microphone access is blocked for this extension panel. Re-enable it in Chrome, then tap the orb again.';
      }

      setRequestError(nextMessage);

      return false;
    }
  };

  const handleDraftChange = (provider: ProviderId, value: string) => {
    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      [provider]: value,
    }));
  };

  const handleBackgroundAction = async (
    action: string,
    runner: () => Promise<void>,
  ) => {
    setPendingAction(action);
    setRequestError(null);
    setRequestNotice(null);

    try {
      await runner();
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : 'Unexpected extension request failed.',
      );
    } finally {
      setPendingAction(null);
    }
  };

  const handleSaveProviderKey = async (provider: ProviderId) => {
    const apiKey = drafts[provider].trim();

    if (!apiKey) {
      setRequestError(`${providerCatalog[provider].label} key cannot be empty.`);
      return;
    }

    await handleBackgroundAction(`save:${provider}`, async () => {
      const response = await sendProviderMessage({
        type: 'provider-settings:save-key',
        provider,
        apiKey,
      });

      if (!response.ok) {
        if (response.state) {
          applyResponse(response.state);
        }

        throw new Error(response.error);
      }

      if (provider === 'elevenlabs') {
        setVoiceRuntime(createEmptyVoiceRuntimeState());
      }

      applyResponse(response.state);
      setDrafts((currentDrafts) => ({
        ...currentDrafts,
        [provider]: '',
      }));
      setRequestNotice(`${providerCatalog[provider].label} key saved locally.`);
    });
  };

  const handleDeleteProviderKey = async (provider: ProviderId) => {
    await handleBackgroundAction(`delete:${provider}`, async () => {
      const response = await sendProviderMessage({
        type: 'provider-settings:delete-key',
        provider,
      });

      if (!response.ok) {
        if (response.state) {
          applyResponse(response.state);
        }

        throw new Error(response.error);
      }

      if (provider === 'elevenlabs') {
        if (conversation.status !== 'disconnected') {
          await conversation.endSession();
        }

        setMessages([]);
        setIsAwaitingReply(false);
        setVoiceRuntime(createEmptyVoiceRuntimeState());
      }

      applyResponse(response.state);
      setDrafts((currentDrafts) => ({
        ...currentDrafts,
        [provider]: '',
      }));
      setRequestNotice(
        `${providerCatalog[provider].label} key removed from local storage.`,
      );
    });
  };

  const handleTestProviderKey = async (provider: ProviderId) => {
    await handleBackgroundAction(`test:${provider}`, async () => {
      const response = await sendProviderMessage({
        type: 'provider-settings:test-key',
        provider,
      });

      if (!response.ok) {
        if (response.state) {
          applyResponse(response.state);
        }

        throw new Error(response.error);
      }

      applyResponse(response.state);

      const nextStatus = response.state[provider];

      if (nextStatus.validationStatus === 'success') {
        setRequestNotice(
          `${providerCatalog[provider].label} key passed the latest check.`,
        );
        return;
      }

      setRequestError(
        nextStatus.validationMessage ??
          `${providerCatalog[provider].label} key check failed.`,
      );
    });
  };

  const startVoiceSession = async () => {
    setIsStartingVoice(true);
    setRequestError(null);
    setRequestNotice(null);

    try {
      const hasMicrophoneAccess = await ensureMicrophoneAccess();

      if (!hasMicrophoneAccess) {
        return;
      }

      const response = await sendVoiceMessage({
        type: 'elevenlabs:start-session',
      });

      if (!response.ok) {
        if (response.runtime) {
          setVoiceRuntime(response.runtime);
        }

        throw new Error(response.error);
      }

      if (!response.conversationToken) {
        throw new Error('Missing ElevenLabs conversation token.');
      }

      setVoiceRuntime(response.runtime);
      setMessages([]);
      setIsAwaitingReply(false);

      await conversation.startSession({
        connectionType: 'webrtc',
        conversationToken: response.conversationToken,
      });
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : 'Unable to start the voice session.',
      );
    } finally {
      setIsStartingVoice(false);
    }
  };

  const handleOrbPress = async () => {
    if (isStartingVoice || conversation.status === 'connecting') {
      return;
    }

    if (!providerState.elevenlabs.hasKey) {
      setRequestError('Add your ElevenLabs key in Settings before starting voice.');
      setPanelMode('voice');
      return;
    }

    if (microphoneState !== 'granted') {
      await openMicrophonePermissionPage();
      return;
    }

    if (conversation.status === 'connected') {
      setRequestNotice(null);
      await conversation.endSession();
      return;
    }

    await startVoiceSession();
  };

  const handleChatDraftChange = (value: string) => {
    setChatDraft(value);

    if (conversation.status === 'connected') {
      conversation.sendUserActivity();
    }
  };

  const handleChatSubmit = () => {
    const trimmedDraft = chatDraft.trim();

    if (!trimmedDraft) {
      return;
    }

    if (conversation.status !== 'connected') {
      setRequestError('Start the live voice session before sending chat messages.');
      return;
    }

    conversation.sendUserMessage(trimmedDraft);
    setChatDraft('');
    setIsAwaitingReply(true);
  };

  const toggleMode = () => {
    setPanelMode((currentMode) =>
      currentMode === 'voice' ? 'chat' : 'voice',
    );
  };

  useEffect(() => {
    void loadProviderState();
    void loadVoiceRuntime();
    void refreshMicrophonePermissionState();
  }, []);

  useEffect(() => {
    const handleWindowFocus = () => {
      void refreshMicrophonePermissionState();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshMicrophonePermissionState();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    void loadProviderState(true);
  }, [isSettingsOpen]);

  useEffect(() => {
    if (providerState.elevenlabs.hasKey) {
      return;
    }

    setVoiceRuntime(createEmptyVoiceRuntimeState());
    setIsAwaitingReply(false);
    setMessages([]);
  }, [providerState.elevenlabs.hasKey]);

  useEffect(() => {
    const handleRuntimeMessage = (message: unknown) => {
      if (!message || typeof message !== 'object' || !('type' in message)) {
        return;
      }

      if (message.type === 'microphone:permission-result') {
        const nextMessage = message as MicrophonePermissionResultMessage;
        setMicrophoneState(nextMessage.state);

        if (nextMessage.state === 'granted') {
          setRequestError(null);
          setRequestNotice(
            'Microphone permission granted. Return to Rockitt and tap the orb again.',
          );
        } else {
          if (nextMessage.error) {
            setRequestError(nextMessage.error);
          }
        }

        return;
      }
    };

    chrome.runtime.onMessage.addListener(handleRuntimeMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
    };
  }, []);

  const voiceState = toVoiceState(
    conversation.status,
    conversation.isSpeaking,
    isAwaitingReply,
  );
  const stateCopy = voiceStates[voiceState];
  const hasVoiceKey = providerState.elevenlabs.hasKey;
  const voiceHint = getVoiceHint(
    hasVoiceKey,
    voiceRuntime,
    voiceState,
    isStartingVoice,
  );
  const voiceMeta = voiceRuntime.agent
    ? `${voiceRuntime.agent.llm} / ${voiceRuntime.agent.voiceLabel} / aggressive cost profile`
    : 'Automatic agent provisioning on first connect.';
  const microphoneMeta = `Mic permission: ${microphoneState}`;

  return (
    <div className="app-frame">
      <div className="ambient ambient--one" />
      <div className="ambient ambient--two" />

      <div className="panel">
        <div className="panel__toolbar">
          <button
            aria-label="Open settings"
            className="icon-button"
            type="button"
            onClick={() => setIsSettingsOpen(true)}
          >
            <Settings2 size={16} strokeWidth={2} />
          </button>
        </div>

        <main className="panel__body">
          {panelMode === 'voice' ? (
            <section className="voice-view">
              <div className="voice-view__status">
                <span className="status-pill">{stateCopy.label}</span>
              </div>

              <VoiceOrb
                disabled={isStartingVoice || conversation.status === 'connecting'}
                label={
                  conversation.status === 'connected'
                    ? 'End live voice session'
                    : 'Start live voice session'
                }
                state={voiceState}
                onPress={() => {
                  void handleOrbPress();
                }}
              />

              <div className="voice-view__copy">
                <p className="voice-view__hint">{voiceHint}</p>
                <p className="voice-view__meta">{voiceMeta}</p>
                <p className="voice-view__meta">{microphoneMeta}</p>

                {requestNotice ? (
                  <div className="inline-banner inline-banner--notice" role="status">
                    {requestNotice}
                  </div>
                ) : null}

                {requestError ? (
                  <div className="inline-banner inline-banner--error" role="alert">
                    {requestError}
                  </div>
                ) : null}

                {hasVoiceKey && microphoneState !== 'granted' ? (
                  <div className="voice-view__actions">
                    <button
                      className="action-button action-button--ghost"
                      type="button"
                      onClick={() => {
                        void openMicrophonePermissionPage();
                      }}
                    >
                      Open mic permission tab
                    </button>
                  </div>
                ) : null}

                <button
                  className="text-toggle"
                  type="button"
                  onClick={toggleMode}
                >
                  Reveal chat
                </button>
              </div>
            </section>
          ) : (
            <ConversationView
              canSend={conversation.status === 'connected'}
              draft={chatDraft}
              isAwaitingReply={isAwaitingReply}
              messages={messages}
              onBackToVoice={toggleMode}
              onChangeDraft={handleChatDraftChange}
              onSubmit={() => {
                handleChatSubmit();
              }}
            />
          )}
        </main>

        {isSettingsOpen ? (
          <>
            <button
              aria-label="Close settings"
              className="scrim"
              type="button"
              onClick={() => setIsSettingsOpen(false)}
            />

            <SettingsSheet
              drafts={drafts}
              pendingAction={pendingAction}
              providerState={providerState}
              requestError={requestError}
              requestNotice={requestNotice}
              onChangeDraft={handleDraftChange}
              onClose={() => setIsSettingsOpen(false)}
              onDeleteProviderKey={handleDeleteProviderKey}
              onSaveProviderKey={handleSaveProviderKey}
              onTestProviderKey={handleTestProviderKey}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
