"""Prime Labyrinth / THE BETWEEN — deterministic 2D platform explorer.

Run with .venv/Scripts/python.exe prime_side_scroller.py on Windows.
No visual assets or network services are required.
"""
from __future__ import annotations

import argparse
import math
import os
from pathlib import Path

os.environ.setdefault("PYGAME_HIDE_SUPPORT_PROMPT", "1")
import pygame

import labyrinth_engine as engine
from side_scroller_model import Explorer, make_layout, stable_seed, key

ROOT = Path(__file__).resolve().parent
WIDTH, HEIGHT = 1280, 800
HUD, FOOTER = 118, 92
VIEW_H = HEIGHT - HUD - FOOTER
INK = (10, 17, 23)
TEXT = (230, 235, 220)
MUTED = (145, 163, 160)


def blend(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


class Player:
    WIDTH, HEIGHT = 24, 42
    SPEED, JUMP, GRAVITY, CLIMB = 270, 485, 1350, 215

    def __init__(self, x, feet_y):
        self.x, self.y = float(x), float(feet_y)
        self.vy = 0.0
        self.grounded = False
        self.climbing = False
        self.facing = 1
        self.coyote = 0.0

    def move(self, dt, horizontal, vertical, jump, layout):
        self.coyote = .10 if self.grounded else max(0, self.coyote - dt)
        ladder = next((l for l in layout.ladders if abs(self.x - l.x) < 27
                       and l.top - 8 <= self.y <= l.bottom + 14), None)
        if vertical and ladder:
            self.climbing = True
        if horizontal or ladder is None:
            self.climbing = False
        if jump and (self.grounded or self.coyote or self.climbing):
            self.vy = -self.JUMP
            self.climbing = False
            self.coyote = 0
        if horizontal:
            self.facing = horizontal
        self.x = max(42, min(layout.width - 42, self.x + horizontal * self.SPEED * dt))
        old_y = self.y
        self.grounded = False
        if self.climbing and ladder:
            self.x = ladder.x
            self.y = max(ladder.top, min(ladder.bottom, self.y + vertical * self.CLIMB * dt))
            self.vy = 0
        else:
            self.vy = min(self.vy + self.GRAVITY * dt, 750)
            self.y += self.vy * dt
            if self.vy >= 0:
                landings = [p.y for p in layout.platforms
                            if p.x - 8 < self.x < p.x + p.width + 8
                            and old_y <= p.y + .1 <= self.y + .1]
                if landings:
                    self.y = min(landings)
                    self.vy = 0
                    self.grounded = True
        if self.y < layout.ceiling + self.HEIGHT:
            self.y = layout.ceiling + self.HEIGHT
            self.vy = max(0, self.vy)
        if self.y > layout.height + 150:
            self.x, self.y, self.vy = 112, layout.floor, 0


class Game:
    def __init__(self, explorer, save_path=None):
        self.explorer = explorer
        self.save_path = save_path
        self.fonts = {s: pygame.font.SysFont("consolas", s) for s in (12, 14, 16, 18, 22, 30, 48)}
        self.title_font = pygame.font.SysFont("bahnschrift", 30, bold=True)
        self.surface = pygame.Surface((WIDTH, HEIGHT))
        self.camera_x = self.camera_y = 0.0
        self.time = 0.0
        self.panel = False
        self.help = False
        self.toast = "A vast place, made from three primes. Follow the light."
        self.toast_time = 6.0
        self.fade = 0.0
        self.load_room()

    def load_room(self, returning=None):
        self.layout = make_layout(self.explorer.current)
        self.accent = self.explorer.fundamentals.accent
        self.player = Player(112, self.layout.floor)
        if returning is not None:
            exit = self.layout.exits[returning]
            self.player = Player(exit.x - (46 if exit.side == "RHS" else 0), exit.feet_y)
            if exit.side == "CEILING":
                self.player.x = exit.x
                self.player.climbing = True
        self.camera_x = max(0, min(self.layout.width - WIDTH, self.player.x - WIDTH * .42))
        self.camera_y = max(0, min(self.layout.height - VIEW_H, self.player.y - VIEW_H * .75))
        self.fade = .32
        self.autosave()

    def autosave(self):
        if self.save_path:
            try:
                self.explorer.save(self.save_path)
            except OSError as error:
                self.toast, self.toast_time = f"Could not save: {error}", 8

    def near_exit(self):
        return next((e for e in self.layout.exits if abs(self.player.x - e.x) < 52
                     and abs(self.player.y - e.feet_y) < 52), None)

    def near_entrance(self):
        return self.player.x < 145 and abs(self.player.y - self.layout.floor) < 56

    def interact(self):
        if self.near_entrance() and self.explorer.path:
            self.go_back()
        elif (exit := self.near_exit()) is not None:
            self.explorer.take(exit.index)
            self.load_room()

    def go_back(self):
        index = self.explorer.back()
        if index is not None:
            self.load_room(returning=index)

    def update(self, dt, horizontal=0, vertical=0, jump=False):
        self.time += dt
        self.toast_time = max(0, self.toast_time - dt)
        self.fade = max(0, self.fade - dt)
        if self.help:
            return
        # Fixed physics is called at 120 Hz by the main loop.
        self.player.move(dt, horizontal, vertical, jump, self.layout)
        target_x = max(0, min(self.layout.width - WIDTH, self.player.x - WIDTH * .42))
        target_y = max(0, min(self.layout.height - VIEW_H, self.player.y - VIEW_H * .75))
        smoothing = 1 - math.exp(-9 * dt)
        self.camera_x += (target_x - self.camera_x) * smoothing
        self.camera_y += (target_y - self.camera_y) * smoothing

    def text(self, text, x, y, size=16, colour=TEXT, center=False):
        rendered = self.fonts[size].render(str(text), True, colour)
        self.surface.blit(rendered, (int(x - rendered.get_width() / 2) if center else int(x), int(y)))

    def point(self, x, y):
        return round(x - self.camera_x), round(y + HUD - self.camera_y)

    def rect(self, colour, x, y, w, h, border=0, radius=0):
        px, py = self.point(x, y)
        pygame.draw.rect(self.surface, colour, (px, py, round(w), round(h)), border, border_radius=radius)

    def line(self, colour, a, b, width=1):
        pygame.draw.line(self.surface, colour, self.point(*a), self.point(*b), width)

    def world_text(self, text, x, y, size=14, colour=TEXT, center=False):
        sx, sy = self.point(x, y)
        self.text(text, sx, sy, size, colour, center)

    def draw_world(self):
        a, layout = self.accent, self.layout
        base = blend(INK, a, .10)
        self.surface.fill(base)
        self.surface.set_clip((0, HUD, WIDTH, VIEW_H))
        # Layered architectural silhouettes drift more slowly than the room.
        for i in range(-1, 12):
            x = i * 205 - (self.camera_x * .23) % 205
            y = HUD + 54 - self.camera_y * .16
            pygame.draw.rect(self.surface, blend(base, a, .045), (x, y, 127, 620), border_radius=55)
            pygame.draw.rect(self.surface, blend(base, a, .12), (x + 14, y + 25, 99, 570), 1, border_radius=44)
        for y in range(layout.ceiling + 50, layout.floor, 55):
            self.line(blend(base, a, .045), (28, y), (layout.width - 28, y))
        # The visit diamond is echoed in the room's large engraved emblem.
        cx, cy = 300, layout.floor - 220
        engraving = blend(base, a, .18)
        for scale in (58, 84, 112):
            points = [self.point(cx, cy - scale), self.point(cx + scale, cy),
                      self.point(cx, cy + scale), self.point(cx - scale, cy)]
            pygame.draw.polygon(self.surface, engraving, points, 1)
        self.world_text(str(sum(self.explorer.current)), cx, cy - 26, 48,
                        blend(base, a, .48), True)
        self.world_text("THE PRIME ARCHIVE", cx, cy + 36, 12, engraving, True)
        self.rect(blend(base, a, .18), 16, layout.ceiling - 15, layout.width - 32, 15)
        self.rect(blend(base, a, .22), 16, layout.ceiling, 12, layout.height)
        self.rect(blend(base, a, .22), layout.width - 28, layout.ceiling, 12, layout.height)
        for x in layout.shafts:
            self.rect(blend(base, INK, .7), x - 44, layout.floor, 88, 175)
            self.line(blend(a, INK, .6), (x - 44, layout.floor), (x - 44, layout.floor + 175), 2)
            self.line(blend(a, INK, .6), (x + 44, layout.floor), (x + 44, layout.floor + 175), 2)
        self.draw_objects()
        for ladder in layout.ladders:
            colour = blend(a, TEXT, .25)
            for dx in (-17, 17):
                self.line(colour, (ladder.x + dx, ladder.top), (ladder.x + dx, ladder.bottom), 3)
            for y in range(int(ladder.top) + 8, int(ladder.bottom), 17):
                self.line(blend(a, TEXT, .1), (ladder.x - 16, y), (ladder.x + 16, y), 2)
        for platform in layout.platforms:
            self.rect(blend(a, INK, .78), platform.x, platform.y, platform.width, 15)
            self.rect(blend(a, TEXT, .08), platform.x, platform.y, platform.width, 3)
            for x in range(int(platform.x) + 12, int(platform.x + platform.width) - 8, 42):
                self.rect(blend(a, INK, .60), x, platform.y + 7, 7, 2)
        self.draw_portal(66, layout.floor, "IN", "PREVIOUS ROOM" if self.explorer.path else "ORIGIN", None)
        opened = self.explorer.opened.get(key(self.explorer.current), set())
        for exit in layout.exits:
            self.draw_portal(exit.x, exit.feet_y, format(exit.index, "X"),
                             f"P{sum(exit.target)} / {key(exit.target)}", exit.index in opened,
                             horizontal=exit.side != "RHS")
        if not layout.exits:
            edge = engine.next_prime(sum(self.explorer.current)) is None
            self.world_text("PRIME TABLE BOUNDARY" if edge else "A QUIET END", layout.width - 280,
                            layout.floor - 120, 22, a, True)
            self.world_text("Return through the left entrance.", layout.width - 280,
                            layout.floor - 85, 14, MUTED, True)
        # Deterministic motes have no physics or gameplay effects.
        for i in range(25):
            x = (i * 197 + 71) % layout.width
            y = layout.ceiling + 60 + ((i * 89) % (layout.floor - layout.ceiling - 85))
            y += math.sin(self.time * .45 + i) * 8
            pygame.draw.circle(self.surface, blend(base, a, .4), self.point(x, y), 1)
        self.draw_player()
        exit = self.near_exit()
        if self.near_entrance() and self.explorer.path:
            self.prompt("E  RETURN TO PREVIOUS VISIT")
        elif exit:
            self.prompt(f"E  ENTER {format(exit.index, 'X')}  /  P{sum(exit.target)}")
        elif any(abs(self.player.x - l.x) < 32 and l.top - 10 <= self.player.y <= l.bottom + 10
                 for l in layout.ladders):
            self.prompt("W / S  CLIMB LADDER")
        self.surface.set_clip(None)

    def draw_objects(self):
        seed = self.explorer.fundamentals.seed
        a = self.accent
        for i in range(max(4, self.layout.width // 200)):
            bits = stable_seed(seed, "object", i)
            x = 205 + i * 175 + bits % 40
            if x > self.layout.width - 500 or any(abs(x - l.x) < 75 for l in self.layout.ladders):
                continue
            y = self.layout.floor
            kind = bits % 3
            c = blend(a, INK, .50)
            if kind == 0:  # specimen lantern
                self.rect(c, x - 23, y - 12, 46, 12, radius=3)
                self.rect(c, x - 2, y - 85, 4, 73)
                self.rect(blend(a, INK, .80), x - 18, y - 110, 36, 29, radius=6)
                self.rect(a, x - 12, y - 103, 24, 15, border=1, radius=3)
                pygame.draw.circle(self.surface, a, self.point(x, y - 96), 4)
            elif kind == 1:  # mineral display
                self.rect(c, x - 35, y - 26, 70, 26, radius=3)
                for j in range(3):
                    h = 30 + (bits >> (j * 5)) % 38
                    xx = x - 19 + j * 19
                    points = [(xx - 7, y - 26), (xx - 9, y - h), (xx, y - h - 16),
                              (xx + 8, y - h), (xx + 6, y - 26)]
                    pygame.draw.polygon(self.surface, blend(a, TEXT, j * .16), [self.point(*p) for p in points])
                    self.line(c, (xx, y - h - 10), (xx + 3, y - 27))
            else:  # archive console
                self.rect(c, x - 36, y - 56, 72, 56, radius=5)
                self.rect(blend(INK, a, .15), x - 29, y - 49, 58, 34, radius=3)
                for j in range(4):
                    self.rect(a, x - 22, y - 43 + j * 7, 9 + (bits >> (j * 4)) % 33, 2)
                self.rect(a, x + 20, y - 10, 5, 3)

    def draw_portal(self, x, y, label, subtitle, opened, horizontal=False):
        a = self.accent if opened is not None else MUTED
        w, h = (78, 60) if horizontal else (66, 92)
        self.rect(blend(a, INK, .68), x - w / 2 - 6, y - h - 6, w + 12, h + 7, radius=8)
        self.rect(blend(a, INK, .92), x - w / 2, y - h, w, h, radius=6)
        self.rect(a, x - w / 2, y - h, w, h, border=2, radius=6)
        self.rect(blend(a, INK, .7), x - w / 2 + 6, y - h + 7, w - 12, h - 14, border=1, radius=4)
        self.world_text(label, x, y - h + 15, 22, TEXT, True)
        self.world_text("OPENED" if opened else ("EXIT" if opened is not None else "LEFT"),
                        x, y - 20, 12, a, True)
        # RHS labels face inwards so the room wall doesn't clip them.
        if not horizontal and opened is not None:
            label_width = self.fonts[12].size(subtitle)[0]
            self.world_text(subtitle, x - w / 2 - label_width - 16, y - h + 13, 12, a)
        else:
            self.world_text(subtitle, x, y - h - 25, 12, a, True)

    def draw_player(self):
        p = self.player
        bob = math.sin(self.time * 9) * 1.1 if p.grounded else 0
        x, y = self.point(p.x, p.y + bob)
        pygame.draw.ellipse(self.surface, (6, 12, 17), (x - 19, y - 3, 38, 7))
        pygame.draw.polygon(self.surface, blend(self.accent, INK, .25),
                            [(x - p.facing * 6, y - 33), (x - p.facing * 20, y - 8), (x, y - 11)])
        pygame.draw.rect(self.surface, TEXT, (x - 9, y - 32, 18, 24), border_radius=5)
        pygame.draw.rect(self.surface, blend(TEXT, INK, .4), (x - 8, y - 10, 6, 10), border_radius=2)
        pygame.draw.rect(self.surface, blend(TEXT, INK, .4), (x + 3, y - 10, 6, 10), border_radius=2)
        pygame.draw.circle(self.surface, TEXT, (x, y - 36), 12)
        pygame.draw.rect(self.surface, INK, (x - 9, y - 40, 18, 8), border_radius=4)
        pygame.draw.rect(self.surface, self.accent, (x + p.facing * 2 - 3, y - 39, 6, 3), border_radius=1)

    def prompt(self, label):
        x, y = self.point(self.player.x, self.player.y - 94)
        width = self.fonts[14].size(label)[0] + 24
        x = max(width / 2 + 12, min(WIDTH - width / 2 - 12, x))
        y = max(HUD + 12, y)
        pygame.draw.rect(self.surface, INK, (x - width / 2, y, width, 29), border_radius=4)
        self.text(label, x, y + 6, 14, TEXT, True)

    def draw_hud(self):
        a, s = self.accent, self.explorer
        pygame.draw.rect(self.surface, INK, (0, 0, WIDTH, HUD))
        pygame.draw.rect(self.surface, a, (26, 26, 4, 41))
        self.surface.blit(self.title_font.render("THE BETWEEN", True, TEXT), (43, 21))
        self.text("P R I M E   L A B Y R I N T H", 44, 59, 12, MUTED)
        self.text(f"P{sum(s.current)}", 368, 20, 30, a)
        self.text(" / ".join(map(str, s.current)), 369, 58, 16, TEXT)
        self.text(f"{len(self.layout.exits):02} EXITS", 632, 27, 18, TEXT)
        self.text(f"{len(s.discovered):,} ROOMS FOUND", 632, 57, 12, MUTED)
        self.text(f"DEPTH {len(s.path):03}", 820, 27, 18, TEXT)
        self.text("BACKROOMS OFF", 820, 57, 12, MUTED)
        self.text("TAB  FUNDAMENTALS", 1031, 27, 14, a)
        self.text("H  FIELD GUIDE", 1031, 57, 12, MUTED)
        self.text("VISIT", 27, 91, 12, a)
        address = s.address
        if len(address) > 140:
            address = address[:12] + " ... " + address[-120:]
        self.text(address, 83, 91, 12, MUTED)
        pygame.draw.line(self.surface, blend(a, INK, .65), (26, HUD - 1), (WIDTH - 26, HUD - 1))
        y = HEIGHT - FOOTER
        pygame.draw.rect(self.surface, INK, (0, y, WIDTH, FOOTER))
        # A compact plan shows every exit even when it is offscreen.
        rail_x, rail_w = 31, 410
        pygame.draw.rect(self.surface, blend(a, INK, .88), (rail_x, y + 21, rail_w, 28), border_radius=3)
        for exit in self.layout.exits:
            ex = rail_x + (exit.x / self.layout.width) * rail_w
            ey = y + (23 if exit.side == "CEILING" else 46 if exit.side == "FLOOR" else 34)
            pygame.draw.circle(self.surface, a, (int(ex), ey), 3)
        px = rail_x + self.player.x / self.layout.width * rail_w
        pygame.draw.circle(self.surface, TEXT, (int(px), y + 35), 4)
        self.text("ROOM PLAN", 31, y + 57, 12, MUTED)
        self.text("A / D   MOVE     SPACE   JUMP     W / S   CLIMB", 475, y + 20, 14)
        self.text("E   USE EXIT     R   RETURN TO ENTRANCE     ESC   SAVE & QUIT", 475, y + 48, 12, MUTED)
        if self.toast_time:
            width = self.fonts[14].size(self.toast)[0] + 30
            pygame.draw.rect(self.surface, INK, (28, HUD + 18, min(width, WIDTH - 56), 34), border_radius=4)
            self.text(self.toast, 43, HUD + 27, 14, a)

    def draw_fundamentals(self):
        s = self.explorer
        box = pygame.Rect(WIDTH - 325, HUD + 18, 295, 342)
        pygame.draw.rect(self.surface, INK, box, border_radius=8)
        pygame.draw.rect(self.surface, blend(self.accent, INK, .4), box, 1, border_radius=8)
        self.text("ROOM FUNDAMENTALS", box.x + 20, box.y + 20, 16, self.accent)
        self.text("CURRENT / ENTRANCE", box.x + 20, box.y + 48, 12, MUTED)
        for i, row in enumerate(s.fundamentals.rows):
            self.text("   ".join(map(str, row)), box.centerx, box.y + 84 + i * 29, 18,
                      TEXT if i in (2, 3) else self.accent, True)
        if s.entrance is None:
            self.text("ORIGIN: NO PREVIOUS ROOM", box.centerx, box.y + 203, 12, MUTED, True)
        self.text("COLOUR  #%02X%02X%02X" % self.accent, box.x + 20, box.y + 278, 14, self.accent)
        self.text("Same diamond. Same atmosphere.", box.x + 20, box.y + 308, 12, MUTED)

    def draw_help(self):
        veil = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        veil.fill((3, 9, 13, 215))
        self.surface.blit(veil, (0, 0))
        pygame.draw.rect(self.surface, INK, (265, 170, 750, 455), border_radius=12)
        self.text("FIELD GUIDE", 305, 204, 30, self.accent)
        lines = ["A / D or LEFT / RIGHT     Walk through the room",
                 "SPACE                    Jump onto the galleries",
                 "W / S or UP / DOWN       Climb a nearby ladder",
                 "E                        Enter a nearby exit",
                 "R                        Recall to this room's left entrance",
                 "TAB                      Inspect the prime-key diamond",
                 "ESC                      Save your journey and quit", "",
                 "Exit order: right, floor, ceiling ... repeat.",
                 "The left entrance takes you back along your own path.",
                 "No damage, no timer. Every door can be reached.",
                 "Your route and opened doors are saved automatically."]
        for i, line in enumerate(lines):
            self.text(line, 305, 265 + i * 23, 14, TEXT if i < 7 else MUTED)
        self.text("H  RESUME EXPLORING", 640, 579, 16, self.accent, True)

    def render(self):
        self.draw_world()
        if self.fade:
            veil = pygame.Surface((WIDTH, VIEW_H), pygame.SRCALPHA)
            veil.fill((*INK, int(140 * self.fade / .32)))
            self.surface.blit(veil, (0, HUD))
        self.draw_hud()
        if self.panel:
            self.draw_fundamentals()
        if self.help:
            self.draw_help()
        return self.surface


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--save", type=Path, default=ROOT / "saves" / "side-scroller.json")
    parser.add_argument("--new", action="store_true", help="Start afresh without loading the existing save")
    parser.add_argument("--start", default="2,2,3", help="Sorted starting triplet for a new journey")
    parser.add_argument("--screenshot", type=Path, help="Render one frame headlessly, without changing the save")
    parser.add_argument("--steps", default="", help="Forward zero-based hex route for screenshot previews")
    parser.add_argument("--panel", action="store_true", help="Show fundamentals on startup")
    args = parser.parse_args()
    if args.screenshot:
        os.environ["SDL_VIDEODRIVER"] = "dummy"
        os.environ["SDL_AUDIODRIVER"] = "dummy"
    pygame.init()
    try:
        explorer = Explorer(tuple(map(int, args.start.split(","))))
        if args.save.exists() and not args.new and not args.screenshot:
            try:
                explorer = Explorer.load(args.save)
            except (OSError, ValueError, KeyError, TypeError) as error:
                raise SystemExit(f"Could not load {args.save}: {error}. Use a different --save path for a new game.")
        for char in args.steps:
            if not explorer.take(int(char, 16)):
                raise SystemExit(f"Preview route hits an invalid exit: {char}")
        game = Game(explorer, None if args.screenshot else args.save)
        game.panel = args.panel
        if args.screenshot:
            game.fade = 0
            game.toast_time = 0
            args.screenshot.parent.mkdir(parents=True, exist_ok=True)
            pygame.image.save(game.render(), args.screenshot)
            return
        window = pygame.display.set_mode((WIDTH, HEIGHT), pygame.RESIZABLE)
        pygame.display.set_caption("The Between | Prime Labyrinth")
        clock = pygame.time.Clock()
        accumulator, running, jump_queued = 0.0, True, False
        while running:
            dt = min(clock.tick(60) / 1000, .1)
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False
                elif event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_ESCAPE:
                        running = False
                    elif event.key == pygame.K_h:
                        game.help = not game.help
                    elif event.key == pygame.K_TAB:
                        game.panel = not game.panel
                    elif not game.help:
                        if event.key == pygame.K_SPACE:
                            jump_queued = True
                        elif event.key == pygame.K_e:
                            game.interact()
                        elif event.key == pygame.K_r:
                            game.player = Player(112, game.layout.floor)
            keys = pygame.key.get_pressed()
            dx = int(keys[pygame.K_d] or keys[pygame.K_RIGHT]) - int(keys[pygame.K_a] or keys[pygame.K_LEFT])
            dy = int(keys[pygame.K_s] or keys[pygame.K_DOWN]) - int(keys[pygame.K_w] or keys[pygame.K_UP])
            accumulator += dt
            while accumulator >= 1 / 120:
                game.update(1 / 120, dx, dy, jump_queued)
                jump_queued = False
                accumulator -= 1 / 120
            frame = game.render()
            scale = min(window.get_width() / WIDTH, window.get_height() / HEIGHT)
            size = (max(1, round(WIDTH * scale)), max(1, round(HEIGHT * scale)))
            window.fill(INK)
            window.blit(pygame.transform.smoothscale(frame, size),
                        ((window.get_width() - size[0]) // 2, (window.get_height() - size[1]) // 2))
            pygame.display.flip()
        game.autosave()
    finally:
        pygame.quit()


if __name__ == "__main__":
    main()
