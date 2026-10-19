# G5 private staging access decision checklist

This is a decision document, not a deployment instruction. It covers the
smallest safe way to test password accounts and real Google sign-in without
changing production, DNS, remote D1, Cloudflare settings or secrets. Paul must
perform any dashboard action and approve the selected option.

## What the current implementation actually enforces

- The Worker checks the request `Origin` against `ALLOWED_ORIGINS` for every
  `/v1/*` route. That is browser CORS, not authentication: a CLI or attacker can
  send an arbitrary `Origin` header.
- The frontend uses `credentials: 'omit'` and sends bearer tokens explicitly.
  It does not send Cloudflare Access cookies. An Access login redirect from the
  API would therefore break browser `fetch`, and Access cookies cannot be
  treated as the game's account session.
- Google login returns to the frontend page with `code` and `state`; the page
  removes them from the URL and POSTs them to `/v1/auth/google/complete`. The
  redirect URI must be the exact page origin/path accepted by the Worker.
- `REGISTRATION_ENABLED=true` is open signup for any client that can reach the
  API. There is no invite token, email allowlist, or backend tester gate.
- `GET /` is intentionally outside the Origin guard and must continue to serve
  the Minotaur entrance. Protecting or changing it is not part of this test.

## Options and decision

| Option | Frontend | API | Browser-compatible now? | Decision |
| --- | --- | --- | --- | --- |
| A. Closed staging | Pages preview public or Access-protected | API public but `ACCOUNTS_ENABLED=false` | Yes; no account creation | **Safe baseline** |
| B. Short open test | Pages preview optionally Access-protected | API reachable; temporarily enable accounts/registration | Yes | **Smallest no-code account test**, but not private/invite-only |
| C. Access on both | Pages + Worker Access | Access in front of API | No: current `credentials:'omit'` client cannot use Access cookies/redirects | **Do not choose without Astra/security redesign** |
| D. Backend invite gate | Pages preview + normal bearer API | Worker rejects signup unless a server-held invite is valid | Yes | Strongest private test, but new auth design/migration; request Astra before implementation |

Recommended sequence: A for the initial deployment and Minotaur/API smoke
tests; then B only if Paul accepts a brief public staging signup window with a
small `MAX_TRAVELLERS` cap, monitoring and immediate shutdown. Choose D instead
if “only these named testers” is a hard requirement. Do not describe B as
invited-only. Do not choose C by merely placing Access in front of the API.

## Cloudflare dashboard checklist (Paul only)

1. Create a Pages project from `DigiWongaDude/PrimeLabyrinth` named
   `between-g5-preview`, with the static repository root as the output and the
   `codex/g5-persistence` branch as the preview branch. No custom domain is
   needed. Cloudflare's branch alias is expected to be
   `https://codex-g5-persistence.between-g5-preview.pages.dev`, but this remains
   **unconfirmed until the project/deployment exists**.
2. In Pages preview-deployment settings, optionally enable Access for the Pages
   preview and permit only Paul's/Sara's identities. This protects the page,
   not the API. Verify an unauthenticated browser receives Access, while an
   authenticated tester can load the static bundle.
3. Keep the staging Worker API as the separate
   `https://between-g5-staging-api.digiwongadude.workers.dev`. Confirm its
   source allowlist is updated to the confirmed Pages origin before deployment.
4. Do **not** put Access in front of the API for the current browser client.
   If Paul wants API Access, stop and redesign the client/API auth boundary with
   Sara/Astra; do not add Access headers, service tokens or `credentials:include`
   ad hoc.
5. For Google Cloud, only after the Pages alias is confirmed, register the
   exact JavaScript origin and redirect URI shown in the runbook. Named Google
   test users constrain Google's audience; they do not constrain password
   signup.

## Required tests for each option

### A — closed baseline

- Address-bar `GET /` displays the Minotaur image.
- Allowed-origin `GET /v1/health` succeeds; missing/foreign origins fail.
- `GET /v1/auth/config` reports `accounts_disabled` and signup is rejected.
- Pages Access, if enabled, protects only the preview UI; direct API smoke
  requests remain intentionally testable and account creation remains closed.

### B — controlled open window

- Before opening: private D1 backup, exact Worker SHA/version, flags and cap
  recorded; Pages/API origins and Google redirect are confirmed.
- Use disposable password credentials and named Google test users. Run signup,
  login, wrong-password, recovery, explicit link, two-device continuity and
  shared discovery attribution tests from the existing runbook.
- Run a direct CLI signup with a deliberately non-browser request to prove the
  limitation is understood; it must be rate-limited/capped, not misreported as
  blocked by CORS.
- Close `REGISTRATION_ENABLED` immediately after the matrix; verify new signup
  is rejected while existing login/continuity is handled according to the
  approved test plan.

### C/D gate

Do not begin implementation or claim private testing until Sara reviews the
security design. A backend invite gate must define token creation, storage,
expiry, one-use semantics, rate limits, audit/discovery ownership and recovery
behavior. An Access-based API design must define browser credentials, CORS with
credentials, CSRF protection, OAuth callback behavior and failure handling.

## Local validation available now

The current local suites already validate the relevant baseline behavior:

```text
npm test                 # origin guard, closed registration, Google state/linking, Minotaur
npm run test:client      # browser journey/navigation regressions
npm run check            # generated Worker bindings and TypeScript
npm run build:api        # local Worker dry build
npx wrangler deploy --config wrangler.staging.jsonc --dry-run --outdir .worker-build-staging
```

These commands cannot prove a remote Access policy, Pages login, real Google
OAuth exchange or remote registration gate. Those require Paul's approved
staging deployment and Sara's hosted acceptance review.

References: [Pages preview deployments](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
and [Workers with Cloudflare Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/).
