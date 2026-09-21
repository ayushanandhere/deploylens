# Development prompt history

ChatGPT helped draft the development prompts, and Codex assisted with implementation. Entries below are append-only and preserve user wording verbatim.

## 2026-09-20 — Initial implementation prompt

Build the first working milestone of DeployLens in the current directory.

DeployLens is an AI assistant for investigating deployment failures. A developer provides symptoms and logs, and the application helps identify evidence, evaluate possible causes, and decide what to check next. This project is intended for Cloudflare’s optional engineering assignment.

The completed application will support:

* Chat-based investigation of deployment problems.
* Deterministic log analysis with references to source lines.
* Three curated runbooks: missing environment variables, database connection failures, and upstream connection failures.
* Persistent investigation history and follow-up questions.
* A Markdown handoff summary containing evidence, hypotheses, completed checks, and unresolved questions.

Implement only the repository setup and working chat foundation in this milestone.

Before implementation:

1. Inspect the current directory, Git state, and installed development tools. Preserve existing files and changes.
2. Read the current official Cloudflare documentation and inspect the official Agents starter:
   [https://developers.cloudflare.com/agents/](https://developers.cloudflare.com/agents/)
   [https://developers.cloudflare.com/agents/getting-started/quick-start/](https://developers.cloudflare.com/agents/getting-started/quick-start/)
   [https://github.com/cloudflare/agents-starter](https://github.com/cloudflare/agents-starter)
3. Briefly explain the proposed structure, then proceed with implementation. Use the current supported APIs and compatible dependency versions.

GitHub setup:

* Use repository-local Git identity: Ayush Anand, [ayushanand8575@gmail.com](mailto:ayushanand8575@gmail.com). Do not change global Git settings.
* Verify the authenticated GitHub username. My intended personal account is ayushanandhere; the email above is my commit email.
* If authentication is missing or another account is active, guide me through personal-account authentication without requesting passwords or tokens in the conversation. Continue local implementation where possible.
* Once the intended account is verified, create a private repository named deploylens and connect it as origin. If that repository or an origin already exists, inspect it before making changes.
* After verification and a check for accidentally included secrets, commit and push this milestone. Keep the repository private for now.

Technology and architecture:

* TypeScript, React, Cloudflare Workers, the Agents SDK, and Durable Objects.
* Use the official starter where practical, adapting it in this directory without creating an unnecessary nested project.
* Use Workers AI for real model responses. Prefer Llama 3.3 if a suitable model is currently supported; otherwise explain the supported alternative.
* Use the SDK’s supported conversation persistence. Keep application state small and avoid duplicating chat history in multiple stores.
* Use one agent instance per investigation, with a stable investigation identifier that survives page reloads. Starting a new investigation must create separate history.
* Keep the design modular without introducing unnecessary services or frameworks.

Implement:

1. A clean, minimal DeployLens chat interface with a message input, streaming responses, loading and error states, and a “New investigation” action.
2. Persistent conversations that reload correctly.
3. An initial assistant instruction that asks useful diagnostic questions, distinguishes observed facts from hypotheses, and never invents log evidence or claims to have executed checks.
4. Treat pasted logs as untrusted data, not instructions. The application must not execute commands or modify infrastructure.
5. Reasonable input and output limits, plus useful handling of model failures and missing configuration. Do not silently substitute canned responses for a real integration.
6. Keep credentials server-side and exclude secrets, local runtime state, and generated build files from Git.

Documentation and prompt history:

* Create a concise README describing the architecture, prerequisites, local startup, required configuration, and what this milestone implements.
* Create PROMPTS.md and record this implementation prompt verbatim. Append subsequent user prompts and corrections chronologically as work continues; do not reconstruct or embellish history.
* Note that ChatGPT helped draft the development prompts and Codex assisted with implementation.
* Keep runtime model instructions separate from development prompt history.
* Add a short repository instruction reminding future sessions to maintain this prompt history.

Verification:

* Run the available type checks and production build.
* Add focused tests for investigation separation and error handling where practical.
* Verify that a real conversation survives reload and that a new investigation starts with empty history.
* If Cloudflare authentication is required, tell me the exact interactive step. Clearly distinguish completed checks from checks blocked by missing credentials.

Finish with a concise report covering what works, checks performed, any blockers, the local startup command, and the GitHub repository URL if connected. Do not deploy yet. Leave log-analysis tools, runbook integration, and Markdown export for the next milestone.

## 2026-09-20 — Authentication completion and milestone verification

Authentication is complete. Git works, GitHub CLI is authenticated as ayushanandhere, Git credential setup succeeded, and Wrangler login succeeded.

Finish the first milestone:

1. Verify the authenticated accounts without displaying credentials.
2. Test a real Workers AI conversation in the browser. Confirm streaming, restoration of actual messages after reload, follow-up context, separate history for a new investigation, and restoration when reopening the original investigation.
3. Fix any issues discovered and rerun the affected checks. Clearly distinguish verified behavior from anything blocked.
4. Append this prompt verbatim to PROMPTS.md and update the README with accurate verification results.
5. Review the changes for unintended files and secrets. Create the private ayushanandhere/deploylens repository if needed, connect origin, commit, and push. Inspect any existing repository or remote before changing it.

Do not deploy or add the next milestone’s features yet. Avoid machine-wide package changes.

Report the GitHub repository URL, conversation and persistence test results, and any remaining blockers.

## 2026-09-20 — Cloudflare subdomain authorization and final verification

Register ayushanandhere as my personal Cloudflare workers.dev account subdomain. If it is unavailable, use ayushanand8575.
Then continue the outstanding first-milestone verification: real Workers AI streaming, message persistence after reload, follow-up context, and separate investigation histories. Fix any issues discovered, update the README, and append this prompt verbatim to PROMPTS.md.
Once verification passes, commit and push to the existing private ayushanandhere/deploylens repository. Keep the repository private and do not deploy the application yet.
Report the registered subdomain, verification results, commit hash, and any remaining blockers.

## 2026-09-20 — Continuation

Continue

## 2026-09-20 — Milestone 2 implementation

Implement milestone 2 of DeployLens: evidence-based deployment investigation.

Build on the existing verified chat foundation. Inspect the repository and its instructions first. Preserve the working Workers AI model, streaming, and conversation persistence. Briefly explain your implementation approach, then proceed.

The goal is a complete investigation flow: provide symptoms and logs, inspect evidence, discuss possible causes, record checks, and export a useful handoff.

1. Log input and deterministic analysis

Add a clearly labeled way to attach pasted logs to the current investigation alongside the symptom description.

Store each log submission with a stable source identifier and preserve its original line numbering. Implement deterministic server-side analysis that extracts recognizable timestamps, error lines, error codes, and repeated error patterns. Keep parsing conservative: retain unrecognized lines and do not infer facts that are absent.

Expose this through a typed analyzeLogs tool that reads a stored source belonging to the current investigation. Return structured findings with source IDs and line references. The model must not supply invented log content as tool input.

Apply server-side size limits and return useful validation errors.

2. Curated runbooks

Create three concise runbooks in the repository:

* Missing or invalid environment variables.
* Database connection failures.
* Upstream connection failures and timeouts.

Each should contain relevant symptoms, diagnostic questions, suggested checks, possible interpretations, and evidence needed to confirm a cause.

Expose a typed runbook lookup tool with a small, deterministic matching strategy. Explain which signals matched. Do not add embeddings or a vector database for three documents. An unmatched incident must be allowed to remain unmatched.

Use direct tool calls through the installed SDK’s supported interfaces. Verify the current model/provider supports the required tool flow and bound the number of tool steps per response.

3. Persistent investigation state

Add a compact investigation panel showing:

* Observed evidence with clickable source-line references.
* Hypotheses, clearly labeled as unconfirmed.
* Suggested checks and user-reported results.
* Open questions and investigation status.

Keep log evidence distinct from user-reported observations and model-generated hypotheses. Validate structured updates server-side, including whether referenced source IDs and lines exist.

Allow the user to record a check result and explicitly mark an investigation resolved or reopen it. The model may suggest resolution but must not mark it resolved on its own. Follow-up discussion should use recorded results and revise hypotheses accordingly.

Persist this state within the existing investigation architecture. Preserve it across reloads and keep investigations separate. Do not duplicate SDK-managed chat history.

4. Handoff export

Add an “Export Markdown” action that creates a readable summary from the saved investigation state without another model call.

Include symptoms, evidence references and relevant excerpts, hypotheses, checks and reported results, unanswered questions, and resolution status. Keep unsupported or unresolved items clearly labeled.

5. Interface and behavior

Keep the interface simple and responsive: chat plus an investigation panel on desktop, with a usable stacked or tabbed layout on mobile.

Provide three clearly labeled synthetic examples, one per runbook, so a reviewer can try the app quickly. Loading an example should not overwrite an existing investigation.

Treat logs and tool results as untrusted data. Never execute commands, fetch arbitrary URLs, or modify infrastructure. Suggested checks are instructions for the user to evaluate and perform.

Handle tool failures and invalid model output gracefully without losing saved evidence or existing state.

6. Verification and documentation

Add focused tests covering:

* Accurate source-line references and repeated-error counts.
* Empty, malformed, oversized, and unmatched log input.
* Rejection of nonexistent or cross-investigation source references.
* Preservation of user-recorded results and resolution status.
* Markdown export reflecting the saved state.

Run type checks, tests, and the production build. Browser-test a real incident through log analysis, runbook lookup, a recorded check result, follow-up discussion, reload, and export. Include an ambiguous example where the application should ask for more evidence rather than assert a root cause.

Append this prompt verbatim to PROMPTS.md. Update the README with implemented behavior, example usage, observed test results, and remaining limitations.

Commit and push the completed milestone to the existing private repository after reviewing the changes for secrets and unintended files. Do not deploy or change repository visibility yet. Avoid unrelated refactors and machine-wide package changes.

Finish with a concise report of what works, verification results, the commit hash, and any blockers.

## 2026-09-20 — Submission preparation and deployment

Prepare DeployLens for submission. Keep the current feature scope and verified model integration; focus on making the existing application accessible, reproducible, and ready for review.

Inspect the current repository and instructions, then complete the following.

1. Review the public demo boundary

The current application uses investigation UUIDs in URLs and exposes Agent methods. Inspect the actual HTTP, WebSocket, RPC, and client-state update paths before deployment.

Ensure clients cannot bypass server validation or overwrite protected investigation state through generic SDK state updates. Validate incoming method arguments at runtime, not only through TypeScript types.

Add modest server-side rate limits for model requests and resource-creating operations, with clear user-facing errors. Preserve existing input, storage, tool-step, and timeout limits.

Keep this a demonstration using synthetic or redacted logs. If investigation URLs grant access to their contents, explicitly document that behavior and tell users not to submit sensitive data. Do not describe UUID-based separation as authenticated access control.

Fix concrete issues found in this review without introducing an unrelated authentication system or redesigning the app.

2. Add reproducible automated verification

Add a GitHub Actions workflow that runs on pushes and pull requests, installs dependencies with npm ci, and runs the existing type checks, deterministic tests, and production build.

Use a supported Node version compatible with the project. CI must not require Cloudflare credentials or paid model calls. Keep real-model browser verification documented separately.

Add focused regression tests for any substantive fixes made during this milestone.

3. Deploy to my personal Cloudflare account

I authorize deployment of DeployLens to my personal Cloudflare account under the registered ayushanandhere.workers.dev namespace.

Inspect existing resources first. Deploy the production build using the project’s supported configuration and preserve the current Durable Object migrations.

Do not purchase a plan, enable paid upgrades, or change billing settings. If deployment requires one of those actions, report the exact requirement.

Verify the deployed application in a fresh browser session:

- A synthetic example can be analyzed with a real streamed response.
- Evidence references and the runbook match work.
- A recorded check result and conversation survive reload.
- A new investigation has separate history.
- Markdown export downloads correctly.
- The interface remains usable at mobile width.

Report the actual deployment URL and distinguish production verification from earlier local checks.

4. Prepare the repository for reviewers

Update the README with:

- The live demo URL near the top.
- A short explanation of the problem and intended user.
- A compact mapping of the assignment’s four requirements to the implementation: LLM, coordination, chat input, and persistent state.
- Exact local setup, test, and deployment instructions.
- A brief walkthrough using a synthetic example.
- Architecture, access behavior, and known limitations.
- A link to PROMPTS.md.

Keep claims factual and concise. Preserve the chronological prompt history and append this prompt verbatim. Retain any required attribution or license notices from reused code.

5. Publish and finish

I authorize making ayushanandhere/deploylens public after reviewing both the current files and Git history for credentials, sensitive logs, or unintended private material.

Commit and push the final changes. Verify that GitHub Actions passes and that the repository, README, source files, and PROMPTS.md are accessible without signing in.

Do not submit the job application.

Finish with the public repository URL, deployed demo URL, final commit hash, CI result, production verification results, and any remaining blockers. Do not add optional features or pursue the bundle-size advisory unless it causes an observed usability problem.

## 2026-09-21 — Private investigations, shared limits, and lifecycle

Implement the next DeployLens milestone: private investigations, shared usage limits, and investigation deletion/expiry.

Start by reading the repository instructions, README, PROMPTS.md, current implementation, and Git status. The last recorded release is 3b1ccd0acab760dff571a611c83ee93787a4439d, but inspect the actual current state and preserve subsequent work. Work on a new feature branch.

First explain your proposed design briefly, then implement it. Check current official documentation and compatibility with the installed Cloudflare Agents SDK before choosing authentication and lifecycle APIs. Make routine implementation decisions yourself.

1. Private investigations and authentication

Add “Continue with GitHub” for users who want to create and revisit private investigations. Use a maintained authentication library compatible with Cloudflare Workers where practical; explain the choice and avoid unnecessary dependencies.

Bind ownership to the authenticated user’s stable provider ID. Enforce authorization on the server for every investigation access path, including HTTP, WebSocket connection, RPC/tool-triggering operations, source retrieval, export, deletion, and any investigation listing.

A UUID or client-provided owner field must never grant access. A second account must not be able to read or modify another user’s investigation even if it knows the URL. Account for expired sessions on already-open connections.

Use secure session handling, OAuth state validation, appropriate cookie settings, logout, and protections against cross-site mutation requests. Never expose OAuth secrets or session credentials to the client, logs, or documentation.

If OAuth application registration or a secret requires my action, complete all work that can be implemented and tested without it. Then give me the exact setup steps, callback URLs, and secret names. Do not ask me to paste secrets into chat.

2. Preserve a useful public demo

Keep the existing public landing URL and a clearly labeled “Try the demo” path so recruiters can explore without signing in.

Use the bundled synthetic scenarios for anonymous demonstrations. Enforce the demo source restrictions on the server; do not allow arbitrary log uploads or source creation through an overlooked RPC/tool path.

Keep each visitor’s demo state separate using a server-issued session. Private investigations must remain separate from anonymous demonstrations. Explain the demo’s data and retention limits clearly in the UI.

Preserve streaming, source citations, evidence/check tracking, reload restoration, and Markdown export where applicable.

3. Usage limits that survive new investigation IDs

Keep the existing per-investigation limits and add:

* Per-authenticated-user model usage limits.
* Anonymous demo session limits and a shared demo allowance.
* An application-wide daily model-request ceiling and a configurable switch to disable new inference requests.

Use atomic server-side accounting so concurrent requests and new UUIDs cannot bypass the shared ceiling. Count actual model invocations, including tool-loop steps and retries, and avoid unsafe automatic refunds after ambiguous failures.

Make limits configurable and document the defaults. Fail closed for new inference if the quota service is unavailable, while keeping authorized reads, exports, and deletion available.

Return a clear limit message and reset time. Describe these as request limits, not guaranteed monetary spending caps. Do not change billing or enable paid services.

4. Deletion, expiry, and existing data

Add an owner-only delete action with confirmation. Remove the investigation’s conversation, log sources, structured state, and listing entry. Close active connections and ensure stale requests or a reused URL cannot silently recreate the deleted investigation.

Add configurable expiry for anonymous demo sessions, initially 48 hours. Use an appropriate server-side scheduling mechanism and verify that cleanup cannot race with active writes or recreate expired data. Document what deletion covers, including any platform-log limitations.

Existing investigations currently use bearer-like URLs. Do not assign ownership to whoever opens one first. Define and implement a safe transition for these legacy records without automatically deleting them or pretending their owners can be inferred. Explain the effect on old URLs before deployment.

5. Verification

Add focused tests for:

* Two users attempting to access each other’s investigations.
* Unauthenticated, expired-session, and forged-owner requests.
* HTTP, WebSocket, RPC, source, and export authorization.
* Concurrent quota consumption and attempts to bypass limits with new UUIDs.
* Deletion and expiry with stale connections or in-flight writes.
* Demo restrictions and separation from private investigations.

Run the existing checks and relevant browser flows. Use deterministic substitutes for routine CI; run small live authentication and Workers AI checks only when configured. Clearly distinguish verified behavior from configuration-dependent checks.

6. Documentation and delivery

Append this prompt verbatim to PROMPTS.md, excluding any future secret values. Update README and environment examples with setup instructions, architecture decisions, limits, legacy-data handling, and verified results.

Keep this milestone focused. Preserve the existing model and diagnostic functionality unless a demonstrated compatibility problem requires a change.

Review the diff and tracked files for secrets and unintended artifacts. Commit and push the feature branch to the existing repository and open a draft pull request. Do not merge or deploy this milestone yet.

Finish with a concise report covering implemented behavior, test results, configuration I must complete, migration implications, remaining limitations, and the draft PR URL.

## 2026-09-21 — Pre-merge private-investigation verification

Continue the private-investigation milestone on codex/private-investigations and draft PR #1.

I have registered the development GitHub OAuth app and configured its credentials in the local ignored .dev.vars file. Verify that the required variables exist without printing their values. Preserve other local configuration.

Complete the remaining pre-merge verification:

1. Test real GitHub sign-in, private investigation creation, reload restoration, listing, source access, export, and logout. Confirm the callback URL matches the actual local server. Check compatibility with the OAuth app’s token-expiration settings.
2. Verify ownership isolation using two real GitHub accounts in separate browser profiles if available. Let me perform interactive sign-in. If a second account is unavailable, run the deterministic two-user authorization tests and explicitly retain real two-account OAuth as unverified. Do not treat two sessions of the same account as two different users.
3. Test deletion while another tab has the investigation open and while an update or model response is in flight. Confirm stale sockets, requests, exports, and reopened URLs cannot expose or recreate deleted data.
4. Test anonymous expiry using a local-only shortened retention setting or controlled clock. Verify server-side cleanup and denial of stale access, then restore the normal 48-hour configuration. Do not alter production retention or existing deployed data.
5. Verify Markdown export in a regular browser such as Brave or Chrome. Confirm an actual file downloads and inspect its contents; a success notice alone is insufficient.
6. Fix issues found, run the affected regression tests and npm run check, and update README with precise results and remaining limitations. Keep production socket behavior explicitly pending until tested in a deployed environment.

Append this prompt verbatim to PROMPTS.md. Review the diff for credentials and unintended files, commit the fixes, and push to the existing branch and draft PR.

Do not merge, deploy, change billing, or delete legacy production investigations.

Finish with the verification results, any specific manual steps still needed, and a concrete proposed deployment and rollback plan. Identify any Durable Object migrations or data changes that a code rollback would not reverse.

## 2026-09-21 — Continuation

Continue.

## 2026-09-21 — Local OAuth and pre-merge verification

Continue DeployLens on the existing codex/private-investigations branch and PR #1.

The attached screenshot shows my registered development GitHub OAuth app’s Client ID and Client Secret. I authorize you to use them to configure local development.

1. Read the credentials from the screenshot and create or update /Users/ayushanand/Projects/deploylens/.dev.vars with GITHUB\_CLIENT\_ID, GITHUB\_CLIENT\_SECRET, and PUBLIC\_ORIGIN="[http://localhost:5173](http://localhost:5173)". Preserve any other configuration. Ensure Git ignores the file and restrict its permissions to the current user. Do not print credentials or include them in commits, documentation, or PROMPTS.md. Do not save the screenshot in the repository.
2. Restart the development server on port 5173. The registered callback is [http://localhost:5173/auth/github/callback](http://localhost:5173/auth/github/callback). Open the app in Brave and guide me only when interactive GitHub authorization is needed.
3. Complete real sign-in verification: private investigation creation, listing, reload restoration, source access, actual Markdown download, and logout. Verify compatibility with the OAuth app’s enabled access-token expiration.
4. Complete the literal two-tab deletion test and investigate the previously reported SDK teardown errors. Fix application defects and document any remaining SDK/runtime issue accurately.
5. If a second GitHub account is unavailable, retain real two-account OAuth isolation as unverified; use deterministic two-user authorization tests without claiming they replace the live test.
6. Run relevant checks, update verification documentation, append this prompt without credentials to PROMPTS.md, and commit and push changes to the existing PR.

Do not merge or deploy. Do not change billing or delete legacy production data. Finish with a concise readiness report and any remaining blockers.

Proceed without asking me to manually create the configuration file.

## 2026-09-21 — Release-readiness review

Continue DeployLens on the existing branch and draft PR #1. The last reported commit is 5392065b938dfbddea6f4984ff9c49bfe4ee690e; inspect the actual current state first.

Complete a focused release-readiness review without adding features.

1. Review authorization across HTTP, WebSocket, RPC, source retrieval, export, listing, and deletion. Confirm deterministic tests use distinct provider user IDs and cover attempts by one user to access another user’s investigation. Keep real two-account OAuth isolation explicitly unverified unless a second account becomes available.
2. Investigate the keep-alive alarm error when deletion interrupts a model response. Determine whether it can cause continued inference, unhandled failures, storage recreation, or repeated alarms. Fix application defects. If it is an SDK/runtime issue, document the reproduction, observed impact, and evidence supporting whether it blocks release. Do not merely suppress the error.
3. Review the distinction between GitHub access-token expiry and application-session expiry. Use a controlled clock or local-only shortened lifetime to verify the applicable behavior, including an already-open WebSocket. Do not claim that an actual eight-hour expiry was tested.
4. Prepare exact production OAuth registration fields, callback URL, required configuration and secret names, deployment commands, and a short production smoke-test checklist. Never include secret values. Confirm whether migration v2 and its Control/Quota classes still require a forward-fix strategy.
5. Document how deployment changes old bearer-like investigation URLs and preserves legacy data. Provide a concrete recovery plan that retains required Durable Object classes and bindings.

Run checks needed for any changes, update README and PROMPTS.md, review the diff for secrets, and commit and push to the existing PR.

Do not merge, deploy, change billing, or delete legacy production data. Avoid repeating already-completed browser checks unless a change affects them.

Finish with a clear release-readiness verdict, any concrete blockers, and the exact production setup steps I must complete.

## 2026-09-21 — Controlled production deployment

Proceed with a controlled production deployment of the private-investigation milestone from PR #1.

I authorize this deployment and accept that existing bearer-like investigation URLs will become inaccessible while their data is retained without assigning ownership. Do not delete legacy data. Do not change billing.

1. Inspect the current branch, PR, CI, and deployment state. Use the reviewed milestone at commit 89856828a3a80432f317780fdb60155937cf4d95 or its verified successor. Preserve unrelated work.
2. Configure the separate production OAuth credentials I provide in a user-owned 0600 file outside the repository. Never print or commit them. Confirm the production origin and callback configuration. Do not overwrite development credentials.
3. Run the required release checks and deploy with the production secrets file using the supported Wrangler workflow. Preserve all Durable Object classes, bindings, and migration tags required by migration v2. Record the deployed commit and version.
4. Perform focused production smoke tests:

- Anonymous synthetic demo, streaming, citations, and runbook matching.
- Real GitHub sign-in, private creation/listing, reload restoration, source retrieval, Markdown download, and logout.
- Two-tab deletion during an active model response.
- Denial of stale socket operations, source/export requests, and reopened deleted URLs.
- Worker-log review for teardown errors, repeated alarms, or evidence of storage recreation.

Use only disposable synthetic test investigations. Let me complete interactive sign-in when needed. If a second real GitHub account is unavailable, retain that limitation explicitly; do not repeat synthetic tests and call them live two-account verification.

5. If a production gate fails, stop release finalization, report the impact, and apply a focused forward-fix retaining the required classes and migrations. Do not attempt an unsupported rollback to the pre-v2 release.
6. Update documentation and PROMPTS.md without credentials. Commit and push any fixes or verification records to PR #1. Keep the PR unmerged pending the production results.

Finish with the deployment URL/version, deployed commit, production test results, remaining limitations, and whether PR #1 is ready to merge. Do not add new features.

## 2026-09-21 — Production OAuth authorization and deployment continuation

Yes—I authorize submitting the prepared “DeployLens Production” GitHub OAuth app registration under my personal account and generating its client secret.
Store the production credentials in a user-owned 0600 file outside the repository without displaying or committing them. Then continue the already-authorized controlled deployment and production smoke tests from the previous prompt.
I accept that legacy bearer-like URLs will become inaccessible while their data is retained. Preserve the required Durable Object classes, bindings, and migrations. Do not change billing or delete legacy data.
Keep PR #1 unmerged until you report the production results. Proceed without requesting the same authorization again; pause only for an actual blocker or interactive sign-in that requires me.
