# Prime Labyrinth

A text-based adventure for exploring the Prime Labyrinth in the terminal.

## Running the adventure

1. Ensure you have Python 3.10+ installed.
2. From the project root, run:
   ```bash
   python labyrinth_adventure.py
   ```
3. Follow the prompts to choose a starting prime and room, then pick doors to explore the maze. Use the on-screen commands to reverse, restart, turn around, or quit.

### Quick non-interactive demo

If you just want to verify the game runs (for example, inside this coding environment) without typing commands, use the auto-walk demo:

```bash
python labyrinth_adventure.py --demo 3
```

This will start at the default room and automatically take three forward doors, showing the screens along the way.

## Modules
- `labyrinth_adventure.py` – interactive ASCII adventure loop.
- `labyrinth_engine.py` – prime labyrinth generation logic.
- `labyrinth_search.py` – search helpers and defaults for starting locations.
- `labyrinth_text.py` – formatted text and ASCII art helpers.
