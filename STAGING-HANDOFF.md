# For Sara — issue #36 staging backend complete

**Later deployment history:** Sara's 2026-10-18 Minotaur update (`db0bd57`,
deployment `657d7334070547bbbc7d8cca6ded13a0`) is recorded in
[shared notes](SARA-CODIE-NOTES.md). The original root-rejection description below
is historical: exact `GET /` now serves the entrance. Issue #38 account changes
are **not deployed**; see [account handoff](ACCOUNTS-HANDOFF.md). Paul controls all
further deployments, including staging.

Paul explicitly approved isolated staging migrations and backend deployment in
chat. Completed 2026-10-18; stopped after backend smoke checks. No frontend launch
or public registration is included in this approval.

## Exact deployment

- API: https://between-g5-staging-api.digiwongadude.workers.dev
- Worker: `between-g5-staging-api`
- Account: `afef76524a17ba7db8f11d31b56d215a`
- D1: `between-g5-staging`, ID `8280b0ec-4f1c-42e9-918f-613c7578c83c`, WEUR
- Configuration: `wrangler.staging.jsonc` (no secrets)
- Worker source: review-branch commit `642b2e34ee75ba6c541331475386e208404e5c8d`
- Cloudflare upload deployment ID: `0c8f1db7ce43424eaeb593e05a14c356`
- Uploaded bundle SHA-256: `e97c646909277a2671627bbd7ecda6cb92ae3f8d50b0a6b948b471d9f965a4e7`
- Registration: `false`; defensive traveller cap: `10`
- CORS: staging API's own HTTPS origin only; no external frontend is enabled
- Rate limit namespaces: `5003` (120/min) and `5004` (5/min)
- `workers.dev` enabled; preview URLs disabled; no assets, custom-domain routes or cron

Preflight confirmed no existing Workers and no application tables in Sara's
database (only internal `_cf_KV`). Opening Workers & Pages initialized the account
subdomain, clearing the earlier blocker. No existing application data needed
backup or replacement. Preserve/export the database before any future migration
once populated; do not assume these empty-state checks replace a backup policy.

Local Wrangler 4.151.1 was unauthenticated. It was used only for a successful
staging-config dry-run build and generated-type/TypeScript check. The authorized
Cloudflare connector applied the unchanged SQL files in order, then uploaded the
exact generated module and matching bindings. No provider tokens were extracted
or copied. Migration names are recorded in the standard Wrangler-compatible
`d1_migrations` table, so later authenticated Wrangler runs will recognize them.

## Database verification

- `0001_journeys.sql` then `0002_shared_exploration.sql` applied successfully,
  recorded at `2026-10-18 21:17:02` UTC.
- Five application tables, five explicit indexes and all seven triggers exist.
- `visits_share_discovery` SQL matches its source migration after normalizing
  line endings/trailing semicolon. No trigger logic was changed for deployment.
- `PRAGMA foreign_key_check` returned no violations.
- After smoke checks: travellers, visits, discoveries, commands and world occupancy
  each contain **zero** records. No test identity or recovery code was persisted.

## Hosted checks: 8 passed

`node staging-smoke.mjs` performs a bounded test against ONLY this staging URL.
It expects an empty archive and closed registration; do not use unchanged after
any account test journeys are added.

| Check | Result |
| --- | --- |
| Health, allowed Origin | 200, G5 healthy |
| Shared exploration, allowed Origin | 200, all four counts zero, recent list empty |
| Private history without credential | 401 |
| Private journey without credential | 401 |
| Live website Origin | 403, no CORS allowance |
| Missing Origin | 403 |
| Registration with fresh random test credential | 403 `registration_closed` |
| Exploration after probes | 200, still empty |

Responses also passed exact JSON, `Cache-Control: no-store` and CORS assertions.
The public response contains only archive statistics, not credentials or owner
IDs. A normal address-bar visit has no Origin header and is deliberately rejected;
this URL is a backend, not a playable game. CORS is not authentication: the
read-only archive endpoint is internet-accessible with an allowed Origin header.

This is not a hosted two-device recovery test. The existing 36 local tests and
local journey smoke checks cover saves/atomicity; controlled hosted account
journey testing is the next separate acceptance gate. The current backend has
no invitation gate when registration is enabled.

## Boundaries and rollback

No paid plan activation, DNS/nameserver changes, x10 changes, R2, AI, voice,
signup enablement or frontend deployment. PR #35 remains draft and unmerged.
Remote `gh-pages` remains `1fd2cc69635d77f12c04540624b67f1c313a766c`.
The default frontend API configuration is still blank; G1–G4 are untouched.

For emergency staging shutdown, disable this Worker's `workers.dev` availability
in its settings (or POST its `/subdomain` API with `enabled:false` and
`previews_enabled:false`). Preserve D1 and the Worker source; do not drop tables
or delete discoveries. Keep `REGISTRATION_ENABLED=false`. This is the first
staging deployment, so there is no earlier staging version to roll back to.
Future staging code can be restored from the commit/config above, after review.

Next approval needed: a confirmed isolated frontend-preview origin and a
controlled account-testing window. Only then connect a preview and verify a
private recovery code across two real devices. The current backend does not
enforce invited-only password registration; use an approved access policy or a
short monitored window. No further work under issue #36 is needed unless a
reviewer identifies a failed acceptance item.
