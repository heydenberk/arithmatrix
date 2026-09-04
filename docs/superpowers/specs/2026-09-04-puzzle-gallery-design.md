# Puzzle Gallery — Design

Date: 2026-09-04
Status: Implemented

## Problem

The only way to start a game is "pick size + difficulty, get a random puzzle from
that bucket". There is no way to see what is available, to pick a specific
puzzle, or to tell which puzzles have already been solved.

The database also carries a numeric `difficulty_score` (0–100) that the five
named tiers are merely bands of. That finer signal is never surfaced.

## Requirements

A secondary way to start a game — the existing flow stays primary:

- Gallery layout, one tile per puzzle, previewing the puzzle itself.
- Filters at the top for operations tier and grid size.
- Grouped by numeric difficulty.
- Completed puzzles shown as completed, with the ability to filter them out.

## Data

`public/all_puzzles.jsonl` is a balanced lattice: 4 sizes × 4 operations tiers ×
5 difficulty tiers = 4000 puzzles; 250 per (size, tier). Named tiers map to
fixed score bands: easiest <20, easy 20–40, medium 40–60, hard 60–80,
expert 80–100.

A puzzle's identity is its line number in the JSONL.

## Design

### `utils/puzzleCatalog.ts` — shared data layer

Before this change, four separate places fetched and parsed the same 7MB file:
the main puzzle loader (on *every* new game), the index lookup that runs after
restoring saved state, and the dev panel (with a hardcoded path). The gallery
would have been a fifth.

The catalog fetches and parses once behind a memoized module promise and exposes
`CatalogEntry { index, size, operationsTier, difficulty, score, cagesSig, record }`.
All consumers share that single parse. A rejected load is not cached, so a later
call can retry.

It also owns:

- `canonicalCagesSig` — order-independent content hash of a puzzle's cages,
  moved here from `App.tsx`.
- `groupByScoreBand` — buckets entries into 10-point bands, ascending, omitting
  empty bands.
- `completedSignatures` — the set of solved puzzles.

### Completion identity

`CompletedPuzzleStats` never stored a puzzle index, but it does store the full
cage list. Matching on cage signature therefore lights up **existing** history
retroactively, not just puzzles solved from here on. New completions also record
`puzzleIndex` for directness.

### `components/PuzzleThumbnail.tsx`

An SVG preview: hairlines per cell edge, a heavier outline per cage boundary,
and each cage's target in its top-left cell.

SVG rather than DOM cells because a filtered view holds 250 puzzles, and one
`<div>` per cell would run to five figures of nodes. Every cage boundary in a
puzzle collapses into a single `<path>`, so a 7×7 preview costs ~12 nodes.
Measured: 250 thumbnails at 7×7 build in 15.4ms (5.4ms geometry, 10ms DOM),
5,634 nodes. No virtualization needed.

### `components/PuzzleGallery.tsx`

Mantine `Modal`, `fullScreen` on mobile, mirroring `AchievementGallery`.

- Sticky header: size and operations segmented controls, a "Hide completed"
  switch, and an "N of M completed" progress line reported against the whole
  filter regardless of what is hidden.
- Body: one section per score band, headed `40–50 · medium · <count>`.
- Tiles: thumbnail + numeric score, green border and check badge when solved,
  indigo border for the puzzle currently in play. Tap plays that exact puzzle.

Opens pre-filtered to the size and tier currently in play.

### Launching a specific puzzle

`App.tsx` already had a pin-a-puzzle handler inline in the dev panel's props.
That is extracted to `loadPuzzleRecord(record, index)` and shared by the gallery
and the dev panel, rather than adding a parallel path.

The chosen puzzle is written to the URL as `?p=<index>`, so it survives a reload
and can be shared. Starting a random new game drops the parameter. On startup a
saved game in progress takes precedence over `?p=`, so reloading mid-puzzle
resumes rather than restarting.

## Addendum: unfiltered operations

The operations filter gained an "Any" option, so the gallery can be browsed
without filtering by operations at all. Size stays single-select.

That makes the worst case 1000 tiles (4 tiers x 250) rather than 250, and the
cost turned out to be non-linear: laying out ~23k SVG nodes measured 535ms here,
which would be seconds on a phone. Fixed with `content-visibility: auto` on each
thumbnail, which skips layout and paint for off-screen previews: 535ms -> 21ms,
with an identical total container height (11440px) confirming no layout shift -
the SVG's box is fixed by `width` plus `aspect-ratio`, not by the contents being
skipped.

Tiles show their operations tier only when the filter is "Any", since that is
the only time the value differs between visible tiles.

## Out of scope

Search, sort options, pagination controls.

## Deviation from the approved mockup

The mockup's tile caption showed the operations tier alongside the score. Since
operations is a single-select filter, every visible tile would show the same
value, so the caption carries the score only.
