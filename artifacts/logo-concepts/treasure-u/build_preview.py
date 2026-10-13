"""Generate a full-tile U and treasure concept; does not alter installed icons."""
from pathlib import Path

OUT = Path(__file__).resolve().parent / "broken-lines-v2"
OUT.mkdir(exist_ok=True)
NAVY = "#102A43"
CREAM = "#F7F5F0"


def coin(x: int, y: int, width: int = 24) -> str:
    # Separate open arcs produce intentional line breaks, not dashed borders.
    center = x + width / 2
    right = x + width
    return (
        f'<path d="M{x} {y}v5a{width / 2} 4 0 0 0 {width} 0v-5Z" fill="#D8A342"/>'
        f'<ellipse cx="{center}" cy="{y}" rx="{width / 2}" ry="4" fill="#F0CA72"/>'
        f'<g fill="none" stroke="#071C2C" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round">'
        f'<path d="M{x + 3} {y + 2.6}C{x - 3} {y} {x + 1} {y - 4} {center} {y - 4}"/>'
        f'<path d="M{center + 5} {y - 3.7}C{right + 4} {y - 2} {right + 3} {y + 3} {center + 3} {y + 4}"/>'
        f'<path d="M{x} {y + 1}v4c0 2 {width / 5} 4 {width / 2 - 4} 4"/>'
        f'<path d="M{center + 2} {y + 8.9}C{right - 2} {y + 8} {right} {y + 7} {right} {y + 5}v-3"/>'
        f'<path d="M{center - 5} {y - 1}h5" stroke="#FFF0B6"/>'
        '</g>'
    )


# The U is the previously selected Open entry letterform, not stock typography.
u = (
    '<g fill="#F7F5F0" transform="translate(29 22) scale(.1953125)">'
    '<path d="M40 36H80V140A32 32 0 0 0 112 172H144A32 32 0 0 0 176 140V100H216V140A72 72 0 0 1 144 212H112A72 72 0 0 1 40 140Z"/>'
    '<path d="M128 36H216V76H128Z"/></g>'
)
# Wide lower silhouette; outer coins are decorative and may be mask-cropped.
pile = "".join(
    coin(x, y, w)
    for x, y, w in [
        (12, 83, 28), (68, 83, 28),
        (22, 78, 28), (58, 78, 28),
        (34, 81, 40), (34, 75, 40), (34, 69, 40),
        (19, 88, 32), (57, 88, 32),
        (37, 89, 34),
    ]
)
foreground = u + pile


def svg(body: str, box: str = "0 0 108 108", size: int = 108) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{box}" '
        f'width="{size}" height="{size}">{body}</svg>'
    )


background = f'<rect width="108" height="108" fill="{NAVY}"/>'
(OUT / "android-foreground.svg").write_text(svg(foreground))
(OUT / "android-background.svg").write_text(svg(background))
# iOS receives an opaque square, never pre-rounded artwork.
ios_art = background + '<g transform="translate(-27 -27) scale(1.5)">' + foreground + '</g>'
(OUT / "ios-square.svg").write_text(
    svg(ios_art, size=1024)
)

defs = (
    '<defs><g id="art">' + background + foreground + '</g>'
    '<g id="ios-art">' + ios_art + '</g>'
    '<clipPath id="circle"><circle cx="54" cy="54" r="36"/></clipPath>'
    '<clipPath id="rounded"><rect x="18" y="18" width="72" height="72" rx="17"/></clipPath>'
    '<clipPath id="ios"><path d="M30 0H78Q108 0 108 30V78Q108 108 78 108H30Q0 108 0 78V30Q0 0 30 0Z"/></clipPath>'
    '</defs>'
)


def icon(x: int, y: int, size: int, mask: str, android: bool) -> str:
    view = "18 18 72 72" if android else "0 0 108 108"
    art = "art" if android else "ios-art"
    return (
        f'<svg x="{x}" y="{y}" width="{size}" height="{size}" viewBox="{view}">'
        f'<g clip-path="url(#{mask})"><use href="#{art}"/></g></svg>'
    )


def label(x: int, y: int, text: str, size: int = 20, color: str = NAVY) -> str:
    return f'<text x="{x}" y="{y}" font-family="Arial,sans-serif" font-size="{size}" fill="{color}">{text}</text>'


board = defs + '<rect width="1200" height="780" fill="#F7F5F0"/>'
board += label(48, 58, "UNFANCY / U + TREASURE", 28)
board += label(48, 93, "Broken-line vector coins · Rounded ink outlines · Flat gold fills", 19)
board += '<rect x="40" y="124" width="548" height="586" rx="28" fill="#DDE5E8"/>'
board += '<rect x="612" y="124" width="548" height="586" rx="28" fill="#DDE5E8"/>'
board += label(72, 167, "ANDROID", 23) + label(644, 167, "iOS", 23)
board += icon(142, 194, 344, "rounded", True)
board += icon(714, 194, 344, "ios", False)
board += label(72, 580, "Launcher masks", 19)
board += icon(74, 606, 64, "circle", True)
board += icon(158, 606, 64, "rounded", True)
board += label(244, 632, "Full-bleed navy background", 17)
board += label(244, 660, "Separate adaptive foreground", 17)
board += icon(646, 606, 64, "ios", False)
board += label(736, 632, "Opaque 1024 × 1024 source", 17)
board += label(736, 660, "System applies rounded corners", 17)
board += label(48, 753, "Illustrative masks, not device screenshots or Liquid Glass renders. Installed app assets unchanged.", 16)
(OUT / "platform-preview.svg").write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="780" viewBox="0 0 1200 780">'
    + board + '</svg>'
)
