# Invitation admission — local implementation for review

Migration `migrations/0004_invitations.sql` and the invitation-aware Worker must
be reviewed and released together. **Not deployed.** Both committed enablement
flags remain false. Paul alone applies remote migrations, configures secrets or
enables registration. Do not deploy an older open-signup Worker against this
schema or restore registration during rollback.

## Implemented contract

- Password signup requires `invitation` in JSON. Missing, malformed, unknown,
  expired, revoked, spent or digest-as-token values give `403 invitation_unavailable`.
  Availability is checked before scrypt; password hashing is unchanged.
- Google `login` start accepts an optional invitation, stores only its digest
  against the attempt, and never reserves/spends it. Completion verifies the
  provider first: existing subjects sign in without redemption (even when
  registration is closed); new subjects require the bound invitation. Complete
  does not accept a replacement invitation. Link/migrate do not accept one.
- `/v1/travellers` only resumes recognized identities under all flag combinations.
  Unknown credentials cannot mint a traveller. New identities use account routes.
- New admission and legacy upgrade each include the initial session in the
  account batch. A unique conflict, expired invitation, stale proof, full cap or
  session failure rolls back all writes. A lost success response does not unspend
  the invite: authenticate normally, then replace the recovery key if needed.
- New admission uses existing edge limits plus a D1 five-attempt/IP/minute fixed
  window before password hashing. Google completion shares that admission bucket
  only for new identities/upgrades, not returning sign-in. This is not a budget
  ceiling; public abuse/hosted performance still require review.
- The manual masked input is only used for new password/Google admission. It is
  cleared after attempts, dialog close, and before Google navigation. No raw
  invitation/digest is put in browser storage, share links or callback parameters.

## D1 batch and legacy proof

Use `withSession('first-primary')` and one awaited `db.batch`:

1. New identity: capped traveller INSERT, redemption INSERT, account INSERT,
   display-name update, ROOT visit and initial session INSERT.
2. Legacy upgrade: insert `legacy_upgrade_proofs` with the authenticated ID and
   **request bearer hash**, then account, display name, ROOT preservation and
   initial session. The account trigger consumes proof/eligibility and replaces
   the legacy token; the existing disable-legacy trigger remains intact.

The snapshot is sealed at migration time. Membership alone is insufficient: the
proof INSERT checks live credential, eligibility and profile; account INSERT
checks again. Never insert a proof/redemption as a standalone committed call.
Do not retire the old credential before proving it or delete eligibility before
the account guard. Existing IDs, active path, visits, commands and first-discovery
ownership stay unchanged. New profiles have legacy auth disabled as defence in
depth. These constraints do not defend against an administrator/arbitrary SQL.

Invitations contain 32 random bytes encoded as 64 lowercase hex characters. The
hash domain is `between:g5:staging:invite:v1:` followed by the token; no digest is
accepted as a credential. Intended issuer default TTL: 48 hours, maximum seven
days enforced by SQL. Identity/expiry cannot be changed, revocation is one-way,
redemptions cannot be updated/deleted, and anonymisation does not restore use.
Stage and production must issue independent invitations; never seed production
from staging tokens/exports.

## Verification and remaining release gates

21 schema tests plus 14 invitation-route tests exercise actual local D1.
Route tests use locally signed OIDC tokens with mocked Google transport, not a
real Google tenant. Existing account tests now mint disposable invitations and
legacy tests seed identities before migration 0004. There is no test-only HTTP
admission bypass. The UI handler tests are DOM-stub tests, not a hosted/mobile
browser sign-in. See `SARA-CODIE-NOTES.md` for exact commands/counts/SHAs.

The historical `smoke.mjs` / `npm run smoke:local` still tries to create legacy
travellers and is incompatible with this intentional route closure. Do not use
it to validate invitation accounts; use the local Vitest account/route suites.
Updating that operator smoke flow awaits secure invitation fixture provisioning.
`staging-smoke.mjs` now expects `use_account_signup` for unknown legacy tokens,
but still assumes an empty archive and is only for Paul's approved hosted check.

The private operator issuance/revocation utility and secure delivery-file
permissions are **not implemented**. Do not improvise raw invitations in shell
arguments, console output, Git, public URLs or database SQL exports. Public
waiting-list work remains out of scope. Real Google sign-in, hosted two-device
continuity, browser visual QA, independent security review and Paul-approved
deployment/remote migration remain release gates. Local tests do not establish
that the live API has this gate.
