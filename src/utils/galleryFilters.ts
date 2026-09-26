/**
 * The gallery's filters, remembered across sessions.
 *
 * They already survived closing and reopening the gallery, but only in memory:
 * a fresh load seeded them from whatever puzzle was on the board. On a phone
 * that is most loads - the PWA is killed whenever the system wants the memory -
 * so a player who browsed with "Any operations" came back to the operations of
 * the last puzzle they happened to pick, over and over.
 *
 * Stored rather than derived, and validated on the way out: a size or tier that
 * no longer exists, or a hand-edited value, falls back instead of filtering the
 * gallery down to nothing.
 */

import { OPERATION_TIERS, VALID_SIZES } from '../constants/gameConstants';
import { DIFFICULTY_ORDER } from './difficulty';
import { FULL_DIFFICULTY_RANGE, type DifficultyRange } from './puzzleCatalog';

/** Sentinel for the operations filter meaning "don't filter by operations". */
export const ANY_OPS = 'any';

export type GalleryFilters = {
  size: number;
  operationsTier: string;
  difficultyRange: DifficultyRange;
  hideCompleted: boolean;
};

const STORAGE_KEY = 'arithmatrix_gallery_filters';

const isValidSize = (value: unknown): value is number =>
  typeof value === 'number' && (VALID_SIZES as readonly number[]).includes(value);

const isValidTier = (value: unknown): value is string =>
  value === ANY_OPS ||
  (typeof value === 'string' && (OPERATION_TIERS as readonly string[]).includes(value));

const isValidRange = (value: unknown): value is DifficultyRange => {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const [low, high] = value;
  const last = DIFFICULTY_ORDER.length - 1;
  return Number.isInteger(low) && Number.isInteger(high) && low >= 0 && high <= last && low <= high;
};

/**
 * What the player last browsed with, as far as any of it is still valid.
 * Fields that are missing or no longer make sense come back undefined, so the
 * caller can fall back to the puzzle on the board for those alone.
 */
export const loadGalleryFilters = (): Partial<GalleryFilters> => {
  let stored: unknown;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    stored = JSON.parse(raw);
  } catch (error) {
    console.error('Failed to read gallery filters:', error);
    return {};
  }
  if (typeof stored !== 'object' || stored === null) return {};

  const { size, operationsTier, difficultyRange, hideCompleted } = stored as Record<
    string,
    unknown
  >;
  return {
    ...(isValidSize(size) ? { size } : {}),
    ...(isValidTier(operationsTier) ? { operationsTier } : {}),
    ...(isValidRange(difficultyRange) ? { difficultyRange } : {}),
    ...(typeof hideCompleted === 'boolean' ? { hideCompleted } : {}),
  };
};

export const saveGalleryFilters = (filters: GalleryFilters): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch (error) {
    console.error('Failed to save gallery filters:', error);
  }
};

/** The stored filters, with the current puzzle filling any gaps. */
export const seedGalleryFilters = (fallbackSize: number, fallbackTier: string): GalleryFilters => {
  const stored = loadGalleryFilters();
  return {
    size: stored.size ?? fallbackSize,
    operationsTier: stored.operationsTier ?? fallbackTier,
    difficultyRange: stored.difficultyRange ?? FULL_DIFFICULTY_RANGE,
    hideCompleted: stored.hideCompleted ?? false,
  };
};
