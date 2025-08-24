/**
 * Game constants and configuration values
 */

// Puzzle size constraints
export const PUZZLE_SIZES = {
  MIN: 4,
  MAX: 7,
  DEFAULT: 7,
} as const;

// Valid puzzle sizes array
export const VALID_SIZES = [4, 5, 6, 7] as const;

// Difficulty levels
export const DIFFICULTY_LEVELS = [
  "easiest",
  "easy",
  "medium",
  "hard",
  "expert",
] as const;

export const DEFAULT_DIFFICULTY = "medium";

// Difficulty bounds based on difficulty_operations per size
export const DIFFICULTY_BOUNDS = {
  4: {
    easiest: [10, 16],
    easy: [16, 18],
    medium: [18, 20],
    hard: [20, 22],
    expert: [22, 29],
  },
  5: {
    easiest: [16, 24],
    easy: [24, 26],
    medium: [26, 28],
    hard: [28, 30],
    expert: [30, 40],
  },
  6: {
    easiest: [28, 35],
    easy: [35, 37],
    medium: [37, 39],
    hard: [39, 42],
    expert: [42, 55],
  },
  7: {
    easiest: [38, 47],
    easy: [47, 49],
    medium: [49, 52],
    hard: [52, 55],
    expert: [55, 65],
  },
} as const;

// UI Constants
export const ANIMATION_DURATION = {
  FLASH: 300,
  BOUNCE: 1000,
  TRANSITION: 200,
} as const;

export const BLUR_VALUES = {
  LIGHT: "16px",
  MEDIUM: "20px",
  HEAVY: "40px",
  EXTRA_HEAVY: "60px",
} as const;

// File paths
// Use Vite base URL so it works on GitHub Pages subpath deployments
export const PUZZLE_DATA_FILE = `${import.meta.env.BASE_URL}all_puzzles.jsonl`;

// CSS class names (for consistent styling)
export const CSS_CLASSES = {
  GRADIENT_BACKGROUND: "gradient-background",
  ANIMATE_PULSE: "animate-pulse",
} as const;
