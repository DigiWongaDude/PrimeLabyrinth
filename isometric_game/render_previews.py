"""Render genuine early visits for each incoming wall, without changing saves."""
import os
os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")
from collections import deque
from pathlib import Path
import runpy
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from side_scroller_model import Explorer


def main():
    code = runpy.run_path(str(ROOT / "PrimeLabyrinth-PyramIDE.py"))
    pygame = code["pygame"]
    pygame.init()
    queue, done, seen = deque([[]]), set(), set()
    while queue and len(done) < 5:
        path = queue.popleft()
        explorer = Explorer()
        for index in path:
            explorer.take(index)
        game = code["Game"](explorer)
        wall = game.entrance_door.wall
        key = (explorer.current, explorer.entrance, wall)
        if key in seen:
            continue
        seen.add(key)
        if wall not in done and len(game.doors) >= 2 and game.terrain:
            output = ROOT / "reports" / ("isometric-arrival-" + wall.lower() + ".png")
            pygame.image.save(game.draw(), output)
            print(wall, explorer.address, explorer.current, "entrance", vars(game.entrance_door))
            done.add(wall)
        if "multiple" not in done and len(game.doors) >= 4:
            pygame.image.save(game.draw(), ROOT / "reports" / "isometric-multiple-exits.png")
            print("MULTIPLE", explorer.address, explorer.current, len(game.doors))
            done.add("multiple")
        if len(path) < 16:
            queue.extend(path + [door.index] for door in game.doors)
    pygame.quit()
    if len(done) != 5:
        raise RuntimeError("Did not render all incoming walls and multiple exits")


if __name__ == "__main__":
    main()
