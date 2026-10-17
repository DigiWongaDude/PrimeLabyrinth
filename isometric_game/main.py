"""Desktop launcher for the same single-file renderer used by PyramIDE."""
import argparse
import os
from pathlib import Path
import runpy
import sys
import traceback

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from side_scroller_model import Explorer

# Keep one visual/interaction implementation so tablet fixes reach desktop too.
edition = runpy.run_path(str(ROOT / "PrimeLabyrinth-PyramIDE.py"), run_name="tablet_edition")
pygame = edition["pygame"]
Game = edition["Game"]


def parse_room(value):
    try:
        return tuple(map(int, value.split(",")))
    except ValueError as error:
        raise argparse.ArgumentTypeError("use three comma-separated primes") from error


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--save", type=Path, default=ROOT / "saves" / "isometric.json")
    parser.add_argument("--new", action="store_true")
    parser.add_argument("--start", type=parse_room, default=(2, 2, 3))
    parser.add_argument("--screenshot", type=Path)
    args = parser.parse_args()
    explorer = Explorer.load(args.save) if args.save.exists() and not args.new else Explorer(args.start)
    pygame.init()
    game = Game(explorer, None if args.screenshot else args.save)
    if args.screenshot:
        args.screenshot.parent.mkdir(parents=True, exist_ok=True)
        pygame.image.save(game.draw(), args.screenshot)
        pygame.quit()
        return
    android = "ANDROID_ROOT" in os.environ or sys.platform == "android"
    screen = pygame.display.set_mode((0, 0) if android else (1280, 800))
    pygame.display.set_caption("The Between / Wayfarer")
    edition["run"](game, screen)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        (ROOT / "isometric-crash.txt").write_text(traceback.format_exc(), encoding="utf-8")
        raise
