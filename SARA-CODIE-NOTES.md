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


### Paul — invitation-only alpha decision (2026-10-19)
Paul approves invitation-only account registration for THE BETWEEN. A public invitation-request waiting list may come later as a way to measure interest, but it is not part of the current task. Keep those flows separate. The immediate next step is an Astra High security design review for invitations covering password signup and new Google identities, while preserving existing logins and account linking. CODiE must wait for Paul to manually select Astra High and say 'Carry on CODiE' before starting. No deployment, remote database migration, Cloudflare changes, public registration or production merge is authorised.

### CODiE to Sara — invitation design review, 2026-10-19

Paul resumed with “Carry on CODiE” after a model-switch event. No automatic
model switch was attempted; the exact UI model/effort label is not available to
this session. Pulled/reviewed source `f40c66359f14ef8a516c92a820dfb5db4a0d9c49`.
Added `G5-INVITATION-DESIGN.md` as a design proposal with 21 acceptance scenarios;
no invitation implementation or migration was added.

**Recommendation:** API-enforced, randomly issued 256-bit bearer invitations,
digest-only storage, expiring/revocable and redeemable exactly once. Password
signup and new verified Google subjects must commit invitation redemption,
account/profile/traveller, ROOT visit and initial session in one D1 transaction.
Existing sign-in/link/recovery stays invitation-free. Privately delivered bearer
invitations are transferable; they do not prove a named recipient's identity.
No new subscription, Access-cookie integration or waiting list is proposed.

**Additional bypass found in source:** `/v1/travellers` can mint new legacy
travellers if accounts are off and registration is on. The proposed release
must reject unknown credentials there under every flag combination. Preserve
real existing upgrades with a migration-time eligibility snapshot and
credential recheck inside the upgrade transaction. Database admission guards
and unique redemption rows prevent unchecked account creation or concurrent
double-spend; these are proposed, not runtime-proven yet.

Updated the decision/runbook/handoffs to reflect Paul's choice of Option D,
remove open-window/Pages-only protection advice from the current recommendation,
require backend gate readiness before enablement, and specify an allowlisted
frontend artifact rather than publishing the repository root. Corrected the
password-account linking test to use **Link Google account**; the “Keep this
traveller” button is a distinct legacy migration flow. Source config, application
code, engine, Minotaur handler and deployed resources were not changed.

**Actually run:** `npm test -- backend/accounts.test.ts` on the unchanged source
above: PASS, 1/1 file, 17/17 tests, 0 test failures, exit 0. Wrangler emitted
`EPERM` writing its local log at
`.../xdg.config/.wrangler/logs/wrangler-2026-10-19_13-03-03_526.log`; assertions
still completed. `git diff --check` passed (Git emitted LF-to-CRLF conversion
notices). This verifies the existing baseline only. New invitation scenarios,
SQL triggers/races, full suites, typecheck, dry-runs and real Google/remote
checks were not run for this documentation-only change. Earlier 36/36 and
18/18 results are historical, not new invitation validation.

**DONE:** source threat review, proposed token/route/transaction lifecycle,
failure and retry policy, acceptance matrix, reconciled deployment guidance.
**NOT STARTED:** migration 0004, admission guards, frontend invitation input,
operator issuance utility, executable invitation tests or deployment.
**For Sara:** review/accept the bearer scope, 48-hour TTL (seven-day maximum),
legacy snapshot, SQL guard ordering and proposed D1 per-IP admission limit
before implementation. The current code still has no invitation gate; leave
registration closed. Ready for Sara review; Paul retains deployment authority.


### Sara review — invitation design 13b498d, 2026-10-19
Read `G5-INVITATION-DESIGN.md` and CODiE's handoff. I approve the **design direction**, not deployment: 256-bit single-use bearer invitations, 48h TTL, server-side atomic D1 redemption for password and new Google accounts, pre-migration legacy eligibility snapshot, and closure of the `/v1/travellers` unknown-credential bypass. The 21 cases are specifications, not passing tests. Implementation must validate actual D1 transaction/trigger rollback, cap/unique conflicts, simultaneous redemption and upgrade race safety. Check that legacy proof is revalidated transactionally, that no unknown traveller can be minted under any flag combination, and that private operator issuance never leaks raw invitations into logs/Git/arguments. Preserve existing sign-in/linking, Minotaur, and first-discovery attribution. Keep registration OFF; no remote actions.

Paul's screenshot shows Astra High at **11% remaining five-hour allowance**, 86% weekly; conserve the current window. Recommend waiting for five-hour reset, then Paul manually chooses Astra High for the bounded security implementation, or switching to 5.6 Luna High for only mechanical fixture/test scaffolding. Do not begin work or switch models without Paul's instruction. When ready, first implement migration and adversarial tests, then backend, frontend and operator utility in reviewable commits. Sara will review before Paul deploys.

### CODiE to Sara — schema-first invitation checkpoint, 2026-10-19

Paul said “Carry on CODiE (updates from Sara)”. Pulled your review at
`68f9ea63c0c398088b449861e12dfec825c43320`; no model switch was attempted.
Implemented the first reviewable slice, not the complete gate. Code commits:
`be4c064dcc41623e863a1161313e5d063d8f2f99` and
`fd4670217f1950eb430fbcdd53772e44d75279b7` (final tested code tree).

**DONE:** candidate additive SQL and 21 executable adversarial schema tests in
the real local Workers/D1 runtime. The SQL is deliberately in
`backend/invitation-candidate/0004_invitations.sql`, **outside** Wrangler's
`backend/migrations` directory. Only the new test file applies it. No deployable
migration set, API route, production/frontend code or configuration was changed.
See that folder's README for the exact batch contract and integration steps.

Coverage: populated migration/reapplication, sealed eligibility snapshot,
digest-only storage, timestamp constraints, expiry/revocation at redemption,
three concurrent account-row variants (password/password, Google/Google and
mixed), username/sub conflicts, cap exhaustion and concurrent final-slot race,
initial-session failure rolling back ALL writes including a genuinely new
shared discovery, direct account-insert guard, legacy proof/stale-credential
checks, competing upgrades, failed-upgrade rollback and anonymisation/spent-marker
preservation. Existing public IDs, paths and first-discovery ownership survive.

**Review this addition before backend integration:** `legacy_upgrade_proofs`
carries the presented bearer hash in the SAME batch as account/session creation.
Insertion checks current credential + eligibility + profile; account insertion
rechecks proof, consumes it and eligibility, and retires the old credential.
Snapshot membership alone cannot authorize an account INSERT. Never commit a
proof or redemption separately. This is an implementation refinement to the
approved design, not a new API or persistent raw credential store. The schema
does not protect against an administrator executing arbitrary SQL.

**Actually run:**

- Initial targeted `npm test -- backend/invitation-schema.test.ts`: 19/19 PASS,
  1/1 file. It emitted a local Wrangler log-write `EPERM` error; assertions and
  command still succeeded (exit 0).
- Full `npm test` after adding clock-expiry test: 56/56 PASS, 6/6 files. Final
  rerun after final-slot race/discovery-rollback strengthening: **57/57 PASS,
  6/6 files, 0 failed, exit 0**, 10.25 seconds. Final code tree is `fd467021...`
  above. The full runs emitted no log-permission error.
- `npm run test:client`: **18/18 PASS, 0 failed**, exit 0.
- `npm run check`: PASS, exit 0 (existing application typecheck; test TypeScript
  is exercised by Vitest, not included in the application's tsconfig).
- `npm run build:api`: PASS, exit 0, dry-run only.
- `npx wrangler deploy --config wrangler.staging.jsonc --dry-run --outdir .worker-build/staging`:
  PASS, exit 0, no upload. Both account flags resolved false. Both bundles remained
  71.94 KiB / 19.39 KiB gzip; Wrangler advertised available update 4.151.2.
- `git diff --check`: PASS; Git emitted LF-to-CRLF conversion notices.

The client/typecheck/dry-runs preceded the final **test-only/docs** strengthening;
application/config sources were unchanged throughout. No dependencies were
updated. No tests failed. Existing Minotaur/authentication/attribution assertions
pass in the baseline suite. No hosted Google/device tests were performed.

**PARTIAL:** admission transaction schema only. These 21 new tests are NOT the
21 design scenarios all completed: races model D1 account-row variants, not
signed Google or HTTP calls. Existing route tests still run on migrations 1–3.
**BROKEN / RELEASE BLOCKERS (pre-existing):** current API has no invitation gate;
unknown legacy creation under the old flag combination is not closed yet. The
candidate's new-profile legacy-disable guard is defence in depth, not a route
fix. Do not enable registration or apply this candidate with the old Worker.
**NOT STARTED:** invitation-aware password/Google routes, unknown-traveller denial
under every flag combination, admission rate counter, route-level adversarial
tests, migrated baseline fixtures, manual invitation field, private issuance/
revocation utility, operator secret-delivery checks and hosted acceptance.

**For Sara:** review the candidate SQL/proof lifecycle first. Next implementation
commit should integrate the candidate into active migrations together with API
enforcement and updated fixtures, then validate signed OAuth races, all flags,
throttling, lost-response login and non-leakage. Frontend and operator utility
follow. Keep the public waiting list out of scope. No deployment, remote D1,
Cloudflare/DNS changes, secrets, registration enablement or production merge.
Paul retains those controls. Ready for Sara review at this schema checkpoint.

### CODiE to Sara — invitation API and input ready for review, 2026-10-19

Paul requested continuation, then an immediate commit/handoff for your review.
Pulled `codex/g5-persistence` at `1d468cdba4104311e41b2ff10db52368d9c00be8`;
no newer Sara comment was present in these notes. Implementation commits:
`5780ed7` (schema/API/adversarial tests) and
`09be8b36c5f8f04c1c99ce18aeaeda2d9d58b224` (frontend input; tested application tree).
This supersedes the schema-only status above, not its requirement for review.

**DONE:** promoted migration 0004 into active migrations with the matching API;
atomic single-use invitation redemption/account/initial-session creation;
transactionally revalidated legacy credential proof and preserved attribution;
unknown legacy creation denied under all nine account/registration flag
combinations; password admission precheck before unchanged scrypt; D1 shared
five-attempt/IP/minute admission bucket; Google attempt-bound digest with no
callback replacement; existing Google/password login and linking preserved with
registration closed. Manual masked invitation input clears after use and is not
persisted or sent in Google's redirect URL. Minotaur handler unchanged.

21 schema tests and 14 invitation-route tests cover local D1 rollback, concurrent
password/Google/mixed redemption, stale legacy proof and competing upgrades,
revocation, bad provider nonce, session failure, cap/username conflicts,
lost-response recovery, throttling and non-leakage. Baseline fixtures now seed
legacy identities before migration 0004; no HTTP test bypass was introduced.
Google transport is mocked with locally signed OIDC tokens, NOT real sign-in.

**Verification actually run during this implementation:**

- `npm test`: final post-commit rerun at `09be8b36...`: 71/71 PASS, 7/7 files,
  zero failures, exit 0, 13.74 seconds; no log-write error in this rerun.
- `npm run test:client`: final rerun 20/20 PASS, zero failed/skipped/cancelled,
  exit 0, 527.747 ms. Includes two DOM-stub invitation-handler tests.
- `npm run check`: final rerun PASS, exit 0. Application typecheck excludes test
  TS; Vitest executes those tests.
- `npm run build:api`: PASS, exit 0, dry-run only, 73.34 KiB / 19.72 KiB gzip.
- `npx wrangler deploy --config wrangler.staging.jsonc --dry-run --outdir .worker-build/staging`:
  PASS, exit 0, same bundle sizes, both enablement flags false; no upload.
- `git diff --check`: PASS. Git reports LF-to-CRLF conversion notices.
- Initial targeted invitation-route run: 14/14 PASS, exit 0, with a local
  Wrangler log-write EPERM warning/error. Subsequent full run had no such error.
  Build runs advertised Wrangler 4.151.2; installed 4.151.1 was not upgraded.
- No dependency changes or `npm ci` this turn. No hosted smoke command run.

**PARTIAL:** local implementation only, pending independent security review,
especially admission/proof trigger ordering and migration/Worker compatibility.
UI tests use DOM stubs, not visual/mobile browser testing. Local test success
does not establish that the hosted API contains this invitation gate.

**BROKEN / KNOWN LIMITATION:** historical `smoke.mjs` (`smoke:local`) still
expects legacy auto-creation and is incompatible with deliberate route closure;
not run or claimed passing. `staging-smoke.mjs` now expects `use_account_signup`,
but its empty-archive assumptions still need review before Paul uses it.

**NOT STARTED / LEFT FOR SARA:** private issuance/revocation utility and secure
delivery-file permissions; operator non-leakage checks; adaptation of smoke
fixture provisioning; real Google sign-in, hosted two-device/attribution and
mobile visual acceptance. Review `backend/INVITATIONS.md` and updated runbook
before deployment planning. Do not issue real invitations through shell args,
console logs, Git, URLs or SQL exports. Public waiting-list work is out of scope.

Migration 0004 and its Worker must be released together only after review.
Both committed flags remain false. No deployment, remote migration, secrets,
Cloudflare/DNS settings, registration enablement or production merge occurred.
No model switch. Paul alone controls deployment. Stopping for Sara review.


### Sara to CODiE — bounded Luna High follow-up, 2026-10-20

Paul will manually switch you to **5.6 Luna High**. When Paul says "Carry on CODiE", read this note and proceed with ONLY these bounded mechanical tasks on `codex/g5-persistence`:

1. Implement a **private local operator invitation issuance/revocation utility** consistent with `backend/INVITATIONS.md`: CSPRNG 32-byte token, versioned domain SHA-256 digest, 48-hour default and 7-day SQL maximum, one-use/revocable. No public mint/revoke endpoints. Raw tokens must never enter Git, shell arguments, logs, URLs, SQL exports or browser storage. Use an operator-controlled private output file with restrictive permissions; document safe delivery and failure cleanup. Do not mint or transmit real hosted invitations or modify remote D1.
2. Adapt the obsolete `smoke.mjs` local flow to the invitation-only model, using disposable local fixtures; check that it no longer relies on `POST /v1/travellers` creating unknown identities. Review `staging-smoke.mjs` for assumptions about empty archives; do not execute hosted smoke tests.
3. Run existing backend/client suites, typecheck, API build, staging Wrangler **dry-run only**, and `git diff --check`. Add only focused tests for new operator utility or newly exposed failure modes. No expansion of the security test matrix without a concrete defect.
4. Commit and push changes to this feature branch, update handoff with exact commands/results, and STOP for Sara review. Flag any substantive security or architecture question rather than improvising; say **"Switch me over to Astra High"** if it truly requires Astra, and wait for Paul's manual switch and "Carry on CODiE".

**Hard boundaries:** no deployment, remote migration, secrets, Cloudflare/DNS/account settings, registration enablement, production merge, or model switching by CODiE. Both flags remain OFF; preserve the Minotaur and public first-discovery history. Paul alone authorises and performs deployments. Sara's inspection so far is preliminary, not a deployment approval.

### CODiE to Sara — bounded Luna tooling and smoke repair, 2026-10-20

Implemented only the bounded follow-up from your instruction on top of
`79522a7`. The changes are local-only; no hosted invitation was minted and no
remote D1, Worker, Cloudflare setting, secret, DNS record or registration flag
was changed.

**DONE:** `tools/invitations-local.mjs` provides private `issue` and `revoke`
commands. It generates 32 CSPRNG bytes, hashes with
`between:g5:staging:invite:v1:`, applies a 48-hour default and seven-day maximum
TTL, and sends digest-only SQL through the local Wrangler D1 runtime. The raw
token is written only to a caller-selected output outside the repository (mode
0600 on POSIX; default Windows user-temp output relies on the account's private
NTFS ACL). The helper never accepts a raw token as an argument, never prints it,
and deletes its temporary SQL directory. If delivery-file creation fails after
the row is inserted, it attempts an immediate local revocation before returning
the original error. Focused tests cover token length/digest secrecy, TTL and
path bounds, file permissions, and revoke validation.

`smoke.mjs` now requires the local invitation-aware Worker, signs up two
disposable accounts through invitation admission, checks ROOT → 0 → 00 travel,
logs the first account in from a second storage context, verifies shared counts,
and probes `/v1/travellers` to confirm unknown credentials return
`use_account_signup`. Invitation files are deleted after use. It rejects any
non-local API URL. `staging-smoke.mjs` no longer assumes an empty archive; it
compares archive statistics before and after its non-mutating probes.

**Actually run:**

- `npm run migrate:local`: PASS; applied local `0004_invitations.sql`, 19
  commands. This touched only `.wrangler/state` local data.
- `node --test tests/invitations-operator.test.mjs`: **2/2 PASS**, exit 0.
- `npm run smoke:local`: PASS; disposable local accounts, second-device login,
  path travel, shared archive invariants and anonymous-route denial all passed.
- `npm test`: **71/71 PASS**, 7/7 files, exit 0, 10.81 seconds.
- `npm run test:client`: **22/22 PASS**, zero failed/skipped/cancelled, exit 0,
  520.642 ms. This includes the two operator tests.
- `npm run check`: PASS, exit 0.
- `npm run build:api`: PASS, exit 0, dry-run only, 73.34 KiB / 19.72 KiB gzip.
- `npx wrangler deploy --config wrangler.staging.jsonc --dry-run --outdir .worker-build/staging`:
  PASS, exit 0, 73.34 KiB / 19.72 KiB gzip; both account flags false; no upload.
- `git diff --check`: PASS, with normal LF-to-CRLF conversion notices.
- No hosted smoke test, deployment, remote migration or configuration change.

**PARTIAL / REVIEW:** the helper is intentionally a local operator tool, not a
public issuer. Review the Windows ACL assumption and SQL/Worker release ordering
before using it around any real staging data. The smoke flow adds two disposable
local accounts per run; local D1 state is ignored by Git and may be cleared by
the operator when desired.

**NOT STARTED:** real Google sign-in, hosted two-device/attribution acceptance,
mobile/browser visual QA, secure hosted invitation delivery, independent
security review and deployment. `staging-smoke.mjs` was reviewed but not
executed, as required. Stop here for Sara review; Paul retains deployment and
remote migration authority.


### Sara — sea-trial preflight review, 2026-10-20

Read source `backend/accounts.ts`, `backend/worker.ts`, `backend/migrations/0003_accounts.sql`, `0004_invitations.sql`, `tools/invitations-local.mjs`, `smoke.mjs`, `staging-smoke.mjs`, `wrangler.staging.jsonc`, and `G5-STAGING-ACCOUNTS-RUNBOOK.md`. This is a **source-level preliminary review**, not a completed independent security audit or approval to deploy. No confirmed blocker identified in inspected admission transaction/trigger ordering, origin checks, OAuth state/nonce/PKCE, or unknown-legacy denial. CODiE's reported local suite and smoke passes are not independently rerun by Sara.

**Next sequential sea-trial gates, requiring Paul's explicit actions/approval:**
1. Confirm or create an isolated Pages preview for branch `codex/g5-persistence`, then verify actual HTTPS origin. Candidate URL in runbook is NOT confirmed; leave live website, DNS and `gh-pages` untouched.
2. Resolve **hosted invitation issuance/delivery** separately. `tools/invitations-local.mjs` only writes to local D1; do NOT assume it issues hosted invites. Verify Windows private-file ACL for any real secret material. Do not improvise hosted issuance.
3. Freeze reviewed commit; confirm no unresolved release blockers; make private staging D1 backup and inventory, confirm migrations/Worker compatibility. Paul alone applies remote migration/deploy with both flags OFF, then perform closed-state smoke and preservation checks.
4. Configure Google OAuth only against the confirmed preview URI; secret only in Cloudflare secret store, Paul action.
5. Paul-approved invitation-only limited registration window: real password, Google, second-device, legacy-upgrade and immutable discovery checks; close registration and record evidence.
6. Production release is a later separate decision. No staging or production deployment authorised by this note.

**Watchpoints:** `staging-smoke.mjs` remains unexecuted against hosted updated Worker; it assumes the source version returning `use_account_signup` for unknown legacy credentials. Do not run it against the older deployed Worker and interpret a mismatch as corruption. `G5-STAGING-ACCOUNTS-RUNBOOK.md` still contains pre-tooling language; reconcile before execution. Stop and seek security-focused review if any actual defect emerges. No further CODiE action requested yet.


### Sara to CODiE — bounded Luna Pages-preview preparation, 2026-10-20

Paul is at Jen's on his tablet; CODiE is at Outpost. Paul approved **preparation only**. Stay on **5.6 Luna High** (Paul controls selector). On Paul's explicit "Carry on CODiE", read this and the previous sea-trial note, then perform only these tasks:

1. Inspect repository static asset/build structure and determine the simplest **isolated Cloudflare Pages preview** for `codex/g5-persistence`. Prepare a precise, beginner-friendly, click-by-click **Paul-only** Pages setup checklist. Explain project/branch settings, output directory, build command if needed, access/public exposure considerations, and how to verify the actual deployed preview origin before setting OAuth. Candidate `codex-g5-persistence.between-g5-preview.pages.dev` is UNCONFIRMED; do not present as real.
2. Prepare preview-only frontend API configuration so it points at `between-g5-staging-api.digiwongadude.workers.dev`, with **no impact** on live `gh-pages`, DigiWongaDude.com, x10, DNS or production. Avoid hardcoding a guessed OAuth redirect. Check for accidentally exposed secrets or repository backend files in Pages static output. Keep registration/account flags OFF.
3. Reconcile `G5-STAGING-ACCOUNTS-RUNBOOK.md` with the completed **local-only** invitation utility and current 0004 migration. Explicitly mark **hosted invitation issuance/delivery as NOT YET SOLVED**; do not adapt local utility to remote D1 or handle real hosted invitations without separate review and approval. Provide exact staged order: confirm Pages URL; review security; private D1 backup; Paul-only migration and closed-flags Worker deploy; closed-state smoke; Google client config against confirmed redirect; secure hosted invitation solution; tiny invited acceptance window; close again.
4. Run only relevant local static/config validation, existing tests if changed code warrants, and dry-runs. Commit/push to `codex/g5-persistence` and leave a concise handoff (files, commands/results, remaining human actions). STOP for Sara review.

**ABSOLUTE BOUNDARIES:** Do NOT deploy Pages/Worker, run remote migrations or commands, create/change Cloudflare projects/settings/secrets, enable registration/accounts, configure Google, touch DNS/x10/live site, merge to production, or switch your own model. No unapproved public registration or real invitations. If a substantive security architecture question arises, STOP and ask Paul to switch manually using exact phrase "Switch me over to Astra High"; wait for "Carry on CODiE".

### CODiE to Sara — isolated Pages preview preparation, 2026-10-20

Implemented and pushed only the preparation requested above. No Pages or Worker
deployment, remote migration/command, Cloudflare project/setting/secret change,
Google configuration, DNS/x10/live-site change, registration enablement or
production merge was performed. Both account flags remain false in the checked
source configs.

**DONE:**

- Added `npm run build:pages-preview` (`tools/build-pages-preview.mjs`). It
  copies an explicit eight-file browser allowlist into ignored `dist/` and
  generates `g5-config.js` containing only the known staging API origin
  `https://between-g5-staging-api.digiwongadude.workers.dev`. It does not copy
  Worker source, migrations, tests, docs, package files or secrets and does not
  include an OAuth redirect. Added a focused allowlist test.
- Reconciled `G5-STAGING-ACCOUNTS-RUNBOOK.md`: beginner-friendly Paul-only
  Pages checklist, branch/build/output settings, actual-origin verification,
  static-output security checks, and explicit staged order from confirmed URL
  through closed deployment and limited invited window.
- Marked hosted invitation issuance/delivery **NOT YET SOLVED**. The local
  `tools/invitations-local.mjs` utility remains local-only and must not be
  pointed at remote D1 or used for real hosted invitations.
- Updated `g5-config.staging.example.js` to direct operators to the allowlisted
  build helper rather than manual root-file copying. Added `dist/` to `.gitignore`.

**VALIDATION ACTUALLY RUN:**

- `node --test tests/pages-preview.test.mjs`: **1/1 PASS**, exit 0.
- `npm run build:pages-preview`: PASS; exactly 8 allowlisted files generated.
- `npm run test:client`: **23/23 PASS**, exit 0 (the new focused test is included).
- `npm test`: **71/71 PASS**, 7/7 files, exit 0.
- `npm run check`: PASS, exit 0.
- `npm run build:api`: PASS, dry-run only, 73.34 KiB / 19.72 KiB gzip.
- `npx wrangler deploy --config wrangler.staging.jsonc --dry-run --outdir .worker-build/staging`:
  PASS, dry-run only, 73.34 KiB / 19.72 KiB gzip; staging D1 resolved and
  `ACCOUNTS_ENABLED=false`, `REGISTRATION_ENABLED=false`.
- Static output audit: `dist/` contains only the eight allowlisted files;
  repository/backend/secret markers were not found in output.
- `git diff --check`: PASS. Wrangler emitted known local EPERM warnings while
  attempting to write its user log; commands still exited 0 and produced the
  expected type/build output.

**PARTIAL / HUMAN ACTIONS:**

- The Pages project and preview URL remain unconfirmed. Paul must create the
  isolated project manually, deploy the branch, copy the actual HTTPS origin,
  and only then use that origin for any later OAuth configuration.
- Paul/Sara still own private remote D1 backup, migration 0004 + closed-flags
  Worker deployment, hosted invitation issuance/delivery design, Google client
  setup, invited acceptance testing, and rollback evidence. Do not reuse the
  candidate hostname as an OAuth redirect until the dashboard confirms it.

**COMMIT:** this handoff and preparation are committed on
`codex/g5-persistence`; see the final commit SHA in the task report.
Stop here for Sara review; Paul retains all deployment and remote authority.


### Sara to CODiE — prepare staging D1 backup runbook (20 Oct 2026)

Paul has deployed the isolated Pages preview and confirmed gameplay works. He inspected the existing staging D1 database, with six tables, and retrieved a Time Travel bookmark. Next bounded Luna task: inspect the repository's Wrangler staging configuration and prepare concise, beginner-friendly instructions for Paul to perform a read-only D1 SQL export on his desktop. Confirm Wrangler export syntax and database targeting; describe table-count verification, checking the exported file and keeping it outside Git. Do not assume the database is empty. The bookmark is not a standalone backup. Do not run any remote command, deploy, migrate, restore, or change Cloudflare settings. Keep account flags OFF. Commit and push documentation and leave a short handoff here, then stop for Sara review. Paul will execute the export himself after review.

### CODiE to Sara — staging D1 backup runbook, 2026-10-20

Prepared and pushed documentation only. No remote D1 command, export, migration,
restore, deployment, Cloudflare setting change, secret change, OAuth change or
flag change was performed.

**DONE:**

- Added `STAGING-D1-BACKUP-RUNBOOK.md`, a Paul-only read-only procedure targeting
  `between-g5-staging` through `wrangler.staging.jsonc`.
- Documented the current Wrangler syntax for a complete remote export, using an
  explicit private output path and leaving confirmation enabled. The guide
  records SHA-256, UTC time, reviewed commit, Wrangler version and migration
  state without printing SQL contents.
- Added safe table inventory (`PRAGMA table_list`), per-existing-table count
  guidance, foreign-key integrity checking, absent-table handling, sensitive
  file retention rules and the distinction between a real SQL export and a
  supplementary Time Travel bookmark.
- Linked the new runbook from the existing B-stage section of
  `G5-STAGING-ACCOUNTS-RUNBOOK.md` and kept both account flags closed.

**LOCAL VALIDATION:** `git diff --check` passed (only normal LF-to-CRLF
conversion notices). No application code changed, so the existing test suites
were not rerun. The remote export and all remote SQL remain for Paul after Sara
review.

**HUMAN ACTION:** Paul should execute the runbook from a clean reviewed checkout,
keep the SQL/evidence outside Git and private, and send Sara only metadata,
checksums, migration/table inventory, counts and foreign-key result—not SQL.
Stop here for Sara review.


## 2026-10-20 — Operator delegation clarification (Paul → Sara/CODiE)
Paul explicitly authorises CODiE to execute routine **read-only remote D1 exports/backups**, private local storage, integrity checks, SHA-256 verification, and recovery documentation as part of normal safety management without separate approval each time. CODiE may run the required PowerShell commands on Outpost. Keep backups private; do not commit SQL dumps, credentials, or private data. Verify backups before reporting success. This delegation does **not** authorise database restores, remote migrations, deployments, releases, Cloudflare configuration changes, registration activation, or production changes: Paul retains those decisions and performs deployments from GitHub. Proceed with the prepared staging backup runbook, capture before/after table counts, and report results in the handoff. Do not mistake a backup for approval to migrate.

### CODiE — staging D1 backup and verification complete, 2026-10-20

Executed the delegated read-only backup runbook against the authenticated
`between-g5-staging` database. No migration, restore, deployment, flag change,
Cloudflare setting change or production action was performed.

**Backup evidence (private, outside Git):**

- Source SHA: `e259dd3500c78a46cedf260ad1e77df47481acff`
- Wrangler: `4.151.1`
- UTC start: `2026-10-20T10:34:15Z`
- File: `PrimeLabyrinth-private-backups/between-g5-staging-20261020T103415Z.sql`
- Size: **5,073 bytes**
- SHA-256: `37697320036DB4BBDFE6262179E9637F9653063D1C3131A0D78183FB3C434AAC`
- The SQL file contains the expected base schema markers; its contents remain
  private and were not committed, uploaded or pasted into chat.

**Remote verification:**

- Migration list: `0001_journeys.sql` and `0002_shared_exploration.sql` are
  applied; `0003_accounts.sql` and `0004_invitations.sql` remain unapplied.
- User tables present: `travellers`, `visits`, `commands`, `world_occupancy`,
  `discoveries`; internal D1 tables were also observed. No account/invitation
  tables exist remotely yet.
- Pre-export and post-export counts matched: all five user tables **0 rows**;
  `d1_migrations` **2 rows**. The database was verified, not assumed empty.
- Pre-export and post-export `PRAGMA foreign_key_check;`: **empty / clean**.
- Evidence file contains no temporary signed download URL.

The private SQL and evidence files must remain outside Git and stay retained
until Sara/Paul close the rollback window. Migration 0003/0004 and Worker
deployment remain Paul-controlled next steps; do not mistake this backup for
migration approval.

### CODiE — post-migration staging backup verified, 2026-10-20

After Paul's explicit approval and successful application of migrations 0003
and 0004, took a fresh read-only export. No Worker deployment, flag change,
restore or Cloudflare setting change was performed.

- Reviewed source SHA: `5bc4e4cca27ada0b3e66af772d435470fa1fa544`.
- New private export (outside Git):
  `PrimeLabyrinth-private-backups/between-g5-staging-20261020T105045Z.sql`.
- New export size: **11,725 bytes**.
- New export SHA-256:
  `6C4D0FE076160FF656A224254047455E5FFC94588A30D3774EAF6E4BD3AC675C`.
- Original pre-migration export remains separate and verified unchanged:
  5,073 bytes,
  `37697320036DB4BBDFE6262179E9637F9653063D1C3131A0D78183FB3C434AAC`.
- Remote migration inventory: no migrations pending (0001 through 0004
  applied).
- Post-migration table inventory includes the account, profile, session, OAuth,
  invitation and legacy-eligibility tables; all 14 application-table counts
  recorded in the private evidence file are **0 rows**.
- Remote `PRAGMA foreign_key_check;`: **empty / clean**.
- Private evidence file:
  `PrimeLabyrinth-private-backups/between-g5-staging-20261020T105045Z-evidence.txt`.

The first combined count query was rejected by SQLite's compound-SELECT term
limit; it made no changes. The runbook's separate per-table read-only queries
then completed successfully and their outputs are in the private evidence.
The SQL exports and evidence remain outside Git and must not be pasted, shared
or uploaded. Worker deployment and all account flags remain Paul-controlled.

### CODiE — G5 staging Worker deployed and closed-state smoke passed, 2026-10-20

Paul explicitly approved the staging Worker deployment after the preflight and
dry-run. No production deployment, OAuth change, registration activation or
flag change was performed.

- Command: `npx wrangler deploy --config .\\wrangler.staging.jsonc`
- Worker: `between-g5-staging-api`
- Version ID: `77599eca-33d6-4b27-8dca-5ee92fdea713`
- D1 binding resolved to `between-g5-staging`.
- `ACCOUNTS_ENABLED="false"` and `REGISTRATION_ENABLED="false"` remained
  closed; Google client values remained unset.

**Post-deployment read-only smoke:**

- `GET /`: HTTP **200**; Minotaur asset marker present.
- `GET /v1/health` with Origin
  `https://between-g5-preview.pages.dev`: HTTP **200**, body
  `{"ok":true,"generation":5}`, and matching
  `access-control-allow-origin`.
- `GET /v1/auth/config` with the confirmed Pages Origin: HTTP **503**,
  `{"error":"accounts_disabled"}`.

Staging is deployed in the safe closed state. Stop here for Sara/Paul review
before any account or registration enablement.

### CODiE to Sara — confirmed Pages origin pre-deployment check, 2026-10-20

Validated the confirmed Pages frontend origin and staging Worker configuration
locally. No Worker/Pages deployment, remote migration, restore, remote SQL,
Cloudflare setting/secret change, Google configuration or account-flag change
was performed.

**CHANGE:** `wrangler.staging.jsonc` now allowlists the confirmed origin
`https://between-g5-preview.pages.dev` and preserves the existing staging API
origin `https://between-g5-staging-api.digiwongadude.workers.dev`. The stale
unconfirmed branch-alias candidate was removed. `ACCOUNTS_ENABLED=false` and
`REGISTRATION_ENABLED=false` remain explicit.

**TESTED COMMIT:** `01ad5e09e0b4b4b2e218f84eb3a9871f2d4b4a24`

**CHECKS ACTUALLY RUN:**

- `npm run test:client`: **23/23 PASS**, exit 0.
- `npm test`: **71/71 PASS**, 7/7 files, exit 0.
- `npm run check`: PASS, exit 0.
- `npm run build:api`: PASS, dry-run only, 73.34 KiB / 19.72 KiB gzip.
- `npx wrangler d1 migrations list between-g5-staging --local --config .\\wrangler.staging.jsonc`:
  PASS, read-only local inspection; migration order is 0001_journeys,
  0002_shared_exploration, 0003_accounts, 0004_invitations. No remote migration
  was run.
- `npx wrangler deploy --config .\\wrangler.staging.jsonc --dry-run --outdir .worker-build/staging`:
  PASS, dry-run only, 73.34 KiB / 19.72 KiB gzip; staging D1 binding resolved,
  `nodejs_compat` and compatibility date `2026-10-18` resolved, confirmed
  Pages/API origins present, and both account flags false.
- `git diff --check`: PASS with normal LF-to-CRLF conversion notices.

**OUTSTANDING BLOCKERS / HUMAN ACTIONS:**

- Remote D1 backup and verification remain pending a Cloudflare-authenticated
  Wrangler session. The earlier unauthenticated attempt was stopped before the
  export began; no SQL dump exists and the private backup directory is empty.
- Paul still controls the remote migration/Worker deployment and must keep both
  flags closed for the next smoke gate. Google OAuth values/secrets remain
  unset, and hosted invitation issuance/delivery remains **NOT YET SOLVED**.
- The final handoff commit follows this tested config commit; no production or
  staging deployment was performed.


### Sara to CODiE — final staging migration dry-run and operator handoff, 2026-10-20

Paul says “carry on” after confirming successful authenticated, independently verified private D1 export (see prior handoff). **Preparation only; NO remote migration or deployment permission.** On Paul's next “Carry on CODiE”, remain on **5.6 Luna High** and:

1. Confirm clean checkout, latest reviewed feature branch, correct staging database/Worker binding, backup metadata and applied remote migration inventory 0001/0002. Do not read/share SQL backup contents unnecessarily; retain private copy and SHA-256.
2. Run a bounded **local** migration rehearsal using exactly 0001 → 0002 → 0003 → 0004 against a fresh local D1, inspect migration tracking, foreign keys, schema, and any relevant existing tests. No remote SQL writes, no restores.
3. Perform staging Worker dry-run with both `ACCOUNTS_ENABLED=false` and `REGISTRATION_ENABLED=false`; verify preview origin, Minotaur GET /, node compatibility, and migration/Worker schema pairing. Stop on defects, do not expand scope.
4. Present the exact **Paul-only** remote commands for migration list/apply and Worker deploy, including where to run them, prompts/confirmation, preflight expected results, post-deploy smoke/rollback stop criteria. Clearly distinguish dry-run from remote action and migration from deployment. Highlight that hosted invitation issuance/delivery is NOT YET SOLVED and both flags must remain OFF. No Google secrets or OAuth config changes.
5. Update handoff notes with concise evidence and any runbook corrections; commit/push only documentation or necessary local code fixes, then STOP for Sara/Paul review.

**HARD STOP:** CODiE must NOT run remote migrations, deploy, change Cloudflare settings, enable accounts/registration, restore backups, or change model autonomously. Paul alone performs and explicitly authorises remote mutations. Do not mistake “carry on” for migration approval.

### CODiE — final local migration rehearsal and staging dry-run, 2026-10-20

Completed Sara's bounded verification request. No remote migration, restore,
deployment, Cloudflare setting/secret change, OAuth change or flag change was
performed.

**Checkout and backup evidence**

- Branch: `codex/g5-persistence`; clean reviewed source before the documentation
  update: `ae8a44f521d6904b2e2786f1fb29b3d4b6bebfff`.
- The documentation-only operator-gate commit is
  `4399742ae04a1575256e89f5fce54a7cc20ef2d7`, pushed to the same branch.
- Staging Worker: `between-g5-staging-api`; D1 binding/name:
  `DB -> between-g5-staging`; database ID remains
  `8280b0ec-4f1c-42e9-918f-613c7578c83c`.
- Private export remains outside Git and its SHA-256 re-check matches:
  `37697320036DB4BBDFE6262179E9637F9653063D1C3131A0D78183FB3C434AAC`.
- Read-only remote migration inventory: `0001_journeys.sql` and
  `0002_shared_exploration.sql` applied; `0003_accounts.sql` and
  `0004_invitations.sql` pending. No remote SQL was run.

**Fresh local D1 rehearsal**

Used a new temporary `--persist-to` directory and applied exactly
`0001_journeys.sql` → `0002_shared_exploration.sql` → `0003_accounts.sql` →
`0004_invitations.sql`. Wrangler reported 11, 9, 13 and 19 commands successful
respectively. The final local tracking table contains all four migrations and
`npx wrangler d1 migrations list --local` reports no migrations to apply.

- Schema inspection: 16 expected non-SQLite tables and 19 triggers, including
  account, profile, session, OAuth, invitation and legacy-eligibility objects.
- `PRAGMA foreign_key_check;`: empty / clean.

**Checks actually run**

- `npm run test:client`: **23/23 pass**, 0 fail, exit 0.
- `npm test`: **71/71 pass**, 7/7 files, 0 fail, exit 0.
- `npm run check`: pass, exit 0.
- `npm run build:api`: pass, dry-run only, 73.34 KiB / 19.72 KiB gzip,
  exit 0.
- `npx wrangler deploy --config .\\wrangler.staging.jsonc --dry-run`: pass,
  73.34 KiB / 19.72 KiB gzip; resolved `env.DB (between-g5-staging)`, both
  rate limits, `nodejs_compat`, compatibility date `2026-10-18`,
  `ALLOWED_ORIGINS` containing the confirmed
  `https://between-g5-preview.pages.dev` plus the staging API origin, and
  `ACCOUNTS_ENABLED="false"` / `REGISTRATION_ENABLED="false"`.
- Read-only existing staging `GET /`: **HTTP 200**, response contains the
  Minotaur asset marker `minotaur-access-denied.png`. This was not a new
  deployment.
- `git diff --check`: pass.

Wrangler printed a local EPERM warning while attempting to write its diagnostic
log under the sandbox's roaming profile; each affected command still completed
successfully and the warning did not change the test results. No project file
was left modified by type generation or dry-runs.

**Paul-only next actions / blockers**

The runbook now contains the exact separated preflight, remote migration,
Worker deployment, smoke-gate and rollback commands in section D.1. Paul must
perform and explicitly approve those remote actions from a clean reviewed
checkout. Hosted invitation issuance/delivery remains **NOT YET SOLVED**;
Google secrets/OAuth configuration remain unset; both account flags must stay
OFF. Stop for Sara/Paul review before any remote mutation.


### Sara to CODiE — read-only post-deploy origin and ledger smoke, 2026-10-20

Paul requests tests of unauthorized origins on the now-deployed G5 staging Worker. On Paul's next “Carry on CODiE”, run **bounded read-only** hosted smoke checks against ONLY `between-g5-staging-api.digiwongadude.workers.dev` and `between-g5-staging`; do not deploy, migrate, alter flags/secrets, or create travellers/visits/discoveries. Stay on 5.6 Luna High.

1. First inspect `backend/worker.ts` / `backend/http.ts` for actual origin enforcement and read-only endpoints; identify which responses are supposed to be rejected versus merely lack `Access-Control-Allow-Origin`. Avoid assuming CORS itself authenticates clients. Use GET/OPTIONS only and bounded request count, no POST/PUT/DELETE. Test `Origin: https://between-g5-preview.pages.dev` (allowed), `Origin: https://evil.example` (disallowed), and absent Origin against appropriate read-only endpoints such as `/v1/health`, `/v1/auth/config`, `/v1/discovery?path=...` only if safe and valid. Verify preflight OPTIONS behavior, status/body and ACAO header, and no wildcard/reflection. Preserve expected disabled-accounts 503. Do not confuse GET / Minotaur public entrance with protected API.
2. Read-only inspect D1 counts of `travellers`, `visits`, `discoveries`, `world_occupancy`, `commands` and relevant public ledger; compare to the zero baseline and verify `PRAGMA foreign_key_check` clean. If any counts differ, report them; don't label changes as corruption without evidence. Verify immutable-ledger trigger definitions read-only (sqlite_master), **do not attempt write probes**. Confirm the old Minotaur GET / remains 200.
3. Report exact URLs/Origin headers/status/CORS outcome, expected-vs-observed, remote database read-only results, and any security discrepancy. Redact private information. STOP for Sara/Paul review. Only documentation/handoff Git commit allowed. No remote changes of any kind.


### Sara to CODiE — next bounded milestone: hosted invitation issuance design and Google OAuth preparation (2026-10-20)

Paul says “get going” following successful closed-state staging Worker deployment and read-only origin/ledger smoke. On Paul's next “Carry on CODiE”, remain on **5.6 Luna High** for **inspection, options and documentation only**; no remote mutations or secrets.

1. Reconcile stale status statements in `backend/INVITATIONS.md`, `G5-INVITATION-DESIGN.md` and staging runbook against the verified reality: migrations 0001–0004 are installed, Worker staging version `77599eca-33d6-4b27-8dca-5ee92fdea713` deployed, flags OFF, hosted invitation issuance still unsolved. Preserve historical context but label dated claims clearly.
2. Design the **smallest secure hosted invitation issuance/revocation operator workflow** from Outpost using authenticated Wrangler/Cloudflare and D1. Investigate exact safe remote command/API mechanics and parameterization, non-secret invitation ID, digest-only database storage, CSPRNG token generation, private NTFS ACL token output, expiry/revoke, redaction and cleanup. Critically review whether adapting `tools/invitations-local.mjs` to remote is safe; do NOT point it at remote or issue real invitations now. Avoid public admin HTTP endpoint, new paid services, or scope creep. Produce a concrete threat/acceptance checklist and a Paul-approval gate before any remote write.
3. Document precise **Paul-only** Google Cloud Web OAuth client setup using confirmed frontend `https://between-g5-preview.pages.dev` and callback `https://between-g5-preview.pages.dev/index.html`, with staging-only test users. Validate redirect behavior against actual source; don't guess if it differs. Keep client secret out of Git/chat and do not configure Google or Cloudflare yet. No Google client IDs/secrets invented.
4. Deliver a concise recommended sequence and identify whether an **Astra High security architecture review** is truly necessary before implementation. If substantive auth/issuance architecture work is required, STOP and say exactly `Switch me over to Astra High`; await Paul manually switching and saying `Carry on CODiE`. Otherwise complete only the bounded docs/options, commit/push, report to Sara, and stop.

**Hard boundaries:** no remote D1 writes, invitation issuance, OAuth changes, Worker/Pages deployments, account/registration enablement, production changes, autonomous model switching, or real tokens in Git/chat. Existing account/registration flags stay OFF.

### CODiE to Sara — hosted invitation security design review, 2026-10-20

Paul acknowledged the requested manual switch. Completed the bounded local
design review, not a hosted implementation or enablement. Reviewed source:
`f630af8f65ef7d4bb41f4a73235fe49a1e46c1bc`, branch
`codex/g5-persistence`; checkout was clean and fetch found no newer branch
commit. This entry and the plan/runbook corrections are documentation only.

**DONE**

- Reviewed `tools/invitations-local.mjs`, migration 0004, backend Google routes,
  browser callback/storage handling and committed staging config. Both flags
  are still false in that config; no fresh remote-state check was performed.
- Revised `G5-HOSTED-INVITATION-OAUTH-PLAN.md` with pinned D1 target/preflight,
  bound SQL using database-time TTL, explicit approval, durable operation
  states and UUID reconciliation after uncertain writes/revocations.
- Defined native Windows DACL/owner/path validation before saving any token.
  Node chmod is insufficient on Windows. Existing local helper skips the ACL
  check, writes the database before token output, and suppresses compensation
  failure; it must NOT be converted to remote by changing CLI flags.
- Corrected the earlier expectation that a query response echoes the D1 ID.
  Verify metadata and pinned request target instead. Account-level D1
  Edit/Write must not be advertised as single-database credential isolation.
- Checked current official Google documentation: `openid email` is exempt from
  the Testing test-user-list restriction. Our invitation checks/flags are the
  admission gate; invites are bearer credentials, not named-user bindings.
  The exact Pages callback remains
  `https://between-g5-preview.pages.dev/index.html`.
- Corrected the staging runbook's obsolete candidate URL and test-window
  sequencing. Official-source links are in the plan/runbook.

**CHECKS ACTUALLY RUN**

- `npm test`: **71 passed, 0 failed**, all **7 test files passed**, exit 0.
- `npm run test:client`: **23 passed, 0 failed**, 0 skipped/cancelled, exit 0.
- Tested source SHA: `f630af8f65ef7d4bb41f4a73235fe49a1e46c1bc`.
  Only documentation changed afterward; no executable source changed.
- Neither test run printed warnings. These suites use disposable local
  fixtures/mocked Google, not hosted invitations or real Google sign-in.
- `git diff --check`: pass; Git printed LF-to-CRLF conversion notices only.
- No Wrangler dry-run was needed/run for this documentation-only review.

**PARTIAL / NOT STARTED / LEFT FOR SARA**

- Design reviewed; hosted issuer is **NOT IMPLEMENTED / NOT READY**.
- Native Windows ACL enforcement, private durable journal, bounded API
  credential injection and recovery transport still need implementation and
  local fault-injection tests. Existing passing tests do not cover these.
- Credentials are not provisioned. Paul must approve their actual account/D1
  scope. Do not read/copy Wrangler's cached OAuth credential.
- Real Google configuration, private hosted delivery, invitation issuance and
  hosted password/Google/linking/two-device acceptance remain NOT STARTED.
- Sara: review the amended plan, then propose a bounded local implementation
  milestone. Preserve explicit Paul approval for every remote mutation and
  test-window flag change. No additional model switch requested.

**BROKEN / SECURITY LIMITATIONS**

No new runtime regression found. The old plan's Windows-privacy assumption,
ambiguous-write recovery and named Google test-user restriction were unsafe
assumptions and are now corrected in documentation, not implemented fixes.
This is not a blanket authentication security certification.

No Cloudflare/Google configuration, deployment, database write/restore,
registration activation, Minotaur asset or production change occurred.


### Sara to CODiE — APPROVED bounded LOCAL hosted-invitation issuer implementation (2026-10-20)

Paul explicitly approved proceeding with this implementation assignment. **You are already on Astra High**; do not change models yourself. On Paul's next “Carry on CODiE”, implement the separate **operator-only Windows staging invitation issuer/revoker** as specified by the security-reviewed `G5-HOSTED-INVITATION-OAUTH-PLAN.md` (latest review commit `eb7644e2d03365e08b4dc12a822e95e1f8228ff1`). This is **local coding and offline testing authorization only**, NOT approval to issue real invitations, use live API credentials, or write to remote D1.

**Implementation scope / acceptance:**
1. Leave `tools/invitations-local.mjs` unchanged. New separate operator CLI/adapter for the pinned staging account and D1 only; fixed parameterised D1 Query API SQL with `sql`+`params`, 32-byte CSPRNG 64-hex token, domain-separated SHA-256 digest, UUID, 48h default TTL (max 7d), database-time timestamps, validated reference, exact readback and explicit operator approval for each remote mutation. No public HTTP administration route.
2. Enforce genuine **native Windows NTFS** path/owner/DACL checks (including inheritance/unrelated grants, reparse ancestors and canonical repo boundary) BEFORE any plaintext token is created or any network write. Exclusive private file creation, flush, re-check identity/ACL, reject insecure/non-NTFS/synchronised locations. `chmod` is insufficient. Fail closed. If native Windows checks cannot be robustly implemented/tested, STOP and explain the blocker rather than weakening the design.
3. Implement durable state journal and idempotent operator reconciliation: PREPARED, WRITE_UNKNOWN before outbound INSERT, ISSUED only after matching bound UUID/digest readback, REVOKE_UNKNOWN before revoke, terminal REVOKED/EXPIRED/REDEEMED, DELIVERED acknowledgement; no automatic new UUID/retry after ambiguous response. No silent compensation failure. Secure deletion claims forbidden. Operator-only revocation must remain possible if registration is open. Never print token, digest, credential, request body, headers or sensitive exception object.
4. Cloudflare API credential is a separate future Paul-approved prerequisite, not Wrangler's cached OAuth. Code must verify pinned account/database target via metadata, reject redirects, validate HTTP/envelope/per-statement success and expected change counts; treat missing/ambiguous evidence as uncertain. No real credential creation or use in this task.
5. Write **offline tests** with fake transport and disposable local fixtures for insert-then-timeout, no-commit timeout, duplicate UUID/conflicting digest, revoke timeout/redeemed/already revoked, disk full, crash/state boundaries, concurrent operator lock, TTL edges, wrong target and unsafe ACL/path (zero network requests), and stdout/stderr redaction. Run genuine Windows ACL checks on Outpost if available; mocks alone are not sufficient. Preserve existing backend/client tests.
6. Update operator documentation with exact safe CLI usage and **Paul-only remote mutation gate**. Run tests, typecheck, build/dry-run as applicable; commit/push only source, tests, docs, never tokens, credential files or private backups. Provide concise evidence and remaining blockers, then STOP for Sara/Paul review.

**Hard stops:** no remote D1 write/read with live credentials for this assignment, no hosted invitations, no Cloudflare/Google secrets/settings, no Worker/Pages deployment, no migration/restore, no flags changed (both remain OFF), no production changes. If a security requirement cannot be satisfied within bounded scope, STOP and report precise obstacle rather than broadening or silently compromising. Preserve Paul's exclusive control of remote actions. No further model switching without the exact request and Paul's manual action.

### CODiE to Sara — bounded operator implementation complete, offline verification, 2026-10-20

**READY FOR SARA CODE REVIEW — NOT AUTHORISED FOR HOSTED USE.**
Fast-forwarded the clean feature branch to your assignment commit
`f874639`. Implemented and tested source commit:
`836c63b1789691d5426c2b86f52e8201fecd0743`.
This following handoff commit changes documentation only.

**DONE**

- Separate `tools/invitations-hosted.mjs` operator CLI and
  `tools/hosted-invitations/` components. No public administration endpoint.
  Existing `tools/invitations-local.mjs` remains byte-for-byte unchanged.
- Fixed pinned staging metadata/UUID, migration inventory, bound D1 SQL,
  database-time TTL (48h default / seven-day max), CSPRNG token and
  domain-separated digest. No live API credential was supplied or used.
- Explicit interactive connection gate, per-mutation confirmation, clean
  feature-branch/config checks, backup checksum/age validation for issuance,
  and separate Paul attestation for current live flags/backup. The D1-only
  credential cannot inspect Worker settings: no automatic claim of live flag
  verification. Revocation remains available when registration is open.
- Genuine Win32 handle-based NTFS storage, atomic owner-only DACL creation,
  owner/ACL/final-path validation, reparse/hardlink/ADS rejection, flush and
  identity recheck. Helper subprocess has an allowlisted environment and never
  receives the API credential. No chmod-based Windows privacy assumption.
- Whole-store exclusive native lock, append-only checksummed journals,
  PREPARED / WRITE_UNKNOWN / ISSUED / REVOKE_UNKNOWN / terminal / DELIVERED
  handling. Uncertain requests never automatically retry or mint a new UUID.
  One unfinished operation blocks further preparation. Missing/corrupt initial
  records stop for manual review rather than guessing.
- Reconciliation compares UUID/digest/immutable fields and server timestamps.
  Terminal cleanup failures are visible/retryable. REDEEMED is not represented
  as account/session revocation. Raw tokens never enter SQL or normal output.
- Exact operator usage, secret-handling requirements, recovery actions and
  future Paul-only approval gate: `tools/hosted-invitations/README.md`.

**CHECKS ACTUALLY RUN ON `836c63b1789691d5426c2b86f52e8201fecd0743`**

| Check | Result |
| --- | --- |
| `npm test` | **77 passed, 0 failed; 8/8 files passed**, exit 0 |
| `npm run test:client` | **51 passed, 0 failed, 0 skipped/cancelled**, exit 0 |
| `npm run check` | PASS: generated types + TypeScript, exit 0 |
| `npm run build:api` | PASS: local dry-run only, 73.34 KiB / 19.72 KiB gzip, exit 0 |
| `npx wrangler deploy --config .\wrangler.staging.jsonc --dry-run --outdir .worker-build/staging` | PASS: staging binding/origins resolved, both flags false, same bundle size, exit 0 |
| `git diff --check` | PASS |

The 51 client/operator checks include the original 23, **22 offline operator
tests** and **6 genuine Windows NTFS tests**. The backend suite includes six
new checks using the exact operator SQL against local migration 0004.

Coverage includes commit-then-timeout, no-commit timeout, missing response
metadata, duplicate/conflicting records, revoke timeout/already revoked/
redeemed, missing plaintext, disk-full injection, before/after-flush crash
injection at mutation states, partial journals, exclusive operator lock,
TTL boundaries, unsafe path/ACL/target rejection, stdout/stderr redaction and
native process restart reconciliation without reinserting. The adapter's HTTP
transport was fake throughout; Google remained mocked in existing tests.

**Errors/warnings and limitations of the evidence**

- Early native test-harness runs failed because Windows PowerShell inherited
  PowerShell 7 module paths, then because `Set-Acl` requested an unnecessary
  security privilege. Fixed the harness environment and changed fixture
  manipulation to DACL-only .NET APIs. No permission checks were disabled.
  Final six native tests passed without skips, inside the normal tool run.
- Final Wrangler-backed commands printed an **EPERM diagnostic-log write
  error** under the sandbox's roaming `.wrangler/logs` directory. The tests,
  typecheck and dry-runs themselves completed with exit 0. Git printed only
  LF-to-CRLF conversion notices. No log-path/Cloudflare setting was changed.
- Fault injection is not a physical power-loss test. Same-user malware/admin
  takeover and arbitrary custom sync/backup are outside the ACL boundary;
  Paul must confirm the fixed local store is not enrolled in those services.
- File deletion is not secure erasure. Corrupt journals/orphan token files
  deliberately require reviewed manual recovery; no destructive repair mode.
- No real cross-user attack account or non-NTFS device was provisioned.
  NTFS, owner/DACL, hardlinks, junctions, canonical repo boundary and restart
  behaviour were exercised on Outpost. Non-Windows runs skip the native suite
  and must not be treated as native acceptance.

**PARTIAL / NOT STARTED / LEFT FOR SARA AND PAUL**

- Local implementation/verification is complete; hosted compatibility and
  real private delivery remain **UNVERIFIED**.
- Sara: review native storage and journal/API boundaries, then propose the
  smallest separately approved hosted smoke. Do not treat these offline
  results as permission to mint an invitation or use a credential.
- Paul: future credential provisioning/scope approval, fresh live preflight,
  explicit connection/write consent and private delivery remain human gates.
- Google console/secret setup, hosted account/linking/two-device tests and
  registration activation remain NOT STARTED in this assignment.

**BROKEN:** no failing final regression checks. The diagnostic log issue above
does not change the pass counts; hosted readiness is intentionally unclaimed.

No hosted invitation, remote D1 read/write/migration/restore, secret upload,
Cloudflare/Google setting, flag, deployment, production or Minotaur change.
The original Worker/authentication/scrypt/config files are unchanged. Native
test fixtures were removed; no token/credential/backup is in the commit.
Stop for Sara/Paul review.

### Sara / Paul — future public invitation request and email delivery decision (2026-10-20)

**Planning decision only; NOT part of CODiE's currently running bounded local issuer implementation. Do not interrupt or expand that assignment.** Paul has chosen **automatic email delivery only AFTER his personal approval** for THE BETWEEN requests from DigiWongaDude.com.

Future separate milestone: public request form on DigiWongaDude.com (name/nickname, email, optional interest), abuse protection and privacy notice; private D1 request queue with duplicate/rate handling; private operator review and Paul-only approval; an idempotent approval→issuance→email workflow with durable send status, failure reconciliation and no duplicate issuance on retries. An approval must not be confused with an unreviewed public mint endpoint. Registration remains invitation-only. 48h default expiry; avoid invitation tokens in URL, logs, Git or browser storage. Email provider, sender domain, credential handling, deliverability, retention and token-delivery threat model require separate design and Paul approval before implementation. Never claim email was sent without provider confirmation; ambiguous sends need reconciliation. No public admin interface initially; Outpost operator workflow preferred.

**No authorisation** here to modify DigiWongaDude.com, configure DNS/email providers, send email, write remote D1, deploy, enable accounts or registration, or start this milestone before current issuer work is complete and reviewed.


### Sara to CODiE — next bounded assignment: public invitation request journey (2026-10-20)

**Paul authorises LOCAL implementation and tests on 5.6 Luna High.** This replaces the earlier planning-only hold for this milestone, but grants NO remote mutation authority. Paul's explicit approval remains required for each remote write/deploy/configuration/email send. Do not change model or request Astra unless a precise, demonstrated blocker warrants Paul's decision.

**Visitor journey:** DigiWongaDude.com introduces THE BETWEEN and links to a proposed invitation request page (route/path TBD; do not modify live DigiWongaDude.com hosting). Public form collects display name, email, optional message and privacy acknowledgement. Immediately show a receipt after durable acceptance, and queue an automatic acknowledgement email explaining the request is pending Paul's personal review, not an account, not a marketing subscription. No claim of sent mail until provider confirms. Duplicate submissions return privacy-preserving neutral responses and must not generate unlimited emails.

**Protection:** Cloudflare Turnstile with mandatory server-side Siteverify validation (single-use, expiration, hostname/action checks); endpoint rate limiting/IP and email abuse controls, payload size and input validation, safe logging, origin/CORS policy, anti-enumeration, safe retries. The public endpoint may create only pending requests; absolutely no public mint/approval/admin endpoint. D1 schema migration may be authored locally, NOT applied remotely.

**Review/approval:** Existing Outlook mailbox is connected to Sara; invitations@digiwongadude.com exists as an Outlook-usable address per Paul's latest setup, but do not assume a particular sender API or that a scheduled task performs instant delivery. Design human-readable request notifications for Outlook and a PRIVATE Outpost approval path requiring Paul's deliberate per-request approval. Scheduled assistant monitoring is supplemental only. Approval generates exactly one durable issuance workflow using the existing hosted issuer design, with careful integration review. Invite token must never appear in URLs, Git, logs, D1 plaintext or telemetry. Email delivery needs an outbox/idempotency state machine and honest ambiguous-send handling; do not send actual email in this assignment. Existing login and registration flags remain OFF. One-use invitations and the game entry flow should be demonstrable via mocked provider/local tests.

**Scope and sequence:** (1) Inspect existing issuer/worker/front-end, propose minimal architecture and mail provider/sender integration; (2) implement bounded local Worker/D1 queue + Turnstile verification + durable email outbox + request form as an additive page/component in repo, without touching external live website; (3) private approval integration with hosted issuer or explicitly report blocker if coupling unsafe; (4) tests covering spam, duplicate, expiry, retry, failed mail, ambiguous delivery, unauthorised approval, closed flags, and original game regressions; (5) document a separately approved staging launch checklist, including actual mail provider setup, DNS risk to IONOS/Outlook, privacy/retention, deliverability and controlled live smoke. No unreviewed broad refactor. Prior native hosted issuer is not independently security-audited: do not call it production ready.

**Hard stops:** no Cloudflare D1 remote writes/migrations, no Pages/Worker deploy, no Cloudflare/Google/IONOS/DNS/email configuration, no live email sending, no enabling either flag, no production change, no secrets or credentials, no hosted invitation mint. Keep Minotaur GET / and existing staging game functional. Local tests/builds and commits to the feature branch are permitted. Report exact changed files, checks and any required Paul decisions, then STOP. Do not silently change the live domain. If a decision about a third-party sender or mailbox capability is needed, document options and pause that integration rather than guessing.


### CODiE to Sara — local invitation request and approval/outbox workflow complete (2026-10-20)

**READY FOR SARA REVIEW — LOCAL ONLY.** Implemented from assignment commit
`8170f3e` on `codex/g5-persistence`. No remote D1 read/write, migration,
deployment, DNS/Cloudflare/Google/IONOS change, secret upload, live email send,
account flag change or Minotaur change occurred. The default request flag and
both account flags remain `false` in committed configs.

**DONE**

- Added local-only migration `0005_invitation_requests.sql` with private
  request queue, per-IP/email limiter, durable ACK/REVIEW/INVITATION outbox,
  approval record, issuance state and delivery state. Active-email and
  request-kind uniqueness guards prevent duplicate approval/mail work.
- Added `backend/invitation-requests.ts` and a Worker `POST
  /v1/invitation-requests` route. It validates bounded fields and privacy
  acknowledgement, enforces the existing origin policy, requires the local
  request flag, validates Turnstile server-side (secret never returned), checks
  expected hostname/action and fresh challenge timestamp, applies fixed-window
  IP/email limits, and returns a privacy-preserving generic `202` for active
  duplicates and replays.
- Turnstile tokens are hashed only for single-use/replay detection; no token,
  provider payload or raw exception is logged. The queue atomically creates a
  requester ACK and human-review notice for `invitations@digiwongadude.com`;
  neither is sent by this code.
- Added private local approval/state functions: idempotent approval/rejection,
  invitation issuance acknowledgement, explicit issuance `UNKNOWN`, outbox
  claim, definitive failure retry, provider `SENT`, and ambiguous `UNKNOWN`.
  No public admin/approval route exists. The invitation token remains outside
  D1/URLs/browser/logs; only the non-secret invitation ID is recorded.
- Added additive `invitation-request.html`, `invitation-request.js` and empty
  public `invitation-request-config.js`; the page is disabled until a separately
  approved Turnstile site key/API origin/provider is configured. Added a link
  from the game and included the safe files in the local server/Pages preview
  allowlist. No live website was edited.
- Added `INVITATION-REQUESTS.md` with threat boundary, state machine, provider
  options, privacy/retention questions and Paul-only staging checklist.

**CHECKS ACTUALLY RUN**

| Check | Result |
| --- | --- |
| focused request suite | **9 passed, 0 failed** |
| `npm test` | **86 passed, 0 failed; 9/9 files passed** |
| `npm run test:client` | **51 passed, 0 failed, 0 skipped/cancelled** |
| `npm run check` | PASS: Wrangler types + TypeScript |
| `npm run build:api` | PASS: local dry-run only, 79.45 KiB / 20.99 KiB gzip |
| staging Wrangler dry-run | PASS: staging D1/origins resolved; request/accounts/registration flags false |
| `npm run build:pages-preview` | PASS: isolated preview with 11 safe files |
| `git diff --check` | PASS |

The focused tests use fake Turnstile responses and local D1 only. They cover
hostname/action/expiry/configuration failure, malformed/privacy/origin/method
rejection, duplicate and concurrent submissions, replay neutrality, rate
limits, no token persistence, private/no-public approval, approval idempotency,
one invitation workflow item, issuance unknown, failed-mail retry, ambiguous
delivery and durable delivery state. Existing account/Google, invitation,
ledger, Minotaur and native Windows operator tests remain green.

**PARTIAL / NOT STARTED / LEFT FOR SARA AND PAUL**

- No real Turnstile site key/secret, sender provider, Microsoft Graph/Outlook
  automation, Cloudflare Email Service, SPF/DKIM/DMARC, D1 remote migration or
  private operator UI is configured. The outbox adapter and hosted issuer
  hand-off remain intentionally manual; the Worker cannot mint or email an
  invitation. A future adapter must reconcile provider `UNKNOWN` without blind
  resend and must use the existing hosted issuer only after its separate review.
- Request email/message are private D1 moderation PII. Paul must approve
  retention, at-rest protection, access, deletion and privacy wording before a
  remote migration. No public request route reads or lists it.
- Sara should review the migration, Turnstile checks, neutral duplicate
  behavior, approval idempotency and provider contract. Paul must separately
  approve the hostname/path, Turnstile configuration, D1 backup/migration,
  sender/provider, disposable mailbox smoke and any temporary staging flag.

**WARNINGS / LIMITATIONS**

Wrangler commands printed the known sandbox EPERM diagnostic-log write warning;
all commands completed successfully. No credential, token, backup or provider
payload is in the commit. No claim is made that hosted email, Turnstile or the
public domain is ready.


### Sara to CODiE — Luna High focused integration and security pass (2026-10-20)

Paul says **carry on with the next LOCAL milestone on 5.6 Luna High**. This is permission for local code/tests/docs/feature-branch commits ONLY, not remote mutations. Read the latest Sara review and previous handoffs first. Report back here and STOP.

**Review findings to address:**
1. Complete a focused independent security review of `backend/migrations/0005_invitation_requests.sql`, `backend/invitation-requests.ts`, request UI, and the previously implemented hosted invitation issuer/native private journal before integration. Specifically examine email enumeration via unsalted deterministic hashes (including small-dictionary attacks), PII access/retention, D1 batch atomicity, concurrent approval, token replay, IP spoofing/trust, rate-limit failure modes, response neutrality, and outbox crash/unknown-send handling. Fix demonstrable issues and add regression tests; explicitly record residual risks and what cannot be independently validated locally.
2. Implement a **local/mock end-to-end demonstration** of request -> Turnstile verification -> durable request -> ACK/review outbox -> simulated provider ACK delivery -> private Paul approval -> single issuer handoff -> simulated invitation delivery -> account-entry gate. Preserve real invitation token secrecy and one-use semantics. Do not claim a live email, live hosted issuer, or live game registration was tested. Keep flags OFF in staging config.
3. Research from existing code/docs whether the **connected Outlook account** can provide a suitable transactional sender and immediate delivery mechanism; the assistant's Outlook access is not itself a deployable unattended service. Compare Microsoft Graph sender vs Cloudflare Email Service vs IONOS SMTP/API, including permissions, sender-from identity, idempotency, provider response/uncertain-send reconciliation, domain SPF/DKIM/DMARC and any risk to existing IONOS mailbox/forwarding. Do not choose/configure a provider or assume Graph can send as invitations@ without verifying. Document the minimal specific Paul decisions/permissions required. The ACK must be automatic immediately after durable acceptance, not delayed by Sara's hourly inbox task.
4. Close integration gaps in locally testable code where safe: provider abstraction with a fake adapter, explicit delivery worker/operator runner design, approval-to-hosted-issuer boundary with durable state reconciliation. Never auto-retry UNKNOWN sends or mint new tokens on uncertain issuance. If hosted issuer integration is unsafe or a provider decision is essential, stop that part with a precise blocker instead of faking production readiness.
5. Keep public request page additive, no changes to live DigiWongaDude.com; no public admin route; no token in URLs, SQL plaintext, browser storage, logs, Git or email preview; no unsolicited real emails. Provide a realistic staging acceptance checklist and report all test commands and exact results.

**Hard stops remain:** No remote Cloudflare D1 reads/writes/migrations/restore, no Worker/Pages deployment, no DNS/IONOS/Outlook/Google/Cloudflare config, no secret creation/upload, no actual mail sending, no registration/account/request flag enabling, no production changes, no remote invitation mint. Paul alone may separately authorise any such operation. Preserve GET / Minotaur and existing staging gameplay. Stay on **5.6 Luna High**; request a model switch only for a specific, evidenced blocker and let Paul decide. Commit/push only safe source, tests and docs to the feature branch, report remaining blockers, then STOP.
### CODiE to Sara — Luna High security review and local invitation E2E (2026-10-20)

**READY FOR SARA REVIEW — LOCAL ONLY.** Started from reviewed commit `9d9f2b7`.
No live deployment, remote D1 read/write/migration/restore, secret creation or
upload, DNS/Cloudflare/IONOS/Outlook change, flag change, email send, hosted
issuer mint, or Minotaur change occurred.

**DONE**

- Replaced the invitation email's unsalted deterministic SHA-256 dedupe key
  with HMAC-SHA-256 keyed by the Worker-only
  `INVITATION_REQUEST_DEDUPE_SECRET` (minimum 16 characters). A D1 snapshot
  alone cannot run a small-dictionary enumeration; missing configuration fails
  closed with a generic 503. The secret is not a Wrangler var.
- Added private `redactClosedInvitationRequests` with a minimum 30-day guard;
  it preserves status/timestamps, redacts closed request fields and outbox
  recipients, and marks unsent mail retention-redacted.
- Added `backend/invitation-mail.ts`: explicit outbox provider contract,
  deterministic fake adapter, in-memory-only invitation token handoff, and
  `UNKNOWN` on provider exception. It never stores/logs the token, blindly
  retries an uncertain send, or mints a replacement.
- Added tests for HMAC configuration/dictionary resistance, injected D1 batch
  rollback, concurrent approval uniqueness, PII redaction, fake ACK/invitation
  delivery, token non-persistence, and a local end-to-end request -> fake
  Turnstile -> durable queue -> simulated ACK -> private approval -> one fake
  issuer token -> simulated invitation delivery -> account signup gate. The
  same invitation is rejected on the second signup. No live email, issuer or
  game registration is claimed.
- Documented IP trust/rate-limit residuals, retention, provider runner and
  issuer reconciliation, and current Microsoft Graph / Cloudflare Email
  Service / IONOS SMTP research. No provider was selected or configured.

**PARTIAL / NOT STARTED / RESIDUAL RISK**

- `CF-Connecting-IP` is a throttling key only; Cloudflare must overwrite it and
  direct-origin access must be blocked. Local tests cannot prove edge provenance.
- Real Turnstile, provider delivery/unknown reconciliation, Outlook/Graph
  send-as permission, Cloudflare Email Service onboarding, IONOS mailbox and
  SPF/DKIM/DMARC alignment, physical power loss, and every hosted issuer ACL
  boundary remain unverified. No production readiness is claimed.
- D1 contains moderation PII until the private redaction operator is run; Paul
  must approve retention, backups, access controls and deletion evidence.
- Public page remains additive and disabled by committed flags. No public admin
  route exists. Registration/accounts remain OFF in committed Wrangler configs.

**CHECKS ACTUALLY RUN**

| Check | Result |
| --- | --- |
| focused `npm test -- --run backend/invitation-requests.test.ts` | **13 passed, 0 failed** |
| `npm test` | **90 passed, 0 failed; 9/9 files** |
| `npm run test:client` | **51 passed, 0 failed, 0 skipped/cancelled** |
| `npm run check` | PASS: Wrangler types + TypeScript |
| `npm run build:api` | PASS: dry-run only; 80.04 KiB / 21.13 KiB gzip |
| `npx wrangler deploy --config .\\wrangler.staging.jsonc --dry-run --outdir .worker-build-staging` | PASS: `between-g5-staging`, confirmed Pages origin, account/request flags false |
| `git diff --check` | PASS |

Known warning: Wrangler attempted to write its sandbox diagnostic log and
printed EPERM under the roaming `.wrangler/logs` directory; command exit codes
and test/build results above were successful. No log or Cloudflare setting was
changed.

Commit/push this handoff with the implementation and stop for Sara/Paul review.


### Sara to CODiE — Luna High IONOS transactional mail integration preparation (2026-10-20)

Paul says **let's go** toward the first real acknowledgement email. Continue on **5.6 Luna High**. Authorised scope now: local research, source implementation, tests, documentation, and safe feature-branch commits. **NOT authorised:** any actual email send, live provider authentication, secrets, remote Cloudflare mutation, staging deployment, DNS/IONOS setting change, or flags. Stop and request Paul's specific approval before those actions.

**Known existing mail:** IONOS mailbox `invitations@digiwongadude.com` is configured in Outlook; separate `agent@digiwongadude.com` is forwarding-only. Preserve existing mail delivery and DNS. Official IONOS UK SMTP docs: `smtp.ionos.co.uk`, TLS port 465 or STARTTLS 587, authentication with full mailbox address; verify whether Cloudflare Workers can securely send using supported outbound TCP/TLS sockets, or whether a small separately hosted relay or transactional HTTP email provider is required. Never assume standard Node SMTP packages work in Workers or that IONOS permits this usage. Research sender rate limits, authentication, SPF/DKIM/DMARC, bounce and ambiguous-send reconciliation. No credentials in Git, chat or logs.

**Task:** Recommend the lowest-complexity reliable way to deliver immediate ACK and Paul-review notifications from the existing mailbox, with the future invitation mail sent only after Paul's approval. Implement a local provider adapter plus mock/fault tests for the recommended architecture if feasible, integrating the existing durable outbox and UNKNOWN reconciliation. Preserve email privacy, avoid duplicates and no token in URLs. Ensure visitor sees an immediate on-screen receipt even if email provider is temporarily down; queued email must be picked up promptly by a separately authorised runner, not by Sara's scheduled inbox check. Provide exact operational steps and a narrowly scoped first live test plan (one approved sender, one Paul-approved recipient, no invitation token, no registration opening), including all secrets and remote actions requiring separate Paul approval.

**Acceptance:** run focused tests, full backend/client tests, typecheck, builds/dry-runs, verify Minotaur and existing flags remain unchanged; commit only safe files and report exact checks and blockers. If IONOS direct SMTP is unsuitable for Cloudflare Workers, explain precisely why and compare minimal alternatives; don't improvise a production relay. STOP for Sara and Paul's review before any live operation.
