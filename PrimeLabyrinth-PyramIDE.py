"""Single-file Android/PyramIDE build of The Between.

Open this file directly in PyramIDE and press its green graphical Run arrow.
It intentionally has no local-module or project-folder dependencies.
"""
import colorsys
import hashlib
import json
import math
import os
import traceback

os.environ.setdefault("PYGAME_HIDE_SUPPORT_PROMPT", "1")
import pygame

WIDTH, HEIGHT = 1280, 800
ROOM_SIZE = 12.0
ORIGIN_X, ORIGIN_Y = WIDTH // 2, 170
TILE_X, TILE_Y, LEVEL_H = 42, 22, 74
TEXT, INK = (238, 239, 224), (9, 13, 20)
START = (2, 2, 3)


def primes_up_to(limit):
    sieve = [True] * (limit + 1)
    sieve[0:2] = [False, False]
    for p in range(2, int(limit ** .5) + 1):
        if sieve[p]:
            sieve[p * p:limit + 1:p] = [False] * (((limit - p * p) // p) + 1)
    return [number for number, prime in enumerate(sieve) if prime]


PRIMES = primes_up_to(10000)
PRIME_SET = set(PRIMES)
PRIME_INDEX = {prime: index for index, prime in enumerate(PRIMES)}


def adjacent(prime):
    index = PRIME_INDEX[prime]
    previous = prime if index == 0 else PRIMES[index - 1]
    values = [previous, prime]
    if index + 1 < len(PRIMES):
        values.append(PRIMES[index + 1])
    return values


def targets(room):
    room_prime = sum(room)
    index = PRIME_INDEX[room_prime]
    if index + 1 >= len(PRIMES):
        return []
    target_prime = PRIMES[index + 1]
    doors = set()
    for a in adjacent(room[0]):
        for b in adjacent(room[1]):
            for c in adjacent(room[2]):
                candidate = tuple(sorted((a, b, c)))
                if sum(candidate) == target_prime:
                    doors.add(candidate)
    return sorted(doors)


def stable_seed(*values):
    raw = json.dumps(values, separators=(",", ":")).encode("utf-8")
    return int.from_bytes(hashlib.sha256(raw).digest()[:8], "big")


def half_diamond(room):
    a, b, c = room
    differences = (abs(b - a), abs(c - b))
    return abs(differences[1] - differences[0]), differences, tuple(room)


def accent_for(room, entrance):
    rows = half_diamond(room)
    if entrance is not None:
        apex, differences, previous = half_diamond(entrance)
        rows += (previous, differences, (apex,))
    hue = (stable_seed("prime-room-fundamentals", 1, rows) % 3600) / 3600
    return tuple(round(value * 255)
                 for value in colorsys.hsv_to_rgb(hue, .47, .90))


class Explorer:
    def __init__(self):
        self.rooms = [START]
        self.path = []

    @property
    def current(self):
        return self.rooms[-1]

    @property
    def entrance(self):
        return self.rooms[-2] if len(self.rooms) > 1 else None

    @property
    def address(self):
        code = "".join(format(index, "X") for index in self.path)
        return "2,2,3:" + (code or "ROOT")

    def take(self, index):
        choices = targets(self.current)
        if 0 <= index < len(choices):
            self.path.append(index)
            self.rooms.append(choices[index])

    def back(self):
        if self.path:
            self.path.pop()
            self.rooms.pop()


class Door:
    def __init__(self, index, wall, position, level, target):
        self.index, self.wall = index, wall
        self.position, self.level, self.target = position, level, target

    @property
    def approach(self):
        if self.wall == "NORTH":
            return self.position, .8
        if self.wall == "WEST":
            return .8, self.position
        return ROOM_SIZE - .8, self.position


def make_doors(room):
    choices = targets(room)
    walls = ("NORTH", "WEST", "EAST")
    offset = stable_seed("iso-wall-order", room) % 3
    assignments = [walls[(index + offset) % 3] for index in range(len(choices))]
    totals = {wall: assignments.count(wall) for wall in walls}
    counts = {wall: 0 for wall in walls}
    result = []
    for index, (target, wall) in enumerate(zip(choices, assignments)):
        rank = counts[wall]
        counts[wall] += 1
        position = ROOM_SIZE * (rank + 1) / (totals[wall] + 1)
        result.append(Door(index, wall, position, rank // 4, target))
    return result


def nearest_door(doors, x, y, distance=1.25):
    candidates = []
    for door in doors:
        dx, dy = door.approach[0] - x, door.approach[1] - y
        if dx * dx + dy * dy <= distance * distance:
            candidates.append((dx * dx + dy * dy, door.index, door))
    return min(candidates)[2] if candidates else None


def blend(a, b, amount):
    return tuple(round(x + (y - x) * amount) for x, y in zip(a, b))


def iso(x, y, z=0):
    return (round(ORIGIN_X + (x - y) * TILE_X),
            round(ORIGIN_Y + (x + y) * TILE_Y - z * LEVEL_H))


class Game:
    def __init__(self):
        self.explorer = Explorer()
        self.canvas = pygame.Surface((WIDTH, HEIGHT))
        self.font = pygame.font.Font(None, 27)
        self.small = pygame.font.Font(None, 21)
        self.title = pygame.font.Font(None, 42)
        self.time = 0
        self.load_room()

    def load_room(self):
        self.doors = make_doors(self.explorer.current)
        self.accent = accent_for(self.explorer.current, self.explorer.entrance)
        self.x = self.y = ROOM_SIZE / 2
        self.z = 0.0

    def nearby(self):
        return nearest_door(self.doors, self.x, self.y)

    def use(self):
        door = self.nearby()
        if door:
            self.explorer.take(door.index)
            self.load_room()
        elif self.explorer.path and self.x + self.y > ROOM_SIZE * 1.72:
            self.explorer.back()
            self.load_room()

    def update(self, dt, dx, dy):
        self.time += dt
        length = math.hypot(dx, dy)
        if length:
            self.x = max(.65, min(ROOM_SIZE - .65,
                         self.x + dx / length * 4 * dt))
            self.y = max(.65, min(ROOM_SIZE - .65,
                         self.y + dy / length * 4 * dt))
        door = self.nearby()
        target_z = door.level if door else 0
        self.z += (target_z - self.z) * min(1, dt * 5)

    def line(self, colour, start, end, width=1):
        pygame.draw.line(self.canvas, colour, start, end, width)

    def draw_door(self, door):
        if door.wall == "NORTH":
            base, left, right = iso(door.position, 0, door.level), (-34, 18), (34, -18)
        elif door.wall == "WEST":
            base, left, right = iso(0, door.position, door.level), (-34, -18), (34, 18)
        else:
            base, left, right = iso(ROOM_SIZE, door.position, door.level), (-34, -18), (34, 18)
        top = base[0], base[1] - 72
        colour = blend(self.accent, TEXT, .32)
        points = [(base[0] + left[0], base[1] + left[1]),
                  (base[0] + right[0], base[1] + right[1]),
                  (top[0] + right[0], top[1] + right[1]),
                  (top[0] + left[0], top[1] + left[1])]
        pygame.draw.polygon(self.canvas, blend(INK, self.accent, .06), points)
        pygame.draw.lines(self.canvas, colour, False, points, 3)
        ax, ay = door.approach
        rune = iso(ax, ay)
        pygame.draw.circle(self.canvas, colour, rune,
                           10 + round(3 * math.sin(self.time * 3 + door.index)), 2)
        label = self.small.render("%X  P%d" % (door.index, sum(door.target)), True, TEXT)
        self.canvas.blit(label, (top[0] - label.get_width() // 2, top[1] - 22))

    def draw(self):
        a = self.accent
        self.canvas.fill(blend(INK, a, .08))
        floor = [iso(0, 0), iso(ROOM_SIZE, 0), iso(ROOM_SIZE, ROOM_SIZE), iso(0, ROOM_SIZE)]
        walls = [
            ([iso(0, 0), iso(ROOM_SIZE, 0), iso(ROOM_SIZE, 0, 3.2), iso(0, 0, 3.2)], .30),
            ([iso(0, 0), iso(0, ROOM_SIZE), iso(0, ROOM_SIZE, 3.2), iso(0, 0, 3.2)], .22),
            ([iso(ROOM_SIZE, 0), iso(ROOM_SIZE, ROOM_SIZE), iso(ROOM_SIZE, ROOM_SIZE, 3.2), iso(ROOM_SIZE, 0, 3.2)], .16)]
        for points, shade in walls:
            pygame.draw.polygon(self.canvas, blend(INK, a, shade), points)
        pygame.draw.polygon(self.canvas, blend(INK, a, .38), floor)
        for value in range(13):
            self.line(blend(INK, a, .48), iso(value, 0), iso(value, ROOM_SIZE))
            self.line(blend(INK, a, .48), iso(0, value), iso(ROOM_SIZE, value))
        for door in self.doors:
            self.draw_door(door)
        front = iso(ROOM_SIZE, ROOM_SIZE)
        pygame.draw.circle(self.canvas, blend(TEXT, a, .65), front, 17, 2)
        px, py = iso(self.x, self.y, self.z)
        pygame.draw.circle(self.canvas, blend(a, TEXT, .58), (px, py - 30), 11)
        self.line(TEXT, (px, py - 19), (px, py + 7), 4)
        room = self.explorer.current
        self.canvas.blit(self.title.render("THE BETWEEN / ISOMETRIC", True, TEXT), (28, 20))
        info = "P%d  (%s)  visit %s" % (sum(room), ",".join(map(str, room)), self.explorer.address)
        self.canvas.blit(self.font.render(info, True, TEXT), (30, 61))
        self.canvas.blit(self.small.render("Touch arrows to move; USE enters; BACK returns", True, TEXT), (30, HEIGHT - 28))
        return self.canvas


def button_rects(screen_size):
    sw, sh = screen_size
    size, gap = min(sw, sh) * .095, min(sw, sh) * .018
    x, y = gap, sh - size * 2 - gap * 2
    return {
        "up": pygame.Rect(x + size, y, size, size),
        "left": pygame.Rect(x, y + size, size, size),
        "down": pygame.Rect(x + size, y + size, size, size),
        "right": pygame.Rect(x + size * 2, y + size, size, size),
        "use": pygame.Rect(sw - size * 2.25, sh - size * 1.35, size * 1.9, size),
        "back": pygame.Rect(sw - size * 2.25, sh - size * 2.55, size * 1.9, size)}


def main():
    pygame.init()
    screen = pygame.display.set_mode((0, 0))
    pygame.display.set_caption("The Between")
    game, clock, running = Game(), pygame.time.Clock(), True
    held = set()
    while running:
        dt = min(clock.tick(60) / 1000.0, .05)
        buttons = button_rects(screen.get_size())
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type in (pygame.MOUSEBUTTONDOWN, pygame.FINGERDOWN):
                point = (event.pos if hasattr(event, "pos") else
                         (event.x * screen.get_width(), event.y * screen.get_height()))
                for name, rect in buttons.items():
                    if rect.collidepoint(point):
                        if name == "use": game.use()
                        elif name == "back":
                            game.explorer.back(); game.load_room()
                        else: held.add(name)
            elif event.type in (pygame.MOUSEBUTTONUP, pygame.FINGERUP):
                held.clear()
        keys = pygame.key.get_pressed()
        dx = ("right" in held) - ("left" in held) + keys[pygame.K_RIGHT] - keys[pygame.K_LEFT]
        dy = ("down" in held) - ("up" in held) + keys[pygame.K_DOWN] - keys[pygame.K_UP]
        game.update(dt, dx, dy)
        source = game.draw()
        sw, sh = screen.get_size()
        scale = min(sw / WIDTH, sh / HEIGHT)
        size = round(WIDTH * scale), round(HEIGHT * scale)
        screen.fill(INK)
        screen.blit(pygame.transform.smoothscale(source, size),
                    ((sw - size[0]) // 2, (sh - size[1]) // 2))
        for name, rect in buttons.items():
            pygame.draw.rect(screen, (35, 45, 52), rect, border_radius=12)
            label = game.small.render({"up":"^", "left":"<", "down":"v", "right":">",
                                       "use":"USE", "back":"BACK"}[name], True, TEXT)
            screen.blit(label, label.get_rect(center=rect.center))
        pygame.display.flip()
    pygame.quit()


if __name__ == "__main__":
    try:
        main()
    except BaseException:
        try:
            with open("/sdcard/PrimeLabyrinth-PyramIDE-error.txt", "w") as handle:
                handle.write(traceback.format_exc())
        finally:
            raise
