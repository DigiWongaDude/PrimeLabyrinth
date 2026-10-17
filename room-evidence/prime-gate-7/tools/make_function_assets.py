from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


ROOT = Path(__file__).resolve().parent.parent


def make_mask(path: Path, inset: int, shoulder: int, top: int) -> None:
    image = Image.new("L", (256, 256), 0)
    draw = ImageDraw.Draw(image)
    draw.polygon(
        [
            (0, 255),
            (0, shoulder),
            (inset, top),
            (255 - inset, top),
            (255, shoulder),
            (255, 255),
        ],
        fill=255,
    )
    image.save(path)


def prop_contact_sheet() -> None:
    entries = [
        ("ROUTE PYLON / 0.8 x 0.8 x 1.8 m", ROOT / "images" / "route-pylon.png"),
        ("PRIME CROWN / 2.8 x 0.35 x 1.5 m", ROOT / "images" / "prime-crown.png"),
    ]
    cell_w, cell_h = 760, 930
    sheet = Image.new("RGB", (cell_w * 2, cell_h), "white")
    draw = ImageDraw.Draw(sheet)
    for index, (label, path) in enumerate(entries):
        source = Image.open(path).convert("RGBA")
        background = Image.new("RGBA", source.size, (242, 242, 242, 255))
        background.alpha_composite(source)
        image = ImageOps.contain(background.convert("RGB"), (cell_w - 80, cell_h - 150))
        x = index * cell_w + (cell_w - image.width) // 2
        y = 78 + (cell_h - 150 - image.height) // 2
        sheet.paste(image, (x, y))
        draw.rectangle((index * cell_w, 0, (index + 1) * cell_w - 1, cell_h - 1), outline="black", width=3)
        draw.text((index * cell_w + 30, 28), label, fill="black")
        draw.text((index * cell_w + 30, cell_h - 48), "PENDING EXPLICIT IMAGE APPROVAL", fill="black")
    sheet.save(ROOT / "images" / "prop-reference-contact-sheet.png")


def main() -> None:
    masks = ROOT / "masks"
    make_mask(masks / "arrival-south.png", inset=28, shoulder=52, top=28)
    make_mask(masks / "forward-north.png", inset=34, shoulder=58, top=24)
    prop_contact_sheet()


if __name__ == "__main__":
    main()
