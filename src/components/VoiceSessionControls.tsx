import { Mic, MicOff, Play, Square } from 'lucide-react';

type VoiceSessionControlsProps = {
  isLive: boolean;
  isMuted: boolean;
  liveDisabled?: boolean;
  muteDisabled?: boolean;
  onToggleLive: () => void;
  onToggleMute: () => void;
  liveLabel?: string;
  showLive?: boolean;
};

export function VoiceSessionControls({
  isLive,
  isMuted,
  liveDisabled = false,
  muteDisabled = false,
  onToggleLive,
  onToggleMute,
  liveLabel,
  showLive = true,
}: VoiceSessionControlsProps) {
  const LiveIcon = isLive ? Square : Play;

  return (
    <div
      className={`voice-controls${showLive ? '' : ' voice-controls--single'}`}
      role="group"
      aria-label="Voice session controls"
    >
      {showLive ? (
        <button
          aria-label={isLive ? 'End live session' : 'Start live session'}
          aria-pressed={isLive}
          className={`voice-control voice-control--live${isLive ? ' voice-control--active' : ''}`}
          disabled={liveDisabled}
          type="button"
          onClick={onToggleLive}
        >
          <LiveIcon size={15} strokeWidth={2} />
          <span>{liveLabel ?? (isLive ? 'End live' : 'Go live')}</span>
        </button>
      ) : null}

      <button
        aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
        aria-pressed={isMuted}
        className={`voice-control voice-control--mute${isMuted ? ' voice-control--muted' : ''}`}
        disabled={muteDisabled}
        type="button"
        onClick={onToggleMute}
      >
        {isMuted ? <MicOff size={15} strokeWidth={2} /> : <Mic size={15} strokeWidth={2} />}
        <span>{isMuted ? 'Unmute' : 'Mute'}</span>
      </button>
    </div>
  );
}
