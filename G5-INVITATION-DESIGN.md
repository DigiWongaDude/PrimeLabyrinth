# G5 invitation-only alpha: security design for Sara review

Status: design direction approved by Sara; a **schema-only review candidate** and
20 executable local D1 tests now exist in `backend/invitation-candidate` and
`backend/invitation-schema.test.ts`. The candidate is excluded from deployable
migrations. API enforcement, frontend and operator tooling are **not implemented**.
See [schema checkpoint](backend/invitation-candidate/README.md) for its transaction
contract and the proposed transactional legacy-proof addition. Original source reviewed:
`f40c66359f14ef8a516c92a820dfb5db4a0d9c49`, `codex/g5-persistence`.
Paul approved invitation-only registration in the shared notes. This replaces
the earlier recommendation for a short open-registration window. The public
invitation-request waiting list is out of scope. All deployed settings stay as
they are; Paul alone authorises deployment and remote migration.

## Decision and security boundary

Require an expiring, single-use invitation at the API when creating a **new
traveller account**, through either password signup or a new verified Google
subject. Use existing Workers/D1, bearer sessions, CORS and Google PKCE flows.
No Access-cookie integration, new subscription or email delivery is required.
Pages Access can optionally hide the frontend, but the invitation is enforced
even for a direct API request with a forged allowed Origin.

An invitation is a bearer credential privately delivered by Paul. Whoever has
it can redeem it once. This limits admission to invitation holders; it does
not prove the recipient's real-world identity or prevent forwarding. Named-person
verification would require a different design. An invitation never authenticates
an existing traveller or grants access to their history.

## Findings in the actual source

- `backend/accounts.ts:registration` checks a boolean flag and traveller cap;
  it does not check an invitation. `createAccount` currently accepts both new
  travellers and credential-proven legacy upgrades.
- Google completion verifies the provider, then returns an existing account
  before calling `createAccount` for a new subject. Keep that distinction.
- `backend/worker.ts` can create legacy travellers via `POST /v1/travellers`
  when accounts are off and registration is on. This is another admission path
  and must be closed in the invitation release, including that flag combination.
- The accounts insert disables legacy auth via a trigger. Existing discovery
  ownership is held separately; preserve those triggers and records.
- `createAccount` currently commits account creation before `issueSession`.
  The proposed new-account transaction below includes the initial session so
  session insertion failure cannot spend an invitation without creating a
  usable account. A lost HTTP response is still possible after commit.
- Both browser clients omit cookies. Google stores state/verifier in the
  initiating tab and returns to the frontend. Invitations can fit this flow
  without changing the authentication transport or OAuth redirect URI.

## Route policy and flags

| Route / outcome | Invitation rule | Registration flag |
| --- | --- | --- |
| Password `/v1/auth/signup`, new traveller | Required; redeem atomically | Must be true |
| Google `login` mode, new verified `sub` | Required; redeem atomically | Must be true at completion |
| Password login, existing Google login | No invitation | Works when registration is false |
| Explicit Google `link`, password change, recovery, rotation | No invitation; existing identity/proof rules unchanged | No new registration dependency |
| Password upgrade / Google `migrate` of an eligible legacy traveller | No invitation; require valid legacy credential and migration snapshot below | Keep existing requirement: true |
| `/v1/travellers`, unknown credential | Reject under every flag combination | Never creates a new legacy traveller |
| `/v1/travellers`, recognised existing credential | Resume only; preserve prior behaviour | No new admission |

`ACCOUNTS_ENABLED=false` continues to close account routes. Neither flag being
missing nor false creates an invitation bypass. In this release there is no
`INVITES_REQUIRED=false` or public-signup mode: registration true means
invitation-only. Local tests mint disposable invitations explicitly.
Protecting registration does not make public exploration statistics private.
Minotaur `GET /`, health, path mathematics and legal navigation are unchanged.

## Token lifecycle and administration

Proposed defaults: 32 cryptographically random bytes encoded as 64 lowercase
hex characters; 48-hour expiry; maximum seven days; explicit revocation before
redemption. Reject malformed input within the existing bounded JSON parser.
Do not derive invitations from prime keys, path IDs, usernames or timestamps.

Persist only a domain-separated digest, e.g. SHA-256 of
`between:g5:staging:invite:v1:` followed by the token. A digest is never accepted
as the input credential. Random 256-bit tokens do not require scrypt; retain
the existing password scrypt parameters unchanged. A different environment
must issue independent tokens, and staging exports must not be restored into
production as a way to seed invitations.

Propose an operator-only local issuance utility after design approval: explicit
target database, generate the token, insert only its digest with parameterised
SQL, then deliver the raw token once through Paul's private channel. No public
mint/list/revoke endpoint and no admin secret in the frontend. Remote execution
remains Paul's action. The utility must keep raw tokens out of shell arguments,
console transcripts, SQL files and Git; temporary delivery files need private
permissions and must live outside the checkout. If delivery is lost, revoke
and issue a new token instead of attempting to recover plaintext from D1.

Record a random non-secret invitation ID, creation/expiry/revocation times and
optional non-personal operator reference. Do not store recipient emails. An
operator can revoke by that ID. Keep spent records while their traveller ledger
exists; never delete a redemption to make the invitation reusable. Anonymising
an account preserves the spent invitation and discovery ledger.

## Proposed additive D1 changes and atomicity

Reserve migration `0004_invitations.sql` for the later implementation; no SQL
migration file is added by this review. Proposed records:

- `invitations`: unique random ID, unique token digest, integer creation/expiry
  times, nullable revocation time; constraints enforce the timestamp bounds.
- `invitation_redemptions`: invitation digest as primary key/FK, unique
  traveller ID/FK, redemption timestamp. No plaintext token or provider email.
- `legacy_upgrade_eligibility`: snapshot of traveller IDs that have an enabled,
  non-anonymised legacy profile and no account **at migration time**. No route
  can append to this table. Successful upgrade consumes eligibility.
- Nullable `invite_hash` on `oauth_attempts`. Existing attempts receive NULL;
  existing-account sign-in can still finish, but a new identity must restart
  with an invitation. Do not backfill token values.

Use a primary D1 session and one transactional `db.batch` for new registration:

1. Insert the new traveller under the cap, using an unknown random legacy
   credential hash. Existing profile trigger creates its public identity.
2. Insert its redemption with a BEFORE INSERT trigger that raises an error for
   missing, revoked or expired invitations using database time. The primary
   key rejects any second redemption, including password/Google races.
3. Insert the account and update the profile display name. A BEFORE INSERT
   accounts guard requires a matching redemption or valid legacy eligibility,
   and rejects anonymised profiles. This catches omitted checks in another
   account-creation code path. An application-side check alone is insufficient.
4. Insert ROOT visit using the existing discovery mechanism; do not replace
   first-discoverer fields if the canonical path already exists.
5. Insert the initial hashed session and return its private response only
   after the batch commits.

Every statement is parameterised. A failure (cap, expiry, revocation, username
or Google-sub uniqueness, trigger, session write, or D1 error) must abort the
whole batch, including traveller/profile/discovery writes and redemption. Do
not use `INSERT OR IGNORE`, a conditional zero-row redemption followed by
unconditional account creation, or consume an invitation in a separate call.
Checking `meta.changes` only after a committed batch cannot undo a partial flow.

Legacy upgrades use a separate, explicitly authenticated branch: recheck the
credential hash, eligibility snapshot, profile flags and absence of an account
inside the transaction, with a SQL error if the proof is stale. Preserve the
same traveller/public ID, active path, visits, commands and discovery ownership;
retire the old credential and eligibility atomically. No client-provided
`legacy`, `mode`, ID or invitation field grants an exemption by itself.

Simultaneous redemption has one commit winner. Revocation ordered before that
commit blocks admission; revocation after a successful commit does not delete
an account. The invitation expiry is checked again in the redemption transaction,
even if an earlier validation or Google authorization succeeded.

Cloudflare documents that a failing statement rolls back a D1 batch. Foreign
keys/triggers must also be exercised in the local Workers runtime before this
proposal becomes an implementation claim. [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch),
[D1 foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/).

## Password and Google flows

Password signup accepts an `invitation` in its JSON body. Apply rate limits,
validate input and cheaply check invitation availability before scrypt; this
check saves CPU but does not reserve it. Then hash the password and perform the
atomic batch. Missing/unknown/expired/revoked/spent invitations return the same
`403 invitation_unavailable`; no public invitation-status endpoint. Duplicate
account errors stay generic and must roll back redemption.

Google start accepts an optional invitation only in `login` mode. Store its
digest on that attempt with state/nonce/challenge/origin; never put it in Google's
URL, OAuth state, a share link, callback query or persistent browser storage.
Do not spend or reserve it at start. An absent, expired or spent invitation must
not prevent a returning Google user from starting sign-in. Bounded malformed
input can fail validation; callers can retry sign-in without an invitation.

At completion, consume/verify the OAuth attempt as today and validate Google's
token. Existing `sub`: normal sign-in, ignore any invitation without spending
it. New `sub`: require registration open and the server-stored attempt digest,
then use the same atomic redemption/creation path as password signup. Do not
accept a replacement invitation at completion. Cancelled/invalid/expired Google
flows spend no invitation; provider-code retries restart OAuth. `link` and
`migrate` remain bound to the initiating authenticated identity/session and
never auto-merge histories based on email.

The frontend needs a manually pasted invitation field for first registration;
clear it after sending the Google-start request or successful password signup.
No invitation link feature is needed for alpha. CORS OPTIONS retains the same
allowlisted methods/headers and performs no redemption; the POST is authoritative.
No credentialed cross-origin cookies, Access service tokens, or callback bypass
are introduced. Real Google/mobile verification remains a hosted test for Paul.

If the account commits but the response is lost, the invite stays spent. Password
users sign in with their submitted credentials; Google users start a fresh
sign-in for the now-existing subject. Obtain a replacement recovery key after
recent authentication. Never issue an existing account session merely because
someone presents a spent invitation. Old-account sign-in does not consume a
fresh invitation, and does not need one.

## Threats, limits and scope of review

| Threat | Required control / residual limit |
| --- | --- |
| Direct CLI, forged Origin, hidden UI bypass | Account guard and redemption on API/database path; CORS is not admission |
| Double-spend, mixed password/Google race | Unique redemption plus account/session/visit writes in one batch |
| Expire/revoke during Google or password hashing | Database-time check during redemption; no reservation at OAuth start |
| Invite theft/forwarding | Private delivery, short TTL, no URLs/logs/storage; bearer forwarding remains possible |
| Legacy flag/mode bypass | Unknown legacy registration rejected; snapshot + credential proof for upgrade |
| Fake Google callback / automatic merging | Preserve signature/state/nonce/PKCE/sub validation and explicit linking |
| Database or response failure | Transaction rollback before commit; credential-based login after lost response |
| Guessing/CPU/row spam | Existing Worker limits and D1 counters, plus proposed per-IP new-admission counter before scrypt |
| Operator compromise / browser XSS | Outside invitation guarantee; protect operator credentials and retain CSP/session controls |

Reuse existing request/IP/login throttles. Propose a D1 fixed-window admission
limit of five new-registration attempts per IP per minute, in addition to the
existing location-scoped CREATE_LIMIT; test shared-household use with Paul.
Google-start remains under the existing auth throttle because identity is not
known yet. Registration and redemption errors must not log request bodies,
tokens, SQL bindings or provider payloads. Do not key unbounded counters on every
random guessed invitation. Keep the traveller cap and budget alerts; small
alpha issuance bounds growth, but rate limits/alerts are not a spending ceiling.

## Acceptance tests to write before implementation

These are specifications, not executed tests. Put security cases in the Workers
test runtime using migrations and isolated fixtures; never mock away transaction
semantics. Existing fixtures that create legacy users through the public endpoint
must instead seed pre-migration users, then apply 0004. Do not retain an HTTP
test-only invitation bypass. Preserve all existing session/attribution assertions.

| ID | Given / action | Required result |
| --- | --- | --- |
| I01 | Direct password signup, allowed Origin, missing/malformed/random invite | No account, traveller, visit, session or redemption; generic invite rejection |
| I02 | Expired, exactly-expired, revoked, spent invite | Same rejection; no expensive hash for known-invalid invite |
| I03 | Valid password invite | One account + redemption + usable session; expected ROOT attribution |
| I04 | Concurrent same invite: password/password, Google/Google, password/Google | Exactly one account/redemption winner and no loser side effects |
| I05 | Valid invite; username conflict, cap reached, injected session/DB failure | Full rollback including redemption; reusable invite on later valid attempt |
| I06 | Invite valid at precheck, expires/revoked before batch | Transaction rejection; no partial traveller |
| I07 | Verified new Google subject with no/bad invitation | No new account even with allowed Origin; no provider email stored |
| I08 | Valid Google invitation + successful OAuth | Single redemption; digest bound to that state/challenge/origin |
| I09 | Google cancel, bad nonce/signature/state/verifier, provider error, expired flow | No redemption; restart can reuse still-valid invite |
| I10 | Replace invite at callback or replay completed state | Reject substitution/replay; no second admission |
| I11 | Existing Google/password login, recovery, rotation, explicit linking; registration closed | Existing behaviour preserved; no invitation consumed |
| I12 | All accounts/registration flag combinations + unknown `/v1/travellers` token | No legacy-creation bypass; both missing flags fail closed |
| I13 | Real pre-migration legacy credential upgrades by password/Google | Same ID/path/history/ownership, old credential retired; no invite required |
| I14 | Forged legacy ID/mode, stale credential, post-snapshot traveller, account already exists | No exemption; no replacement or ownership change |
| I15 | Migration on populated D1 then rerun migration runner | Ledger and credentials unchanged; correct snapshot; no FK violations |
| I16 | Direct account insert omitting redemption/eligibility, duplicate redemption | SQL guard/constraints reject; no half-created registration |
| I17 | Lost success response, then login / spent invite replay | Credential login succeeds; spent invitation alone grants no session |
| I18 | New invite fields vs logs, public projections, browser storage, Google URL | No raw invite/digest/admin metadata in public views or browser persistence |
| I19 | Rate-limit burst, different guessed tokens, two testers on same IP | 429 before excessive hashing; bounded counter keys and documented sharing effect |
| I20 | Anonymise an admitted account and try the old invitation | Invitation remains spent; ledger/public anonymisation contract preserved |
| I21 | Minotaur root, Origin/OPTIONS, G1-G4 engine, two-device continuity | Existing assertions remain green; preflight cannot spend an invitation |

Hosted acceptance additionally proves both browsers' real Google callback,
linking via **Link Google account** (not the separate legacy-upgrade button),
same-account continuity, and unauthenticated direct API rejection. A spent
invitation is not proof of any room discovery; only the existing committed-visit
mechanism assigns canonical-path ownership.

## Implementation handoff and release gate

Sara reviews the bearer-invitation scope, route matrix, eligibility snapshot,
SQL guards, transaction ordering, TTL and abuse limits first. Then implement
local migration/tests and backend checks, followed by the frontend field and
operator utility. Require local migration, race/failure tests, existing suites,
typecheck and both dry-runs before declaring implementation ready.

No invitation has been minted or database migrated by this design review. Current
code still permits ungated signup if enabled. Keep registration disabled until
the gate is implemented and independently reviewed. After a future deployment,
rollback must keep registration closed and never restore an open-signup version
with registration true. Do not roll back by dropping invitation/discovery data.

Token lifecycle guidance is adapted to invitations from
[OWASP's random, securely stored, expiring, single-use token guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
This is a focused source/design review, not an independent security audit or
evidence of a working deployed gate.
