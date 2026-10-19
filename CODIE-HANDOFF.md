# Issue #38 reset handoff — CODiE, 2026-10-19

**For Sara. Not a deployment signoff. Paul alone deploys.**

## Branch / commits

- Branch: `codex/g5-persistence`, draft PR #35; no merge to `gh-pages`.
- Baseline: `d817b79` (includes Sara's Minotaur source change).
- WIP checkpoint pushed FIRST: `a1c6dcc` — all existing account implementation preserved.
- Core hardening: `94fac12488981a0a05ec906179f0e553ad2b04a7`.
- Latest implementation: `7cc7aea8449eec38974184b89ecf52e618e62851` (clears displayed identity/recovery key on sign-out).
- This document's commit is the subsequent handoff-only commit. Its exact SHA is posted on Issue #38; use that SHA for checkout. No intended uncommitted source files remain.
- Work was isolated in `C:\Users\digiw_\AppData\Local\Temp\between-g5-accounts`; do not assume the older workspace/worktree is at this head. Fetch from GitHub.

## DONE — implemented, subject to independent review

- `backend/migrations/0003_accounts.sql`: additive profiles/public IDs, accounts, sessions, OAuth attempts and rate-limit tables; profile backfill and creation trigger. Existing traveller/visit/discovery/command tables retained.
- `backend/accounts.ts`, `backend/http.ts`: bounded JSON, case-insensitive usernames, salted native scrypt (`N=16384,r=8,p=5`), constant-time password comparison, generic login failures, shared rate limits, hashed credentials/tokens, expiring sessions.
- Routes: `GET /v1/auth/config`, `GET /v1/account`; POST `/v1/auth/{signup,upgrade,login,recover,logout,rotate,google/start,google/complete}` and `/v1/account/{name,password,recovery,anonymise}`.
- Recovery key is one-use, rotated during recovery; password/recovery/link mutations revoke prior sessions. Credential CAS and replacement session creation are transaction-coupled; authenticated changes recheck the authorising session inside that transaction. Sensitive changes require recent sign-in; session rotation does not refresh authentication age.
- Google authorization code + S256 PKCE, state/nonce, signature/issuer/audience/expiry/issued-at/verified-email validation, stable `sub`, explicit linking only, no email merging. Configuration absent => fail closed; no permissive OAuth stub.
- Legacy upgrade retains traveller/history/ownership, disables legacy auth and replaces the old token hash, so an old Worker cannot resurrect that credential.
- `backend/worker.ts`: public discovery projections expose only `discoverer.publicId` and `discoverer.displayName`; added `GET /v1/discovery?path=...`. Existing private journey, exploration, CORS and exact Minotaur `GET /` retained. First discoverer is the first committed visit, with immutable ownership per full canonical path. Current name follows renames; deletion removes authentication and displays `Anonymous traveller` while retaining the ledger/public ID.
- `account-client.js`: tab-scoped sessions, signup/login/recovery/settings/Google callback, same-account pending-command retention, rotation and cross-device sign-in restoration. New session is retained if the following journey read fails. Password upgrade and deletion guard pending movement. Default browser fetch binding fixed here and in `journey-client.js`.
- `app.js`, `index.html`, `style.css`, `serve.mjs`: functional G5 account controls, callback parameter scrubbing, CSP/referrer policy and recovery-key display. Logout/deletion clears displayed credentials. Engine/geometry files unchanged; G1–G4 remain local.
- `wrangler*.jsonc`: accounts and registration remain OFF; Google settings blank. `g5-config.js` unchanged/blank. `dev:accounts` enables only the loopback local emulator.

## PARTIAL

- Google flow is implemented and tested with RSA-signed mocked provider responses, **not a real Google project/account**.
- Account UI exists, but final browser/mobile/keyboard/accessibility/error-state review is Sara's. Only a local browser signup succeeded during this work; no full two-device browser journey was completed.
- Security/migration/rollback review and staging-specific build/config verification remain outstanding. Existing `ACCOUNTS-HANDOFF.md` is a technical draft, not a verified deployment checklist.
- Public ID is stable after anonymisation; this deliberately preserves attribution and is not complete erasure/unlinkability. Confirm this user-facing policy before signup opens.

## BROKEN / known failure cases and blockers

- No known failing automated test at the tested core revision; **final full-tree regression has not been run**. Do not interpret this as production readiness.
- Secure scrypt likely exceeds the current Free Worker CPU allowance. Target-plan benchmarking/approval is a deployment blocker; do not weaken hashing to fit. No paid plan was enabled.
- Lost auth mutation responses can require signing in again (auth requests are not generally idempotent). A newly issued recovery key can be unavailable after a failed follow-up journey request; generate a replacement from a recently authenticated session. A pending journey remains retryable with its original command ID.
- Local Wrangler testing emitted an environment log-write error: `EPERM: operation not permitted, open 'C:\Users\digiw_\AppData\Roaming\xdg.config\.wrangler\logs\wrangler-2026-10-19_11-24-29_989.log'`. Focused tests nevertheless finished 13/13, process exit 0. This was not an application assertion failure.
- Browser screenshot capture timed out after successful signup; no final screenshot artifact/visual signoff exists.

## TESTS ACTUALLY RUN

These are historical results, not claims that every command ran on final HEAD.

| Command/check | Actual result / scope |
| --- | --- |
| `npm test -- backend/crypto.test.ts` | 1 passed; native Workers scrypt, earlier implementation. |
| `npm test` | Initially 19 passed; later 32 passed across 5 files before checkpoint (before final legacy-token retirement, fetch-binding and session hardening edits). |
| `npm test -- backend/accounts.test.ts` | Initially 11 passed; latest focused run after core hardening: **13 passed**, exit 0, with log-write warning above. Includes signed mocked Google responses, recovery/races, linking, attribution, flags and two independent client stores. |
| `npm run test:client` | Initial 13 passed / 5 failed: VM harness lacked `URLSearchParams`. Added it to `tests/legacy-view.test.mjs`; rerun **18 passed**, before final account-client/UI changes. |
| `npm run check` | Earlier missing Node crypto/duplex typing issues corrected; latest run after core hardening **passed**, exit 0. |
| `npm run migrate:local` | Migrations 0001–0003 applied successfully to isolated LOCAL emulator only. |
| `npm run build:api` | **Passed**, exit 0, local Wrangler `--dry-run`; 71.94 KiB / gzip 19.39 KiB. No upload/deployment. Default config, not staging config. |
| Local browser signup | Initially failed `Illegal invocation`; fixed native-fetch binding in both clients. Reload/signup then succeeded, saved G5 ROOT revision 0 displayed. No subsequent complete UI regression. |

The final 4-line UI clear-on-sign-out change (`7cc7aea`) was not browser-retested. No new tests were authored after Paul's reset instruction; only focused core tests/typecheck/dry-run were run.

**NOT RUN:** final full backend/client regression; staging-config dry-run; real Google login/link/migration; remote D1 migration; deployed CPU/load testing; remote smoke; final mobile/two-device browser flow; full UI security/accessibility review. No deployment commands without `--dry-run` were run.

## NOT STARTED / SARA TODO (priority order)

1. Independently review auth/session transactions, revocation races, OAuth validation/linking, legacy retirement, public/private projections and migration preservation. Add adversarial/concurrency tests where needed; review the `changes()` CAS/session coupling and lost-response cases.
2. Run final `npm ci`, `npm run check`, `npm test`, `npm run test:client`, `npm run build:api`. Test stale/expired sessions with pending movement, account switching, failed network requests after rotation, legacy upgrade, anonymisation and displayed-key cleanup. Record exact revision/results.
3. Verify staging-config dry-run, full migration safety/backups/rollback and source-built Minotaur entrance. Existing `staging-smoke.mjs` assumes an empty archive; review before reuse. Never migrate or deploy on Paul's behalf.
4. With Paul's Google configuration and approved preview, test real Google cancellation/expiry/replay/link conflict, account upgrade and two-device journey restoration. Review CSP against the final preview/API URLs.
5. Review target Workers plan/CPU budget for scrypt and rate limits. Benchmark only on an approved environment; ask Paul before plan changes or expenditure.
6. Polish account UI and `ACCOUNTS-HANDOFF.md`/README/STAGING-HANDOFF; produce the verified **Ready to Deploy** checklist for Paul only after blockers resolve. Reconcile old legacy-only instructions.

## CONFIG NEEDED FROM PAUL

- Approved isolated HTTPS preview URL and exact frontend OAuth callback URI; corresponding API allowed Origin.
- Google Cloud OAuth Web client ID, consent/test audience and authorised redirect URI. Store client secret as `GOOGLE_CLIENT_SECRET` using the secret mechanism, never Git/chat.
- Cloudflare plan/CPU budget decision, approved traveller cap and invited-test window.
- Paul alone sets deployment config, applies remote migration, deploys and enables accounts/registration after review.

## DEPLOY STATUS

**NOT DEPLOYED. NOT READY FOR PUBLIC SIGNUP.** No staging/live/DNS changes, remote migrations, purchases or production merges. Sara reviews and prepares; Paul deploys.

— CODiE
