# The Between — G5 Stage A (review branch)

Implements [issue #34](https://github.com/DigiWongaDude/PrimeLabyrinth/issues/34).
Account work for [issue #38](https://github.com/DigiWongaDude/PrimeLabyrinth/issues/38)
is prepared for review, not deployed. See [account handoff](ACCOUNTS-HANDOFF.md) for
password/Google setup, public attribution, recovery and manual deployment gates.
Based on deployed `gh-pages` commit `1fd2cc69635d77f12c04540624b67f1c313a766c`.
**Backend deployed to isolated staging only. No frontend deployment or public signup.**
See [staging handoff](STAGING-HANDOFF.md) for the exact configuration, checks and
rollback. Do not merge into `gh-pages` or enable the live game without approval.

## What changes, and what does not

G5 adds a private saved traveller, permanent personal history and a shared
exploration archive contributed to by every connected G5 traveller. It uses G4's
geometry, movement, doors and camera. `engine.js` and `view.js` are unchanged.
G1–G4 retain their existing behaviour and localStorage keys. The default is G4.
The G5 API address is empty by default, and new server registrations are disabled.

No AI generation, image archive, voice, ladders, world placement or overwrites are
implemented here. This is the persistence prerequisite, not the earlier AI
archive project's completed Stage B. There are no backrooms or negative doors.

## Four separate models

| Model | Storage / identity | Behaviour |
| --- | --- | --- |
| Historical visits | `visits`, `(traveller_id, canonical_path)` | Immutable; revisiting the same path reuses its record |
| Shared exploration | `discoveries`, `(generation, root_triple, path)` | One global record across all travellers; immutable first attribution |
| Active ball of string | `travellers.active_path` and revision | Forward pushes a canonical door; retracing pops |
| Constructed world | Reserved `world_occupancy` table | Unused; no spatial/lifecycle rules assumed |

Canonical identity: `g5:2,2,3:ROOT`, `g5:2,2,3:001`, etc. The full path is stored,
not just a hash or prime triple. Stage A uses the existing uppercase hexadecimal
door encoding (brackets for indices above 15). No negative syntax is accepted.
Server-created parent paths and immutable additive triples establish every
prefix of the active string. Same triple on `001` and `011` is two visits.
Timestamps belong to first discovery of that traveller/path and never reset.

### One labyrinth, everyone's exploration

Two travellers reaching `g5:2,2,3:001` contribute two personal visits to **one**
global location. Paths `001` and `011` reach the same mathematical triple but are
**two** global locations. Shared identity never includes a traveller ID. Distinct
prime-triple counts deduplicate triples separately from path-location counts.

Migration `0002_shared_exploration.sql` backfills existing saved visits without
changing them, then inserts shared discoveries inside the same transaction as
each new personal visit (including ROOT). Failed transactions contribute nothing.
Retrying, retracing or revisiting does not create another contribution for the
same traveller/path. Counts are SQL queries over stored rows, not mutable counters.

The first **successfully committed** visit owns a mapped discovery, regardless of
who first sent a request or received a response. Later arrivals never replace its
owner or timestamp. Historical backfill picks the earliest saved timestamp; if
timestamps tie, lexical traveller ID breaks the tie deterministically. This is
not proof of arrival order for old tied records. Public attribution uses a separate
random public ID and current display name. Private internal traveller/auth IDs
remain omitted. A rename changes the visible name but not discovery ownership.

The public read API exposes totals and ten recent first discoveries (canonical
path, triple and first timestamp). Personal timelines, active routes, credentials
and traveller IDs remain private. Paths themselves are part of the shared map,
not secret. Contributors count anonymous traveller credentials, **not verified
human beings**. Contributions count distinct traveller/path pairs, not footsteps.
G5's Saved journey dialog distinguishes personal history from shared counts;
counts reflect the last server sync, not a live subscription.

G1–G4 remain local and do not silently upload old histories. Every connected G5
traveller contributes automatically; this does not claim that every legacy/offline
player has already been recorded. The server alone validates new doors/paths.
No API accepts arbitrary discoveries, triples or first-discoverer claims.

These are mapped locations, **not completed AI images**. Future image records
must independently key `(edition ID, complete canonical path, renderer version)`.
The image-generation reservation/completion workflow and image-discovery ownership
remain later work; current mapped-discovery attribution must not masquerade as it.

The HUD's **World floor: not assigned** is deliberately separate from doorway
`level`, which remains the elevation inside a room. The world table has no
uniqueness/collision/overwrite rules pending the next design decision.

## Persistence and authentication

- Browser creates a 256-bit recovery credential using Web Crypto **before** a
  create request. Only its SHA-256 hash is stored in D1. No Cloudflare credentials
  are ever needed by browser code.
- Every personal route authenticates with `Authorization: Bearer <credential>`. No caller
  can select an arbitrary traveller ID. CORS uses an explicit origin allowlist.
- Keep recovery codes private. They are password-equivalent, stored in the G5-only
  browser localStorage record, and copied only by the recovery button. They never
  appear in URLs, ordinary logs or public path links. This anonymous beta has no
  password reset or token rotation; losing the code and browser storage loses
  access. Protect the frontend against XSS and use HTTPS. Authentication and
  account recovery will need further work before a broad public release.
- A move supplies a UUID request ID and expected revision. A database constraint
  and triggers atomically record the command, insert the personal visit and shared
  discovery if new, and update
  the active path. Stale concurrent requests fail without partial writes.
- Repeating a request ID with the same payload returns its original acknowledgement;
  reusing it for a different payload fails. After acknowledgement the client
  reads the latest authoritative state, so late retries cannot rewind it.
- The client persists an uncertain command before sending. After timeout or reload,
  **Connect / retry** resends the same ID. It does not silently issue another move.
- While disconnected, you can view the last confirmed room; inter-room G5 moves
  wait for confirmation. No speculative offline route is labelled saved. G1–G4
  continue to work independently. A conflict refreshes the saved route and reports
  it instead of silently replaying the rejected move.
- G5 **Copy path link** produces a G4 geometry preview, not access to your private
  traveller. G5 reload resumes the credential's saved route, never trusts a URL
  path to overwrite it. To resume elsewhere, use the private recovery code.

## API

All requests need an allowed `Origin`. All except health, exploration and preflight need the
bearer credential. POST requires `Content-Type: application/json` and rejects
unknown fields. Responses are `Cache-Control: no-store`.

| Route | Body / result |
| --- | --- |
| `GET /v1/health` | API availability only |
| `GET /v1/exploration` | Public derived `totalLocations`, `uniqueTriples`, `contributors`, `contributions` and up to ten `recentDiscoveries`; no credentials needed |
| `POST /v1/travellers` | `{}`; idempotently creates/resumes the supplied credential |
| `GET /v1/journey` | Current path, ordered prefix string, visit, revision, private history count, shared current-location attribution and global location/triple counts |
| `GET /v1/history?after=…` | Up to 100 historical visits; `next` cursor or null |
| `POST /v1/advance` | `{requestId, expectedRevision, door}` |
| `POST /v1/retrace` | `{requestId, expectedRevision}` |

The Worker imports `targets()` from the very same `engine.js` shipped to the
browser. Canonical target ordering is the door numbering; placement changes never
renumber targets. Only the server computes destination triples. No arbitrary
triples, paths, metadata, prompts or signed backward door operations are accepted.
Current software limits: original engine's primes below 10,000; G5 max 1,200
forward steps, 10,000 historical visits and 50,000 moves per traveller. These are
implementation safety limits, **not claims about mathematical finiteness**.

## Local setup — no cloud resources

Use a current Node LTS supported by the locked development tools, then:

```sh
npm ci
npm run check
npm test
npm run test:client
npm run migrate:local
npm run build:api
```

The final command is a **dry run**, not a deployment. In two terminals:

```sh
npx wrangler dev --local --port 8787 --var REGISTRATION_ENABLED:true
```

```sh
npm run dev:web
```

Open `http://localhost:4175/#g=5`, then **Connect / retry**. The local static server
serves only the seven game assets and substitutes the local API URL in memory.
It does not edit production configuration or expose backend/source-control files.

For a repeatable HTTP smoke test with two independent client storage contexts:

```sh
npm run smoke:local
npx wrangler d1 execute between-g5 --local --command "SELECT path,a,b,c,discovered_at FROM visits ORDER BY discovered_at;"
```

Expected: travel ROOT → 0 → 00, resume in second context, retrace to 0; all three
visit records remain. The generated test credential is never printed. Local D1
persists under `.wrangler/state` (ignored by Git). Tests use isolated local storage,
not the Cloudflare account. The smoke test also creates a second, DIFFERENT
traveller and repeats that path: three new personal contributions, no duplicate
global locations, unchanged original journey. Each run adds two local travellers.

Manual browser acceptance before approval:

1. Start G5, connect, travel two rooms, copy the private recovery code.
2. Open a separate browser profile at the local preview, select G5 and enter the code.
3. Confirm the same path/triple and revision. Retrace and confirm history count stays.
4. Reload; confirm the current string resumes. Inspect D1 with the query above.
5. Disconnect network, try a doorway, and reconnect with **Connect / retry**.
6. In two browser profiles try simultaneous moves; one must refresh on conflict.
7. Recheck G1–G4 saved paths, return landings, rotation and default G4 selection.
8. Create a DIFFERENT traveller in a third browser profile. Follow the same path:
   personal histories are separate, global locations do not duplicate, and the
   original discoverer keeps attribution. Reach a new branch and confirm global
   counts update when the first traveller reconnects. Inspect `/v1/exploration`
   with the allowed Origin and verify no traveller IDs or credentials are exposed.

Automated checks cover these state transitions and actual app handlers. They are
not a substitute for testing the eventual hosted staging URL on Paul's tablet.

## Cloudflare / x10 deployment — approval required

Issue #36's backend-only staging deployment is complete with Paul's approval;
see [the verification record](STAGING-HANDOFF.md). The following checklist describes
the deployment process and remaining frontend gate. Keep x10's existing
website and GitHub Pages game intact. No nameserver or DNS migration is needed for
an isolated `workers.dev` staging API. Costs/plan activation require approval.

For an approved isolated staging environment (backend steps completed for #36):

1. Use the connected Cloudflare account, or locally authenticate Wrangler with
   `npx wrangler login`. Never paste provider tokens into source files or chat.
2. Create one new staging D1 database, e.g. `between-g5-staging`. Record its ID.
   Do not reuse any production DB. No R2, Queues or AI provider are needed yet.
3. Make a separate staging Wrangler config based on `wrangler.jsonc`: replace
   database ID/name, Worker name, set `workers_dev: true`, and allow **only** the
   approved preview site's origin. Remove localhost origins for external staging.
   Bind `DB`, `REQUEST_LIMIT`, and `CREATE_LIMIT`. Check rate limiter namespace
   IDs `5001`/`5002` do not overlap other applications in the account.
4. Apply **all** numbered files in `backend/migrations/` (currently `0001` and
   `0002`) to that staging DB, then deploy
   that Worker using the explicit staging config. These are **remote writes**:

   ```sh
   npx wrangler d1 create between-g5-staging
   npx wrangler d1 migrations apply between-g5-staging --remote --config wrangler.staging.jsonc
   npx wrangler deploy --config wrangler.staging.jsonc
   ```

5. Start registrations closed. For invited testing, enable registration briefly
   with a small `MAX_TRAVELLERS`, then close it again; existing credentials still
   resume. Restrict private staging with Cloudflare Access where available.
   CORS is not authentication or bot protection. Rate limits are per Cloudflare
   location and approximate, not billing controls; the registration cap is checked
   atomically in D1. Broad public signup needs further abuse protection/Turnstile
   and approved retention/cost monitoring before launch.
6. Set only the **public HTTPS API URL** in a staging copy of `g5-config.js`.
   Upload just `index.html`, `style.css`, `app.js`, `engine.js`, `view.js`,
   `journey-client.js`, `g5-config.js` to an approved separate x10 preview folder.
   Do **not** upload the repository, backend, `.git`, `.dev.vars`, dependencies or
   database backups to public_html. Back up any target files before replacing them.
7. Perform the manual acceptance test above, now between browsers/devices on the
   hosted preview. Only after approval should G5 be enabled at `/between/`.

No application-wide secret is required in Stage A: the DB uses a binding, and
traveller bearer tokens are hashed. Future image API keys belong in Worker secrets,
never browser config. Public image generation remains entirely unimplemented/off.

## Backups and rollback

- Keep deployed baseline commit `1fd2cc6` and original x10 files. Rolling frontend
  assets back restores G4 without deleting G5 records. Do not reset/drop a database.
- Stop registrations with `REGISTRATION_ENABLED=false`; disable the frontend G5
  connection by clearing `G5_API_URL`. G1–G4 continue to run.
- Migrations are additive. Keep `0001` unchanged once applied to a real DB; future
  schema changes need new numbered migrations. Triggers deliberately block visit
  updates/deletes; future privacy deletion needs an explicit administrator design.
  `0002` is additive and compatible with the earlier G5 Worker: rolling that
  Worker back still records shared discoveries via the visit trigger. Do not drop
  the shared tables/triggers on rollback. Backfill costs scale with stored visits;
  test against a private backup before any populated remote database migration.
- Before a migration or public test, export the staging DB to private storage
  with `wrangler d1 export ... --remote --output=<private-path>`, and test restore
  into a separate database. Never commit/export bearer credentials or expose
  backups publicly. Confirm Time Travel retention in the selected plan; snapshots
  are a recovery aid, not a promise of indefinite archival. Agree offsite backup,
  personal-data retention/deletion and monitoring policies before public launch.

Reference docs: [D1 batches](https://developers.cloudflare.com/d1/worker-api/d1-database/),
[Worker tests](https://developers.cloudflare.com/workers/testing/vitest-integration/),
[rate limits](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
