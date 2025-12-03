# -----------------------------------------
#  labyrinth_search.py
#  Search / walk utilities for Prime Labyrinth
#  Uses labyrinth_engine as core
# -----------------------------------------

import random
import labyrinth_engine as le


# ---------- BASIC HELPERS ----------

def row_dict(p: int):
    """
    Convenience: build a dict h -> doors for prime p.
    """
    row, nxt = le.build_row(p)
    h_to_doors = {h: ds for (h, ds) in row}
    return h_to_doors, nxt


def rooms_with_doors(p: int):
    """
    All rooms at prime p that have at least one door out.
    """
    row, _ = le.build_row(p)
    return [h for (h, ds) in row if ds]


# ---------- LEFT-MOST WALK (NO BACKTRACKING) ----------

def leftmost_walk(start_p: int, start_h, max_steps: int = 1000):
    """
    Always choose the lexicographically smallest door from each room.
    Returns (path, status), where:
      - path  = list of (p, h)
      - status is one of:
          "dead_end"       -> room has no doors out
          "no_next_prime"  -> target prime not in table
          "h_not_found"    -> start room not valid for that prime
          "max_steps"      -> safety cap reached
    """
    p = int(start_p)
    h = tuple(start_h)
    path = []
    steps = 0

    while True:
        path.append((p, h))
        steps += 1
        if steps > max_steps:
            return path, "max_steps"

        row, nxt = le.build_row(p)
        if nxt is None:
            return path, "no_next_prime"

        # find this room
        doors = None
        for rh, ds in row:
            if rh == h:
                doors = ds
                break

        if doors is None:
            return path, "h_not_found"

        if not doors:
            return path, "dead_end"

        # left-most = sorted doors; first element
        h = doors[0]
        p = nxt


# ---------- MONTE CARLO WALK (NO BACKTRACKING) ----------

def random_walk(start_p: int, start_h, max_steps: int = 1000, rng=None):
    """
    Random walk: at each step, choose a random door from the current room.
    Returns (path, status) as per leftmost_walk.
    """
    if rng is None:
        rng = random

    p = int(start_p)
    h = tuple(start_h)
    path = []
    steps = 0

    while True:
        path.append((p, h))
        steps += 1
        if steps > max_steps:
            return path, "max_steps"

        row, nxt = le.build_row(p)
        if nxt is None:
            return path, "no_next_prime"

        doors = None
        for rh, ds in row:
            if rh == h:
                doors = ds
                break

        if doors is None:
            return path, "h_not_found"

        if not doors:
            return path, "dead_end"

        # pick one door uniformly at random
        h = rng.choice(doors)
        p = nxt


# ---------- DEPTH-FIRST EXPLORE WITH BACKTRACKING ----------

# canonical starting room: 7, h = (2, 2, 3)
DEFAULT_START_P = 7
DEFAULT_START_H = (2, 2, 3)


def depth_first_explore(
    start_p: int,
    start_h,
    max_total_steps: int = 1_000_000,
    max_prime: int | None = None
):
    """
    Full DFS from a starting room, with backtracking.

    Rules:
      - At each room, doors are considered in lexicographic order.
      - Each door (edge) is taken at most once.
      - When all doors out of a room have been used, we backtrack.
      - If max_prime is not None, we NEVER step into a room whose prime
        is greater than max_prime (doors to those rooms are treated as walls).
      - We stop when the stack is empty (fully explored under the limit),
        or when max_total_steps is exceeded.

    Returns a summary dict:
      {
        "status": "completed" | "max_steps" | "start_invalid",
        "total_steps": int,           # total moves along edges
        "total_nodes_visited": int,   # number of (p,h) frames ever pushed
        "max_depth": int              # deepest stack size reached
      }
    """

    p0 = int(start_p)
    h0 = tuple(start_h)

    # Build first row and find starting room
    row0, nxt0 = le.build_row(p0)
    doors0 = None
    for rh, ds in row0:
        if rh == h0:
            doors0 = ds
            break

    if doors0 is None:
        return {
            "status": "start_invalid",
            "total_steps": 0,
            "total_nodes_visited": 0,
            "max_depth": 0,
        }

    # Each stack frame:
    # { "p": int, "h": tuple, "nxt": int|None, "doors": list, "i": next_index }
    stack = [{
        "p": p0,
        "h": h0,
        "nxt": nxt0,
        "doors": list(doors0),
        "i": 0,
    }]

    total_steps = 0
    total_nodes = 1
    max_depth = 1

    while stack:
        if total_steps >= max_total_steps:
            return {
                "status": "max_steps",
                "total_steps": total_steps,
                "total_nodes_visited": total_nodes,
                "max_depth": max_depth,
            }

        frame = stack[-1]
        p = frame["p"]
        h = frame["h"]
        nxt = frame["nxt"]
        doors = frame["doors"]
        i = frame["i"]

        if i < len(doors):
            # take next unopened door
            target_h = doors[i]
            frame["i"] += 1
            total_steps += 1

            # respect prime ceiling
            if nxt is None or (max_prime is not None and nxt > max_prime):
                continue

            next_row, next_nxt = le.build_row(nxt)
            target_doors = None
            for rh, ds in next_row:
                if rh == target_h:
                    target_doors = ds
                    break

            if target_doors is None:
                # should not happen structurally, skip if it does
                continue

            new_frame = {
                "p": nxt,
                "h": target_h,
                "nxt": next_nxt,
                "doors": list(target_doors),
                "i": 0,
            }
            stack.append(new_frame)
            total_nodes += 1
            if len(stack) > max_depth:
                max_depth = len(stack)

        else:
            # all doors from this room tried: backtrack
            stack.pop()

    # stack empty: fully explored under given limit
    return {
        "status": "completed",
        "total_steps": total_steps,
        "total_nodes_visited": total_nodes,
        "max_depth": max_depth,
    }


def leftmost_from_default(max_steps: int = 1000):
    return leftmost_walk(DEFAULT_START_P, DEFAULT_START_H, max_steps=max_steps)


def random_from_default(max_steps: int = 1000, rng=None):
    return random_walk(DEFAULT_START_P, DEFAULT_START_H, max_steps=max_steps, rng=rng)


# ---------- DEMO WHEN RUN DIRECTLY ----------

if __name__ == "__main__":
    print("Left-most walk from (7, (2,2,3)):\n")

    path, status = leftmost_from_default(max_steps=1000)
    for p, h in path:
        print(f"p={p}, h={h}")
    print(f"\nStatus: {status}")

    if status == "dead_end":
        end_p, end_h = path[-1]
        print(f"\nDead-end at p={end_p}, h={end_h}")

    print("\nNow a few random walks from the same start:\n")
    for i in range(3):
        path, status = random_from_default(max_steps=200)
        end_p, end_h = path[-1]
        print(f"Walk {i+1}: length={len(path)}, status={status}, end=(p={end_p}, h={end_h})")

    # For visible backtracking, keep the ceiling SMALL first.
    limit_prime = 29  # you can bump this later
    print(f"\nDepth-first exploration with backtracking from default root "
          f"(max_prime = {limit_prime}):\n")

    summary = depth_first_explore(
        DEFAULT_START_P,
        DEFAULT_START_H,
        max_total_steps=1_000_000,
        max_prime=limit_prime,
    )

    if summary["status"] == "completed":
        print(
            f"Back home at p=7, h=(2, 2, 3). "
            f"Labyrinth fully explored from this root up to prime {limit_prime}."
        )
    else:
        print(f"Exploration stopped with status={summary['status']}.")

    print(
        f"Total steps: {summary['total_steps']}, "
        f"nodes visited: {summary['total_nodes_visited']}, "
        f"max depth: {summary['max_depth']}"
    ) 
