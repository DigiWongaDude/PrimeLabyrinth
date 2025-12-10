# labyrinth_adventure_new_2.py
# Pygame visual adventure for the Prime Labyrinth

import sys
from collections import defaultdict

import pygame

import labyrinth_engine as le
import labyrinth_search as ls
import labyrinth_text as lt


DEBUG_LOG_TO_CONSOLE = False  # keep console quiet in Pyramide by default


def log(message: str) -> None:
    """Conditional logger so the visual game can stay silent by default."""
    if DEBUG_LOG_TO_CONSOLE:
        print(message)


# --------------- GLOBAL STATE ---------------

prime_levels: dict[int, int] = {}
next_level = 1

# Per-room state
# (p, h) -> {"doors": [...], "opened": [...], "nxt": int | None}
room_state: dict[tuple[int, tuple[int, int, int]], dict] = {}

# Path stack for reverse
# [{"p": int, "h": (a, b, c)}, ...]
path_stack: list[dict] = []

WALLS = ["front", "left", "back", "right"]
current_wall_index = 0  # 0 = front

MAX_BREADCRUMB_ROOMS = 5


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
    global room_state, path_stack, prime_levels, next_level, current_wall_index
    room_state.clear()
    path_stack.clear()
    prime_levels.clear()
    next_level = 1
    current_wall_index = 0


def current_wall() -> str:
    return WALLS[current_wall_index]


def rotate_wall_left():
    global current_wall_index
    current_wall_index = (current_wall_index + 1) % len(WALLS)


def rotate_wall_right():
    global current_wall_index
    current_wall_index = (current_wall_index - 1) % len(WALLS)


def flip_front_back():
    global current_wall_index
    wall = current_wall()
    if wall == "front":
        current_wall_index = WALLS.index("back")
    elif wall == "back":
        current_wall_index = WALLS.index("front")
    else:
        current_wall_index = WALLS.index("back")


def build_breadcrumb(current_h: tuple[int, int, int]) -> str:
    """Return a compact path string like '../223/335/355'."""
    # use global path_stack
    global path_stack

    # Collect all h-triplets along the path, including current
    hs = [entry["h"] for entry in path_stack] + [current_h]
    if not hs:
        return ""

    # Limit to last N
    visible = hs[-MAX_BREADCRUMB_ROOMS:]

    def fmt(h: tuple[int, int, int]) -> str:
        return "".join(str(d) for d in h)

    parts = [fmt(h) for h in visible]
    prefix = "../" if len(hs) > MAX_BREADCRUMB_ROOMS else ""
    return prefix + "/".join(parts)


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
        log("[Labyrinth] Already at the lobby. Cannot reverse.")
        return current_p, current_h

    last = path_stack.pop()
    p = last["p"]
    h = last["h"]
    log(f"[Labyrinth] Reversed to P{p} room {h}.")
    return p, h


def start_again():
    """Full reset and return starting (p, h)."""
    reset_state()
    log("[Labyrinth] Reset to start room.")
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
DOOR_W = 140
DOOR_H = 260
INNER_PAD = 10
KNOB_R = 10
NODE_OUTLINE = (10, 20, 40)
SIDE_BG = (8, 10, 20)
DELTA_EDGE = (60, 90, 140)
DELTA_NODE = (90, 190, 255)
DELTA_CURRENT = (255, 210, 80)


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

    door_width = min(DOOR_W, usable_width / max(n, 1) * 0.7)
    door_height = DOOR_H

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


def draw_single_door(
    screen: pygame.Surface,
    rect: pygame.Rect,
    p: int,
    h_triplet: tuple[int, int, int],
    opened: bool,
    fonts: dict,
):
    """
    Draw a single door using the playground-style visuals.
    """

    base_color = DOOR_OPEN_COLOR if opened else DOOR_CLOSED_COLOR

    pygame.draw.rect(screen, base_color, rect, border_radius=16)

    inner = pygame.Rect(
        rect.left + INNER_PAD,
        rect.top + INNER_PAD,
        rect.width - 2 * INNER_PAD,
        rect.height - 2 * INNER_PAD,
    )
    pygame.draw.rect(screen, TEXT_COLOR, inner, 2, border_radius=10)

    p_surf = fonts["door_label"].render(f"P{p}", True, TEXT_COLOR)
    p_x = inner.centerx - p_surf.get_width() // 2
    p_y = inner.top + 12
    screen.blit(p_surf, (p_x, p_y))

    knob_x = inner.centerx + inner.width // 4
    knob_y = inner.centery + 10
    pygame.draw.circle(screen, TEXT_COLOR, (knob_x, knob_y), KNOB_R, 2)

    a, b, c = h_triplet
    abc_str = f"{a:03d}  {b:03d}  {c:03d}"
    abc_surf = fonts["small"].render(abc_str, True, TEXT_COLOR)
    abc_x = inner.centerx - abc_surf.get_width() // 2
    abc_y = inner.bottom - 28
    screen.blit(abc_surf, (abc_x, abc_y))


def draw_front_wall(screen, fonts, p, h, state, viewport_rect):
    doors = state["doors"]
    opened = state["opened"]
    door_layout = layout_doors(doors, viewport_rect)

    click_map: list[tuple[int, pygame.Rect]] = []

    for idx, ((a, b, c), (rect, _cx, _ty)) in enumerate(zip(doors, door_layout), start=1):
        draw_single_door(
            screen=screen,
            rect=rect,
            p=p,
            h_triplet=(a, b, c),
            opened=opened[idx - 1],
            fonts=fonts,
        )

        label = fonts["door_label"].render(str(idx), True, TEXT_COLOR)
        label_rect = label.get_rect()
        label_rect.midbottom = (rect.centerx, rect.bottom - 8)
        screen.blit(label, label_rect)

        click_map.append((idx, rect))

    return click_map


def draw_back_wall(screen, fonts, p, h, state, viewport_rect):
    if path_stack:
        prev = path_stack[-1]
        prev_p = prev["p"]
        prev_h = prev["h"]
    else:
        prev_p = p
        prev_h = h

    door_layout = layout_doors([prev_h], viewport_rect)
    rect, _cx, _ty = door_layout[0]

    opened = bool(path_stack)
    draw_single_door(
        screen=screen,
        rect=rect,
        p=prev_p,
        h_triplet=prev_h,
        opened=opened,
        fonts=fonts,
    )

    label = fonts["door_label"].render("Entrance", True, TEXT_COLOR)
    label_rect = label.get_rect()
    label_rect.midbottom = (rect.centerx, rect.bottom - 8)
    screen.blit(label, label_rect)

    return [(0, rect)]


def draw_side_wall_left(
    screen: pygame.Surface,
    fonts: dict,
    p: int,
    h: tuple[int, int, int],
    rect: pygame.Rect,
) -> list[tuple[int, pygame.Rect]]:
    """
    Left wall: mini 2D delta of the *path we have walked in this run*.
    Uses path_stack + current (p, h). No clicks, just a visual.
    """
    # Background + frame
    pygame.draw.rect(screen, SIDE_BG, rect)
    pygame.draw.rect(screen, TEXT_DIM, rect, 1)

    # Build visit sequence: all rooms on the stack, then current
    visits: list[tuple[int, tuple[int, int, int]]] = [
        (entry["p"], entry["h"]) for entry in path_stack
    ] + [(p, h)]

    if not visits:
        label = fonts["small"].render("no path yet", True, TEXT_DIM)
        screen.blit(label, (rect.left + 12, rect.top + 12))
        return []

    # Map primes (levels) to vertical layers
    primes = sorted({vp for (vp, _hh) in visits})
    layer_for_prime = {vp: i for i, vp in enumerate(primes)}

    # Layout inside the wall rect
    margin_x = 24
    margin_y = 28
    max_layers = max(1, len(primes))
    layer_gap = max(
        24,
        (rect.height - 2 * margin_y) // max_layers,
    )
    col_gap = 18

    counts_per_layer: dict[int, int] = defaultdict(int)
    positions: list[tuple[int, tuple[int, int, int], float, float]] = []

    for vp, vh in visits:
        layer = layer_for_prime[vp]
        col = counts_per_layer[layer]
        counts_per_layer[layer] += 1

        x = rect.left + margin_x + col * col_gap
        # Higher primes nearer the top; layer 0 is the top prime
        y = rect.bottom - margin_y - layer * layer_gap

        positions.append((vp, vh, x, y))

    # Draw edges between consecutive visits
    for i in range(1, len(positions)):
        _p1, _h1, x1, y1 = positions[i - 1]
        _p2, _h2, x2, y2 = positions[i]
        pygame.draw.line(
            screen,
            DELTA_EDGE,
            (int(x1), int(y1)),
            (int(x2), int(y2)),
            1,
        )

    # Draw nodes, highlighting current room
    for vp, vh, x, y in positions:
        if vp == p and vh == h:
            color = DELTA_CURRENT
            radius = 4
        else:
            color = DELTA_NODE
            radius = 3

        pygame.draw.circle(screen, color, (int(x), int(y)), radius)
        pygame.draw.circle(screen, NODE_OUTLINE, (int(x), int(y)), radius, 1)

    # Label
    label = fonts["small"].render("path map (this run)", True, TEXT_DIM)
    screen.blit(label, (rect.left + 12, rect.top + 8))

    # No clickable regions on this wall (for now)
    return []


def draw_side_wall_right(
    screen: pygame.Surface,
    fonts: dict,
    rect: pygame.Rect,
) -> list[tuple[int, pygame.Rect]]:
    """Right wall: reserved for stats / vibes later."""
    pygame.draw.rect(screen, SIDE_BG, rect)
    pygame.draw.rect(screen, TEXT_DIM, rect, 1)

    label = fonts["small"].render("right wall – vibes coming soon", True, TEXT_DIM)
    screen.blit(label, (rect.left + 12, rect.top + 12))

    return []


def draw_room(
    screen,
    fonts,
    p: int,
    h: tuple[int, int, int],
    state: dict,
) -> list[tuple[int, pygame.Rect]]:
    """Draw the entire room and return click map for the active wall."""
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

    # Breadcrumb path (ball of string)
    breadcrumb = build_breadcrumb(h)
    y_after_summary = top_margin + 60 + len(summary_lines) * 18
    if breadcrumb:
        bc_surf = fonts["small"].render(f"path: {breadcrumb}", True, TEXT_DIM)
        screen.blit(bc_surf, (x_margin, y_after_summary + 8))
        breadcrumbs_bottom = y_after_summary + 8 + bc_surf.get_height()
    else:
        breadcrumbs_bottom = y_after_summary

    # Doors viewport: leave enough space at bottom for legend
    legend_height = 40
    # Ensure doors start below summary + breadcrumbs
    min_doors_top = top_margin + 110
    doors_top = max(breadcrumbs_bottom + 20, min_doors_top)
    doors_bottom = height - legend_height - 10
    viewport_rect = pygame.Rect(0, doors_top, width, max(doors_bottom - doors_top, 80))

    wall = current_wall()
    if wall == "front":
        click_map = draw_front_wall(screen, fonts, p, h, state, viewport_rect)
    elif wall == "back":
        click_map = draw_back_wall(screen, fonts, p, h, state, viewport_rect)
    elif wall == "left":
        click_map = draw_side_wall_left(screen, fonts, p, h, viewport_rect)
    else:
        click_map = draw_side_wall_right(screen, fonts, viewport_rect)

    legend_text = "Press 1-9 or tap a door. LEFT/RIGHT rotate, R flip view, S=restart, Q / ESC=quit."
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

    log("pygame " + pygame.version.ver + " running.")
    log("Hello from the pygame community. https://www.pygame.org/contribute.html")
    log("[Labyrinth] Visual adventure started.")
    log("[Labyrinth] Q / ESC to quit.\n")

    while running:
        clock.tick(30)

        state = get_or_create_room(p, h)
        click_map = draw_room(screen, fonts, p, h, state)

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False

            elif event.type == pygame.KEYDOWN:
                if event.key in (pygame.K_q, pygame.K_ESCAPE):
                    running = False

                elif event.key in (pygame.K_LEFT, pygame.K_a):
                    rotate_wall_left()

                elif event.key in (pygame.K_RIGHT, pygame.K_d):
                    rotate_wall_right()

                elif event.key == pygame.K_r:
                    flip_front_back()

                elif event.key == pygame.K_s:
                    p, h = start_again()

                elif pygame.K_1 <= event.key <= pygame.K_9:
                    if current_wall() == "front":
                        idx = event.key - pygame.K_0
                        p, h = take_door(p, h, idx, state)

            elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                idx = handle_click(event.pos, click_map)
                if idx is not None:
                    wall = current_wall()
                    if wall == "front":
                        p, h = take_door(p, h, idx, state)
                    elif wall == "back" and idx == 0:
                        p, h = reverse_step(p, h)

    pygame.quit()
    log("\n[Labyrinth] Visual adventure ended. Goodbye.")


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
        log(f"[Labyrinth] Door {idx} is not available in this room.")
        return p, h

    if opened[idx - 1]:
        log(f"[Labyrinth] Door {idx} is already open.")
        return p, h

    if nxt is None:
        log("[Labyrinth] There is no next prime from here. Edge of the Labyrinth.")
        return p, h

    opened[idx - 1] = True
    path_stack.append({"p": p, "h": h})

    target_h = doors[idx - 1]
    log(f"[Labyrinth] Taking door {idx} -> P{nxt} room {target_h}.")

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
