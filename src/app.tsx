import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent
} from "react";
import type { UIMessage } from "ai";
import { MAX_INPUT_CHARACTERS } from "./agent/system-prompt";
import { SYNTHETIC_EXAMPLES } from "./examples";
import { getErrorMessage } from "./lib/errors";
import {
  createInitialInvestigationState,
  normalizeInvestigationState,
  type InvestigationState,
  type SourceLineReference
} from "./lib/investigation-state";
import {
  MAX_LOG_CHARACTERS,
  MAX_LOG_LINES
} from "./lib/log-analysis";
import type { DeployLensAgent } from "./server";

type SessionView = { kind: "demo" | "private"; expiresAt: number; githubConfigured: boolean };
type ListedInvestigation = { id: string; createdAt: number };

async function api<T>(path: string, method = "GET"): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: method === "GET" ? undefined : { "Content-Type": "application/json" }
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const error = data && typeof data === "object" && "error" in data && typeof data.error === "string"
      ? data.error : `Request failed (${response.status}).`;
    throw new Error(error);
  }
  return data as T;
}

type LogSourceDetail = Awaited<ReturnType<DeployLensAgent["getLogSource"]>>;

function messageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is Extract<typeof part, { type: "text" }> =>
      part.type === "text"
    )
    .map((part) => part.text)
    .join("");
}

function downloadMarkdown(markdown: string, investigationId: string) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `deploylens-${investigationId.slice(0, 8)}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser's download manager time to consume the object URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function InvestigationWorkspace({
  investigationId,
  pendingExampleId,
  onExampleLoaded,
  demo
}: {
  investigationId: string;
  pendingExampleId: string | null;
  onExampleLoaded: () => void;
  demo: boolean;
}) {
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [symptoms, setSymptoms] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [logText, setLogText] = useState("");
  const [attaching, setAttaching] = useState(false);
  const [observation, setObservation] = useState("");
  const [checkResults, setCheckResults] = useState<Record<string, string>>({});
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [selectedSource, setSelectedSource] = useState<LogSourceDetail | null>(null);
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [accessEnded, setAccessEnded] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const exampleAttempted = useRef<string | null>(null);

  const verifyAccess = useCallback(async () => {
    try {
      const response = await fetch(`/api/investigations/${encodeURIComponent(investigationId)}`, {
        credentials: "same-origin",
        cache: "no-store"
      });
      if (response.status === 401 || response.status === 404) {
        setSelectedSource(null);
        setAccessEnded(true);
      }
    } catch {
      // A network interruption is not evidence that access was revoked.
    }
  }, [investigationId]);

  const agent = useAgent<DeployLensAgent, InvestigationState>({
    agent: "DeployLensAgent",
    name: investigationId,
    shouldReconnectOnClose: (event) => event.code !== 4001,
    onOpen: useCallback(() => {
      setConnected(true);
      setLocalError(null);
    }, []),
    onClose: useCallback(() => {
      setConnected(false);
      void verifyAccess();
    }, [verifyAccess]),
    onError: useCallback((_error: Event) => {
      setLocalError(getErrorMessage(new Error("WebSocket connection failed")));
    }, []),
    onStateUpdateError: useCallback(() => {
      setLocalError(
        "Direct client state updates are disabled. Use the validated controls in the investigation panel."
      );
    }, [])
  });

  const { messages, sendMessage, stop, status, error } = useAgentChat({
    agent,
    experimental_throttle: 75
  });
  const investigation = normalizeInvestigationState(
    agent.state ?? createInitialInvestigationState()
  );
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    if (error) setLocalError(getErrorMessage(error));
  }, [error]);

  useEffect(() => {
    const onFocus = () => { if (!document.hidden) void verifyAccess(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [verifyAccess]);

  useEffect(() => {
    if (!symptoms && investigation.symptoms) {
      setSymptoms(investigation.symptoms);
    }
  }, [investigation.symptoms, symptoms]);

  useEffect(() => {
    if (
      !pendingExampleId ||
      !connected ||
      exampleAttempted.current === pendingExampleId
    ) {
      return;
    }
    exampleAttempted.current = pendingExampleId;
    agent.stub
      .loadExample(pendingExampleId)
      .then((result) => {
        setNotice(
          `Loaded ${result.source.label} as ${result.source.sourceId}. Ask DeployLens to analyze it.`
        );
        onExampleLoaded();
      })
      .catch((reason: unknown) => {
        setLocalError(reason instanceof Error ? reason.message : "Example could not be loaded.");
        onExampleLoaded();
      });
  }, [agent.stub, connected, onExampleLoaded, pendingExampleId]);

  useEffect(() => {
    if (!selectedSource || selectedLine === null) return;
    document
      .getElementById(`source-${selectedSource.sourceId}-line-${selectedLine}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedLine, selectedSource]);

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

  const attachLog = async (event: FormEvent) => {
    event.preventDefault();
    setAttaching(true);
    setLocalError(null);
    try {
      const result = await agent.stub.attachLog({
        label: sourceLabel,
        text: logText,
        symptoms
      });
      setSourceLabel("");
      setLogText("");
      setNotice(
        `Attached ${result.source.sourceId}. Deterministic parsing found ${result.analysisSummary.recognizableErrorLines} recognizable error line(s).`
      );
    } catch (reason) {
      setLocalError(
        reason instanceof Error ? reason.message : "The log source could not be attached."
      );
    } finally {
      setAttaching(false);
    }
  };

  const analyzeSource = (sourceId: string) => {
    if (busy) return;
    sendMessage({
      role: "user",
      parts: [
        {
          type: "text",
          text: `Analyze stored source ${sourceId} with the deterministic log tool, look up a matching curated runbook, update the investigation panel, and explain what evidence to collect next.`
        }
      ]
    });
  };

  const openSourceReference = async (reference: SourceLineReference) => {
    setLocalError(null);
    try {
      const detail = await agent.stub.getLogSource(reference.sourceId);
      setSelectedSource(detail);
      setSelectedLine(reference.line);
    } catch (reason) {
      setLocalError(
        reason instanceof Error ? reason.message : "The log source could not be opened."
      );
    }
  };

  const recordObservation = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await agent.stub.addUserObservation(observation);
      setObservation("");
      setNotice("User-reported observation saved.");
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : "Observation was not saved.");
    }
  };

  const recordResult = async (checkId: string) => {
    try {
      await agent.stub.recordCheckResult(checkId, checkResults[checkId] ?? "");
      setCheckResults((current) => ({ ...current, [checkId]: "" }));
      setNotice("Check result saved. Ask a follow-up to revise the hypotheses.");
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : "Check result was not saved.");
    }
  };

  const changeStatus = async () => {
    try {
      if (investigation.status === "resolved") {
        await agent.stub.setInvestigationStatus("investigating", "");
        setNotice("Investigation reopened.");
      } else {
        await agent.stub.setInvestigationStatus("resolved", resolutionSummary);
        setResolutionSummary("");
        setNotice("Investigation marked resolved by you.");
      }
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : "Status was not changed.");
    }
  };

  const exportMarkdown = async () => {
    setExporting(true);
    try {
      const markdown = await agent.stub.exportMarkdown(investigationId);
      downloadMarkdown(markdown, investigationId);
      setNotice("Markdown handoff exported from saved state without a model call.");
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  if (accessEnded) {
    return <main className="empty-state" role="alert">
      <h2>Investigation unavailable</h2>
      <p>This investigation was deleted or your session ended. Its saved content is no longer available to this tab. Reload to view your remaining investigations.</p>
    </main>;
  }

  return (
    <main className="workspace workspace-grid">
      <section className="chat-column">
        <div className="conversation" aria-live="polite">
          {messages.length === 0 ? (
            <div className="empty-state">
              <div className="lens-mark" aria-hidden="true"><span /></div>
              <p className="eyebrow">Investigation ready</p>
              <h2>Follow the evidence.</h2>
              <p>
                {demo ? "Choose a labeled synthetic example above, then ask DeployLens to analyze its stable source ID." : "Describe the symptom, attach a redacted log source, then ask DeployLens to analyze its stable source ID."}
              </p>
              <div className="guardrail">
                <span aria-hidden="true">i</span>
                Logs and tool output are untrusted evidence. DeployLens cannot
                run checks or change infrastructure.
              </div>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((message: UIMessage) => {
                const text = messageText(message);
                if (!text) return null;
                return (
                  <article className={`message message-${message.role}`} key={message.id}>
                    <div className="message-label">
                      {message.role === "user" ? "You" : "DeployLens"}
                    </div>
                    <div className="message-body">{text}</div>
                  </article>
                );
              })}
              {status === "submitted" && (
                <div className="thinking" role="status">
                  <span /><span /><span /> Reviewing evidence
                </div>
              )}
            </div>
          )}
          <div ref={endRef} />
        </div>

        <section className="composer-wrap">
          {localError && (
            <div className="error-banner" role="alert">
              <span>{localError}</span>
              <button onClick={() => setLocalError(null)} aria-label="Dismiss error">Dismiss</button>
            </div>
          )}
          {notice && (
            <div className="notice-banner" role="status">
              <span>{notice}</span>
              <button onClick={() => setNotice(null)} aria-label="Dismiss notice">Dismiss</button>
            </div>
          )}
          <form className="composer" onSubmit={submit}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={MAX_INPUT_CHARACTERS + 1}
              placeholder="Ask about the evidence or report a check result…"
              aria-label="Investigation message"
              disabled={busy}
              rows={3}
            />
            <div className="composer-footer">
              <span className={input.length > MAX_INPUT_CHARACTERS ? "over-limit" : ""}>
                {input.length.toLocaleString()} / {MAX_INPUT_CHARACTERS.toLocaleString()}
              </span>
              {busy ? (
                <button className="button-secondary" type="button" onClick={stop}>Stop</button>
              ) : (
                <button className="button-primary" type="submit" disabled={!input.trim() || !connected}>
                  Send <span aria-hidden="true">↗</span>
                </button>
              )}
            </div>
          </form>
          <p className="composer-note">AI guidance can be wrong. Verify checks before acting on production.</p>
        </section>
      </section>

      <aside className="investigation-panel" aria-label="Investigation panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Saved investigation</p>
            <h2>Evidence board</h2>
          </div>
          <span className={`status-chip status-${investigation.status}`}>
            {investigation.status === "resolved" ? "Resolved" : "Investigating"}
          </span>
        </div>

        {!demo && <details className="panel-card attach-card" open={investigation.sources.length === 0}>
          <summary>Attach pasted logs</summary>
          <form onSubmit={attachLog} className="stack-form">
            <label>
              Symptom description
              <textarea value={symptoms} onChange={(event) => setSymptoms(event.target.value)} rows={3} maxLength={4_000} placeholder="What failed, when, and after what change?" />
            </label>
            <label>
              Source label
              <input value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} maxLength={80} placeholder="api-worker.log" />
            </label>
            <label>
              Pasted log text
              <textarea value={logText} onChange={(event) => setLogText(event.target.value)} rows={7} maxLength={MAX_LOG_CHARACTERS + 1} placeholder="Paste redacted logs here…" />
            </label>
            <div className="form-meta">
              <span>{logText.length.toLocaleString()} / {MAX_LOG_CHARACTERS.toLocaleString()} chars · max {MAX_LOG_LINES.toLocaleString()} lines</span>
              <button className="button-primary" disabled={attaching || !connected || !sourceLabel.trim() || !logText.trim()}>
                {attaching ? "Attaching…" : "Attach log"}
              </button>
            </div>
          </form>
        </details>}
        {demo && <section className="panel-card"><h3>Demo sources</h3><p>Use a labeled synthetic example above. Pasted logs are disabled for anonymous sessions on the server.</p></section>}

        <section className="panel-card">
          <h3>Reported symptoms</h3>
          <p className={investigation.symptoms ? "" : "muted"}>
            {investigation.symptoms || "No symptom description recorded."}
          </p>
        </section>

        <section className="panel-card">
          <h3>Log sources</h3>
          {investigation.sources.length ? investigation.sources.map((source) => (
            <div className="source-row" key={source.sourceId}>
              <button className="source-open" onClick={() => openSourceReference({ sourceId: source.sourceId, line: 1 })}>
                <strong>{source.sourceId}</strong>
                <span>{source.label} · {source.lineCount} lines</span>
              </button>
              <button className="text-button" onClick={() => analyzeSource(source.sourceId)} disabled={busy}>Analyze</button>
            </div>
          )) : <p className="muted">No log sources attached.</p>}
        </section>

        <section className="panel-card">
          <h3>Observed log evidence</h3>
          {investigation.evidence.length ? (
            <ul className="panel-list">
              {investigation.evidence.map((item) => (
                <li key={item.id}>
                  <button className="reference-button" onClick={() => openSourceReference(item.reference)}>
                    {item.reference.sourceId}:L{item.reference.line}
                  </button>
                  <span>{item.summary}</span>
                  <small>{item.excerpt}</small>
                </li>
              ))}
            </ul>
          ) : <p className="muted">Run deterministic analysis to add referenced evidence.</p>}
        </section>

        <section className="panel-card">
          <h3>User-reported observations</h3>
          {investigation.userObservations.length > 0 && (
            <ul className="panel-list compact">
              {investigation.userObservations.map((item) => <li key={item.id}>{item.text}</li>)}
            </ul>
          )}
          <form onSubmit={recordObservation} className="inline-form">
            <input value={observation} onChange={(event) => setObservation(event.target.value)} placeholder="Record an observed fact…" maxLength={2_000} />
            <button disabled={!observation.trim()}>Save</button>
          </form>
        </section>

        <section className="panel-card">
          <h3>Hypotheses <span className="unconfirmed-label">Unconfirmed</span></h3>
          {investigation.hypotheses.length ? (
            <ul className="panel-list compact">
              {investigation.hypotheses.map((item) => <li key={item.id}>{item.text}</li>)}
            </ul>
          ) : <p className="muted">No hypotheses recorded.</p>}
        </section>

        <section className="panel-card">
          <h3>Suggested checks and results</h3>
          {investigation.checks.length ? investigation.checks.map((check) => (
            <div className="check-item" key={check.id}>
              <p><span aria-hidden="true">{check.status === "completed" ? "✓" : "○"}</span> {check.description}</p>
              {check.status === "completed" ? (
                <small><strong>User-reported:</strong> {check.result}</small>
              ) : (
                <div className="inline-form">
                  <input value={checkResults[check.id] ?? ""} onChange={(event) => setCheckResults((current) => ({ ...current, [check.id]: event.target.value }))} placeholder="What did you observe?" maxLength={4_000} />
                  <button onClick={() => recordResult(check.id)} disabled={!checkResults[check.id]?.trim()}>Record</button>
                </div>
              )}
            </div>
          )) : <p className="muted">No checks suggested yet.</p>}
        </section>

        <section className="panel-card">
          <h3>Open questions</h3>
          {investigation.openQuestions.length ? (
            <ul className="panel-list compact">
              {investigation.openQuestions.map((item) => <li key={item.id}>{item.text}</li>)}
            </ul>
          ) : <p className="muted">No open questions recorded.</p>}
        </section>

        <section className="panel-card">
          <h3>Runbook match</h3>
          {investigation.runbookMatches.length ? investigation.runbookMatches.map((match) => (
            <div key={match.runbookId}>
              <strong>{match.title}</strong>
              <p className="muted">Matched: {match.matchedSignals.join(", ")}</p>
            </div>
          )) : <p className="muted">Unmatched is allowed; more evidence may be needed.</p>}
        </section>

        <section className="panel-card status-card">
          <h3>Resolution and handoff</h3>
          {investigation.status === "resolved" ? (
            <p><strong>User-marked resolution:</strong> {investigation.resolutionSummary}</p>
          ) : (
            <textarea value={resolutionSummary} onChange={(event) => setResolutionSummary(event.target.value)} rows={3} maxLength={2_000} placeholder="Resolution summary (required to mark resolved)" />
          )}
          <div className="panel-actions">
            <button className="button-secondary" onClick={changeStatus} disabled={investigation.status !== "resolved" && !resolutionSummary.trim()}>
              {investigation.status === "resolved" ? "Reopen investigation" : "Mark resolved"}
            </button>
            <button className="button-primary" onClick={exportMarkdown} disabled={exporting}>
              {exporting ? "Exporting…" : "Export Markdown"}
            </button>
          </div>
        </section>

        {selectedSource && (
          <section className="panel-card source-viewer">
            <div className="source-viewer-heading">
              <div><h3>{selectedSource.label}</h3><small>{selectedSource.sourceId}</small></div>
              <button className="text-button" onClick={() => setSelectedSource(null)}>Close</button>
            </div>
            <ol>
              {selectedSource.lines.map((line) => (
                <li id={`source-${selectedSource.sourceId}-line-${line.line}`} className={line.line === selectedLine ? "selected-line" : ""} key={line.line} value={line.line}>
                  <code>{line.text || " "}</code>
                </li>
              ))}
            </ol>
          </section>
        )}
      </aside>
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState<SessionView | null>(null);
  const [investigations, setInvestigations] = useState<ListedInvestigation[]>([]);
  const [investigationId, setInvestigationId] = useState<string | null>(null);
  const [pendingExampleId, setPendingExampleId] = useState<string | null>(null);
  const [appError, setAppError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);

  const selectInvestigation = useCallback((id: string, replace = false) => {
    const url = new URL(window.location.href);
    url.searchParams.set("investigation", id);
    window.history[replace ? "replaceState" : "pushState"](null, "", url);
    setInvestigationId(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        const current = await api<SessionView>("/api/session");
        const listed = await api<{ investigations: ListedInvestigation[] }>("/api/investigations");
        if (cancelled) return;
        setSession(current);
        setInvestigations(listed.investigations);
        const requestedId = new URLSearchParams(window.location.search).get("investigation");
        let requested = listed.investigations.find((item) => item.id === requestedId)?.id;
        if (requestedId && !requested) {
          try {
            await api(`/api/investigations/${encodeURIComponent(requestedId)}`);
            requested = requestedId;
            setInvestigations((current) => [{ id: requestedId, createdAt: 0 }, ...current]);
          } catch {
            setAppError("That investigation is unavailable to this session. Legacy public URLs are not automatically claimed or migrated.");
          }
        }
        const existing = requested ?? listed.investigations[0]?.id;
        if (existing) selectInvestigation(existing, true);
        else {
          const created = await api<{ id: string }>("/api/investigations", "POST");
          if (cancelled) return;
          setInvestigations([{ id: created.id, createdAt: Date.now() }]);
          selectInvestigation(created.id, true);
        }
      } catch (error) {
        if (!cancelled) setAppError(getErrorMessage(error));
      } finally { if (!cancelled) setBooting(false); }
    };
    void boot();
    return () => { cancelled = true; };
  }, [selectInvestigation]);

  const beginNewInvestigation = async (exampleId: string | null = null) => {
    setAppError(null);
    try {
      const created = await api<{ id: string }>("/api/investigations", "POST");
      setInvestigations((current) => [{ id: created.id, createdAt: Date.now() }, ...current]);
      setPendingExampleId(exampleId);
      selectInvestigation(created.id);
    } catch (error) { setAppError(getErrorMessage(error)); }
  };

  const deleteInvestigation = async () => {
    if (!investigationId || session?.kind !== "private") return;
    if (!window.confirm("Permanently delete this investigation, including its messages, logs, and saved evidence?")) return;
    try {
      await api(`/api/investigations/${investigationId}`, "DELETE");
      const remaining = investigations.filter((item) => item.id !== investigationId);
      setInvestigations(remaining);
      if (remaining[0]) selectInvestigation(remaining[0].id, true);
      else { setInvestigationId(null); await beginNewInvestigation(); }
    } catch (error) { setAppError(getErrorMessage(error)); }
  };

  const logout = async () => {
    try { await api("/api/logout", "POST"); window.location.assign("/"); }
    catch (error) { setAppError(getErrorMessage(error)); }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="DeployLens home">
          <span className="brand-icon" aria-hidden="true">D</span>
          <span><strong>DeployLens</strong><small>Evidence-based deployment investigator</small></span>
        </a>
        <div className="example-actions" aria-label="Synthetic examples">
          {SYNTHETIC_EXAMPLES.map((example) => (
            <button key={example.id} className="example-button" title={`${example.description}. Opens in a new investigation.`} onClick={() => beginNewInvestigation(example.id)}>
              {example.title}
            </button>
          ))}
        </div>
        <div className="topbar-actions">
          {session?.kind === "demo" ? (session.githubConfigured ? <a className="new-button" href="/auth/github">Continue with GitHub</a> : <button className="new-button" disabled title="GitHub OAuth is not configured">GitHub sign-in pending setup</button>) : <button className="text-button" onClick={logout}>Log out</button>}
          {investigations.length > 1 && <select aria-label="Open investigation" value={investigationId ?? ""} onChange={(event) => selectInvestigation(event.target.value)}>{investigations.map((item) => <option value={item.id} key={item.id}>{item.id.slice(0, 8)}</option>)}</select>}
          {investigationId && <div className="connection-state" title={investigationId}>Investigation {investigationId.slice(0, 8)}</div>}
          <button className="new-button" onClick={() => void beginNewInvestigation()} disabled={!session}><span aria-hidden="true">＋</span> New investigation</button>
          {session?.kind === "private" && <button className="text-button" onClick={() => void deleteInvestigation()} disabled={!investigationId}>Delete</button>}
        </div>
      </header>
      <div className="demo-boundary" role="note">
        {session?.kind === "private" ? <><strong>Private investigation:</strong> access is tied to your GitHub account. Keep logs redacted; platform logs may retain metadata after deletion.</> : <><strong>Try the demo:</strong> no sign-in required. Only bundled synthetic logs are accepted. This browser session expires {session ? new Date(session.expiresAt).toLocaleString() : "after 48 hours"}; do not submit sensitive information.</>}
      </div>
      {appError && <div className="error-banner" role="alert">{appError}</div>}
      {booting && <main className="empty-state">Opening your investigation…</main>}
      {!booting && investigationId && session && <InvestigationWorkspace
        key={investigationId}
        investigationId={investigationId}
        pendingExampleId={pendingExampleId}
        onExampleLoaded={() => setPendingExampleId(null)}
        demo={session.kind === "demo"}
      />}
    </div>
  );
}
