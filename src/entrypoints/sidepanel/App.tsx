import { useState } from 'react';

import { ConversationView } from '../../components/ConversationView';
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
            <ConversationView
              messages={mockConversation}
              onBackToVoice={toggleMode}
            />
          )}
        </main>
      </div>
    </div>
  );
}
