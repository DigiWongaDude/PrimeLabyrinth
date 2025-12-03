# labyrinth_adventure.py
# ASCII adventure wrapper for the Prime Labyrinth
# Uses: labyrinth_engine, labyrinth_search, labyrinth_text

import labyrinth_engine as le
import labyrinth_search as ls
import labyrinth_text as lt

# ---------------- GLOBAL STATE ----------------

prime_levels: dict[int, int] = {}
next_level = 1

# Per-room state
room_state: dict[tuple[int, tuple[int, int, int]], dict] = {}

# Path stack for reverse / turnaround
# Each entry: {"p": int, "h": (a,b,c)}
path_stack: list[dict] = []


# ---------------- HELPERS ----------------

def clear_screen():
    print("\033c", end="")
    
def get_or_create_room(p: int, h: tuple[int, int, int]):
    """
    Returns state dict for room (p,h):
    { "doors": [...], "opened": [bool...], "nxt": int|None }
    """
    key = (p, h)
    if key in room_state:
        return room_state[key]

    row, nxt = le.build_row(p)
    doors = None
    for rh, ds in row:
        if rh == h:
            doors = ds
            break

    if doors is None:
        doors = []
        nxt = None

    state = {
        "doors": list(doors),
        "opened": [False] * len(doors),
        "nxt": nxt,
    }
    room_state[key] = state
    return state


def assign_level_for_prime(p: int):
    """
    Ensure prime p has a level number.
    Returns (level, first_time_flag).
    """
    global next_level, prime_levels

    if p in prime_levels:
        return prime_levels[p], False

    lvl = next_level
    next_level += 1
    prime_levels[p] = lvl
    return lvl, True


def choose_start_prime_and_room():
    """
    Ask user for starting prime and starting room that actually exists.
    """
    default_p = ls.DEFAULT_START_P
    default_h = ls.DEFAULT_START_H

    print("=== Prime Labyrinth ASCII Adventure ===")
    print("Press ENTER for default start prime 7.")
    p_in = input(f"Start prime [{default_p}]: ").strip()
    if not p_in:
        p = default_p
    else:
        try:
            p = int(p_in)
        except ValueError:
            print("Bad value. Using default prime 7.")
            p = default_p

    row, _ = le.build_row(p)
    rooms = [h for (h, _ds) in row]

    if not rooms:
        print(f"No valid rooms exist at prime {p}.")
        print("Exiting.")
        raise SystemExit

    print(f"\nRooms available at prime {p}:")
    for i, h in enumerate(rooms, 1):
        print(f" [{i}] {h}")

    if p == default_p and default_h in rooms:
        default_index = rooms.index(default_h) + 1
    else:
        default_index = 1

    h_in = input(f"Choose room index [{default_index}]: ").strip()
    if not h_in:
        idx = default_index
    else:
        try:
            idx = int(h_in)
        except ValueError:
            print("Bad index. Using default.")
            idx = default_index

    if idx < 1 or idx > len(rooms):
        print("Index out of range. Using first room.")
        idx = 1

    h = rooms[idx - 1]
    return p, h


def format_header(p: int):
    """
    Prints the header section with level and elevator voice text.
    """
    lvl, first_time = assign_level_for_prime(p)

    print("=" * 40)
    if first_time:
        status = f"NEW HIGH SCORE  |  welcome to level {lvl}"
    else:
        status = f"welcome back to level {lvl}"
    print(f"Level {lvl}  |  P{p}  |  {status}")
    print("-" * 40)


def show_room(p: int, h: tuple[int, int, int]):
    """
    Show all info for current room, including doors and choices.
    Returns (state, closed_indices) where state is room state dict.
    """
    clear_screen()
    state = get_or_create_room(p, h)
    doors = state["doors"]
    opened = state["opened"]

    format_header(p)

    total = len(doors)
    open_count = sum(1 for flag in opened if flag)
    closed_count = total - open_count

    # Summary text from text module
    for line in lt.room_summary(total, open_count, closed_count):
        print(line)

    if total > 0:
        print("\nDoors:")
        for i, d in enumerate(doors, 1):
            mark = "*" if opened[i - 1] else ""
            print(f"  [{i}] {d}{mark}")

        # ASCII front view
        print()
        for line in lt.ascii_front_doors(doors, opened):
            print(line)

    closed_indices = [i + 1 for i, flag in enumerate(opened) if not flag]

    # Choice text from text module
    for line in lt.choice_block(total, closed_indices):
        print(line)

    print()
    print("Please choose a door forward:")
    print("Info: R to reverse, S to start again, T to turnaround, Q to quit")

    if closed_indices:
        choice_tokens = "".join(f"({idx})" for idx in closed_indices)
        print(f"..{choice_tokens}?")
    else:
        print("..(none)?")

    return state, closed_indices


def reverse_step():
    """
    Go back one step along the path stack if possible.
    Returns (p, h) or None if not possible.
    """
    if not path_stack:
        print("\nYou are at the starting point. Cannot reverse.\n")
        return None

    last = path_stack.pop()
    return last["p"], last["h"]

def turnaround_view(current_p, current_h):
    if not path_stack:
        print("\nYou are at the lobby. There is no door in yet.\n")
        return

    prev = path_stack[-1]
    prev_p = prev["p"]
    prev_h = prev["h"]

    prev_row, _ = le.build_row(prev_p)
    incoming = []
    for h_prev, ds in prev_row:
        if current_h in ds:
            incoming.append(h_prev)

    print("\nYou turn around.\n")
    print(f"Door IN [1] {prev_h}")

    if not incoming:
        print("No doors from the previous level lead into this room.\n")
        return

    hidden = [h for h in incoming if h != prev_h]

    if not hidden:
        print("No hidden doors into this room from the previous level.\n")
        return

    print(f"Backroom scan: {len(hidden)} hidden doors found.\n")
    print("I FOUND SOME HIDDEN DOORS !!!")
    print("Hidden Doors:")

    for i, h_prev in enumerate(hidden, start=2):
        print(f" [{i}] {h_prev}")

    # ASCII outline: IN door plus hidden doors as frames
    icons = ["[IN]"] + ["[?]" for _ in hidden]
    print("\n" + " ".join("┌───┐" for _ in icons))
    print(" ".join(f"│{lab:^3}│" for lab in icons))
    print(" ".join("└───┘" for _ in icons))
    print()

    if not incoming:
        print("No doors from the previous level lead into this room.\n")
        return

    # Hidden doors are all the other incoming rooms
    hidden = [h for h in incoming if h != prev_h]

    if not hidden:
        print("No hidden doors into this room from the previous level.\n")
        return
	
    print(f"Backroom scan: {len(hidden)} hidden doors found.\n")
    print("\nI FOUND SOME HIDDEN DOORS !!!")
    print("Hidden Doors:")
    for i, h_prev in enumerate(hidden, start=2):
        print(f" [{i}] {h_prev}")
    print()

def start_again():
    """
    Full reset: clear path, doors, and level tracking.
    Return new starting room chosen by the user.
    """
    global room_state, path_stack, prime_levels, next_level
    room_state.clear()
    path_stack.clear()
    prime_levels.clear()
    next_level = 1
    print("\nElevator voice: resetting the Labyrinth. Returning to the lobby.\n")
    return choose_start_prime_and_room()


# ---------------- MAIN LOOP ----------------

def main():
    start_p, start_h = choose_start_prime_and_room()
    p = start_p
    h = start_h

    while True:
        state, closed_indices = show_room(p, h)
        doors = state["doors"]
        opened = state["opened"]
        nxt = state["nxt"]

        cmd = input("\n> ").strip().upper()

        if cmd == "Q":
            print("\nGoodnight, wanderer.\n")
            break

        if cmd == "R":
            result = reverse_step()
            if result is not None:
                p, h = result
            continue

        if cmd == "S":
            start_p, start_h = start_again()
            p, h = start_p, start_h
            continue

        if cmd == "T":
            turnaround_view(p,h)
            continue

        if not cmd:
            print("Please enter a number, R, S, T, or Q.")
            continue

        try:
            idx = int(cmd)
        except ValueError:
            print("Unknown command. Use a door number, R, S, T, or Q.")
            continue

        if idx not in closed_indices:
            print("That door is not available. Choose a closed door number.")
            continue

        if nxt is None:
            print("There is no next prime from here. Edge of the Labyrinth.")
            continue

        opened[idx - 1] = True
        path_stack.append({"p": p, "h": h})

        target_h = doors[idx - 1]
        p = nxt
        h = target_h


if __name__ == "__main__":
    main()
