"""Single-file Android/PyramIDE build of The Between.

Open this file directly in PyramIDE and press its green graphical Run arrow.
It intentionally has no local-module or project-folder dependencies.
"""
import colorsys
import hashlib
import json
import math
import os
import sys
import traceback

os.environ.setdefault("PYGAME_HIDE_SUPPORT_PROMPT", "1")
import pygame

WIDTH, HEIGHT = 1280, 800
ROOM_SIZE = 12.0
ORIGIN_X, ORIGIN_Y = WIDTH // 2, 280
TILE_X, TILE_Y, LEVEL_H = 38, 17, 68
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
    apex, differences, current = half_diamond(room)
    rows = ((apex,), differences, current)
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
        code = "".join(format(index, "X") if index < 16 else "[%X]" % index
                       for index in self.path)
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


def unproject(point):
    """Inverse floor projection. Input is a point on the logical canvas."""
    u = (point[0] - ORIGIN_X) / TILE_X
    v = (point[1] - ORIGIN_Y) / TILE_Y
    return (v + u) / 2, (v - u) / 2


def viewport(screen_size):
    sw, sh = screen_size
    scale = min(sw / WIDTH, sh / HEIGHT)
    size = max(1, round(WIDTH * scale)), max(1, round(HEIGHT * scale))
    return pygame.Rect((sw - size[0]) // 2, (sh - size[1]) // 2, *size)


def logical_point(point, screen_size):
    rect = viewport(screen_size)
    if not rect.collidepoint(point):
        return None
    return ((point[0] - rect.x) * WIDTH / rect.w,
            (point[1] - rect.y) * HEIGHT / rect.h)


def pointer_point(event, screen_size):
    if event.type == pygame.FINGERDOWN:
        return logical_point((event.x * screen_size[0], event.y * screen_size[1]), screen_size)
    if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
        # SDL also emits synthetic mouse events for fingers. Handle each tap once.
        if not getattr(event, "touch", False):
            return logical_point(event.pos, screen_size)
    return None


def portal_polygon(door, half_width=.8, height=1.25):
    """Project the actual wall plane, shared by drawing and hit testing."""
    p, z = door.position, door.level
    if door.wall == "NORTH":
        ends = ((p - half_width, 0), (p + half_width, 0))
    else:
        x = 0 if door.wall == "WEST" else ROOM_SIZE
        ends = ((x, p - half_width), (x, p + half_width))
    a, b = ends
    return [iso(*a, z), iso(*b, z), iso(*b, z + height), iso(*a, z + height)]


def inside_polygon(point, polygon):
    crosses = []
    for a, b in zip(polygon, polygon[1:] + polygon[:1]):
        crosses.append((b[0] - a[0]) * (point[1] - a[1])
                       - (b[1] - a[1]) * (point[0] - a[0]))
    return all(c >= 0 for c in crosses) or all(c <= 0 for c in crosses)


RETURN_POINT = (11.15, 11.15)


class Game:
    def __init__(self, explorer=None, save_path=None):
        self.explorer = explorer if explorer is not None else Explorer()
        self.save_path = save_path
        self.canvas = pygame.Surface((WIDTH, HEIGHT))
        self.font = pygame.font.Font(None, 27)
        self.small = pygame.font.Font(None, 21)
        self.title = pygame.font.Font(None, 42)
        self.time = 0
        self.stride = 0
        self.facing = (1, 1)
        self.notice = "Tap the floor to walk. Tap a doorway to travel."
        self.load_room()

    def load_room(self):
        self.doors = make_doors(self.explorer.current)
        self.accent = accent_for(self.explorer.current, self.explorer.entrance)
        self.x = self.y = ROOM_SIZE / 2
        self.z = 0.0
        self.destination = None
        self.pending = None
        self.walking = False
        self.autosave()

    def autosave(self):
        if self.save_path:
            try:
                self.explorer.save(self.save_path)
            except OSError:
                self.notice = "Unable to save here. Exploration can continue."

    def click(self, point):
        # Frontmost visible portals take precedence over the floor behind them.
        for door in sorted(self.doors, key=lambda d: sum(d.approach), reverse=True):
            rune = iso(*door.approach)
            if (inside_polygon(point, portal_polygon(door))
                    or math.dist(point, rune) <= 24):
                self.destination, self.pending = door.approach, door.index
                self.notice = "Walking to door %X / P%d" % (door.index, sum(door.target))
                return
        if self.explorer.path and math.dist(point, iso(*RETURN_POINT)) < 36:
            self.destination, self.pending = RETURN_POINT, "back"
            self.notice = "Returning along your path"
            return
        x, y = unproject(point)
        if 0 <= x <= ROOM_SIZE and 0 <= y <= ROOM_SIZE:
            self.destination = (max(.65, min(ROOM_SIZE - .65, x)),
                                max(.65, min(ROOM_SIZE - .65, y)))
            self.pending = None
            self.notice = "Tap another spot to change course"

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

    def update(self, dt):
        self.time += dt
        self.walking = False
        if self.destination is None:
            self.z = max(0, self.z - dt * 2)
            return
        dx, dy = self.destination[0] - self.x, self.destination[1] - self.y
        distance = math.hypot(dx, dy)
        step = min(distance, 3.5 * dt)
        if distance > .001:
            self.facing = (dx / distance, dy / distance)
            self.x += self.facing[0] * step
            self.y += self.facing[1] * step
            self.stride += step * 5
            self.walking = True
        if distance > 3.5 * dt + .001:
            self.z = max(0, self.z - dt * 2)
            return
        self.x, self.y = self.destination
        level = self.doors[self.pending].level if isinstance(self.pending, int) else 0
        if abs(self.z - level) > .01:
            self.z += max(-dt * 2, min(dt * 2, level - self.z))
            return
        action = self.pending
        self.destination = self.pending = None
        if action == "back":
            self.explorer.back()
            self.load_room()
        elif isinstance(action, int):
            self.explorer.take(action)
            self.load_room()
        else:
            self.walking = False

    def line(self, colour, start, end, width=1):
        pygame.draw.line(self.canvas, colour, start, end, width)

    def draw_door(self, door):
        points = portal_polygon(door)
        outer = portal_polygon(door, 1.0, 1.45)
        colour = blend(self.accent, TEXT, .32)
        pygame.draw.polygon(self.canvas, blend(INK, self.accent, .6), outer)
        pygame.draw.polygon(self.canvas, blend(INK, self.accent, .06), points)
        pygame.draw.lines(self.canvas, colour, True, points, 2)
        # A receding inner glow gives the portal depth without changing its plane.
        mid = tuple((points[2][i] + points[3][i]) // 2 for i in (0, 1))
        self.line(blend(INK, colour, .6), (mid[0], mid[1] + 16),
                  (mid[0], mid[1] + 50), 2)
        ax, ay = door.approach
        rune = iso(ax, ay)
        pygame.draw.circle(self.canvas, colour, rune,
                           10 + round(3 * math.sin(self.time * 3 + door.index)), 2)
        if door.level:
            self.line(colour, rune, iso(ax, ay, door.level), 2)
        label = self.small.render("%X  P%d" % (door.index, sum(door.target)), True, TEXT)
        self.canvas.blit(label, (mid[0] - label.get_width() // 2, min(p[1] for p in outer) - 24))

    def draw_character(self):
        """Small animated cloaked explorer, drawn locally with no asset downloads."""
        px, py = iso(self.x, self.y, self.z)
        sx, sy = iso(self.x, self.y)
        pygame.draw.ellipse(self.canvas, (12, 18, 25), (sx - 20, sy - 8, 40, 16))
        gait = math.sin(self.stride) if self.walking else 0
        bob = abs(gait) * 2
        py -= round(bob)
        facing = 1 if self.facing[0] - self.facing[1] >= 0 else -1
        back_view = sum(self.facing) < 0
        # Boots and trouser legs are anchored at the floor, alternating while walking.
        for sign in (-1, 1):
            foot = round(py - 3 + gait * sign * 5)
            pygame.draw.line(self.canvas, (38, 39, 48), (px + sign * 7, py - 24),
                             (px + sign * 8, foot - 4), 7)
            pygame.draw.ellipse(self.canvas, (72, 47, 37), (px + sign * 8 - 6, foot - 6, 14, 8))
        cloak = [(px - 13, py - 48), (px + 12, py - 48),
                 (px + 19 + round(gait * 2), py - 17), (px - 19, py - 15)]
        pygame.draw.polygon(self.canvas, (21, 30, 42), cloak)
        pygame.draw.polygon(self.canvas, (42, 91, 102),
                            [(px - 10, py - 46), (px + 9, py - 45),
                             (px + 13, py - 22), (px - 12, py - 20)])
        self.line((109, 170, 167), (px - 8, py - 44), (px - 12, py - 23), 2)
        pygame.draw.rect(self.canvas, (100, 66, 44), (px - 10, py - 27, 22, 5))
        pygame.draw.rect(self.canvas, (226, 184, 102), (px - 2, py - 28, 5, 6), 1)
        # Hood, face, scarf, and a warm lantern carried on the leading side.
        pygame.draw.circle(self.canvas, (22, 36, 48), (px, py - 53), 15)
        pygame.draw.arc(self.canvas, (89, 145, 150), (px - 14, py - 67, 28, 28), .3, 3.0, 2)
        if not back_view:
            pygame.draw.ellipse(self.canvas, (218, 170, 124), (px - 8 + facing * 2, py - 59, 17, 17))
            pygame.draw.circle(self.canvas, (22, 27, 34), (px + facing * 5, py - 52), 2)
        else:
            pygame.draw.rect(self.canvas, (110, 75, 48), (px - 9, py - 44, 18, 18), border_radius=5)
        self.line((213, 164, 78), (px - 10, py - 40), (px + 10, py - 38), 4)
        lx, ly = px + facing * 22, py - 26 + round(gait * 2)
        self.line((49, 79, 86), (px + facing * 11, py - 39), (lx, ly - 5), 6)
        pygame.draw.circle(self.canvas, (219, 175, 126), (lx, ly - 5), 3)
        pygame.draw.rect(self.canvas, (74, 54, 40), (lx - 6, ly, 12, 15), border_radius=2)
        pygame.draw.rect(self.canvas, (255, 212, 119), (lx - 3, ly + 3, 6, 9), border_radius=2)

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
            pygame.draw.lines(self.canvas, blend(INK, a, .55), True, points, 2)
        pygame.draw.polygon(self.canvas, blend(INK, a, .38), floor)
        for value in range(13):
            self.line(blend(INK, a, .48), iso(value, 0), iso(value, ROOM_SIZE))
            self.line(blend(INK, a, .48), iso(0, value), iso(ROOM_SIZE, value))
        if self.destination:
            marker = iso(*self.destination)
            pygame.draw.ellipse(self.canvas, (238, 199, 126), (marker[0] - 15, marker[1] - 7, 30, 14), 2)
            start = iso(self.x, self.y)
            for i in range(1, 10):
                t = i / 10
                p = (round(start[0] + (marker[0] - start[0]) * t),
                     round(start[1] + (marker[1] - start[1]) * t))
                pygame.draw.circle(self.canvas, blend(INK, a, .8), p, 2)
        # The east/front wall is cut away; its portals remain visible, like gates.
        # Sort the explorer and portals by world depth to avoid drawing through them.
        actors = [(sum(d.approach), d) for d in self.doors] + [(self.x + self.y, None)]
        for _, door in sorted(actors, key=lambda item: item[0]):
            if door is None:
                self.draw_character()
            else:
                self.draw_door(door)
        if self.explorer.path:
            front = iso(*RETURN_POINT)
            pygame.draw.ellipse(self.canvas, blend(TEXT, a, .65), (front[0] - 24, front[1] - 12, 48, 24), 2)
            label = self.small.render("RETURN", True, TEXT)
            self.canvas.blit(label, (front[0] - label.get_width() // 2, front[1] + 18))
        room = self.explorer.current
        self.canvas.blit(self.title.render("THE BETWEEN / ISOMETRIC", True, TEXT), (28, 20))
        info = "P%d  (%s)  visit %s" % (sum(room), ",".join(map(str, room)), self.explorer.address)
        self.canvas.blit(self.font.render(info, True, TEXT), (30, 61))
        pygame.draw.rect(self.canvas, INK, (0, 730, WIDTH, 70))
        self.canvas.blit(self.font.render(self.notice, True, TEXT), (30, 743))
        hint = "CLICK / TAP TO WALK     /     TAP A DOOR TO ENTER     /     TAP RETURN TO GO BACK"
        self.canvas.blit(self.small.render(hint, True, blend(TEXT, a, .4)), (30, 777))
        return self.canvas


def run(game, screen):
    clock, running = pygame.time.Clock(), True
    while running:
        dt = min(clock.tick(60) / 1000.0, .05)
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                running = False
            else:
                point = pointer_point(event, screen.get_size())
                if point is not None:
                    game.click(point)
        game.update(dt)
        source = game.draw()
        rect = viewport(screen.get_size())
        screen.fill(INK)
        screen.blit(pygame.transform.smoothscale(source, rect.size), rect.topleft)
        pygame.display.flip()
    game.autosave()
    pygame.quit()


def main():
    pygame.init()
    android = "ANDROID_ROOT" in os.environ or sys.platform == "android"
    screen = pygame.display.set_mode((0, 0) if android else (WIDTH, HEIGHT))
    pygame.display.set_caption("The Between / Wayfarer")
    run(Game(), screen)


if __name__ == "__main__":
    try:
        main()
    except BaseException:
        try:
            with open("/sdcard/PrimeLabyrinth-PyramIDE-error.txt", "w") as handle:
                handle.write(traceback.format_exc())
        finally:
            raise
