# Unfancy Money Tracker — first-round logo concepts

Status: exploration, awaiting direction approval. No app assets or product behavior changed.

## Brief and assumptions

- Name: **Unfancy Money Tracker**; use “Unfancy” as the visual headline, not a product rename.
- Audience: individuals and families wanting an understandable monthly view without banking complexity.
- Personality: calm, practical, approachable, clear, understated.
- Main uses: phone app icon, browser favicon, app header, portfolio.
- Existing equity: the navy tile and cream U in `assets/icon.svg`.
- Explore in black first. Navy, warm cream, and emerald remain possible palette inputs, not approved logo colors.
- Success: a clear silhouette at 16/32/64 px; one-color reproduction; a recognizable identifying detail.
- User approval is required before a final kit or integration.

## Research and strategy

The bundled payments/fintech library contains 37 examples. Blue is the most common
single color family; circles, negative space, and containment are common devices.
Studied Patreon, Pagekit, Framer, and Kotlin for economical silhouette construction,
not as drawings to copy. Searched ledger and bracket subjects; bracket devices
are especially common in developer tooling.

Avoid: currency signs, coins, growth arrows, shields, globes, bank architecture,
and chart bars that imply investment performance.

Word map: unfancy → plain, direct, unadorned, “un”; tracking → entry, line,
margin, rhythm; calm → space, level, open; clarity → separation, one view.
Intersections: U + entry line; margin + space; “un” + continuous rhythm.

## Longlist

Scores are a directional design judgment, 1–5 each for clarity / distinction /
simplicity / relevance / small-size strength, not an empirical study.

| Concept | One idea | Scores |
| --- | --- | --- |
| Open entry | A U with a separated top-right ledger line. | 5/4/5/5/4 |
| The margin | Two offset corners frame a generous unoccupied center. | 4/3/5/4/5 |
| Plainspoken | Connected lowercase “un” makes a down/up rhythm. | 4/4/4/5/4 |
| Level headed | A short line rests over a wide horizontal bar. | 3/2/5/3/5 |
| One page | A paper corner folds into a U. | 3/2/3/4/3 |
| Quiet tally | Three entries meet one shared baseline. | 4/2/4/4/4 |
| Full stop | A plain u ends in a prominent punctuation dot. | 4/2/5/4/5 |
| Breathing room | A heavy enclosure leaves an unusually large counter. | 3/2/5/4/5 |
| Unadorned | A custom wordmark removes ornamental terminals. | 4/3/4/5/2 |
| In view | An open frame makes one central entry conspicuous. | 3/2/4/4/4 |

Build the first three: an equity-preserving letterform, an abstract mark, and a
two-letter monogram. Recommend Open entry provisionally.

## Construction

- **A — Open entry:** 40-unit U stems, flat base with 72/32-unit concentric corners;
  a detached 88 × 40-unit entry bar. The 24-unit vertical gap is intentional.
- **B — The margin:** two 36-unit corner bands on a 256-unit canvas; opposed
  32-unit openings and a broad empty center. Square construction, no diagonals.
- **C — Plainspoken:** a continuous “un” ribbon with 32-unit stems; circular
  outer/inner bowl radii 56/24. Both letters share one stem, not two overlapping stems.

Each symbol is filled vector geometry; no strokes, masks, filters, raster content,
or font dependency. Horizontal lockups are typographic studies only: live
Arial/Helvetica fallback text, not finished masters. A final selected wordmark
requires type refinement, an appropriate font license, and outlined lettering.

## Refinement and validation

First pass: rendered all three in a concept overview and browser-rendered test
sheet. A sat too low; B's openings were unnecessarily tight; C had a heavy shared
junction, unequal heights, and off-center placement.

Second pass: moved A upward 12 units, opened B's gaps from 20 to 32 units, and
rebuilt C with a single 32-unit shared stem and matching top/bottom extents.
Version 1 sources are retained for comparison.

Ran `svg_audit.py` on both rounds. The version-2 symbols scored 99/100,
100/100, and 100/100 respectively, with no FAIL findings. A's slightly raised
vertical position is intentional. The exploratory lockups fail the final-master
live-text rule as expected; they must not be used as production masters.

Rendered and inspected the concept overviews using `rsvg-convert` and the
test sheets using Chrome. Checked scale, one-color/reversed appearance, blurred,
mirrored, and rotated treatments. The small-size silhouettes remain visible;
C reads more as a continuous shape than as two explicit letters at 16 px.
Use white artwork, not the original black artwork, on dark surfaces.
`preview.html` includes a category shelf comparison for further review.
`git diff --check` passed. No application tests or device checks were run,
because these files are standalone design proposals with no runtime integration.

Risks to judge with the user: A may resemble a container or stylized G; B can
read as a scan/frame tool rather than finance; C's flowing “un” can read as an
abstract wave when tiny. These are interpretation risks, not legal clearance.

## Checkpoint boundaries

Only concepts and test/presentation sheets belong in this round. No approved
palette, production favicon, app-icon set, packaging, or final usage guide yet.
Library comparison is not a trademark search or legal clearance. A professional
clearance check is still needed before adopting any direction.
