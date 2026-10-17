"""Deterministic, graphics-free layout for the isometric explorer."""
from __future__ import annotations

from dataclasses import dataclass

from side_scroller_model import stable_seed, targets

ROOM_SIZE = 12.0


@dataclass(frozen=True)
class IsoDoor:
    index: int
    wall: str
    position: float
    level: int
    target: tuple[int, int, int]

    @property
    def approach(self) -> tuple[float, float]:
        """A reachable floor position directly in front of this door."""
        if self.wall == "NORTH":
            return self.position, 0.8
        if self.wall == "WEST":
            return 0.8, self.position
        return ROOM_SIZE - 0.8, self.position


def make_doors(room, door_targets=None) -> tuple[IsoDoor, ...]:
    """Spread exits over north, west and east walls, deterministically.

    A wall gets up to four ground-level doors. Further exits continue on
    on an upper ledge. A lift rune at every approach point makes each ledge
    reachable in the exploration prototype.
    """
    door_targets = targets(room) if door_targets is None else door_targets
    offset = stable_seed("iso-wall-order", tuple(room)) % 3
    walls = ("NORTH", "WEST", "EAST")
    assignments = [walls[(index + offset) % 3]
                   for index in range(len(door_targets))]
    totals = {wall: assignments.count(wall) for wall in walls}
    counts = {wall: 0 for wall in walls}
    doors = []
    for index, (target, wall) in enumerate(zip(door_targets, assignments)):
        rank = counts[wall]
        counts[wall] += 1
        level = rank // 4
        # Every threshold has its own floor coordinate, even when its portal
        # is raised to another ledge, so stacked doors remain selectable.
        position = ROOM_SIZE * (rank + 1) / (totals[wall] + 1)
        doors.append(IsoDoor(index, wall, position, level, tuple(target)))
    return tuple(doors)


def nearest_door(doors, x: float, y: float, distance: float = 1.25):
    candidates = []
    for door in doors:
        dx, dy = door.approach[0] - x, door.approach[1] - y
        squared = dx * dx + dy * dy
        if squared <= distance * distance:
            candidates.append((squared, door.index, door))
    return min(candidates)[2] if candidates else None
