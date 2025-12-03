# -----------------------------------------
#  Prime Labyrinth probe for Android / CLI
#  Compact row signature + ! full mode
#  Ranges: 7-19 and 7-19!
#  In full mode, rooms reachable from the previous row are marked with *
# -----------------------------------------

from itertools import combinations

# ---------- PRIME ENGINE ----------

def primes_up_to(n: int):
    if n < 2:
        return []
    sieve = [True] * (n + 1)
    sieve[0:2] = [False, False]
    p = 2
    while p * p <= n:
        if sieve[p]:
            for k in range(p * p, n + 1, p):
                sieve[k] = False
        p += 1
    return [i for i in range(n + 1) if sieve[i]]

MAX_N = 2000
PRIMES = primes_up_to(MAX_N)
PRIME_SET = set(PRIMES)
PRIME_INDEX = {p: i for i, p in enumerate(PRIMES)}

def next_prime(p: int):
    idx = PRIME_INDEX[p]
    if idx + 1 >= len(PRIMES):
        return None
    return PRIMES[idx + 1]

def prev_prime(p: int):
    if p == 2:
        return 2
    idx = PRIME_INDEX[p]
    return PRIMES[idx - 1]

# ---------- LABYRINTH RULES ----------

def neighbours(p: int):
    vals = [prev_prime(p), p]
    nxt = next_prime(p)
    if nxt is not None:
        vals.append(nxt)
    return vals

def doors_out_of(hset, target_prime: int):
    a, b, c = hset
    doors = set()
    for aa in neighbours(a):
        for bb in neighbours(b):
            for cc in neighbours(c):
                if aa + bb + cc == target_prime:
                    doors.add(tuple(sorted((aa, bb, cc))))
    return sorted(doors)

# ---------- ROW BUILDING ----------

def build_row(p: int):
    """
    Returns: (row, nxt)
    row is a list of (h, doors), nxt is the next prime.
    """
    nxt = next_prime(p)
    if nxt is None:
        return [], None

    row = []
    for i, a in enumerate(PRIMES):
        if a > p:
            break
        for j in range(i, len(PRIMES)):
            b = PRIMES[j]
            if a + b > p:
                break
            c = p - a - b
            if c < b:
                break
            if c in PRIME_SET:
                h = (a, b, c)
                ds = doors_out_of(h, nxt)
                row.append((h, ds))
    return row, nxt

# ---------- COMPACT SIGNATURE ----------

def print_compact_prime(p: int):
    if p not in PRIME_SET:
        print(f"{p}: not a known prime.\n")
        return

    row, nxt = build_row(p)
    if nxt is None:
        print(f"{p}: no next prime found (table limit).\n")
        return

    counts = [len(ds) for (_, ds) in row if ds]

    if not counts:
        print(f"( {p} )  -- no doors out")
    else:
        sig = f"( {p} ) " + "".join(f"({k})" for k in counts)
        print(sig)

# ---------- FULL OUTPUT HELPERS ----------

def print_full_row(p: int, row, nxt, reachable_current=None):
    """
    reachable_current is a set of rooms (h-sets) that are
    reachable from the previous prime or previous row.
    Those are marked with *.
    """
    if reachable_current is None:
        reachable_current = set()

    print(f"\n--- Full scan for h(p) where p = {p} → {nxt} ---\n")

    any_doors = False
    for h, ds in row:
        if ds:
            any_doors = True
            mark = "*" if h in reachable_current else ""
            print(f"h={h}{mark} -> {len(ds)} doors -> {ds}")

    if not any_doors:
        print("No doors out in this row.")

    print("\n--------------------------------------\n")

def full_single_with_prev(p: int):
    """
    Full mode for a single prime:
    highlights rooms that are reachable from the previous prime.
    """
    if p not in PRIME_SET:
        print(f"{p}: not a known prime.\n")
        return

    idx = PRIME_INDEX[p]
    if idx == 0:
        reachable_current = set()
    else:
        prev_p = PRIMES[idx - 1]
        prev_row, _ = build_row(prev_p)
        reachable_current = set()
        for h_prev, ds in prev_row:
            for d in ds:
                reachable_current.add(d)

    row, nxt = build_row(p)
    if nxt is None:
        print(f"{p}: no next prime found (table limit).\n")
        return

    print_full_row(p, row, nxt, reachable_current)

def print_range_full(primes_in_range):
    """
    Full mode for a range:
    for each row, rooms that have incoming doors from
    the previous row in the range are marked with *.
    """
    reachable_current = set()

    for p in primes_in_range:
        row, nxt = build_row(p)
        if nxt is None:
            print(f"{p}: no next prime found (table limit).\n")
            continue

        print_full_row(p, row, nxt, reachable_current)

        # compute which rooms are reachable in the next prime
        reachable_next = set()
        for h, ds in row:
            for d in ds:
                reachable_next.add(d)
        reachable_current = reachable_next

# ---------- INTERACTIVE SHELL ----------

def main():
    print("\n=== Prime Labyrinth Engine ===")
    print("Default: compact row signature like  ( 19 ) (2)(3)(1)")
    print("Add '!' at the END for full details (e.g. 19!).")
    print("Use ranges like 7-23 or 7-23!.")
    print("In full mode, rooms reachable from the previous row are marked with *.")
    print("Type 'exit' to quit.\n")

    while True:
        cmd = input("Enter prime or range: ").strip()

        if cmd.lower() == "exit":
            print("Goodbye.")
            break

        if not cmd:
            continue

        # ---- detect ! only at the END ----
        full_mode = False
        if "!" in cmd:
            if not cmd.strip().endswith("!"):
                print("Unknown value or range (use 19! or 7-23!).\n")
                continue
            full_mode = True
            cmd = cmd.strip()[:-1].strip()   # remove final '!'

        # ---- remove spaces ----
        cmd_clean = cmd.replace(" ", "")

        # ---- RANGE MODE ----
        if "-" in cmd_clean:
            parts = cmd_clean.split("-")
            if len(parts) != 2:
                print("Bad range. Use 7-19 or 7-19!.\n")
                continue
            try:
                start = int(parts[0])
                end = int(parts[1])
            except ValueError:
                print("Bad range. Use numbers only.\n")
                continue

            if start > end:
                start, end = end, start

            primes_in_range = [p for p in PRIMES if start <= p <= end]

            if not primes_in_range:
                print("No known primes in that range.\n")
                continue

            if not full_mode:
                for p in primes_in_range:
                    print_compact_prime(p)
                print()
            else:
                print_range_full(primes_in_range)
            continue

        # ---- SINGLE PRIME ----
        try:
            p = int(cmd_clean)
        except ValueError:
            print("Unknown value or range.\n")
            continue

        if not full_mode:
            print_compact_prime(p)
        else:
            full_single_with_prev(p)

if __name__ == "__main__":
    main()
