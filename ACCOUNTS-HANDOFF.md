# G5 accounts — issue #38

Implementation for review on `codex/g5-persistence` / draft PR #35. **Not deployed.**
Paul runs deployments. Both `ACCOUNTS_ENABLED` and `REGISTRATION_ENABLED` remain
`false` in committed configurations; `g5-config.js` remains blank.

## Identity and privacy contract

- A traveller keeps the same internal ID, private history, active path and discovery
  ownership when adding password or Google login. Migration 0003 adds authentication
  tables without editing existing visits, discoveries or commands.
- A random, separate 128-bit public ID identifies a discoverer. Public responses
  expose only this ID and the current display name, never usernames, email, Google
  subject, login IDs, session tokens or personal journey history.
- Names are not unique. Renaming updates the displayed credit on earlier discoveries;
  the first discoverer's underlying ID and timestamp never change. It is the first
  **committed** visit, not the first request or response, that owns a discovery.
- Full canonical paths remain authoritative. Different paths to the same triple
  retain independent discoverers. This feature records mapped rooms, not AI images.
- Account deletion removes authentication records and displays `Anonymous traveller`.
  The immutable exploration ledger, associated visits and stable anonymous public ID
  remain. The UI explains this retention before confirmation. This is anonymisation
  of the public name, not a claim of complete erasure or unlinkability.

## Authentication choices

Usernames are ASCII letters/digits/underscore, 3–32 characters and case-insensitive.
They avoid collecting or verifying email and avoid introducing email delivery.
Public display names are separate. Passwords accept 15–128 characters without
composition rules, truncation, trimming or Unicode normalisation.

Passwords use native `node:crypto` scrypt (`N=16384, r=8, p=5`, unique 128-bit salt,
32-byte output, constant-time comparison). This is an
[OWASP-supported scrypt configuration](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt).
Argon2id would require another WASM implementation/loader; native scrypt avoids
that additional runtime integration and uses about 16 MiB per hash. `scrypt-v1`
records the parameter version for future upgrades. The Workers runtime test executes
the actual hash implementation, not a mock.

**Do not enable passwords on the current free Worker assuming they fit its CPU
allowance.** Secure hashing is CPU-intensive. The current
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
distinguish Free and Paid CPU allowances. Obtain Paul's plan/budget approval, set
a suitable CPU limit after benchmarking, and verify on the target runtime before
invited tests. No plan has been changed or purchased. An external managed identity
service is an alternative if maintaining the Free plan is required; it is not
silently substituted by this implementation.

Recovery uses a random 256-bit key shown once plus the public traveller ID. Only
its SHA-256 hash is stored. Recovery changes the password, replaces the recovery
key and revokes all sessions in one transaction. A used key cannot be replayed.
Authenticated users can replace a lost recovery key. Without a working login or
recovery key there is intentionally no support override that could steal ownership.
There is no email-reset endpoint or email-based account linking.

Random 256-bit bearer sessions expire after 12 hours. Only hashes are stored in D1;
the browser stores sessions in `sessionStorage`, not persistent localStorage.
Returning on another device, or after the tab's session is gone, requires sign-in.
Logout revokes the current session. Password/recovery/link operations revoke all
earlier sessions. Rotation replaces the token atomically, preserving the original
authentication time. Sensitive settings require a sign-in within ten minutes.
An already-authorised in-flight request can finish when another request logs out.

Old recovery-code travellers must prove possession of their existing credential
to upgrade. The upgrade preserves their ID and history, disables legacy auth and
replaces the old token hash with an unknown random value in the same transaction.
Once accounts are enabled, new anonymous token registrations are rejected; existing
legacy travellers can still resume and explicitly upgrade while registration is open.

API requests require an allowlisted Origin. JSON mutations and explicit bearer
headers use `credentials: omit`, so ambient cookies cannot authorise CSRF. CORS is
not itself authentication. The frontend renders names with `textContent`, removes
OAuth parameters before sharing, sets a restrictive script CSP and no-referrer
policy, and never puts a credential in a path link. Bearer sessions remain vulnerable
to a compromised origin/browser; CSP and short sessions reduce, not eliminate, that risk.

Workers' existing IP limiter remains in use. Additional D1 counters enforce 30
auth requests/IP/minute and 10 login attempts/username/15 minutes, across locations;
keys are hashed. Password-change and recovery guesses have their own limits. Old
session/flow/counter rows expire and are cleaned during auth calls. Authentication
failures do not log submitted values. Nonexistent and wrong-password logins use
the same response and equivalent scrypt work. Signup duplicates return generic
`account_unavailable`; successful signup necessarily reveals that a chosen username
was free. There is no public username lookup.

## Google setup (Paul/Sara)

Google uses Authorization Code + S256 PKCE with state and nonce. The verifier stays
in the initiating browser tab. D1 stores the challenge and state/nonce hashes only.
The callback is an approved **frontend URL**, not the Minotaur root or a new Worker
GET handler. The browser checks state and sends code/verifier to the existing
origin-protected API by POST. Flow consumption is atomic and expires in ten minutes.

`jose` verifies Google's RS256 signature, issuer, audience, expiry, issued-at,
nonce, optional authorised-party claim and verified-email claim. The account key
is Google's `sub`; email is neither stored nor used to merge accounts. Linking is
explicit and requires a recently authenticated account and the completed Google
flow, tied to the same session. A Google identity already owned by a different
traveller is rejected. We never automatically merge histories.

1. Use an isolated Cloudflare Pages branch preview, not a custom domain:
   `https://codex-g5-persistence.between-g5-preview.pages.dev`
   (**UNCONFIRMED candidate**; it exists only if a Pages project named
   `between-g5-preview` deploys branch `codex/g5-persistence`). Keep G1–G4's
   production site unchanged. The candidate is listed in the *source* staging
   `ALLOWED_ORIGINS`; no Cloudflare setting, Pages project or DNS record has
   been changed. The existing `workers.dev` hostname remains API-only.
2. In Paul's Google Cloud project, configure OAuth consent and a **Web application**
   OAuth client. While testing, restrict audience to named test users.
3. Once the Pages project and branch alias are confirmed, set its authorised
   redirect URI to the exact preview page (candidate, currently unconfirmed):
   `https://codex-g5-persistence.between-g5-preview.pages.dev/index.html`
   (no query or fragment).
   The value must match `GOOGLE_REDIRECT_URI` byte-for-byte. Approve its JavaScript
   origin as appropriate. Only `openid email` scopes are requested.
4. Set public `GOOGLE_CLIENT_ID` and `GOOGLE_REDIRECT_URI` in the staging config.
   Store `GOOGLE_CLIENT_SECRET` through Cloudflare's secret UI or
   `npx wrangler secret put GOOGLE_CLIENT_SECRET --config wrangler.staging.jsonc`.
   Never paste the secret into GitHub/chat or commit it. Empty configuration fails
   closed with `google_not_configured`.
5. Configure the preview's `G5_API_URL` to the staging API only. Test Google login,
   rejected/cancelled/expired flow, explicit linking and cross-device restoration
   with real named Google test users. Provider responses in automated tests are
   mocked and RSA-signed; live Google acceptance is still pending.

## Local checks and preview

```text
npm ci
npm run check
npm test
npm run test:client
npm run build:api
npm run migrate:local
npm run dev:accounts
npm run dev:web
```

The last two commands run in separate terminals. Open
`http://localhost:4175/#g=5`. `dev:accounts` enables accounts and registration only
in the local emulator, bound to loopback. It does not change committed defaults
or remote Cloudflare resources. Use only disposable test credentials.

## Ready to deploy checklist (after review and Paul approval)

Code can be reviewed now. **Not ready for public signup** until CPU/hosting,
preview origin and Google configuration above are settled.

1. Fetch the reviewed branch and verify its exact SHA. Confirm the normal
   source-built bundle contains Sara's Minotaur URL and exact `GET /` handler.
2. Back up/export staging D1 to a private location first; never commit the export.
   Record table counts and immutable discovery ownership before migration.
3. Paul applies only `0003_accounts.sql` through the migration runner:
   `npx wrangler d1 migrations apply between-g5-staging --remote --config wrangler.staging.jsonc`.
   Confirm `foreign_key_check`, unchanged visits/discoveries/commands, one profile
   per traveller, unique public IDs and initial empty accounts/sessions.
4. Dry-run with staging config, then Paul deploys the reviewed Worker:
   `npx wrangler deploy --config wrangler.staging.jsonc`.
   Keep the two enablement flags false for the initial migration/deployment check.
   Verify all previous six bindings plus the three new public config vars; a
   configured Google secret is an additional secret binding.
5. Verify Minotaur root, unauthorized `/v1/` denial, health, private-journey denial,
   closed registration, and actual stored counts. `staging-smoke.mjs` still assumes
   an empty archive and closed flags; do not run it unchanged after invited visits.
6. Only after Paul approves a controlled account test window, test two devices
   and two travellers reaching the same path, account upgrade, Google linking
   and discovery privacy. `REGISTRATION_ENABLED=true` is open registration to
   any client that can reach the endpoint; the current code has no invitation
   gate. Use Cloudflare Access/WAF or a short, monitored window if private
   testing is required, and close registration afterward.

Rollback: disable new registrations/accounts, retain D1 and all immutable history.
Restore a reviewed compatible Worker version if needed. Do not undo the additive
migration or drop tables. A pre-accounts Worker cannot authenticate new sessions;
upgraded legacy recovery credentials are deliberately retired, so prefer a forward
fix. There is no production deployment or `gh-pages` merge in this handoff.

If an auth response is lost, sign in again; if a newly issued recovery key was lost,
replace it from a recently authenticated session. Pending movement requests retain
their original idempotency key across same-account reauthentication.
