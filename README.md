# DeployLens

DeployLens is an AI assistant for investigating deployment failures. This first milestone establishes a working, persistent chat foundation on Cloudflare Workers; deterministic log analysis, curated runbooks, and Markdown handoff export are intentionally deferred.

## Architecture

- **React + Vite client:** a focused chat interface with streaming, connection/loading/error states, input limits, and a **New investigation** action.
- **Cloudflare Agents SDK:** the browser stores only a stable investigation UUID, also reflected in the `?investigation=` URL so a prior investigation can be reopened directly. That UUID selects one `DeployLensAgent` Durable Object per investigation.
- **`AIChatAgent` persistence:** chat messages and resumable stream data live once in the Durable Object's SQLite storage. Reloading reconnects to the same instance; starting a new investigation creates a separate instance and empty history.
- **Workers AI:** responses stream from `@cf/openai/gpt-oss-20b` through a server-side AI binding. Llama 3.3 was evaluated first, but the current provider duplicated its streamed text chunks during live testing; `gpt-oss-20b` produced clean streams on this account.
- **No operational tools:** pasted logs are prompt data, not instructions. The agent has no command execution, file access, or infrastructure mutation capabilities.

Runtime instructions are in `src/agent/system-prompt.ts`. Development prompt history is kept separately in `PROMPTS.md`.

## Prerequisites

- Node.js 22.12 or newer
- A Cloudflare account with Workers AI access
- Wrangler authenticated to that account

The Cloudflare account used for this milestone has the personal account subdomain `ayushanandhere.workers.dev`. Registering it did not deploy this application.

Authenticate interactively without placing credentials in this repository:

```bash
npx wrangler login
```

The development configuration uses a remote Workers AI binding so responses come from the real model. No model API key or `.env` value is required.

## Local startup

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). If your shell selects an older Node installation, put your supported Node installation first on `PATH` before running npm.

## Verification

```bash
npm run typecheck
npm test
npm run build
```

The focused unit tests cover stable investigation reuse, URL-based reopening, separation when starting a new investigation, malformed-ID rejection, and safe actionable error messages.

Verified locally against real Workers AI on 2026-09-20:

- The response appeared incrementally while the UI exposed its loading/stop state, then completed cleanly.
- The actual user and assistant messages returned after a browser reload.
- A follow-up correctly recalled the supplied incident marker and failed endpoint without claiming to have run a check; all four messages survived another reload.
- **New investigation** generated a different UUID and opened with empty history. Its separate conversation persisted after reload and did not contain the first incident.
- Opening the original `?investigation=<uuid>` URL restored its original conversation and follow-up.
- `npm run check` passed TypeScript, 8 focused tests, and the production build. The build reports only Vite's advisory warning for a client chunk over 500 kB.

These checks used the remote AI binding during local development. The application itself was not deployed.

## Milestone scope

Implemented now: repository setup, chat UI, Workers AI streaming, Durable Object conversation persistence, investigation separation, diagnostic runtime instructions, limits, and failure states.

Deferred to the next milestone: deterministic line-referenced log analysis, environment/database/upstream runbooks, richer investigation state, and Markdown handoff export.

ChatGPT helped draft the development prompts, and Codex assisted with implementation.
