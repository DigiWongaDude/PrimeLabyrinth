# The Between — isometric prototype

This is a separate Equinox-inspired presentation of the Prime Labyrinth. It
uses the same nine-key engine, path addresses, room fundamentals and persistent
save format as the side-scroller, but lays each room out as an isometric
cutaway.

The origin's entrance is on the south wall. Leaving north brings you in through
the next room's south wall; east brings you in west, and vice versa. The exact
position along the wall and the elevation carry across. The character appears
at that entrance facing inward. Returning restores the previous layout and
places you beside the exit you used. The entrance is a separate RETURN doorway,
not one of the forward exits. Backroom bridges remain disabled.

Forward exits repeat **opposite, left, right**, looking inward from the entrance.
Counts 1/2/3 give O / O,L / O,L,R; counts 4/5/6 give O,L,R,O / O,L,R,O,L /
O,L,R,O,L,R. This rule rotates for every entrance wall. A single opposite door
is directly aligned with the entrance. Multiple doors on one wall occupy
distinct positions. The two front walls are visually cut away so the player
and doors stay visible; their physical wall planes still exist.

Walls are now 4.6 world units tall. The complete current/previous prime diamond
seeds doorway elevations and crate finishes. Forward elevations are 0, 0.75 or
1.5; the first two rooms are ground level. Raised thresholds have fixed crate
stairs in 0.375-unit steps. Tap-to-walk finds a route over these support surfaces,
going around steep sides instead of through crates. In very dense layouts,
some optional raised doors are deterministically lowered until every threshold
connects to the entrance. The entrance height is always preserved.

Crates are currently fixed, automatically climbed steps. Pushable crates,
manual jumps, and puzzle progression are future gameplay work. Objects are
reconstructed identically on returning to the same visit. Entrance orientation
and position are derived from the full path; the same triplet reached by a
different path can therefore have a differently oriented arrangement. Existing
saved routes remain valid, but this layout revision regenerates their geometry.

From the repository root:

```bash
python -m pip install -r requirements-side-scroller.txt
python isometric_game/main.py
```

Click or tap the floor to walk to that spot. Click a doorway (or its glowing
threshold) to walk there and enter automatically, including climbing its steps
when raised. Click RETURN to walk back along your path. A new floor tap changes
course and cancels a queued door entry. Escape closes the game. The explorer
has a hood, cloak, boots, lantern, and walking animation; there is no directional
pad or USE button.

On Android, open the single file `PrimeLabyrinth-PyramIDE.py` in PyramIDE and
use its green graphical Run arrow. The desktop launcher loads this same file
as its renderer, so geometry and interaction fixes reach both editions.
The game requests PyramIDE's SDL fullscreen surface and scales the 1280x800
logical canvas to the tablet while preserving its aspect ratio. Do not launch a
graphical build from PyramIDE's plain terminal: that shell does not initialise
SDL. The standalone edition stores the route in memory only, starting a fresh
journey on each launch. The desktop launcher retains the previous JSON saves.
If the standalone graphical runner fails inside its main loop, it attempts to
write `/sdcard/PrimeLabyrinth-PyramIDE-error.txt`. Native crashes or import-time
failures may not produce that log.

The displayed room colour now matches the canonical diamond calculation in
the side-scroller. Earlier standalone builds hashed the top diamond apex in a
different shape; their colours differed, although their routes were the same.

Tablet updates: in Termux, pull the repository, then overwrite just the shared
file (not the whole folder):

```bash
git -C ~/PrimeLabyrinth pull --ff-only
cp ~/PrimeLabyrinth/PrimeLabyrinth-PyramIDE.py ~/storage/shared/PrimeLabyrinth-PyramIDE.py
```

Close the old editor tab, reopen the shared file, and use the green Run arrow.

Verification: `python -m unittest discover -v` includes click-driven crossings
and returns in 120 reachable visit contexts, all four entrance walls, elevation
and position continuity, saved-path reconstruction, layout restoration, dense
layouts up to 27 exits, step reachability, input scaling, and engine agreement.
Run `python isometric_game/render_previews.py` to render actual early visits for
each entrance orientation plus a room with multiple exits on one wall. These
tests run on desktop with a headless SDL driver; final Android validation is
performed on the tablet.

Use a new expedition or custom origin with:

```bash
python isometric_game/main.py --new
python isometric_game/main.py --new --start 3,3,7
```
