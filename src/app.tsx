import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import type { FormEvent, KeyboardEvent } from "react";
import type { UIMessage } from "ai";
import type { DeployLensAgent } from "./server";
import { MAX_INPUT_CHARACTERS } from "./agent/system-prompt";
import { getErrorMessage } from "./lib/errors";
import {
  getOrCreateInvestigationId,
  startNewInvestigation
} from "./lib/investigation";

function messageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is Extract<typeof part, { type: "text" }> =>
      part.type === "text"
    )
    .map((part) => part.text)
    .join("");
}

function ChatSession({ investigationId }: { investigationId: string }) {
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const agent = useAgent<DeployLensAgent>({
    agent: "DeployLensAgent",
    name: investigationId,
    onOpen: useCallback(() => {
      setConnected(true);
      setLocalError(null);
    }, []),
    onClose: useCallback(() => setConnected(false), []),
    onError: useCallback((_error: Event) => {
      setLocalError(getErrorMessage(new Error("WebSocket connection failed")));
    }, [])
  });

  const { messages, sendMessage, stop, status, error } = useAgentChat({
    agent,
    experimental_throttle: 75
  });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    if (error) setLocalError(getErrorMessage(error));
  }, [error]);

  const submit = useCallback(
    (event?: FormEvent) => {
      event?.preventDefault();
      const text = input.trim();
      if (!text || busy) return;

      if (text.length > MAX_INPUT_CHARACTERS) {
        setLocalError(
          `Message is too long (${text.length.toLocaleString()} characters). Keep it under ${MAX_INPUT_CHARACTERS.toLocaleString()} characters.`
        );
        return;
      }

      setLocalError(null);
      setInput("");
      sendMessage({ role: "user", parts: [{ type: "text", text }] });
    },
    [busy, input, sendMessage]
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <main className="workspace">
      <section className="conversation" aria-live="polite">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="lens-mark" aria-hidden="true">
              <span />
            </div>
            <p className="eyebrow">Investigation ready</p>
            <h2>What failed during deployment?</h2>
            <p>
              Share the failed stage, exact symptom, recent change, and a
              redacted log excerpt. DeployLens will separate evidence from
              possible causes and suggest the next check.
            </p>
            <div className="guardrail">
              <span aria-hidden="true">i</span>
              Logs are treated as untrusted evidence. DeployLens cannot run
              commands or change infrastructure.
            </div>
          </div>
        ) : (
          <div className="message-list">
            {messages.map((message: UIMessage) => {
              const text = messageText(message);
              if (!text) return null;
              return (
                <article
                  className={`message message-${message.role}`}
                  key={message.id}
                >
                  <div className="message-label">
                    {message.role === "user" ? "You" : "DeployLens"}
                  </div>
                  <div className="message-body">{text}</div>
                </article>
              );
            })}
            {status === "submitted" && (
              <div className="thinking" role="status">
                <span />
                <span />
                <span />
                Reviewing evidence
              </div>
            )}
          </div>
        )}
        <div ref={endRef} />
      </section>

      <section className="composer-wrap">
        {localError && (
          <div className="error-banner" role="alert">
            <span>{localError}</span>
            <button onClick={() => setLocalError(null)} aria-label="Dismiss error">
              Dismiss
            </button>
          </div>
        )}
        <form className="composer" onSubmit={submit}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={MAX_INPUT_CHARACTERS + 1}
            placeholder="Describe the failure or paste a redacted log excerpt…"
            aria-label="Investigation message"
            disabled={busy}
            rows={3}
          />
          <div className="composer-footer">
            <span className={input.length > MAX_INPUT_CHARACTERS ? "over-limit" : ""}>
              {input.length.toLocaleString()} / {MAX_INPUT_CHARACTERS.toLocaleString()}
            </span>
            {busy ? (
              <button className="button-secondary" type="button" onClick={stop}>
                Stop
              </button>
            ) : (
              <button
                className="button-primary"
                type="submit"
                disabled={!input.trim() || !connected}
              >
                Send <span aria-hidden="true">↗</span>
              </button>
            )}
          </div>
        </form>
        <p className="composer-note">
          AI guidance can be wrong. Verify checks before acting on production.
        </p>
      </section>
    </main>
  );
}

export default function App() {
  const [investigationId, setInvestigationId] = useState(() => {
    const requestedId = new URLSearchParams(window.location.search).get(
      "investigation"
    );
    const id = getOrCreateInvestigationId(
      window.localStorage,
      undefined,
      requestedId
    );
    const url = new URL(window.location.href);
    url.searchParams.set("investigation", id);
    window.history.replaceState(null, "", url);
    return id;
  });

  const beginNewInvestigation = () => {
    const id = startNewInvestigation(window.localStorage);
    const url = new URL(window.location.href);
    url.searchParams.set("investigation", id);
    window.history.pushState(null, "", url);
    setInvestigationId(id);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="DeployLens home">
          <span className="brand-icon" aria-hidden="true">
            D
          </span>
          <span>
            <strong>DeployLens</strong>
            <small>Deployment investigator</small>
          </span>
        </a>
        <div className="topbar-actions">
          <div className="connection-state" title={investigationId}>
            Investigation {investigationId.slice(0, 8)}
          </div>
          <button className="new-button" onClick={beginNewInvestigation}>
            <span aria-hidden="true">＋</span> New investigation
          </button>
        </div>
      </header>
      <ChatSession key={investigationId} investigationId={investigationId} />
    </div>
  );
}
