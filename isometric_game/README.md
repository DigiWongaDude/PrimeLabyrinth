# The Between — isometric prototype

This is a separate Equinox-inspired presentation of the Prime Labyrinth. It
uses the same nine-key engine, path addresses, room fundamentals and persistent
save format as the side-scroller, but lays each room out as an isometric
cutaway.

Exits are distributed deterministically over the north, west and east walls.
When a wall needs more than four doors, later doors appear on upper levels. A
glowing lift rune at the door's threshold raises the player automatically, so
every generated exit remains reachable. The open front corner is the entrance
back to the previous room. Backroom bridges remain disabled.

From the repository root:

```bash
python -m pip install -r requirements-side-scroller.txt
python isometric_game/main.py
```

Click or tap the floor to walk to that spot. Click a doorway (or its glowing
threshold) to walk there and enter automatically, including riding its lift
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

Verification: `python -m unittest isometric_game.test_pointer -v` checks floor
movement, retargeting, entry and return through every wall and raised level,
mouse/touch mapping under scaling and letterboxing, synthetic touch suppression,
canonical engine/colour agreement, and desktop save compatibility.

Use a new expedition or custom origin with:

```bash
python isometric_game/main.py --new
python isometric_game/main.py --new --start 3,3,7
```
