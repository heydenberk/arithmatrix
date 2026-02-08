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
export const DIFFICULTY_LEVELS = ['easiest', 'easy', 'medium', 'hard', 'expert'] as const;

export const DEFAULT_DIFFICULTY = 'medium';

// Operation tiers
export const OPERATION_TIERS = ['add', 'add-sub', 'no-div', 'all'] as const;

export const DEFAULT_OPERATION_TIER = 'all';

// Human-readable labels for operation tiers
export const OPERATION_TIER_LABELS: Record<string, string> = {
  add: 'Addition Only',
  'add-sub': 'Add & Subtract',
  'no-div': 'No Division',
  all: 'All Operations',
};

// UI Constants
export const ANIMATION_DURATION = {
  FLASH: 300,
  BOUNCE: 1000,
  TRANSITION: 200,
} as const;

export const BLUR_VALUES = {
  LIGHT: '16px',
  MEDIUM: '20px',
  HEAVY: '40px',
  EXTRA_HEAVY: '60px',
} as const;

// File paths using Vite base so it works on project pages
export const PUZZLE_DATA_FILE = `${import.meta.env.BASE_URL}all_puzzles.jsonl`;

// CSS class names (for consistent styling)
export const CSS_CLASSES = {
  GRADIENT_BACKGROUND: 'gradient-background',
  ANIMATE_PULSE: 'animate-pulse',
} as const;
