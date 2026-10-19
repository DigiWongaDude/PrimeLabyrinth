# G5 staging accounts and Google sign-in runbook

This is a manual, review-first runbook for the isolated G5 staging test. It is
not an instruction to deploy. Paul controls every deployment, remote migration,
secret upload, Cloudflare setting change and registration enablement.

## Proposed isolated origins

| Purpose | Exact value |
| --- | --- |
| Frontend preview origin | `https://between-g5-preview.digiwongadude.com` |
| OAuth redirect URI | `https://between-g5-preview.digiwongadude.com/index.html` |
| Staging API | `https://between-g5-staging-api.digiwongadude.workers.dev` |
| Frontend source config | copy `g5-config.staging.example.js` to `g5-config.js` in the preview build only |

The preview hostname and DNS/Pages route are proposals, not provisioned by this
commit. Do not add it to the live site or to x10 hosting. The source staging
config allowlists both the proposed preview origin and the API's own origin so
local/API smoke checks remain possible. Browser requests must use the preview
origin exactly; an origin with a path, trailing slash, query, or fragment is not
an OAuth origin.

## A. Preflight and private D1 backup

1. Confirm the reviewed branch and clean tree:

   ```text
   git switch codex/g5-persistence
   git pull --ff-only origin codex/g5-persistence
   git rev-parse HEAD
   git status --short
   ```

2. Confirm the proposed preview route has not been provisioned accidentally.
   Keep the existing G1–G4 GitHub Pages site and DigiWongaDude.com unchanged.
3. Export staging D1 to a private, access-controlled folder before any remote
   migration. Do not put the export in Git, a frontend folder, chat or an issue:

   ```text
   npx wrangler d1 export between-g5-staging --remote --config wrangler.staging.jsonc --output <private-backup>/between-g5-staging-<UTC>.sql
   npx wrangler d1 migrations list between-g5-staging --remote --config wrangler.staging.jsonc
   ```

   Record the backup checksum, UTC time, row counts for `travellers`, `visits`,
   `discoveries`, `commands`, `accounts`, `profiles`, `sessions` and
   `oauth_attempts`, plus `PRAGMA foreign_key_check;`. Keep the backup until the
   invited test and rollback window are closed.

## B. Google Cloud configuration (Paul/Sara, no secrets in Git)

1. In the approved Google Cloud project create/select a **Web application** OAuth
   client. Restrict the consent-screen audience to named test users while this
   is staging.
2. Add this exact authorised redirect URI, byte-for-byte:

   ```text
   https://between-g5-preview.digiwongadude.com/index.html
   ```

   Add the exact JavaScript origin `https://between-g5-preview.digiwongadude.com`
   where Google requests it. Do not add the API origin or the Minotaur root.
3. Put the public client ID and redirect URI in the staging Worker vars. Put the
   client secret only into the Cloudflare secret store, never into JSON, GitHub,
   the browser bundle or chat:

   ```text
   GOOGLE_CLIENT_ID=<public client id>
   GOOGLE_REDIRECT_URI=https://between-g5-preview.digiwongadude.com/index.html
   npx wrangler secret put GOOGLE_CLIENT_SECRET --config wrangler.staging.jsonc
   ```

4. Keep `ACCOUNTS_ENABLED=false` and `REGISTRATION_ENABLED=false` for the first
   deployment and smoke pass. Google configuration alone must not open signup.

## C. Initial staging deployment (registration closed)

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
- Registration attempts remain `403 registration_closed` (or the existing
  closed-registration response) and no test identity is written.
- D1 foreign-key check and the pre-migration row-count record still match.

## D. Invited account test window

After smoke checks pass, Paul explicitly enables only the invited test window
(not public registration) and records the exact Worker version and vars. Use
disposable test usernames and named Google test users. Close registration again
when this checklist is complete.

### Password account

1. Sign up with a 15+ character disposable password; save the one-time recovery
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

1. Start Google login from the preview. Verify state, nonce, S256 PKCE and the
   exact redirect return to `/index.html`; test cancel, expiry and replay.
2. Sign in with a named Google test user and confirm a new account is created
   only while the invited window is open. Repeat on a second device and confirm
   the same Google `sub` resumes the same traveller.
3. Create a password account, sign in recently, choose **Keep this traveller
   and add Google login**, and complete the real Google flow. Confirm the
   traveller ID/history/public ID are unchanged.
4. Attempt to link that Google identity to a different password traveller;
   confirm `identity_already_linked` and no merge. Confirm equal email with a
   different Google `sub` is not treated as the same identity.
5. Log out the initiating account before the callback and confirm linking fails
   without attaching the Google subject. Confirm no provider token, secret,
   username or internal traveller ID appears in public discovery responses.

### Shared discovery attribution

1. Device A commits a first visit to a canonical full path and records the
   returned discoverer public ID/name and timestamp.
2. Device B reaches that same full path and confirms the first committed visit
   remains the owner; a second path reaching the same mathematical triple is a
   separate location.
3. Rename the owner and confirm the displayed current name changes while the
   stable public ID and first-discovery timestamp do not. Anonymise only in a
   disposable test and confirm the ledger remains with `Anonymous traveller`.

## E. Rollback and stop conditions

1. If any smoke, auth, attribution or Minotaur check fails, immediately set
   `REGISTRATION_ENABLED=false` (and `ACCOUNTS_ENABLED=false` if necessary) and
   stop invited testing. Do not drop the additive accounts tables.
2. Restore the last reviewed compatible Worker version from the Cloudflare
   version list/dashboard. A pre-accounts Worker cannot authenticate upgraded
   travellers, so prefer a forward fix; never roll back by deleting D1 tables.
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
