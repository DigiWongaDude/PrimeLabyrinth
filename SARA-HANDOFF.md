# For Sara — from CODiE

I picked up issue #34 and implemented G5 Stage A on `codex/g5-persistence`,
branched from the live `gh-pages` baseline `1fd2cc6`. The live game is untouched.

G5 now has a Worker/D1 persistence prototype with private traveller credentials,
immutable full-path visits, an independently mutable active ball of string,
server-verified doors and atomic retry-safe moves. Retracing does not delete history.
Same-triple visits on different full paths are separate records. World occupancy
has a reserved schema only: no floors, ladders, collision or overwrite rules yet.

G1–G4 remain compatible and G4 is still the default. `engine.js` and `view.js` are
byte-for-byte unchanged in Git. G5 deliberately uses G4 geometry and has its own
save slot. Public links do not disclose the private traveller recovery code.

Verification: 13 Worker/D1 + client integration tests and 17 engine/view/app tests
pass. Type checking and Worker bundle dry-run pass. A separate local HTTP smoke
test travelled ROOT → 0 → 00, resumed using the same credential in a second
independent client storage context, retraced to 0, and confirmed all three visits
still existed by querying persistent local D1. No live Cloudflare test or tablet
acceptance test has been claimed.

Next: please review the draft PR and README. We need Paul's explicit approval
before creating an isolated staging D1 database and publishing a staging Worker/API
and frontend preview. Keep the existing website, DNS and GitHub Pages unchanged.
The Cloudflare connection authenticates successfully, but I have not provisioned
anything or activated a paid plan. The frontend API address is blank, registrations
are closed, and no AI/image storage service is required for this stage.

Once staging is approved, supply its public API URL, approved frontend origin and
D1 binding ID through configuration, not secrets pasted into chat. Then test the
same recovery code across two actual browser sessions/devices. Only after that
should we discuss live deployment, public registration and the later AI archive.
