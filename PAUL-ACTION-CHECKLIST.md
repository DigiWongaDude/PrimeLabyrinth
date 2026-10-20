# Paul action checklist — Platform Blueprint v1

No item below is pre-authorised by this commit. Paul should reply with a
separate, explicit decision for each action.

## Information/screenshots/exports needed (no passwords)

- [ ] Registrar name, account owner, nameserver/delegation screenshot, lock,
      2FA and DNSSEC/DS status.
- [ ] Current authoritative zone export or screenshots from the DNS provider,
      including A/AAAA/CNAME, MX, SPF, DKIM selectors, DMARC, CAA, TXT,
      autodiscover, SRV, wildcard and redirect records.
- [ ] X10 public hostnames, origin/SSL mode and any control-panel redirects;
      confirm that files remain hosted at X10.
- [ ] IONOS mailbox/forwarding inventory and non-secret evidence of current
      MX/SPF/DKIM/DMARC alignment; confirm `invitations@` is a real mailbox and
      `agent@` remains forwarding-only.
- [ ] Cloudflare account/zone ownership and billing owner; current evidence
      shows Sara’s connected account sees no `digiwongadude.com` zone.
- [ ] Approved Pages/API/OAuth/Turnstile origins and the disposable test
      recipient. Never send passwords, tokens, API keys or mailbox contents.

## Decisions Paul must make later

- [ ] Keep current DNS provider, or approve adding Cloudflare as a staged zone.
- [ ] Approve the exact record import and authoritative nameserver cutover
      window, with a DNSSEC/DS plan and rollback owner.
- [ ] Approve whether Cloudflare Email Sending is appropriate after cutover;
      do not enable Email Routing or replace IONOS inbound MX.
- [ ] Approve sender/review binding restrictions, Email Preview privacy setting,
      budget/rate limits and one ACK-only smoke recipient.
- [ ] Approve each staging deployment, D1 migration/backup, flag change,
      invitation issuance and real mail send separately.

## What Sara/CODiE can verify without Paul

- [ ] Local source, tests, generated public config, Pages allowlist and Worker
      dry-run output.
- [ ] Repository history, migration ordering, Minotaur regression and committed
      false flags.
- [ ] Official Cloudflare procedure and a read-only checklist.

## What requires Paul’s access/approval

- [ ] Registrar/DNS/Nameserver/DNSSEC edits, Cloudflare zone/resource creation,
      Email Sending onboarding, secrets, X10/IONOS changes and deployments.
- [ ] Any remote D1 read/write/backup/restore, registration/account enablement,
      OAuth provider change or real email.

