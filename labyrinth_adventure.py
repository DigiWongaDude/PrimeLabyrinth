# labyrinth_adventure_new_2.py
# Pygame visual adventure for the Prime Labyrinth

import sys

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
# (p, h) -> {"doors": [...], "opened": [None | int | dict], "nxt": int | None}
room_state: dict[tuple[int, tuple[int, int, int]], dict] = {}

# Path stack for reverse
# [{"visit_id": int, "p": int, "h": (a, b, c)}, ...]
path_stack: list[dict] = []

# Visit log (each visit is unique)
visit_log: dict[int, dict] = {}
visit_order: list[int] = []
current_visit_id: int | None = None
next_visit_id = 1

WALLS = ["front", "left", "back", "right"]
current_wall_index = 0  # 0 = front

# Left wall camera + gesture state (persists between rotations)
LEFT_WALL_VIEW = {
    "zoom": 1.0,
    "offset_x": 0.0,
    "offset_y": 0.0,
    "fingers": {},  # finger_id -> (x, y) in screen coords
    "last_pinch_dist": None,
    "last_midpoint": None,
}

# Last known viewport for the left wall (to limit touch handling)
left_wall_viewport_rect: pygame.Rect | None = None

LEFT_WALL_MIN_ZOOM = 0.3
LEFT_WALL_MAX_ZOOM = 4.0

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
    global room_state, path_stack, prime_levels, next_level, current_wall_index, LEFT_WALL_VIEW
    global visit_log, visit_order, next_visit_id, current_visit_id
    room_state.clear()
    path_stack.clear()
    visit_log.clear()
    visit_order.clear()
    next_visit_id = 1
    current_visit_id = None
    prime_levels.clear()
    next_level = 1
    current_wall_index = 0
    LEFT_WALL_VIEW.update(
        {
            "zoom": 1.0,
            "offset_x": 0.0,
            "offset_y": 0.0,
            "fingers": {},
            "last_pinch_dist": None,
            "last_midpoint": None,
        }
    )


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
      { "doors": [...], "opened": [None | int | dict], "nxt": int | None }
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
        "opened": [None] * len(doors),
        "nxt": nxt,
    }
    room_state[key] = state
    return state


def reverse_step(current_p: int, current_h: tuple[int, int, int]):
    """Go back one step along the path stack if possible."""
    global current_visit_id
    if not path_stack:
        log("[Labyrinth] Already at the lobby. Cannot reverse.")
        return current_p, current_h

    last = path_stack.pop()
    p = last["p"]
    h = last["h"]
    current_visit_id = last.get("visit_id", current_visit_id)
    log(f"[Labyrinth] Reversed to P{p} room {h}.")
    return p, h


def start_again():
    """Full reset and return starting (p, h)."""
    reset_state()
    log("[Labyrinth] Reset to start room.")
    # Reuse the search defaults, like the ASCII adventure
    return ls.DEFAULT_START_P, ls.DEFAULT_START_H


# --------------- VISIT HELPERS ---------------


def register_visit(p: int, h: tuple[int, int, int], parent: int | None = None) -> int:
    """Create a new visit entry and make it current."""
    global next_visit_id, current_visit_id

    visit_id = next_visit_id
    next_visit_id += 1

    visit_log[visit_id] = {
        "id": visit_id,
        "p": p,
        "h": h,
        "parent": parent,
    }
    visit_order.append(visit_id)
    current_visit_id = visit_id
    return visit_id


def current_path_visit_ids() -> list[int]:
    """Return visit ids along the active path stack plus the current room."""

    ids = [entry.get("visit_id") for entry in path_stack if entry.get("visit_id") is not None]
    if current_visit_id is not None:
        ids.append(current_visit_id)
    return ids


# --------------- PYGAME VISUALS ---------------

WINDOW_WIDTH = 1280
WINDOW_HEIGHT = 720

BACKGROUND_COLOR = (5, 8, 16)
PANEL_COLOR = (24, 32, 64)
TEXT_COLOR = (230, 235, 245)
TEXT_DIM = (170, 175, 185)
DOOR_CLOSED_COLOR = (90, 140, 255)
DOOR_OPEN_COLOR = (90, 150, 110)
DOOR_W = 140
DOOR_H = 260
INNER_PAD = 10
KNOB_R = 10
NODE_OUTLINE = (10, 20, 40)
SIDE_BG = (8, 10, 20)
DELTA_EDGE = (60, 90, 140)
DELTA_NODE = (90, 190, 255)
DELTA_CURRENT = (255, 210, 80)


def clamp_zoom(z: float) -> float:
    return max(LEFT_WALL_MIN_ZOOM, min(LEFT_WALL_MAX_ZOOM, z))


def set_left_wall_viewport(rect: pygame.Rect | None) -> None:
    global left_wall_viewport_rect
    left_wall_viewport_rect = rect.copy() if rect is not None else None


def transform_left_wall_point(point: tuple[float, float], rect: pygame.Rect):
    """Apply left-wall zoom + pan to a local point inside rect."""

    cx, cy = rect.center
    x, y = point
    zoom = LEFT_WALL_VIEW["zoom"]
    ox = LEFT_WALL_VIEW["offset_x"]
    oy = LEFT_WALL_VIEW["offset_y"]

    sx = (x - cx) * zoom + cx + ox
    sy = (y - cy) * zoom + cy + oy
    return int(sx), int(sy)


def screen_to_world(point: tuple[float, float], rect: pygame.Rect):
    """Reverse the left-wall transform for a screen-space point."""

    cx, cy = rect.center
    zoom = LEFT_WALL_VIEW["zoom"]
    ox = LEFT_WALL_VIEW["offset_x"]
    oy = LEFT_WALL_VIEW["offset_y"]
    sx, sy = point

    wx = (sx - ox - cx) / zoom + cx
    wy = (sy - oy - cy) / zoom + cy
    return wx, wy


def apply_zoom_with_focus(focus: tuple[float, float], zoom_factor: float, rect: pygame.Rect):
    """Zoom toward focus point while keeping it anchored on screen."""

    old_zoom = LEFT_WALL_VIEW["zoom"]
    new_zoom = clamp_zoom(old_zoom * zoom_factor)
    if new_zoom == old_zoom:
        return

    world_focus = screen_to_world(focus, rect)
    cx, cy = rect.center

    LEFT_WALL_VIEW["zoom"] = new_zoom
    fx, fy = focus
    wx, wy = world_focus
    LEFT_WALL_VIEW["offset_x"] = fx - (wx - cx) * new_zoom - cx
    LEFT_WALL_VIEW["offset_y"] = fy - (wy - cy) * new_zoom - cy


def finger_distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    ax, ay = a
    bx, by = b
    return ((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5


def handle_left_wall_touch(event, screen_size: tuple[int, int]) -> None:
    """Handle FINGER* events for the left wall viewport only."""

    if current_wall() != "left":
        return

    rect = left_wall_viewport_rect
    if rect is None:
        return

    width, height = screen_size
    x = event.x * width
    y = event.y * height

    fingers = LEFT_WALL_VIEW["fingers"]

    if event.type == pygame.FINGERDOWN:
        if not rect.collidepoint(x, y):
            return

        fingers[event.finger_id] = (x, y)
        if len(fingers) == 1:
            LEFT_WALL_VIEW["last_midpoint"] = (x, y)
            LEFT_WALL_VIEW["last_pinch_dist"] = None
        elif len(fingers) >= 2:
            pts = list(fingers.values())[:2]
            LEFT_WALL_VIEW["last_pinch_dist"] = finger_distance(pts[0], pts[1])
            LEFT_WALL_VIEW["last_midpoint"] = (
                (pts[0][0] + pts[1][0]) / 2,
                (pts[0][1] + pts[1][1]) / 2,
            )

    elif event.type == pygame.FINGERUP:
        fingers.pop(event.finger_id, None)
        if len(fingers) == 1:
            (only_pos,) = fingers.values()
            LEFT_WALL_VIEW["last_midpoint"] = only_pos
            LEFT_WALL_VIEW["last_pinch_dist"] = None
        elif not fingers:
            LEFT_WALL_VIEW["last_midpoint"] = None
            LEFT_WALL_VIEW["last_pinch_dist"] = None

    elif event.type == pygame.FINGERMOTION:
        if event.finger_id not in fingers:
            return

        fingers[event.finger_id] = (x, y)

        if len(fingers) == 1:
            midpoint = list(fingers.values())[0]
            last_mid = LEFT_WALL_VIEW.get("last_midpoint")
            if last_mid is not None:
                dx = midpoint[0] - last_mid[0]
                dy = midpoint[1] - last_mid[1]
                LEFT_WALL_VIEW["offset_x"] += dx / LEFT_WALL_VIEW["zoom"]
                LEFT_WALL_VIEW["offset_y"] += dy / LEFT_WALL_VIEW["zoom"]
            LEFT_WALL_VIEW["last_midpoint"] = midpoint

        elif len(fingers) >= 2:
            pts = list(fingers.values())[:2]
            midpoint = ((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2)
            last_mid = LEFT_WALL_VIEW.get("last_midpoint")
            if last_mid is not None:
                dx = midpoint[0] - last_mid[0]
                dy = midpoint[1] - last_mid[1]
                LEFT_WALL_VIEW["offset_x"] += dx / LEFT_WALL_VIEW["zoom"]
                LEFT_WALL_VIEW["offset_y"] += dy / LEFT_WALL_VIEW["zoom"]

            dist = finger_distance(pts[0], pts[1])
            last_dist = LEFT_WALL_VIEW.get("last_pinch_dist")
            if last_dist and last_dist > 0:
                zoom_factor = dist / last_dist
                apply_zoom_with_focus(midpoint, zoom_factor, rect)

            LEFT_WALL_VIEW["last_midpoint"] = midpoint
            LEFT_WALL_VIEW["last_pinch_dist"] = dist


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
    door_prime: int,
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

    p_surf = fonts["door_label"].render(f"P{door_prime}", True, TEXT_COLOR)
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


# --------------- ROOM MUSIC / STRUDEL HOOKS ---------------

def room_music_id(p: int, h: tuple[int, int, int]) -> str:
    a, b, c = h
    total = (p + a + b + c) % 4
    if total == 0:
        return "lab.low.bass"
    if total == 1:
        return "glass.drone"
    if total == 2:
        return "steps.plucked"
    return "restless.perc"


STRUDDEL_PATTERNS: dict[str, str] = {
    "lab.low.bass": 's("bd ~ bd bd").bpm(80)',
    "glass.drone": 'n("0 3 7 10").slow(4)',
    "steps.plucked": 'n("c4 e4 g4 a4").fast(2)',
    "restless.perc": 's("bd [hh*2] cp [hh*3]").bpm(110)',
}


def room_strudel_pattern(p: int, h: tuple[int, int, int]) -> tuple[str, str]:
    """Return (music_id, strudel_pattern) for this room."""
    music_id = room_music_id(p, h)
    pattern = STRUDDEL_PATTERNS.get(
        music_id,
        "// (no pattern defined for this room yet)",
    )
    return music_id, pattern


def draw_front_wall(screen, fonts, p, h, state, viewport_rect):
    doors = state["doors"]
    opened = state["opened"]
    door_layout = layout_doors(doors, viewport_rect)

    click_map: list[tuple[int, pygame.Rect]] = []

    door_p = state["nxt"] if state["nxt"] is not None else p

    for idx, ((a, b, c), (rect, _cx, _ty)) in enumerate(zip(doors, door_layout), start=1):
        door_open = bool(opened[idx - 1])
        draw_single_door(
            screen=screen,
            rect=rect,
            door_prime=door_p,
            h_triplet=(a, b, c),
            opened=door_open,
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
        door_prime=prev_p,
        h_triplet=prev_h,
        opened=opened,
        fonts=fonts,
    )

    label = fonts["door_label"].render("Entrance", True, TEXT_COLOR)
    label_rect = label.get_rect()
    label_rect.midbottom = (rect.centerx, rect.bottom - 8)
    screen.blit(label, label_rect)

    return [(0, rect)]


def draw_nav_button(screen, rect: pygame.Rect, label: str, fonts: dict):
    pygame.draw.rect(screen, PANEL_COLOR, rect, border_radius=10)
    pygame.draw.rect(screen, NODE_OUTLINE, rect, 2, border_radius=10)

    text_surf = fonts["sub"].render(label, True, TEXT_COLOR)
    text_rect = text_surf.get_rect(center=rect.center)
    screen.blit(text_surf, text_rect)


def draw_nav_buttons(screen, fonts, wall: str):
    width, height = screen.get_size()
    btn_w = 120
    btn_h = 44
    margin = 18
    y = height - btn_h - 70

    buttons: dict[str, pygame.Rect] = {}

    left_rect = pygame.Rect(margin, y, btn_w, btn_h)
    draw_nav_button(screen, left_rect, "Left", fonts)
    buttons["left"] = left_rect

    right_rect = pygame.Rect(width - margin - btn_w, y, btn_w, btn_h)
    draw_nav_button(screen, right_rect, "Right", fonts)
    buttons["right"] = right_rect

    if wall == "front":
        reverse_rect = pygame.Rect((width - btn_w) // 2, y, btn_w, btn_h)
        draw_nav_button(screen, reverse_rect, "Reverse", fonts)
        buttons["reverse"] = reverse_rect

    return buttons


def draw_side_wall_left(
    screen: pygame.Surface,
    fonts: dict,
    p: int,
    h: tuple[int, int, int],
    rect: pygame.Rect,
) -> list[tuple[int, pygame.Rect]]:
    """
    Left wall: visit graph using unique visits (no merging by room).
    """
    from collections import defaultdict

    # Background + frame
    pygame.draw.rect(screen, SIDE_BG, rect)
    pygame.draw.rect(screen, TEXT_DIM, rect, 1)

    if not visit_order:
        label = fonts["small"].render("no visits yet", True, TEXT_DIM)
        screen.blit(label, (rect.left + 12, rect.top + 12))
        return []

    margin_y = 32
    lane_gap = 70
    min_gap = 28
    centre_x = rect.centerx
    base_y = rect.bottom - margin_y

    # Depth calculation (parent distance from root)
    depth_cache: dict[int, int] = {}

    def depth_of(visit_id: int) -> int:
        if visit_id in depth_cache:
            return depth_cache[visit_id]
        entry = visit_log.get(visit_id)
        if not entry:
            depth_cache[visit_id] = 0
            return 0
        parent = entry.get("parent")
        if parent is None or parent not in visit_log:
            depth_cache[visit_id] = 0
            return 0
        depth_cache[visit_id] = depth_of(parent) + 1
        return depth_cache[visit_id]

    max_depth = max(depth_of(vid) for vid in visit_order)
    level_gap = max(36.0, (rect.height - 2 * margin_y) / max(max_depth, 1))

    path_ids = current_path_visit_ids()
    path_set = set(path_ids)

    # Assign lanes relative to first divergence from the spine
    lane_lookup: dict[int, tuple[int, int]] = {}
    branch_order: dict[int | None, list[int]] = defaultdict(list)

    def lane_for(visit_id: int) -> tuple[int, int]:
        if visit_id in lane_lookup:
            return lane_lookup[visit_id]
        if visit_id in path_set:
            lane_lookup[visit_id] = (0, 0)
            return 0, 0
        diverge = visit_id
        parent = visit_log.get(diverge, {}).get("parent")
        while parent is not None and parent not in path_set:
            diverge = parent
            parent = visit_log.get(parent, {}).get("parent")
        anchor = parent
        sequence = branch_order.setdefault(anchor, [])
        if diverge not in sequence:
            sequence.append(diverge)
        idx = sequence.index(diverge)
        direction = -1 if idx % 2 == 0 else 1
        lane = idx // 2 + 1
        lane_lookup[visit_id] = (direction, lane)
        return direction, lane

    # Compute positions (local coords)
    positions: dict[int, tuple[float, float]] = {}
    nodes_by_depth: defaultdict[int, list[int]] = defaultdict(list)

    for vid in visit_order:
        entry = visit_log.get(vid)
        if not entry:
            continue
        depth = depth_of(vid)
        y = base_y - depth * level_gap
        if vid in path_set:
            x = centre_x
        else:
            direction, lane = lane_for(vid)
            x = centre_x + direction * lane * lane_gap
        positions[vid] = (x, y)
        nodes_by_depth[depth].append(vid)

    # Collision spreading per depth (center-out)
    for depth, vids in nodes_by_depth.items():
        left = sorted([vid for vid in vids if positions[vid][0] < centre_x], key=lambda v: positions[v][0], reverse=True)
        prev_x = centre_x
        for vid in left:
            x, y = positions[vid]
            if prev_x - x < min_gap:
                x = prev_x - min_gap
            positions[vid] = (x, y)
            prev_x = x

        right = sorted([vid for vid in vids if positions[vid][0] > centre_x], key=lambda v: positions[v][0])
        prev_x = centre_x
        for vid in right:
            x, y = positions[vid]
            if x - prev_x < min_gap:
                x = prev_x + min_gap
            positions[vid] = (x, y)
            prev_x = x

    # Draw edges first
    for vid, entry in visit_log.items():
        parent_id = entry.get("parent")
        if parent_id is None or parent_id not in positions or vid not in positions:
            continue
        x1, y1 = transform_left_wall_point(positions[parent_id], rect)
        x2, y2 = transform_left_wall_point(positions[vid], rect)
        on_path = vid in path_set and parent_id in path_set
        color = DELTA_CURRENT if on_path else DOOR_OPEN_COLOR
        width = 3 if on_path else 2
        pygame.draw.line(screen, color, (x1, y1), (x2, y2), width)

    # Draw nodes, highlighting current room
    for vid, (x, y) in positions.items():
        entry = visit_log.get(vid)
        if not entry:
            continue
        on_path = vid in path_set
        if vid == current_visit_id:
            color = DELTA_CURRENT
            radius = 5
        elif on_path:
            color = DELTA_CURRENT
            radius = 4
        else:
            color = DELTA_NODE
            radius = 3

        tx, ty = transform_left_wall_point((x, y), rect)
        pygame.draw.circle(screen, color, (tx, ty), radius)
        pygame.draw.circle(screen, NODE_OUTLINE, (tx, ty), radius, 1)

        label_text = f"P{entry['p']} {entry['h']}"
        label_surf = fonts["small"].render(label_text, True, TEXT_COLOR)
        label_rect = label_surf.get_rect()
        if x < centre_x:
            label_rect.midright = (tx - 8, ty)
        else:
            label_rect.midleft = (tx + 8, ty)
        screen.blit(label_surf, label_rect)

    legend = fonts["small"].render("Green = visited door, Yellow = current path", True, TEXT_DIM)
    screen.blit(legend, (rect.left + 12, rect.top + 8))

    # No clickable regions on this wall (for now)
    return []


def draw_side_wall_right(
    screen: pygame.Surface,
    fonts: dict,
    rect: pygame.Rect,
    p: int,
    h: tuple[int, int, int],
) -> list[tuple[int, pygame.Rect]]:
    """Right wall: room soundtrack info / Strudel pattern hint."""
    pygame.draw.rect(screen, SIDE_BG, rect)
    pygame.draw.rect(screen, TEXT_DIM, rect, 1)

    music_id, pattern = room_strudel_pattern(p, h)

    x = rect.left + 12
    y = rect.top + 12

    header = fonts["small"].render("room soundtrack", True, TEXT_DIM)
    screen.blit(header, (x, y))
    y += header.get_height() + 8

    mood_text = f"mood: {music_id}"
    mood_surf = fonts["small"].render(mood_text, True, TEXT_COLOR)
    screen.blit(mood_surf, (x, y))
    y += mood_surf.get_height() + 12

    label = fonts["small"].render("Strudel:", True, TEXT_DIM)
    screen.blit(label, (x, y))
    y += label.get_height() + 4

    # Simple text wrapping for the Strudel pattern
    max_width = rect.width - 24
    words = pattern.split(" ")
    lines: list[str] = []
    current = ""

    for word in words:
        test = (current + " " + word).strip()
        test_surf = fonts["small"].render(test, True, TEXT_COLOR)
        if test_surf.get_width() > max_width and current:
            lines.append(current)
            current = word
        else:
            current = test
    if current:
        lines.append(current)

    for line in lines:
        line_surf = fonts["small"].render(line, True, TEXT_COLOR)
        screen.blit(line_surf, (x, y))
        y += line_surf.get_height() + 2

    return []


def draw_room(
    screen,
    fonts,
    p: int,
    h: tuple[int, int, int],
    state: dict,
) -> tuple[list[tuple[int, pygame.Rect]], dict[str, pygame.Rect]]:
    """Draw the entire room and return click map and nav button rects."""
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
        set_left_wall_viewport(None)
        click_map = draw_front_wall(screen, fonts, p, h, state, viewport_rect)
    elif wall == "back":
        set_left_wall_viewport(None)
        click_map = draw_back_wall(screen, fonts, p, h, state, viewport_rect)
    elif wall == "left":
        set_left_wall_viewport(viewport_rect)
        click_map = draw_side_wall_left(screen, fonts, p, h, viewport_rect)
    else:
        set_left_wall_viewport(None)
        click_map = draw_side_wall_right(screen, fonts, viewport_rect, p, h)

    legend_text = "Press 1-9 or tap a door. LEFT/RIGHT rotate, R flip view, S=restart, Q / ESC=quit."
    legend_surf = fonts["small"].render(legend_text, True, TEXT_DIM)
    legend_rect = legend_surf.get_rect()
    legend_rect.centerx = width // 2
    legend_rect.bottom = height - 10
    screen.blit(legend_surf, legend_rect)

    nav_buttons = draw_nav_buttons(screen, fonts, wall)

    pygame.display.flip()
    return click_map, nav_buttons


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
    register_visit(p, h)

    running = True
    click_map: list[tuple[int, pygame.Rect]] = []
    nav_buttons: dict[str, pygame.Rect] = {}

    log("pygame " + pygame.version.ver + " running.")
    log("Hello from the pygame community. https://www.pygame.org/contribute.html")
    log("[Labyrinth] Visual adventure started.")
    log("[Labyrinth] Q / ESC to quit.\n")

    while running:
        clock.tick(30)

        state = get_or_create_room(p, h)
        click_map, nav_buttons = draw_room(screen, fonts, p, h, state)

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
                    register_visit(p, h)

                elif pygame.K_1 <= event.key <= pygame.K_9:
                    if current_wall() == "front":
                        idx = event.key - pygame.K_0
                        p, h = take_door(p, h, idx, state)

            elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                left_hit = nav_buttons.get("left") and nav_buttons["left"].collidepoint(event.pos)
                right_hit = nav_buttons.get("right") and nav_buttons["right"].collidepoint(event.pos)
                reverse_hit = (
                    current_wall() == "front"
                    and nav_buttons.get("reverse")
                    and nav_buttons["reverse"].collidepoint(event.pos)
                )

                if left_hit:
                    rotate_wall_left()
                elif right_hit:
                    rotate_wall_right()
                elif reverse_hit:
                    p, h = reverse_step(p, h)
                else:
                    idx = handle_click(event.pos, click_map)
                    if idx is not None:
                        wall = current_wall()
                        if wall == "front":
                            p, h = take_door(p, h, idx, state)
                        elif wall == "back" and idx == 0:
                            p, h = reverse_step(p, h)

            elif event.type in (
                pygame.FINGERDOWN,
                pygame.FINGERMOTION,
                pygame.FINGERUP,
            ):
                handle_left_wall_touch(event, screen.get_size())

    pygame.quit()
    log("\n[Labyrinth] Visual adventure ended. Goodbye.")


def take_door(
    p: int,
    h: tuple[int, int, int],
    idx: int,
    state: dict,
):
    """Take door idx in current state if possible, and return new (p, h)."""
    global current_visit_id
    doors = state["doors"]
    opened = state["opened"]
    nxt = state["nxt"]

    if idx < 1 or idx > len(doors):
        log(f"[Labyrinth] Door {idx} is not available in this room.")
        return p, h

    target_h = doors[idx - 1]
    opened_link = opened[idx - 1]
    if isinstance(opened_link, bool):
        opened_link = None
    parent_frame = {"visit_id": current_visit_id, "p": p, "h": h}

    if opened_link is not None:
        child_entry = visit_log.get(opened_link)
        if child_entry:
            path_stack.append(parent_frame)
            current_visit_id = opened_link
            log(f"[Labyrinth] Returning to door {idx} -> visit {opened_link}.")
            return child_entry["p"], child_entry["h"]
        else:
            log(
                f"[Labyrinth] Door {idx} had a missing visit link; creating a new visit instead."
            )
            opened[idx - 1] = None

    if nxt is None:
        log("[Labyrinth] There is no next prime from here. Edge of the Labyrinth.")
        return p, h

    path_stack.append(parent_frame)

    log(f"[Labyrinth] Taking door {idx} -> P{nxt} room {target_h}.")
    child_visit_id = register_visit(nxt, target_h, parent=current_visit_id)
    opened[idx - 1] = child_visit_id

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

