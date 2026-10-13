#!/usr/bin/env python3
"""Build the approved Unfancy Money Tracker logo kit from its source SVGs."""

from __future__ import annotations

import argparse
import copy
import os
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path


SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)

ROOT = Path(__file__).resolve().parents[3]
KIT = ROOT / "artifacts/brand-kit"
CONCEPT = ROOT / "artifacts/logo-concepts/treasure-u"
INK = "#102A43"
CREAM = "#F7F5F0"
DEV_RED = "#C63D3D"
GOLD = "#F0CA72"
GOLD_SIDE = "#B9802D"
FONT = "Inter"
DEV_BADGE_POINTS = "55,76 79,76 84,81 79,86 55,86"


def tag(name: str) -> str:
    return f"{{{SVG_NS}}}{name}"


def parse_svg(path: Path) -> ET.Element:
    return ET.parse(path).getroot()


def new_svg(width: int, height: int, title: str, view_box: str | None = None) -> ET.Element:
    root = ET.Element(
        tag("svg"),
        {
            "width": str(width),
            "height": str(height),
            "viewBox": view_box or f"0 0 {width} {height}",
            "role": "img",
            "aria-labelledby": "title",
        },
    )
    ET.SubElement(root, tag("title"), {"id": "title"}).text = title
    return root


def append_source_svg(
    parent: ET.Element,
    source: Path,
    *,
    x: int,
    y: int,
    width: int,
    height: int,
    monochrome: str | None = None,
) -> None:
    source_root = parse_svg(source)
    nested = ET.SubElement(
        parent,
        tag("svg"),
        {
            "x": str(x),
            "y": str(y),
            "width": str(width),
            "height": str(height),
            "viewBox": source_root.get("viewBox", "0 0 108 108"),
            "preserveAspectRatio": "xMidYMid meet",
        },
    )
    for child in source_root:
        if child.tag == tag("title"):
            continue
        cloned = copy.deepcopy(child)
        if monochrome:
            for element in cloned.iter():
                if element.tag.rsplit("}", 1)[-1] in {
                    "path",
                    "rect",
                    "ellipse",
                    "circle",
                    "polygon",
                }:
                    element.set("fill", monochrome)
                if element.tag.rsplit("}", 1)[-1] == "g":
                    element.attrib.pop("fill", None)
        nested.append(cloned)


def add_text(
    parent: ET.Element,
    x: int,
    y: int,
    text: str,
    size: int,
    fill: str,
    *,
    weight: int = 600,
    tracking: float | None = None,
    anchor: str | None = None,
) -> ET.Element:
    attrs = {
        "x": str(x),
        "y": str(y),
        "font-family": FONT,
        "font-size": str(size),
        "font-weight": str(weight),
        "fill": fill,
    }
    if tracking is not None:
        attrs["letter-spacing"] = str(tracking)
    if anchor:
        attrs["text-anchor"] = anchor
    text_node = ET.SubElement(parent, tag("text"), attrs)
    text_node.text = text
    return text_node


def make_lockup(
    name: str,
    *,
    width: int,
    height: int,
    arrangement: str,
    color: str,
    icon: str,
    reverse: bool = False,
    subtitle_color: str | None = None,
) -> ET.Element:
    root = new_svg(width, height, f"Unfancy Money Tracker {name}")
    if reverse:
        ET.SubElement(
            root,
            tag("rect"),
            {"x": "0", "y": "0", "width": str(width), "height": str(height), "fill": INK},
        )

    if arrangement == "horizontal":
        icon_size, icon_x, icon_y = 132, 24, 24
        if icon == "tile":
            append_source_svg(
                root,
                CONCEPT / "ios-square.svg",
                x=icon_x,
                y=icon_y,
                width=icon_size,
                height=icon_size,
            )
        else:
            append_source_svg(
                root,
                CONCEPT / "android-foreground.svg",
                x=icon_x,
                y=icon_y,
                width=icon_size,
                height=icon_size,
                monochrome=icon,
            )
        add_text(root, 192, 86, "Unfancy", 58, color)
        add_text(
            root,
            196,
            128,
            "MONEY TRACKER",
            20,
            subtitle_color or color,
            tracking=3.5,
        )
    elif arrangement == "stacked":
        icon_size, icon_x, icon_y = 142, 159, 18
        if icon == "tile":
            append_source_svg(
                root,
                CONCEPT / "ios-square.svg",
                x=icon_x,
                y=icon_y,
                width=icon_size,
                height=icon_size,
            )
        else:
            append_source_svg(
                root,
                CONCEPT / "android-foreground.svg",
                x=icon_x,
                y=icon_y,
                width=icon_size,
                height=icon_size,
                monochrome=icon,
            )
        add_text(root, 230, 248, "Unfancy", 56, color, anchor="middle")
        add_text(
            root,
            230,
            292,
            "MONEY TRACKER",
            18,
            subtitle_color or color,
            tracking=3.2,
            anchor="middle",
        )
    else:
        add_text(root, 20, 68, "Unfancy", 58, color)
        add_text(
            root,
            24,
            108,
            "MONEY TRACKER",
            20,
            subtitle_color or color,
            tracking=3.5,
        )
    return root


def set_all_paints(root: ET.Element, color: str) -> None:
    for element in root.iter():
        if element.tag.rsplit("}", 1)[-1] in {
            "path",
            "rect",
            "ellipse",
            "circle",
            "polygon",
        }:
            element.set("fill", color)
        if element.tag.rsplit("}", 1)[-1] == "g":
            element.attrib.pop("fill", None)


def write_svg(root: ET.Element, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(ET.tostring(root, encoding="utf-8", xml_declaration=True))


def outline_svg(source_root: ET.Element, output: Path, temp_dir: Path, env: dict[str, str]) -> None:
    source = temp_dir / f"{output.stem}-live-type.svg"
    write_svg(source_root, source)
    output.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "inkscape",
            str(source),
            "--export-text-to-path",
            "--export-plain-svg",
            f"--export-filename={output}",
        ],
        env=env,
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )


def make_font_env(temp_dir: Path) -> dict[str, str]:
    cache_dir = temp_dir / "font-cache"
    cache_dir.mkdir()
    config = temp_dir / "fonts.conf"
    system_config = Path("/opt/homebrew/etc/fonts/fonts.conf")
    if not system_config.exists():
        raise RuntimeError("Fontconfig's system config was not found; cannot safely outline Inter.")
    config.write_text(
        "<?xml version=\"1.0\"?>\n"
        "<!DOCTYPE fontconfig SYSTEM \"urn:fontconfig:fonts.dtd\">\n"
        "<fontconfig>\n"
        f"  <include>{system_config}</include>\n"
        f"  <dir>{ROOT / 'assets/fonts'}</dir>\n"
        f"  <cachedir>{cache_dir}</cachedir>\n"
        "</fontconfig>\n",
        encoding="utf-8",
    )
    env = os.environ.copy()
    env["FONTCONFIG_FILE"] = str(config)
    return env


def export_png(
    source: Path,
    output: Path,
    width: int,
    height: int,
    env: dict[str, str],
) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "rsvg-convert",
            "--width",
            str(width),
            "--height",
            str(height),
            "--output",
            str(output),
            str(source),
        ],
        env=env,
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )


def add_rect(
    parent: ET.Element,
    x: int,
    y: int,
    width: int,
    height: int,
    fill: str,
    *,
    radius: int = 0,
    stroke: str | None = None,
) -> ET.Element:
    attrs = {
        "x": str(x),
        "y": str(y),
        "width": str(width),
        "height": str(height),
        "fill": fill,
    }
    if radius:
        attrs["rx"] = str(radius)
    if stroke:
        attrs["stroke"] = stroke
        attrs["stroke-width"] = "2"
    return ET.SubElement(parent, tag("rect"), attrs)


def board_text(
    root: ET.Element,
    x: int,
    y: int,
    text: str,
    size: int,
    color: str = INK,
    *,
    weight: int = 500,
    tracking: float | None = None,
) -> None:
    add_text(root, x, y, text, size, color, weight=weight, tracking=tracking)


def add_dashboard_phone(root: ET.Element) -> None:
    add_rect(root, 114, 323, 258, 430, INK, radius=34)
    add_rect(root, 127, 336, 232, 404, CREAM, radius=26)
    add_rect(root, 203, 344, 80, 12, INK, radius=6)
    append_source_svg(
        root,
        CONCEPT / "ios-square.svg",
        x=145,
        y=375,
        width=30,
        height=30,
    )
    board_text(root, 184, 395, "Unfancy", 19, weight=600)
    board_text(root, 148, 444, "APRIL OVERVIEW", 11, "#687B89", weight=600, tracking=1.2)
    add_rect(root, 145, 459, 196, 126, "#FFFFFF", radius=14)
    board_text(root, 162, 488, "REMAINING BUDGET", 10, "#687B89", weight=600, tracking=0.8)
    board_text(root, 162, 538, "—", 37, INK, weight=600)
    add_rect(root, 162, 554, 164, 8, "#E5E7E4", radius=4)
    add_rect(root, 162, 554, 101, 8, "#49A675", radius=4)
    board_text(root, 145, 622, "INCOME", 11, "#687B89", weight=600, tracking=0.8)
    board_text(root, 252, 622, "EXPENSES", 11, "#687B89", weight=600, tracking=0.8)
    add_rect(root, 145, 636, 91, 64, "#FFFFFF", radius=12)
    add_rect(root, 250, 636, 91, 64, "#FFFFFF", radius=12)
    add_rect(root, 162, 654, 54, 7, GOLD, radius=3)
    add_rect(root, 162, 671, 44, 6, "#D7DDDE", radius=3)
    add_rect(root, 267, 654, 54, 7, "#E68A76", radius=3)
    add_rect(root, 267, 671, 44, 6, "#D7DDDE", radius=3)
    board_text(root, 145, 720, "Illustrative layout • no personal data", 9, "#687B89", weight=400)


def add_web_dashboard(root: ET.Element) -> None:
    add_rect(root, 1063, 323, 448, 430, "#FFFFFF", radius=16, stroke="#D7DDDE")
    add_rect(root, 1063, 323, 448, 38, "#E8ECEB", radius=16)
    add_rect(root, 1063, 349, 448, 12, "#E8ECEB")
    for index, color in enumerate(("#E68A76", "#E0B65F", "#67A982")):
        ET.SubElement(root, tag("circle"), {"cx": str(1084 + index * 16), "cy": "342", "r": "4", "fill": color})
    add_rect(root, 1080, 382, 414, 53, INK, radius=10)
    append_source_svg(
        root,
        CONCEPT / "ios-square.svg",
        x=1093,
        y=394,
        width=28,
        height=28,
    )
    board_text(root, 1132, 413, "Unfancy", 16, CREAM, weight=600)
    board_text(root, 1390, 413, "Overview   Budgets   Activity", 10, CREAM, weight=400)
    board_text(root, 1085, 470, "Your month, at a glance.", 24, INK, weight=600)
    board_text(root, 1085, 493, "A clear view of the money you entered.", 12, "#687B89", weight=400)
    for x, label, accent in ((1085, "INCOME", "#49A675"), (1288, "EXPENSES", "#E68A76")):
        add_rect(root, x, 517, 185, 83, CREAM, radius=12)
        board_text(root, x + 16, 542, label, 10, "#687B89", weight=600, tracking=0.8)
        board_text(root, x + 16, 579, "—", 25, INK, weight=600)
        add_rect(root, x + 137, 536, 28, 28, accent, radius=14)
    board_text(root, 1085, 631, "SPENDING BY CATEGORY", 10, "#687B89", weight=600, tracking=0.8)
    for index, (label, width, color) in enumerate(
        (("Home", 178, "#E7B668"), ("Food", 126, "#74A989"), ("Everyday", 90, "#6E8798"))
    ):
        y = 650 + index * 25
        board_text(root, 1085, y + 10, label, 11, INK, weight=400)
        add_rect(root, 1158, y, 286, 9, "#E8ECEB", radius=4)
        add_rect(root, 1158, y, width, 9, color, radius=4)
    board_text(root, 1085, 729, "Illustrative layout • no personal data", 9, "#687B89", weight=400)


def build_presentation_board(temp_dir: Path, env: dict[str, str]) -> None:
    root = new_svg(1600, 1100, "Unfancy Money Tracker identity presentation")
    add_rect(root, 0, 0, 1600, 1100, CREAM)
    board_text(root, 72, 56, "UNFANCY MONEY TRACKER  /  IDENTITY KIT", 13, INK, weight=600, tracking=1.6)
    board_text(root, 72, 132, "Calm money, clearly.", 48, INK, weight=600)
    board_text(root, 72, 174, "An understated mark for a more understandable monthly view.", 19, "#526979", weight=400)
    board_text(root, 1260, 65, "APPROVED DIRECTION", 11, "#526979", weight=600, tracking=1.2)
    board_text(root, 1260, 91, "U + TREASURE", 22, INK, weight=600)
    board_text(root, 1260, 116, "FULL-BLEED NAVY  •  FLAT GOLD", 10, "#526979", weight=600, tracking=0.8)
    ET.SubElement(root, tag("line"), {"x1": "72", "y1": "210", "x2": "1528", "y2": "210", "stroke": "#D8DDDA", "stroke-width": "2"})

    # Finance and mobile contexts; no payment-card or bank-account cues.
    add_rect(root, 72, 242, 434, 535, "#FFFFFF", radius=22)
    board_text(root, 100, 282, "01  /  MOBILE OVERVIEW", 12, "#526979", weight=600, tracking=1.1)
    add_dashboard_phone(root)

    add_rect(root, 534, 242, 474, 535, "#FFFFFF", radius=22)
    board_text(root, 562, 282, "02  /  APPROVED APP ICONS", 12, "#526979", weight=600, tracking=1.1)
    append_source_svg(
        root,
        CONCEPT / "ios-square.svg",
        x=584,
        y=335,
        width=174,
        height=174,
    )
    add_rect(root, 790, 335, 174, 174, INK, radius=0)
    append_source_svg(
        root,
        CONCEPT / "android-foreground.svg",
        x=790,
        y=335,
        width=174,
        height=174,
    )
    board_text(root, 623, 536, "iOS", 14, INK, weight=600)
    board_text(root, 819, 536, "ANDROID", 14, INK, weight=600)
    board_text(root, 584, 592, "iOS master: opaque square; system applies mask.", 12, "#526979", weight=400)
    board_text(root, 584, 618, "Android: separate foreground and navy background.", 12, "#526979", weight=400)
    add_rect(root, 584, 662, 174, 72, "#E9EEF0", radius=12)
    append_source_svg(
        root,
        CONCEPT / "ios-square.svg",
        x=600,
        y=674,
        width=48,
        height=48,
    )
    board_text(root, 660, 691, "Cream U", 12, INK, weight=600)
    board_text(root, 660, 712, "Flat gold coins", 11, "#526979", weight=400)
    add_rect(root, 790, 662, 174, 72, "#E9EEF0", radius=12)
    append_source_svg(
        root,
        KIT / "platform/dev/icon-ios-dev.svg",
        x=800,
        y=674,
        width=48,
        height=48,
    )
    board_text(root, 856, 692, "DEV ribbon", 12, INK, weight=600)
    board_text(root, 856, 713, "non-production only", 11, "#526979", weight=400)

    add_rect(root, 1036, 242, 492, 535, "#FFFFFF", radius=22)
    board_text(root, 1064, 282, "03  /  WEB DASHBOARD", 12, "#526979", weight=600, tracking=1.1)
    add_web_dashboard(root)

    add_rect(root, 72, 803, 700, 223, "#FFFFFF", radius=22)
    board_text(root, 100, 842, "04  /  LOCKUPS", 12, "#526979", weight=600, tracking=1.1)
    append_source_svg(
        root,
        KIT / "masters/logo-horizontal-color.svg",
        x=192,
        y=844,
        width=460,
        height=180,
    )

    add_rect(root, 800, 803, 352, 223, "#FFFFFF", radius=22)
    board_text(root, 828, 842, "05  /  CORE PALETTE", 12, "#526979", weight=600, tracking=1.1)
    palette = (
        (828, INK, "NAVY"),
        (903, CREAM, "CREAM"),
        (978, GOLD, "GOLD"),
        (1053, GOLD_SIDE, "SIDE"),
    )
    for x, color, label in palette:
        add_rect(root, x, 874, 58, 58, color, radius=12, stroke="#D8DDDA" if color == CREAM else None)
        board_text(root, x, 957, label, 9, "#526979", weight=600, tracking=0.5)
        board_text(root, x - 2, 978, color, 9, INK, weight=400)
    board_text(root, 828, 1006, "Four approved fills • flat artwork only", 11, "#526979", weight=400)

    add_rect(root, 1180, 803, 348, 223, INK, radius=22)
    board_text(root, 1208, 842, "06  /  MONO + REVERSE", 12, CREAM, weight=600, tracking=1.1)
    add_rect(root, 1210, 866, 96, 96, CREAM, radius=12)
    append_source_svg(
        root,
        KIT / "masters/symbol-monochrome-navy.svg",
        x=1210,
        y=866,
        width=96,
        height=96,
    )
    add_rect(root, 1370, 866, 96, 96, "#223D55", radius=12)
    append_source_svg(
        root,
        KIT / "masters/symbol-reverse-cream.svg",
        x=1370,
        y=866,
        width=96,
        height=96,
    )
    board_text(root, 1208, 990, "Navy on light", 10, CREAM, weight=400)
    board_text(root, 1370, 990, "Cream on dark", 10, CREAM, weight=400)
    board_text(root, 72, 1070, "Illustrative interface mockups, not product screenshots. No personal financial data or bank/payment-card imagery.", 11, "#526979", weight=400)

    board_svg = KIT / "presentation/presentation-board.svg"
    outline_svg(root, board_svg, temp_dir, env)
    export_png(
        board_svg,
        KIT / "presentation/presentation-board.png",
        1600,
        1100,
        env,
    )


def build_dev_icons(temp_dir: Path, env: dict[str, str]) -> None:
    master_dir = KIT / "masters"
    android_dir = KIT / "platform/android"
    dev_dir = KIT / "platform/dev"
    dev_icon_specs = (
        (
            "primary-icon-dev.svg",
            CONCEPT / "ios-square.svg",
            "Unfancy Money Tracker iOS development icon with red ribbon and outlined cream DEV lettering",
        ),
        (
            "android-foreground-dev.svg",
            android_dir / "foreground.svg",
            "Unfancy Money Tracker Android development foreground with red ribbon and outlined cream DEV lettering",
        ),
    )
    for filename, source_path, title in dev_icon_specs:
        dev_icon = new_svg(108, 108, title, "0 0 108 108")
        append_source_svg(
            dev_icon,
            source_path,
            x=0,
            y=0,
            width=108,
            height=108,
        )
        ET.SubElement(
            dev_icon,
            tag("polygon"),
            {
                "points": DEV_BADGE_POINTS,
                "fill": DEV_RED,
            },
        )
        add_text(
            dev_icon,
            69,
            83,
            "DEV",
            7,
            CREAM,
            weight=600,
            tracking=0.5,
            anchor="middle",
        )
        output_path = (
            master_dir / filename
            if filename == "primary-icon-dev.svg"
            else dev_dir / filename
        )
        outline_svg(dev_icon, output_path, temp_dir, env)

    ios_svg = master_dir / "primary-icon-dev.svg"
    dev_ios_svg = dev_dir / "icon-ios-dev.svg"
    shutil.copyfile(ios_svg, dev_ios_svg)
    export_png(dev_ios_svg, dev_dir / "icon-ios-dev-1024.png", 1024, 1024, env)
    export_png(
        dev_dir / "android-foreground-dev.svg",
        dev_dir / "android-foreground-dev-432.png",
        432,
        432,
        env,
    )
    build_dev_android_monochrome(dev_dir, android_dir, temp_dir, env)

    favicon_svg = dev_dir / "favicon-dev.svg"
    shutil.copyfile(dev_ios_svg, favicon_svg)
    export_png(favicon_svg, dev_dir / "favicon-dev-48.png", 48, 48, env)


def build_dev_android_monochrome(
    dev_dir: Path,
    android_dir: Path,
    temp_dir: Path,
    env: dict[str, str],
) -> None:
    monochrome = new_svg(
        108,
        108,
        "Unfancy Money Tracker Android development monochrome mask with outlined DEV badge",
        "0 0 108 108",
    )
    definitions = ET.SubElement(monochrome, tag("defs"))
    badge_mask = ET.SubElement(
        definitions,
        tag("mask"),
        {
            "id": "dev-badge-knockout",
            "maskUnits": "userSpaceOnUse",
            "x": "0",
            "y": "0",
            "width": "108",
            "height": "108",
        },
    )
    ET.SubElement(
        badge_mask,
        tag("rect"),
        {"x": "0", "y": "0", "width": "108", "height": "108", "fill": "#FFFFFF"},
    )
    ET.SubElement(
        badge_mask,
        tag("polygon"),
        {"points": DEV_BADGE_POINTS, "fill": "#000000"},
    )

    mark = ET.SubElement(monochrome, tag("g"), {"mask": "url(#dev-badge-knockout)"})
    append_source_svg(mark, android_dir / "monochrome.svg", x=0, y=0, width=108, height=108)
    ET.SubElement(
        monochrome,
        tag("polygon"),
        {
            "points": DEV_BADGE_POINTS,
            "fill": "none",
            "stroke": "#FFFFFF",
            "stroke-width": "1.5",
            "stroke-linejoin": "round",
        },
    )
    add_text(monochrome, 69, 83, "DEV", 7, "#FFFFFF", weight=600, tracking=0.5, anchor="middle")

    output = dev_dir / "android-monochrome-dev.svg"
    outline_svg(monochrome, output, temp_dir, env)
    export_png(output, dev_dir / "android-monochrome-dev-432.png", 432, 432, env)


def build_dev_only() -> None:
    with tempfile.TemporaryDirectory(prefix="unfancy-brand-kit-dev-") as temp_name:
        temp_dir = Path(temp_name)
        env = make_font_env(temp_dir)
        build_dev_icons(temp_dir, env)
        build_presentation_board(temp_dir, env)
    print("Built DEV ribbon SVGs, app icons, themed mask, favicon, and presentation preview.")


def build_print_pdfs(env: dict[str, str]) -> None:
    exports = (
        ("primary-icon.svg", "primary-icon.pdf"),
        ("logo-horizontal-color.svg", "logo-horizontal-color.pdf"),
        ("logo-horizontal-reverse.svg", "logo-horizontal-reverse.pdf"),
        ("logo-stacked-color.svg", "logo-stacked-color.pdf"),
        ("wordmark-only-color.svg", "wordmark-only-color.pdf"),
        ("symbol-monochrome-black.svg", "symbol-monochrome-black.pdf"),
    )
    for source_name, output_name in exports:
        subprocess.run(
            [
                "inkscape",
                str(KIT / "masters" / source_name),
                f"--export-filename={KIT / 'print' / output_name}",
            ],
            env=env,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
        )


def main() -> None:
    source_dir = KIT / "source"
    master_dir = KIT / "masters"
    android_dir = KIT / "platform/android"
    ios_dir = KIT / "platform/ios"
    dev_dir = KIT / "platform/dev"
    print_dir = KIT / "print"
    presentation_dir = KIT / "presentation"
    source_dir.mkdir(parents=True, exist_ok=True)
    master_dir.mkdir(parents=True, exist_ok=True)
    android_dir.mkdir(parents=True, exist_ok=True)
    ios_dir.mkdir(parents=True, exist_ok=True)
    dev_dir.mkdir(parents=True, exist_ok=True)
    print_dir.mkdir(parents=True, exist_ok=True)
    presentation_dir.mkdir(parents=True, exist_ok=True)

    source_pairs = (
        ("ios-square.svg", "approved-ios-square.svg"),
        ("android-foreground.svg", "approved-android-foreground.svg"),
        ("android-background.svg", "approved-android-background.svg"),
    )
    for original_name, copy_name in source_pairs:
        shutil.copyfile(CONCEPT / original_name, source_dir / copy_name)
    primary_icon = parse_svg(source_dir / "approved-ios-square.svg")
    title = ET.Element(tag("title"), {"id": "title"})
    title.text = "Unfancy Money Tracker primary app icon"
    primary_icon.insert(0, title)
    primary_icon.set("role", "img")
    primary_icon.set("aria-labelledby", "title")
    write_svg(primary_icon, master_dir / "primary-icon.svg")
    shutil.copyfile(source_dir / "approved-ios-square.svg", ios_dir / "icon-primary.svg")
    shutil.copyfile(source_dir / "approved-android-foreground.svg", android_dir / "foreground.svg")
    shutil.copyfile(source_dir / "approved-android-background.svg", android_dir / "background.svg")

    android_foreground = parse_svg(android_dir / "foreground.svg")
    full_color_symbol = new_svg(108, 108, "Unfancy Money Tracker symbol, full colour", "0 0 108 108")
    for child in android_foreground:
        if child.tag != tag("title"):
            full_color_symbol.append(copy.deepcopy(child))
    write_svg(full_color_symbol, master_dir / "symbol-color.svg")

    for filename, paint in (
        ("symbol-monochrome-navy.svg", INK),
        ("symbol-monochrome-black.svg", "#000000"),
        ("symbol-reverse-cream.svg", CREAM),
    ):
        single_color = new_svg(108, 108, f"Unfancy Money Tracker symbol, {paint}", "0 0 108 108")
        for child in android_foreground:
            if child.tag == tag("title"):
                continue
            cloned = copy.deepcopy(child)
            set_all_paints(cloned, paint)
            single_color.append(cloned)
        write_svg(single_color, master_dir / filename)

    android_monochrome = new_svg(
        108,
        108,
        "Unfancy Money Tracker Android monochrome mask",
        "0 0 108 108",
    )
    for child in android_foreground:
        if child.tag == tag("title"):
            continue
        cloned = copy.deepcopy(child)
        set_all_paints(cloned, "#FFFFFF")
        android_monochrome.append(cloned)
    write_svg(android_monochrome, android_dir / "monochrome.svg")

    with tempfile.TemporaryDirectory(prefix="unfancy-brand-kit-") as temp_name:
        temp_dir = Path(temp_name)
        env = make_font_env(temp_dir)

        lockups = (
            (
                "logo-horizontal-color.svg",
                make_lockup("horizontal logo, full colour", width=460, height=180, arrangement="horizontal", color=INK, icon="tile"),
            ),
            (
                "logo-horizontal-reverse.svg",
                make_lockup("horizontal logo, colour on navy", width=460, height=180, arrangement="horizontal", color=CREAM, icon="tile", reverse=True, subtitle_color=GOLD),
            ),
            (
                "logo-horizontal-navy.svg",
                make_lockup("horizontal logo, one-colour navy", width=460, height=180, arrangement="horizontal", color=INK, icon=INK),
            ),
            (
                "logo-horizontal-reverse-cream.svg",
                make_lockup("horizontal logo, one-colour cream reverse", width=460, height=180, arrangement="horizontal", color=CREAM, icon=CREAM, reverse=True),
            ),
            (
                "logo-stacked-color.svg",
                make_lockup("stacked logo, full colour", width=460, height=350, arrangement="stacked", color=INK, icon="tile"),
            ),
            (
                "logo-stacked-reverse-cream.svg",
                make_lockup("stacked logo, one-colour cream reverse", width=460, height=350, arrangement="stacked", color=CREAM, icon=CREAM, reverse=True),
            ),
            (
                "wordmark-only-color.svg",
                make_lockup("wordmark only, full colour", width=440, height=140, arrangement="wordmark", color=INK, icon="tile"),
            ),
            (
                "wordmark-only-reverse-cream.svg",
                make_lockup("wordmark only, one-colour cream reverse", width=440, height=140, arrangement="wordmark", color=CREAM, icon="tile", reverse=True),
            ),
        )
        for filename, source_root in lockups:
            outline_svg(source_root, master_dir / filename, temp_dir, env)

        build_dev_icons(temp_dir, env)

        build_print_pdfs(env)
        build_presentation_board(temp_dir, env)

    print(f"Built approved logo masters and presentation board under {KIT}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build the Unfancy Money Tracker brand kit.")
    parser.add_argument(
        "--dev-only",
        action="store_true",
        help="Refresh only the DEV SVG/PNG artwork and presentation preview.",
    )
    arguments = parser.parse_args()
    if arguments.dev_only:
        build_dev_only()
    else:
        main()
