# DeployLens

**Live demo:** [deploylens.ayushanandhere.workers.dev](https://deploylens.ayushanandhere.workers.dev)

DeployLens helps developers investigate deployment failures without pretending that an AI guess is proof. A developer supplies symptoms and synthetic or redacted logs; DeployLens extracts line-referenced evidence deterministically, matches a small curated runbook when the signals are strong enough, keeps hypotheses visibly unconfirmed, records checks, and exports a Markdown handoff.

> Public demo: an investigation URL grants access to that investigation's chat, logs, and saved state. UUIDs separate investigations but are not authentication or authorization. Do not submit secrets, credentials, sensitive production logs, or other private data.

## Assignment requirements

| Requirement | Implementation |
| --- | --- |
| LLM | Real streamed Workers AI responses from `@cf/openai/gpt-oss-20b`, with bounded AI SDK tool steps and timeouts. |
| Coordination | Typed `analyzeLogs`, `lookupRunbook`, and `updateInvestigation` tools coordinate deterministic evidence, curated guidance, and model-generated hypotheses. |
| Chat input | React chat supports streamed responses, failures, follow-ups, log attachment, and three synthetic examples. |
| Persistent state | One Agents SDK Durable Object per investigation persists chat and compact investigation state; original log sources remain in that object's SQLite storage. |

## Try the demo

1. Open the live demo and select **Database connection failure**. Examples always open in a new investigation.
2. Select **Analyze**. The evidence board should cite lines 2–4, count the repeated `ECONNREFUSED` pattern three times, and match **Database connection failures**.
3. Select a `SOURCE:L#` reference to inspect the original numbered source.
4. Record a synthetic result for one suggested check, ask a follow-up, and reload the page.
5. Select **New investigation** to confirm it starts empty. Reopen the earlier URL to restore its separate state.
6. Select **Export Markdown** for a handoff generated from saved state without another model call.

The other examples cover a missing environment variable and an upstream timeout. DeployLens never executes suggested commands, fetches model-supplied URLs, or modifies infrastructure; checks are instructions for a human to evaluate.

## Architecture and safety boundary

- **React + Vite client:** streaming chat and an evidence panel are side by side on desktop and stack at mobile width.
- **Cloudflare Worker + Agents SDK:** `AIChatAgent` owns conversation history and resumable streams. One Durable Object instance is addressed by each investigation UUID.
- **Compact persisted state:** evidence, hypotheses, checks, open questions, runbook matches, and status use Agent state. Chat is not copied into a second store.
- **Log storage:** pasted source text stays server-side in the investigation's Durable Object SQLite database. State contains source metadata and bounded findings.
- **Deterministic evidence:** TypeScript parsing conservatively extracts timestamps, recognizable errors/codes, and repeated exact patterns while retaining unrecognized numbered lines. Limits are 80,000 characters, 2,000 lines, and 10 sources per investigation.
- **Curated matching:** three repository-owned runbooks use a small weighted matcher, explain matched signals, and allow an unmatched result. No embeddings or vector database are used.
- **Model tools:** the AI SDK bounds the tool loop to six steps. Runtime schemas, ownership checks, source-line validation, and state caps are enforced server-side. A narrow middleware recovers only forced tool calls that GPT-OSS emits as complete JSON or an empty argument object; normal prose is never reinterpreted as a tool call.
- **Validated public surface:** callable RPC arguments are validated at runtime. Generic client-to-server Agent state updates are rejected, so clients must use the validated methods. Server state broadcasts remain enabled.
- **Demo rate limits:** each investigation permits 12 model turns and 20 resource-creating updates per rolling 10 minutes, with a retry message. These are modest abuse guardrails, not account-wide protection; creating another investigation creates another Durable Object and limit bucket.
- **Deterministic export:** Markdown is generated from saved state and source excerpts without an additional model request.

Runtime model instructions are in `src/agent/system-prompt.ts`; runbooks are in `src/runbooks/catalog.ts`. Development prompts are kept separately in [PROMPTS.md](./PROMPTS.md).

## Local setup

Prerequisites:

- Node.js 22.12 or newer
- A Cloudflare account with Workers AI access
- Wrangler authenticated to that account

```bash
npm ci
npx wrangler login
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`. Local development uses the remote `AI` binding in `wrangler.jsonc`; there is no model API key or required `.env` file. Never add credentials to the repository.

## Verification

The reproducible local/CI check does not require Cloudflare credentials or paid model calls:

```bash
npm run check
```

This runs TypeScript, 31 deterministic tests across 9 files, and both Worker and client production builds. Tests cover source-line accuracy, repeated patterns, malformed/oversized/unmatched input, investigation ownership, structured state bounds, user-controlled resolution, Markdown export, runtime RPC validation, rate-limit decisions, and forced-tool provider regressions. GitHub Actions runs the same command after `npm ci` on pushes and pull requests with Node 22.

Production browser verification on 2026-09-20 confirmed:

- a fresh synthetic database example produced a real streamed Workers AI response;
- deterministic references cited lines 2–4, counted three repeated errors, and matched the database runbook from `postgres`, `5432`, and `econnrefused`;
- a source reference opened the original numbered log;
- a user-recorded synthetic check, investigation state, and real chat messages survived reload;
- a separate investigation had separate empty history, and reopening the original URL restored its evidence and result;
- a follow-up response used the preceding configuration-change context;
- Markdown downloaded with symptoms, excerpts, hypotheses, checks/results, questions, and unresolved status;
- the interface remained readable and operable at a 390 × 844 viewport;
- a raw WebSocket state overwrite was rejected, and a malformed RPC argument received a validation error.

## Deployment

Review `wrangler.jsonc`, authenticate Wrangler, run the full check, then deploy:

```bash
npm ci
npm run check
npx wrangler login
npm run deploy
```

`npm run deploy` builds first and preserves the configured Durable Object migration. The deployed Worker uses the account's Workers AI binding; do not place Cloudflare credentials in project files.

## Known limitations

- Investigation links are bearer-like public links, not user accounts or authenticated access control.
- Parsing is intentionally conservative and recognizes common deployment-log shapes rather than every format.
- Runbook lookup covers exactly three failure families; weak or tied signals remain unmatched.
- Model hypotheses and checks can be wrong and remain guidance for a developer to verify. Only the user can mark an investigation resolved.
- Per-investigation limits are suitable for a review demo, not a substitute for identity-based production abuse controls.
- Workers AI model output can vary. Provider edge cases are bounded and validated, but a failed model/tool turn may need a retry; saved evidence is retained.

ChatGPT helped draft the development prompts, and Codex assisted with implementation. The project follows Cloudflare's documented [Agents SDK](https://developers.cloudflare.com/agents/) and [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) patterns.
