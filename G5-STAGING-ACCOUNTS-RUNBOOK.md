# G5 staging accounts and Google sign-in runbook

This is a manual, review-first runbook for the isolated G5 staging test. It is
not an instruction to deploy. Paul controls every deployment, remote migration,
secret upload, Cloudflare setting change and registration enablement.

**Admission gate:** Paul selected invitation-only alpha registration. The
[invitation implementation](backend/INVITATIONS.md) and the local-only operator
utility are ready for local code review, not deployment. **Hosted invitation
issuance and delivery are NOT YET SOLVED.** `tools/invitations-local.mjs` must
not be pointed at remote D1 or used to handle real hosted invitations. Do not
enable registration until hosted issuance, secure delivery, migration/Worker
compatibility and Paul's approval are separately satisfied. Pending migration
0004 must ship with its reviewed Worker. All account-test steps below are
conditional on that gate.

## Proposed isolated origins

| Purpose | Exact value |
| --- | --- |
| Frontend preview origin | `https://codex-g5-persistence.between-g5-preview.pages.dev` (**UNCONFIRMED candidate**) |
| OAuth redirect URI | `https://codex-g5-persistence.between-g5-preview.pages.dev/index.html` (**unconfirmed until Pages project/branch exists**) |
| Staging API | `https://between-g5-staging-api.digiwongadude.workers.dev` |
| Frontend source config | `npm run build:pages-preview` generates an isolated `dist/` allowlist with the staging API only |

Cloudflare Pages is the practical frontend route because the repository is a
static browser bundle and the existing `workers.dev` hostname is already the
API. No Pages project currently exists in this repository/configuration, so the
hostname cannot be confirmed before Paul/Sara provision it. The candidate is
valid only if project `between-g5-preview` deploys branch `codex/g5-persistence`;
Cloudflare's branch alias would then be the value above. If a different project
name or branch alias is chosen, replace every candidate value before deployment.
Do not use the live custom domain or x10 hosting. The source staging config
allowlists the candidate and the API origin, but no route is created by this
commit. Browser requests must use the confirmed preview origin exactly; an
origin with a path, trailing slash, query, or fragment is not an OAuth origin.

## A. Isolated Pages preview preparation (Paul only)

This is a click-by-click preparation checklist. CODiE has not created a Pages
project, deployed a preview, changed Cloudflare settings or configured OAuth.
The candidate hostname above is **not real until the dashboard confirms it**.

1. Build the preview from a clean checkout of `codex/g5-persistence`:

   ```text
   npm run build:pages-preview
   ```

   The command writes only the ignored `dist/` directory. Its eight files are
   `index.html`, `style.css`, `app.js`, `engine.js`, `view.js`,
   `journey-client.js`, `account-client.js` and generated `g5-config.js`.
   Never point Pages at the repository root: that would expose Worker source,
   migrations, tests and operational notes.

2. In Cloudflare Dashboard open **Workers & Pages → Create application →
   Pages → Connect to Git → GitHub**, then select
   `DigiWongaDude/PrimeLabyrinth`. Create a separate project named
   `between-g5-preview` only if that name is available. Do not select the live
   GitHub Pages project, `DigiWongaDude.com`, x10 hosting or a custom domain.

3. Use these project settings: framework preset **None**, production branch
   `codex/g5-persistence`, build command `npm run build:pages-preview`, output
   directory `dist`, and repository root `/`. Add no environment variables,
   secrets or OAuth values. Keep the Worker variables and both account flags
   unchanged (`ACCOUNTS_ENABLED=false`, `REGISTRATION_ENABLED=false`).

4. Paul may save/deploy the Pages preview for the private sea trial. Record
   the exact HTTPS origin copied from the Pages dashboard after deployment;
   do not infer it from the candidate. If Cloudflare offers Access controls,
   use the approved test-user policy, but remember that the Worker admission
   gate—not Pages visibility—is authoritative.

5. Verify the actual origin before any Google configuration: open the copied
   URL, confirm the bundle loads, and inspect the page source/network requests.
   Confirm `g5-config.js` contains only the known staging API origin and that
   `/backend`, `/migrations`, `/tests`, `.env*`, package files, credentials and
   handoff notes are not served. If the origin differs from the candidate,
   update the Worker origin allowlist through Paul's reviewed deployment plan;
   do not add a guessed URL to Google.

6. Only after the exact origin and security review are recorded may Paul
   continue to the staged order below. This preview preparation has no effect
   on G1–G4 GitHub Pages, DigiWongaDude.com, x10, DNS or production.

**Required staged order after the preview URL is confirmed:**

1. Confirm the Pages URL and review the static output/security boundary.
2. Make a private staging D1 backup and record checksum, migrations and rows.
3. Paul applies migration 0004 remotely and deploys the Worker with both flags
   closed; CODiE does not run those commands.
4. Run closed-state smoke, origin, ledger and Minotaur preservation checks.
5. Configure Google client values/secrets only against the confirmed preview
   redirect URI.
6. Solve and review secure **hosted invitation issuance/delivery** (currently
   NOT YET SOLVED); do not reuse the local utility for remote D1.
7. Open a tiny, Paul-approved invited-account acceptance window, then close it
   again and record evidence.

The order is deliberate: no real invitation or OAuth client is needed merely
to create the static preview.

## B. Preflight and private D1 backup

Follow [`STAGING-D1-BACKUP-RUNBOOK.md`](STAGING-D1-BACKUP-RUNBOOK.md) exactly.
It is the Paul-only, read-only procedure for the staging export and evidence
inventory. In summary, Paul must:

1. Confirm the reviewed branch and clean tree, and keep the existing G1–G4
   GitHub Pages site and DigiWongaDude.com unchanged.
2. Export `between-g5-staging` with `wrangler d1 export --remote` and the
   checked-in `wrangler.staging.jsonc` into a private folder outside Git.
3. Record the SHA-256, UTC time, Wrangler version, migration list, actual
   `PRAGMA table_list` inventory, per-existing-table row counts and
   `PRAGMA foreign_key_check;` output. Do not assume the database is empty or
   that all migrations/tables exist; record absent tables as absent.
4. Keep the sensitive SQL and evidence private until the invited test and
   rollback window are closed. A Time Travel bookmark is supplementary, not a
   replacement for the export.

CODiE does not run the export, remote SQL, migration, restore or deployment.

## C. Google Cloud configuration (Paul/Sara, no secrets in Git)

1. In the approved Google Cloud project create/select a **Web application** OAuth
   client. Restrict the consent-screen audience to named test users while this
   is staging.
2. Add this exact authorised redirect URI, byte-for-byte:

   ```text
   https://<confirmed-pages-origin>/index.html
   ```

   Add the exact JavaScript origin `https://<confirmed-pages-origin>` where
   Google requests it, only after confirming the Pages project and branch alias.
   Substitute the dashboard's real hostname; do not enter the unconfirmed
   candidate, API origin or Minotaur root.
3. Put the public client ID and redirect URI in the staging Worker vars. Put the
   client secret only into the Cloudflare secret store, never into JSON, GitHub,
   the browser bundle or chat:

   ```text
   GOOGLE_CLIENT_ID=<public client id>
   GOOGLE_REDIRECT_URI=https://<confirmed-pages-origin>/index.html
   npx wrangler secret put GOOGLE_CLIENT_SECRET --config wrangler.staging.jsonc
   ```

4. Keep `ACCOUNTS_ENABLED=false` and `REGISTRATION_ENABLED=false` for the first
   deployment and smoke pass. Google configuration alone must not open signup.

## D. Initial staging deployment (registration closed)

Only Paul runs these commands after approval. The initial source deployment is
performed after the backup and migration preflight; this runbook does not run
them:

```text
npx wrangler d1 migrations apply between-g5-staging --remote --config wrangler.staging.jsonc
npx wrangler deploy --config wrangler.staging.jsonc
```

Before the deploy, verify the source dry-run has resolved the staging D1,
`REQUEST_LIMIT`, `CREATE_LIMIT`, the preview allowlist and both flags set to
`false`. Afterward verify:

- `GET /` still returns the Minotaur entrance and the exact
  `https://digiwongadude.com/between/assets/minotaur-access-denied.png` URL.
- Allowed-origin `GET /v1/health` returns G5 health; missing/foreign origins
  are denied; `GET /v1/auth/config` is `503 accounts_disabled`.
- Account signup returns `503 accounts_disabled` while accounts are off; once
  accounts are on and registration remains off, signup returns
  `403 registration_closed`. No probe creates an identity.
- D1 foreign-key checks remain clean and existing ledger rows match the
  pre-migration snapshot. New profile/eligibility backfills must match their
  migration specification; do not expect every table count to be unchanged.

## E. Invited account test window

After the invitation implementation passes review and closed smoke checks,
Paul may approve deployment and invitation redemption. Record the exact Worker
version and flags. Use privately issued disposable invitations for new password
and Google accounts. The backend must reject direct API signup without a valid
invitation even when the caller supplies an allowed Origin. Frontend Access
alone cannot provide this guarantee, and Google test users do not gate password
signup. Keep registration closed until the code and migration provide this
enforcement; close it again at the end of testing.

### Password account

1. Redeem a disposable invitation with a 15+ character password; save the one-time recovery
   key privately. Confirm the returned profile has a stable public ID.
2. Log in successfully, log in with the wrong password, try a nonexistent
   username, and confirm failures are generic and rate limits engage.
3. Open a second browser/device, log in to the same account, and confirm the
   same traveller ID, active path, history and shared discovery attribution.
4. From a recent session change the password; confirm earlier sessions cannot
   act and the new session can resume. Generate a replacement recovery key and
   verify the old one cannot be replayed.
5. Recover with the one-time key, confirm password replacement and all-session
   revocation, then verify a second recovery attempt with the old key fails.

### Real Google sign-in and explicit linking

1. Start Google login from the confirmed Pages preview. Verify state, nonce, S256 PKCE and the
   exact redirect return to `/index.html`; test cancel, expiry and replay.
2. Sign in with a named Google test user and confirm a new account requires
   registration open and a valid invitation. Repeat on a second device without
   an invitation and confirm the same Google `sub` resumes the same traveller.
3. Create a password account, sign in recently, choose **Link Google account**,
   and complete the real Google flow. Confirm the
   traveller ID/history/public ID are unchanged.
4. Attempt to link that Google identity to a different password traveller;
   confirm `identity_already_linked` and no merge. Confirm equal email with a
   different Google `sub` is not treated as the same identity.
5. Log out the initiating account before the callback and confirm linking fails
   without attaching the Google subject. Confirm no provider token, secret,
   username or internal traveller ID appears in public discovery responses.
6. Separately test an existing legacy traveller with **Keep this traveller and
   add Google login**; that button upgrades a legacy identity, not a password
   account. Check the migration eligibility and continuity contract in the
   invitation design.

### Shared discovery attribution

1. Device A commits a first visit to a canonical full path and records the
   returned discoverer public ID/name and timestamp.
2. Device B reaches that same full path and confirms the first committed visit
   remains the owner; a second path reaching the same mathematical triple is a
   separate location.
3. Rename the owner and confirm the displayed current name changes while the
   stable public ID and first-discovery timestamp do not. Anonymise only in a
   disposable test and confirm the ledger remains with `Anonymous traveller`.

## F. Rollback and stop conditions

1. If any smoke, auth, attribution or Minotaur check fails, immediately set
   `REGISTRATION_ENABLED=false` (and `ACCOUNTS_ENABLED=false` if necessary) and
   stop the controlled account test. Do not drop the additive accounts tables.
2. Restore the last reviewed compatible Worker version from the Cloudflare
   version list/dashboard. A pre-accounts Worker cannot authenticate upgraded
   travellers, so prefer a forward fix; never roll back by deleting D1 tables.
   Keep registration closed on rollback; never restore a pre-invitation version
   with registration enabled. Preserve spent-invitation records.
3. Use the private D1 export only for a separately approved data-recovery plan
   after identifying corruption. Preserve the immutable exploration ledger.
4. Re-run the Minotaur, health, origin, closed-registration and foreign-key
   checks. Keep the preview disabled until Sara signs off.

## Evidence required for Sara review

Record the exact source/deployed SHAs, Worker version ID, backup checksum,
migration output, test identities (non-secret labels only), pass/fail result for
each item above, and any warnings. This package intentionally performs no
deployment, remote migration, DNS/Cloudflare setting change, secret upload,
registration enablement or production merge.
