# Prime Labyrinth

Explore a maze woven from prime numbers through a small collection of interactive tools and visualisers.

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
