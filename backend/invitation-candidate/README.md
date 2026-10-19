# Invitation schema checkpoint — not deployable

This folder is intentionally **not** Wrangler's `migrations_dir`. Only
`backend/invitation-schema.test.ts` applies this candidate to an isolated local
D1 test database. Existing application tests still use the original migrations.
No account route, frontend, operator tool or remote database uses this schema yet.
Keep registration disabled. Do not manually apply this candidate remotely.

## What is implemented here

- Digest-only invitation records; maximum seven-day lifetime, one-way revocation,
  immutable identity/expiry, one-use immutable redemption linked to a traveller.
- Database-time availability validation, account admission guard and a sealed
  snapshot of eligible pre-migration legacy travellers.
- `legacy_upgrade_proofs`: a small addition to the approved design that carries
  the **presented credential hash** through the upgrade transaction. Snapshot
  membership alone does not permit account creation. Insert verifies live proof;
  account INSERT verifies it again, consumes proof/eligibility and retires the
  old token. Sara should review this mechanism before backend integration.
- Nullable OAuth attempt digest, without a foreign key: existing Google sign-in
  must tolerate an unknown/expired invitation and ignore it for returning users.
- New profiles have legacy authentication disabled; old profiles are unchanged.
  This is defence in depth, not a replacement for closing `/v1/travellers`.

## Transaction contract for the next backend commit

Use `withSession('first-primary')` and one awaited `db.batch`:

1. New identity: capped traveller INSERT, invitation redemption INSERT, account
   INSERT, display-name update, ROOT visit INSERT and initial session INSERT.
2. Legacy upgrade: proof INSERT with authenticated traveller ID and **request's
   bearer hash**, account INSERT, display-name update, existing ROOT preservation
   and initial session INSERT. Do not replace the active path, history or ID.
3. Return credentials only after successful commit. Any error must abort the
   entire sequence. Never insert a proof/redemption as a separate committed call,
   use `OR IGNORE` to hide admission errors, or omit the initial session.

The trigger replaces the old traveller token itself. The route need not update
that token first (doing so would invalidate proof), and must not delete
eligibility before the account guard runs. Accounts' existing `legacy_enabled=0`
trigger remains; no assumptions about the ordering of AFTER triggers are needed.

Schema guards protect against accidentally omitted admission checks, not a
malicious database administrator or arbitrary SQL execution. The backend remains
responsible for deriving invitation digests from raw tokens, provider verification,
constant credential rules, rate limiting, flag checks and HTTP projections.

## Executable coverage and limits

20 tests exercise the actual local Workers/D1 implementation: populated migration
and runner reapplication; preservation of credentials/ledger/discovery ownership;
snapshot exclusions; successful transaction; missing/unknown/expired/exactly
expired/revoked/future invitation; same-token concurrency with password/Google
account-row combinations; username and Google-sub uniqueness rollback; cap;
session failure; revocation and real clock expiry after precheck; direct insert
guards; valid and competing upgrades; forged/stale proof; proof invalidation
inside a batch; failed-upgrade rollback; anonymisation; immutable spent records;
invitation constraints and irreversible revocation.

The race tests use distinct D1 sessions and concurrent batches. They model account
row variants, **not live HTTP signup or signed Google flows**. Existing authentication
tests remain baseline regression evidence only. This is not completion of all
21 design acceptance scenarios.

Next: review this SQL, integrate it into `backend/migrations` **together with**
invitation-aware routes and migrated fixtures, then prove route-level denial for
all flag combinations, mixed OAuth/password races, non-leakage, throttling and
lost responses. Follow with the manual invitation input and private operator
issuance tool. No public invitation-request list is in scope. Paul alone handles
deployment, remote migration, settings, secrets and enablement.
