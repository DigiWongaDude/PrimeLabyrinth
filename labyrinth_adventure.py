# labyrinth_adventure_new_2.py
# Pygame visual adventure for the Prime Labyrinth

import sys
import math

import pygame

import labyrinth_engine as le
import labyrinth_search as ls
import labyrinth_text as lt


# --------------- GLOBAL STATE ---------------

prime_levels: dict[int, int] = {}
next_level = 1

# Per-room state
# (p, h) -> {"doors": [...], "opened": [...], "nxt": int | None}
room_state: dict[tuple[int, tuple[int, int, int]], dict] = {}

# Path stack for reverse
# [{"p": int, "h": (a, b, c)}, ...]
path_stack: list[dict] = []


# --------------- LOGIC HELPERS ---------------

def assign_level_for_prime(p: int) -> tuple[int, bool]:
    """Ensure prime p has a level number. Return (level, first_time_flag)."""
    global next_level, prime_levels

    if p in prime_levels:
        return prime_levels[p], False

    lvl = next_level
    next_level += 1
    prime_levels[p] = lvl
    return lvl, True


def reset_state() -> None:
    """Reset all global state for a fresh run."""
    global room_state, path_stack, prime_levels, next_level
    room_state.clear()
    path_stack.clear()
    prime_levels.clear()
    next_level = 1


def get_or_create_room(p: int, h: tuple[int, int, int]) -> dict:
    """
    Return state dict for room (p, h):
      { "doors": [...], "opened": [bool...], "nxt": int | None }
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


def reverse_step(current_p: int, current_h: tuple[int, int, int]):
    """Go back one step along the path stack if possible."""
    if not path_stack:
        print("[Labyrinth] Already at the lobby. Cannot reverse.")
        return current_p, current_h

    last = path_stack.pop()
    p = last["p"]
    h = last["h"]
    print(f"[Labyrinth] Reversed to P{p} room {h}.")
    return p, h


def start_again():
    """Full reset and return starting (p, h)."""
    reset_state()
    print("[Labyrinth] Reset to start room.")
    # Reuse the search defaults, like the ASCII adventure
    return ls.DEFAULT_START_P, ls.DEFAULT_START_H


# --------------- PYGAME VISUALS ---------------

WINDOW_WIDTH = 1280
WINDOW_HEIGHT = 720

BACKGROUND_COLOR = (5, 8, 16)
PANEL_COLOR = (24, 32, 64)
TEXT_COLOR = (230, 235, 245)
TEXT_DIM = (170, 175, 185)
DOOR_CLOSED_COLOR = (90, 140, 255)
DOOR_OPEN_COLOR = (60, 90, 155)


def make_fonts():
    pygame.font.init()
    return {
        "title": pygame.font.SysFont("DejaVu Sans", 32, bold=True),
        "sub": pygame.font.SysFont("DejaVu Sans", 20),
        "door_label": pygame.font.SysFont("DejaVu Sans", 18, bold=True),
        "small": pygame.font.SysFont("DejaVu Sans", 16),
    }


def layout_doors(doors: list[tuple[int, int, int]], viewport_rect: pygame.Rect):
    """
    Compute rectangles for each door inside viewport_rect.
    Returns list of (rect, center_x, top_y).
    """
    n = max(len(doors), 1)
    margin_x = viewport_rect.width * 0.08
    usable_width = viewport_rect.width - 2 * margin_x

    door_width = min(140, usable_width / max(n, 1) * 0.7)
    door_height = 260

    # Clamp height to viewport
    door_height = min(door_height, viewport_rect.height - 40)

    step = usable_width / max(n, 1)
    base_y = viewport_rect.top + (viewport_rect.height - door_height) / 2

    result = []
    for i in range(n):
        center_x = viewport_rect.left + margin_x + step * i + step / 2
        rect = pygame.Rect(0, 0, door_width, door_height)
        rect.centerx = center_x
        rect.top = base_y
        result.append((rect, center_x, rect.top))
    return result


def draw_room(
    screen,
    fonts,
    p: int,
    h: tuple[int, int, int],
    state: dict,
) -> list[tuple[int, pygame.Rect]]:
    """
    Draw the entire room.
    Return mapping of door index -> rect for click detection.
    """
    screen.fill(BACKGROUND_COLOR)
    width, height = screen.get_size()

    doors = state["doors"]
    opened = state["opened"]
    total = len(doors)
    open_count = sum(1 for flag in opened if flag)
    closed_count = total - open_count

    # Top bar
    top_margin = 16
    x_margin = 20

    title = f"Prime Labyrinth - P{p}  room {h}"
    title_surf = fonts["title"].render(title, True, TEXT_COLOR)
    screen.blit(title_surf, (x_margin, top_margin))

    sub = f"Doors: total {total}   open {open_count}   closed {closed_count}"
    sub_surf = fonts["sub"].render(sub, True, TEXT_DIM)
    screen.blit(sub_surf, (x_margin, top_margin + 34))

    # Optional summary text (from labyrinth_text)
    summary_lines = lt.room_summary(total, open_count, closed_count)
    for i, line in enumerate(summary_lines):
        line_surf = fonts["small"].render(line, True, TEXT_DIM)
        screen.blit(line_surf, (x_margin, top_margin + 60 + i * 18))

    # Doors viewport: leave enough space at bottom for legend
    legend_height = 40
    doors_top = top_margin + 110
    doors_bottom = height - legend_height - 10
    doors_rect = pygame.Rect(0, doors_top, width, max(doors_bottom - doors_top, 80))

    door_layout = layout_doors(doors, doors_rect)

    click_map: list[tuple[int, pygame.Rect]] = []

    for idx, ((a, b, c), (rect, cx, ty)) in enumerate(zip(doors, door_layout), start=1):
        # Panel
        color = DOOR_OPEN_COLOR if opened[idx - 1] else DOOR_CLOSED_COLOR
        pygame.draw.rect(screen, color, rect, border_radius=16)

        # Door index
        label = fonts["door_label"].render(str(idx), True, TEXT_COLOR)
        label_rect = label.get_rect()
        label_rect.midbottom = (rect.centerx, rect.bottom - 8)
        screen.blit(label, label_rect)

        # h-set above door
        h_text = f"({a}, {b}, {c})"
        h_surf = fonts["small"].render(h_text, True, TEXT_COLOR)
        h_rect = h_surf.get_rect()
        h_rect.midbottom = (rect.centerx, rect.top - 6)
        screen.blit(h_surf, h_rect)

        click_map.append((idx, rect))

    # Bottom legend
    legend_text = "Press 1-9 or tap a door. R=reverse, S=restart, Q / ESC=quit."
    legend_surf = fonts["small"].render(legend_text, True, TEXT_DIM)
    legend_rect = legend_surf.get_rect()
    legend_rect.centerx = width // 2
    legend_rect.bottom = height - 10
    screen.blit(legend_surf, legend_rect)

    pygame.display.flip()
    return click_map


def handle_click(pos, click_map: list[tuple[int, pygame.Rect]]):
    """Return the door index that was clicked, or None."""
    for idx, rect in click_map:
        if rect.collidepoint(pos):
            return idx
    return None


def visual_loop(start_p: int, start_h: tuple[int, int, int]):
    """Main pygame loop for the visual adventure."""
    pygame.init()
    screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
    pygame.display.set_caption("Prime Labyrinth - Visual Adventure")

    fonts = make_fonts()
    clock = pygame.time.Clock()

    p = start_p
    h = start_h

    running = True
    click_map: list[tuple[int, pygame.Rect]] = []

    print("pygame", pygame.version.ver, "running.")
    print("Hello from the pygame community. https://www.pygame.org/contribute.html")
    print("[Labyrinth] Visual adventure started.")
    print("[Labyrinth] Q / ESC to quit.\n")

    while running:
        clock.tick(30)

        state = get_or_create_room(p, h)
        click_map = draw_room(screen, fonts, p, h, state)

        nxt = state["nxt"]
        doors = state["doors"]
        opened = state["opened"]

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False

            elif event.type == pygame.KEYDOWN:
                if event.key in (pygame.K_q, pygame.K_ESCAPE):
                    running = False

                elif event.key == pygame.K_r:
                    p, h = reverse_step(p, h)

                elif event.key == pygame.K_s:
                    p, h = start_again()

                elif pygame.K_1 <= event.key <= pygame.K_9:
                    idx = event.key - pygame.K_0
                    p, h = take_door(p, h, idx, state)

            elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                idx = handle_click(event.pos, click_map)
                if idx is not None:
                    p, h = take_door(p, h, idx, state)

    pygame.quit()
    print("\n[Labyrinth] Visual adventure ended. Goodbye.")


def take_door(
    p: int,
    h: tuple[int, int, int],
    idx: int,
    state: dict,
):
    """Take door idx in current state if possible, and return new (p, h)."""
    doors = state["doors"]
    opened = state["opened"]
    nxt = state["nxt"]

    if idx < 1 or idx > len(doors):
        print(f"[Labyrinth] Door {idx} is not available in this room.")
        return p, h

    if opened[idx - 1]:
        print(f"[Labyrinth] Door {idx} is already open.")
        return p, h

    if nxt is None:
        print("[Labyrinth] There is no next prime from here. Edge of the Labyrinth.")
        return p, h

    opened[idx - 1] = True
    path_stack.append({"p": p, "h": h})

    target_h = doors[idx - 1]
    print(f"[Labyrinth] Taking door {idx} -> P{nxt} room {target_h}.")

    return nxt, target_h


# --------------- ENTRY POINT ---------------

def choose_start_room():
    """Simple text prompt for start prime and room, like the ASCII version."""
    default_p = ls.DEFAULT_START_P
    default_h = ls.DEFAULT_START_H

    print("=== Prime Labyrinth ASCII Adventure (visual) ===")
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
        print(f"No valid rooms exist at prime {p}. Exiting.")
        raise SystemExit

    print(f"\nRooms available at prime {p}:")
    for i, room_h in enumerate(rooms, 1):
        print(f" [{i}] {room_h}")

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


def main():
    reset_state()
    start_p, start_h = choose_start_room()
    visual_loop(start_p, start_h)


if __name__ == "__main__":
    main()
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

    print()

def reset_state():
    """
    Clear path, doors, and level tracking so a fresh run can start.
    """
    global room_state, path_stack, prime_levels, next_level
    room_state.clear()
    path_stack.clear()
    prime_levels.clear()
    next_level = 1


def start_again():
    """
    Full reset: clear path, doors, and level tracking.
    Return new starting room chosen by the user.
    """
    reset_state()
    print("\nElevator voice: resetting the Labyrinth. Returning to the lobby.\n")
    return choose_start_prime_and_room()


# ---------------- MAIN LOOP ----------------

def main():
    reset_state()
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
            turnaround_view(p, h)
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


def demo_walk(steps: int):
    """
    Auto-run the labyrinth for a few forward steps using default start.
    This lets automated environments show the game without manual input.
    """
    reset_state()
    p = ls.DEFAULT_START_P
    h = ls.DEFAULT_START_H

    for _ in range(steps):
        state, closed_indices = show_room(p, h)
        doors = state["doors"]
        opened = state["opened"]
        nxt = state["nxt"]

        if not closed_indices:
            print("No closed doors remain. Demo stopping.")
            return

        if nxt is None:
            print("Reached the edge of the Labyrinth. Demo stopping.")
            return

        idx = closed_indices[0]
        opened[idx - 1] = True
        path_stack.append({"p": p, "h": h})
        p = nxt
        h = doors[idx - 1]

    # Show the final room state after the last automatic step
    show_room(p, h)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Prime Labyrinth ASCII adventure")
    parser.add_argument(
        "--demo",
        type=int,
        metavar="STEPS",
        help="Auto-walk forward for STEPS moves using default start values.",
    )
    args = parser.parse_args()

    if args.demo is not None:
        demo_walk(max(args.demo, 0))
    else:
        main()
