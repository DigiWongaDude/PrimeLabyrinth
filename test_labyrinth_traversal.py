"""Run: python -m unittest test_labyrinth_traversal -v"""

import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from labyrinth_traversal import PersistentTraversal, room_key


class PersistentTraversalTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database = Path(self.temp_dir.name) / "walk.sqlite3"

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_triplet_is_the_room_primary_key(self):
        with PersistentTraversal(self.database, max_prime=19):
            pass
        with closing(sqlite3.connect(self.database)) as connection:
            columns = connection.execute("PRAGMA table_info(rooms)").fetchall()
            primary_key = next(column[1] for column in columns if column[5] == 1)
            self.assertEqual(primary_key, "room_key")
            self.assertEqual(
                connection.execute("SELECT room_key FROM rooms").fetchone()[0],
                "2,2,3",
            )

    def test_leftmost_door_and_resume_active_path(self):
        with PersistentTraversal(self.database, max_prime=19) as traversal:
            move = traversal.step()
            self.assertEqual(move.kind, "forward")
            self.assertEqual(move.door_index, 1)
            self.assertEqual(move.target, (3, 3, 5))

        with PersistentTraversal(self.database, max_prime=19) as resumed:
            self.assertEqual(resumed.current, (11, (3, 3, 5)))
            self.assertEqual(resumed.summary()["opened_doors"], 1)
            second = resumed.step()
            self.assertEqual(second.door_index, 1)
            self.assertEqual(second.target, (3, 3, 7))

    def test_full_walk_persists_door_state_across_merge(self):
        with PersistentTraversal(self.database, max_prime=19) as traversal:
            summary = traversal.run()
            self.assertEqual(summary["status"], "completed")
            self.assertEqual(traversal.current, (7, (2, 2, 3)))
            self.assertEqual(summary["forward_moves"], summary["backward_moves"])

            merge_key = room_key((5, 5, 7))
            states = traversal.connection.execute(
                """SELECT door_index, is_open FROM doors
                   WHERE room_key = ? ORDER BY door_index""",
                (merge_key,),
            ).fetchall()
            self.assertEqual([(row[0], row[1]) for row in states], [(1, 1), (2, 1)])

            before = dict(summary)
            self.assertEqual(traversal.step().kind, "completed")
            self.assertEqual(traversal.summary(), before)

    def test_database_rejects_changed_ceiling(self):
        with PersistentTraversal(self.database, max_prime=19):
            pass
        with self.assertRaisesRegex(ValueError, "settings differ"):
            PersistentTraversal(self.database, max_prime=23)


if __name__ == "__main__":
    unittest.main()
