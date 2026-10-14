# Unfancy Money Tracker — round 2

Status: three new directions for discussion, not an approved identity.
The first round did not convince the user. Do not treat its U, brackets, or
“un” ribbon as constraints for this round. App assets remain unchanged.

## Strategy

Keep the working brief: practical, calm, approachable, legible at app-icon size.
Explore greater personality rather than incremental geometry changes.
No dollar signs, coins, investment arrows, shields, or bank emblems.
Black-first proposals only; no full kit before approval.

Word map: unfancy → matter-of-fact, plain print, less ornament;
manual tracking → tally, counting, one entry at a time;
monthly budget → room, reserve, a little left.

## Longlist

| Idea | Directional assessment |
| --- | --- |
| Matter of fact — custom soft slab letters | Build: a typographic change of voice |
| Count on it — fifth tally cut out of four strokes | Build: familiar counting, unfamiliar execution |
| Room left — unequal pieces of a soft block | Build: minimal abstract silhouette, no financial iconography |
| One line — a letter with an extended ruled baseline | Too dependent on tiny typographic detail |
| Plain paper — a fold interrupts a record line | Too close to a notes/document app |
| Small print — a square-ended f with a punctuation dot | Dot is decoration, not another useful idea |
| Even keel — paired horizontal curved slabs | Too close to an ordinary equals sign |
| Daily rhythm — three fanned pill shapes | Could read as a crown or a flower |
| No extras — a minus cut into a rounded tile | Risks a delete or no-entry reading |
| Quiet tab — a stepped tab makes a letter counter | Too similar to generic folder iconography |

The three selected ideas span custom typography, a negative-space pictorial mark,
and an abstract symbol. Originality is a design assessment, not legal clearance.
The library was searched for tally/counting, ligatures, letterforms, and notches.
Studied Wire and Go for integrated type construction; earlier reference study
also included Pagekit, Patreon, Framer, and Kotlin. None is a tracing source.

## Construction

### A — Matter of fact

A custom lowercase wordmark with slab terminals, sturdy bowls, a wide f crossbar,
and a descending y. Drawn directly as paths, not set in a stock font.
The lowercase f is a compact identifying companion, not an acronym.
It is an unconventional initial choice: the distinctive letter comes from inside
the name, so the full wordmark is important while recognition is built.

### B — Count on it

Four 32-unit rounded tally strokes on a 56-unit pitch. Their fifth crossing
stroke is an empty 30-degree channel rather than another layer of ink.
32-unit vertical clearance gives about 28 units of normal clearance.
This is counting, not a rising performance chart.

### C — Room left

A 192-unit rounded block split into a broad body and a smaller remaining piece.
The 32-unit gap is a deliberately visible amount of breathing room.
Only the outside corners curve; the split edges stay straight.
Possible reading: an open book, a pause control, or a split tile.

## Refinement

Rendered and inspected the first concept overview and Chrome test sheet.
Version 2 balances A's symbol and wordmark margins, adds optical overshoot and
slab terminals to its c, opens B's diagonal clearance from 24 to 32 units,
and opens C's split from 24 to 32 units while retaining its 48-unit corner radii.
Version 1 files remain available for comparison.

## Validation and recommendation

Ran `svg_audit.py` on the symbols and A's wordmark in both passes.
Final symbol scores: A 99/100, B 100/100, C 100/100; no FAIL findings.
A's wordmark scores 99/100, with an informational complexity notice for its
161 anchors across seven letters. A's raised vertical alignment is intentional.

Rendered both concept overviews with `rsvg-convert` and both test sheets with
Chrome; inspected the images. Reviewed the final B/C sheets at a readable crop,
including 16/32/48 px raster tests, white-on-black, blur, mirror, rotation, and
app-icon context. B's diagonal remains visible at 16 px but its rounded tips
become less distinct; a final kit should include a pixel-tuned small-size cut.
C has the strongest low-detail silhouette. A's full wordmark is intended for
headers, not a 16 px favicon; its companion f fills that role.

Recommend B for its connection to manual tracking and its distinctive cut.
A is the most typographically characterful option, but the standalone f needs
the wordmark to establish its association with Unfancy. C is the quietest,
with a greater risk of reading as a generic split-tile or pause symbol.

`git diff --check` passed. No application builds, tests, or physical-device
checks were run: nothing in the runtime app changed.
Library research and visual inspection do not constitute trademark clearance.

## File and licensing boundaries

A's headline lettering is original geometric drawing with no font dependency.
B/C's wordmarks and their small descriptors are live Arial/Helvetica type
studies, not final production files. If selected, their type needs refinement,
licensing confirmation, and conversion to paths.
This round is not a palette, web-icon set, or trademark clearance.
