# 2D river-delta view of the Prime Labyrinth (world graph, not visit graph)

import sys
from collections import defaultdict

import pygame

import labyrinth_engine as le
import labyrinth_search as ls


# ------------- CONFIG -------------

WINDOW_WIDTH = 1280
WINDOW_HEIGHT = 720

BG_COLOR = (5, 8, 16)
NODE_COLOR = (90, 190, 255)
NODE_OUTLINE = (10, 20, 40)
EDGE_COLOR = (60, 90, 140)
START_NODE_COLOR = (255, 210, 80)

NODE_RADIUS = 4
LAYER_V_GAP = 80       # vertical gap between prime rows
NODE_H_GAP = 24        # horizontal spacing between nodes in a row

MAX_PRIME = 59         # safe prototype limit; we can raise this later


# ------------- GRAPH BUILDING -------------

def primes_for_delta(max_prime: int) -> list[int]:
    """All primes from the canonical start up to max_prime."""
    start_p = ls.DEFAULT_START_P
    return [p for p in le.PRIMES if start_p <= p <= max_prime]


def build_world_graph(max_prime: int):
    """
    Build world graph of rooms.

    Returns:
      nodes: dict[(p,h)] -> {"p": int, "h": tuple, "layer": int}
      edges: list[((p,h), (p2,h2))]
    """
    nodes: dict[tuple[int, tuple[int, int, int]], dict] = {}
    edges: list[tuple[tuple[int, tuple[int, int, int]], tuple[int, tuple[int, int, int]]]] = []

    primes = primes_for_delta(max_prime)

    # Map prime -> layer index
    layer_for_prime = {p: i for i, p in enumerate(primes)}

    for p in primes:
        layer = layer_for_prime[p]
        row, nxt = le.build_row(p)   # row: list[(h, doors)]

        # Ensure all rooms for this prime exist as nodes
        for h, doors in row:
            key = (p, h)
            if key not in nodes:
                nodes[key] = {"p": p, "h": h, "layer": layer}

        # Edges to next prime
        if nxt is None or nxt > max_prime:
            continue

        for h, doors in row:
            src_key = (p, h)
            for target_h in doors:
                dst_key = (nxt, target_h)
                edges.append((src_key, dst_key))

                # Make sure the destination node exists as a node too
                if dst_key not in nodes:
                    nodes[dst_key] = {
                        "p": nxt,
                        "h": target_h,
                        "layer": layer_for_prime[nxt],
                    }

    return nodes, edges, primes


# ------------- LAYOUT -------------

def compute_positions(nodes: dict, width: int, height: int):
    """
    Assign (x,y) positions to each node so that:
      - each prime row is a horizontal band
      - rooms within a row are spaced evenly
    """
    # Collect keys per layer
    by_layer: dict[int, list[tuple[int, tuple[int, int, int]]]] = defaultdict(list)
    for key, meta in nodes.items():
        by_layer[meta["layer"]].append(key)

    positions: dict[tuple[int, tuple[int, int, int]], tuple[float, float]] = {}

    for layer, keys in by_layer.items():
        # Sort for stability by h-set
        keys.sort(key=lambda k: k[1])

        n = len(keys)
        if n == 0:
            continue

        total_width = (n - 1) * NODE_H_GAP
        start_x = width / 2 - total_width / 2

        y = 80 + layer * LAYER_V_GAP

        for i, key in enumerate(keys):
            x = start_x + i * NODE_H_GAP
            positions[key] = (x, y)

    return positions


# ------------- VIEWER -------------

def world_to_screen(pos, offset, zoom):
    x, y = pos
    ox, oy = offset
    sx = int((x + ox) * zoom)
    sy = int((y + oy) * zoom)
    return sx, sy


def draw_delta(screen, nodes, edges, positions, offset, zoom):
    screen.fill(BG_COLOR)

    # Draw edges first
    for src_key, dst_key in edges:
        if src_key not in positions or dst_key not in positions:
            continue
        x1, y1 = world_to_screen(positions[src_key], offset, zoom)
        x2, y2 = world_to_screen(positions[dst_key], offset, zoom)
        pygame.draw.line(screen, EDGE_COLOR, (x1, y1), (x2, y2), 1)

    # Draw nodes
    for key, meta in nodes.items():
        p, h = key
        x, y = world_to_screen(positions[key], offset, zoom)

        # Highlight the canonical start room
        if p == ls.DEFAULT_START_P and h == ls.DEFAULT_START_H:
            color = START_NODE_COLOR
            radius = NODE_RADIUS + 2
        else:
            color = NODE_COLOR
            radius = NODE_RADIUS

        pygame.draw.circle(screen, color, (x, y), radius)
        pygame.draw.circle(screen, NODE_OUTLINE, (x, y), radius, 1)

    pygame.display.flip()


def delta_view(max_prime: int = MAX_PRIME):
    pygame.init()
    screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
    pygame.display.set_caption("Prime Labyrinth - River Delta map")

    clock = pygame.time.Clock()

    nodes, edges, primes = build_world_graph(max_prime)
    positions = compute_positions(nodes, WINDOW_WIDTH, WINDOW_HEIGHT)

    # Camera
    offset = (0.0, 0.0)
    zoom = 1.0

    running = True
    while running:
        clock.tick(60)

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key in (pygame.K_ESCAPE, pygame.K_q):
                    running = False
                elif event.key == pygame.K_LEFT:
                    offset = (offset[0] + 20 / zoom, offset[1])
                elif event.key == pygame.K_RIGHT:
                    offset = (offset[0] - 20 / zoom, offset[1])
                elif event.key == pygame.K_UP:
                    offset = (offset[0], offset[1] + 20 / zoom)
                elif event.key == pygame.K_DOWN:
                    offset = (offset[0], offset[1] - 20 / zoom)
                elif event.key in (pygame.K_EQUALS, pygame.K_PLUS):
                    zoom *= 1.1
                elif event.key in (pygame.K_MINUS, pygame.K_UNDERSCORE):
                    zoom /= 1.1
                    if zoom < 0.1:
                        zoom = 0.1

        draw_delta(screen, nodes, edges, positions, offset, zoom)

    pygame.quit()
    sys.exit()


def main():
    delta_view()


if __name__ == "__main__":
    main()
