"""Direction, replay, step reachability, and actual click-driven room crossings."""
from collections import deque
import unittest
from isometric_game.test_pointer import code, pygame
from isometric_game import test_pointer
from side_scroller_model import Explorer


def centre(door):
    polygon = code["portal_polygon"](door)
    return tuple(sum(p[i] for p in polygon) / 4 for i in (0, 1))


class TravelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        pygame.init()

    settle = test_pointer.PointerTests.settle

    def test_requested_distribution_rotates_with_entrance(self):
        expected = {"SOUTH": ("NORTH", "WEST", "EAST"),
                    "NORTH": ("SOUTH", "EAST", "WEST"),
                    "WEST": ("EAST", "NORTH", "SOUTH"),
                    "EAST": ("WEST", "SOUTH", "NORTH")}
        for wall, order in expected.items():
            entrance = code["Door"](-1, wall, 6.5, .75, (3,3,5))
            for count in range(1, 28):
                doors = code["make_doors"]((3,3,7), [(3,5,11)] * count, entrance, (3,3,5))
                self.assertEqual([d.wall for d in doors], [order[i % 3] for i in range(count)])
                self.assertEqual([d.index for d in doors], list(range(count)))
                self.assertFalse(any(d.wall == wall for d in doors))
                for side in order:
                    positions = [d.position for d in doors if d.wall == side]
                    self.assertEqual(len(set(positions)), len(positions))
            offset_entrance = code["Door"](-1, wall, 3.5, 1.5, (3,3,5))
            only = code["make_doors"]((3,3,7), [(3,5,11)], offset_entrance, (3,3,5))[0]
            self.assertEqual(only.position, 3.5)

    def test_dense_generated_stairs_leave_every_door_accessible(self):
        for wall in ("NORTH", "SOUTH", "WEST", "EAST"):
            for position in (1.5, 3.5, 6.5, 10.5):
                entrance = code["Door"](-1, wall, position, 1.5, (3,3,5))
                for count in (1,2,3,4,5,6,7,9,18,27):
                    doors = code["make_doors"]((3,3,7), [(3,5,11)] * count, entrance, (3,3,5))
                    terrain = code["make_terrain"](doors + [entrance])
                    for door in doors + [entrance]:
                        self.assertEqual(terrain.get(code["cell_of"](door.approach), 0), door.level)
                        self.assertIsNotNone(code["walk_route"](entrance.approach, door.approach, terrain),
                                             (wall,position,count,vars(door)))

    def test_real_travel_return_replay_and_all_steps(self):
        queue = deque([[]])
        seen, crossed, levels = set(), set(), set()
        checked = 0
        while queue and checked < 120:
            path = queue.popleft()
            explorer = Explorer()
            for index in path:
                self.assertTrue(explorer.take(index))
            game = code["Game"](explorer)
            key = (explorer.current, explorer.entrance, game.entrance_door.wall)
            if key in seen:
                continue
            seen.add(key)
            checked += 1
            layout = [vars(d).copy() for d in game.doors]
            terrain = dict(game.terrain)
            for door in list(game.doors):
                queue.append(path + [door.index])
                # Use the actual rendered portal target, then exercise every movement frame.
                game.click(centre(door))
                self.assertEqual(game.pending, door.index)
                self.settle(game)
                self.assertEqual(explorer.current, door.target)
                incoming = game.entrance_door
                self.assertEqual(incoming.wall, code["OPPOSITE"][door.wall])
                self.assertEqual((incoming.position, incoming.level), (door.position, door.level))
                self.assertEqual((game.x,game.y,game.z), (*incoming.approach, incoming.level))
                self.assertEqual(game.facing, code["INWARD"][incoming.wall])
                # Reconstruct from the recorded route (desktop resume) without extra geometry data.
                replay = code["Game"](explorer)
                self.assertEqual(vars(replay.entrance_door), vars(incoming))
                self.assertEqual(replay.terrain, game.terrain)
                crossed.add(door.wall)
                levels.add(door.level)
                game.click(centre(incoming))
                self.assertEqual(game.pending, "back")
                self.settle(game)
                self.assertEqual(explorer.path, path)
                self.assertEqual((game.x,game.y,game.z), (*door.approach, door.level))
                self.assertEqual([vars(d) for d in game.doors], layout)
                self.assertEqual(game.terrain, terrain)
                for other in game.doors + [game.entrance_door]:
                    self.assertEqual(terrain.get(code["cell_of"](other.approach), 0), other.level)
                    route = code["walk_route"](door.approach, other.approach, terrain)
                    self.assertIsNotNone(route)
                    self.assertTrue(all(abs(a[2]-b[2]) <= code["STEP_HEIGHT"]+.001
                                        for a,b in zip(route,route[1:])))
        self.assertEqual(crossed, {"NORTH", "SOUTH", "WEST", "EAST"})
        self.assertEqual(levels, {0, .75, 1.5})
        self.assertEqual(checked, 120)

    def test_retargeting_cancels_door_and_stays_supported(self):
        explorer = Explorer()
        for _ in range(3):
            explorer.take(0)
        game = code["Game"](explorer)
        path = list(explorer.path)
        game.click(centre(game.doors[0]))
        game.update(.05)
        game.set_destination((6.5,6.5))
        self.settle(game)
        self.assertEqual(explorer.path,path)
        self.assertEqual((game.x,game.y), (6.5,6.5))
        self.assertEqual(game.z, game.terrain.get((6,6),0))
        for _ in range(100):
            game.update(.02)
        self.assertEqual(game.z, game.terrain.get((6,6),0))


if __name__ == "__main__":
    unittest.main()
