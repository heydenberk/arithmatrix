# Arithmatrix Puzzle Game

A beautiful, interactive web-based Arithmatrix (KenKen) puzzle game with modern glass morphism UI, comprehensive mobile support, and a Python backend for puzzle generation.

## Quick Start

```bash
# Install dependencies
npm install

# Start frontend dev server (http://localhost:5173)
npm run dev

# Start both frontend and backend
npm run start:dev

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
├── backend/                # Flask Python backend
│   ├── app.py              # Flask API server (port 5001)
│   ├── arithmatrix.py      # Core puzzle generation algorithm
│   ├── puzzle_generator.py # KenkenGenerator class
│   └── latin_square.py     # Latin square generation
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

**Backend:**
- Python 3.11
- Flask

**Deployment:**
- GitHub Pages at `/arithmatrix/`

## Key Commands

```bash
# Development
npm run dev              # Frontend dev server
npm run backend:dev      # Backend API server
npm run start:dev        # Both frontend + backend

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
- Puzzles stored in `public/all_puzzles.jsonl`
- Each puzzle has `actual_difficulty` field (human-centered)
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
| `backend/arithmatrix.py` | Core puzzle generation (984 lines) |
| `public/all_puzzles.jsonl` | Puzzle database (production) |

## Debugging

- Puzzle stats available at `window.puzzleStats` in browser console
- React DevTools for component inspection
- Backend runs on port 5001 with debug mode

## Known Patterns

### Cage Coloring
Uses graph coloring algorithm with 7 colors to ensure adjacent cages have different colors. See `assignCageColors()` in `arithmatrixUtils.ts`.

### Difficulty System
Uses "human-centered" difficulty based on:
- Cage complexity (operation type + size)
- Constraint density
- Arithmetic difficulty
- Structural complexity

Old `DIFFICULTY_BOUNDS` constant is deprecated - puzzles now filtered by `actual_difficulty` metadata field.

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
