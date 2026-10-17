import json
import math
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent.parent
PLANS = ROOT / "plans"


def rotate(vertex, rotation):
    x, y, z = vertex
    rx, ry, rz = rotation
    cy, sy = math.cos(ry), math.sin(ry)
    x, z = x * cy + z * sy, -x * sy + z * cy
    cz, sz = math.cos(rz), math.sin(rz)
    x, y = x * cz - y * sz, x * sz + y * cz
    cx, sx = math.cos(rx), math.sin(rx)
    y, z = y * cx - z * sx, y * sx + z * cx
    return x, y, z


def box(name, location, dimensions, shade=20, rotation=(0, 0, 0)):
    hx, hy, hz = (value / 2 for value in dimensions)
    local = [(x, y, z) for z in (-hz, hz) for y in (-hy, hy) for x in (-hx, hx)]
    vertices = []
    for vertex in local:
        x, y, z = rotate(vertex, rotation)
        vertices.append([x + location[0], y + location[1], z + location[2]])
    return {"name": name, "vertices": vertices, "shade": shade}


def prism(name, location, radius, depth, vertices=6, axis="z", shade=20):
    points = []
    for end in (-depth / 2, depth / 2):
        for index in range(vertices):
            angle = 2 * math.pi * index / vertices + math.pi / 6
            a, b = math.cos(angle) * radius, math.sin(angle) * radius
            if axis == "z":
                point = (a, b, end)
            elif axis == "y":
                point = (a, end, b)
            else:
                point = (end, a, b)
            points.append([point[0] + location[0], point[1] + location[1], point[2] + location[2]])
    return {"name": name, "vertices": points, "shade": shade}


def hull(points):
    values = sorted(set(points))
    if len(values) <= 1:
        return values
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower = []
    for point in values:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)
    upper = []
    for point in reversed(values):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)
    return lower[:-1] + upper[:-1]


def render(meshes, path, projection, bounds, size):
    width, height = size
    image = Image.new("RGB", size, "white")
    draw = ImageDraw.Draw(image)
    xmin, xmax, ymin, ymax = bounds
    margin = 45
    scale = min((width - margin * 2) / (xmax - xmin), (height - margin * 2) / (ymax - ymin))
    def point(value):
        x, y = value
        return int(margin + (x - xmin) * scale), int(height - margin - (y - ymin) * scale)
    if projection == "top":
        ordered = sorted(meshes, key=lambda item: sum(v[2] for v in item["vertices"]) / len(item["vertices"]))
    else:
        # The elevation camera looks toward +Y: draw the far wall first and fixtures last.
        ordered = sorted(meshes, key=lambda item: sum(v[1] for v in item["vertices"]) / len(item["vertices"]), reverse=True)
    for mesh in ordered:
        if projection == "top":
            projected = [(round(v[0], 5), round(v[1], 5)) for v in mesh["vertices"]]
        else:
            projected = [(round(v[0], 5), round(v[2], 5)) for v in mesh["vertices"]]
        polygon = hull(projected)
        if len(polygon) >= 3:
            shade = mesh["shade"]
            draw.polygon([point(value) for value in polygon], fill=(shade, shade, shade), outline="black", width=2)
    draw.rectangle((1, 1, width - 2, height - 2), outline="black", width=3)
    image.save(path)


def lower_plan():
    meshes = [
        box("arrival-apron", (0, -12.7, 0.05), (4.0, 5.0, 0.1), 215),
        box("destination-passage", (0, 14.2, 0.05), (4.8, 8.0, 0.1), 215),
        box("destination-west-wall", (-2.6, 14.2, 0.35), (0.4, 8.0, 0.7), 55),
        box("destination-east-wall", (2.6, 14.2, 0.35), (0.4, 8.0, 0.7), 55),
        box("wall-west", (-8.2, 0, 0.4), (0.4, 20.4, 0.8), 15),
        box("wall-east", (8.2, 0, 0.4), (0.4, 20.4, 0.8), 15),
        box("circulation-lane", (0, 0, 0.03), (4.0, 19.6, 0.06), 235),
        box("floor-marker-west", (-2.0, 0, 0.08), (0.12, 19.0, 0.12), 120),
        box("floor-marker-east", (2.0, 0, 0.08), (0.12, 19.0, 0.12), 120),
        prism("route-pylon-west", (-3.4, 6.5, 0.45), 0.46, 0.9, 6, "z", 20),
        prism("route-pylon-east", (3.4, 6.5, 0.45), 0.46, 0.9, 6, "z", 20),
        box("main-sign", (0, -10.48, 0.42), (3.0, 0.16, 0.84), 65),
    ]
    for y, opening_width in ((-10.2, 4.0), (10.2, 4.8)):
        side = (16.4 - opening_width) / 2
        offset = opening_width / 2 + side / 2
        meshes.extend([box(f"wall-{y}-west", (-offset, y, 0.4), (side, 0.4, 0.8), 15), box(f"wall-{y}-east", (offset, y, 0.4), (side, 0.4, 0.8), 15)])
    for x in (-7.75, 7.75):
        for y in (-6.5, 0, 6.5):
            meshes.append(box(f"engaged-pilaster-{x}-{y}", (x, y, 0.45), (0.5, 0.9, 0.9), 60))
    render(meshes, PLANS / "floor-plan.png", "top", (-10, 10, -16, 19), (1400, 1200))
    return meshes


def ceiling_plan():
    meshes = []
    for x in (-8.0, 8.0): meshes.append(box(f"ceiling-edge-{x}", (x, 0, 7.9), (0.18, 20.0, 0.16), 18))
    for y in (-10.0, 10.0): meshes.append(box(f"ceiling-edge-{y}", (0, y, 7.9), (16.0, 0.18, 0.16), 18))
    for y in (-7.5, -2.5, 2.5, 7.5): meshes.append(box(f"ceiling-rib-{y}", (0, y, 7.82), (15.5, 0.32, 0.22), 65))
    for x in (-2.0, 2.0): meshes.append(box(f"ceiling-strip-{x}", (x, 0, 7.74), (0.16, 18.8, 0.12), 135))
    render(meshes, PLANS / "reflected-ceiling-plan.png", "top", (-10, 10, -12, 12), (1400, 1100))
    return meshes


def north_elevation():
    meshes = [
        box("north-left", (-5.2, 10.2, 4.0), (6.0, 0.4, 8.0), 18),
        box("north-right", (5.2, 10.2, 4.0), (6.0, 0.4, 8.0), 18),
        box("north-header", (0, 10.2, 7.15), (4.4, 0.4, 1.7), 18),
        box("north-chamfer-west", (-2.2, 10.2, 5.55), (0.75, 0.4, 1.5), 18, (0, math.radians(-35), 0)),
        box("north-chamfer-east", (2.2, 10.2, 5.55), (0.75, 0.4, 1.5), 18, (0, math.radians(35), 0)),
    ]
    for x in (-3.4, 3.4):
        meshes.extend([prism(f"pylon-base-{x}", (x, 9.65, 0.18), 0.46, 0.36, 6, "z", 30), box(f"pylon-body-{x}", (x, 9.62, 0.95), (0.42, 0.42, 1.55), 55)])
    meshes.append(prism("crown-hub", (0, 9.62, 6.55), 0.38, 0.28, 24, "y", 22))
    for index in range(7):
        angle = 2 * math.pi * index / 7 + math.pi / 2
        meshes.append(box(f"crown-spoke-{index}", (math.cos(angle) * 0.88, 9.62, 6.55 + math.sin(angle) * 0.88), (0.38, 0.28, 1.25), 55, (0, angle - math.pi / 2, 0)))
    render(meshes, PLANS / "wall-elevation-north.png", "front", (-9, 9, -0.5, 8.8), (1500, 900))
    return meshes


def main():
    PLANS.mkdir(parents=True, exist_ok=True)
    groups = {"lower-room": lower_plan(), "reflected-ceiling": ceiling_plan(), "north-elevation": north_elevation()}
    (PLANS / "function-concept-mesh.json").write_text(json.dumps(groups, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
