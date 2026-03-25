import { Send } from 'lucide-react';

import type { ChatMessage } from '../lib/mock-data';

type ConversationViewProps = {
  messages: ChatMessage[];
};

export function ConversationView({ messages }: ConversationViewProps) {
  return (
    <div className="chat-shell">
      <div className="chat-feed">
        {messages.map((message) => (
          <article
            key={message.id}
            className={`message message--${message.role}`}
          >
            <p className="message__text">{message.text}</p>
            {message.meta ? (
              <span className="message__meta">{message.meta}</span>
            ) : null}
          </article>
        ))}
      </div>

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <label className="composer__label" htmlFor="rockitt-message">
          Type a question
        </label>
        <input
          id="rockitt-message"
          className="composer__input"
          placeholder="Type instead"
          type="text"
        />
        <button
          aria-label="Send message"
          className="composer__send"
          type="submit"
        >
          <Send size={16} strokeWidth={2} />
        </button>
      </form>
    </div>
  );
}
