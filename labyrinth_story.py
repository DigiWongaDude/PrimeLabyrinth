# labyrinth_story.py
# Storyboard + room signature generator for Prime Labyrinth

from dataclasses import dataclass
from typing import Optional, Tuple
import labyrinth_engine as le


# ------------------- SIGNATURE -------------------

@dataclass
class RoomSignature:
    p: int
    h: Tuple[int, int, int]
    prev_h: Optional[Tuple[int, int, int]]
    total: int
    spread: int
    mod9: int
    apex: int
    parity_code: str


def _simple_apex(a: int, b: int, c: int) -> int:
    d1 = abs(a - b)
    d2 = abs(b - c)
    d3 = abs(c - a)
    return (d1 + d2 + d3) % 10


def build_signature(p: int,
                    h: Tuple[int, int, int],
                    prev_h: Optional[Tuple[int, int, int]] = None) -> RoomSignature:
    a, b, c = h
    total = a + b + c
    spread = max(h) - min(h)
    mod9 = total % 9
    apex = _simple_apex(a, b, c)
    parity_code = "".join("1" if x % 2 else "0" for x in h)

    return RoomSignature(
        p=p,
        h=h,
        prev_h=prev_h,
        total=total,
        spread=spread,
        mod9=mod9,
        apex=apex,
        parity_code=parity_code,
    )


# ------------------- PARAMETER MAPPING -------------------

def map_signature(sig: RoomSignature, step_index: int) -> dict:
    # Room scale from spread
    if sig.spread <= 4:
        room_scale = "small, intimate booth"
    elif sig.spread <= 10:
        room_scale = "medium-sized room"
    else:
        room_scale = "wide, echoing space"

    # Mood from mod9
    moods = [
        "calm but uneasy",
        "nostalgic",
        "hopeful",
        "paranoid",
        "urgent",
        "resentful",
        "resigned",
        "electric, on edge",
        "quietly dangerous",
    ]
    mood = moods[sig.mod9]

    # Lighting from parity pattern
    parity_map = {
        "000": "soft even lighting, no harsh contrast",
        "111": "hard contrast, deep shadows",
        "001": "warm foreground, cool background",
        "010": "cool overhead light with warm side spill",
        "100": "single warm key light with murky surroundings",
    }
    lighting = parity_map.get(sig.parity_code,
                              "mixed neon reflections in warm and cold tones")

    # Camera feeling from apex
    if sig.apex <= 2:
        camera = "static medium shot"
    elif sig.apex <= 5:
        camera = "slow creeping zoom"
    else:
        camera = "handheld close-up with slight shake"

    return {
        "room_scale": room_scale,
        "mood": mood,
        "lighting": lighting,
        "camera": camera,
        "step": step_index,
    }


# ------------------- TEXT STORYBOARD -------------------

def print_storyboard(sig: RoomSignature,
                     params: dict,
                     spoken_line: Optional[str] = None) -> None:

    title = f"P{sig.p}  room {sig.h}"
    style = f"Scene mood: {params['mood']}"

    base_line = spoken_line or "We shouldn't be here."

    print()
    print(f"Scene Title: {title}")
    print(f"Style: {style}")
    print(f"Setting: {params['room_scale']}, {params['lighting']}")
    print()

    # Shot 1
    print("Shot 1 (0.0–3.3s)")
    print(f"  Audio: {base_line}")
    print("  Visual: Wide view of the room, characters between doors.")
    print(f"  Camera: {params['camera']}")
    print()

    # Shot 2
    print("Shot 2 (3.3–6.6s)")
    print("  Audio: A breath, a half-reply.")
    print("  Visual: Close on listener’s face, door-light flickering.")
    print("  Camera: Slow push-in.")
    print()

    # Shot 3
    print("Shot 3 (6.6–10.0s)")
    print('  Audio: "Pick a door, or we stay here forever."')
    print("  Visual: Hand hovering between two handles.")
    print("  Camera: Small, nervous motion.")
    print()


if __name__ == "__main__":
    signature = build_signature(p=7, h=(2, 2, 3))
    mapped_params = map_signature(signature, step_index=1)
    print_storyboard(signature, mapped_params,
                     spoken_line="We really shouldn't be here.")
