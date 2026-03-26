import { Send, Settings2 } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { RockittPageToggle } from './RockittPageToggle';
import { VoiceSessionControls } from './VoiceSessionControls';

type ChatMessage = {
  id: string;
  meta?: string;
  role: 'assistant' | 'tool' | 'user';
  status?: 'error' | 'running' | 'success';
  text: string;
};

type ConversationViewProps = {
  canSend: boolean;
  draft: string;
  isAwaitingReply: boolean;
  isLive: boolean;
  isLiveControlDisabled: boolean;
  isMuted: boolean;
  isMuteControlDisabled: boolean;
  liveLabel: string;
  messages: ChatMessage[];
  onBackToVoice: () => void;
  onChangeDraft: (value: string) => void;
  onOpenSettings: () => void;
  onSubmit: () => void;
  onToggleLive: () => void;
  onToggleMute: () => void;
  statusText: string;
};

const autoScrollThresholdPx = 24;

const isNearBottom = (element: HTMLDivElement) =>
  element.scrollHeight - element.scrollTop - element.clientHeight <=
  autoScrollThresholdPx;

export function ConversationView({
  canSend,
  draft,
  isAwaitingReply,
  isLive,
  isLiveControlDisabled,
  isMuted,
  isMuteControlDisabled,
  liveLabel,
  messages,
  onBackToVoice,
  onChangeDraft,
  onOpenSettings,
  onSubmit,
  onToggleLive,
  onToggleMute,
  statusText,
}: ConversationViewProps) {
  const feedRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const visibleMessages = messages.filter(
    (message) => message.role !== 'tool' || message.status === 'error',
  );

  useEffect(() => {
    const feed = feedRef.current;

    if (!feed || !shouldAutoScrollRef.current) {
      return;
    }

    feed.scrollTop = feed.scrollHeight;
  }, [isAwaitingReply, visibleMessages]);

  const handleFeedScroll = () => {
    const feed = feedRef.current;

    if (!feed) {
      return;
    }

    shouldAutoScrollRef.current = isNearBottom(feed);
  };

  return (
    <div className="chat-shell">
      <div className="chat-shell__top">
        <RockittPageToggle
          direction="down"
          label="Return to voice"
          onPress={onBackToVoice}
        />
      </div>

      <div
        ref={feedRef}
        className="chat-feed"
        onScroll={handleFeedScroll}
      >
        {visibleMessages.map((message) => (
          <article
            key={message.id}
            className={`message message--${message.role}${message.status ? ` message--${message.status}` : ''}`}
          >
            {message.meta ? (
              <p className="message__meta">{message.meta}</p>
            ) : null}
            <p className="message__text">{message.text}</p>
          </article>
        ))}

        {isAwaitingReply ? (
          <article className="message message--assistant message--pending">
            <p className="message__text">thinking</p>
          </article>
        ) : null}
      </div>

      <div className="chat-shell__bottom">
        <p className="chat-shell__status">{statusText}</p>
        <VoiceSessionControls
          isLive={isLive}
          isMuted={isMuted}
          liveDisabled={isLiveControlDisabled}
          liveLabel={liveLabel}
          muteDisabled={isMuteControlDisabled}
          onToggleLive={onToggleLive}
          onToggleMute={onToggleMute}
        />
        <div className="composer-row">
          <button
            aria-label="Open settings"
            className="icon-button composer-row__settings"
            type="button"
            onClick={onOpenSettings}
          >
            <Settings2 size={16} strokeWidth={2} />
          </button>

          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();

              if (!canSend || !draft.trim()) {
                return;
              }

              onSubmit();
            }}
          >
            <label className="composer__label" htmlFor="rockitt-message">
              Type a question
            </label>
            <input
              disabled={!canSend}
              id="rockitt-message"
              className="composer__input"
              placeholder={
                canSend ? 'Type into the live session' : 'Start voice to unlock chat'
              }
              type="text"
              value={draft}
              onChange={(event) => onChangeDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key !== 'Enter' ||
                  event.nativeEvent.isComposing ||
                  !canSend ||
                  !draft.trim()
                ) {
                  return;
                }

                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }}
            />
            <button
              aria-label="Send message"
              className="composer__send"
              disabled={!canSend || !draft.trim()}
              type="submit"
            >
              <Send size={16} strokeWidth={2} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
