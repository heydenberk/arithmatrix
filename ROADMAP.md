# Arithmatrix Development Roadmap

This document outlines the prioritized next steps for the Arithmatrix puzzle game, based on codebase analysis performed on 2026-01-25.

## Related Documentation

- **[CLAUDE.md](./CLAUDE.md)** - Project overview, architecture, and development guide
- **[PUZZLE_GENERATION_IMPROVEMENT_PLAN.md](./PUZZLE_GENERATION_IMPROVEMENT_PLAN.md)** - Detailed plan for faster puzzle generation and better difficulty accuracy
- **[MOBILE_IMPROVEMENT_PLAN.md](./MOBILE_IMPROVEMENT_PLAN.md)** - Detailed plan for mobile UX improvements

---

## Completed Work

### Codebase Cleanup (2026-01-25)
- Removed 68 vestigial files (~4.5MB)
  - 7 unused TypeScript components/hooks/utils
  - 22 obsolete Python analysis scripts
  - 14 redundant data files
  - 25+ old documentation and config files
- Removed unused `DIFFICULTY_BOUNDS` constant
- Build passes after cleanup (`npm run type-check`)

**Status:** Changes staged, ready to commit

---

## Priority 1: Immediate Actions

### 1.1 Commit Cleanup Changes
**Effort:** 5 minutes

```bash
git add -A
git commit -m "chore: remove vestigial code and add documentation

- Remove 7 unused TypeScript files (components, hooks, utils)
- Remove 22 obsolete Python analysis scripts
- Remove 14 redundant data files
- Remove 25+ old docs, configs, and scripts
- Remove unused DIFFICULTY_BOUNDS constant
- Add CLAUDE.md, ROADMAP.md, and improvement plans"
```

---

## Priority 2: Mobile UX (High Impact)

These issues were discovered during live mobile testing with Chrome DevTools.

### 2.1 Mobile Number Pad
**Effort:** 2-3 hours | **Impact:** Critical for mobile usability

**Problem:** Users cannot easily enter numbers on mobile - no on-screen keyboard appears for the game grid.

**Solution:** Create `MobileNumberPad` component that appears when a cell is selected.

**Details:** See [MOBILE_IMPROVEMENT_PLAN.md](./MOBILE_IMPROVEMENT_PLAN.md#11-mobile-number-pad-overlay)

### 2.2 Settings Panel Redesign
**Effort:** 2-3 hours | **Impact:** High

**Problem:** The "7x7 • Medium" button only shows a tooltip on tap. Users cannot change size or difficulty on mobile.

**Solution:** Replace with touch-friendly segmented controls or bottom sheet panel.

**Details:** See [MOBILE_IMPROVEMENT_PLAN.md](./MOBILE_IMPROVEMENT_PLAN.md#12-navigation-settings-redesign)

---

## Priority 3: Puzzle Generation Performance

For when puzzle regeneration is needed.

### 3.1 Parallel Generation
**Effort:** 1-2 hours | **Impact:** 4-8x speedup

**Problem:** Generating 4000 puzzles takes 2-4 hours (single-threaded).

**Solution:** Wrap existing generation in `ProcessPoolExecutor`.

**Details:** See [PUZZLE_GENERATION_IMPROVEMENT_PLAN.md](./PUZZLE_GENERATION_IMPROVEMENT_PLAN.md#11-parallel-generation)

### 3.2 Difficulty Heuristic
**Effort:** 3-4 hours | **Impact:** 50-70% additional speedup

**Problem:** Full solver runs on every puzzle just to measure difficulty.

**Solution:** Use cage structure heuristics for initial filtering, only full-solve borderline cases.

**Details:** See [PUZZLE_GENERATION_IMPROVEMENT_PLAN.md](./PUZZLE_GENERATION_IMPROVEMENT_PLAN.md#23-difficulty-heuristic-avoid-full-solve)

---

## Priority 4: Quality of Life

### 4.1 Swipe Gestures for Undo/Redo
**Effort:** 1-2 hours | **Impact:** Medium

Add intuitive swipe left/right for undo/redo actions.

### 4.2 Service Worker for Offline Play
**Effort:** 3-4 hours | **Impact:** Medium

Cache puzzles and app shell for offline gameplay.

### 4.3 Human-Centered Difficulty Calibration
**Effort:** 1-2 weeks | **Impact:** High (long-term)

Collect solve time data and calibrate difficulty weights to match human perception.

**Details:** See [PUZZLE_GENERATION_IMPROVEMENT_PLAN.md](./PUZZLE_GENERATION_IMPROVEMENT_PLAN.md#phase-3-difficulty-accuracy-5-7-days)

---

## Summary Table

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| **1** | Commit cleanup | 5 min | Housekeeping |
| **2** | Mobile number pad | 2-3 hrs | Critical |
| **2** | Settings redesign | 2-3 hrs | High |
| **3** | Parallel generation | 1-2 hrs | 4-8x speedup |
| **3** | Difficulty heuristic | 3-4 hrs | 50-70% speedup |
| **4** | Swipe gestures | 1-2 hrs | Medium |
| **4** | Offline play | 3-4 hrs | Medium |
| **4** | Difficulty calibration | 1-2 wks | High (long-term) |

---

## Quick Start

To begin development:

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run both frontend and backend
npm run start:dev

# Check code quality
npm run lint && npm run type-check
```

See [CLAUDE.md](./CLAUDE.md) for full development guide.
