import { Mic, Sparkles } from 'lucide-react';

import type { VoiceState } from '../lib/mock-data';

type VoiceOrbProps = {
  disabled?: boolean;
  label?: string;
  state: VoiceState;
  onPress: () => void;
};

const iconByState = {
  idle: Mic,
  listening: Mic,
  thinking: Sparkles,
  speaking: Sparkles,
} satisfies Record<VoiceState, typeof Mic>;

export function VoiceOrb({
  disabled = false,
  label = 'Start or preview voice mode',
  state,
  onPress,
}: VoiceOrbProps) {
  const Icon = iconByState[state];

  return (
    <button
      aria-label={label}
      className={`voice-orb voice-orb--${state}`}
      disabled={disabled}
      type="button"
      onClick={onPress}
    >
      <span className="voice-orb__halo voice-orb__halo--outer" />
      <span className="voice-orb__halo voice-orb__halo--inner" />
      <span className="voice-orb__core">
        <Icon className="voice-orb__icon" strokeWidth={1.75} />
      </span>
    </button>
  );
}
