#!/usr/bin/env python3
"""Publish approved browser artwork; regenerate DEV sizes with rsvg-convert."""

from __future__ import annotations

import copy
import json
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KIT = ROOT / "artifacts/brand-kit/platform"
PUBLIC = ROOT / "public/brand"
NAVY = "#102A43"
SVG = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG)


def rasterize(source: Path, destination: Path, size: int) -> None:
    subprocess.run(
        ["rsvg-convert", "--width", str(size), "--height", str(size),
         "--output", str(destination), str(source)],
        check=True,
    )


def build() -> None:
    if not shutil.which("rsvg-convert"):
        raise SystemExit("rsvg-convert is required to regenerate DEV browser icons.")
    for variant in ("production", "development"):
        output = PUBLIC / variant
        output.mkdir(parents=True, exist_ok=True)
        production = variant == "production"
        if production:
            for name in ("favicon.svg", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "maskable-512.png"):
                shutil.copyfile(KIT / "web" / name, output / name)
        else:
            source = KIT / "dev/favicon-dev.svg"
            shutil.copyfile(source, output / "favicon.svg")
            for name, size in (("apple-touch-icon.png", 180), ("icon-192.png", 192), ("icon-512.png", 512)):
                rasterize(source, output / name, size)
            # The entire 288px source tile fits inside the central 80% safe circle.
            # Preserve the approved artwork and ribbon without cropping or repainting.
            maskable = ET.Element(f"{{{SVG}}}svg", {"width": "512", "height": "512", "viewBox": "0 0 512 512"})
            ET.SubElement(maskable, f"{{{SVG}}}rect", {"width": "512", "height": "512", "fill": NAVY})
            artwork = ET.parse(source).getroot()
            nested = ET.SubElement(maskable, f"{{{SVG}}}svg", {
                "x": "112", "y": "112", "width": "288", "height": "288",
                "viewBox": artwork.get("viewBox", "0 0 108 108"),
            })
            nested.extend(copy.deepcopy(list(artwork)))
            with tempfile.TemporaryDirectory(prefix="unfancy-web-brand-") as temporary:
                svg_path = Path(temporary) / "maskable.svg"
                ET.ElementTree(maskable).write(svg_path, encoding="utf-8", xml_declaration=True)
                rasterize(svg_path, output / "maskable-512.png", 512)
        manifest = {
            "id": "/unfancy-money-tracker" if production else "/unfancy-money-tracker-dev",
            "name": "Unfancy Money Tracker" if production else "Unfancy Money Tracker (Dev)",
            "short_name": "Unfancy" if production else "Unfancy Dev",
            "start_url": "/", "scope": "/", "display": "standalone",
            "theme_color": NAVY, "background_color": NAVY,
            "icons": [
                {"src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
                {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
                {"src": "maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
            ],
        }
        (output / "site.webmanifest").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("Published production and DEV browser branding under public/brand.")


if __name__ == "__main__":
    build()
