# Sara ↔ CODiE — shared engineering notes

**Purpose:** This file is our shared, version-controlled handoff. Either developer may append a dated note, question, decision, test result, or warning. Paul is the architect and **runs deployments**. Writing a commit does not authorize a deployment.

## Collaboration protocol

1. **Read this file and `STAGING-HANDOFF.md` before starting work.** Check the current branch head and open PRs/issues; do not assume previous chat context is current.
2. **Leave a dated, signed note** (Sara or CODiE) after meaningful work. Record: branch, commit, what changed, what was tested, what remains, and any questions for the other developer or Paul.
3. **Code and push are shared responsibilities.** Use narrow commits, fetch latest before editing, and avoid concurrent changes to the same files. If another developer has updated the branch, reconcile rather than force-push.
4. **Paul controls deployments** (including staging). Developers prepare code, review it, and provide **Ready to Deploy** with the exact link and steps; wait for Paul to run the deployment. Afterward, verify and report actual results.
5. **Protect production.** Do not merge draft PR #35 into `gh-pages`, enable registration, migrate production D1, or modify the live game/site without Paul's separate approval.
6. **Be precise about verification.** Distinguish local tests, Cloudflare upload success, and real browser/API tests. Never claim unrun tests passed.
7. **Keep this document concise.** Move long technical details to linked issue/PR or dedicated handoff files. Do not put credentials or private recovery tokens here.

## Current handoff — Sara, 2026-10-18

**Branch:** `codex/g5-persistence`, draft PR [#35](https://github.com/DigiWongaDude/PrimeLabyrinth/pull/35).

**Work:** Implemented GitHub issue [#37](https://github.com/DigiWongaDude/PrimeLabyrinth/issues/37): exact `GET /` on staging Worker serves a responsive Minotaur entrance before the Origin guard. All `/v1/` handlers and origin checks remain in place. The image is externally hosted at:
`https://digiwongadude.com/between/assets/minotaur-access-denied.png`

**Source commit:** [`db0bd57`](https://github.com/DigiWongaDude/PrimeLabyrinth/commit/db0bd57103d8949f28cd1a4a7af228b7dbce3b9c).

**Staging Worker:** `between-g5-staging-api` at
`https://between-g5-staging-api.digiwongadude.workers.dev/`.

**Cloudflare status:** Existing deployed compiled bundle was minimally patched at its unique fetch-handler anchor, then uploaded via connected Cloudflare API. Deployment ID `657d7334070547bbbc7d8cca6ded13a0`. All six existing bindings and compatibility settings were included: `ALLOWED_ORIGINS`, `CREATE_LIMIT`, `DB`, `MAX_TRAVELLERS`, `REGISTRATION_ENABLED`, `REQUEST_LIMIT`. User confirmed the Minotaur displays in browser. Automated API regression tests were **not** run for this update. Live game unchanged.

**Important next action for CODiE or Sara:** The staging bundle was patched directly for this small change; a **future normal Wrangler build from current GitHub source must reproduce the same entrance**. Verify the source-based bundle and bindings before Paul's next deployment. Do not inadvertently revert the Minotaur. The original staging record in `STAGING-HANDOFF.md` predates this change; update its deployment history when documenting future work.

**Current collaboration decision:** Sara and CODiE can both code and commit/push. Paul executes deployments. Prefer direct Sara/GitHub/Cloudflare tooling for small jobs to conserve CODiE/Astra allowance; reserve CODiE for deeper engineering.

## Notes from CODiE

*CODiE: append your next handoff below with date, branch, commit and test status. Please also flag anything in Sara's notes that needs correction.*

### CODiE — 2026-10-19, Issue #38 reset handoff

Read Sara's reset comment and pushed WIP checkpoint `a1c6dcc` before further edits. Core authentication hardening is `94fac12`; final UI credential cleanup is `7cc7aea`. Branch remains `codex/g5-persistence` / draft PR #35. Full factual status and remaining work: [CODIE-HANDOFF.md](CODIE-HANDOFF.md).

Implemented password accounts, Google OIDC/explicit linking, recovery/session lifecycle, additive migration 0003 and stable public discoverer attribution. Minotaur source retained. Latest focused auth run: 13 passed; typecheck and local Worker dry-run passed. Earlier full backend: 32 passed; earlier client: 18 passed; those full suites have NOT been rerun on final code. Final 4-line UI cleanup not browser-retested. Details and environment warning are in the handoff.

Sara owns independent review, remaining testing, UI/documentation polish and final deployment checklist. Real Google configuration/testing and Workers CPU/plan validation remain blockers. Both enablement flags remain false. **Nothing deployed or remotely migrated; Paul alone deploys.**

### Sara — 2026-10-19, Astra High usage benchmark and token-saving protocol

Paul observed the completed CODiE reset run on his tablet: **7m 45s working time**, after which the app's **rolling five-hour agentic usage allowance showed 65% remaining (35% consumed)**; weekly allowance showed **95% remaining**. This is one observed usage snapshot, **not** a measured token count or proof that the run alone consumed all 35% (baseline immediately before was not recorded). Five-hour window was due to reset in ~4 hours; weekly in 7 days. CODiE reported final pushed commit `ad8f4aaa079e31917cdd71bf06d6d3884d9ba2fa`, 13 focused auth tests passed, typecheck and local dry-run passed, no deployment. See `CODIE-HANDOFF.md` for precise scope and missing tests.

**Efficiency rules for future CODiE/Astra sessions:**
1. **Before work:** read Issue #38 and latest `CODIE-HANDOFF.md`; confirm GitHub HEAD and clean worktree. Select only the smallest remaining blocker that needs CODiE's local/agentic environment. Avoid repeating Sara-owned reviews, docs, test writing, or UI polish.
2. **First minute:** checkpoint any existing changes and push; never risk a whole session of uncommitted work.
3. **Work in bounded slices:** one security-critical implementation goal at a time; avoid open-ended browser retries and long screenshots/debug loops. Use a cheaper model/effort for routine changes where possible.
4. **Stop early for handoff:** reserve final working time for commit/push and a brief factual DONE/PARTIAL/BROKEN/NOT STARTED, tests run/not run, Sara TODO. Never claim a dry-run is a deployed test.
5. **Sara handles:** independent code review, regression/adversarial tests, documentation, staging checklist and follow-up fixes where possible. Paul handles every deployment, approval and paid-plan change.
6. **Measure again:** capture five-hour and weekly usage **before and after** the next CODiE run, along with elapsed working time, model and task; compare usage percentage rather than assuming a fixed tokens-per-minute conversion.

**Sara's immediate next step:** review CODiE's pushed authentication changes and run remaining tests; current handoff explicitly says final full regression, real Google sign-in and hosted CPU benchmarking are unverified. Do not enable registration or deploy yet.

### Sara — 2026-10-19, first independent source review and regression additions

Read `backend/accounts.ts`, `backend/worker.ts`, `backend/migrations/0003_accounts.sql`, `account-client.js`, `wrangler.staging.jsonc` and existing 13-test auth suite. Verified in source (not runtime): separate account/session tables, hashed secrets, immutable discovery-owner join, Google `sub` rather than email linking, disabled staging flags, Minotaur root preserved.

**Added two regression tests** to `backend/accounts.test.ts`, commit [`2d66401`](https://github.com/DigiWongaDude/PrimeLabyrinth/commit/2d664017139bda06a5c373224c716b157dddc188):
- Anonymising an account retains the discovery's stable public ID/path/timestamp but replaces the public name.
- An already committed move is idempotently retryable with a rotated session, while the old/expired sessions cannot act.

**Test execution:** These two newly authored tests have **NOT BEEN RUN**; this is a source-only GitHub review. CODiE's earlier 13/13 applies to the prior commit, not to this test addition. Full `npm ci`, `npm run check`, `npm test`, `npm run test:client`, staging Wrangler dry-run and real Google sign-in remain outstanding. Next: execute tests in a checked-out environment; investigate scrypt Worker CPU limits before any staging enablement. Paul deploys only after a verified Ready to Deploy handoff.

### Sara — 2026-10-19, second adversarial auth review

Added two more security regression cases, commit [`37a9ccc`](https://github.com/DigiWongaDude/PrimeLabyrinth/commit/37a9ccc00c80eef15620040f064f213347f93357):
- Google account-link callback must fail if the initiating session was logged out before completion, without attaching the Google subject.
- Public discovery and exploration projections must never contain usernames, bearer tokens, recovery keys, or internal traveller IDs.

The auth suite now has **17 authored cases** (13 previously run by CODiE; 4 newly added by Sara and **not yet run**). Reviewed OAuth state/challenge/session coupling, single-use attempt consumption, `sub`-based account association, and staging's disabled flags by reading source. This is **not** an independent runtime or security signoff.

**Execution limitation:** The GitHub connector exposes file commits but no local checkout/execution. The container has Node/npm, but cannot resolve GitHub to fetch the repository; do not report CI/test success. Next meaningful step is an authorised checkout or CI run of HEAD and full regression plus staging-config dry-run. Keep deployments under Paul's control.
### CODiE — 2026-10-19, verification-only run at `7421ac2ae61b4b1c795a5650dbb87c485ae1d10a`

Pulled `codex/g5-persistence` fast-forward from `ad8f4aa` to Sara's four added regression tests. Read `CODIE-HANDOFF.md` and this notebook. No source/config/deployment changes were made.

**Results:** `npm ci` PASS (77 packages added; 78 audited; 0 vulnerabilities; funding notice only). `npm run check` PASS (Wrangler types + `tsc --noEmit`). `npm run test:client` PASS: 18/18. `npm run build:api` PASS: local `--dry-run`, 71.94 KiB upload / 19.39 KiB gzip. `npx wrangler deploy --config wrangler.staging.jsonc --dry-run --outdir .worker-build-staging` PASS: 71.94 KiB / 19.39 KiB gzip; staging D1, rate limits and vars resolved; `ACCOUNTS_ENABLED=false`, `REGISTRATION_ENABLED=false`; no upload. Wrangler printed only an available-update notice (4.151.1 → 4.151.2).

`npm test` FAIL: 35 passed, 1 failed, 36 total across 5 files (4 files passed; `backend/accounts.test.ts` 17 tests with 1 failure). The failure is Sara's new `anonymisation preserves public discovery ownership...` case at line 236: it expects the new account to own path `0`, but the shared D1 test state has path `0` already owned by an earlier test. This is test isolation/order dependence, not a reported production assertion. Proposed fix: reset/isolated D1 state per test (preferred), or choose a guaranteed-unclaimed canonical path and assert against that path; then rerun the full suite. No application fix was applied in verification-only mode.

No remote migration, deployment, registration enablement, Cloudflare setting change or branch merge occurred. The generated staging dry-run directory was removed after verification. Sara should fix the test isolation issue, rerun all requested checks, and update this note with the final result.


### Sara / Paul — model-routing policy, 2026-10-19

**Paul-approved working arrangement:** Sara is the primary point of contact and coordinator. CODiE should read this note at the start of each session and route work by difficulty to conserve agentic usage. Paul retains sole authority over **all** deployments (including staging), remote migrations, paid-plan changes, merges to live branches, and enabling public registration.

**Prefer GPT-5.6 Luna High** for bounded, mechanical and verifiable tasks: pulling a branch; installing dependencies; running tests, lint/type checks and Wrangler dry-runs; collecting logs and exact pass/fail counts; reproducing known failures; small, well-understood test repairs; documentation; committing/pushing a concise report. Stop and escalate to Sara rather than making speculative changes.

**Reserve Astra High** for security-sensitive or complex design/implementation: identity and session architecture, OAuth/OIDC security changes, nontrivial concurrency/transaction bugs, database migration correctness, deep debugging after cheaper-model attempts, or decisions with serious data-loss/security implications. Do not use Astra just to execute commands or summarize results.

**Per-task routing:** Split each assignment into independent small tasks; choose the least costly capable model for each. CODiE cannot be assumed to switch its own model or run simultaneous model tiers unless its host explicitly supports that. If a model change requires user interaction, ask Sara to coordinate with Paul rather than silently claiming it was switched. Report which model was actually used, time/usage before and after where available, tested SHA, test outcomes and whether any work remains unverified.

**Observed:** Paul used 5.6 Luna High for a verification-only run, with no *visible* change in the rounded five-hour usage indicator (65% remaining); weekly indicator showed 94% remaining. This is encouraging but does not establish zero consumption or guaranteed future pricing. Preserve the full reset unless Paul directs otherwise.

**Current immediate task:** Sara committed a test-order-independent anonymisation regression fix in `a9ec8c3650efa5eaf25f6991110c5544394ac689`. The earlier 35/36 test result predates this fix. A Luna-class rerun of `npm test` at or after that SHA is required before claiming green; no deployment.


### Paul — mandatory manual model switching protocol (2026-10-19)

**Correction to the preceding model-routing note:** Only **Paul** controls the CODiE model selector. CODiE must **never** attempt to switch models automatically, assume that it has switched, or continue a task that needs a different model.

When a task needs a different tier, CODiE must **STOP** and tell Paul via Sara, using the exact clear instruction:

> **Switch me over to [Astra High / 5.6 Luna High].**

Then CODiE **waits**. Paul changes the model himself and says:

> **Carry on CODiE.**

Only then may CODiE resume, confirming the actual model if visible. Do not continue silently while waiting. The same procedure applies when switching *down* to Luna after an Astra-only task. Prefer completing coherent bounded work before requesting a switch; avoid excessive back-and-forth. Sara remains Paul's single coordination point whenever possible.

No deployment authority changes: Paul alone deploys.

### CODiE — 2026-10-19, local Paid-plan feasibility benchmark

Pulled `codex/g5-persistence` at tested source SHA `0d1fb543b2e095aace7bbbd53a8aff60b36c6d5f`. This was local-only: `wrangler dev --local` on `127.0.0.1:8787`, disposable credentials, no remote bindings, deployment, migration or Cloudflare setting change. Each endpoint suite used 20 sequential samples; the first request after a fresh local Worker restart is labelled **cold**, and the remaining 19 are **warm**. Timings are client-observed elapsed HTTP round trips in milliseconds, including local Worker startup effects, D1 emulator work and response handling; they are not CPU measurements.

**Direct scrypt in the local Workers isolate** (`N=16384,r=8,p=5`, 20 hashes): cold 109 ms; warm p50 109 ms, p95 109 ms, min 108 ms, max 109 ms, mean 108.737 ms. The temporary benchmark test passed 1/1. Wrangler emitted an existing local log-file `EPERM` warning for `...\\.wrangler\\logs\\wrangler-2026-10-19_12-26-00_976.log`; it did not fail the test. No Worker CPU duration was exposed by local Wrangler/Miniflare, so no CPU-ms figure is claimed. `process.cpuUsage()` was intentionally not used because it would measure the harness process, not isolate CPU.

**Endpoint elapsed results (20 samples each; all statuses as expected):**

| Operation | Cold | Warm p50 | Warm p95 | Warm min–max | Warm mean | Status |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Signup (one password hash + D1 writes) | 206.350 ms | 132.573 ms | 146.865 ms | 128.986–146.865 ms | 133.677 ms | 20× 200 |
| Successful login (password verify) | 198.118 ms | 130.252 ms | 146.886 ms | 126.464–146.886 ms | 131.208 ms | 20× 200 |
| Incorrect-password login (password verify) | 213.044 ms | 124.217 ms | 144.825 ms | 121.932–144.825 ms | 125.536 ms | 20× 401 |
| Account recovery (new password hash + D1 transaction) | 201.093 ms | 129.916 ms | 141.515 ms | 125.796–141.515 ms | 130.748 ms | 20× 200 |

The endpoint benchmark used unique usernames/IP headers and did not hit the application throttles. Results are a local latency baseline only; hosted CPU accounting and regional D1 latency still require Paul's approved staging test. Password parameters were not changed.

**Regression checks after the benchmark:** `npm test` PASS — 5/5 files, 36/36 tests; `npm run test:client` PASS — 18/18; `npm run check` PASS. Wrangler printed only its available-update notice (4.151.1 → 4.151.2). Temporary benchmark files and disposable credential data were removed; working tree had no source changes before this note.

**Cost/limit review for the £10/month target:** Cloudflare's current Workers Paid Standard pricing is a $5/month base, 10 million included requests/month, 30 million included CPU-ms/month, then $0.30/million requests and $0.02/million CPU-ms; the default per-invocation CPU limit is 30 seconds and the maximum is 5 minutes. Source: https://developers.cloudflare.com/workers/platform/pricing/ . D1 Paid includes 25 billion rows read/month, 50 million rows written/month and 5 GB storage; overages are $0.001/million read rows, $1/million written rows and $0.75/GB-month. Source: https://developers.cloudflare.com/d1/platform/pricing/ . D1 reports rows read/written and query latency in the result metadata/dashboard/GraphQL; use those counters for a real budget ledger.

Current safeguards are `REQUEST_LIMIT` 120/min and `CREATE_LIMIT` 5/min in Wrangler, plus hashed D1 auth counters of 30 auth requests/IP/minute, 10 login attempts/username/15 minutes, and separate recovery/password limits. Keep registration disabled until review, keep `MAX_TRAVELLERS` conservative, retain both $5/$10 alerts, and inspect Workers CPU/request/log and D1 row metrics weekly. Alerts are notifications, not a hard spending cap. Configure a custom Worker CPU limit only after an approved hosted measurement; do not infer CPU-ms from these ~110 ms local wall times. Avoid verbose per-request logs (Workers Paid includes 20 million log events/month, then overage pricing applies).

Cloudflare's Rate Limiting API supports 10- or 60-second windows and counters are location-scoped/asynchronously updated; its guidance cautions against IP-only keys because shared mobile/proxy IPs can throttle multiple valid users. Keep the existing IP guard as a coarse abuse brake, but Sara should review an identity/route-level limiter before opening registration. No complex security change was made here; if changing that architecture is required, request the manual Astra High switch first.

### CODiE — 2026-10-19, verification-only green rerun

Pulled the latest `codex/g5-persistence` branch, including Sara's test-order fix. Tested commit: `03d25a9bd4a8f50ee1df033fd23d2b5c50576e13`.

`npm test`: **PASS — 5/5 test files, 36/36 tests, 0 failures**. No application errors or warnings were emitted by the test run. No source changes, deployment, migration, registration enablement or Cloudflare changes were made. This report is the only change in this commit.


### Sara — Cloudflare CPU feasibility gate, 2026-10-19

Cloudflare's published Workers limits (documentation updated 2026-10-12): **Free 10 ms CPU per HTTP request; Paid default 30 seconds, configurable up to 5 minutes**. Source: https://developers.cloudflare.com/workers/platform/limits/#cpu-time . Workers Paid starts at US$5/month: https://developers.cloudflare.com/workers/platform/pricing/ . This is documentation, **not** a measurement of our code or confirmation of Paul's account plan.

**Next bounded Luna High assignment, no deployment:** In local Wrangler/Miniflare Workers runtime, benchmark the actual `node:crypto` scrypt implementation from `backend/accounts.ts` (`N=16384,r=8,p=5`) with disposable credentials. Measure separately signup hash, successful login verify, incorrect login verify and recovery; include cold and warmed requests, sample count, p50/p95 and preferably Worker CPU duration rather than only wall clock. Note D1 overhead separately if possible; don't weaken password parameters or log passwords. Use a *local-only* benchmark harness or test, commit reusable code/results with exact tested SHA. Do not claim local wall time proves deployed CPU fit. Report any runtime errors. No remote Cloudflare calls or production/staging deployments, plan purchases, migrations or flag changes. If reliable CPU duration requires a controlled deployed benchmark, STOP and ask Sara/Paul for approval rather than deploying.

The backend regression run reported by CODiE after Sara's fix: **36/36 passing** at `03d25a9bd4a8f50ee1df033fd23d2b5c50576e13` (screenshot; report commit `f6b43002b7ec8b76d40339a005f1611a89fc55d9`). Earlier client tests 18/18 and both Wrangler dry-runs passed. This does not resolve hosted CPU limits or live Google OIDC testing.


### Paul decision — Workers Paid approved, strict cost discipline (2026-10-19)
Paul has decided to pay for Cloudflare Workers Paid (base US$5/month) to keep authentication and backend together, with headroom. **Paul alone performs the plan upgrade/purchase.** Target total monthly Cloudflare spend **at or below GBP 10**, approximately GBP 5 extra usage budget, **not** approval for uncapped spend. Cloudflare budget alerts are projected-spend notifications, NOT hard caps. Do not claim the platform guarantees a GBP 10 cap; verify all relevant charges (Workers, D1, other metered services), tax and currency conversion. Before Paul upgrades, prepare read-only cost-control recommendations: budget alerts, per-request CPU limits, rate limiting, anti-abuse and observability, with specific Cloudflare-supported mechanisms and limits. No configuration changes, deployments or purchases without Paul authorisation. Do not weaken scrypt parameters. Benchmark remains useful for latency/cost even with Paid plan.

### CODiE — 2026-10-19, Sara preview/registration correction (follow-up)

Sara reviewed `421a81893ab9798879056fc537df250440ceb5fd` and requested a bounded documentation/config correction. The custom-domain proposal was replaced with the Cloudflare Pages candidate `https://between-g5-preview.pages.dev`, with redirect candidate `https://between-g5-preview.pages.dev/index.html`. Both are explicitly **UNCONFIRMED**: no Pages project or route currently exists, and the exact hostname must be confirmed after provisioning; the existing `workers.dev` hostname remains API-only. No DNS, Cloudflare setting, OAuth console, secret, migration or deployment was touched.

The backend gate was also checked in `backend/accounts.ts`: `REGISTRATION_ENABLED=true` permits any reachable client to sign up; there is no invitation mechanism. The runbook now calls this a short controlled open-registration window, recommends an approved Cloudflare Access/WAF policy for private testing, and states that named Google test users do not restrict password signup. No auth redesign was implemented. `STAGING-HANDOFF.md`, `ACCOUNTS-HANDOFF.md`, `G5-STAGING-ACCOUNTS-RUNBOOK.md`, `g5-config.staging.example.js` and source staging allowlist were updated accordingly.

Follow-up verification: `npm run check` PASS; `npm test` PASS — 5/5 files, 36/36; `npm run test:client` PASS — 18/18; `npm run build:api` PASS; staging Wrangler dry-run PASS — staging D1/rate limits resolved, candidate allowlist visible, both account flags false, no upload. Wrangler emitted only its available-update notice. No remote resources were touched.

### CODiE — 2026-10-19, private staging access decision (Sara gate)

Sara requested a concrete security-reviewed checklist before any staging access change. Added `G5-STAGING-ACCESS-DECISION.md` and updated the runbook/handoffs/config. The candidate frontend is now the Cloudflare Pages branch alias `https://codex-g5-persistence.between-g5-preview.pages.dev`, with redirect candidate `https://codex-g5-persistence.between-g5-preview.pages.dev/index.html`; both are explicitly unconfirmed until project `between-g5-preview` and branch deployment exist. Pages is practical for this static bundle; the existing `workers.dev` hostname remains API-only.

The implementation review records the key blocker: CORS `Origin` checks are not authentication, the browser uses `credentials:'omit'` with explicit bearer tokens, and putting Cloudflare Access in front of the API would return Access redirects/cookies the current client cannot use. `REGISTRATION_ENABLED=true` remains open signup to any reachable client. Decision matrix: closed staging (safe baseline), a short monitored open-registration window (smallest no-code test, not private), Access on both (reject without Astra/security redesign), or a backend invite gate (strongest but substantial auth work). Dashboard steps, Pages/API separation, OAuth callback implications, CLI smoke limits and local validation are documented. No remote resources, secrets, flags or production were changed.

Verification for this checklist: `npm run check` PASS; `npm test` PASS — 5/5 files, 36/36; `npm run test:client` PASS — 18/18; `npm run build:api` PASS; staging Wrangler dry-run PASS with the candidate Pages branch alias in the source allowlist, staging D1/rate limits resolved, both account flags false and no upload. Wrangler emitted only its available-update notice. Ready for Sara review; no implementation or remote access change was made.

### CODiE — 2026-10-19, G5 staging preparation (Ready for Sara review)

Pulled `codex/g5-persistence` at source SHA `3cb9c4f28a3e1434e9bc79144bdd4248620e808f`. Prepared, but did not deploy, migrate, provision, or change Cloudflare/DNS:

- Proposed isolated frontend: `https://between-g5-preview.digiwongadude.com`.
- Exact Google OAuth redirect URI: `https://between-g5-preview.digiwongadude.com/index.html`.
- Added `g5-config.staging.example.js`; it points only to the existing staging API and is not the production `g5-config.js`.
- Added the proposed preview origin to the **source** `wrangler.staging.jsonc` allowlist while retaining the API origin; staging flags remain `ACCOUNTS_ENABLED=false` and `REGISTRATION_ENABLED=false`.
- Added `G5-STAGING-ACCOUNTS-RUNBOOK.md` covering private D1 backup/checksum, migration, registration-closed deployment, Minotaur/health/origin checks, password signup/login/recovery, real Google OIDC and explicit linking, two-device continuity, shared discovery attribution, and rollback.
- Updated `ACCOUNTS-HANDOFF.md` with the exact proposal and byte-for-byte redirect requirement. No Google client ID/secret or Cloudflare setting was changed.

Local verification performed on this preparation: `npm ci` (PASS; 77 packages, 78 audited, 0 vulnerabilities), `npm run check` (PASS), `npm test` (PASS — 5/5 files, 36/36), `npm run test:client` (PASS — 18/18), `npm run build:api` (PASS), and `npx wrangler deploy --config wrangler.staging.jsonc --dry-run --outdir .worker-build-staging` (PASS; no upload). The dry-run resolved staging D1, rate limits, Minotaur source and both flags false. Wrangler emitted only its available-update notice; no application warnings/errors. Generated dry-run output was removed. Sara/Paul must still approve/provision the preview route, configure Google test users/secrets, perform the private remote backup/migration/deployment and run the hosted acceptance matrix. Paul controls deployment.


### Sara to CODiE — preview correction requested (2026-10-19)
Reviewed staging preparation at 421a81893ab9798879056fc537df250440ceb5fd. Thanks; local tests are green. Please make a bounded follow-up on 5.6 Luna High, **no deployment**:

1. Replace proposed `between-g5-preview.digiwongadude.com` with a Cloudflare-provided HTTPS preview hostname that does not require IONOS/x10 DNS or changes to digiWongaDude.com. Verify which hosting route (Pages or workers.dev) is practical and document exact eventual URL/Google redirect; if hostname cannot be known before provision, show placeholder and explicitly mark it unconfirmed rather than inventing a live URL. Keep API staging hostname distinct and preserve the Minotaur root.
2. Examine the actual backend registration gate: does `REGISTRATION_ENABLED=true` allow **anyone** to sign up? If so, the runbook's phrase 'invited-only window' is inaccurate. Propose an enforceable invitation mechanism or a short, controlled testing approach that does not pretend public registration is private; avoid implementing substantial auth/security redesign without requesting Sara review/Astra High manual model switch.
3. Update runbook, handoff and example config as warranted; re-run local checks and dry-run, commit/push, report SHA and stop for Sara review. Do not touch remote D1, Cloudflare resources, DNS, OAuth console, secrets, registration flags or production.

Paul retains sole authority for all deployments and manual model switching. Please leave the dialogue in this shared file.


### Sara to CODiE — next gate: staging access design, 2026-10-19
Reviewed correction a2997ce263c75188587a339d0eac99c85b8223f9. The Pages hostname is correctly marked unconfirmed; registration is accurately identified as publicly reachable if enabled. Cloudflare docs confirm Access can protect Pages preview deployments AND workers.dev Workers separately: https://developers.cloudflare.com/pages/configuration/preview-deployments/ and https://developers.cloudflare.com/workers/configuration/cloudflare-access/ . **Crucial:** restricting the Pages frontend alone does NOT prevent direct requests to the staging API signup endpoint. Protect the API too, or enforce a backend invite gate. Consider cross-origin browser fetch, Access redirects/JWT/cookies, Google OAuth callback, and CLI smoke tests before recommending Access for both.

Next bounded task on 5.6 Luna High: produce a concrete, security-reviewed OPTIONS/decision checklist for the smallest workable private staging test with password + Google OAuth, explicitly accounting for frontend/API protection, browser CORS and OAuth callback. Inspect actual implementation before claiming a gate. Prefer no new paid subscriptions and keep under Paul's GBP 10/month target. Document Cloudflare dashboard steps Paul would perform, plus local tests that can validate gate behavior; **do not provision, deploy, migrate, change remote settings, create secrets, or enable flags**. If secure solution requires substantial auth architecture change, STOP with 'Switch me over to Astra High' and wait for Paul's manual model switch. Report a recommendation and blockers in notes, then stop for Sara review.


### Sara review — 2026-10-19, access decision 2f231e5a
Reviewed `G5-STAGING-ACCESS-DECISION.md`. Agreed: CORS Origin is not authentication; Pages Access alone does not gate direct API signup; Worker Access breaks the current cross-origin credentials-omit client without deliberate redesign. I recommend **Option D, a backend invitation gate**, over even a brief open-registration window, subject to Paul's choice. This is a security architecture change, so **STOP here and request manual switch: 'Switch me over to Astra High.'** Do not implement until Paul approves the approach and switches model. Astra task once approved: threat-model a minimal staging-only invite enforcement at API signup and Google new-account creation (not only frontend), with no public bypass, expiring one-time invitations, rate limiting, and no new exposure of secrets; preserve existing traveller upgrades, account linking, Minotaur, immutable discovery history. Start with design/tests, not deployment. Paul alone controls deployment, remote D1, Cloudflare configuration, and model switching.
