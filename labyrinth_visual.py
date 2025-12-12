# labyrinth_visual.py
# Pygame front-view for the Prime Labyrinth

import sys
import pygame

import labyrinth_engine as le
import labyrinth_search as ls

# ---------- GLOBAL STATE ----------

# per-room state: (p, h) -> {"doors": [...], "opened": [...], "nxt": int|None}
room_state: dict[tuple[int, tuple[int, int, int]], dict] = {}

# stack for reverse
path_stack: list[dict] = []

# ---------- CORE LABYRINTH HELPERS ----------

def reset_state():
    room_state.clear()
    path_stack.clear()


def get_or_create_room(p: int, h: tuple[int, int, int]):
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


def closed_indices_for(state: dict) -> list[int]:
    opened = state["opened"]
    return [i + 1 for i, flag in enumerate(opened) if not flag]


def reverse_step():
    if not path_stack:
        print("\n[Labyrinth] You are at the starting point; no reverse possible.\n")
        return None
    last = path_stack.pop()
    return last["p"], last["h"]


def start_again():
    reset_state()
    print("\n[Labyrinth] Resetting to lobby at default room.\n")
    return ls.DEFAULT_START_P, ls.DEFAULT_START_H


# ---------- PYGAME DRAWING ----------

BG_COLOR = (5, 8, 16)
TEXT_COLOR = (220, 220, 230)
DOOR_CLOSED = (80, 140, 255)
DOOR_OPEN = (90, 150, 110)
DOOR_EDGE = (10, 10, 20)

def draw_room(screen, font, small_font, p: int, h: tuple[int, int, int], state: dict):
    width, height = screen.get_size()
    screen.fill(BG_COLOR)

    doors = state["doors"]
    opened = state["opened"]
    total = len(doors)
    open_count = sum(1 for f in opened if f)
    closed_count = total - open_count

    # header text
    title = f"Prime Labyrinth – P{p}  room {h}"
    text_surf = font.render(title, True, TEXT_COLOR)
    screen.blit(text_surf, (20, 20))

    stats = f"Doors: total {total}  open {open_count}  closed {closed_count}"
    stats_surf = small_font.render(stats, True, TEXT_COLOR)
    screen.blit(stats_surf, (20, 60))

    hint = "Press 1–9 to take a door, R=reverse, S=restart, Q / ESC=quit"
    hint_surf = small_font.render(hint, True, TEXT_COLOR)
    screen.blit(hint_surf, (20, height - 40))

    # door layout
    if total > 0:
        max_door_width = 140
        door_height = 220
        gap = 30

        door_width = min(
            max_door_width,
            (width - gap * (total + 1)) // max(total, 1)
        )

        total_row_width = door_width * total + gap * (total - 1)
        start_x = (width - total_row_width) // 2
        y = (height // 2) - door_height // 2

        for i, door_h in enumerate(doors, start=1):
            x = start_x + (i - 1) * (door_width + gap)
            rect = pygame.Rect(x, y, door_width, door_height)

            color = DOOR_OPEN if opened[i - 1] else DOOR_CLOSED
            pygame.draw.rect(screen, color, rect, border_radius=18)
            pygame.draw.rect(screen, DOOR_EDGE, rect, 3, border_radius=18)

            # door index below
            idx_surf = small_font.render(str(i), True, TEXT_COLOR)
            idx_rect = idx_surf.get_rect(center=(rect.centerx, rect.bottom + 16))
            screen.blit(idx_surf, idx_rect)

            # h-set label above
            label = str(door_h)
            h_surf = small_font.render(label, True, TEXT_COLOR)
            h_rect = h_surf.get_rect(center=(rect.centerx, rect.top - 16))
            screen.blit(h_surf, h_rect)


def print_room_console_summary(p, h, state):
    doors = state["doors"]
    opened = state["opened"]
    total = len(doors)
    open_count = sum(1 for f in opened if f)
    closed_count = total - open_count

    print("\n--- Room ---")
    print(f"P{p}  room {h}")
    print(f"Doors: {total} total, {open_count} open, {closed_count} closed")
    for i, d in enumerate(doors, start=1):
        mark = "*" if opened[i - 1] else " "
        print(f" {i}: {d} {mark}")
    print("-------------------")


# ---------- MAIN LOOP ----------

def main():
    pygame.init()
    screen = pygame.display.set_mode((0, 0))  # full screen
    pygame.display.set_caption("Prime Labyrinth – Visual Adventure")

    font = pygame.font.SysFont(None, 40)
    small_font = pygame.font.SysFont(None, 26)

    clock = pygame.time.Clock()

    # starting room
    reset_state()
    p = ls.DEFAULT_START_P
    h = ls.DEFAULT_START_H

    print("[Labyrinth] Visual adventure started.")
    print("[Labyrinth] Q / ESC to quit.")

    running = True
    while running:
        state = get_or_create_room(p, h)
        draw_room(screen, font, small_font, p, h, state)
        pygame.display.flip()

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False

            elif event.type == pygame.KEYDOWN:
                key = event.key

                if key in (pygame.K_ESCAPE, pygame.K_q):
                    running = False

                elif key == pygame.K_r:
                    result = reverse_step()
                    if result is not None:
                        p, h = result
                        print_room_console_summary(p, h, get_or_create_room(p, h))

                elif key == pygame.K_s:
                    p, h = start_again()
                    print_room_console_summary(p, h, get_or_create_room(p, h))

                elif pygame.K_1 <= key <= pygame.K_9:
                    idx = key - pygame.K_0  # numeric key to int

                    state = get_or_create_room(p, h)
                    closed_indices = closed_indices_for(state)

                    if idx not in closed_indices:
                        print(f"[Labyrinth] Door {idx} not available here.")
                        continue

                    nxt = state["nxt"]
                    if nxt is None:
                        print("[Labyrinth] No next prime from here; edge of Labyrinth.")
                        continue

                    doors = state["doors"]
                    opened = state["opened"]

                    opened[idx - 1] = True
                    path_stack.append({"p": p, "h": h})
                    target_h = doors[idx - 1]

                    print(
                        f"[Labyrinth] Taking door {idx}: "
                        f"P{p} {h} -> P{nxt} {target_h}"
                    )

                    p = nxt
                    h = target_h
                    print_room_console_summary(p, h, get_or_create_room(p, h))

        clock.tick(60)

    pygame.quit()
    sys.exit()


if __name__ == "__main__":
    main()
