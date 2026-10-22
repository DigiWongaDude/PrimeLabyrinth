# Platform Blueprint v1 — reusable invitation/account platform

Status: local design and test artifact only. This document does not authorise
DNS, Cloudflare, X10, IONOS, registrar, deployment, migration, secrets or mail.

## Goals and ownership

Each client gets an isolated tenant identity, public frontend, API Worker,
database, mail sender and operator boundary. The client owns its domain,
registrar, brand and mailbox; the implementation team receives least-privilege
access and a written handoff. The client must be able to revoke access and
restore the last known release without depending on a personal account.

Recommended default: one Cloudflare account per client when billing,
administration or legal separation matters. If an organisation must share an
account, use separate Workers, Pages projects, D1 databases, Email Service
bindings and scoped API tokens per client, with no shared secrets or wildcard
bindings. Never put a client credential in a static bundle.

## Reference architecture

```text
Registrar / authoritative DNS
  ├─ X10 website (A/CNAME, optionally proxied only after validation)
  ├─ IONOS inbound mail (MX, SPF/DKIM/DMARC preserved)
  └─ Cloudflare Email Sending records (only after explicit onboarding approval)

Pages static client  ── HTTPS/CORS ──> Worker API
                                      ├─ isolated D1 + versioned migrations
                                      ├─ Turnstile verification
                                      ├─ password/Google account boundary
                                      ├─ invitation approval and durable outbox
                                      ├─ native Email Service binding or approved relay
                                      └─ operator/issuer boundary (never public)
```

The browser is a public client: it knows only the API origin, tenant ID,
branding, Turnstile site key, binding labels and closed/open display flags.
`client-config.js` validates and freezes this metadata; secrets remain in
Worker secrets, provider stores or operator machines. Server-side validation
remains authoritative for prime paths, invitations, account flags, limits and
attribution.

## Tenant parameters

Every deployment manifest must supply, without defaults copied from another
client:

| Parameter | Example shape | Rule |
| --- | --- | --- |
| tenant ID | `client-a` | Lowercase stable identifier; scopes names and audit records |
| domain/origins | `client.example`, `https://play.client.example` | Exact domain/HTTPS origins; no wildcard CORS |
| branding | product/title/edition | Public only; no secrets |
| sender/review recipient | mailbox addresses | Explicitly approved identities and fixed review destination |
| Turnstile | site key/expected hostname | Site key public; secret Worker-only |
| bindings | API/ACK/REVIEW names | Tenant-specific, least privilege |
| flags | accounts/registration/requests | All false until separately approved |
| limits | travellers, rate windows, budgets | Versioned and observable |

The reusable module rejects paths in origins, invalid mailboxes and malformed
tenant IDs, and does not accept a `secrets` field. Static Pages output is an
allowlisted artifact, never the repository root.

## Data and security boundaries

- D1 is isolated per client and migrated forward only through reviewed files.
- Password hashes, OAuth state/verifiers, sessions, invitation digests and
  account recovery data stay server-side or in the browser storage contract
  already reviewed for G5. No tokens in URLs, logs, previews or public IDs.
- Turnstile is verified by the Worker; the browser site key is not evidence of
  a successful challenge.
- Public invitation requests create moderation PII and durable ACK/review
  outbox rows atomically. ACK/review/invitation delivery is operator-controlled
  and `UNKNOWN` never retries blindly.
- Native Email Service is preferred only when the zone and sender are approved;
  `messageId` means provider acceptance/queueing, not recipient delivery.
- Operator approval, hosted issuer and account registration are separate gates.
  No public admin endpoint is created.
- Every tenant has retention, redaction, backup, restore, audit and incident
  contacts. Backups are encrypted, access-logged and tested by restore—not just
  declared present.

## Operations, cost and recovery

Use a versioned repository release plus a deployment manifest recording Worker
SHA, Pages artifact hash, migration inventory, flags, origins, bindings and
backup checksum. Set bounded request, mail and image-generation budgets before
opening a flag. Alert on failed migrations, 5xx, auth abuse, outbox `UNKNOWN`,
rate-limit exhaustion, mail bounces and budget thresholds.

Recovery order: freeze new writes/registration, preserve logs and the current
release, take a fresh backup, identify the last known-good Worker/Pages SHA,
restore only after a reviewed D1 recovery procedure, then reconcile outbox and
invitation states. Never roll back a schema without a compatible Worker plan.

## Current THE BETWEEN coupling and bounded work completed

The engine, room geometry, path IDs, Minotaur `GET /`, account transport and
G5 journey are intentionally unchanged. Before this blueprint, `app.js` and
the preview builder used a project-specific API constant. The new public-only
`client-config.js` contract now centralises tenant/origin/branding/mail
metadata, while preserving `G5_API_URL` compatibility. The Pages preview
builder generates a standalone config from an allowlist and keeps all flags
false. This is deliberately not a multi-tenant runtime or a major refactor.

Remaining coupling is intentional: the Worker routes and D1 schema are still
named for G5, the static game still imports `G5_API_URL`, and the staging
Wrangler file contains the current project's resource IDs. A future client
must generate a separate manifest/config and isolated resources rather than
editing those values in place.

## Staged rollout

1. Inventory and ownership: DNS, X10, IONOS, registrar, Cloudflare account.
2. Build an isolated local manifest and run the full test/dry-run matrix.
3. Import/compare DNS records without changing delegation; obtain Paul approval.
4. Create isolated Cloudflare resources and deploy with all flags off.
5. Validate Minotaur, API origins, backups, mail bindings and security gates.
6. Enable invitation requests, then one approved ACK smoke, then accounts only
   after separate acceptance evidence.
7. Hand off ownership, credentials rotation and rollback/backup evidence.
