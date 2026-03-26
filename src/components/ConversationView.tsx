import { Send } from 'lucide-react';

import { RockittPageToggle } from './RockittPageToggle';

type ChatMessage = {
  id: string;
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
  statusText: string;
};

export function ConversationView({
  canSend,
  draft,
  isAwaitingReply,
  messages,
  onBackToVoice,
  onChangeDraft,
  onSubmit,
  statusText,
}: ConversationViewProps) {
  const visibleMessages = messages.filter(
    (message) => message.role !== 'tool' || message.status === 'error',
  );

  return (
    <div className="chat-shell">
      <div className="chat-shell__top">
        <RockittPageToggle
          direction="down"
          label="Return to voice"
          onPress={onBackToVoice}
        />
        <p className="chat-shell__status">{statusText}</p>
      </div>

      <div className="chat-feed">
        {visibleMessages.map((message) => (
          <article
            key={message.id}
            className={`message message--${message.role}${message.status ? ` message--${message.status}` : ''}`}
          >
            <p className="message__text">{message.text}</p>
          </article>
        ))}

        {isAwaitingReply ? (
          <article className="message message--assistant message--pending">
            <p className="message__text">thinking</p>
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
