"""
Prime Labyrinth visual launcher.
Shows the splash screen, then starts the visual adventure.
"""

import time

import labyrinth_adventure


SPLASH_LINES = [
    "==============================",
    "    Prime Labyrinth Launcher",
    "------------------------------",
    "   Navigate the maze of primes",
    "==============================",
]


def show_splash() -> None:
    for line in SPLASH_LINES:
        print(line)
        time.sleep(0.15)
    print("Loading modules...\n")
    time.sleep(0.3)


def main() -> None:
    show_splash()
    labyrinth_adventure.main()


if __name__ == "__main__":
    main()
