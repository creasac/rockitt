import { MessageSquare, Settings2 } from 'lucide-react';
import { useState } from 'react';

import logoUrl from '../../assets/rockitt.png';
import { ConversationView } from '../../components/ConversationView';
import { SettingsSheet } from '../../components/SettingsSheet';
import { VoiceOrb } from '../../components/VoiceOrb';
import {
  mockConversation,
  nextVoiceState,
  voiceStates,
  type PanelMode,
  type VoiceState,
} from '../../lib/mock-data';

export function App() {
  const [panelMode, setPanelMode] = useState<PanelMode>('voice');
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const stateCopy = voiceStates[voiceState];

  const handleOrbPress = () => {
    setVoiceState((currentState) => nextVoiceState[currentState]);
  };

  const toggleMode = () => {
    setPanelMode((currentMode) =>
      currentMode === 'voice' ? 'chat' : 'voice',
    );
  };

  return (
    <div className="app-frame">
      <div className="ambient ambient--one" />
      <div className="ambient ambient--two" />

      <div className="panel">
        <header className="topbar">
          <button
            aria-label={
              panelMode === 'voice'
                ? 'Reveal transcript'
                : 'Return to voice mode'
            }
            className="icon-button"
            type="button"
            onClick={toggleMode}
          >
            <MessageSquare size={16} strokeWidth={2} />
          </button>

          <div className="brand">
            <img alt="Rockitt" className="brand__mark" src={logoUrl} />
            <div className="brand__copy">
              <span className="eyebrow">Rockitt</span>
              <strong>Side panel</strong>
            </div>
          </div>

          <button
            aria-label="Open settings"
            className="icon-button"
            type="button"
            onClick={() => {
              setSettingsOpen(true);
            }}
          >
            <Settings2 size={16} strokeWidth={2} />
          </button>
        </header>

        <main className="panel__body">
          {panelMode === 'voice' ? (
            <section className="voice-view">
              <div className="voice-view__status">
                <span className="status-pill">{stateCopy.label}</span>
              </div>

              <VoiceOrb state={voiceState} onPress={handleOrbPress} />

              <div className="voice-view__copy">
                <p className="voice-view__hint">{stateCopy.hint}</p>
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
            <ConversationView messages={mockConversation} />
          )}
        </main>

        {settingsOpen ? (
          <>
            <button
              aria-label="Close settings overlay"
              className="scrim"
              type="button"
              onClick={() => {
                setSettingsOpen(false);
              }}
            />
            <SettingsSheet
              onClose={() => {
                setSettingsOpen(false);
              }}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
