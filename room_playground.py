import pygame
from pygame.locals import QUIT, KEYDOWN, K_LEFT, K_RIGHT, K_a, K_d, K_r, K_ESCAPE

# Import the real door look from the main adventure
import labyrinth_adventure as la

pygame.init()

WIDTH, HEIGHT = 1000, 600
SCREEN = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Room Playground: Use real blue doors + rotation")

BG_COLOR = (0, 0, 0)

FONT = pygame.font.SysFont("consolas", 24)

# Use the same fonts and colours as the main game
FONTS = la.make_fonts()

WALLS = ["front", "left", "back", "right"]
FRONT_INDEX = 0
BACK_INDEX = 2
current_wall_index = FRONT_INDEX

clock = pygame.time.Clock()


# ------------ LAYOUT HELPERS ------------

def wall_rect() -> pygame.Rect:
    """Rectangle that represents the visible wall/window area."""
    margin = 120
    return pygame.Rect(margin, margin, WIDTH - 2 * margin, HEIGHT - 2 * margin)


def layout_front_doors(rect: pygame.Rect, count: int) -> list[pygame.Rect]:
    """Lay out N doors evenly across the front wall, using real door size."""
    count = max(1, min(count, 5))

    door_w = la.DOOR_W
    door_h = la.DOOR_H
    spacing = door_w * 0.4

    total_w = count * door_w + (count - 1) * spacing
    start_x = rect.centerx - total_w / 2
    top = rect.top + (rect.height - door_h) / 2

    rects: list[pygame.Rect] = []
    for i in range(count):
        left = start_x + i * (door_w + spacing)
        r = pygame.Rect(left, top, door_w, door_h)
        rects.append(r)
    return rects


def entrance_door_rect(rect: pygame.Rect) -> pygame.Rect:
    """Single door in the middle of the back wall."""
    door_w = la.DOOR_W
    door_h = la.DOOR_H

    r = pygame.Rect(0, 0, door_w, door_h)
    r.midbottom = (rect.centerx, rect.bottom - 10)
    return r


# ------------ WALL DRAWING ------------

def draw_front_wall(rect: pygame.Rect):
    """Front wall: outgoing doors."""
    doors = layout_front_doors(rect, count=3)

    # Dummy test data – just to see different labels & states
    example_h = [
        (2, 2, 3),
        (3, 3, 5),
        (5, 5, 7),
    ]
    example_p = [7, 11, 13]

    for idx, door_rect in enumerate(doors):
        p = example_p[idx % len(example_p)]
        h_triplet = example_h[idx % len(example_h)]

        # First one open, others closed – just so we can see the colour change
        opened = (idx == 0)

        la.draw_single_door(
            SCREEN,
            door_rect,
            p=p,
            h_triplet=h_triplet,
            opened=opened,
            fonts=FONTS,
        )


def draw_back_wall(rect: pygame.Rect):
    """Back wall: entrance door we came through."""
    door_rect = entrance_door_rect(rect)

    # Use some obvious values so we can recognise this as the entrance
    p = 7
    h_triplet = (2, 2, 3)
    opened = True

    la.draw_single_door(
        SCREEN,
        door_rect,
        p=p,
        h_triplet=h_triplet,
        opened=opened,
        fonts=FONTS,
    )

    label = FONT.render("Entrance door (back wall)", True, la.TEXT_COLOR)
    SCREEN.blit(label, (rect.left + 20, rect.top + 20))


def draw_left_wall(rect: pygame.Rect):
    text = FONT.render("Left wall: stats / graffiti canvas", True, la.TEXT_COLOR)
    SCREEN.blit(text, (rect.left + 20, rect.top + 20))


def draw_right_wall(rect: pygame.Rect):
    text = FONT.render("Right wall: more info / artwork", True, la.TEXT_COLOR)
    SCREEN.blit(text, (rect.left + 20, rect.top + 20))


def draw_current_wall():
    rect = wall_rect()
    pygame.draw.rect(SCREEN, la.TEXT_COLOR, rect, 2)

    wall = WALLS[current_wall_index]

    if wall == "front":
        draw_front_wall(rect)
    elif wall == "back":
        draw_back_wall(rect)
    elif wall == "left":
        draw_left_wall(rect)
    elif wall == "right":
        draw_right_wall(rect)

    # Wall label at the top
    label = f"Wall: {wall.upper()}   (LEFT/RIGHT rotate, R flip front/back)"
    text_surface = FONT.render(label, True, la.TEXT_COLOR)
    SCREEN.blit(text_surface, (20, 20))


# ------------ ROTATION CONTROLS ------------

def rotate_left():
    global current_wall_index
    current_wall_index = (current_wall_index + 1) % len(WALLS)


def rotate_right():
    global current_wall_index
    current_wall_index = (current_wall_index - 1) % len(WALLS)


def flip_front_back():
    global current_wall_index
    if current_wall_index == FRONT_INDEX:
        current_wall_index = BACK_INDEX
    elif current_wall_index == BACK_INDEX:
        current_wall_index = FRONT_INDEX
    else:
        current_wall_index = BACK_INDEX   # from side → look back


# ------------ MAIN LOOP ------------

def main():
    global current_wall_index
    running = True

    while running:
        for event in pygame.event.get():
            if event.type == QUIT:
                running = False
            elif event.type == KEYDOWN:
                if event.key in (K_LEFT, K_a):
                    rotate_left()
                elif event.key in (K_RIGHT, K_d):
                    rotate_right()
                elif event.key == K_r:
                    flip_front_back()
                elif event.key == K_ESCAPE:
                    running = False

        SCREEN.fill(BG_COLOR)
        draw_current_wall()
        pygame.display.flip()
        clock.tick(60)

    pygame.quit()


if __name__ == "__main__":
    main()