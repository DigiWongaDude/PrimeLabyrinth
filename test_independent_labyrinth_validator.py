import unittest

import independent_labyrinth_validator as validator


class IndependentValidatorTests(unittest.TestCase):
    def test_known_nine_key_transition(self):
        self.assertTrue(validator.nine_key_transition((5, 97, 167), (3, 101, 167)))

    def test_rejects_wrong_sum_and_non_adjacent_key(self):
        self.assertFalse(validator.nine_key_transition((5, 97, 167), (5, 101, 167)))
        self.assertFalse(validator.nine_key_transition((5, 97, 167), (3, 103, 167)))

    def test_independent_door_order(self):
        self.assertEqual(validator.independent_doors((2, 2, 3)), [(3, 3, 5)])
        self.assertEqual(
            validator.independent_doors((3, 3, 5)),
            [(3, 3, 7), (3, 5, 5)],
        )

    def test_replay_reaches_requested_prime(self):
        path, moves = validator.replay_first_path(19)
        self.assertEqual(path[0], (2, 2, 3))
        self.assertEqual(path[-1], (3, 3, 13))
        self.assertEqual(moves, 4)
        self.assertTrue(
            all(
                validator.nine_key_transition(source, target)
                for source, target in zip(path, path[1:])
            )
        )


if __name__ == "__main__":
    unittest.main()
