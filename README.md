# DeployLens

DeployLens is an evidence-based assistant for investigating deployment failures. A developer can attach symptoms and pasted logs, inspect deterministic findings, discuss unconfirmed causes, record checks, and export a Markdown handoff. The application does not execute commands, fetch arbitrary URLs, or change infrastructure.

## Architecture

- **React + Vite client:** streaming chat and a responsive investigation panel, shown side by side on desktop and stacked on smaller screens.
- **One Durable Object per investigation:** the browser keeps a stable UUID in local storage and the `?investigation=` URL. Starting an investigation creates a new UUID; reopening an earlier URL restores that investigation.
- **Agents SDK persistence:** `AIChatAgent` owns chat history and resumable streams. Compact investigation state is stored separately with Agent state, so chat messages are not duplicated.
- **Stored log sources:** original pasted text is kept server-side in the investigation's Durable Object SQLite storage. Agent state stores only source metadata and compact derived findings. Source IDs and original line numbers remain stable.
- **Deterministic analysis:** conservative TypeScript parsing extracts timestamps, recognizable error lines and codes, repeated exact error patterns, and retains unrecognized lines. Server-side limits are 80,000 characters, 2,000 lines, and 10 sources per investigation.
- **Curated runbooks:** three repository-owned runbooks cover missing or invalid environment variables, database connections, and upstream connections/timeouts. A small weighted matcher reports the exact matching signals and permits an unmatched result; there are no embeddings or vector services.
- **Workers AI tools:** the existing `@cf/openai/gpt-oss-20b` integration is preserved. A bounded AI SDK tool sequence calls typed `analyzeLogs`, `lookupRunbook`, and `updateInvestigation` tools. Tool inputs are validated, source references must belong to the current investigation, model updates cannot set resolution status, and malformed tool arguments get a narrow schema-safe repair attempt.
- **Deterministic export:** Markdown is generated from saved state without another model call.

Runtime model instructions are in `src/agent/system-prompt.ts`. Curated runbooks live in `src/runbooks/catalog.ts`. Development prompt history remains separate in `PROMPTS.md`.

## Prerequisites and configuration

- Node.js 22.12 or newer
- A Cloudflare account with Workers AI access
- Wrangler authenticated to that account

Authenticate interactively without placing credentials in the repository:

```bash
npx wrangler login
```

Local development uses the remote Workers AI binding configured in `wrangler.jsonc`, so responses come from the real model. No model API key or `.env` value is required. The account subdomain is `ayushanandhere.workers.dev`; the application has not been deployed.

## Local startup

```bash
npm install
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`. If the shell selects an older Node installation, put a supported Node installation first on `PATH` before running npm.

## Example investigation

1. Choose one of the three **Synthetic examples**. Each opens in a new investigation and never overwrites the current one.
2. Select **Analyze** next to the attached source. DeployLens runs deterministic analysis, attempts a runbook match, updates the evidence board, and streams a response.
3. Select a `SOURCE:L#` reference to inspect the original numbered source line.
4. Enter what you observed for a suggested check, then continue the chat so hypotheses can be revised.
5. Only the user can **Mark resolved** or **Reopen** an investigation.
6. Select **Export Markdown** to download a saved-state handoff.

The examples demonstrate a missing environment variable, a refused database connection, and an upstream timeout. You can also attach redacted plain-text logs and a symptom description manually.

## Verification

Run the complete local suite with:

```bash
npm run check
```

Focused tests cover investigation identity and separation, safe error messages, source-line accuracy, repeated-error counts, empty/malformed/oversized/unmatched logs, deterministic runbook matching and non-matching, nonexistent and cross-investigation references, preservation of user-recorded results and user-controlled resolution, and Markdown export.

The latest `npm run check` completed successfully: TypeScript passed, all 19 tests across 6 files passed, and both Worker and client production builds completed.

Verified in a real local browser against Workers AI on 2026-09-20:

- A synthetic database incident invoked all three structured tools, cited the original error lines 2–4, counted the repeated `ECONNREFUSED` pattern three times, and matched the database runbook because `postgres`, `5432`, and `econnrefused` were present.
- A user-recorded check result survived follow-up discussion and reload. The panel revised its unconfirmed hypotheses and remained **Investigating**; the model could not resolve it.
- Streaming showed an active stop/loading state before the response completed. Actual user, assistant, tool-call, and tool-result message parts restored after reload.
- A new investigation opened with separate empty history. Reopening the original investigation URL restored its chat, source, findings, check result, questions, runbook match, and status.
- Clicking a source-line reference opened the original five numbered lines at the referenced line.
- **Export Markdown** downloaded a handoff containing symptoms, source excerpts and references, unconfirmed hypotheses, checks and the reported result, open questions, and unresolved status without a model call.
- An ambiguous three-line informational log produced zero recognizable errors, retained all three unrecognized lines, remained unmatched to a runbook, kept its possible cause explicitly unconfirmed, and asked for more evidence rather than asserting a root cause.

The application was not deployed during verification.

## Current limitations

- Parsing is intentionally conservative and tailored to common deployment-log shapes; unknown formats remain available as numbered source text but do not become facts automatically.
- Runbook lookup covers exactly three curated failure families. A weak or tied signal set remains unmatched.
- Model-generated hypotheses and suggested checks remain guidance that a developer must verify. User-reported check results are labeled separately from log evidence.
- The Workers AI provider can occasionally produce malformed tool arguments; DeployLens bounds tool steps and time, validates every update, attempts only safe schema repair, and preserves existing state when a tool fails.
- The production build currently emits Vite's advisory warning for a client chunk slightly over 500 kB.

ChatGPT helped draft the development prompts, and Codex assisted with implementation.
