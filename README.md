# DeployLens

**Current live demo:** [deploylens.ayushanandhere.workers.dev](https://deploylens.ayushanandhere.workers.dev). It still runs release `3b1ccd0`; the private-investigation changes on this branch are **not deployed**.

DeployLens helps developers investigate failed deployments without treating an AI guess as proof. It extracts line-referenced findings from logs, checks three curated runbooks, keeps hypotheses visibly unconfirmed, records human checks, and exports a Markdown handoff.

| Assignment requirement | Implementation |
| --- | --- |
| LLM | Real streamed Workers AI responses from `@cf/openai/gpt-oss-20b`, with bounded tool steps and timeouts. |
| Coordination | Typed log-analysis, runbook-lookup, and investigation-update tools join deterministic findings with AI guidance. |
| Chat input | React chat supports follow-ups, streaming, errors, and log/source controls. |
| Persistent state | One Agents SDK SQLite Durable Object per investigation stores chat, compact state, and original log sources. |

## Using the app

Select **Try the demo** by opening the landing URL without signing in, then choose a labeled synthetic example such as **Database connection failure**. The example opens in a new investigation. Select **Analyze** to see cited source lines and a deterministic runbook match. Record a check result, ask a follow-up, reload, and export a Markdown handoff. The three examples cover an environment variable, a database connection, and an upstream timeout.

The anonymous demo accepts **only bundled synthetic log sources**; direct RPC attempts to attach arbitrary logs are rejected. Demo chat and check-result text can still be entered, so do not type secrets or sensitive incident details. A server-issued, host-only session cookie separates visitors; its investigations expire **48 hours after session creation**, not 48 hours after the last visit. Anyone with that browser session can access its demo history. Private investigations require GitHub sign-in and are bound to GitHub's stable numeric user ID, not to a URL or username.

## Architecture and access

- React/Vite client: chat and evidence panel side by side on desktop, stacked on mobile. The client receives no OAuth token or Worker secret.
- Worker: handles GitHub OAuth, sessions, investigation creation/listing/deletion, same-origin mutation checks, and the Agent route gate.
- `DeployLensControl`: singleton SQLite Durable Object for hashed opaque sessions, one-use OAuth state and PKCE verifier, ownership/lifecycle records, and creation limits. Only server-created UUIDs enter its registry.
- `DeployLensQuota`: separate singleton SQLite Durable Object for atomic daily model-request accounting. If it is unavailable, new inference fails closed; the independent ownership registry can still authorize reads, exports, and deletion.
- `DeployLensAgent`: one Agents SDK Durable Object per investigation. Chat stays in SDK-managed persistence; compact evidence/check state and original log sources stay with that Agent. The Worker rejects unauthorized HTTP/WebSocket upgrades before SDK state is sent. The Agent revalidates each WebSocket frame before SDK chat/RPC dispatch, and each callable and model/tool step checks again. Generic client state updates remain rejected.

GitHub OAuth uses [`oauth4webapi`](https://github.com/panva/oauth4webapi), a maintained Web API-based OAuth library that explicitly supports Cloudflare Workers. It handles the authorization-code exchange and protocol validation. DeployLens adds one-use state storage, PKCE, and an opaque server-side session. Cookies are `HttpOnly`, host-only, `SameSite=Lax`, and `Secure` on HTTPS. Mutating API requests and WebSocket upgrades require an exact same-origin `Origin`. Logout revokes the session and asks known Agent connections to close; scheduled Agent callbacks do the same at session expiry. Every incoming frame is reauthorized even if a transport remains open. Ownership is never taken from a client field.

No suggested check is executed by DeployLens. Logs and tool results are untrusted data; the app does not fetch arbitrary URLs or change infrastructure.

## Limits

Defaults live in `wrangler.jsonc` and can be changed as Worker vars. All daily windows reset at 00:00 UTC. These are **model-request limits**, not guaranteed monetary spending caps; provider pricing and billing are outside the app.

| Limit | Default |
| --- | ---: |
| Per investigation | 12 model turns and 20 resource updates per rolling 10 minutes |
| Per authenticated GitHub user | 80 model invocations/day across all sessions and investigation IDs |
| Per demo session | 12 model invocations/day (`DEMO_SESSION_MODEL_DAILY`); 8 new investigations/day (`DEMO_INVESTIGATIONS_DAILY`) |
| Shared anonymous demo | 240 model invocations/day (`DEMO_SHARED_MODEL_DAILY`); 500 new investigations/day (`DEMO_SHARED_INVESTIGATIONS_DAILY`) |
| Shared demo session creation | 1,000 new browser sessions/day (`DEMO_SESSIONS_DAILY`) |
| Application-wide | 500 model invocations/day |
| Private investigation creation | 30 new investigations/day per GitHub user (`PRIVATE_INVESTIGATIONS_DAILY`) |
| Demo expiry | 48 hours from session creation (`DEMO_TTL_HOURS`) |
| Private session expiry | 14 days (`PRIVATE_SESSION_DAYS`) |

`INFERENCE_ENABLED="false"` disables new model invocations without blocking saved data. Every provider invocation, including a tool-loop step, is charged before the provider call. Automatic model retries are disabled (`maxRetries: 0`), so there are no hidden uncounted retries. Quota increments are atomic and never automatically refunded after an ambiguous failure. Existing input, source-size, persisted-message, tool-step, output-token, and timeout bounds remain in place. Changing these request limits does not change Cloudflare billing settings.

## Local setup

Requires Node.js **22.12+**, npm, and a Cloudflare account with Workers AI access for live model calls. Routine checks use deterministic substitutes and need no credentials.

```bash
npm ci
npm run check
npm run dev
```

Open the Vite URL (normally `http://localhost:5173`). The bundled demo works without GitHub OAuth configuration. Live Workers AI calls require a valid Wrangler login and the configured remote AI binding (`npx wrangler login`). Never commit `.dev.vars`, `.env`, `.wrangler/`, `dist/`, or credentials.

To test private sign-in locally, register a **separate development GitHub OAuth app** at GitHub Developer Settings → OAuth Apps → New OAuth App. Set its homepage to `http://localhost:5173/` and callback to **`http://localhost:5173/auth/github/callback`**. Copy `.dev.vars.example` to ignored `.dev.vars` and fill `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` there. Set `PUBLIC_ORIGIN="http://localhost:5173"`. Do not paste those values into chat or commit them. Use one local hostname consistently; `127.0.0.1` is not interchangeable with `localhost` for this callback/cookie flow.

For the eventual production release, register a production GitHub OAuth app with homepage **`https://deploylens.ayushanandhere.workers.dev/`** and callback **`https://deploylens.ayushanandhere.workers.dev/auth/github/callback`**. Configure the Worker secrets named **`GITHUB_CLIENT_ID`** and **`GITHUB_CLIENT_SECRET`** server-side when that release is approved. `PUBLIC_ORIGIN` already points to the production origin in `wrangler.jsonc`. Be aware that `wrangler secret put` immediately creates/deploys a Worker version; do **not** run it for this unmerged branch. No production OAuth secret has been configured by this milestone.

After approval and configuration, the usual deployment command is `npm run deploy`; it builds first and preserves migration `v1` for investigation Agents while adding `v2` for the control and quota Durable Objects. This branch has **not** been deployed.

## Deletion, expiry, and legacy URLs

An authenticated owner can confirm **Delete**. The registry first tombstones the ID, rejecting stale HTTP/WS/RPC/tool/model activity and preventing a reused URL from recreating the record. The Agent then closes connections and calls the installed SDK's `destroy()` lifecycle API to remove its chat, state, logs, scheduled work, and SQLite storage; a failed cleanup stays tombstoned and is retried by a Durable Object alarm. Deleted records disappear from listings, while the minimal tombstone remains to prevent reuse. Demo session expiry follows the same deny-before-cleanup ordering, with a control-DO alarm and retry. Deletion cannot erase Cloudflare platform logs, telemetry, or platform-managed recovery backups that may persist under Cloudflare's retention policies.

**Migration warning before deployment:** release `3b1ccd0` investigations used bearer-like UUID URLs. Their ownership cannot be inferred. This branch deliberately does **not** assign them to the first visitor, list them, or automatically delete them. Their old URLs become inaccessible under the new route gate; the underlying Durable Object data remains untouched. A future, separately approved proof-of-ownership/migration or retention process would be needed. Do not deploy this branch expecting old URL continuity.

## Verification and limitations

`npm run check` runs TypeScript, deterministic Vitest tests, and the production Worker/client build. GitHub Actions runs it on pushes and pull requests with Node 22 and no Cloudflare credentials. Focused tests cover owner/demo separation, unauthenticated and expired sessions, HTTP/Agent route and WebSocket-upgrade checks, cross-site requests, deletion tombstones, direct demo attachment policy, and shared quota keys/concurrent consumption. The original parsing, runbook, state, and export tests remain.

Local checks on 2026-09-21: a real streamed Workers AI response to the synthetic database example produced source references for lines 2–4, a three-occurrence repeated error, and the database runbook match. The actual assistant messages and panel state restored after reload. A second synthetic environment-variable example also streamed with the new shared quota path; a recorded check result informed a follow-up response, and both survived reload. Opening a new investigation gave empty history, while reopening the original restored its chat and evidence. Separate server-issued demo sessions received distinct histories; direct source retrieval with the other session returned 404, and unauthenticated access returned 401. A direct demo `attachLog` RPC returned the intended restriction error. After logout, a stale session could not read or get an RPC export response. Markdown export returned a success notice from saved state, but the in-app browser did not surface a download event, so the file-download step remains unverified on this branch. A narrow-viewport DOM check showed no horizontal document overflow. In local Vite development, the raw WebSocket client's close handshake did not complete promptly despite the Agent reporting that it issued close; this needs production verification. These checks were against local development, **not production**. GitHub OAuth with two real accounts, live private deletion, and 48-hour expiry cannot be end-to-end verified until the OAuth apps/secrets are configured and this branch is deployed; deterministic tests cover their access decisions and tombstone behavior. The earlier production verification applies only to release `3b1ccd0`.

Parsing remains conservative, runbooks cover only three incident families, model hypotheses can be wrong, and only the user may mark an investigation resolved. GitHub account authorization protects private investigations but does not replace organizational identity/access governance. Recent listings are capped at 100 items; an older owned investigation can still be opened by its URL.

Runtime model instructions are in `src/agent/system-prompt.ts`; development history is in [PROMPTS.md](./PROMPTS.md). ChatGPT helped draft the development prompts, and Codex assisted with implementation. Any required license notices from reused packages remain in their upstream packages.
