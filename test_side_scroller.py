"""Model invariants and actual fixed-step player reachability (SDL headless)."""
import os
import tempfile
import unittest
from pathlib import Path

os.environ["SDL_VIDEODRIVER"] = "dummy"
os.environ["SDL_AUDIODRIVER"] = "dummy"
from side_scroller_model import Explorer, Fundamentals, make_layout, targets


class ModelTests(unittest.TestCase):
    def test_requested_diamond(self):
        f = Fundamentals((3, 3, 7), (3, 3, 5))
        self.assertEqual(f.rows, ((4,), (0, 4), (3, 3, 7), (3, 3, 5), (0, 2), (2,)))
        self.assertEqual(f.accent, Fundamentals((3, 3, 7), (3, 3, 5)).accent)
        self.assertNotEqual(f.seed, Fundamentals((3, 3, 7), (2, 2, 7)).seed)

    def test_layout_pattern_and_persistence(self):
        for n in range(28):  # 27 possible key combinations, including >7 and >16.
            layout = make_layout((2, 2, 3), [(3, 3, 5)] * n)
            self.assertEqual([e.side for e in layout.exits],
                             [("RHS", "FLOOR", "CEILING")[i % 3] for i in range(n)])
            self.assertEqual(len(layout.ladders), n - (n + 2) // 3)
            self.assertTrue(all(p.width > 0 for p in layout.platforms))
            self.assertEqual(layout, make_layout((2, 2, 3), [(3, 3, 5)] * n))

    def test_merged_room_distinct_visits_and_shared_open_doors(self):
        s = Explorer()
        for i in (0, 0, 1):
            s.take(i)
        self.assertEqual(s.current, (5, 5, 7))
        appearance = s.fundamentals
        layout = make_layout(s.current)
        address = s.address
        s.take(0)
        s.back()
        self.assertEqual(s.fundamentals, appearance)
        self.assertEqual(s.address, address)
        s.back()
        s.back()
        s.take(1)
        s.take(1)
        self.assertEqual(s.current, (5, 5, 7))
        self.assertNotEqual(s.address, address)
        self.assertNotEqual(s.fundamentals, appearance)
        self.assertEqual(make_layout(s.current), layout)
        self.assertEqual(s.opened["5,5,7"], {0})

    def test_autosave_roundtrip_and_dead_end(self):
        s = Explorer()
        for _ in range(50):
            if not targets(s.current):
                break
            s.take(0)
        self.assertEqual(s.current, (3, 31, 79))
        self.assertFalse(s.take(0))
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / "save.json"
            s.save(p)
            loaded = Explorer.load(p)
            self.assertEqual(loaded.address, s.address)
            self.assertEqual(loaded.fundamentals, s.fundamentals)
            self.assertEqual(loaded.opened, s.opened)
            self.assertEqual(loaded.discovered, s.discovered)
            loaded.back()
            self.assertEqual(sum(loaded.current), 109)


try:
    from prime_side_scroller import Player, Game
    import pygame
except ModuleNotFoundError:
    Player = None


@unittest.skipIf(Player is None, "Install requirements-side-scroller.txt for physics/render checks")
class PlayTests(unittest.TestCase):
    def advance(self, p, layout, seconds, dx=0, dy=0, jump=False):
        for frame in range(round(seconds * 120)):
            p.move(1 / 120, dx, dy, jump and frame == 0, layout)

    def walk_to(self, p, layout, x):
        for _ in range(20000):
            if abs(p.x - x) < 2.4:
                return
            dx = 1 if p.x < x else -1
            approaching_hole = any(0 < dx * (s - p.x) < 95 for s in layout.shafts)
            p.move(1 / 120, dx, 0, approaching_hole and p.grounded, layout)
        self.fail("Player did not reach horizontal waypoint")

    def test_every_exit_physically_reachable_from_entrance(self):
        # No teleport between entrance and an exit: walk, jump and climb using
        # the same physics function the interactive game calls.
        for n in (1, 2, 3, 4, 5, 6, 7, 8, 16, 27):
            layout = make_layout((2, 2, 3), [(3, 3, 5)] * n)
            for exit in layout.exits:
                with self.subTest(doors=n, exit=exit.index):
                    p = Player(112, layout.floor)
                    self.advance(p, layout, .05)
                    if exit.side == "RHS":
                        self.walk_to(p, layout, layout.width - 190)
                        self.advance(p, layout, 1.5)  # settle after crossing shafts
                        while p.y > exit.feet_y + 2:
                            old = p.y
                            self.advance(p, layout, .8, jump=True)
                            self.assertLess(p.y, old, "jump staircase made no progress")
                        self.walk_to(p, layout, exit.x)
                    else:
                        self.walk_to(p, layout, exit.x)
                        self.advance(p, layout, 1.5)
                        self.advance(p, layout, (layout.floor + 200) / Player.CLIMB + 1,
                                     dy=-1 if exit.side == "CEILING" else 1)
                    self.assertLess(abs(p.x - exit.x), 52)
                    self.assertLess(abs(p.y - exit.feet_y), 52)

    def test_interaction_and_return_preserve_visit_and_render(self):
        pygame.init()
        try:
            s = Explorer()
            g = Game(s)
            initial = s.fundamentals
            exit = g.layout.exits[0]
            g.player = Player(exit.x, exit.feet_y)
            g.interact()
            self.assertEqual(s.current, (3, 3, 5))
            self.assertEqual(g.player.x, 112)
            g.interact()  # left entrance
            self.assertEqual(s.current, (2, 2, 3))
            self.assertEqual(s.fundamentals, initial)
            g.panel = True
            self.assertEqual(g.render().get_size(), (1280, 800))
        finally:
            pygame.quit()


if __name__ == "__main__":
    unittest.main()
