import { LoaderCircle, Send } from 'lucide-react';

import { RockittPageToggle } from './RockittPageToggle';

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
  messages: ChatMessage[];
  onBackToVoice: () => void;
  onChangeDraft: (value: string) => void;
  onSubmit: () => void;
};

export function ConversationView({
  canSend,
  draft,
  isAwaitingReply,
  messages,
  onBackToVoice,
  onChangeDraft,
  onSubmit,
}: ConversationViewProps) {
  return (
    <div className="chat-shell">
      <div className="chat-shell__top">
        <RockittPageToggle
          direction="down"
          label="Return to voice"
          onPress={onBackToVoice}
        />
      </div>

      <div className="chat-feed">
        {messages.length ? (
          messages.map((message) => (
            <article
              key={message.id}
              className={`message message--${message.role}${message.status ? ` message--${message.status}` : ''}`}
            >
              <p className="message__text">{message.text}</p>
              {message.meta ? (
                <span className="message__meta">{message.meta}</span>
              ) : null}
            </article>
          ))
        ) : (
          <article className="chat-empty">
            <p className="chat-empty__title">No live transcript yet</p>
            <p className="chat-empty__copy">
              Start voice mode first, then spoken turns and typed messages will
              land here.
            </p>
          </article>
        )}

        {isAwaitingReply ? (
          <article className="message message--assistant message--pending">
            <p className="message__text">Rockitt is replying...</p>
            <span className="message__meta">
              <LoaderCircle className="spin" size={14} />
              Live session
            </span>
          </article>
        ) : null}
      </div>

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
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
  );
}
