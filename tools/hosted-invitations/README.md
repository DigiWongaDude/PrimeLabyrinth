# Windows staging invitation operator

Implemented and tested **offline only**. This is not permission to contact D1,
issue a hosted invitation, configure credentials or enable accounts. Paul must
approve those separately after Sara reviews the code. Existing local helper,
Worker authentication, migrations, flags, browser and Minotaur are unchanged.

## Components and boundary

- `../invitations-hosted.mjs`: interactive operator CLI, clean feature-branch
  check, local config/backup checks, remote connection and mutation approvals.
- `core.mjs`: pinned target, fixed bound SQL, digest, append-only operation
  state machine, conservative reconciliation and redacted summaries.
- `windows-store.mjs` / `private-store.ps1` / `PrivateStore.cs`: private pipes
  to native Windows storage. No API credential is passed to the helper.

The only operational store is
`%LOCALAPPDATA%\Between-Staging-Invitations`. Disposable test roots have the
strict form `%LOCALAPPDATA%\Temp\between-hosted-test-<uuid>`.
No user-selected output path or database/URL option is accepted by the CLI.

Native checks require a fixed local NTFS drive, final handle paths without
reparse ancestors, a canonical boundary outside the repository, current-user
ownership and a protected DACL containing exactly one explicit owner full
control grant. Directories include object/container inheritance for that grant.
Permissions are applied at creation, not patched after writing secrets.
Files are exclusively created, checked before writing, flushed through the same
handle and rechecked. Hardlinks, junctions, ADS paths, offline/recall files,
known sync paths and unexpected file names are rejected.

Open ancestor/root handles prevent rename/delete while working. A share-none
native lock serialises the entire store across operator processes, including
the network operation. Closing/crashing releases the OS lock; never delete
`operator.lock` to bypass it.

This does not defend against an administrator, compromised operator account,
malicious reviewed source, memory dump, arbitrary same-user backup/sync software
or failing storage hardware. Paul must confirm the fixed store is not enrolled
in custom sync/backup. Deletion is ordinary deletion, **not secure erasure**.
Do not paste the store or diagnostics into chat/Git. Private journal snapshots
contain the digest for reconciliation; they are not public audit records.

Native APIs used:
[CreateFile](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew),
[GetSecurityInfo](https://learn.microsoft.com/en-us/windows/win32/api/aclapi/nf-aclapi-getsecurityinfo),
[handle identity](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfileinformationbyhandle).

## Local commands

From the clean, reviewed `codex/g5-persistence` checkout with dependencies
installed, in Paul's interactive Windows terminal:

```powershell
node tools/invitations-hosted.mjs --help
node tools/invitations-hosted.mjs prepare --reference tester-01 --ttl-seconds 172800
node tools/invitations-hosted.mjs status --id <UUID>
```

`prepare` is local only but creates sensitive material. It requires the
`PRIVATE LOCAL STORAGE NOT SYNCED` acknowledgement. Do not run it during routine
verification: the tests generate isolated fixtures instead. The result contains
only UUID/state/source/target and confirmed server times when available.
32 random bytes become a 64-hex token in `<UUID>.token`; default TTL is 48 hours,
maximum seven days. Tokens are never arguments, stdout, stderr or SQL.

One unfinished operation per store: PREPARED, WRITE_UNKNOWN, ISSUED or
REVOKE_UNKNOWN blocks another prepare. Terminal/delivered records remain as
audit snapshots. `status` can finish a previously interrupted terminal token
cleanup; it does not contact the network.

## Future remote gate — Paul only, not authorised by this implementation

Before any remote command, Sara reviews the code and Paul separately approves
the exact operation/UUID and actual Cloudflare credential scope. Supply a
short-lived, separately approved D1 Edit/Write credential via a private
process-scoped `BETWEEN_D1_API_TOKEN`, using Paul's chosen credential manager or
non-echoing input. Do not type a token into a shell assignment/history, command
argument, `.env` file, Git, issue or chat. Do not extract Wrangler's OAuth token.
Credential-manager provisioning is a human prerequisite, not performed here.

The CLI removes the variable from its environment before spawning any helper;
child environments use an explicit allowlist. The parent shell may still hold
its copy: clear it and close that shell after the approved operation. Avoid
debugging/transcription of requests. Node debugging options are rejected.

Target is pinned in code:

```text
account:  afef76524a17ba7db8f11d31b56d215a
database: 8280b0ec-4f1c-42e9-918f-613c7578c83c
name:     between-g5-staging
```

Credential account scope is **not** single-database isolation. The API client
pins HTTPS host/account/UUID and verifies database metadata and exact migration
inventory 0001–0004. It uses fixed `sql`/`params` requests and never retries
automatically. Redirects, non-success/malformed envelopes, statement failures,
missing/unexpected change counts, oversized replies or mismatched readback stop
the operation. Query responses do not echo trustworthy target identity.
[D1 Query API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/)

After explicit future approval:

```powershell
node tools/invitations-hosted.mjs issue --id <UUID> --remote --backup <PRIVATE-SQL-PATH> --sha256 <VERIFIED-SHA256>
node tools/invitations-hosted.mjs reconcile --id <UUID> --remote
node tools/invitations-hosted.mjs retry --id <UUID> --remote --backup <PRIVATE-SQL-PATH> --sha256 <VERIFIED-SHA256>
node tools/invitations-hosted.mjs revoke --id <UUID> --remote
node tools/invitations-hosted.mjs delivered --id <UUID> --remote
```

Each requires a typed `CONNECT <staging-name> <database-UUID>` confirmation
before any API call. Mutations require a further exact `ISSUE`, `RETRY` or
`REVOKE <UUID> <staging-name>` confirmation (the prompt displays the full phrase).
No `--yes`, force, redirect override or arbitrary SQL mode exists.

Issuance/retry also requires a nonempty private backup outside the repo, matching
SHA-256, file modification age at most 24 hours, and committed flags both OFF.
Paul must attest `PAUL VERIFIED LIVE FLAGS OFF AND BACKUP CURRENT`.
The tool **cannot** establish that the export matches current D1 contents or
inspect live Worker flags using a D1-only credential; the attestation is a real
human gate, not automatic verification. Revocation deliberately has no
closed-flags/backup dependency.

Only ISSUED after matching readback is deliverable. Paul privately opens the
token file through his chosen local/private delivery workflow; never print it
in an agent terminal or put it in a URL. Verify live status before delivery.
After confirmed delivery, `delivered` requires an explicit acknowledgement,
checks that the invitation is still live, records DELIVERED and removes the
token file. It does not prove redemption. Invites are transferable bearer
credentials, not tied to named people.

## Recovery and stop conditions

Snapshots `<UUID>.<sequence>.json` are exclusive, checksummed and flushed;
records never overwrite an earlier snapshot. A checksum detects corruption,
not malicious same-user edits.

| Observation | Operator action |
| --- | --- |
| PREPARED | Nothing sent; normal approved issue may proceed. |
| WRITE_UNKNOWN | Keep private token/journal. Reconcile the same UUID; never prepare a replacement. |
| Matching live row | Reconciliation records ISSUED; no second INSERT. |
| Absent row | No automatic action. After absence/consistency review, Paul may approve `retry` of the same UUID/digest. Uniqueness prevents duplicate records. |
| Duplicate/conflicting fields | Stop. No UPSERT, overwrite, altered TTL or new UUID. |
| REVOKE_UNKNOWN | Reconcile. If still live, Paul may explicitly repeat revoke. Do not deliver or delete recovery material. |
| REVOKED / EXPIRED / REDEEMED | Record confirmed terminal state, remove token, retain private journal. |
| DELIVERED | Token removed; reconcile/revoke remains possible. |
| Missing token with intact journal | No retry/issue. Reconcile/revoke by UUID; no plaintext recovery from D1. |
| Truncated snapshot / orphan token without initial snapshot | Fail closed. Preserve private files for reviewed manual recovery; no automatic truncation or new issuance. |
| Cleanup failure | Visible failure; terminal journal is retained. Retry local `status` after resolving file access. |

Revoking a redeemed invitation does not revoke an account or session. Report
REDEEMED to Paul rather than claiming account access has been removed.
Reconciliation never changes discovery, account or redemption records.

## Offline verification

```powershell
node --test tests/hosted-invitations.test.mjs
node --test tests/hosted-invitations-windows.test.mjs
npm test
npm run test:client
npm run check
npm run build:api
npx wrangler deploy --config .\wrangler.staging.jsonc --dry-run --outdir .worker-build/staging
```

Operator tests use fake HTTP transport only. Native tests use unique disposable
NTFS stores and remove only those test fixtures afterwards. Local D1 tests use
the exact SQL against migration 0004, including TTL boundaries. Native tests
skip on non-Windows, so a green Linux run is not Windows acceptance. No real API
credential is required or used. Test-state crash injection is not a physical
power-loss test.

Remaining hosted gate: independent review, credential provisioning/scope
approval, Paul's live preflight, one separately approved staging issuance and
private delivery, then bounded account acceptance. This document authorises
none of those actions.
