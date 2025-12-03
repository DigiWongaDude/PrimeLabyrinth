# labyrinth_text.py
# Text templates / elevator voice for Prime Labyrinth adventure


def room_summary(total: int, open_count: int, closed_count: int):
    """
    Return a list of lines describing the room's door counts.
    """
    if total == 0:
        return ["This room has no doors. Dead end."]

    if total == 1:
        return [
            f"This room has 1 door: {open_count} open, {closed_count} closed."
        ]

    return [
        f"This room has {total} doors: {open_count} open, {closed_count} closed."
    ]

def ascii_front_doors(doors, opened):
    """
    Simple ASCII row of doors in front of you.
    Closed doors: [1] [2] [3]
    Open doors  : [*] marker
    """
    if not doors:
        return ["No doors ahead."]

    top = []
    mid = []
    bot = []

    for i, flag in enumerate(opened, start=1):
        label = "*" if flag else str(i)
        top.append("┌───┐")
        mid.append(f"│{label:^3}│")
        bot.append("└───┘")

    return [
        " ".join(top),
        " ".join(mid),
        " ".join(bot),
    ]
    

def choice_block(total: int, closed_indices: list[int]):
    """
    Return a list of lines describing the available choices.
    """
    lines: list[str] = []

    if total == 0:
        lines.append("There are no doors to take from here.")
        return lines

    if closed_indices:
        if len(closed_indices) == 1:
            k = closed_indices[0]
            lines.append("There is only one way forward from here.")
            lines.append(f"Please take door {k}.")
        else:
            if len(closed_indices) == 2:
                doors_list = f"{closed_indices[0]} and {closed_indices[1]}"
            else:
                names = ", ".join(str(i) for i in closed_indices[:-1])
                last_name = str(closed_indices[-1])
                doors_list = f"{names} and {last_name}"
            lines.append(
                f"There are {len(closed_indices)} closed doors remaining: "
                f"{doors_list}."
            )
            lines.append("You may type any of these numbers to choose a door.")
    else:
        lines.append("All doors in this room have already been opened.")

    return lines
