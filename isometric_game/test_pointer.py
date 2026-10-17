"""Exercise actual tap -> walking -> transition, including SDL touch events."""
import os
os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")
import runpy
from pathlib import Path
import unittest

from side_scroller_model import Explorer, Fundamentals

code = runpy.run_path(str(Path(__file__).resolve().parents[1] / "PrimeLabyrinth-PyramIDE.py"))
pygame = code["pygame"]


class PointerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        pygame.init()

    def settle(self, game):
        for _ in range(1800):
            game.update(1 / 120)
            if game.destination is None:
                return
        self.fail("Walking or lift never arrived")

    def test_floor_motion_retarget_and_stop(self):
        game = code["Game"]()
        game.click(code["iso"](3, 7))
        self.settle(game)
        self.assertAlmostEqual(game.x, 3)
        self.assertAlmostEqual(game.y, 7)
        game.click(code["iso"](8, 7))
        game.update(.1)
        game.click(code["iso"](5, 9))
        self.settle(game)
        self.assertEqual((game.x, game.y), (5, 9))
        self.assertEqual(game.explorer.path, [])

    def test_real_doors_all_walls_and_return(self):
        seen = set()
        for wall in ("NORTH", "WEST", "EAST"):
            for level in (0, 1, 2):
                game = code["Game"]()
                door = code["Door"](0, wall, 6, level, (3, 3, 5))
                game.doors = [door]
                polygon = code["portal_polygon"](door)
                # Width must be parallel to the projection of the wall's tangent.
                dx, dy = polygon[1][0] - polygon[0][0], polygon[1][1] - polygon[0][1]
                self.assertEqual(dx * dy > 0, wall == "NORTH")
                point = tuple(sum(p[i] for p in polygon) / 4 for i in (0, 1))
                game.click(point)
                self.assertEqual(game.pending, 0)
                self.settle(game)
                self.assertEqual(game.explorer.current, (3, 3, 5))
                self.assertEqual(game.explorer.path, [0])
                game.click(code["iso"](*code["RETURN_POINT"]))
                self.settle(game)
                self.assertEqual(game.explorer.current, (2, 2, 3))
                seen.add(wall)
        self.assertEqual(len(seen), 3)

    def test_scaled_mouse_and_finger_have_identical_destinations(self):
        for size in ((1280, 800), (640, 800), (2560, 1600), (800, 1280)):
            rect = code["viewport"](size)
            logical = code["iso"](3, 8)
            physical = (rect.x + logical[0] * rect.w / 1280,
                        rect.y + logical[1] * rect.h / 800)
            mouse = pygame.event.Event(pygame.MOUSEBUTTONDOWN, pos=physical, button=1)
            finger = pygame.event.Event(pygame.FINGERDOWN, x=physical[0]/size[0], y=physical[1]/size[1])
            for event in (mouse, finger):
                game = code["Game"]()
                game.click(code["pointer_point"](event, size))
                self.settle(game)
                self.assertAlmostEqual(game.x, 3)
                self.assertAlmostEqual(game.y, 8)
            synthetic = pygame.event.Event(pygame.MOUSEBUTTONDOWN, pos=physical, button=1, touch=True)
            self.assertIsNone(code["pointer_point"](synthetic, size))
        self.assertIsNone(code["logical_point"]((0, 0), (640, 800)))

    def test_standalone_matches_engine_and_fundamentals(self):
        explorer = Explorer()
        for _ in range(40):
            self.assertEqual(code["accent_for"](explorer.current, explorer.entrance),
                             Fundamentals(explorer.current, explorer.entrance).accent)
            import side_scroller_model as canonical
            self.assertEqual(code["targets"](explorer.current), canonical.targets(explorer.current))
            if not explorer.take(0):
                break

    def test_shared_renderer_preserves_desktop_save(self):
        import tempfile
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "save.json"
            game = code["Game"](Explorer(), path)
            game.click(code["iso"](*game.doors[0].approach))
            self.settle(game)
            self.assertEqual(Explorer.load(path).path, [0])


if __name__ == "__main__":
    unittest.main()
