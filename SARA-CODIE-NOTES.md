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
