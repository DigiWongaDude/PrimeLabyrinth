# G5 hosted invitation and Google OAuth plan

**Implementation update (20 October 2026):** the separate operator CLI and
native Windows store are now implemented for offline review. See
[operator instructions](tools/hosted-invitations/README.md) and the latest
engineering notes for actual verification results and outstanding hosted gates.
No real invitations, API credentials or remote operations were used. The
design-review narrative below is retained as the specification/history.

Status: documentation and inspection only, 20 October 2026. No remote D1
write, invitation issuance, secret upload, OAuth-console change, flag change or
deployment was performed while preparing this plan.

Security review completed after Paul's manual model-switch acknowledgement.
**Decision: suitable for a bounded local implementation next, not approved for
hosted use.** The existing helper is not safe to promote to remote operation.
The requirements below supersede this document's initial review request.

## Verified starting point

- Branch: `codex/g5-persistence`, reviewed source `632d51fe38f6cd86993c482e5b721a0a36fcbfb2`.
- Staging Worker: `between-g5-staging-api`, version
  `77599eca-33d6-4b27-8dca-5ee92fdea713`.
- D1: `between-g5-staging`, ID
  `8280b0ec-4f1c-42e9-918f-613c7578c83c`; migrations 0001–0004 are applied.
- `ACCOUNTS_ENABLED=false` and `REGISTRATION_ENABLED=false` remain closed.
- Confirmed frontend origin: `https://between-g5-preview.pages.dev`.
- Exact OAuth callback: `https://between-g5-preview.pages.dev/index.html`.
- Google values are currently unset. Hosted invitation issuance/delivery is
  still **NOT YET SOLVED**.
- The pre- and post-migration SQL exports are private, outside Git, and have
  verified checksums recorded in the handoff. They are not inputs to this plan.

These are previously recorded hosted observations, not a fresh remote check
performed during this review. Locally reviewed source:
`f630af8f65ef7d4bb41f4a73235fe49a1e46c1bc`.

## Recommended hosted invitation workflow

Keep the existing local helper local. Do **not** change its database name from
`between-g5` to staging and do not merely replace `--local` with `--remote`.
That would turn a disposable utility into an unreviewed remote writer and its
current SQL execution path has no bound-parameter interface.

The smallest safe hosted design is a separate, operator-only Outpost command
that has no public HTTP endpoint and no browser exposure:

1. Paul starts from a clean reviewed checkout and verifies the staging database
   ID, current backup checksum, migration inventory, closed flags and the
   intended short test window. The command refuses any non-staging database.
2. In memory, generate a UUID and 32 CSPRNG bytes. Encode the token as 64
   lowercase hex characters and hash
   `between:g5:staging:invite:v1:` + token with SHA-256. Use a 48-hour default
   TTL, never exceeding the SQL-enforced seven-day maximum. Compute creation
   and expiry with database time in the INSERT, not the workstation clock.
   Accept only an optional non-personal operator reference of at most 64
   characters; reject control characters and redact it from general logs.
3. Create a new private output file outside the repository before the remote
   write. On Windows, place it in a private operator directory with an ACL
   granting only Paul's account; use create-new semantics and never print the
   token. Follow the Windows requirements below. If privacy or durable saving
   cannot be established, abort before any remote write.
4. Insert only the UUID, digest, expiry and reference. The raw token never
   enters SQL, command arguments, Wrangler logs, Git, chat, a URL or browser
   storage. Deliver only after confirming the exact database record, through
   Paul's chosen private channel. On failed or uncertain delivery, do not mint
   a replacement: reconcile/revoke first. Do not delete recovery material
   while a write or revocation is uncertain.
5. Record only non-secret evidence: invitation UUID, created/expiry times,
   target database ID, source SHA and the D1 result metadata. Do not record the
   token or digest in the evidence or deployment notes.

### Parameterised D1 write mechanism

Use the Cloudflare D1 Query API with a least-privilege API token held in an
operator credential store or securely supplied process-scoped environment—not
in a command line, file in the checkout or chat. Do not extract/reuse Wrangler's
cached OAuth token. A separately approved API credential is a prerequisite,
not something this review has created. Cloudflare documents the endpoint and `sql`/`params`
body at [Query D1 Database](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/):

```text
POST https://api.cloudflare.com/client/v4/accounts/afef76524a17ba7db8f11d31b56d215a/d1/database/8280b0ec-4f1c-42e9-918f-613c7578c83c/query
Authorization: Bearer <operator token held outside the command line>
Content-Type: application/json

{
  "sql": "INSERT INTO invitations (id, token_hash, created_at, expires_at, operator_reference) VALUES (?, ?, unixepoch(), unixepoch() + CAST(? AS INTEGER), NULLIF(?, ''));",
  "params": ["<uuid>", "<digest>", "172800", "<non-secret reference or empty string>"]
}
```

The revoke operation is the same endpoint and remains parameterised:

```text
{
  "sql": "UPDATE invitations SET revoked_at = unixepoch() WHERE id = ? AND revoked_at IS NULL;",
  "params": ["<uuid>"]
}
```

The adapter validates a safe integer TTL in 1..604800 before serialising it;
SQL CAST is not input validation. Validate UUID structure and digest format.
Use fixed SQL templates, never user-supplied SQL or interpolated values.

Require Paul's explicit confirmation for each intended remote mutation.
Pin account/database IDs and HTTPS API host; reject redirects. Before writing,
use [Get D1 Database](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/get/)
to verify the UUID/name against the pinned target. Query responses do not
promise a returned database ID: do not pretend they prove target identity.
Require HTTP success, envelope success, per-statement success, expected
`meta.changes`, and a bound readback of the exact UUID/digest/TTL/reference.
Unexpected/missing response fields require reconciliation, not a success claim.
Preserve spent redemptions; revocation is one-way and does not delete rows.
A Wrangler `d1 execute --remote --file`
fallback is less desirable because it cannot bind parameters; if it is ever
considered, the generated file must contain digest-only values, live outside
the checkout, be deleted after use and receive a separate security review.

### Credential and Windows storage requirements

- Cloudflare lists D1 Edit/Write as an account permission. Limit the credential
  to the intended account and D1 operation, with a short lifetime; do not claim
  it is restricted to one staging database without verified policy support.
  The pinned database in our code is a guardrail, not credential isolation.
  Paul must accept this scope before provisioning a credential. No global API
  key, deployment/DNS permissions or child-process credential inheritance.
  [Permission reference](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)
- Use a dedicated directory under the operator's local, non-synchronised
  profile (for example under LocalAppData), never OneDrive, the repo, a network
  share or a generic shared temp location. Verify its actual resolved path,
  local NTFS volume, owner SID and full DACL. Reject reparse-point ancestors,
  junctions, alternate data streams and unexpected file links.
- Establish and inspect the private parent DACL **before** creating plaintext.
  Remove inherited and unrelated grants, not just add an owner grant. Create
  an empty file exclusively, verify owner/DACL and regular-file identity, then
  write and flush through that same handle. A privacy-check failure must make
  zero network writes. Use SID-based Windows ACL APIs, with readback checks.
  [Windows ACL semantics](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls)
- Node's `chmod(0600)` is not proof of Windows confidentiality. Our local helper
  skips its mode check on Windows and does not inspect NTFS ACLs. Its output
  path check is also relative to cwd, not a canonical repository boundary.
  [Node Windows caveat](https://nodejs.org/api/fs.html#fschmodpath-mode-callback)
- Keep the token and durable operation record in that private directory. Only
  UUID/state/timestamps/target/source SHA and sanitised error codes may appear
  in console or engineering notes. Never dump HTTP bodies, headers, environment,
  SQL parameters or exception objects. Prevent request-body/debug tracing.
- ACLs do not defend against malware running as Paul or privileged local
  administrators. Deletion is not guaranteed secure erasure. Keep plaintext
  short-lived; do not promise protection from snapshots, sync or backups.

### Interrupted-operation protocol

The local helper currently writes D1 before saving the token, and silently
discards a failed compensating revoke. Those behaviours must not be reused.
Use one durable UUID/token per operation, an exclusive per-operation lock and
explicit state. Restarting must never silently mint a new invitation.

| Durable state | Required next action |
| --- | --- |
| PREPARED | Private token/intent flushed; no remote request sent yet. |
| WRITE_UNKNOWN | Persist **before** sending INSERT. Timeout, disconnect, process death, malformed reply or readback failure stays here. Keep token private; do not deliver. |
| ISSUED | Exact matching record confirmed and still live/unspent. Record server timestamps before delivery. |
| REVOKE_UNKNOWN | Persist before sending revoke; keep recovery record until confirmed by readback. |
| REVOKED / EXPIRED / REDEEMED | Terminal database evidence; remove plaintext and retain non-secret audit record. |
| DELIVERED | Paul acknowledged private delivery; delete local plaintext. This is not proof of redemption. |

Reconcile by a bound UUID lookup, compare the expected digest/immutable fields
in memory, and inspect expiry/revocation/redemption. No match is not permission
to create a new UUID: retain WRITE_UNKNOWN if consistency is uncertain. Once
absence is established, Paul can approve retrying the **same** UUID/digest.
Do not retry automatically. A duplicate must be reconciled, never overwritten
with UPSERT/REPLACE. Conflicting fields are a hard stop.

For revoke, zero changed rows could mean absent or already revoked; readback
must distinguish these. If already redeemed, revoking the invitation does
**not** revoke an account/session; report that separately for Paul's decision.
If plaintext is lost, reconcile/revoke by UUID and verify a terminal state
before considering replacement. A failed cleanup is reported, not hidden.

### Acceptance and failure checklist

- No public mint, list or revoke route exists.
- Credential scope is verified, consciously approved and never logged.
- Invalid TTL, reference, target database, flags, backup or migration state
  aborts issuance before a write. Revocation still requires target verification
  and approval, but must remain available during an open test window; do not
  block emergency revocation merely because flags are ON or a backup is stale.
- A lost delivery file follows the reconciliation protocol; D1 cannot recover it.
- A lost HTTP response is reconciled by UUID and database metadata, never by
  reissuing blindly.
- One successful redemption is the only winner under password/Google races;
  invitation redemptions remain immutable.
- After the disposable test, close both flags, revoke unused invitations,
  take a post-test backup and retain non-secret evidence only.

Before hosted use, locally test with a fake HTTP transport: commit-then-timeout,
reject-before-commit, malformed success, duplicate UUID/conflicting digest,
revoke timeout/already revoked/already redeemed, disk-full, crash at each state
boundary and concurrent operators. Test incorrect target and unsafe ACL/path
with **zero requests**. Test TTL boundaries against local migration 0004.
Assert stdout/stderr/errors contain neither raw token nor API credential.
Windows ACL tests need a genuine Windows filesystem; a POSIX mode test or
mock alone is insufficient. No live credentials or real invitations in tests.

The local helper remains local-only and unchanged. The original design review
did not certify an implementation; use the new operator test evidence and
remaining hosted gates linked above. Offline success is not hosted approval.

## Google OAuth setup and test plan

The source enforces the following exact behaviour: `googleConfig` requires all
three Google values; the redirect URL must have the same origin as the request,
must have no query or fragment, and must be HTTPS (localhost is allowed only for
local tests). The Worker sends that exact redirect to Google and the token
exchange, then verifies issuer, audience, RS256 signature, `sub`, `exp`, `iat`,
nonce, `email_verified` and `azp`.

Frontend cross-check: `account-client.js` stores state/verifier/API/mode in
tab-scoped sessionStorage, not the invitation. `app.js` handles the callback;
`index.html` sets `no-referrer`. Use the same browser tab for the round trip.
The client secret belongs only to the Worker; the callback belongs to Pages,
not to the API's Minotaur root.

Paul/Sara's manual Google Cloud steps, only after approval:

1. In the approved Google Cloud project create a **Web application** OAuth
   client, set External/Testing as appropriate for the project, and register
   the intended staging testers. **This is not a named-user security boundary.**
   Google exempts basic OpenID/email/profile requests from its test-user-list
   restriction. This Worker requests `openid email`. Our invitation admission
   and closed flags remain the gate; a forwarded invitation is a bearer
   credential, not bound to a named person. If strict named-user admission is
   required, stop for a separate server-side design rather than claiming the
   console setting provides it.
   [Google audience/testing exception](https://support.google.com/cloud/answer/15549945)
2. Add this exact JavaScript origin:
   `https://between-g5-preview.pages.dev`.
3. Add this exact authorised redirect URI:
   `https://between-g5-preview.pages.dev/index.html`.
   It must match exactly, including path and trailing-slash behaviour.
   [Google redirect requirements](https://developers.google.com/identity/protocols/oauth2/web-server)
4. Do not add the API origin, Minotaur root, live domain, x10 host or an
   unconfirmed branch alias.
5. After a separate approval, set only the public client ID and exact redirect
   URI as staging Worker variables. Store the client secret only as the
   `GOOGLE_CLIENT_SECRET` Worker secret. Never put a secret in Git, Pages output,
   browser code, a URL, an issue or chat.

Hosted acceptance must use real named test users and disposable accounts:

- Verify state, nonce, S256 PKCE, exact callback, cancellation, expiry and
  replay failure.
- New Google subjects require a valid invitation and the registration window;
  existing Google subjects sign in without consuming one.
- Link Google explicitly from an authenticated password account; a Google
  subject already linked elsewhere returns `identity_already_linked` and never
  merges histories.
- Repeat login on a second device and verify the same traveller/public ID,
  active path and shared discovery attribution.
- Confirm no provider token, secret, invitation, username or internal ID is
  returned in public discovery data.
- Close both flags again, revoke unused invitations and record the Worker
  version, test labels and non-secret results.

## Recommended sequence and approval gates

1. Sara reviews this plan and the historical-status corrections in the three
   existing invitation/runbook documents.
2. Security design review is complete with the requirements above. Sara/Paul
   approve the bounded implementation scope; hosted readiness is not approved.
3. Implement and locally test the separate adapter using a fake remote transport
   and disposable local fixtures. Keep the existing local helper unchanged.
4. Paul independently approves the remote write, issues one disposable staging
   invitation, and keeps both flags closed until the test window is ready.
5. With separate approval, Paul configures Google and staging secrets/variables.
   First verify accounts OFF, then approve accounts ON / registration OFF for
   closed-signup checks. Only after another explicit approval open a short,
   invitation-only registration test window for password/Google/linking and
   two-device acceptance. Hosted tests cannot be completed while both flags
   are OFF; they are a controlled test gate, not a prerequisite already passed.
6. Paul closes the flags, revokes unused invitations, backs up and records the
   results. Production, DNS, x10 and the live game remain untouched.

No step above authorises a remote write today. Stop for Sara/Paul review; no
additional model switch is requested. No auth architecture or hashing changed.
