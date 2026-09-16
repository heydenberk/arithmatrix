# Arithmatrix Puzzle Game

A beautiful, interactive web-based Arithmatrix (KenKen) puzzle game with modern glass morphism UI, comprehensive mobile support, and a TypeScript puzzle generator that shares its solver with the game's hints.

## Quick Start

```bash
# Install dependencies
npm install

# Start frontend dev server (http://localhost:5173)
npm run dev

# Regenerate or top up the puzzle corpus (seeded, parallel)
npm run generate:batch -- --count 50 --tiers add,add-sub,no-div,all --max-time 600

# Build for production
npm run build
```

## Project Structure

```
neknek/
├── src/                    # Frontend React/TypeScript source
│   ├── App.tsx             # Main application component
│   ├── components/         # React UI components
│   │   ├── ArithmatrixGrid.tsx      # Main game grid
│   │   ├── ArithmatrixCell.tsx      # Individual cell with touch support
│   │   ├── ArithmatrixControls.tsx  # Game control buttons
│   │   ├── Timer.tsx                # Timer display
│   │   └── ErrorBoundary.tsx        # Error recovery wrapper
│   ├── hooks/              # Custom React hooks
│   │   ├── useArithmatrixGame.ts    # Core game logic (main hook)
│   │   └── useResponsiveLayout.ts   # Mobile responsive calculations
│   ├── types/              # TypeScript definitions
│   │   ├── ArithmatrixTypes.ts      # Game types (Cage, PuzzleDefinition)
│   │   └── GameTypes.ts             # App-level types
│   ├── utils/              # Utility functions
│   │   ├── arithmatrixUtils.ts      # Validation, cage coloring
│   │   ├── gameStatePersistence.ts  # localStorage management
│   │   ├── puzzleStats.ts           # Statistics tracking
│   │   └── touchUtils.ts            # Mobile touch handling
│   └── constants/          # Configuration constants
│       └── gameConstants.ts         # Sizes, difficulties, paths
├── generation/         # Seeded puzzle generation (pure): rng, latin square, carve, operations, coordinator
├── scripts/                # Node tooling: generate-batch, rescore-corpus, calibrate-scoring, pin-scoring-fixtures
├── public/                 # Static assets
│   ├── all_puzzles.jsonl   # Main puzzle database (~7MB, 4000+ puzzles)
│   └── manifest.json       # PWA manifest
├── docs/                   # Documentation
│   ├── ARCHITECTURE.md     # Design patterns and architecture
│   └── DEVELOPMENT.md      # Development guidelines
└── dist/                   # Production build output
```

## Tech Stack

**Frontend:**
- React 19 with TypeScript 5
- Vite (build tool)
- Mantine 8 (UI components)
- Tabler Icons

**Deployment:**
- GitHub Pages at `/arithmatrix/`

## Key Commands

```bash
# Development
npm run dev              # Frontend dev server
npm run generate:batch   # Generate puzzles (see scripts/generate-batch.ts for flags)
npx tsx scripts/rescore-corpus.ts   # Re-score public/all_puzzles.jsonl in place under the current engine

# Code Quality
npm run lint             # Check linting
npm run lint:fix         # Auto-fix lint issues
npm run type-check       # TypeScript validation
npm run format           # Format with Prettier

# Build
npm run build            # Production build
npm run preview          # Preview production build
```

## Game Features

- **Grid sizes:** 4x4, 5x5, 6x6, 7x7
- **5 difficulty levels:** easiest, easy, medium, hard, expert
- **Pencil marks** for candidate tracking
- **Undo/redo** with full history
- **Timer** with pause/resume
- **URL-based state sharing** (size and difficulty in URL)
- **Auto-save** to localStorage
- **Mobile touch support** with gestures

## Architecture Notes

### State Management
- No Redux/Context - uses custom hooks only
- `useArithmatrixGame` is the main game logic hook
- URL params sync game settings
- localStorage persists game state

### Puzzle Data
- Puzzles stored in `public/all_puzzles.jsonl` (fetched as `?v=CORPUS_VERSION` to bust the PWA cache)
- Each record has `actual_difficulty` (band within its size), `difficulty_score` (cross-size 0-100), `raw_score`, `scoring_version`, and for generated-in-TS records a `seed`
- Filtered at load time by size and difficulty

### Mobile Support
- Touch gesture recognition (tap, long-press)
- Responsive breakpoints: 480px, 768px, 1024px
- Minimum 44px touch targets
- PWA manifest for app-like experience

## Code Style

- **Components:** PascalCase (`ArithmatrixGrid.tsx`)
- **Hooks:** camelCase with `use` prefix (`useArithmatrixGame.ts`)
- **Utils:** camelCase (`arithmatrixUtils.ts`)
- Single quotes, semicolons, 2-space indentation

## Versioning (MANDATORY)

- App version lives in `src/version.ts` (`APP_VERSION` constant)
- **IMPORTANT: You MUST bump the version in `src/version.ts` before EVERY push to remote. No exceptions. This is a hard requirement — never run `git push` without first bumping `APP_VERSION`.**

## Important Files

| File | Purpose |
|------|---------|
| `src/App.tsx` | Main app, puzzle loading orchestration |
| `src/hooks/useArithmatrixGame.ts` | All game logic, validation, history |
| `src/components/ArithmatrixGrid.tsx` | Grid rendering with cage colors |
| `src/utils/arithmatrixUtils.ts` | Validation, graph coloring algorithm |
| `src/utils/solver.ts` | Technique solver, uniqueness counter, `scorePuzzle`/`assessPuzzle` |
| `src/utils/difficulty.ts` | Scoring model and `SCORING_VERSION`; calibration in `scoringCalibration.ts` |
| `src/generation/` | Seeded generator and batch coordinator |
| `public/all_puzzles.jsonl` | Puzzle database (production) |

## Debugging

- Puzzle stats available at `window.puzzleStats` in browser console
- React DevTools for component inspection

## Known Patterns

### Cage Coloring
Uses graph coloring algorithm with 7 colors to ensure adjacent cages have different colors. See `assignCageColors()` in `arithmatrixUtils.ts`.

### Difficulty System
Technique-based: the solver rates a puzzle by the cheapest reasoning that solves it (`src/utils/difficulty.ts`, `SCORING_VERSION`). The 0-100 `difficulty_score` is on one cross-size scale; the named band (`actual_difficulty`) is assigned within a size by quantile. Any change to ratings: bump `SCORING_VERSION`, run `scripts/calibrate-scoring.ts`, `scripts/rescore-corpus.ts`, `scripts/pin-scoring-fixtures.ts`, and bump `CORPUS_VERSION` in `gameConstants.ts`.

### App Icons
Generated from one source by `python3 scripts/generate_icons.py` (full bleed — platforms apply their own rounding and masking). Icon URLs carry `?v=<n>` in **both** `index.html` and the manifest `icons` in `vite.config.ts`; **bump both on every icon change**. Redrawing the art is not enough to reach an installed app: the OS bakes the icon in at install time, Android's Chrome rebuilds its WebAPK only when it sees the manifest differ (a new URL is the signal it acts on), and iOS never revisits the icon at all — a home-screen copy there changes only when removed and re-added.

### Touch Gestures
- Tap: select cell
- Long-press (400ms): toggle pencil mode
- All touch targets minimum 44px

## Files to Ignore

The following are analysis/experiment artifacts not part of the main codebase:
- `*.py` files in root (except in `backend/`)
- `test_*.jsonl` files
- Various `*_SUMMARY.md` and `*_ANALYSIS.md` files
- `compressed_puzzles.jsonl`, `ultra_compressed_puzzles.jsonl`
