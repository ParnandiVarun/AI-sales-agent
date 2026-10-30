import React, { useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble.jsx";
import ChatInput from "./ChatInput.jsx";

export default function ChatWindow({
  messages,
  sending,
  suggestions,
  onSend,
  onRetry,
  onToggleSummary,
}) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  return (
    <main className="chat">
      <header className="chat__head">
        <div className="chat__title">
          <span className="status-dot" aria-hidden="true" />
          <div>
            <h1>AI Sales Agent</h1>
            <p>Meeting Room & Workspace Assistant</p>
          </div>
        </div>
        <button
          type="button"
          className="ghost-btn summary-toggle"
          onClick={onToggleSummary}
        >
          Deal Summary
        </button>
      </header>

      <section className="chat__list">
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            onRetry={onRetry}
            disabled={sending}
          />
        ))}
        {sending && (
          <div className="msg msg--bot">
            <span className="avatar" aria-hidden="true">
              S
            </span>
            <div className="msg__body">
              <div className="bubble bubble--bot typing">
                <i />
                <i />
                <i />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </section>

      {suggestions && suggestions.length > 0 && (
        <div className="chips">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className="chip"
              disabled={sending}
              onClick={() => onSend(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <ChatInput onSend={onSend} disabled={sending} />
    </main>
  );
}

