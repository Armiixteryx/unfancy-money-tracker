# Unfancy Money Tracker — logo usage

## Identity

The primary icon is the approved **U + treasure**: a full-bleed navy tile holds
the cream open-entry U above flat, layered gold coins. The symbol stays simple
and calm; do not add coin outlines, an enclosing coin, or decorative effects.

Use the horizontal lockup for app headers and web navigation, the stacked
lockup for square layouts, the wordmark-only treatment when the icon is already
present nearby, and the square primary icon for launchers and avatars.

## Clear space and minimum size

- Keep at least one U-stem width of clear space around a standalone symbol or
  lockup (about 8% of the icon tile width).
- Use the horizontal lockup at 240 px wide or larger on screen, and 30 mm wide
  or larger in print so “MONEY TRACKER” remains readable.
- Use the symbol at 24 px or larger where possible. The supplied favicon exports
  are optically suited for 16, 32, and 48 px browser contexts.
- Use the iOS master as an opaque 1024 × 1024 square. Let iOS apply its own
  rounded mask; do not round the source artwork yourself.
- For Android adaptive icons, use the separate foreground, navy background,
  and monochrome mask. Do not bake the background into the foreground.
- Non-production builds may use `platform/dev/`'s solid `#C63D3D` DEV-ribbon
  variant with cream path-outlined letters. Keep release builds on the clean
  production artwork.

## Approved colour

| Role | HEX | RGB | Approx. CMYK | Approx. spot reference |
|---|---|---|---|---|
| Deep navy | `#102A43` | 16, 42, 67 | 76, 37, 0, 74 | PANTONE 7546 C |
| Warm cream | `#F7F5F0` | 247, 245, 240 | 0, 1, 3, 3 | PANTONE 7527 C |
| Coin top gold | `#F0CA72` | 240, 202, 114 | 0, 16, 53, 6 | PANTONE 7409 C |
| Coin side gold | `#B9802D` | 185, 128, 45 | 0, 31, 76, 27 | PANTONE 7563 C |

Use the full-colour icon on cream or a quiet light surface. `symbol-color.svg`
is the foreground artwork without a tile; place it only on a solid navy field
so the cream U stays visible. Use the cream one-colour reverse on navy or another
dark, uniform surface. Use the navy one-colour mark on cream or white. The spot
references and CMYK values are starting points only; verify them against a
physical colour guide and the printer's ICC profile before production.

Use `print/*.pdf` for vector artwork handoff and `masters/*.svg` for design and
digital use. The PDFs preserve the logo geometry but remain RGB; have the
printer convert and proof them against the required press profile.

## Typography

Logo lettering is set in **Inter SemiBold 600**, with “MONEY TRACKER” in
tracked uppercase. Every delivered logo SVG has outlined lettering, so no font
is required to display or reproduce a logo. Inter is bundled by the application
under the SIL Open Font License 1.1; see `assets/fonts/inter-LICENSE_FONT`.

## Use and avoid

- Keep the U, coin arrangement, and colour roles intact. Use only the supplied
  lockups and variants; do not retype or rearrange the wordmark.
- Do not stretch, squash, rotate, add outlines/shadows/gradients, or place the
  full-colour mark on a busy background.
- Do not add enclosing coin artwork or broken-line coin outlines. Do not use
  the rejected `broken-lines-v2` exploration or the modified concept
  `build_preview.py` output.
- Do not use a coloured app tile as a bank card, payment card, or account
  product cue; this identity represents the personal-finance tracker only.

Use `handover.md` for production notes and validation results.
