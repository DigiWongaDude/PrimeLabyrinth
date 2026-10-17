# Prime Labyrinth

Explore a maze woven from prime numbers through a small collection of interactive tools and visualisers.

## The Between — isometric prototype

The Equinox-inspired experiment lives independently in `isometric_game/` while
sharing the proven Prime Labyrinth engine and path-address save model. Its
cutaway rooms place exits opposite, left, right relative to the entrance,
repeating that order for additional doors. Travel preserves doorway position
and elevation on the matching wall in the next room. Taller walls and fixed
crate stairs provide reachable upper landings, derived from room fundamentals.

```bash
python -m pip install -r requirements-side-scroller.txt
python isometric_game/main.py
```

On Windows, double-click `Play-Isometric-Labyrinth.bat`. On a tablet or Linux
machine, clone or pull the `codex/pygame-explorers` branch and run the two
commands above. See `isometric_game/README.md` for controls and options.

PyramIDE on Android can run the single-file edition directly (Pygame required):
open `PrimeLabyrinth-PyramIDE.py` and press its green graphical Run arrow. This
edition embeds the prime engine and needs no sibling files. Tap/click the floor
to walk, a doorway to walk there and enter, or the RETURN doorway to retrace your
path. An animated cloaked explorer carries a lantern. The desktop launcher uses
this same renderer and input handling. The standalone edition currently keeps
its route only for the running session; desktop saves still persist.

## The Between — 2D platform explorer

Double-click **`Play-Prime-Labyrinth.bat`** on Windows. The launcher uses a local
Python environment and installs Pygame on first use (Python and internet access
are needed for that initial setup). Or run:

```powershell
.\.venv\Scripts\python.exe prime_side_scroller.py
```

For other platforms: `python -m pip install -r requirements-side-scroller.txt`,
then `python prime_side_scroller.py`.

Explore from `(2,2,3)` with no combat, damage or timer. Move with **A/D** or
**Left/Right**, **Space** to jump, **W/S** or **Up/Down** to climb, and **E** to
enter a nearby door. **Tab** shows the room fundamentals, **H** opens the field
guide, **R** recalls you to the current room's entrance, and **Esc** saves/quits.
Walk back to the left entrance and press E to retrace your journey.

Forward doors use the existing nine-key engine and lexicographic target order.
Zero-based exit labels repeat the spatial pattern **right, floor, ceiling**;
additional right exits sit on higher galleries connected by jump platforms.
Ceiling exits have ladders up, and floor exits have shafts with ladders down.
Rooms wider/taller than the viewport scroll with the player. All objects are
decorative and do not block the paths. Backroom bridges are disabled.

The **triplet determines the permanent layout**. The **current/entrance diamond
determines colour and objects**, using SHA-256 and fixed generation rules (no
process-dependent random hashing). The origin has only an upper half-diamond.
The complete origin plus hexadecimal door path identifies the visit; visits
sharing the same current/entrance pair currently share the same decoration.
Returning restores the parent's diamond and brings you back to its used exit.
Opened doors are shared across visits to a canonical room but may be used again.

Your route, discovered rooms and opened doors autosave to
`saves/side-scroller.json` on room transitions and exit. Restarting resumes the
saved visit at its left entrance (exact player coordinates are not saved).
Use a separate save for a new expedition:

```powershell
.\.venv\Scripts\python.exe prime_side_scroller.py --save saves/second-journey.json
.\.venv\Scripts\python.exe prime_side_scroller.py --save saves/custom-origin.json --start 3,3,7
```

`--new` replaces the selected save with a fresh journey. The current engine table
ends at 9973; an exhausted table is labelled separately from a genuine dead end.
With backrooms disabled, the known forward boundary from `(2,2,3)` is P5449.

Verification: `.venv\Scripts\python.exe -m unittest test_side_scroller -v` checks
diamond arithmetic, merged visits, persistence, and physical reachability of
every exit in layouts from 1 through 27 doors. Headless preview:

```powershell
.\.venv\Scripts\python.exe prime_side_scroller.py --screenshot reports/side-scroller.png --steps 00 --panel
```

## Requirements
- Python 3.10+
- [Pygame](https://www.pygame.org/news) for the visual modes (`labyrinth_adventure.py`, `labyrinth_delta.py`, `labyrinth_visual.py`). Install with:
  ```bash
  pip install pygame
  ```
  If Pygame cannot open a window (common in headless terminals), the visual modes will exit with a helpful message.

## Quick start launcher
Use the menu-driven launcher to reach every experience from one command:
```bash
python main.py
```
The launcher shows a splash screen and offers:
- **1)** Visual adventure (door-by-door exploration with keyboard/mouse)
- **2)** Prime probe CLI (inspect labyrinth rows in the terminal)
- **3)** River delta map (2D world graph viewer)
- **Q)** Quit

## Visual adventure (`labyrinth_adventure.py`)
A Pygame exploration of the labyrinth from a first-person doorway view.

Run it directly if you want to skip the launcher:
```bash
python labyrinth_adventure.py
```
You will be prompted for a starting prime (default **7**) and a room within that prime. Controls inside the window:
- **Number keys / click**: take the corresponding door
- **Left / Right arrows**: rotate the camera around the room
- **R**: flip between front and back walls
- **S**: restart at the lobby (default room)
- **Q** or **Esc**: quit

A breadcrumb path and door counts are shown on screen to help you track progress. The view automatically highlights opened doors.

## Classic front-view visualiser (`labyrinth_visual.py`)
A leaner Pygame front view of the same room data. Launch it with:
```bash
python labyrinth_visual.py
```
Controls mirror the visual adventure (number keys to choose doors, **R** to reverse, **S** to restart, **Q/Esc** to exit).

## Prime probe CLI (`labyrinth_engine.py`)
Inspect the labyrinth structure from the terminal without graphics:
```bash
python labyrinth_engine.py
```
Type a prime number to see its compact row signature, or append `!` to show the full room list and marked reachable rooms from the previous prime (e.g. `13!`). You can also request ranges like `7-19` (compact) or `7-19!` (full). Enter `quit` to exit.

## Persistent non-visual traversal (`labyrinth_traversal.py`)

Traverse from room `(2, 2, 3)` at prime 7 without Blender or Pygame:

```bash
python labyrinth_traversal.py
```

The walker always takes the leftmost closed door, then backtracks when it
reaches a dead end or a room whose doors are all open. Progress is stored in
`prime_labyrinth.sqlite3`. Rooms use their sorted additive triplet (for example
`2,2,3`) as the unique database key, so revisiting a room preserves its door
states even when a different route led there. The active path is also stored,
allowing the next invocation to resume exactly where the previous one stopped.

Each invocation makes 10,000 moves by default. Use `--max-moves 0` to run until
the finite engine table is exhausted, `--status` to inspect progress without
moving, or `--max-prime 101` when creating a new database to set a smaller
exploration ceiling.

The engine's current prime-table ceiling is 10000, so the highest available
prime level is 9973. For reproducible research runs, pass an explicit ceiling
and use a ceiling-specific database name, such as
`--database prime_labyrinth_10000.sqlite3 --max-prime 10000`.

### Independent traversal audit

`independent_labyrinth_validator.py` reimplements prime generation and the
nine-key transition rule without importing the labyrinth engine or traversal.
It validates every stored room and connection and can independently replay the
first-arrival path to a requested prime:

```bash
python independent_labyrinth_validator.py \
  --path-output reports/first-path-7-to-1999.csv \
  --report-output reports/full-traversal-audit.json
```

Here, the nine-key rule means previous/current/next prime for each of the three
additives. The validator checks the selected key for every additive, the target
sum, complete door sets, and left-to-right door ordering.

## River delta map (`labyrinth_delta.py`)
A 2D map of the world graph showing how rooms connect across primes.
```bash
python labyrinth_delta.py
```
Controls:
- **Arrow keys**: pan the camera
- **+ / -**: zoom in or out
- **Q** or **Esc**: quit

The default view renders primes from 7 up to 59; adjust `MAX_PRIME` in the file to explore more (performance permitting).

## Neon corridor web demo (Three.js)
A browser-based neon sci-fi corridor built with Vite, TypeScript, and Three.js lives at the repository root.

```bash
npm install
npm run dev
```

The camera auto-flies down a glowing corridor aligned to the +Z axis and stops in front of three closed, black-and-yellow hazard doors ready for future interactions.

## Supporting modules
- `labyrinth_search.py` – helper search and walk algorithms, including defaults for the starting room `(7, (2, 2, 3))`.
- `labyrinth_text.py` – text helpers used by the visual adventures for summaries and ASCII snippets.
- `labyrinth_story.py` – storyboard utilities for turning rooms into narrative beats.

Enjoy exploring the Prime Labyrinth!
