#!/usr/bin/env python3
"""Build transparent AppBrand raster variants from the approved SVG masters."""

from __future__ import annotations

import copy
import shutil
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path


SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)

ROOT = Path(__file__).resolve().parents[3]
KIT = ROOT / "artifacts/brand-kit"
INK = "#102A43"


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def remove_background_rectangles(root: ET.Element) -> None:
    width = root.get("width")
    height = root.get("height")
    full_lockup_backgrounds = [
        child
        for child in root
        if local_name(child.tag) == "rect"
        and child.get("x", "0") == "0"
        and child.get("y", "0") == "0"
        and child.get("width") == width
        and child.get("height") == height
        and child.get("fill", "").upper() == INK
    ]
    if len(full_lockup_backgrounds) != 1:
        raise ValueError(f"Expected one full-canvas navy background rectangle, found {len(full_lockup_backgrounds)}")

    icon_canvases = [
        child
        for child in root
        if local_name(child.tag) == "svg"
        and child.get("x") == "24"
        and child.get("y") == "24"
        and child.get("width") == "132"
        and child.get("height") == "132"
    ]
    if len(icon_canvases) != 1:
        raise ValueError(f"Expected one horizontal-lockup symbol canvas, found {len(icon_canvases)}")
    symbol_backgrounds = [
        child
        for child in icon_canvases[0]
        if local_name(child.tag) == "rect"
        and child.get("x", "0") == "0"
        and child.get("y", "0") == "0"
        and child.get("width") == "108"
        and child.get("height") == "108"
        and child.get("fill", "").upper() == INK
    ]
    if len(symbol_backgrounds) != 1:
        raise ValueError(f"Expected one full-symbol navy background rectangle, found {len(symbol_backgrounds)}")

    root.remove(full_lockup_backgrounds[0])
    icon_canvases[0].remove(symbol_backgrounds[0])


def replace_nested_symbol_with_navy(root: ET.Element) -> None:
    icon_canvases = [
        child
        for child in root
        if local_name(child.tag) == "svg"
        and child.get("x") == "24"
        and child.get("y") == "24"
        and child.get("width") == "132"
        and child.get("height") == "132"
    ]
    if len(icon_canvases) != 1:
        raise ValueError(f"Expected one horizontal-lockup symbol canvas, found {len(icon_canvases)}")

    monochrome = ET.parse(KIT / "masters/symbol-monochrome-navy.svg").getroot()
    nested_symbol = icon_canvases[0]
    for child in list(nested_symbol):
        nested_symbol.remove(child)
    for child in monochrome:
        if local_name(child.tag) != "title":
            nested_symbol.append(copy.deepcopy(child))


def export_lockup(root: ET.Element, derivative: Path, output: Path, rasterizer: str) -> None:
    derivative.parent.mkdir(parents=True, exist_ok=True)
    ET.ElementTree(root).write(derivative, encoding="UTF-8", xml_declaration=True)
    subprocess.run(
        [rasterizer, "--width", "1200", "--height", "470", "--output", str(output), str(derivative)],
        check=True,
    )
    print(f"Generated {output.relative_to(ROOT)}")


def main() -> None:
    rasterizer = shutil.which("rsvg-convert")
    if rasterizer is None:
        raise SystemExit("rsvg-convert is required to build transparent brand assets")

    reverse = ET.parse(KIT / "masters/logo-horizontal-reverse-cream.svg").getroot()
    backgrounds = [child for child in reverse if local_name(child.tag) == "rect"
                   and child.get("width") == "460" and child.get("height") == "180"
                   and child.get("fill", "").upper() == INK]
    if len(backgrounds) != 1:
        raise ValueError("Expected one cream-lockup background")
    reverse.remove(backgrounds[0])
    export_lockup(reverse, KIT / "exports/logo-horizontal-reverse-transparent.svg",
                  KIT / "exports/logo-horizontal-reverse-transparent.png", rasterizer)
    subprocess.run([rasterizer, "--width", "432", "--height", "432", "--output",
                    str(KIT / "exports/symbol-reverse-cream-transparent.png"),
                    str(KIT / "masters/symbol-reverse-cream.svg")], check=True)

    light = ET.parse(KIT / "masters/logo-horizontal-color.svg").getroot()
    replace_nested_symbol_with_navy(light)
    export_lockup(
        light,
        KIT / "exports/logo-horizontal-color-transparent.svg",
        KIT / "exports/logo-horizontal-color-transparent.png",
        rasterizer,
    )


if __name__ == "__main__":
    main()
