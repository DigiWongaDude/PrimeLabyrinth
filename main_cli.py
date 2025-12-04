"""
Prime Labyrinth launcher.
Provides a simple splash screen and menu to reach existing modules.
"""

import time

import pygame

import labyrinth_adventure
import labyrinth_engine


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


def show_menu() -> None:
    print("Main Menu")
    print("  1) Start ASCII adventure")
    print("  2) Prime probe (engine CLI)")
    print("  Q) Quit")


def main() -> None:
    show_splash()

    while True:
        show_menu()
        choice = input("Select an option: ").strip().lower()
        print()

        if choice == "1":
            print("Launching ASCII adventure...\n")
            try:
                labyrinth_adventure.main()
            except pygame.error:
                print(
                    "Visual adventure is not available on this device. "
                    "Pygame could not open a window.\n"
                )
            else:
                print("\nReturned to launcher.\n")
        elif choice == "2":
            print("Opening prime probe...\n")
            labyrinth_engine.main()
            print("\nReturned to launcher.\n")
        elif choice == "q":
            print("Goodbye!")
            break
        else:
            print("Invalid choice. Please select 1, 2, or Q.\n")


if __name__ == "__main__":
    main()
