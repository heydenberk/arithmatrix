# 🛠️ Development Guide

This guide covers development workflows, tools, and best practices for the KenKen Puzzle application.

## 📋 Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Quality Tools](#code-quality-tools)
- [Testing Guidelines](#testing-guidelines)
- [Performance Monitoring](#performance-monitoring)
- [Debugging](#debugging)
- [Best Practices](#best-practices)

## 🚀 Getting Started

### Prerequisites

- **Node.js** 16.0 or higher
- **npm** 7.0 or higher
- **Git** for version control

### Initial Setup

```bash
# Clone the repository
git clone <repository-url>
cd neknek

# Install dependencies
npm install

# Start development server
npm run dev
```

### Development Environment

The application runs on:

- **Frontend**: `http://localhost:5173` (Vite dev server)
- **Backend**: `http://localhost:5001` (Flask API)

## 🔄 Development Workflow

### Daily Development

1. **Start Development**

   ```bash
   npm run dev              # Frontend only
   npm run start:dev        # Frontend + Backend
   ```

2. **Code Quality Checks**

   ```bash
   npm run lint             # Check for issues
   npm run type-check       # TypeScript validation
   npm run format:check     # Formatting validation
   ```

3. **Fix Issues**
   ```bash
   npm run lint:fix         # Auto-fix linting issues
   npm run format           # Auto-format code
   ```

### Feature Development

1. **Create Feature Branch**

   ```bash
   git checkout -b feature/new-game-mode
   ```

2. **Follow Development Pattern**

   - Create types in `src/types/`
   - Add constants to `src/constants/`
   - Create custom hooks for logic
   - Build UI components
   - Update documentation

3. **Pre-commit Checklist**
   ```bash
   npm run lint             # ✅ No linting errors
   npm run type-check       # ✅ No TypeScript errors
   npm run format:check     # ✅ Code is formatted
   npm run build            # ✅ Builds successfully
   ```

## 🔧 Code Quality Tools

### ESLint Configuration

**Purpose**: Catch bugs and enforce coding standards

**Rules**:

- TypeScript recommended rules
- React and React Hooks rules
- Custom project-specific rules

**Usage**:

```bash
npm run lint             # Check all files
npm run lint:fix         # Auto-fix issues
npx eslint src/App.tsx   # Check specific file
```

**Configuration**: `.eslintrc.json`

### Prettier Configuration

**Purpose**: Enforce consistent code formatting

**Settings**:

- Single quotes
- Semicolons
- 100 character line width
- 2-space indentation

**Usage**:

```bash
npm run format           # Format all files
npm run format:check     # Check formatting
npx prettier src/App.tsx # Format specific file
```

**Configuration**: `.prettierrc`

### TypeScript Configuration

**Purpose**: Static type checking and compilation

**Features**:

- Strict type checking
- Modern ES features
- JSX support
- Path mapping

**Usage**:

```bash
npm run type-check       # Check types without compilation
npx tsc --noEmit         # Same as above
```

**Configuration**: `tsconfig.json`

## 🧪 Testing Guidelines

### Testing Setup

```bash
# Install testing dependencies
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

### Testing Structure

```
src/
├── components/
│   ├── __tests__/
│   │   ├── KenkenGrid.test.tsx
│   │   └── Timer.test.tsx
│   └── ...
├── hooks/
│   ├── __tests__/
│   │   ├── useGameSettings.test.ts
│   │   └── usePuzzleData.test.ts
│   └── ...
└── utils/
    ├── __tests__/
    │   └── performance.test.ts
    └── ...
```

### Testing Patterns

#### Component Testing

```typescript
import { render, screen } from '@testing-library/react';
import { Timer } from '../Timer';

test('displays timer correctly', () => {
  render(<Timer isRunning={true} />);
  expect(screen.getByRole('timer')).toBeInTheDocument();
});
```

#### Hook Testing

```typescript
import { renderHook, act } from '@testing-library/react';
import { useGameSettings } from '../useGameSettings';

test('updates settings correctly', () => {
  const { result } = renderHook(() => useGameSettings());

  act(() => {
    result.current.updateSelectedSize(6);
  });

  expect(result.current.uiSettings.selectedSize).toBe(6);
});
```

#### Utility Testing

```typescript
import { debounce } from '../performance';

test('debounce delays function execution', async () => {
  const mockFn = jest.fn();
  const debouncedFn = debounce(mockFn, 100);

  debouncedFn();
  debouncedFn();
  debouncedFn();

  expect(mockFn).toHaveBeenCalledTimes(0);

  await new Promise(resolve => setTimeout(resolve, 150));
  expect(mockFn).toHaveBeenCalledTimes(1);
});
```

### Running Tests

```bash
npm test                 # Run all tests
npm test -- --watch     # Watch mode
npm test -- --coverage  # Coverage report
```

## 📊 Performance Monitoring

### Bundle Analysis

```bash
npm run build           # Build for production
npx vite-bundle-analyzer dist
```

### Performance Utilities

#### Debouncing

```typescript
import { debounce } from '../utils/performance';

const debouncedSearch = debounce((query: string) => {
  // Expensive search operation
}, 300);
```

#### Memoization

```typescript
import { memoize } from '../utils/performance';

const expensiveCalculation = memoize((data: ComplexData) => {
  // Expensive computation
  return processedData;
});
```

#### Component Optimization

```typescript
import { memo } from 'react';

export const OptimizedComponent = memo(({ data }: Props) => {
  return <div>{data}</div>;
});
```

### Performance Monitoring

```typescript
// Measure component render time
const MyComponent = () => {
  const startTime = performance.now();

  useEffect(() => {
    const endTime = performance.now();
    console.log(`Render time: ${endTime - startTime}ms`);
  });

  return <div>Content</div>;
};
```

## 🐛 Debugging

### Browser DevTools

#### React DevTools

- Install React DevTools extension
- Inspect component state and props
- Profile component performance

#### Network Tab

- Monitor API calls
- Check puzzle data loading
- Debug timing issues

#### Console Debugging

```typescript
// Add temporary debugging
console.log('Puzzle data:', puzzleDefinition);
console.group('Game State');
console.log('Grid values:', gridValues);
console.log('Is game won:', isGameWon);
console.groupEnd();
```

### TypeScript Debugging

```typescript
// Type debugging
type DebugType<T> = T extends infer U ? U : never;
type MyType = DebugType<ComplexType>; // Hover to see resolved type
```

### VSCode Debugging

**Configuration**: `.vscode/launch.json`

```json
{
  "type": "chrome",
  "request": "launch",
  "name": "Debug React App",
  "url": "http://localhost:5173",
  "webRoot": "${workspaceFolder}/src"
}
```

## 📝 Best Practices

### Code Organization

#### File Naming

- **Components**: PascalCase (`KenkenGrid.tsx`)
- **Hooks**: camelCase with 'use' prefix (`useGameSettings.ts`)
- **Utils**: camelCase (`performance.ts`)
- **Types**: PascalCase (`GameTypes.ts`)

#### Import Organization

```typescript
// 1. React imports
import { useState, useEffect } from 'react';

// 2. Third-party libraries
import { Button, Stack } from '@mantine/core';

// 3. Internal components
import { KenkenGrid } from './components/KenkenGrid';

// 4. Internal hooks
import { useGameSettings } from './hooks/useGameSettings';

// 5. Types
import type { PuzzleDefinition } from './types/KenkenTypes';

// 6. Constants
import { DIFFICULTY_LEVELS } from './constants/gameConstants';
```

### Component Patterns

#### Props Interface

```typescript
interface ComponentProps {
  // Required props first
  data: GameData;
  onAction: () => void;

  // Optional props last
  className?: string;
  disabled?: boolean;
}
```

#### Event Handlers

```typescript
// Prefix with 'handle'
const handleSubmit = (event: FormEvent) => {
  event.preventDefault();
  // Handle submission
};

// Use arrow functions for inline handlers
<Button onClick={() => setCount(count + 1)} />
```

### Hook Patterns

#### Return Object Pattern

```typescript
// Return object for multiple values
const useGameLogic = () => {
  return {
    gameState,
    actions: {
      reset,
      move,
      undo,
    },
    status: {
      isLoading,
      hasError,
    },
  };
};
```

#### Custom Hook Dependencies

```typescript
// Clear dependency arrays
useEffect(() => {
  loadPuzzle();
}, [puzzleSize, difficulty]); // Only what's actually used

// Avoid object dependencies
const settings = { size: 6, difficulty: 'medium' };
useEffect(() => {
  // This will run on every render!
}, [settings]);

// Better: destructure or use individual values
const { size, difficulty } = settings;
useEffect(() => {
  // This will only run when size or difficulty changes
}, [size, difficulty]);
```

### Type Safety

#### Strict Typing

```typescript
// Use specific types, not 'any'
interface ApiResponse {
  data: PuzzleData[];
  status: 'success' | 'error';
}

// Use type guards
function isPuzzleData(data: unknown): data is PuzzleData {
  return typeof data === 'object' && data !== null && 'size' in data;
}
```

#### Const Assertions

```typescript
// Create literal types
const STATUSES = ['loading', 'success', 'error'] as const;
type Status = (typeof STATUSES)[number]; // 'loading' | 'success' | 'error'
```

### Error Handling

#### Graceful Degradation

```typescript
const SafeComponent = ({ data }: Props) => {
  if (!data) {
    return <div>No data available</div>;
  }

  return <ComplexComponent data={data} />;
};
```

#### Error Boundaries

```typescript
// Wrap risky components
<ErrorBoundary>
  <RiskyComponent />
</ErrorBoundary>
```

### Performance

#### Expensive Operations

```typescript
// Memoize expensive calculations
const expensiveValue = useMemo(() => {
  return heavyCalculation(data);
}, [data]);

// Debounce user input
const debouncedValue = useDebounce(inputValue, 300);
```

#### List Rendering

```typescript
// Always use keys for lists
{items.map(item => (
  <Item key={item.id} data={item} />
))}

// Avoid index as key for dynamic lists
{items.map((item, index) => (
  <Item key={`${item.id}-${item.version}`} data={item} />
))}
```

## 🔧 Troubleshooting

### Common Issues

#### TypeScript Errors

```bash
# Clear TypeScript cache
npx tsc --build --clean

# Check specific file
npx tsc --noEmit src/problematic-file.ts
```

#### ESLint Issues

```bash
# Fix auto-fixable issues
npm run lint:fix

# Disable specific rules temporarily
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const temp: any = complexObject;
```

#### Vite Issues

```bash
# Clear Vite cache
rm -rf node_modules/.vite

# Restart dev server
npm run dev
```

### Getting Help

1. **Check Documentation** - README and architecture docs
2. **Review Error Messages** - TypeScript and ESLint provide helpful hints
3. **Use DevTools** - Browser and React DevTools
4. **Console Debugging** - Add temporary logging
5. **Git History** - Check recent changes that might have caused issues

---

This development guide ensures consistent, high-quality code across the KenKen Puzzle application.
