# Roadmap

## 1. Puzzle generation and difficulty overhaul

The current generation pipeline is slow (~2-4 hours for 4000 puzzles) and difficulty estimation is based on solver operation count, which correlates poorly with human-perceived difficulty. This overhaul addresses both problems and is a prerequisite for operation-restricted puzzles (section 2).

See [PUZZLE_GENERATION_IMPROVEMENT_PLAN.md](./PUZZLE_GENERATION_IMPROVEMENT_PLAN.md) for detailed implementation notes. Some items there are already complete (Latin square pooling, fast difficulty heuristic, constraint tracker, adaptive isotopy).

### Generation performance

- **Parallel generation**: wrap existing pipeline in `ProcessPoolExecutor` for 4-8x speedup (the main remaining unchecked item)
- **CLI batch script**: create a standalone script for generating puzzle datasets by size, difficulty, and operation tier
- Target: full regeneration in under 30 minutes

### Human-centered difficulty

The existing `human_analysis.estimated_solve_time_seconds` field in puzzle metadata is a step in the right direction. Remaining work:

- Calibrate difficulty weights against real user solve times (collected via `puzzleStats`)
- Ensure stratified distribution: roughly equal puzzle counts per difficulty bucket per size
- Validate that difficulty labels (easiest through expert) align with actual human experience

### Regenerate puzzle database

Once generation supports operation tiers (section 2) and difficulty is recalibrated:

- Regenerate `all_puzzles.jsonl` with all tier/size/difficulty combinations
- Target: ~50 puzzles per combination (4 tiers x 4 sizes x 5 difficulties = 80 buckets, ~4000 puzzles total)

## 2. Operation-restricted puzzles

Currently all puzzles use all four arithmetic operations. We want users to be able to choose which operations are available, using these progressive tiers:

| Tier | Operations | Label |
|------|-----------|-------|
| 1 | `+` | Addition only |
| 2 | `+` `-` | Add & Subtract |
| 3 | `+` `-` `*` | No Division |
| 4 | `+` `-` `*` `/` | All Operations |

### Puzzle generation

The backend `KenkenGenerator` already accepts an `operations` parameter but it's currently unused during cage assignment. Changes needed:

- Modify `assign_operations()` in `backend/arithmatrix.py` to respect allowed operation lists (skip disallowed operations and fall back to simpler ones)
- Generate puzzle batches for each tier/size/difficulty combination
- Add an `operations_tier` field to each puzzle's metadata in `all_puzzles.jsonl`

### Frontend filtering

Puzzle selection in `App.tsx` currently filters on `size` and `difficulty`. Add a third dimension:

- New URL param (e.g. `?ops=add-sub`) for the selected tier
- Filter `all_puzzles.jsonl` entries by their `operations_tier` metadata
- UI selector for operation tier alongside the existing size/difficulty controls

### UI

- Desktop: add operation tier selector to the new-game controls panel
- Mobile: add operation tier selector to `MobileSettingsPanel`
- Badge display should reflect the current tier (e.g. "7x7 - medium - no division")

## 3. Achievements

An achievements system that rewards completing puzzles at various speeds across all difficulty levels and operation tiers.

### Achievement dimensions

Achievements are defined across three axes:

- **Difficulty level**: easiest, easy, medium, hard, expert
- **Operation tier**: addition only, add & subtract, no division, all operations
- **Grid size**: 4x4, 5x5, 6x6, 7x7

### Time-based tiers

Each combination of difficulty, operation tier, and grid size has multiple time thresholds. Completing a puzzle within a threshold earns that achievement tier:

| Achievement tier | Description |
|-----------------|-------------|
| Bronze | Complete the puzzle |
| Silver | Complete under a generous time target |
| Gold | Complete under a moderate time target |
| Platinum | Complete under a fast time target |

Specific time thresholds should scale with grid size, difficulty, and operation tier. A reasonable starting approach: use `estimated_solve_time_seconds` from puzzle metadata as a baseline, then set Bronze at no limit, Silver at 1.5x estimated, Gold at 1.0x, and Platinum at 0.6x.

Total achievement count: 5 difficulties x 4 operation tiers x 4 grid sizes x 4 time tiers = 320 achievements.

### Data model

```typescript
type Achievement = {
  id: string;                    // e.g. "7x7-expert-all-ops-gold"
  gridSize: number;
  difficulty: string;
  operationTier: string;
  timeTier: 'bronze' | 'silver' | 'gold' | 'platinum';
  unlockedAt: Date;
  completionTimeSeconds: number; // the time that earned it
};
```

Achievements stored in localStorage alongside the existing puzzle stats. The existing `CompletedPuzzleStats` type needs an `operationTier` field so achievement checks can reference it.

### Achievement evaluation

After each puzzle completion (in the `handleWin` flow):

1. Determine which time tier thresholds the completion time meets
2. Check if a higher tier than previously earned for this combination
3. If new or upgraded, store the achievement and show a notification

### UI

- Achievement notification toast on unlock (integrate with the existing win celebration)
- Achievement gallery accessible from the main UI showing:
  - Grid of all possible achievements organized by dimension
  - Locked/unlocked state with tier indicators (bronze/silver/gold/platinum)
  - Progress summary (e.g. "47/320 achievements unlocked")
- Compact achievement icon in the top bar linking to the gallery
