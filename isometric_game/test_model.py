import unittest

from isometric_game.model import ROOM_SIZE, make_doors, nearest_door


class IsometricLayoutTests(unittest.TestCase):
    def test_three_wall_distribution_and_order(self):
        targets = [(3, 3, 5)] * 9
        doors = make_doors((2, 2, 3), targets)
        self.assertEqual([door.index for door in doors], list(range(9)))
        self.assertEqual({door.wall for door in doors}, {"NORTH", "WEST", "EAST"})
        self.assertEqual([door.target for door in doors], targets)

    def test_many_doors_gain_reachable_upper_levels(self):
        doors = make_doors((3, 3, 7), [(3, 5, 11)] * 18)
        self.assertGreater(max(door.level for door in doors), 0)
        for door in doors:
            x, y = door.approach
            self.assertTrue(0 < x < ROOM_SIZE and 0 < y < ROOM_SIZE)
            self.assertEqual(nearest_door(doors, x, y).index, door.index)

    def test_same_room_has_same_layout(self):
        targets = [(3, 3, 5), (3, 5, 5), (2, 2, 7)]
        self.assertEqual(make_doors((2, 2, 3), targets),
                         make_doors((2, 2, 3), targets))


if __name__ == "__main__":
    unittest.main()
