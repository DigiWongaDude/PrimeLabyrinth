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

Controls: WASD or arrow keys to move, E or Enter to use a nearby exit,
Backspace to return immediately, and Escape to save and quit.

On Android, open `main.py` in PyramIDE and use its green graphical Run arrow.
The game requests PyramIDE's SDL fullscreen surface and scales the 1280x800
logical canvas to the tablet while preserving its aspect ratio. Do not launch a
graphical build from PyramIDE's plain terminal: that shell does not initialise
SDL. If the graphical runner exits unexpectedly, inspect `isometric-crash.txt`
in the repository root.

Use a new expedition or custom origin with:

```bash
python isometric_game/main.py --new
python isometric_game/main.py --new --start 3,3,7
```
