# Invitation request workflow (local implementation)

This is a local, additive implementation for Sara/Paul review. It is not a
deployment or a claim that hosted email is configured. The default config keeps
`INVITATION_REQUESTS_ENABLED=false`, both account flags remain false, and no
provider secret or mailbox credential belongs in this repository.

## Visitor journey

`invitation-request.html` is an isolated request page. It posts only to
`POST /v1/invitation-requests` with a display name, normalised email, optional
message, explicit privacy acknowledgement and a one-use Turnstile token. The
Worker:

1. enforces the existing exact-origin CORS policy and the request flag;
2. bounds and validates every field;
3. verifies Turnstile server-side with `redirect: 'error'`, a five-second
   timeout, expected hostname/action and a fresh challenge timestamp;
4. applies per-IP and per-email fixed-window D1 limits;
5. stores a private pending request and two durable outbox records atomically:
   an acknowledgement to the requester and a human-readable review notice to
   `invitations@digiwongadude.com`;
6. returns the same generic `202` receipt for active duplicates and Turnstile
   replays, without revealing whether an email is already queued.

Raw Turnstile tokens are never stored. Request email/message data is private
moderation data in D1 and is not returned by a public route. Before a hosted
launch, Paul must approve retention, access, at-rest protection and deletion
policy for this PII.

## Private approval and delivery state machine

There is deliberately no public approval/admin route. Local operator/test code
uses the exported functions in `backend/invitation-requests.ts`:

```text
PENDING request
  -> approveInvitationRequest -> APPROVED + one INVITATION outbox item
  -> hosted issuer issues one invitation -> ISSUED (invitation ID only)
  -> operator/mail adapter claims outbox -> SENDING
  -> provider confirms -> SENT, or definitive failure -> FAILED,
     ambiguous provider response -> UNKNOWN (manual reconciliation)
```

Approval is idempotent by request and the outbox has a `(request_id, kind)`
uniqueness guard. The invitation token is not placed in the request row,
outbox, SQL, URL, browser storage, log or telemetry. `recordInvitationIssued`
accepts only the non-secret invitation ID returned by the separately reviewed
hosted issuer. An unknown issuance or email result is never retried blindly and
never mints a replacement automatically.

Acknowledgement and review mail are queued only in this assignment. There is
no email API call, Outlook automation, scheduled task or live send. A future
provider adapter must use an approved sender such as Cloudflare Email Service,
an approved transactional provider, or Microsoft Graph for the existing
mailbox; the choice, sender-domain authentication (SPF/DKIM/DMARC), data
retention, idempotency key handling and secret storage all require a separate
Paul decision. Outlook mailbox connectivity alone is not a send API contract.

## Local test configuration

For local tests only, supply non-secret fixture values:

```text
INVITATION_REQUESTS_ENABLED=true
TURNSTILE_SECRET=fixture-only
TURNSTILE_EXPECTED_HOSTNAME=localhost
TURNSTILE_EXPECTED_ACTION=invitation_request
```

The public site key is intentionally empty in
`invitation-request-config.js`, so the page reports that the preview is not
configured until Paul/Sara separately approve a Turnstile site and origin.

## Hosted launch checklist (not authorised here)

- Paul approves the page hostname/path, Turnstile site/action/hostname and
  privacy notice.
- Paul selects and provisions a sender provider and secret outside Git/chat;
  no IONOS/DNS/Outlook changes are assumed.
- Take and verify a D1 backup, apply the migration only through Paul’s
  reviewed Wrangler procedure, and confirm both account flags remain OFF.
- Deploy the Worker/Pages preview only after review; run a bounded smoke with
  provider test mode or a disposable mailbox. Never use production recipients.
- Test duplicate/replay, rate limits, expiry, approval idempotency, issuance
  unknown, provider timeout/unknown, and manual reconciliation.
- Close the request flag, revoke unused invitations, retain the non-secret
  audit record, and document the Worker version and backup before any later
  registration test window.

No item in this checklist authorises a remote migration, deploy, configuration
change, email send, account enablement or production modification.
