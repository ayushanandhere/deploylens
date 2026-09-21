# DeployLens

**Live demo:** [deploylens.ayushanandhere.workers.dev](https://deploylens.ayushanandhere.workers.dev). The private-investigation milestone is deployed from commit `7c666536c9256d7718f7126f63a5727288fe1502` as Worker version `a6d251f7-f95d-491c-831a-aec9f903c9c5` on 2026-09-21. Draft PR #1 remains unmerged.

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
- `DeployLensAgent`: one Agents SDK Durable Object per investigation. Chat stays in SDK-managed persistence; compact evidence/check state and original log sources stay with that Agent. The Worker rejects unauthorized HTTP/WebSocket upgrades before SDK state is sent. The Agent revalidates each WebSocket frame before SDK chat/RPC dispatch; callables, tools, and each provider invocation recheck server-side access. Generic client state updates remain rejected.

The authorization boundary covers `/api/investigations` creation/listing and owner-only deletion, the investigation-detail HTTP route, every `/agents/deploy-lens-agent/:id/*` HTTP path (including SDK message/source/export paths), the WebSocket upgrade, and each subsequent RPC/chat/state frame. Source retrieval and Markdown export are authorized callables, not separate unauthenticated URLs. Control records use the stable `github:<numeric id>`; client-supplied owner fields and known UUIDs are ignored. Cross-site mutations and WebSocket upgrades fail the same-origin check. An expired or revoked session is re-resolved on existing sockets; a scheduled Agent callback closes them at expiry.

GitHub OAuth uses [`oauth4webapi`](https://github.com/panva/oauth4webapi), a maintained Web API-based OAuth library that explicitly supports Cloudflare Workers. It handles the authorization-code exchange and protocol validation against [GitHub's published issuer](https://docs.github.com/en/apps/github-authentication-discovery-endpoints). DeployLens adds one-use state storage, PKCE, and an opaque server-side session. GitHub's access token is used once to read the stable user ID, then discarded; an OAuth app configured for [expiring access tokens](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#expiring-access-tokens) therefore needs no refresh-token storage for this app. The DeployLens session has its own 14-day expiry; revoking GitHub authorization does not immediately revoke an already-issued DeployLens session. Cookies are `HttpOnly`, host-only, `SameSite=Lax`, and `Secure` on HTTPS. Mutating API requests and WebSocket upgrades require an exact same-origin `Origin`. Logout revokes the session and asks known Agent connections to close; scheduled Agent callbacks do the same at session expiry. Every incoming frame is reauthorized even if a transport remains open. Ownership is never taken from a client field.

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
| Demo expiry | 48 hours from session creation (`DEMO_TTL_HOURS`); fractional hours are accepted only with a local `http://localhost` or `http://127.0.0.1` origin for expiry testing |
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

Cloudflare's Vite plugin [copies `.dev.vars` into build output for local preview](https://developers.cloudflare.com/workers/vite-plugin/reference/secrets/), although that file is not deployed with the Worker. This repository's `npm run build` removes the copied file from `dist/deploylens/` after Vite finishes; use `npm run dev` for local OAuth testing. The source `.dev.vars` stays in place and ignored by Git.

To test private sign-in locally, register a **separate development GitHub OAuth app** at GitHub Developer Settings → OAuth Apps → New OAuth App. Set its homepage to `http://localhost:5173/` and callback to **`http://localhost:5173/auth/github/callback`**. Copy `.dev.vars.example` to ignored `.dev.vars` and fill `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` there. Set `PUBLIC_ORIGIN="http://localhost:5173"`. Do not paste those values into chat or commit them. Use one local hostname consistently; `127.0.0.1` is not interchangeable with `localhost` for this callback/cookie flow.

The separate production GitHub OAuth app was registered under the intended owner at GitHub Developer Settings → OAuth Apps with:

| Field | Exact value |
| --- | --- |
| Application name | `DeployLens Production` (or another distinct label) |
| Homepage URL | `https://deploylens.ayushanandhere.workers.dev/` |
| Authorization callback URL | `https://deploylens.ayushanandhere.workers.dev/auth/github/callback` |
| Callback wildcard matching | Off |
| Expire user access tokens | On (supported; token is used once and discarded) |
| Device flow | Off; no additional OAuth scopes are requested |

The Worker uses **`GITHUB_CLIENT_ID`** and **`GITHUB_CLIENT_SECRET`** as secrets, never as `vars`. `PUBLIC_ORIGIN` is `https://deploylens.ayushanandhere.workers.dev` in `wrangler.jsonc` and matches the callback origin. Both production secrets were uploaded alongside the approved code; their values are not in the repository or documentation. The former deployed version was `37574fb4-a9fe-461e-aec5-ffd4ab56b85a`.

The approved deployment used a user-owned (`0600`) `.env`-format file **outside this repository** and uploaded code and secrets together. For a future release, replace the placeholder path below with the absolute path to a protected production secrets file; never print its contents or commit it:

```bash
npm ci
npm run check
npx wrangler deployments list --name deploylens
npm run build
npx wrangler deploy --secrets-file /absolute/private/path/deploylens-production.env
```

`wrangler secret put` was not used because [it deploys a new version immediately](https://developers.cloudflare.com/workers/configuration/secrets/). The approved deploy retained `v1` for `DeployLensAgent` and applied `v2` for `DeployLensControl` and `DeployLensQuota`; do not remove these bindings or migration tags.

## Deletion, expiry, and legacy URLs

An authenticated owner can confirm **Delete**. The registry first tombstones the ID, rejecting stale HTTP/WS/RPC/tool/model activity and preventing a reused URL from recreating the record. The Agent closes connections, aborts active work, and asks the installed SDK to durably schedule `destroy()` in a fresh alarm invocation; that lifecycle call removes chat, state, logs, scheduled work, and SQLite storage. The deletion response acknowledges scheduled cleanup, not a synchronous proof that storage has already been wiped. If scheduling fails, the denying tombstone remains and a Control alarm retries. Deleted records disappear from listings, while the minimal tombstone remains to prevent reuse. Demo session expiry follows the same deny-before-cleanup ordering. Deletion cannot erase Cloudflare platform logs, telemetry, or platform-managed recovery backups that may persist under Cloudflare's retention policies.

**Migration warning before deployment:** release `3b1ccd0` investigations used bearer-like UUID URLs. Their ownership cannot be inferred. This branch deliberately does **not** assign them to the first visitor, list them, or automatically delete them. Their old URLs become inaccessible under the new route gate; the underlying Durable Object data remains untouched. A future, separately approved proof-of-ownership/migration or retention process would be needed. Do not deploy this branch expecting old URL continuity.

## Verification and limitations

`npm run check` runs TypeScript, deterministic Vitest tests, and the production Worker/client build. GitHub Actions runs it on pushes and pull requests with Node 22 and no Cloudflare credentials. The forward-fix passed typecheck, **53 tests**, and build locally; three new tests cover teardown ordering, unsettled turns, and scheduler failure. Focused tests also cover owner/demo separation, unauthenticated and expired sessions, HTTP/Agent route and WebSocket-upgrade checks, cross-site requests, deletion tombstones, direct demo attachment policy, shared quota keys/concurrent consumption, GitHub's callback issuer, and expiring-token parsing. The original parsing, runbook, state, and export tests remain.

Local checks on 2026-09-21: a real streamed Workers AI response to the synthetic database example produced source references for lines 2–4, a three-occurrence repeated error, and the database runbook match. The actual assistant messages and panel state restored after reload. A second synthetic environment-variable example also streamed with the new shared quota path; a recorded check result informed a follow-up response, and both survived reload. Opening a new investigation gave empty history, while reopening the original restored its chat and evidence. Separate server-issued demo sessions received distinct histories; direct source retrieval with the other session returned 404, and unauthenticated access returned 401. A direct demo `attachLog` RPC returned the intended restriction error. After logout, a stale session could not read or get an RPC export response. A narrow-viewport DOM check showed no horizontal document overflow. In local Vite development, the raw WebSocket client's close handshake did not complete promptly despite the Agent reporting that it issued close; this needs production verification. These checks were against local development, **not production**. The earlier production verification applies only to release `3b1ccd0`.

Additional local pre-merge checks: Brave completed an actual Markdown download (2,070 bytes); inspection confirmed the saved symptoms, log excerpts and line references, repeated-error count, unconfirmed hypothesis, checks, open questions, and unresolved status. In an isolated local Wrangler persistence directory, a 72-second anonymous session expired: its old cookie received 401, the control record became `expired`, the Agent SQLite database had no remaining tables, and a new 48-hour demo session received 404 for the old URL. A separate 18-second local session closed its live WebSocket with code 4001 at expiry; a pre-expiry RPC succeeded, while no post-expiry RPC response arrived and stale HTTP received 401. The checked-in default stayed at 48 hours.

Private-deletion behavior was first exercised with **synthetic private-session records injected only into isolated local Wrangler storage**. A source read and RPC export succeeded before deletion. Five concurrent observation-update RPCs were sent as deletion began; deletion returned 200, the socket closed with code 4001, no late export response arrived, the old Agent HTTP path and investigation URL returned 404, the listing omitted the ID, and the deleted Agent's storage had no rows. A separate test deleted an investigation during a **real Workers AI tool loop** after streaming began; the socket closed, no further frames arrived, the old URL returned 404, and Agent storage remained empty.

Real GitHub sign-in was then completed in normal Brave with the development OAuth app, whose token expiration the owner reported as enabled. The first callback revealed an incorrect issuer; after correcting it to GitHub's published issuer, sign-in succeeded. The access token was used for identity lookup and discarded; an independent private session remained valid through reload. A deterministic callback test supplies `expires_in` and a refresh token; the live token response was deliberately not logged or retained, and an eight-hour expiry was not time-tested. A private investigation accepted a pasted synthetic source, reopened its original four lines, streamed Workers AI analysis, preserved the actual assistant message and evidence on reload, appeared in the owned-investigation list, and remained separate from a new empty investigation. Brave downloaded a 2,216-byte private Markdown handoff into Downloads; its symptoms, excerpts, line references, repeated-error count, unconfirmed hypothesis, checks, questions, and unresolved status were inspected. Logout returned Brave to a new anonymous demo session, and reopening the former private URL was denied. A direct request to the local Vite server for `/.dev.vars` returned 403; after `npm run build`, neither the copied file nor its secret content remained in `dist/`.

A **literal two-tab Brave test** deleted a synthetic private investigation while the other tab had a real model response in flight. The deleting tab moved to another owned investigation; stale source/export requests did not return data, and reloading the old URL redirected away without recreating it. The second tab initially retained already-rendered content in memory; the client now revalidates access on socket close/focus and replaces that content with an unavailable message when the server returns 401/404. A repeat two-tab test verified the content was hidden without reload. The Agent began aborting and draining active chat work, which removed the earlier task-run finalizer error, but local Vite still logged an SDK keep-alive alarm reschedule error after inline `destroy()` deleted its tables. This was a local observation; the production defect and forward-fix are recorded below. Previously downloaded files and browser caches cannot be remotely erased by deletion.

The 2026-09-21 release-readiness review confirmed that the deterministic fixtures use **different provider IDs**, `github:101` and `github:202`; the second account cannot pass HTTP/Agent routes, WebSocket upgrade, listing, source/export paths, or deletion. These fixtures are not a real two-account OAuth test. In an isolated local Wrangler store, a synthetic private session's expiry was shortened to about 50 seconds by changing only its local storage row. An already-open WebSocket received close code 4001 (`Session ended`) about 44 seconds after opening, and its old cookie then received HTTP 401. This verified **DeployLens application-session expiry**, not an actual eight-hour GitHub access-token expiry. GitHub's expiring access token is accepted during the callback and discarded after `/user`; it is not the 14-day application-session clock. The user's current GitHub authorization may be revoked independently, but already-issued DeployLens sessions remain valid until logout or their own expiry.

The per-invocation model guard now rechecks Control before and after atomic quota accounting, including later tool-loop steps; a deterministic race test verifies no new provider call after the tombstone is observed. A provider call already in progress may finish or be billed despite deletion, although the SDK abort signal and socket closure stop delivery. Earlier local two-tab tests saw no frames after deletion and no recreated Agent tables. The local-Vite log `Failed to reschedule alarm after keepAlive dispose: ... no such table: cf_agents_jobs` occurs when the installed Agents SDK's fire-and-forget keep-alive disposer races inline `destroy()` removing SDK tables. That callback catches/logs its own error; the separate Control retry defect was not evident until the production tail was observed. Neither issue is suppressed. The SDK's durable scheduled-destroy path replaced inline `destroy()` in the forward-fix described below.

Production smoke testing on version `e73842df-af35-4729-aad8-06e131014055`: the anonymous database example streamed a real Workers AI answer, displayed source-line citations for three repeated `ECONNREFUSED` lines, and matched the database runbook. GitHub authorization for the new production app succeeded. A private investigation accepted a pasted **synthetic** four-line source, reopened all original lines, streamed a real response, and restored chat, citations, hypotheses, a user-reported check result, and the runbook match after reload. A second private investigation started empty; the owned listing reopened the original. Brave downloaded a 2,297-byte Markdown handoff, and its saved symptoms, line excerpts, unconfirmed hypothesis, check result, open questions, and unresolved status were inspected. These are production observations, not local substitutes.

The first production two-tab deletion on version `e73842df-af35-4729-aad8-06e131014055` used the disposable synthetic private investigation `2092a31e…` while an analysis was active. Both tabs hid its saved content; its old HTTP/Agent paths returned 404, a fresh WebSocket handshake failed, and reloading its URL redirected to another owned investigation. **A concrete teardown defect was found:** the installed Agents SDK's inline `destroy()` aborts its own isolate, so the Control RPC did not receive success and retried the tombstoned cleanup roughly every 60 seconds. The first attempt also logged `Failed to reschedule alarm after keepAlive dispose: ... no such table: cf_agents_jobs`. No post-deletion model step or access was observed, but repeated cleanup made that version unsuitable for release.

Forward-fix commit `7c66653` uses the SDK's durable `_cf_scheduleDestroy()` method after closing sockets and draining the active turn. The new Worker version `a6d251f7-f95d-491c-831a-aec9f903c9c5` let Control acknowledge cleanup; its alarm performed the destructive lifecycle work in a fresh invocation. The previously tombstoned `2092a31e…` also reached the new path when its next retry ran. A second disposable synthetic investigation `e9680c48…` was deleted in a literal two-tab Brave test during real Workers AI analysis. A raw WebSocket received source and export RPC successes before deletion, then closed with code 4001. No later RPC result arrived; attempts to send after close reported the closed state. Authenticated HTTP detail, source, and export paths returned 404; listing omitted the ID; reopening its URL redirected away. The deleting and active tabs both replaced saved content with an unavailable message. After logout, Brave showed a new anonymous demo session, and the remaining private URL was denied. The filtered Worker tail showed the scheduled destroy with outcome `ok` and a `destroyed` lifecycle event, but no further model-step log, keep-alive table error, or recurring cleanup alarm during the observation window. Gateway denial and absence of late logs are evidence against visible recreation or continued inference, not direct inspection of the deleted Durable Object's storage.

Real ownership isolation between **two distinct GitHub accounts** remains unverified; only one real GitHub account was available. Deterministic tests use distinct provider IDs (`github:101` and `github:202`) but do not replace that live test. A provider call already started may finish or be billed after deletion, although its response is not delivered to a deleted investigation. The observed SDK `destroyed` lifecycle event is documented rather than suppressed; no repeating error was observed after the forward-fix. Previously downloaded files and Cloudflare-retained platform logs are outside app deletion.

## Proposed deployment and rollback

The first controlled deployment occurred after explicitly accepting that old bearer-like URLs would stop working. Their underlying `DeployLensAgent` data was not deleted or assigned an owner. The production callback and secrets were configured, and the deployed commit/version are recorded above. A forward-fix for the deletion retry loop was deployed without changing the v1/v2 bindings or migrations. A real two-account isolation test is still desirable before claiming that behavior as live-verified.

Migration `v2` creates `DeployLensControl` and `DeployLensQuota` SQLite Durable Object classes; `v1` remains. [Cloudflare warns](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/) that a Worker version cannot be rolled back across a Durable Object class lifecycle change. If this first `v2` deployment fails, prepare a **forward-fix** Worker version from this branch that retains all three classes, their exact bindings, and both migration tags, while setting `INFERENCE_ENABLED="false"` if model usage must stop. Restore service with a new deploy; do not use the pre-`v2` release as a rollback target or remove the Control/Quota classes. After a stable post-`v2` version exists, a rollback among compatible versions may be possible. A code rollback does not undo Durable Object migrations, registry/quota writes, session issuance, or any completed deletion/expiry; destroyed investigation data is not restored by redeploying old code. Legacy Agent data remains stored under the `DeployLensAgent` class, but the new Control registry has no owner mapping for it, so the new HTTP gate denies old URLs. A future recovery must be a separately reviewed, proof-of-ownership path or an explicitly approved compatible legacy read/export build; never assign a legacy record to the first visitor. Verify the exact rollback target and resource compatibility before any rollback command.

Parsing remains conservative, runbooks cover only three incident families, model hypotheses can be wrong, and only the user may mark an investigation resolved. GitHub account authorization protects private investigations but does not replace organizational identity/access governance. Recent listings are capped at 100 items; an older owned investigation can still be opened by its URL.

Runtime model instructions are in `src/agent/system-prompt.ts`; development history is in [PROMPTS.md](./PROMPTS.md). ChatGPT helped draft the development prompts, and Codex assisted with implementation. Any required license notices from reused packages remain in their upstream packages.
