"""Search for a route beyond a forward frontier using reverse backroom doors."""

from __future__ import annotations

import argparse
import json
import sqlite3
from collections import deque
from pathlib import Path

import labyrinth_engine as engine


Room = tuple[int, int, int]
State = tuple[Room, Room | None]


def room_key(room: Room) -> str:
    return ",".join(map(str, room))


def parse_room(key: str) -> Room:
    return tuple(map(int, key.split(",")))


def doors(room: Room, target_prime: int | None) -> list[Room]:
    if target_prime is None:
        return []
    return engine.doors_out_of(room, target_prime)


def token(index: int, reverse: bool) -> str:
    encoded = format(index, "X") if index < 16 else f"[{index:X}]"
    return f"-{encoded}" if reverse else encoded


def incoming_states(database: Path, prime: int) -> list[State]:
    with sqlite3.connect(database) as connection:
        rows = connection.execute(
            """SELECT d.target_room_key, d.room_key
               FROM doors d JOIN rooms target
                 ON target.room_key = d.target_room_key
               WHERE target.prime = ?
               ORDER BY d.target_room_key, d.room_key""",
            (prime,),
        ).fetchall()
    return [(parse_room(current), parse_room(parent)) for current, parent in rows]


def search(database: Path, frontier_prime: int) -> dict:
    seeds = incoming_states(database, frontier_prime)
    if not seeds:
        raise ValueError(f"no known visits enter prime {frontier_prime}")

    queue = deque(seeds)
    visited = set(seeds)
    predecessor: dict[State, tuple[State, str]] = {}
    origin = {state: state for state in seeds}
    escaped: State | None = None

    while queue and escaped is None:
        state = queue.popleft()
        current, entrance = state
        prime = sum(current)
        next_level = engine.next_prime(prime)
        previous_level = engine.prev_prime(prime) if prime > 2 else None

        candidates = (
            (False, doors(current, next_level)),
            (True, doors(current, previous_level)),
        )
        for reverse, targets in candidates:
            for index, target in enumerate(targets):
                if target == entrance:
                    continue
                next_state = (target, current)
                if next_state in visited:
                    continue
                visited.add(next_state)
                predecessor[next_state] = (state, token(index, reverse))
                origin[next_state] = origin[state]
                if sum(target) > frontier_prime:
                    escaped = next_state
                    break
                queue.append(next_state)
            if escaped is not None:
                break

    if escaped is None:
        return {
            "escaped": False,
            "frontier_prime": frontier_prime,
            "seed_visits": len(seeds),
            "visit_states_examined": len(visited),
        }

    route = []
    state = escaped
    while state not in seeds:
        previous, step_token = predecessor[state]
        route.append(
            {
                "token": step_token,
                "source_prime": sum(previous[0]),
                "source_room": room_key(previous[0]),
                "target_prime": sum(state[0]),
                "target_room": room_key(state[0]),
            }
        )
        state = previous
    route.reverse()
    seed = state
    return {
        "escaped": True,
        "frontier_prime": frontier_prime,
        "reached_prime": sum(escaped[0]),
        "seed_visits": len(seeds),
        "visit_states_examined": len(visited),
        "starting_visit": {
            "room": room_key(seed[0]),
            "entrance": room_key(seed[1]) if seed[1] else None,
        },
        "backroom_route": route,
        "route_code_suffix": "".join(step["token"] for step in route),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--database", type=Path, default=Path("prime_labyrinth_10000.sqlite3")
    )
    parser.add_argument("--frontier-prime", type=int, default=5449)
    parser.add_argument("--report-output", type=Path)
    args = parser.parse_args()

    result = search(args.database, args.frontier_prime)
    rendered = json.dumps(result, indent=2)
    if args.report_output:
        args.report_output.parent.mkdir(parents=True, exist_ok=True)
        args.report_output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)


if __name__ == "__main__":
    main()
