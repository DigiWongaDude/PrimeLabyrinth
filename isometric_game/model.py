"""Layout facade for the standalone game's shared, deterministic rules.

All geometry lives in the portable file so desktop and Android stay in sync.
Importing this facade requires Pygame but never opens a display.
"""
from pathlib import Path
import runpy

_edition = runpy.run_path(str(Path(__file__).resolve().parents[1] / "PrimeLabyrinth-PyramIDE.py"))
ROOM_SIZE = _edition["ROOM_SIZE"]
IsoDoor = _edition["Door"]
make_doors = _edition["make_doors"]
nearest_door = _edition["nearest_door"]
