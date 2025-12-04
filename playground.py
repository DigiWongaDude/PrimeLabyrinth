import pygame, sys
pygame.init()

# ---------------------------------------------------
# WINDOW
# ---------------------------------------------------
screen = pygame.display.set_mode((1280, 720))
WIDTH, HEIGHT = screen.get_size()
clock = pygame.time.Clock()

CYAN = (0, 220, 255)
BLACK = (0, 0, 0)

# ---------------------------------------------------
# DOOR VISUAL CONSTANTS
# ---------------------------------------------------
DOOR_W = 140
DOOR_H = 260
INNER_PAD = 10

P_FONT = pygame.font.SysFont("arial", 52)
ABC_FONT = pygame.font.SysFont("arial", 18)

KNOB_R = 10

# ---------------------------------------------------
# CAROUSEL STATE
# ---------------------------------------------------
door_count = 1
door_offset = 0.0
target_offset = 0.0
OFFSET_STEP = 180      # how far a tap moves the carousel
CENTER_MARGIN = 50     # width of recenter tap zone

# ---------------------------------------------------
# DRAW A SINGLE DOOR
# ---------------------------------------------------
def draw_door(rect, p_value=71, abc=(123,456,789)):
    pygame.draw.rect(screen, CYAN, rect, 2)

    inner = pygame.Rect(
        rect.left + INNER_PAD,
        rect.top + INNER_PAD,
        rect.width - 2*INNER_PAD,
        rect.height - 2*INNER_PAD
    )
    pygame.draw.rect(screen, CYAN, inner, 2)

    # PRIME P
    p_surf = P_FONT.render(str(p_value), True, CYAN)
    p_x = inner.centerx - p_surf.get_width()//2
    p_y = inner.top + 12
    screen.blit(p_surf, (p_x, p_y))

    # DOOR KNOB
    knob_x = inner.centerx + 30
    knob_y = inner.centery + 10
    pygame.draw.circle(screen, CYAN, (knob_x, knob_y), KNOB_R, 2)

    # ABC KEYS (smaller, single horizontal line)
    a,b,c = abc
    abc_str = f"{a:03d}  {b:03d}  {c:03d}"
    abc_surf = ABC_FONT.render(abc_str, True, CYAN)
    abc_x = inner.centerx - abc_surf.get_width()//2
    abc_y = inner.bottom - 28
    screen.blit(abc_surf, (abc_x, abc_y))

# ---------------------------------------------------
# BUILD DOOR RECTS (used for drawing & touch detection)
# ---------------------------------------------------
def build_door_rects():
    frame_top = 0
    frame_bottom = HEIGHT // 2
    frame_h = frame_bottom - frame_top

    gap = 40
    total_width = door_count * DOOR_W + (door_count - 1) * gap

    # apply easing offset
    centre_x = WIDTH//2 + int(door_offset)
    left_start = centre_x - total_width // 2

    rects = []
    for i in range(door_count):
        x = left_start + i*(DOOR_W + gap)
        y = frame_top + (frame_h - DOOR_H)//2
        rects.append(pygame.Rect(x, y, DOOR_W, DOOR_H))

    return rects

# ---------------------------------------------------
# HANDLE TOUCHES
# ---------------------------------------------------
def handle_touch(pos, door_rects):
    global door_count, target_offset

    x, y = pos
    mid = WIDTH//2

    # 1) If tapped a door → cycle count
    for rect in door_rects:
        if rect.collidepoint(x, y):
            door_count += 1
            if door_count > 5:
                door_count = 1
            if door_count < 5:
                target_offset = 0
            return

    # 2) No door tapped
    if door_count < 5:
        target_offset = 0
        return

    # 3) Carousel movement (only when 5 doors)
    if abs(x - mid) <= CENTER_MARGIN:
        target_offset = 0
    elif x < mid:
        # tap left = doors slide right
        target_offset += OFFSET_STEP
    else:
        # tap right = doors slide left
        target_offset -= OFFSET_STEP

# ---------------------------------------------------
# MAIN LOOP
# ---------------------------------------------------
while True:
    # Build rects once per frame
    door_rects = build_door_rects()

    # Handle events
    for e in pygame.event.get():
        if e.type == pygame.QUIT:
            pygame.quit()
            sys.exit()
        if e.type == pygame.MOUSEBUTTONDOWN:
            handle_touch(e.pos, door_rects)

    # Easing motion
    if abs(target_offset - door_offset) > 1:
        door_offset += (target_offset - door_offset) * 0.12
    else:
        door_offset = target_offset

    # Draw
    screen.fill(BLACK)
    for rect in door_rects:
        draw_door(rect)

    pygame.display.flip()
    clock.tick(60)
