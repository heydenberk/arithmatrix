#!/usr/bin/env python3
"""
Generates the app icons from a single flat-design source.

Run from the repo root:  python3 scripts/generate_icons.py

The artwork mirrors the in-app grid: a hairline lattice of pastel cage colors
with darker lines along cage boundaries, on the app's indigo-violet gradient.

Every icon is drawn FULL BLEED - the gradient reaches all four edges with no
rounding and no transparency. The previous icons were a rounded square on a
transparent background (and the maskable variant on an opaque white one), so
Android composited them onto white and drew a white perimeter around the art.
Platforms apply their own corner rounding and masking; the icon must not try to
do it for them.
"""

from PIL import Image, ImageDraw, ImageFont

# App gradient (see .gradient-background / theme_color)
BG_TOP = (102, 126, 234)
BG_BOTTOM = (118, 75, 162)

LATTICE = (203, 213, 225)  # #cbd5e1, the gap color
CAGE_LINE = (71, 85, 105)  # #475569, cage boundary

# A 3x3 puzzle fragment: cage id per cell, then that cage's fill and text color
CAGES = [
    ["A", "A", "B"],
    ["C", "D", "B"],
    ["C", "E", "E"],
]
FILL = {
    "A": (253, 230, 138),  # amber
    "B": (191, 219, 254),  # blue
    "C": (167, 243, 208),  # emerald
    "D": (251, 207, 232),  # pink
    "E": (221, 214, 254),  # purple
}
TEXT = {
    "A": (217, 119, 6),
    "B": (29, 78, 216),
    "C": (4, 120, 87),
    "D": (190, 24, 93),
    "E": (107, 33, 168),
}
# A solved-looking Latin square, so the icon reads as a puzzle
DIGITS = [["3", "1", "2"], ["2", "3", "1"], ["1", "2", "3"]]


def load_font(px):
    for path in (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial Bold.ttf",
    ):
        try:
            return ImageFont.truetype(path, px)
        except OSError:
            continue
    return ImageFont.load_default()


def gradient(size):
    """Full-bleed vertical gradient, edge to edge."""
    img = Image.new("RGB", (size, size))
    draw = ImageDraw.Draw(img)
    for y in range(size):
        t = y / max(1, size - 1)
        draw.line(
            [(0, y), (size, y)],
            fill=(
                round(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t),
                round(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t),
                round(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t),
            ),
        )
    return img


def draw_grid(img, extent, digits):
    """Draws the lattice centred in the image, occupying `extent` of its width."""
    size = img.size[0]
    draw = ImageDraw.Draw(img)

    side = size * extent
    origin = (size - side) / 2
    gap = max(1, round(side * 0.022))
    cell = (side - 2 * gap) / 3
    radius = max(2, round(side * 0.07))

    # The lattice shows through the gaps between cells
    draw.rounded_rectangle(
        [origin, origin, origin + side, origin + side], radius=radius, fill=LATTICE
    )

    def cell_box(row, col):
        x = origin + col * (cell + gap)
        y = origin + row * (cell + gap)
        return [x, y, x + cell, y + cell]

    for row in range(3):
        for col in range(3):
            draw.rectangle(cell_box(row, col), fill=FILL[CAGES[row][col]])

    # Cage boundaries: thicken and darken the gap between differing cages,
    # the same rule the grid itself uses.
    line = gap * 2
    for row in range(3):
        for col in range(3):
            here = CAGES[row][col]
            box = cell_box(row, col)
            if col < 2 and CAGES[row][col + 1] != here:
                cx = box[2] + gap / 2
                draw.rectangle(
                    [cx - line / 2, box[1], cx + line / 2, box[3]], fill=CAGE_LINE
                )
            if row < 2 and CAGES[row + 1][col] != here:
                cy = box[3] + gap / 2
                draw.rectangle(
                    [box[0], cy - line / 2, box[2], cy + line / 2], fill=CAGE_LINE
                )

    if digits:
        font = load_font(round(cell * 0.62))
        for row in range(3):
            for col in range(3):
                box = cell_box(row, col)
                draw.text(
                    ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2),
                    DIGITS[row][col],
                    font=font,
                    fill=TEXT[CAGES[row][col]],
                    anchor="mm",
                )


def build(size, extent, digits):
    img = gradient(size)
    draw_grid(img, extent, digits)
    return img


OUT = "public"

# purpose "any": no mask applied, so the art can run wider
for size in (64, 192, 512):
    build(size, 0.70, digits=size >= 160).save(f"{OUT}/pwa-{size}x{size}.png")

# purpose "maskable": content must survive an aggressive mask, so keep it
# inside the centred 80%-diameter safe circle
build(512, 0.54, digits=True).save(f"{OUT}/maskable-icon-512x512.png")

# iOS applies its own rounding and rejects transparency
build(180, 0.70, digits=True).save(f"{OUT}/apple-touch-icon-180x180.png")

# Favicon: too small for digits
build(64, 0.78, digits=False).save(
    f"{OUT}/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)]
)



def svg(extent=0.70, size=512):
    """Emits the same artwork as SVG, so vector and raster cannot drift."""
    side = size * extent
    origin = (size - side) / 2
    gap = max(1, round(side * 0.022))
    cell = (side - 2 * gap) / 3
    radius = max(2, round(side * 0.07))

    def hexc(rgb):
        return "#%02x%02x%02x" % rgb

    def box(row, col):
        x = origin + col * (cell + gap)
        y = origin + row * (cell + gap)
        return x, y, x + cell, y + cell

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}">',
        "<defs>",
        '<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">',
        f'<stop offset="0" stop-color="{hexc(BG_TOP)}"/>',
        f'<stop offset="1" stop-color="{hexc(BG_BOTTOM)}"/>',
        "</linearGradient>",
        "</defs>",
        # Full bleed: the platform applies its own rounding
        f'<rect width="{size}" height="{size}" fill="url(#bg)"/>',
        f'<rect x="{origin:.1f}" y="{origin:.1f}" width="{side:.1f}" height="{side:.1f}"'
        f' rx="{radius}" fill="{hexc(LATTICE)}"/>',
    ]

    font = round(cell * 0.62)
    for row in range(3):
        for col in range(3):
            x0, y0, x1, y1 = box(row, col)
            cage = CAGES[row][col]
            parts.append(
                f'<rect x="{x0:.1f}" y="{y0:.1f}" width="{cell:.1f}" height="{cell:.1f}"'
                f' fill="{hexc(FILL[cage])}"/>'
            )
            parts.append(
                f'<text x="{(x0 + x1) / 2:.1f}" y="{(y0 + y1) / 2:.1f}" font-size="{font}"'
                f' font-family="Inter, system-ui, sans-serif" font-weight="700"'
                f' fill="{hexc(TEXT[cage])}" text-anchor="middle"'
                f' dominant-baseline="central">{DIGITS[row][col]}</text>'
            )

    line = gap * 2
    for row in range(3):
        for col in range(3):
            here = CAGES[row][col]
            x0, y0, x1, y1 = box(row, col)
            if col < 2 and CAGES[row][col + 1] != here:
                cx = x1 + gap / 2
                parts.append(
                    f'<rect x="{cx - line / 2:.1f}" y="{y0:.1f}" width="{line}"'
                    f' height="{cell:.1f}" fill="{hexc(CAGE_LINE)}"/>'
                )
            if row < 2 and CAGES[row + 1][col] != here:
                cy = y1 + gap / 2
                parts.append(
                    f'<rect x="{x0:.1f}" y="{cy - line / 2:.1f}" width="{cell:.1f}"'
                    f' height="{line}" fill="{hexc(CAGE_LINE)}"/>'
                )

    parts.append("</svg>")
    return "\n".join(parts)


with open(f"{OUT}/icon.svg", "w") as handle:
    handle.write(svg())

print("Wrote pwa-64/192/512, maskable-512, apple-touch-180, favicon.ico, icon.svg")
