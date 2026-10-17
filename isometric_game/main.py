"""The Between: an isometric Prime Labyrinth exploration prototype."""
from __future__ import annotations

import argparse
import math
import os
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("PYGAME_HIDE_SUPPORT_PROMPT", "1")
import pygame

from side_scroller_model import Explorer, key
from isometric_game.model import ROOM_SIZE, make_doors, nearest_door

WIDTH, HEIGHT = 1280, 800
ORIGIN_X, ORIGIN_Y = WIDTH // 2, 170
TILE_X, TILE_Y, LEVEL_H = 42, 22, 74
TEXT = (238, 239, 224)
INK = (9, 13, 20)


def is_android():
    """PyramIDE exposes Android through its environment rather than platform."""
    return (sys.platform == "android" or "ANDROID_ROOT" in os.environ
            or "ANDROID_ARGUMENT" in os.environ)


def fit_to_screen(source, destination):
    """Letterbox the fixed logical canvas onto any phone/tablet display."""
    sw, sh = destination.get_size()
    scale = min(sw / WIDTH, sh / HEIGHT)
    size = (max(1, round(WIDTH * scale)), max(1, round(HEIGHT * scale)))
    frame = pygame.transform.smoothscale(source, size)
    destination.fill(INK)
    destination.blit(frame, ((sw - size[0]) // 2, (sh - size[1]) // 2))


def blend(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def iso(x, y, z=0):
    return (round(ORIGIN_X + (x - y) * TILE_X),
            round(ORIGIN_Y + (x + y) * TILE_Y - z * LEVEL_H))


class Game:
    def __init__(self, explorer: Explorer, save_path: Path | None):
        self.explorer = explorer
        self.save_path = save_path
        self.surface = pygame.Surface((WIDTH, HEIGHT))
        self.font = pygame.font.SysFont("consolas", 18)
        self.small = pygame.font.SysFont("consolas", 14)
        self.title = pygame.font.SysFont("bahnschrift", 29, bold=True)
        self.x = self.y = ROOM_SIZE / 2
        self.z = self.z_target = 0.0
        self.facing = 1
        self.time = 0.0
        self.toast = "Three walls. One entrance behind you. Choose a door."
        self.toast_time = 6.0
        self.load_room()

    def load_room(self, returning=False):
        self.doors = make_doors(self.explorer.current)
        self.accent = self.explorer.fundamentals.accent
        self.x = self.y = ROOM_SIZE / 2
        self.z = self.z_target = 0.0
        self.toast = ("Returned through the entrance." if returning else
                      f"Entered P{sum(self.explorer.current)}.")
        self.toast_time = 3.0
        self.autosave()

    def autosave(self):
        if self.save_path:
            self.explorer.save(self.save_path)

    def update(self, dt, dx, dy):
        self.time += dt
        self.toast_time = max(0, self.toast_time - dt)
        speed = 4.0
        length = math.hypot(dx, dy)
        if length:
            dx, dy = dx / length, dy / length
            self.x = min(ROOM_SIZE - .65, max(.65, self.x + dx * speed * dt))
            self.y = min(ROOM_SIZE - .65, max(.65, self.y + dy * speed * dt))
            self.facing = 1 if dx - dy >= 0 else -1
        door = nearest_door(self.doors, self.x, self.y)
        self.z_target = float(door.level) if door else 0.0
        self.z += (self.z_target - self.z) * min(1, dt * 5)

    def interact(self):
        door = nearest_door(self.doors, self.x, self.y)
        if door:
            self.explorer.take(door.index)
            self.load_room()
            return
        # The cutaway/front corner is the entrance back to the previous room.
        if self.explorer.path and self.x + self.y > ROOM_SIZE * 1.72:
            self.explorer.back()
            self.load_room(returning=True)
        else:
            self.toast = "Stand on a glowing threshold, then press E."
            self.toast_time = 2.5

    def polygon(self, colour, points, width=0):
        pygame.draw.polygon(self.surface, colour, points, width)

    def line(self, colour, a, b, width=1):
        pygame.draw.line(self.surface, colour, a, b, width)

    def draw_room(self):
        a = self.accent
        self.surface.fill(blend(INK, a, .08))
        # Three enclosing walls: north, west and east. The near/south edge is
        # cut away and acts as the return entrance.
        floor = [iso(0, 0), iso(ROOM_SIZE, 0), iso(ROOM_SIZE, ROOM_SIZE), iso(0, ROOM_SIZE)]
        north = [iso(0, 0), iso(ROOM_SIZE, 0), iso(ROOM_SIZE, 0, 3.2), iso(0, 0, 3.2)]
        west = [iso(0, 0), iso(0, ROOM_SIZE), iso(0, ROOM_SIZE, 3.2), iso(0, 0, 3.2)]
        east = [iso(ROOM_SIZE, 0), iso(ROOM_SIZE, ROOM_SIZE),
                iso(ROOM_SIZE, ROOM_SIZE, 3.2), iso(ROOM_SIZE, 0, 3.2)]
        self.polygon(blend(INK, a, .30), north)
        self.polygon(blend(INK, a, .22), west)
        self.polygon(blend(INK, a, .16), east)
        self.polygon(blend(INK, a, .38), floor)
        for i in range(13):
            self.line(blend(INK, a, .48), iso(i, 0), iso(i, ROOM_SIZE))
            self.line(blend(INK, a, .48), iso(0, i), iso(ROOM_SIZE, i))
        for door in self.doors:
            self.draw_door(door)
        # Front entrance marker.
        front = iso(ROOM_SIZE, ROOM_SIZE)
        pygame.draw.circle(self.surface, blend(TEXT, a, .65), front, 17, 2)
        label = self.small.render("RETURN", True, TEXT)
        self.surface.blit(label, (front[0] - label.get_width() // 2, front[1] + 20))

    def draw_door(self, door):
        z = door.level
        if door.wall == "NORTH":
            base, left, right = iso(door.position, 0, z), (-34, 18), (34, -18)
        elif door.wall == "WEST":
            base, left, right = iso(0, door.position, z), (-34, -18), (34, 18)
        else:
            base, left, right = iso(ROOM_SIZE, door.position, z), (-34, -18), (34, 18)
        top = (base[0], base[1] - 72)
        colour = blend(self.accent, TEXT, .32)
        self.polygon(blend(INK, self.accent, .06), [
            (base[0] + left[0], base[1] + left[1]),
            (base[0] + right[0], base[1] + right[1]),
            (top[0] + right[0], top[1] + right[1]),
            (top[0] + left[0], top[1] + left[1])])
        self.line(colour, (base[0] + left[0], base[1] + left[1]),
                  (top[0] + left[0], top[1] + left[1]), 3)
        self.line(colour, (top[0] + left[0], top[1] + left[1]),
                  (top[0] + right[0], top[1] + right[1]), 3)
        self.line(colour, (top[0] + right[0], top[1] + right[1]),
                  (base[0] + right[0], base[1] + right[1]), 3)
        ax, ay = door.approach
        rune = iso(ax, ay)
        pulse = 10 + round(3 * math.sin(self.time * 3 + door.index))
        pygame.draw.circle(self.surface, colour, rune, pulse, 2)
        if door.level:
            self.line(colour, rune, iso(ax, ay, door.level), 2)
        label = self.small.render(f"{door.index:X}  P{sum(door.target)}", True, TEXT)
        self.surface.blit(label, (top[0] - label.get_width() // 2, top[1] - 21))

    def draw_player(self):
        px, py = iso(self.x, self.y, self.z)
        shadow = iso(self.x, self.y)
        pygame.draw.ellipse(self.surface, (7, 9, 12), (shadow[0] - 16, shadow[1] - 7, 32, 14))
        pygame.draw.circle(self.surface, blend(self.accent, TEXT, .58), (px, py - 30), 11)
        self.line(TEXT, (px, py - 19), (px, py + 5), 4)
        self.line(TEXT, (px, py - 10), (px + self.facing * 13, py - 2), 3)
        self.line(TEXT, (px, py + 4), (px - 8, py + 17), 3)
        self.line(TEXT, (px, py + 4), (px + 8, py + 17), 3)

    def draw_hud(self):
        room = self.explorer.current
        self.surface.blit(self.title.render("THE BETWEEN / ISOMETRIC", True, TEXT), (28, 22))
        detail = f"P{sum(room)}  ({key(room)})   visit {self.explorer.address}"
        self.surface.blit(self.font.render(detail, True, blend(TEXT, self.accent, .34)), (30, 59))
        help_text = "WASD / arrows: move   E/Enter: use threshold   Backspace: return   Esc: save & quit"
        self.surface.blit(self.small.render(help_text, True, TEXT), (30, HEIGHT - 30))
        door = nearest_door(self.doors, self.x, self.y)
        if door:
            prompt = f"E  door {door.index:X} -> P{sum(door.target)} ({key(door.target)})"
            rendered = self.font.render(prompt, True, TEXT)
            pygame.draw.rect(self.surface, blend(INK, self.accent, .18),
                             (WIDTH // 2 - rendered.get_width() // 2 - 14, HEIGHT - 76,
                              rendered.get_width() + 28, 36), border_radius=8)
            self.surface.blit(rendered, (WIDTH // 2 - rendered.get_width() // 2, HEIGHT - 68))
        elif self.toast_time:
            rendered = self.small.render(self.toast, True, TEXT)
            self.surface.blit(rendered, (WIDTH // 2 - rendered.get_width() // 2, HEIGHT - 67))

    def draw(self):
        self.draw_room()
        self.draw_player()
        self.draw_hud()
        return self.surface


def parse_room(value):
    try:
        room = tuple(int(part) for part in value.split(","))
    except ValueError as exc:
        raise argparse.ArgumentTypeError("use three comma-separated primes") from exc
    return room


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--save", type=Path, default=ROOT / "saves" / "isometric.json")
    parser.add_argument("--new", action="store_true")
    parser.add_argument("--start", type=parse_room, default=(2, 2, 3))
    parser.add_argument("--screenshot", type=Path)
    args = parser.parse_args()
    explorer = (Explorer.load(args.save) if args.save.exists() and not args.new
                else Explorer(args.start))
    pygame.init()
    game = Game(explorer, None if args.screenshot else args.save)
    if args.screenshot:
        args.screenshot.parent.mkdir(parents=True, exist_ok=True)
        pygame.image.save(game.draw(), args.screenshot)
        pygame.quit()
        return
    # PyramIDE's SDL activity supplies its surface through the (0, 0) mode.
    # Desktop platforms retain the convenient 1280x800 window.
    screen = pygame.display.set_mode((0, 0) if is_android() else (WIDTH, HEIGHT))
    pygame.display.set_caption("The Between — Isometric Prime Labyrinth")
    clock, running = pygame.time.Clock(), True
    while running:
        dt = min(clock.tick(60) / 1000, .05)
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    running = False
                elif event.key in (pygame.K_e, pygame.K_RETURN):
                    game.interact()
                elif event.key == pygame.K_BACKSPACE and explorer.path:
                    explorer.back()
                    game.load_room(returning=True)
        keys = pygame.key.get_pressed()
        dx = keys[pygame.K_d] + keys[pygame.K_RIGHT] - keys[pygame.K_a] - keys[pygame.K_LEFT]
        dy = keys[pygame.K_s] + keys[pygame.K_DOWN] - keys[pygame.K_w] - keys[pygame.K_UP]
        game.update(dt, dx, dy)
        if screen.get_size() == (WIDTH, HEIGHT):
            screen.blit(game.draw(), (0, 0))
        else:
            fit_to_screen(game.draw(), screen)
        pygame.display.flip()
    game.autosave()
    pygame.quit()


if __name__ == "__main__":
    try:
        main()
    except BaseException:
        # PyramIDE may close its graphical runner immediately on failure.
        # Preserve the traceback beside the project where Android can read it.
        report = ROOT / "isometric-crash.txt"
        report.write_text(traceback.format_exc(), encoding="utf-8")
        raise
