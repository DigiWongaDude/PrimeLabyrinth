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
moderation data in D1 and is not returned by a public route. Email deduplication
uses an HMAC-SHA-256 keyed by the Worker-only `INVITATION_REQUEST_DEDUPE_SECRET`
(minimum 16 characters), not an unsalted public digest; the secret must be a
Worker secret and is deliberately absent from Wrangler vars. A D1 snapshot by
itself therefore cannot run a small-dictionary email enumeration attack. If the
secret and snapshot are both compromised, the risk returns. Before a hosted
launch, Paul must approve retention, access, at-rest protection and deletion
policy for this PII.

Closed requests can be redacted by the private operator function
`redactClosedInvitationRequests` after a minimum 30-day retention window. It
keeps status/timestamps and replaces display name, email, message and any
unsent outbox recipient; the public Worker never calls it automatically.

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
no email API call, Outlook automation, scheduled task or live send. The local
`backend/invitation-mail.ts` provider contract claims one outbox row, passes a
secret invitation token only in memory for the invitation adapter, and records
`SENT`, definitive `FAILED`, or ambiguous `UNKNOWN`. Provider exceptions become
`UNKNOWN`; there is no automatic retry or replacement token. The fake adapter
used by tests stores only metadata and token length, never the token.

The explicit future runner boundary is: automatic ACK after the durable D1
batch, private Paul review, one hosted-issuer call, then an operator/provider
runner. The runner must reconcile `UNKNOWN` manually before any retry. The
issuer's native private journal remains outside Worker/D1 and returns only a
non-secret invitation ID; an uncertain issuer call is terminal `UNKNOWN`.

### Sender research (decision still required)

- **Microsoft Graph:** `POST /users/{id}/sendMail` needs least-privilege
  `Mail.Send`; application permission requires admin consent and can send as
  any user, while delegated permission acts as the signed-in user. A 202 is an
  accepted request, not proof of recipient delivery, so our idempotency/outbox
  and reconciliation still remain necessary. Paul must verify that the
  connected Outlook identity is allowed to send as
  `invitations@digiwongadude.com`; mailbox access alone is not that grant.
  See [Graph sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0)
  and the [permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference?view=graph-rest-1.0).
- **Cloudflare Email Service:** a Worker `send_email` binding is native and can
  restrict sender/destination addresses, but the domain must be onboarded and
  SPF/DKIM/DMARC records are part of that setup. This would require Paul's
  explicit Cloudflare/DNS approval and a binding secret/config review; none was
  performed here. See [Email Service setup](https://developers.cloudflare.com/email-service/get-started/send-emails/)
  and [send bindings](https://developers.cloudflare.com/email-service/configuration/send-bindings/).
- **IONOS SMTP/API:** IONOS documents SMTP on TLS port 587 (465 SSL as an
  alternative) and requires the sender address to match the authenticated
  domain/relay rules. Forwarding is not a sending identity. Existing IONOS
  mailbox/forwarding and SPF/DKIM/DMARC records must be checked before using
  SMTP, because a new relay can alter deliverability or SPF alignment. See
  [IONOS sender-address rules](https://www.ionos.com/help/email/general-topics/important-change-for-sending-emails-with-different-sender-addresses/),
  [SMTP settings](https://www.ionos.com/help/email/glossary-email-terms-explained/smtp/),
  and [DMARC](https://www.ionos.com/help/domains/configuring-mail-servers-and-other-related-records/configuring-a-dmarc-record-for-a-domain/).

Paul must choose one provider, approve the exact sender identity and least
privilege, provide a disposable test recipient, and approve retention and
DNS/SPF/DKIM/DMARC checks. No provider is selected or configured by this
commit.

### Native Cloudflare Email Service preparation (local only)

The preferred lower-complexity route, if the zone prerequisite is satisfied,
is the native Workers Email Service binding. `backend/invitation-mail.ts`
contains a typed `cloudflareEmailProvider` that implements the existing
`MailProvider` contract. It pins the application sender to
`invitations@digiwongadude.com`, emits only fixed templates, passes invitation
tokens only in the approved in-memory invitation call, and never writes a
token to D1, a URL, logs, or receipts. The adapter is not wired into a live
route and no binding was contacted in this assignment.

`wrangler.staging.jsonc` now contains a prepared-but-unactivated configuration:
`EMAIL_ACK` permits only the fixed sender, while `EMAIL_REVIEW` additionally
fixes the destination to the Paul review mailbox. These are source-level
restrictions only; Email Sending domain onboarding, binding availability and
any deployment remain separate Paul approvals. Public ACK recipients are not
pre-verified by this binding; the sender restriction is enforced, while
Cloudflare's suppression/recipient policy still applies. A disposable,
Paul-controlled recipient is required for the first real smoke.

Cloudflare's Workers API returns an `EmailSendResult.messageId`, which is an
acceptance receipt/unique email ID, not proof that the recipient received the
message. The provider maps definitive validation/sender/recipient restriction
errors to `FAILED`; rate limits, delivery failures, service exceptions and
missing receipts become `UNKNOWN`. There is no blind retry. Reconciliation
must use the Cloudflare Email Service Activity log or an explicitly approved
event-subscription consumer before retrying an ambiguous row. No direct
message-status lookup was assumed or tested locally.

#### DNS and privacy prerequisite checklist (read-only)

Before onboarding anything, Paul should capture evidence without editing DNS:

1. In the Cloudflare account, confirm `digiwongadude.com` is an active zone
   and its authoritative nameservers are Cloudflare nameservers. If it is not,
   native Email Service is blocked; use the separately hosted IONOS relay or
   another approved HTTP provider instead.
2. Record the current apex MX, SPF TXT, DKIM selectors and `_dmarc` policy,
   including the existing IONOS mailbox/forwarding arrangement. Do not touch
   root MX or enable Email Routing.
3. Review Email Sending onboarding as a preview only. Cloudflare requires
   Cloudflare-managed DNS and onboarding may add a `cf-bounce` MX, SPF, DKIM
   and apex `_dmarc`; those records must be checked for conflicts with IONOS
   and the current DMARC policy before any approval.
4. Inspect the Email Service privacy/preview setting. New sending domains have
   Email preview enabled by default and the Activity log can retain message
   content for about seven days. Disable preview before any invitation token
   can be sent. For an ACK-only disposable smoke, Paul must explicitly decide
   whether the PII exposure is acceptable; this code makes no such decision.

Cloudflare docs: [Workers Email API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/),
[send bindings](https://developers.cloudflare.com/email-service/configuration/send-bindings/),
[domain configuration](https://developers.cloudflare.com/email-service/configuration/domains/),
[Activity log](https://developers.cloudflare.com/email-service/observability/logs/),
and [suppression lists](https://developers.cloudflare.com/email-service/concepts/suppressions/).

#### Exact approval checklist for one real ACK

Paul must approve each item separately: (1) the read-only zone/MX/SPF/DKIM/
DMARC evidence and the decision not to enable Email Routing; (2) Email Sending
onboarding for the exact domain; (3) the `EMAIL_ACK`/`EMAIL_REVIEW` binding
names and restrictions; (4) Email preview disabled before any invitation
token, or an explicitly approved disposable ACK-only preview; (5) one
Paul-controlled disposable recipient; (6) a staging deployment with all
account, registration and invitation-request flags still OFF; (7) verification
of the returned message ID and Cloudflare Activity/event result; (8) the
spending/rate-limit guard and a rollback plan. No item authorises a production
deployment, migration, flag change, registration enablement, invitation
issuance, DNS edit or additional email.

### IONOS first-mail recommendation

The lowest-complexity safe route for the existing mailbox is **not direct SMTP
from the Worker**. Cloudflare Workers now expose outbound TCP sockets, but port
25 is blocked and a direct 465/587 implementation would require a carefully
reviewed SMTP/TLS/SASL client, connection timeouts, provider response handling
and mailbox credentials inside a Worker. That is more failure-prone than the
existing outbox boundary and a Worker must never contain the IONOS mailbox
password.

This branch therefore adds `ionosRelayProvider` as a local-only HTTPS adapter.
It posts fixed templates to a Paul-approved, separately hosted relay with an
`Idempotency-Key`; the relay alone holds the IONOS password and speaks SMTP.
The adapter accepts only an HTTPS endpoint, pins the sender to
`invitations@digiwongadude.com`, sends no arbitrary user-supplied template, and
maps a definitive 4xx rejection to `FAILED`. Timeout, 429/5xx, redirect,
network failure or a successful response without a provider message ID becomes
`UNKNOWN`; the durable runner must reconcile that state and must not resend
blindly. Invitation tokens are included only in the in-memory approved
invitation request body, never in the URL, D1, logs or adapter receipt.

The relay's IONOS configuration is a separate human-controlled step. Paul must
confirm the account's regional SMTP hostname (the current IONOS help pages show
`smtp.ionos.com`; Sara's setup notes mention `smtp.ionos.co.uk`), use the full
`invitations@digiwongadude.com` mailbox as username, and choose TLS/STARTTLS
587 or implicit TLS 465. IONOS rejects a sender from a different domain and
publishes hourly sending limits, so the relay must enforce a small queue rate,
retry only definitive failures, and preserve the existing forwarding/DNS.

#### Narrow first acknowledgement test (requires Paul's separate approval)

1. Paul selects a relay host and verifies its HTTPS certificate, fixed
   destination, no-body-logging policy, rate limit and secret storage. The
   IONOS mailbox password stays only in that relay's secret store.
2. Paul verifies the actual IONOS SMTP hostname/port and sender identity in
   Outlook/Webmail, and checks current SPF, DKIM and DMARC alignment without
   changing DNS.
3. Paul supplies one relay authentication secret and one Paul-controlled,
   disposable recipient address. CODiE/Sara add the Worker secret and deploy
   only after explicit approval; neither is done by this commit.
4. Keep accounts, registration and invitation-request flags closed until the
   preflight is reviewed. Submit exactly one Turnstile-verified request using
   the disposable recipient. The page must show its immediate on-screen
   receipt regardless of mail state.
5. An authorised runner claims only the ACK row, posts the fixed message once,
   and records `SENT` plus the relay message ID. Paul verifies exactly one
   received acknowledgement; it contains no invitation token and says the
   request is pending personal review, not an account or subscription.
6. If the relay times out or returns an ambiguous response, stop and reconcile
   the relay/D1 idempotency key before any retry. Do not test invitation mail or
   registration in this first smoke.

Required remote actions are therefore explicit: relay hosting/secret setup,
IONOS credential entry, Worker secret/configuration, D1/Worker deployment and
one real send. None occurred here.

### Focused security review (local evidence)

- **Enumeration:** fixed by the Worker-secret HMAC dedupe key and regression
  coverage; the raw email remains moderation PII and is not returned by a
  public read route.
- **Atomicity/concurrency:** request plus ACK/review rows are one D1 batch;
  an injected outbox failure rolls the request back. Approval uses the unique
  request key and was exercised concurrently; only one approval and invitation
  outbox item survives.
- **Replay/unknown states:** Turnstile hashes are single-use; invitation rows
  contain only a digest and the account trigger consumes them once. Issuer or
  provider exceptions become `UNKNOWN` and require operator reconciliation;
  there is no blind resend or replacement mint.
- **IP/rate limits:** `CF-Connecting-IP` is the Cloudflare edge canonical
  address. It is a throttling key, not authentication. The edge must overwrite
  it and direct-origin access must be blocked; `X-Forwarded-For` is ignored.
  D1/Rate Limit binding errors fail closed rather than accepting requests.
- **PII:** closed records have an operator-only, minimum-30-day redaction path
  that also removes unsent outbox recipients. Retention period, operator ACL,
  backup lifecycle and deletion evidence still require Paul's decision.

Local tests cannot prove Cloudflare edge header provenance, physical power-loss
durability, a real Turnstile challenge, provider delivery/reconciliation, the
hosted issuer's Windows ACL boundary on every machine, or live mailbox
SPF/DKIM/DMARC alignment. Those remain staging acceptance gates.

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
