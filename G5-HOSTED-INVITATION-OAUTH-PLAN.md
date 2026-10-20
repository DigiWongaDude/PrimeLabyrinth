# G5 hosted invitation and Google OAuth plan

Status: documentation and inspection only, 20 October 2026. No remote D1
write, invitation issuance, secret upload, OAuth-console change, flag change or
deployment was performed while preparing this plan.

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
   expiry, never exceeding the SQL-enforced seven-day maximum. Accept only a
   non-personal operator reference of at most 64 characters.
3. Create a new private output file outside the repository before the remote
   write. On Windows, place it in a private operator directory with an ACL
   granting only Paul's account; use create-new semantics and never print the
   token. If the file cannot be made private, abort before any remote write.
4. Insert only the UUID, digest, expiry and reference. The raw token never
   enters SQL, command arguments, Wrangler logs, Git, chat, a URL or browser
   storage. Deliver the token once through Paul's private channel, then delete
   the file. If delivery fails, revoke by UUID and delete the file.
5. Record only non-secret evidence: invitation UUID, created/expiry times,
   target database ID, source SHA and the D1 result metadata. Do not record the
   token or digest in the evidence or deployment notes.

### Parameterised D1 write mechanism

Use the Cloudflare D1 Query API with a least-privilege API token held in an
operator credential store or process environment—not in a command line, file in
the checkout or chat. Cloudflare documents the endpoint and `sql`/`params`
body at [Query D1 Database](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/):

```text
POST https://api.cloudflare.com/client/v4/accounts/afef76524a17ba7db8f11d31b56d215a/d1/database/8280b0ec-4f1c-42e9-918f-613c7578c83c/query
Authorization: Bearer <operator token held outside the command line>
Content-Type: application/json

{
  "sql": "INSERT INTO invitations (id, token_hash, expires_at, operator_reference) VALUES (?, ?, ?, ?);",
  "params": ["<uuid>", "<digest>", "<unix expiry>", "<non-secret reference>"]
}
```

The revoke operation is the same endpoint and remains parameterised:

```text
{
  "sql": "UPDATE invitations SET revoked_at = unixepoch() WHERE id = ? AND revoked_at IS NULL;",
  "params": ["<uuid>"]
}
```

The operator must require an explicit confirmation immediately before either
remote write, verify the returned database ID/target and require `success:true`
and the expected `changes` value. A duplicate UUID/digest or a failed result is
an abort, not a retry with altered data. Preserve spent redemptions; revocation
is one-way and does not delete rows. A Wrangler `d1 execute --remote --file`
fallback is less desirable because it cannot bind parameters; if it is ever
considered, the generated file must contain digest-only values, live outside
the checkout, be deleted after use and receive a separate security review.

### Acceptance and failure checklist

- No public mint, list or revoke route exists.
- The operator token is scoped to the staging account/D1 write operation and is
  never logged or committed.
- Invalid TTL, reference, target database, flags, backup or migration state
  aborts before a write.
- A lost delivery file causes UUID revocation and replacement issuance; it does
  not expose or recover plaintext from D1.
- A lost HTTP response is reconciled by UUID and database metadata, never by
  reissuing blindly.
- One successful redemption is the only winner under password/Google races;
  invitation redemptions remain immutable.
- After the disposable test, close both flags, revoke unused invitations,
  take a post-test backup and retain non-secret evidence only.

Implementing this remote writer is a security-sensitive architecture change,
not a mechanical adaptation of the local helper. It needs a manual Astra High
review before code or a real invitation is created.

## Google OAuth setup and test plan

The source enforces the following exact behaviour: `googleConfig` requires all
three Google values; the redirect URL must have the same origin as the request,
must have no query or fragment, and must be HTTPS (localhost is allowed only for
local tests). The Worker sends that exact redirect to Google and the token
exchange, then verifies issuer, audience, RS256 signature, `sub`, `exp`, `iat`,
nonce, `email_verified` and `azp`.

Paul/Sara's manual Google Cloud steps, only after approval:

1. In the approved Google Cloud project create a **Web application** OAuth
   client and keep the consent screen audience limited to named staging test
   users.
2. Add this exact JavaScript origin:
   `https://between-g5-preview.pages.dev`.
3. Add this exact authorised redirect URI:
   `https://between-g5-preview.pages.dev/index.html`.
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
2. Manual Astra High review covers the remote operator writer and its failure,
   ACL, credential-scope and reconciliation behaviour.
3. Implement and locally test the separate remote adapter without pointing it
   at D1 or generating a real token. Keep the existing local helper unchanged.
4. Paul independently approves the remote write, issues one disposable staging
   invitation, and keeps both flags closed until the test window is ready.
5. Paul configures the Google client and secret against the exact confirmed
   Pages origin, then performs the bounded password/Google/two-device/linking
   acceptance tests.
6. Paul closes the flags, revokes unused invitations, backs up and records the
   results. Production, DNS, x10 and the live game remain untouched.

No step above authorises a remote write today. Before implementation, the
required manual model-review request is: **Switch me over to Astra High**.
