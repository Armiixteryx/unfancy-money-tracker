# Unfancy Money Tracker — logo kit

The approved **U + treasure** identity is packaged here for design and product
handoff. The primary icon keeps the original full-bleed navy tile, cream open
entry U, and flat gold coins. The iOS source artwork is preserved unchanged;
Android foreground, background, and monochrome artwork are supplied separately.

## Start here

- [One-page usage guide](usage-guide.md)
- [Handover and validation notes](handover.md)
- [Palette values](palette.json)
- [Presentation board](presentation/presentation-board.png)
- [Presentation source SVG](presentation/presentation-board.svg)
- [Presentation-board HTML](presentation/presentation-board.html)

## Files

- `masters/` — outlined SVG logo masters: horizontal, stacked, wordmark-only,
  symbol-only, monochrome, and reversed.
- `print/` — vector PDF proofs of the primary icon and key lockups.
- `source/` — byte-for-byte copies of the approved iOS and Android source SVGs.
- `platform/ios/` — opaque 1024 × 1024 iOS icon export and SVG master.
- `platform/android/` — separate adaptive-icon SVG/PNG foreground, background,
  and monochrome assets (432 × 432 PNGs).
- `platform/dev/` — separate DEV-ribbon icon artwork for non-production builds;
  clean production artwork remains unchanged.
- `platform/web/` — favicon, PWA icon set, manifest, and HTML head snippet.
- `presentation/` — a brand board with finance/mobile contexts and its
  `presentation_board.py` spec.
- `scripts/build_brand_kit.py` — reproducible generation of outlined masters,
  source copies, print PDFs, and the presentation board. It uses the
  repository's bundled Inter font with Inkscape to outline lettering and
  `rsvg-convert` to rasterize PNG exports; it does not install fonts or change
  app assets. Pass `--dev-only` to refresh only the DEV ribbon artwork, its PNG
  exports, and the presentation preview.

The original approved icon in `source/approved-ios-square.svg` is the primary
icon. The other monochrome and reverse marks are supporting treatments, not
replacements. No app configuration or installed assets were changed.
