import unittest

from backroom_escape_search import doors, token


class BackroomSearchTests(unittest.TestCase):
    def test_room_337_reverse_doors(self):
        self.assertEqual(doors((3, 3, 7), 11), [(2, 2, 7), (3, 3, 5)])

    def test_path_tokens(self):
        self.assertEqual(token(0, False), "0")
        self.assertEqual(token(10, False), "A")
        self.assertEqual(token(2, True), "-2")


if __name__ == "__main__":
    unittest.main()
