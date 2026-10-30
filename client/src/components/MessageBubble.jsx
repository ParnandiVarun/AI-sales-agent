import React from "react";

export default function MessageBubble({ message, onRetry, disabled }) {
  const isUser = message.role === "user";
  const failed = message.status === "failed";

  return (
    <div className={`msg ${isUser ? "msg--user" : "msg--bot"}`}>
      {!isUser && (
        <span className="avatar" aria-hidden="true">
          S
        </span>
      )}
      <div className="msg__body">
        <div className={`bubble ${isUser ? "bubble--user" : "bubble--bot"} ${failed ? "bubble--failed" : ""}`}>
          {message.text}
        </div>
        {isUser && (message.status === "sending" || failed) && (
          <div className="msg__meta">
            {message.status === "sending" && <span>Sending</span>}
            {failed && (
              <>
                <span className="msg__error">{message.error || "Not sent"}</span>
                <button type="button" className="link-btn" disabled={disabled} onClick={() => onRetry(message)}>
                  Retry
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
