# 🧩 KenKen Puzzle - Beautiful & Modern

A stunning, interactive KenKen puzzle game built with React, TypeScript, and Tailwind CSS featuring a beautiful modern design with glass morphism effects, smooth animations, and an intuitive user interface.

## ✨ Features

### 🎨 Beautiful Design

- **Glass Morphism UI** - Modern frosted glass effects with backdrop blur
- **Gradient Backgrounds** - Smooth animated gradients from indigo to purple to pink
- **3D Cell Effects** - Realistic shadows and depth for an engaging experience
- **Smooth Animations** - Fluid transitions and micro-interactions throughout

### 🎮 Game Features

- **Interactive Grid** - Click and type to fill in numbers
- **Pencil Mode** - Toggle between normal and pencil mark modes
- **Smart Validation** - Real-time error checking with visual feedback
- **Undo/Redo** - Full history management for puzzle solving
- **Timer** - Beautiful timer with pause/resume functionality
- **Win Detection** - Automatic puzzle completion detection with celebration

### 🛠 Technical Excellence

- **TypeScript** - Fully typed for better development experience
- **React Hooks** - Modern React patterns with custom hooks
- **Tailwind CSS** - Utility-first styling with custom components
- **Responsive Design** - Works beautifully on all screen sizes
- **Accessibility** - WCAG compliant with proper focus management

## 🚀 Getting Started

### Prerequisites

- Node.js 16.0 or higher
- npm or yarn package manager

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd kenken-puzzle
   ```

2. **Install dependencies**

   ```bash
   npm install
   # or
   yarn install
   ```

3. **Start the development server**

   ```bash
   npm run start:dev
   # or
   yarn dev
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
   - **Check** - Validate your current solution
   - **Undo** - Revert your last action

3. **Visual Feedback**
   - **Purple glow** - Selected cells
   - **Red flash** - Invalid entries
   - **Smooth animations** - Guide your interactions

## 🎨 Design System

### Color Palette

- **Primary**: Indigo to Purple gradient
- **Secondary**: Emerald for success states
- **Accent**: Amber for warnings
- **Background**: Soft gradient from indigo-50 to pink-50

### Typography

- **Primary Font**: Inter (modern, readable)
- **Monospace**: JetBrains Mono (for timer and numbers)

### Animations

- **Micro-interactions**: 200-300ms cubic-bezier transitions
- **Focus states**: Subtle scale and glow effects
- **Error feedback**: Bounce and flash animations
- **Loading states**: Elegant spinners and fade-ins

## 🛠 Development

### Project Structure

```
src/
├── components/
│   ├── KenkenGrid.tsx    # Main game grid component
│   ├── KenkenGrid.css    # Grid-specific styling
│   └── Timer.tsx         # Timer component
├── App.tsx               # Main application component
├── index.css             # Global styles and animations
└── main.tsx              # Application entry point
```

### Key Components

#### KenkenGrid

- Manages game state and logic
- Handles user interactions
- Provides visual feedback
- Implements undo/redo functionality

#### Timer

- Real-time game timer
- Pause/resume functionality
- Beautiful visual design with status indicators

#### App

- Overall layout and routing
- State management
- API integration for puzzle data

### Styling Approach

- **Utility-first** with Tailwind CSS
- **Component-specific** CSS for complex interactions
- **CSS-in-JS** for dynamic styling
- **Modern CSS** features (backdrop-filter, custom properties)

## 🚀 Building for Production

```bash
npm run build
# or
yarn build
```

The build artifacts will be stored in the `dist/` directory.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📱 Browser Support

- **Chrome** 90+
- **Firefox** 88+
- **Safari** 14+
- **Edge** 90+

_Modern features like backdrop-filter require recent browser versions_

## 🎉 Acknowledgments

- Beautiful design inspired by modern design systems
- KenKen puzzle format created by Tetsuya Miyamoto
- Built with love using React and Tailwind CSS

---

**Enjoy solving beautiful KenKen puzzles! 🧩✨**
