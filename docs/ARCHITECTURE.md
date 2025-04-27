# 🏗️ Architecture Documentation

This document outlines the architecture and design patterns used in the KenKen Puzzle application.

## 📋 Table of Contents

- [Overview](#overview)
- [Design Principles](#design-principles)
- [Custom Hooks](#custom-hooks)
- [Component Architecture](#component-architecture)
- [State Management](#state-management)
- [Type System](#type-system)
- [Performance Optimizations](#performance-optimizations)
- [Error Handling](#error-handling)

## 🎯 Overview

The KenKen Puzzle application follows a modern React architecture with emphasis on:

- **Separation of Concerns** - Logic separated from presentation
- **Reusability** - Components and hooks designed for reuse
- **Type Safety** - Comprehensive TypeScript coverage
- **Performance** - Optimized rendering and data handling
- **Maintainability** - Clear structure and documentation

## 🎨 Design Principles

### 1. Composition over Inheritance

Components are built using composition patterns, making them flexible and easy to test.

```typescript
// Good: Compositional approach
<GameContainer>
  <GameGrid />
  <GameControls />
  <GameSettings />
</GameContainer>

// Avoid: Monolithic components
<MonolithicGameComponent />
```

### 2. Single Responsibility Principle

Each component and hook has a single, well-defined responsibility.

```typescript
// usePuzzleData: Only handles puzzle loading and caching
// useGameSettings: Only handles settings and URL sync
// useTimer: Only handles timer functionality
```

### 3. Props Down, Events Up

Data flows down through props, events bubble up through callbacks.

```typescript
interface ComponentProps {
  data: GameData; // Props down
  onUserAction: () => void; // Events up
}
```

## 🪝 Custom Hooks

### usePuzzleData

**Purpose**: Manages puzzle loading, filtering, and caching.

**Responsibilities**:

- Fetch puzzle data from JSONL files
- Filter puzzles by size and difficulty
- Handle loading and error states
- Cache puzzle data for performance

**Usage**:

```typescript
const { puzzleDefinition, solutionGrid, loading, error } = usePuzzleData({
  puzzleSize: 7,
  difficulty: 'medium',
  refreshKey: 0,
});
```

### useGameSettings

**Purpose**: Manages game settings and URL synchronization.

**Responsibilities**:

- Synchronize settings with URL parameters
- Handle browser navigation (back/forward)
- Manage UI vs. active settings separation
- Validate setting values

**Usage**:

```typescript
const {
  gameSettings,
  uiSettings,
  updateSelectedSize,
  updateSelectedDifficulty,
  applySettings,
  resetUISettings,
} = useGameSettings();
```

### useTimer

**Purpose**: Manages timer state and window focus events.

**Responsibilities**:

- Track timer running state
- Handle window focus/blur for auto-pause
- Reset timer when game resets
- Provide timer control methods

**Usage**:

```typescript
const { isTimerRunning, setIsTimerRunning } = useTimer({ resetKey });
```

### useKenkenGame

**Purpose**: Core game logic and state management.

**Responsibilities**:

- Grid state management (values, pencil marks)
- History tracking (undo/redo)
- Input validation and processing
- Win condition detection
- User interaction handling

**Usage**:

```typescript
const gameLogic = useKenkenGame({
  puzzleDefinition,
  solution,
  onWin,
  isTimerRunning,
  isGameWon,
});
```

## 🧩 Component Architecture

### Component Hierarchy

```
App
├── ErrorBoundary
├── LoadingState (conditional)
├── ErrorState (conditional)
├── KenkenGrid
│   ├── KenkenCell (multiple)
│   └── KenkenControls
├── Timer
├── GameSettingsPanel (conditional)
└── WinCelebration (conditional)
```

### Component Categories

#### 1. Layout Components

- `App` - Main application container
- `ErrorBoundary` - Error recovery wrapper

#### 2. Game Components

- `KenkenGrid` - Main game interface
- `KenkenCell` - Individual puzzle cells
- `KenkenControls` - Game action buttons
- `Timer` - Game timer display

#### 3. UI Components

- `LoadingState` - Loading indicators
- `ErrorState` - Error messages
- `GameSettingsPanel` - Settings configuration

#### 4. Higher-Order Components

- `ErrorBoundary` - Error catching and recovery

### Component Props Patterns

#### Data Props

```typescript
interface DataProps {
  puzzleDefinition: PuzzleDefinition;
  solution: number[][];
  gameState: GameState;
}
```

#### Event Props

```typescript
interface EventProps {
  onWin: () => void;
  onReset: () => void;
  onSettingsChange: (settings: GameSettings) => void;
}
```

#### Control Props

```typescript
interface ControlProps {
  isLoading: boolean;
  isDisabled: boolean;
  variant: 'primary' | 'secondary';
}
```

## 🗄️ State Management

### State Location Strategy

1. **Local State** - Component-specific UI state
2. **Custom Hooks** - Shared business logic
3. **URL State** - Shareable application state
4. **No Global State** - Avoiding unnecessary complexity

### State Flow

```
URL Parameters → useGameSettings → App → Custom Hooks → Components
                    ↑                                      ↓
                Browser History ← Events ← User Interactions
```

## 🏷️ Type System

### Type Organization

#### Core Types (`src/types/KenkenTypes.ts`)

- Game-specific types (Cage, PuzzleDefinition, etc.)
- Component prop interfaces
- Game state structures

#### Application Types (`src/types/GameTypes.ts`)

- Utility types derived from constants
- Error handling types
- API response structures

#### Constant Types (`src/constants/gameConstants.ts`)

- Configuration values
- Enum-like constants with `as const`

### Type Safety Patterns

#### Literal Types from Constants

```typescript
export const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard'] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];
```

#### Discriminated Unions

```typescript
type LoadingState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'success'; data: PuzzleData };
```

#### Generic Constraints

```typescript
function memoize<T extends (...args: any[]) => any>(func: T): T;
```

## ⚡ Performance Optimizations

### Rendering Optimizations

1. **React.memo** - Prevent unnecessary re-renders
2. **useCallback** - Stable function references
3. **useMemo** - Expensive calculation caching
4. **Key props** - Efficient list rendering

### Custom Performance Utilities

#### Debouncing

```typescript
const debouncedSearch = debounce(handleSearch, 300);
```

#### Memoization

```typescript
const expensiveCalculation = memoize(complexFunction);
```

#### Throttling

```typescript
const throttledScroll = throttle(handleScroll, 16);
```

### Bundle Optimization

- **Tree Shaking** - Dead code elimination
- **Code Splitting** - Dynamic imports for large features
- **Asset Optimization** - Optimized images and resources

## 🚨 Error Handling

### Error Boundary Strategy

```typescript
// Catches all React errors
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

### Typed Error Handling

```typescript
interface AppError {
  type: 'FETCH_FAILED' | 'PARSE_ERROR' | 'VALIDATION_ERROR';
  message: string;
  details?: unknown;
}
```

### Error Recovery Patterns

1. **Graceful Degradation** - Fallback UI when features fail
2. **Retry Mechanisms** - Automatic retry for transient errors
3. **User Communication** - Clear error messages and recovery steps
4. **Error Logging** - Development error details

### Error State Management

```typescript
const [error, setError] = useState<AppError | null>(null);

// Clear errors on successful operations
const handleSuccess = () => setError(null);

// Set specific error types
const handleError = (type: AppError['type'], message: string) => {
  setError({ type, message });
};
```

## 🔄 Data Flow

### Request Flow

```
User Interaction → Event Handler → Hook → API → State Update → Re-render
```

### Error Flow

```
Error Occurs → Error Boundary/Hook → Error State → Error UI → User Recovery
```

### Settings Flow

```
URL → useGameSettings → UI State → User Changes → Apply → URL Update
```

## 🧪 Testing Strategy

### Unit Testing

- **Pure Functions** - Utils and calculations
- **Custom Hooks** - Business logic testing
- **Components** - Isolated component behavior

### Integration Testing

- **Hook Combinations** - Multiple hooks working together
- **User Workflows** - Complete user interactions
- **Error Scenarios** - Error handling and recovery

### Testing Utilities

```typescript
// Custom hook testing
const { result } = renderHook(() => useGameSettings());

// Component testing with providers
render(<Component />, { wrapper: TestProviders });
```

## 📈 Future Scalability

### Adding New Features

1. **New Game Modes** - Extend existing hooks
2. **Multiplayer** - Add networking layer
3. **Persistence** - Add storage hooks
4. **Analytics** - Add tracking hooks

### Architecture Evolution

- **State Management** - Consider Zustand/Redux if complexity grows
- **Routing** - Add React Router for multiple pages
- **Backend Integration** - Extend API layer
- **Real-time Features** - Add WebSocket support

---

This architecture provides a solid foundation for the KenKen Puzzle application while maintaining flexibility for future enhancements.
