# DNS migration runbook — X10 + IONOS to Cloudflare authoritative DNS

Status: read-only planning. Do not change nameservers, DNSSEC, X10, IONOS,
Cloudflare or the registrar without Paul’s separate approval for each step.

Changing authoritative nameservers changes where DNS records are served; it
does **not** move the X10 website files, the IONOS mailbox, or the registrar
account. The website and mail survive only if their records are copied exactly
and tested before delegation changes.

## 0. Inventory worksheet (fill from exports/screenshots, never guess)

| Record/dependency | Current provider/value | TTL/proxy | Cloudflare candidate | Owner/evidence | Tested |
| --- | --- | --- | --- | --- | --- |
| Apex A/AAAA |  |  |  | X10 |  |
| `www` A/AAAA/CNAME |  |  |  | X10 |  |
| Other web hosts/API |  |  |  |  |  |
| Apex MX (all priorities) |  |  |  | IONOS |  |
| SPF TXT (single merged policy) |  |  |  | IONOS |  |
| DKIM selectors |  |  |  | IONOS |  |
| `_dmarc` |  |  |  | mailbox owner |  |
| `autodiscover`/`autoconfig` |  |  |  | IONOS |  |
| SRV records |  |  |  | mail client |  |
| CAA |  |  |  | certificate owner |  |
| TXT ownership/verification |  |  |  | service owner |  |
| Wildcard/redirect hosts |  |  |  | website owner |  |
| DNSSEC DS/CDS/DNSKEY |  |  |  | registrar |  |
| Registrar lock/2FA/delegation |  |  |  | Paul |  |
| SSL certificates/origin mode |  |  |  | X10/Cloudflare |  |

Also record the current authoritative nameservers, registrar, zone export
checksum, resolver locations and the UTC timestamp. Redact credentials and
mail contents from the worksheet.

## 1. Read-only baseline and decision gate

Paul obtains an authoritative zone export from the current DNS provider or
registrar and screenshots the nameserver/delegation/DNSSEC state. Compare it
with independent resolver answers (for example, two public recursive
resolvers plus the current authoritative servers) for apex, `www`, all mail
records, DKIM, DMARC, CAA, SRV and ownership TXT records.

Cloudflare’s full setup requires adding the zone, reviewing/importing records,
then updating registrar nameservers; Cloudflare warns to review records before
delegation or the domain may become unreachable. See [Cloudflare DNS setup](https://developers.cloudflare.com/dns/get-started/)
and [record import/export](https://developers.cloudflare.com/dns/manage-dns-records/how-to/import-and-export/).

**Gate:** do not proceed if any web host, API callback, MX priority, DKIM
selector, SPF mechanism, DMARC policy, CAA restriction, DNSSEC state or
registrar owner is unknown.

## 2. Staged Cloudflare zone preparation (no delegation yet)

1. Paul adds the domain to the correct Cloudflare account and records the
   assigned nameservers and zone ID. Do not assume Sara’s connected account
   sees the zone; current evidence showed zero visible zones.
2. Import the reviewed zone file or enter records manually. Keep IONOS apex MX
   records and forwarding-related TXT/DKIM records intact. Do not enable Email
   Routing. Do not proxy mail, SMTP, autodiscover or unrelated service hosts.
3. Match TTLs initially; choose proxy status per host only after X10 origin
   and SSL tests. Keep a before/after export and checksum.
4. Validate Cloudflare answers directly against assigned nameservers and compare
   every worksheet row. A staged zone is not authoritative until delegation.

## 3. DNSSEC and registrar gate

If DNSSEC is active, capture the current DS record and signing provider before
any nameserver change. The safe ordinary path is to coordinate disabling old
DNSSEC before delegation and re-enable with Cloudflare afterwards. Keeping an
old DS while Cloudflare uses a different key can make validation fail. An
advanced multi-signer path exists only if the old provider and registrar
support it and Paul explicitly approves it; it requires cross-imported ZSKs.
See [Cloudflare DNSSEC validation](https://developers.cloudflare.com/dns/dnssec/validation-and-key-management/)
and [active migration](https://developers.cloudflare.com/dns/dnssec/dnssec-active-migration/).

**Gate:** Paul confirms the registrar account, 2FA, lock state, exact
Cloudflare nameservers, DS/DNSSEC plan, maintenance window and rollback owner.

## 4. Cutover and propagation monitoring

1. Lower TTLs only if the current provider supports it and the change itself is
   approved; wait the required interval.
2. At the approved window, replace the registrar’s nameserver set with exactly
   the Cloudflare-assigned pair. Do not add old or unrelated nameservers.
3. Record registrar confirmation and poll delegation from independent
   resolvers. Monitor apex/`www`, API callback origins, MX delivery, SPF/DKIM/
   DMARC, autodiscover, SRV and certificate handshakes. Expect resolver caches
   to retain the old delegation during propagation.
4. Keep the old DNS zone and export untouched. Do not delete X10/IONOS records
   or accounts while propagation and mail tests are incomplete.

## 5. Post-cutover acceptance

- X10 website loads at apex and `www`; origin/admin access remains available.
- API/Pages preview, Google callback origin and Turnstile hostname match exact
  approved values.
- Send/receive a controlled IONOS test using the existing mailbox; verify MX
  priority, SPF, DKIM and DMARC alignment. Do not send an invitation token.
- Check CAA, TXT ownership, `autodiscover`, SRV, wildcard and redirects.
- Capture resolver evidence, Cloudflare record export, registrar state and
  timestamps in the deployment record.
- Only after this gate may Paul separately consider Cloudflare Email Sending
  onboarding. It may add `cf-bounce`/SPF/DKIM/DMARC records; it must not replace
  IONOS inbound MX or enable Email Routing.

## 6. Rollback

If the website, mail, OAuth callback, DNSSEC validation or certificate checks
fail, stop new account/invitation activity and restore the registrar’s previous
nameservers using the preserved old values. Do not improvise DNS edits during
propagation. Continue monitoring both delegations until the old zone is
authoritative again, then diagnose from the before/after exports. A rollback
does not undo records already cached by resolvers, so keep the old provider
healthy until the agreed stability window expires.

