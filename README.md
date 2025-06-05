# 🧩 KenKen Puzzle - Beautiful & Modern

A stunning, interactive KenKen puzzle game built with React, TypeScript, and Mantine UI featuring a beautiful modern design with glass morphism effects, smooth animations, and an intuitive user interface.

## ✨ Features

### 🎨 Beautiful Design

- **Glass Morphism UI** - Modern frosted glass effects with backdrop blur
- **Gradient Backgrounds** - Smooth animated gradients from indigo to purple to pink
- **3D Cell Effects** - Realistic shadows and depth for an engaging experience
- **Smooth Animations** - Fluid transitions and micro-interactions throughout
- **Responsive Design** - Works beautifully on all screen sizes

### 🎮 Game Features

- **Multiple Difficulty Levels** - Easiest, Easy, Medium, Hard, Expert
- **Variable Grid Sizes** - 4×4, 5×5, 6×6, and 7×7 puzzles
- **Interactive Grid** - Click and type to fill in numbers
- **Pencil Mode** - Toggle between normal and pencil mark modes
- **Smart Validation** - Real-time error checking with visual feedback
- **Undo/Redo** - Full history management for puzzle solving
- **Timer** - Beautiful timer with pause/resume functionality
- **Win Detection** - Automatic puzzle completion detection with celebration
- **URL State Management** - Shareable URLs with puzzle size and difficulty

### 🛠 Technical Excellence

- **TypeScript** - Fully typed for better development experience
- **Modern React Architecture** - Custom hooks and component composition
- **Mantine UI** - Professional component library with consistent design
- **Error Boundaries** - Graceful error handling and recovery
- **Performance Optimized** - Memoization, debouncing, and efficient rendering
- **Code Quality Tools** - ESLint, Prettier, and comprehensive type checking

## 🏗️ Architecture

### Custom Hooks

- **`usePuzzleData`** - Manages puzzle loading, filtering, and caching
- **`useGameSettings`** - Handles URL synchronization and game settings
- **`useTimer`** - Timer state and window focus/blur management
- **`useKenkenGame`** - Complete game logic and state management

### Component Structure

```
src/
├── components/
│   ├── KenkenGrid.tsx        # Main game grid component
│   ├── KenkenCell.tsx        # Individual cell component
│   ├── KenkenControls.tsx    # Game control buttons
│   ├── Timer.tsx             # Timer component
│   ├── GameSettingsPanel.tsx # Settings selection UI
│   ├── LoadingState.tsx      # Reusable loading indicator
│   ├── ErrorState.tsx        # Error display component
│   └── ErrorBoundary.tsx     # Error boundary for crash recovery
├── hooks/
│   ├── useKenkenGame.ts      # Game logic hook
│   ├── usePuzzleData.ts      # Puzzle data management
│   ├── useGameSettings.ts    # Settings and URL sync
│   └── useTimer.ts           # Timer functionality
├── types/
│   ├── KenkenTypes.ts        # Core game types
│   └── GameTypes.ts          # Additional application types
├── utils/
│   ├── kenkenUtils.ts        # Game utility functions
│   └── performance.ts        # Performance optimization utilities
├── constants/
│   └── gameConstants.ts      # Centralized configuration
├── App.tsx                   # Main application component
└── main.tsx                  # Application entry point
```

### Key Design Patterns

- **Separation of Concerns** - Logic separated from UI components
- **Custom Hooks** - Reusable stateful logic
- **Composition over Inheritance** - Flexible component architecture
- **Type Safety** - Comprehensive TypeScript coverage
- **Error Handling** - Graceful degradation and recovery

## 🚀 Getting Started

### Prerequisites

- Node.js 16.0 or higher
- npm or yarn package manager

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd neknek
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Start the development server**

   ```bash
   npm run dev
   # or with backend
   npm run start:dev
   ```

4. **Open your browser**
   Navigate to `http://localhost:5173` to see the app

## 🎯 How to Play

1. **Understand the Rules**

   - Fill each row and column with numbers 1-N (where N is the grid size)
   - Each number appears exactly once in each row and column
   - Groups of cells (cages) must equal the target number using the specified operation

2. **Use the Controls**

   - **Click** any cell to select and type a number
   - **Pencil Mode** - Toggle to add/remove pencil marks for possibilities
   - **Check Cell/Puzzle** - Validate your current solution
   - **Undo/Redo** - Navigate through your solution history
   - **Reset** - Clear the current puzzle and restart
   - **New Game** - Configure and start a new puzzle

3. **Visual Feedback**
   - **Purple glow** - Selected cells
   - **Red flash** - Invalid entries
   - **Smooth animations** - Guide your interactions
   - **Celebration** - Win animation when puzzle is solved

## 🛠 Development

### Available Scripts

```bash
# Development
npm run dev              # Start development server
npm run start:dev        # Start with backend
npm run build            # Build for production
npm run preview          # Preview production build

# Code Quality
npm run lint             # Check code with ESLint
npm run lint:fix         # Auto-fix linting issues
npm run format           # Format code with Prettier
npm run format:check     # Check code formatting
npm run type-check       # TypeScript type checking

# Backend
npm run backend:install  # Install Python dependencies
npm run backend:dev      # Start Flask backend
```

### Code Quality Tools

- **ESLint** - Code linting with TypeScript and React rules
- **Prettier** - Code formatting for consistency
- **TypeScript** - Static type checking
- **React Hooks ESLint Plugin** - Hook usage validation

### Performance Optimizations

- **Memoization** - Expensive computations cached
- **Debouncing** - Input handling optimized
- **Throttling** - Event handling rate-limited
- **React.memo** - Component re-render optimization

### Error Handling

- **Error Boundaries** - Component crash recovery
- **Typed Errors** - Structured error handling
- **Graceful Degradation** - Fallback UI states
- **User-Friendly Messages** - Clear error communication

## 🎨 Design System

### Technology Stack

- **React 19** - Latest React with modern patterns
- **TypeScript 5** - Advanced type safety
- **Mantine 8** - Professional UI component library
- **Vite** - Fast build tool and dev server
- **Tabler Icons** - Beautiful, consistent icons

### Color Palette

- **Primary**: Indigo to Purple gradient (`#667eea` → `#764ba2`)
- **Secondary**: Emerald for success states
- **Accent**: Various gradients for different UI elements
- **Background**: Dynamic gradient with animated elements

### Component Principles

- **Accessibility First** - WCAG compliant components
- **Mobile Responsive** - Touch-friendly interactions
- **Consistent Spacing** - Mantine's spacing system
- **Performance Focused** - Optimized rendering

## 🚀 Building for Production

```bash
npm run build
```

The build artifacts will be stored in the `dist/` directory, optimized for production deployment.

## 🧪 Testing

The project is set up for easy testing integration:

```bash
# Recommended testing setup
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom
```

Test files should follow the pattern: `*.test.ts` or `*.test.tsx`

## 📚 Documentation

- **[Architecture Guide](docs/ARCHITECTURE.md)** - Detailed architecture and design patterns
- **[Development Guide](docs/DEVELOPMENT.md)** - Development workflows and best practices
- **[API Documentation](docs/API.md)** - Backend API reference (coming soon)
- **[Component Library](docs/COMPONENTS.md)** - Component usage guide (coming soon)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Follow the code style guidelines (`npm run lint` and `npm run format`)
4. Ensure type safety (`npm run type-check`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Guidelines

- Use TypeScript for all new code
- Follow the established component patterns
- Add proper JSDoc comments for complex functions
- Ensure accessibility compliance
- Write tests for new features
- Update documentation as needed

See the **[Development Guide](docs/DEVELOPMENT.md)** for detailed information.

## 📱 Browser Support

- **Chrome** 90+
- **Firefox** 88+
- **Safari** 14+
- **Edge** 90+

_Modern features like backdrop-filter require recent browser versions_

## 🔧 Configuration

### Environment Variables

The application uses Vite's environment variable system:

```bash
# .env.local
VITE_API_URL=http://localhost:5001  # Backend API URL
```

### Puzzle Configuration

Difficulty levels and grid sizes can be configured in `src/constants/gameConstants.ts`:

```typescript
export const DIFFICULTY_BOUNDS = {
  4: { easiest: [10, 16], easy: [16, 18] /* ... */ },
  // ... other sizes
};
```

## 📊 Performance Monitoring

The application includes performance utilities:

- **Debounced inputs** - Prevents excessive API calls
- **Memoized calculations** - Caches expensive operations
- **Optimized re-renders** - Strategic use of React.memo
- **Bundle analysis** - Use `npm run build` to analyze bundle size

## 🎉 Acknowledgments

- Beautiful design inspired by modern design systems
- KenKen puzzle format created by Tetsuya Miyamoto
- Built with love using React, TypeScript, and Mantine UI
- Performance patterns inspired by React best practices

---

**Enjoy solving beautiful KenKen puzzles! 🧩✨**
