"""Persistent, graphics-free traversal of the Prime Labyrinth.

The traversal is depth first: take the leftmost closed door, and step back
when a room has no closed doors.  Room and door state is stored in SQLite so
converging paths see the same room state and interrupted runs can resume.
"""

from __future__ import annotations

import argparse
import sqlite3
from dataclasses import dataclass
from contextlib import contextmanager
from pathlib import Path
from typing import Iterable

import labyrinth_engine as le
from labyrinth_search import DEFAULT_START_H, DEFAULT_START_P


DEFAULT_DATABASE = Path("prime_labyrinth.sqlite3")


def room_key(h: Iterable[int]) -> str:
    """Return the canonical database key for a prime-additive triplet."""
    values = tuple(int(value) for value in h)
    if len(values) != 3:
        raise ValueError("a room must contain exactly three prime additives")
    if values != tuple(sorted(values)):
        raise ValueError("room additives must be in ascending order")
    return ",".join(str(value) for value in values)


def parse_room_key(key: str) -> tuple[int, int, int]:
    values = tuple(int(value) for value in key.split(","))
    if len(values) != 3:
        raise ValueError(f"invalid room key: {key!r}")
    return values


@dataclass(frozen=True)
class Move:
    kind: str
    source: tuple[int, int, int]
    target: tuple[int, int, int] | None = None
    door_index: int | None = None


class PersistentTraversal:
    """SQLite-backed leftmost-door traversal with persistent room state."""

    def __init__(
        self,
        database: str | Path = DEFAULT_DATABASE,
        *,
        start_p: int = DEFAULT_START_P,
        start_h: Iterable[int] = DEFAULT_START_H,
        max_prime: int | None = None,
    ) -> None:
        self.database = Path(database)
        self.start_p = int(start_p)
        self.start_h = tuple(int(value) for value in start_h)
        self.max_prime = max_prime
        self._validate_room(self.start_p, self.start_h)

        self.connection = sqlite3.connect(self.database)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA foreign_keys = ON")
        self.connection.execute("PRAGMA journal_mode = WAL")
        self.connection.execute("PRAGMA synchronous = NORMAL")
        self.connection.execute("PRAGMA busy_timeout = 5000")
        try:
            self._create_schema()
            self._initialise_or_validate()
        except Exception:
            self.connection.close()
            raise

    def close(self) -> None:
        self.connection.close()

    def __enter__(self) -> "PersistentTraversal":
        return self

    def __exit__(self, *_exc_info: object) -> None:
        self.close()

    @staticmethod
    def _validate_room(p: int, h: tuple[int, ...]) -> None:
        if len(h) != 3 or h != tuple(sorted(h)):
            raise ValueError("a room must be a sorted triplet")
        if sum(h) != p:
            raise ValueError(f"room {h} does not add up to prime {p}")
        if p not in le.PRIME_SET or any(value not in le.PRIME_SET for value in h):
            raise ValueError(f"room {h} contains an unknown or non-prime value")

    def _create_schema(self) -> None:
        self.connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS rooms (
                room_key TEXT PRIMARY KEY,
                prime INTEGER NOT NULL,
                additive_a INTEGER NOT NULL,
                additive_b INTEGER NOT NULL,
                additive_c INTEGER NOT NULL,
                discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (additive_a, additive_b, additive_c),
                CHECK (prime = additive_a + additive_b + additive_c)
            );

            CREATE TABLE IF NOT EXISTS doors (
                room_key TEXT NOT NULL REFERENCES rooms(room_key),
                door_index INTEGER NOT NULL CHECK (door_index > 0),
                target_room_key TEXT NOT NULL,
                target_prime INTEGER NOT NULL,
                target_a INTEGER NOT NULL,
                target_b INTEGER NOT NULL,
                target_c INTEGER NOT NULL,
                is_open INTEGER NOT NULL DEFAULT 0 CHECK (is_open IN (0, 1)),
                opened_at TEXT,
                PRIMARY KEY (room_key, door_index)
            );

            CREATE TABLE IF NOT EXISTS traversal_state (
                singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                start_room_key TEXT NOT NULL,
                max_prime INTEGER,
                status TEXT NOT NULL,
                total_moves INTEGER NOT NULL DEFAULT 0,
                forward_moves INTEGER NOT NULL DEFAULT 0,
                backward_moves INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS active_path (
                depth INTEGER PRIMARY KEY CHECK (depth >= 0),
                room_key TEXT NOT NULL REFERENCES rooms(room_key)
            );

            CREATE INDEX IF NOT EXISTS doors_closed_leftmost
                ON doors(room_key, is_open, door_index);
            """
        )

    def _initialise_or_validate(self) -> None:
        state = self.connection.execute(
            "SELECT * FROM traversal_state WHERE singleton = 1"
        ).fetchone()
        start_key = room_key(self.start_h)
        if state is None:
            with self.connection:
                self._discover_room(self.start_p, self.start_h)
                self.connection.execute(
                    """INSERT INTO traversal_state
                       (singleton, start_room_key, max_prime, status)
                       VALUES (1, ?, ?, 'ready')""",
                    (start_key, self.max_prime),
                )
                self.connection.execute(
                    "INSERT INTO active_path(depth, room_key) VALUES (0, ?)",
                    (start_key,),
                )
            return

        if state["start_room_key"] != start_key or state["max_prime"] != self.max_prime:
            raise ValueError(
                "database traversal settings differ from the requested start or "
                "prime ceiling; use a different database file"
            )
        path_count = self.connection.execute(
            "SELECT COUNT(*) FROM active_path"
        ).fetchone()[0]
        if not path_count:
            raise RuntimeError("database has traversal state but no active path")

    def _room_doors(self, p: int, h: tuple[int, int, int]):
        nxt = le.next_prime(p)
        if nxt is None or (self.max_prime is not None and nxt > self.max_prime):
            return None, []
        return nxt, le.doors_out_of(h, nxt)

    def _discover_room(self, p: int, h: tuple[int, int, int]) -> None:
        """Create a room and its initially closed doors if not already known."""
        key = room_key(h)
        known = self.connection.execute(
            "SELECT 1 FROM rooms WHERE room_key = ?", (key,)
        ).fetchone()
        if known:
            return

        self._validate_room(p, h)
        self.connection.execute(
            """INSERT INTO rooms
               (room_key, prime, additive_a, additive_b, additive_c)
               VALUES (?, ?, ?, ?, ?)""",
            (key, p, *h),
        )
        nxt, doors = self._room_doors(p, h)
        if nxt is None:
            return
        self.connection.executemany(
            """INSERT INTO doors
               (room_key, door_index, target_room_key, target_prime,
                target_a, target_b, target_c)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            [
                (key, index, room_key(target), nxt, *target)
                for index, target in enumerate(doors, start=1)
            ],
        )

    def _current_row(self) -> sqlite3.Row:
        row = self.connection.execute(
            """SELECT active_path.depth, rooms.*
               FROM active_path
               JOIN rooms USING (room_key)
               ORDER BY active_path.depth DESC
               LIMIT 1"""
        ).fetchone()
        if row is None:
            raise RuntimeError("active traversal path is empty")
        return row

    @contextmanager
    def _transaction(self):
        """Join a run batch transaction, or create one for a single step."""
        if self.connection.in_transaction:
            yield
        else:
            with self.connection:
                yield

    @property
    def current(self) -> tuple[int, tuple[int, int, int]]:
        row = self._current_row()
        return row["prime"], (
            row["additive_a"], row["additive_b"], row["additive_c"]
        )

    def step(self) -> Move:
        """Make one forward or backward move, or report completion."""
        current = self._current_row()
        source = (
            current["additive_a"], current["additive_b"], current["additive_c"]
        )
        closed = self.connection.execute(
            """SELECT * FROM doors
               WHERE room_key = ? AND is_open = 0
               ORDER BY door_index
               LIMIT 1""",
            (current["room_key"],),
        ).fetchone()

        if closed is not None:
            target = (closed["target_a"], closed["target_b"], closed["target_c"])
            with self._transaction():
                self.connection.execute(
                    """UPDATE doors
                       SET is_open = 1, opened_at = CURRENT_TIMESTAMP
                       WHERE room_key = ? AND door_index = ?""",
                    (current["room_key"], closed["door_index"]),
                )
                self._discover_room(closed["target_prime"], target)
                self.connection.execute(
                    "INSERT INTO active_path(depth, room_key) VALUES (?, ?)",
                    (current["depth"] + 1, closed["target_room_key"]),
                )
                self.connection.execute(
                    """UPDATE traversal_state
                       SET status = 'running', total_moves = total_moves + 1,
                           forward_moves = forward_moves + 1,
                           updated_at = CURRENT_TIMESTAMP
                       WHERE singleton = 1"""
                )
            return Move("forward", source, target, closed["door_index"])

        if current["depth"] == 0:
            with self._transaction():
                self.connection.execute(
                    """UPDATE traversal_state
                       SET status = 'completed', updated_at = CURRENT_TIMESTAMP
                       WHERE singleton = 1"""
                )
            return Move("completed", source)

        parent = self.connection.execute(
            "SELECT room_key FROM active_path WHERE depth = ?",
            (current["depth"] - 1,),
        ).fetchone()
        if parent is None:
            raise RuntimeError("active traversal path has a missing parent")
        target = parse_room_key(parent["room_key"])
        with self._transaction():
            self.connection.execute(
                "DELETE FROM active_path WHERE depth = ?", (current["depth"],)
            )
            self.connection.execute(
                """UPDATE traversal_state
                   SET status = 'running', total_moves = total_moves + 1,
                       backward_moves = backward_moves + 1,
                       updated_at = CURRENT_TIMESTAMP
                   WHERE singleton = 1"""
            )
        return Move("backward", source, target)

    def run(
        self, max_moves: int | None = None, *, commit_interval: int = 5_000
    ) -> dict[str, int | str | None]:
        """Traverse until complete, committing small atomic move batches."""
        if commit_interval < 1:
            raise ValueError("commit_interval must be positive")
        moves = 0
        while max_moves is None or moves < max_moves:
            batch_size = commit_interval
            if max_moves is not None:
                batch_size = min(batch_size, max_moves - moves)
            completed = False
            with self.connection:
                for _ in range(batch_size):
                    move = self.step()
                    if move.kind == "completed":
                        completed = True
                        break
                    moves += 1
            if completed:
                return self.summary()

        with self.connection:
            self.connection.execute(
                """UPDATE traversal_state
                   SET status = 'paused', updated_at = CURRENT_TIMESTAMP
                   WHERE singleton = 1"""
            )
        return self.summary()

    def summary(self) -> dict[str, int | str | None]:
        state = self.connection.execute(
            "SELECT * FROM traversal_state WHERE singleton = 1"
        ).fetchone()
        counts = self.connection.execute(
            """SELECT
                   (SELECT COUNT(*) FROM rooms) AS rooms,
                   (SELECT COUNT(*) FROM doors WHERE is_open = 1) AS opened_doors,
                   (SELECT COUNT(*) FROM doors) AS discovered_doors,
                   (SELECT MAX(depth) FROM active_path) AS depth"""
        ).fetchone()
        current_p, current_h = self.current
        return {
            "status": state["status"],
            "current_prime": current_p,
            "current_room": room_key(current_h),
            "total_moves": state["total_moves"],
            "forward_moves": state["forward_moves"],
            "backward_moves": state["backward_moves"],
            "rooms": counts["rooms"],
            "opened_doors": counts["opened_doors"],
            "discovered_doors": counts["discovered_doors"],
            "depth": counts["depth"],
            "max_prime": state["max_prime"],
        }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Traverse the Prime Labyrinth without Blender."
    )
    parser.add_argument("--database", type=Path, default=DEFAULT_DATABASE)
    parser.add_argument(
        "--max-moves",
        type=int,
        default=10_000,
        help="moves to make in this run (default: 10000; use 0 for no limit)",
    )
    parser.add_argument(
        "--max-prime",
        type=int,
        help="optional exploration ceiling; fixed when the database is created",
    )
    parser.add_argument(
        "--status", action="store_true", help="show stored progress without moving"
    )
    return parser


def format_summary(summary: dict[str, int | str | None]) -> str:
    ceiling = summary["max_prime"] if summary["max_prime"] is not None else le.PRIMES[-1]
    return (
        f"Status: {summary['status']}\n"
        f"Current: P{summary['current_prime']} room ({summary['current_room']})\n"
        f"Moves: {summary['total_moves']} "
        f"({summary['forward_moves']} forward, {summary['backward_moves']} backward)\n"
        f"Discovered: {summary['rooms']} rooms, "
        f"{summary['opened_doors']}/{summary['discovered_doors']} doors opened\n"
        f"Active depth: {summary['depth']} | prime ceiling: {ceiling}"
    )


def main() -> None:
    args = build_parser().parse_args()
    if args.max_moves < 0:
        raise SystemExit("--max-moves cannot be negative")
    with PersistentTraversal(args.database, max_prime=args.max_prime) as traversal:
        if args.status:
            summary = traversal.summary()
        else:
            limit = None if args.max_moves == 0 else args.max_moves
            summary = traversal.run(limit)
        print(format_summary(summary))


if __name__ == "__main__":
    main()
