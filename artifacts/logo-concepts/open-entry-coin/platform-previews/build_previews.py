"""Build illustrative platform previews; does not change runtime app assets.

Run from the repository root:
    python3 artifacts/logo-concepts/open-entry-coin/platform-previews/build_previews.py
"""

from pathlib import Path
from xml.etree import ElementTree as ET
from html import escape

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent / "open-entry-coin-silver-flat-v4.svg"
SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)
root = ET.parse(SOURCE).getroot()
coin = "".join(
    ET.tostring(child, encoding="unicode")
    for child in root
    if child.tag != f"{{{SVG_NS}}}title"
)

NAVY = "#102A43"
CREAM = "#F7F5F0"
ANDROID_SCALE = 58 / 216
ANDROID_OFFSET = 54 - 128 * ANDROID_SCALE
android_foreground = (
    f'<g transform="translate({ANDROID_OFFSET:.6f} {ANDROID_OFFSET:.6f}) '
    f'scale({ANDROID_SCALE:.6f})">{coin}</g>'
)
ios_content = f'<rect width="1024" height="1024" fill="{CREAM}"/><g transform="translate(51.2 51.2) scale(3.6)">{coin}</g>'
android_content = f'<rect width="108" height="108" fill="{CREAM}"/>{android_foreground}'


def svg_document(width, height, title, content):
    return (
        f'<svg xmlns="{SVG_NS}" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}" role="img" aria-labelledby="title">'
        f'<title id="title">{escape(title)}</title>{content}</svg>\n'
    )


def write_svg(name, width, height, title, content):
    (HERE / name).write_text(svg_document(width, height, title, content), encoding="utf-8")


write_svg("ios-square-study.svg", 1024, 1024, "iOS opaque square icon study, before system masking", ios_content)
write_svg("android-foreground-study.svg", 108, 108, "Android transparent adaptive foreground study", android_foreground)
write_svg("android-background-study.svg", 108, 108, "Android opaque adaptive background study", f'<rect width="108" height="108" fill="{CREAM}"/>')

defs = f"""
<defs>
  <symbol id="ios-art" viewBox="0 0 1024 1024">{ios_content}</symbol>
  <symbol id="android-art" viewBox="0 0 108 108">{android_content}</symbol>
  <clipPath id="circle"><circle cx="50" cy="50" r="50"/></clipPath>
  <clipPath id="rounded"><rect width="100" height="100" rx="20"/></clipPath>
  <clipPath id="squircle"><path d="M28 0H72C91 0 100 9 100 28V72C100 91 91 100 72 100H28C9 100 0 91 0 72V28C0 9 9 0 28 0Z"/></clipPath>
  <linearGradient id="wallpaper" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#E5ECE8"/><stop offset="1" stop-color="#CCDAD4"/>
  </linearGradient>
</defs>
"""


def text(x, y, value, size=18, color=NAVY, weight=400, anchor="start"):
    return (
        f'<text x="{x}" y="{y}" font-family="Arial, Helvetica, sans-serif" '
        f'font-size="{size}" fill="{color}" font-weight="{weight}" '
        f'text-anchor="{anchor}">{escape(value)}</text>'
    )


def icon(x, y, size, platform, mask="squircle"):
    content = (
        '<svg width="100" height="100" viewBox="18 18 72 72">'
        '<use href="#android-art" width="108" height="108"/></svg>'
        if platform == "android"
        else '<use href="#ios-art" width="100" height="100"/>'
    )
    clip = f' clip-path="url(#{mask})"' if mask else ""
    return f'<g transform="translate({x} {y}) scale({size / 100})"><g{clip}>{content}</g></g>'


def placeholder(x, y, size, mask, variant):
    colors = ["#81958D", "#A0AEA6", "#C5BBA9", "#8D9AA4"]
    inner = (
        f'<rect width="100" height="100" fill="{colors[variant % len(colors)]}"/>'
        '<rect x="27" y="27" width="46" height="46" rx="12" fill="#FFFFFF" opacity=".7"/>'
    )
    return f'<g transform="translate({x} {y}) scale({size / 100})" clip-path="url(#{mask})">{inner}</g>'


def phone(platform):
    mask = "circle" if platform == "android" else "squircle"
    result = [
        '<rect x="73" y="169" width="348" height="728" rx="49" fill="#C7CFCA"/>',
        '<rect x="68" y="160" width="348" height="728" rx="49" fill="#172632"/>',
        '<rect x="78" y="170" width="328" height="708" rx="40" fill="url(#wallpaper)"/>',
        text(103, 205, "9:41", 15, weight=600),
        '<rect x="349" y="193" width="24" height="11" rx="3" fill="none" stroke="#102A43" stroke-width="1.5"/>',
        '<rect x="352" y="196" width="17" height="5" rx="1" fill="#102A43"/>',
    ]
    if platform == "ios":
        result.append('<rect x="203" y="184" width="77" height="22" rx="11" fill="#172632"/>')
    else:
        result.append('<circle cx="242" cy="193" r="6" fill="#172632"/>')
    result.extend([
        text(242, 260, "A calmer home screen.", 19, weight=500, anchor="middle"),
        text(242, 286, "Your money tracker, at a glance.", 13, color="#52695F", anchor="middle"),
    ])
    labels = ["Photos", "Calendar", "Unfancy…", "Notes", "Maps", "Mail", "Clock", "Files"]
    for index, label in enumerate(labels):
        x = 98 + (index % 4) * 77
        y = 326 + (index // 4) * 98
        result.append(
            icon(x, y, 56, platform, mask)
            if index == 2
            else placeholder(x, y, 56, mask, index)
        )
        result.append(text(x + 28, y + 76, label, 11, anchor="middle"))
    result.append('<rect x="91" y="769" width="302" height="84" rx="28" fill="#F7F5F0" opacity=".68"/>')
    for index in range(4):
        result.append(placeholder(103 + index * 75, 783, 54, mask, index))
    result.extend([
        '<circle cx="232" cy="729" r="3" fill="#102A43"/>',
        '<circle cx="245" cy="729" r="3" fill="#102A43" opacity=".25"/>',
        '<rect x="196" y="864" width="92" height="4" rx="2" fill="#102A43"/>',
    ])
    return "".join(result)


def board(platform):
    android = platform == "android"
    content = [
        defs,
        f'<rect width="1080" height="1000" fill="{CREAM}"/>',
        text(60, 62, "ANDROID" if android else "iOS", 14, color="#64796D", weight=600),
        text(60, 108, "Unfancy Money Tracker", 36, weight=600),
        text(60, 139, "Flat silver coin / Navy mark / Warm neutral background", 18, color="#536A5D"),
        phone(platform),
        '<rect x="467" y="176" width="553" height="352" rx="24" fill="#FFFFFF"/>',
        text(498, 219, "Adaptive icon" if android else "System-rounded icon", 25, weight=600),
    ]
    if android:
        content.extend([
            icon(509, 255, 190, platform, "circle"),
            text(729, 289, "Separate layers", 20, weight=600),
            text(729, 325, "Opaque cream background", 16),
            text(729, 354, "Transparent coin foreground", 16),
            text(729, 397, "108 × 108 dp layers", 16, color="#536A5D"),
            text(729, 427, "Coin fits the 66 dp safe zone", 16, color="#536A5D"),
            text(498, 493, "The launcher chooses the mask—not the logo artwork.", 16, color="#536A5D"),
            text(487, 580, "Different launcher masks", 23, weight=600),
        ])
        for x, mask, label in [(497, "circle", "Circle"), (675, "squircle", "Squircle"), (853, "rounded", "Rounded square")]:
            content.append(f'<rect x="{x - 14}" y="605" width="148" height="148" rx="18" fill="#CBD8D1"/>')
            content.append(icon(x, 619, 120, platform, mask))
            content.append(text(x + 60, 770, label, 16, anchor="middle"))
        content.extend([
            text(487, 823, "58 dp coin artwork inside the protected 66 dp circle.", 17),
            text(487, 852, "No clipping of the coin or detached entry line.", 17, color="#536A5D"),
            text(487, 899, "Normal-color appearance shown; themed icons are separate.", 15, color="#64796D"),
        ])
    else:
        content.extend([
            icon(509, 255, 190, platform, "squircle"),
            text(729, 289, "Opaque square source", 20, weight=600),
            text(729, 325, "1024 × 1024 px study", 16),
            text(729, 354, "No baked-in rounded corners", 16),
            text(729, 397, "iOS applies the final mask", 16, color="#536A5D"),
            text(729, 427, "Light/default appearance", 16, color="#536A5D"),
            text(498, 493, "Rounded shape below is an illustrative system-mask approximation.", 15, color="#536A5D"),
            text(487, 580, "Square source → System mask", 23, weight=600),
            '<rect x="515" y="605" width="168" height="168" rx="18" fill="#CBD8D1"/>',
            '<rect x="745" y="605" width="168" height="168" rx="18" fill="#CBD8D1"/>',
            icon(529, 619, 140, platform, None),
            text(714, 699, "→", 36, anchor="middle"),
            icon(759, 619, 140, platform, "squircle"),
            text(599, 796, "Unmasked artwork", 16, anchor="middle"),
            text(829, 796, "Home-screen preview", 16, anchor="middle"),
            text(487, 850, "Silver face and navy outline remain flat and legible.", 17),
            text(487, 879, "No extra shine, edge, or perspective added to the coin.", 17, color="#536A5D"),
            text(487, 915, "Not an Icon Composer / Liquid Glass rendering.", 15, color="#64796D"),
        ])
    content.append(text(60, 960, "ILLUSTRATIVE MOCKUP · Other apps are placeholders · Not a device screenshot · App assets unchanged", 14, color="#64796D"))
    return "".join(content)


for platform in ["android", "ios"]:
    write_svg(f"{platform}-preview.svg", 1080, 1000, f"Unfancy Money Tracker — {platform} illustrative app-icon preview", board(platform))

print("Generated Android and iOS SVG studies and labeled mockups.")
