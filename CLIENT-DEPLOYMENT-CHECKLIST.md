# Reusable client deployment checklist

This checklist creates an isolated client release. It is not permission to
deploy or change DNS. Checkboxes are evidence gates, not assumptions.

## Client manifest

- [ ] Tenant ID, legal owner, support owner and incident contact recorded.
- [ ] Domain, Pages origin, API origin, OAuth redirect, Turnstile hostname and
      approved branding recorded.
- [ ] Sender, fixed review recipient and provider selected; no mailbox password
      or API secret entered in Git or browser configuration.
- [ ] Dedicated Cloudflare account or documented least-privilege separation
      approved; billing owner and account recovery owner recorded.
- [ ] Separate Worker name, Pages project, D1 database, rate-limit namespaces,
      Email bindings and secrets planned.

## Repository and IaC

- [ ] Versioned manifest generates public client config; no hard-coded secrets.
- [ ] Wrangler config contains only this tenant’s resource IDs and flags.
- [ ] Pages artifact is an allowlist; repository root, SQL backups, notes and
      operator tools are excluded.
- [ ] Migration files are ordered, reviewed and reversible/forward-compatible.
- [ ] CI runs formatting/diff checks, TypeScript, backend/client tests and
      Worker/Pages dry-runs against the exact release SHA.

## Security acceptance

- [ ] Origins are exact HTTPS values; API CORS is not treated as auth.
- [ ] Accounts, registration and invitation requests are false initially.
- [ ] Password hashing, recovery, OAuth state/verifier, account linking and
      session rotation tests pass with disposable credentials.
- [ ] Invitation approval is private, one-use and idempotent; tokens never
      enter URLs, D1 plaintext, logs, browser history or email preview.
- [ ] Turnstile server verification, rate limits, abuse caps and neutral errors
      are checked.
- [ ] Worker `GET /` Minotaur entrance and legacy G1–G4 gameplay regressions
      pass.
- [ ] Mail provider binding sender/destination restrictions and `UNKNOWN`
      reconciliation are tested without sending real mail.

## Release, backup and cost gates

- [ ] D1 backup is fresh, checksum recorded and restore has been rehearsed.
- [ ] Worker SHA, Pages artifact hash, migration inventory, config checksum and
      flag values are recorded.
- [ ] Request, CPU, D1, mail and image budgets plus alert recipients are set.
- [ ] Logs/metrics omit tokens and body PII; retention/redaction owner is named.
- [ ] Rollback owner, previous release, old DNS zone and registrar recovery are
      available.

## Staged rollout

1. Local tests and dry-runs with every flag false.
2. Isolated preview deployment; verify static artifact and Minotaur.
3. Staging Worker/D1 deployment after backup and migration approval.
4. Closed smoke: health, origin guard, disabled account/registration routes.
5. Invitation-only window: one approved request, ACK/review outbox and private
   approval; use a disposable recipient and no invitation token in first mail
   smoke.
6. Password/Google account matrix, two-device continuity, explicit linking and
   shared discovery attribution.
7. Close flags, reconcile outbox, record evidence and hand off ownership.

## Handoff package

- [ ] Repository/branch/SHA and reproducible commands.
- [ ] Cloudflare account/project/resource ownership and scoped access list.
- [ ] DNS export, delegation/DNSSEC/registrar evidence and rollback values.
- [ ] D1 backup checksum, migration state and restore instructions.
- [ ] Provider sender/binding restrictions, suppression/privacy decisions and
      reconciliation procedure.
- [ ] Budget alerts, monitoring destinations, retention/deletion schedule and
      incident contacts.

