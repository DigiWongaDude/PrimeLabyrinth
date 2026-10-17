"""Independent audit of the persistent Prime Labyrinth traversal.

This module deliberately does not import the project engine or traversal.  It
defines the nine-key rule independently: each of a room's three additives has
three keys (previous prime, unchanged prime, next prime).  A valid transition
chooses one key for each additive, sorts the result, and sums to the next prime
after the source room's sum.
"""

from __future__ import annotations

import argparse
import csv
import json
import sqlite3
from collections import defaultdict
from itertools import permutations, product
from pathlib import Path


MAX_N = 10000
START = (2, 2, 3)


def _primes_up_to(limit: int) -> list[int]:
    sieve = [True] * (limit + 1)
    sieve[:2] = [False, False]
    for value in range(2, int(limit**0.5) + 1):
        if sieve[value]:
            sieve[value * value : limit + 1 : value] = [False] * (
                ((limit - value * value) // value) + 1
            )
    return [value for value, is_prime in enumerate(sieve) if is_prime]


PRIMES = _primes_up_to(MAX_N)
PRIME_SET = set(PRIMES)
PRIME_INDEX = {prime: index for index, prime in enumerate(PRIMES)}


def adjacent_prime_keys(value: int) -> tuple[int, ...]:
    """The three keys for one additive: previous, same, and next prime."""
    index = PRIME_INDEX[value]
    previous = value if index == 0 else PRIMES[index - 1]
    following = PRIMES[index + 1] if index + 1 < len(PRIMES) else value
    return tuple(dict.fromkeys((previous, value, following)))


def next_prime(value: int) -> int | None:
    index = PRIME_INDEX[value]
    return PRIMES[index + 1] if index + 1 < len(PRIMES) else None


def canonical_room(room) -> tuple[int, int, int]:
    values = tuple(int(value) for value in room)
    if len(values) != 3 or values != tuple(sorted(values)):
        raise ValueError(f"room is not a sorted triplet: {values}")
    if any(value not in PRIME_SET for value in values):
        raise ValueError(f"room contains a non-prime key: {values}")
    return values


def nine_key_transition(source, target) -> bool:
    """Validate a transition without using labyrinth_engine.doors_out_of."""
    try:
        source = canonical_room(source)
        target = canonical_room(target)
    except ValueError:
        return False
    required_sum = next_prime(sum(source))
    if required_sum is None or sum(target) != required_sum:
        return False
    keys = tuple(adjacent_prime_keys(value) for value in source)
    return any(
        all(candidate[index] in keys[index] for index in range(3))
        for candidate in set(permutations(target))
    )


def independent_doors(
    source, max_prime: int | None = None
) -> list[tuple[int, int, int]]:
    """Generate all doors from the independently defined nine-key rule."""
    source = canonical_room(source)
    target_prime = next_prime(sum(source))
    if target_prime is None or (max_prime is not None and target_prime > max_prime):
        return []
    doors = {
        tuple(sorted(candidate))
        for candidate in product(*(adjacent_prime_keys(value) for value in source))
        if sum(candidate) == target_prime
    }
    return sorted(doors)


def replay_first_path(target_prime: int) -> tuple[list[tuple[int, int, int]], int]:
    """Independently replay leftmost DFS until target_prime is first reached."""
    stack = [START]
    opened: dict[tuple[int, int, int], set[int]] = defaultdict(set)
    total_moves = 0

    while stack:
        current = stack[-1]
        if sum(current) == target_prime:
            return list(stack), total_moves

        doors = independent_doors(current, max_prime=target_prime)
        closed_index = next(
            (index for index in range(len(doors)) if index not in opened[current]),
            None,
        )
        if closed_index is None:
            if len(stack) == 1:
                break
            stack.pop()
            total_moves += 1
            continue

        opened[current].add(closed_index)
        stack.append(doors[closed_index])
        total_moves += 1

    raise ValueError(f"prime {target_prime} is not reachable from {START}")


def validate_database(database: Path) -> dict:
    """Validate every stored room and connection against the independent rule."""
    with sqlite3.connect(database) as connection:
        connection.row_factory = sqlite3.Row
        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        rooms = connection.execute(
            """SELECT room_key, prime, additive_a, additive_b, additive_c
               FROM rooms ORDER BY prime, room_key"""
        ).fetchall()
        doors = connection.execute(
            """SELECT d.*, r.prime AS source_prime
               FROM doors d JOIN rooms r USING (room_key)
               ORDER BY d.room_key, d.door_index"""
        ).fetchall()
        state = connection.execute(
            "SELECT * FROM traversal_state WHERE singleton = 1"
        ).fetchone()

    errors: list[str] = []
    room_keys = set()
    room_values = {}
    for row in rooms:
        room = (row["additive_a"], row["additive_b"], row["additive_c"])
        key = ",".join(map(str, room))
        try:
            canonical_room(room)
        except ValueError as error:
            errors.append(str(error))
        if row["room_key"] != key or row["prime"] != sum(room):
            errors.append(f"invalid room identity: {dict(row)}")
        room_keys.add(row["room_key"])
        room_values[row["room_key"]] = room

    actual_doors = defaultdict(list)
    reverse_connections = 0
    for row in doors:
        source = room_values[row["room_key"]]
        target = (row["target_a"], row["target_b"], row["target_c"])
        target_key = ",".join(map(str, target))
        if not nine_key_transition(source, target):
            errors.append(
                f"nine-key failure: {source} -> {target} (door {row['door_index']})"
            )
        if row["target_room_key"] != target_key or row["target_prime"] != sum(target):
            errors.append(f"invalid target identity: {dict(row)}")
        if row["is_open"] and target_key not in room_keys:
            errors.append(f"opened door has undiscovered target: {target_key}")
        if row["target_prime"] < row["source_prime"]:
            reverse_connections += 1
        actual_doors[row["room_key"]].append((row["door_index"], target))

    database_ceiling = state["max_prime"]
    if database_ceiling is None:
        database_ceiling = max(row["prime"] for row in rooms)
    for key, source in room_values.items():
        expected = independent_doors(source, max_prime=database_ceiling)
        actual = [target for _, target in actual_doors[key]]
        indices = [index for index, _ in actual_doors[key]]
        if indices != list(range(1, len(actual) + 1)) or actual != expected:
            errors.append(f"door set/order mismatch for {source}")

    forward_moves = state["forward_moves"]
    backward_moves = state["backward_moves"]
    repeated_arrivals = forward_moves - max(0, len(rooms) - 1)
    return {
        "database_integrity": integrity,
        "status": state["status"],
        "database_prime_ceiling": database_ceiling,
        "unique_configurations": len(rooms),
        "connections": len(doors),
        "open_connections": sum(row["is_open"] for row in doors),
        "forward_moves": forward_moves,
        "backward_moves": backward_moves,
        "repeated_configuration_expansions_avoided": repeated_arrivals,
        "explicit_reverse_connections": reverse_connections,
        "stack_backtracking_enabled": backward_moves > 0,
        "validation_errors": errors,
        "validated": integrity == "ok" and not errors,
    }


def write_path(path: list[tuple[int, int, int]], destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("w", newline="", encoding="utf-8") as output:
        writer = csv.writer(output)
        writer.writerow(("step", "prime", "room_key", "additive_a", "additive_b", "additive_c"))
        for step, room in enumerate(path):
            writer.writerow((step, sum(room), ",".join(map(str, room)), *room))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=Path("prime_labyrinth.sqlite3"))
    parser.add_argument("--target-prime", type=int, default=1999)
    parser.add_argument("--path-output", type=Path)
    parser.add_argument("--report-output", type=Path)
    args = parser.parse_args()

    path, moves_to_first_arrival = replay_first_path(args.target_prime)
    path_errors = [
        index
        for index, (source, target) in enumerate(zip(path, path[1:]), start=1)
        if not nine_key_transition(source, target)
    ]
    report = validate_database(args.database)
    report.update(
        {
            "nine_key_definition": (
                "previous/current/next prime for each of three additives"
            ),
            "target_prime": args.target_prime,
            "first_arrival_path_rooms": len(path),
            "first_arrival_path_transitions": len(path) - 1,
            "moves_before_first_arrival": moves_to_first_arrival,
            "path_transition_errors": path_errors,
            "path_validated": not path_errors,
        }
    )

    if args.path_output:
        write_path(path, args.path_output)
    if args.report_output:
        args.report_output.parent.mkdir(parents=True, exist_ok=True)
        args.report_output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    if not report["validated"] or not report["path_validated"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
