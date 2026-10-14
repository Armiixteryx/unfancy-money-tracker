# Handover — approved U + treasure identity

## Design decisions

- **Primary icon:** the approved original iOS square artwork is retained
  byte-for-byte in `source/approved-ios-square.svg` and
  `platform/ios/icon-primary.svg`. The production master adds only an accessible
  SVG title; its geometry remains the original full-bleed navy background, cream
  Open entry U, and flat gold coins without broken-line outlines or an enclosing
  silver coin.
- **Android:** the original foreground and background remain separate. The
  monochrome drawable uses the same foreground geometry as a single-colour
  alpha mask for Android themed icons.
- **Non-production builds:** a separate DEV-ribbon icon is supplied for iOS
  and Android. Its solid `#C63D3D` red ribbon carries cream `#F7F5F0`
  path-outlined lettering over the lower-right coin area, leaving the U clear
  and staying within the launcher mask. The DEV red is an auxiliary badge
  colour, not an addition to the approved production palette. No build/runtime
  configuration was changed.
- **Lockups:** “Unfancy” is the visual headline, with “MONEY TRACKER” as its
  descriptor. The name is set in Inter SemiBold 600; the all-caps descriptor
  uses deliberate tracking. Inkscape converted all logo lettering to vector
  paths. The source font is the repository's Inter, licensed under SIL OFL
  1.1; the font software itself is not redistributed in this kit.
- **Colour:** the approved source values were preserved: `#102A43`,
  `#F7F5F0`, `#F0CA72`, and `#B9802D`. CMYK and Pantone values in the guide are
  approximate and need print proofing.
- **Print:** vector PDF proofs are supplied for the primary icon and main
  lockups. They preserve outlined paths in RGB; the printer should convert and
  proof to the intended press profile rather than treating the approximate
  palette table as a colour-managed PDF.
- **Presentation mockups:** the phone and web dashboard use only illustrative
  labels and placeholder values; they are not product screenshots and contain
  no personal financial data. No payment-card or bank-account mockup is used.

## Build and validation

Run `python3 artifacts/brand-kit/scripts/build_brand_kit.py` from the repository
root to regenerate the masters, platform SVG sources, print PDFs, and
presentation board. To refresh only the DEV artwork, its PNG exports, and the
presentation preview, run
`python3 artifacts/brand-kit/scripts/build_brand_kit.py --dev-only`. The script
uses the bundled Inter font through a temporary Fontconfig config and Inkscape
to outline the logo text and export print proofs; `rsvg-convert` rasterizes the
PNG exports and presentation preview. No font is installed or copied into the
kit.

Validation performed:

- Approved iOS, Android foreground, and Android background SVG source copies
  match the original files byte-for-byte.
- `svg_audit.py` checked 17 SVGs with no FAIL findings (heuristic scores 73–98;
  primary icon 90, colour symbol 98, colour horizontal lockup 81, stacked
  colour lockup 73, one-colour reverse horizontal 91, Android foreground 97).
  The source icon and colour lockups retain intentional clipping from the
  approved iOS 1.5× artwork inside nested square SVG viewports. Higher anchor
  counts come from preserved coin art and outlined Inter letterforms; the
  stacked audit also flags descriptor details at tiny sizes, so follow the
  minimum-size guidance.
- Rendered and visually inspected the primary icon at 16/32/48 px, the
  full-colour and reversed lockups, the stacked lockup, the DEV badge, platform
  exports, and the presentation board. iOS export is opaque 1024 × 1024;
  Android exports are separate 432 × 432 foreground/background/monochrome
  files; web exports include 16/32/48 favicon sizes, 180 Apple touch icon,
  192/512 PWA icons, and a 512 maskable icon.
- Rendered the one-colour mark alongside the finance-library references Patreon,
  Square, Ethereum, and Adyen at 128 px; the silhouette remains distinct. This
  is a visual comparison, not trademark clearance.
- `presentation_board.py` generated the five-slide HTML handover board.
  `preview_sheet.py` generated its size/context and four-reference sheet; Chrome
  was unavailable, so that sheet was not browser-screenshot rendered. Key sizes,
  reverse/monochrome versions, launcher masks, and the presentation board were
  rendered directly and visually inspected.
- Inkscape generated six vector print PDFs; `pdfimages -list` and `pdffonts`
  reported no embedded raster images or font resources in the horizontal PDF.
- `git diff --check` passed. A scoped `.gitignore` exception keeps only these
  brand-kit iOS/Android exports visible; app assets and app configuration remain
  unchanged.
- No app assets, app configuration, or runtime behavior were changed.
- The DEV badge uses the non-production-only `#C63D3D` ribbon and cream
  path-outlined letters; its SVG and PNG exports and presentation preview are
  generated together by the `--dev-only` command.

## Open before public launch

- Run a professional trademark and reverse-image search. This handover is not
  legal clearance.
- Proof the approximate print colours against a physical Pantone guide and the
  printer's ICC profile before ordering printed materials.
- Recheck the launcher masks against current iOS/Android store requirements
  before publishing. The delivered artwork is a source kit, not a store upload.
