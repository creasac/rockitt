import { Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ConversationView } from '../../components/ConversationView';
import { SettingsSheet } from '../../components/SettingsSheet';
import { VoiceOrb } from '../../components/VoiceOrb';
import { sendBackgroundMessage } from '../../lib/background-client';
import {
  mockConversation,
  nextVoiceState,
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

const emptyDraftState: Record<ProviderId, string> = {
  elevenlabs: '',
  firecrawl: '',
};

export function App() {
  const [drafts, setDrafts] = useState<Record<ProviderId, string>>(emptyDraftState);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>('voice');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [providerState, setProviderState] =
    useState<ProviderStatusMap>(createEmptyProviderState());
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestNotice, setRequestNotice] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');

  const stateCopy = voiceStates[voiceState];
  const hasConfiguredProviders =
    providerState.elevenlabs.hasKey && providerState.firecrawl.hasKey;
  const voiceHint = hasConfiguredProviders
    ? stateCopy.hint
    : 'Add your own ElevenLabs and Firecrawl keys in Settings before leaving preview mode.';

  const applyResponse = (nextState: ProviderStatusMap) => {
    setProviderState(nextState);
  };

  const loadProviderState = async (preserveMessages = false) => {
    if (!preserveMessages) {
      setRequestError(null);
      setRequestNotice(null);
    }

    try {
      const response = await sendBackgroundMessage({
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

  const handleOrbPress = () => {
    setVoiceState((currentState) => nextVoiceState[currentState]);
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
      const response = await sendBackgroundMessage({
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
      const response = await sendBackgroundMessage({
        type: 'provider-settings:delete-key',
        provider,
      });

      if (!response.ok) {
        if (response.state) {
          applyResponse(response.state);
        }

        throw new Error(response.error);
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
      const response = await sendBackgroundMessage({
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

  const toggleMode = () => {
    setPanelMode((currentMode) =>
      currentMode === 'voice' ? 'chat' : 'voice',
    );
  };

  useEffect(() => {
    void loadProviderState();
  }, []);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    void loadProviderState(true);
  }, [isSettingsOpen]);

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

              <VoiceOrb state={voiceState} onPress={handleOrbPress} />

              <div className="voice-view__copy">
                <p className="voice-view__hint">{voiceHint}</p>
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
              messages={mockConversation}
              onBackToVoice={toggleMode}
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
