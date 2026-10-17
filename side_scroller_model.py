"""Deterministic room geometry and visit state; no graphics dependencies."""
from __future__ import annotations

import colorsys
import hashlib
import json
import math
import os
from dataclasses import dataclass
from pathlib import Path

import labyrinth_engine as engine

VERSION = 1
START = (2, 2, 3)


def stable_seed(*values) -> int:
    raw = json.dumps(values, separators=(",", ":")).encode("utf-8")
    return int.from_bytes(hashlib.sha256(raw).digest()[:8], "big")


def key(room) -> str:
    return ",".join(map(str, room))


def targets(room):
    nxt = engine.next_prime(sum(room))
    return engine.doors_out_of(room, nxt) if nxt is not None else []


def half_diamond(room):
    a, b, c = room
    differences = (abs(b - a), abs(c - b))
    return (abs(differences[1] - differences[0]), differences, tuple(room))


@dataclass(frozen=True)
class Fundamentals:
    room: tuple
    entrance: tuple | None

    @property
    def rows(self):
        apex, differences, room = half_diamond(self.room)
        top = ((apex,), differences, room)
        if self.entrance is None:
            return top  # The lobby has no invented previous room.
        apex, differences, room = half_diamond(self.entrance)
        return top + (room, differences, (apex,))

    @property
    def seed(self):
        return stable_seed("prime-room-fundamentals", VERSION, self.rows)

    @property
    def accent(self):
        # Stable, evenly distributed hue from the complete diamond.
        hue = (self.seed % 3600) / 3600
        return tuple(round(c * 255) for c in colorsys.hsv_to_rgb(hue, .47, .90))


@dataclass(frozen=True)
class Platform:
    x: float
    y: float
    width: float


@dataclass(frozen=True)
class Ladder:
    x: float
    top: float
    bottom: float


@dataclass(frozen=True)
class Exit:
    index: int
    side: str
    x: float
    feet_y: float
    target: tuple


@dataclass(frozen=True)
class Layout:
    width: int
    height: int
    floor: int
    ceiling: int
    platforms: tuple
    ladders: tuple
    exits: tuple
    shafts: tuple


def make_layout(room, door_targets=None) -> Layout:
    """Canonical topology: R,F,C,R,F,C...; entrance is always on the left.

    Floor slots are real holes with ladders, exit pads and a catch floor.
    RHS galleries have a 60-unit jump staircase. Ceiling ladders extend
    directly from the main floor to the exit; objects never obstruct travel.
    """
    door_targets = targets(room) if door_targets is None else door_targets
    n = len(door_targets)
    right_count = math.ceil(n / 3)
    width = max(1680, 1060 + math.ceil(n / 3) * 440)
    ceiling = 90
    floor = max(540, 190 + max(0, right_count - 1) * 120)
    shafts, ladders, exits, platforms = [], [], [], []
    for i, target in enumerate(door_targets):
        side, rank = ("RHS", "FLOOR", "CEILING")[i % 3], i // 3
        if side == "RHS":
            x, y = width - 66, floor - rank * 120
        elif side == "FLOOR":
            x, y = 440 + rank * 400, floor + 125
            shafts.append(x)
            ladders.append(Ladder(x, floor - 30, y))
            platforms.append(Platform(x - 60, y, 120))
        else:
            x, y = 640 + rank * 400, ceiling + 62
            ladders.append(Ladder(x, y, floor))
        exits.append(Exit(i, side, x, y, tuple(target)))

    left = 28
    for x in shafts:
        platforms.append(Platform(left, floor, x - 44 - left))
        left = x + 44
    platforms.append(Platform(left, floor, width - 28 - left))
    # Short alternating shelves lead to each right-hand gallery.
    for tier in range(1, max(0, right_count - 1) * 2 + 1):
        x = width - 445 if tier % 2 else width - 310
        platforms.append(Platform(x, floor - tier * 60, width - 28 - x))
    platforms.append(Platform(28, floor + 176, width - 56))
    return Layout(width, floor + 200, floor, ceiling, tuple(platforms),
                  tuple(ladders), tuple(exits), tuple(shafts))


class Explorer:
    """A path identifies a visit; triplets share their opened-door state.

    Diamond appearance uses (current room, entrance room). Different full
    paths remain distinct addresses even when their last two rooms match.
    """
    def __init__(self, origin=START):
        origin = tuple(origin)
        if (len(origin) != 3 or origin != tuple(sorted(origin))
                or any(p not in engine.PRIME_SET for p in origin)
                or sum(origin) not in engine.PRIME_SET):
            raise ValueError("Start must be three sorted primes with a known prime sum")
        self.origin = origin
        self.path = []
        self.rooms = [origin]
        self.opened = {}
        self.discovered = {origin}

    @property
    def current(self):
        return self.rooms[-1]

    @property
    def entrance(self):
        return self.rooms[-2] if len(self.rooms) > 1 else None

    @property
    def fundamentals(self):
        return Fundamentals(self.current, self.entrance)

    @property
    def address(self):
        code = "".join(format(i, "X") if i < 16 else f"[{i:X}]" for i in self.path)
        return f"{key(self.origin)}:{code or 'ROOT'}"

    def take(self, index):
        doors = targets(self.current)
        if not 0 <= index < len(doors):
            return False
        self.opened.setdefault(key(self.current), set()).add(index)
        self.path.append(index)
        self.rooms.append(doors[index])
        self.discovered.add(self.current)
        return True

    def back(self):
        if not self.path:
            return None
        door = self.path.pop()
        self.rooms.pop()
        return door

    def save(self, path: Path):
        data = {"version": VERSION, "origin": self.origin, "path": self.path,
                "opened": {k: sorted(v) for k, v in self.opened.items()},
                "discovered": sorted(self.discovered)}
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        os.replace(temporary, path)

    @classmethod
    def load(cls, path: Path):
        data = json.loads(path.read_text(encoding="utf-8"))
        if data["version"] != VERSION:
            raise ValueError("Unsupported save version")
        result = cls(data["origin"])
        for index in data["path"]:
            if type(index) is not int or not result.take(index):
                raise ValueError("Invalid saved route")
        for name, indices in data["opened"].items():
            room = cls(tuple(map(int, name.split(",")))).origin
            count = len(targets(room))
            if any(type(i) is not int or not 0 <= i < count for i in indices):
                raise ValueError("Invalid saved doors")
            result.opened.setdefault(key(room), set()).update(indices)
        for room in data["discovered"]:
            result.discovered.add(cls(room).origin)
        return result
