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
