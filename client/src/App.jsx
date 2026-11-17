
import { useState, useRef, useEffect } from "react";
import "./App.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:5000";

const suggestions = [
  "Show me all my tasks",
  "Create a task called Learn Docker",
  "Show my pending tasks",
];

function renderInlineMarkdown(text) {
  return text
    .split(/(\*\*.*?\*\*|`.*?`|\*.*?\*)/g)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }

      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={index}>{part.slice(1, -1)}</code>;
      }

      if (part.startsWith("*") && part.endsWith("*")) {
        return <em key={index}>{part.slice(1, -1)}</em>;
      }

      return part;
    });
}

function MessageContent({ content }) {
  return (
    <div className="message-content">
      {content.split(/\r?\n/).map((line, index) => {
        const listItem = line.trim().match(/^(?:[-*]|\d+\.)\s+(.*)$/);

        if (listItem) {
          return (
            <div className="message-list-item" key={index}>
              <span aria-hidden="true">•</span>
              <span>{renderInlineMarkdown(listItem[1])}</span>
            </div>
          );
        }

        if (!line.trim()) {
          return <div className="message-spacer" key={index} />;
        }

        return <p key={index}>{renderInlineMarkdown(line)}</p>;
      })}
    </div>
  );
}

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const message = input.trim();

    if (!message || loading) return;

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: message,
      },
    ]);

    setInput("");
    setLoading(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || "Something went wrong"
        );
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.reply,
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${error.message}`,
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">T</div>
          <div>
            <h1>TaskMate <span>AI</span></h1>
            <p>Your tasks, in one conversation</p>
          </div>
        </div>

        <span className="status">
          <span className="status-dot" />
          Assistant ready
        </span>
      </header>

      <main className="chat-container">
        {messages.length === 0 && (
          <div className="welcome">
            <div className="welcome-mark" aria-hidden="true">T</div>
            <p className="eyebrow">TASKMATE AI</p>
            <h2>What would you like to get done?</h2>
            <p className="welcome-copy">
              Ask me to create, find, update, or organize your tasks.
            </p>

            <div className="suggestions">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setInput(suggestion)}
                >
                  {suggestion}
                  <span aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.length > 0 && (
          <div className="messages" aria-live="polite">
            {messages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                className={`message ${message.role}${message.isError ? " error" : ""}`}
              >
                <div className="message-avatar" aria-hidden="true">
                  {message.role === "user" ? "Y" : "T"}
                </div>
                <div className="message-body">
                  <span className="role">
                    {message.role === "user" ? "You" : "TaskMate"}
                  </span>
                  <MessageContent content={message.content} />
                </div>
              </article>
            ))}

            {loading && (
              <article className="message assistant" aria-label="Assistant is responding">
                <div className="message-avatar" aria-hidden="true">T</div>
                <div className="message-body">
                  <span className="role">TaskMate</span>
                  <div className="typing">
                    <span />
                    <span />
                    <span />
                    <span className="typing-label">Working on it</span>
                  </div>
                </div>
              </article>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </main>

      <form className="chat-input" onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask me to manage your tasks..."
          disabled={loading}
          aria-label="Message TaskMate"
        />

        <button
          type="submit"
          disabled={loading || !input.trim()}
        >
          {loading ? (
            "Sending"
          ) : (
            <>
              Send <span aria-hidden="true">↑</span>
            </>
          )}
        </button>
      </form>

      <footer>
        AI can make mistakes. Check task changes before relying on them.
      </footer>
    </div>
  );
}

export default App;
