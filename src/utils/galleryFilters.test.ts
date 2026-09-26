/**
 * Tests for the gallery's remembered filters.
 *
 * The point of storing them is that a reload does not quietly hand the player
 * back the operations of whatever puzzle they last opened, so what is worth
 * protecting is that a stored choice wins over the board, and that a value
 * which no longer makes sense falls back rather than filtering the gallery
 * down to nothing.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  ANY_OPS,
  loadGalleryFilters,
  saveGalleryFilters,
  seedGalleryFilters,
} from './galleryFilters';
import { FULL_DIFFICULTY_RANGE } from './puzzleCatalog';

const KEY = 'arithmatrix_gallery_filters';

const stored = (value: unknown) => localStorage.setItem(KEY, JSON.stringify(value));

beforeEach(() => localStorage.clear());

describe('seedGalleryFilters', () => {
  it('falls back to the puzzle on the board when nothing is stored', () => {
    expect(seedGalleryFilters(6, 'add-sub')).toEqual({
      size: 6,
      operationsTier: 'add-sub',
      difficultyRange: FULL_DIFFICULTY_RANGE,
      hideCompleted: false,
    });
  });

  it('prefers what the player last browsed with over the board', () => {
    saveGalleryFilters({
      size: 4,
      operationsTier: ANY_OPS,
      difficultyRange: [1, 3],
      hideCompleted: true,
    });
    // The board is a 7x7 with division; the gallery must not follow it
    expect(seedGalleryFilters(7, 'all')).toEqual({
      size: 4,
      operationsTier: ANY_OPS,
      difficultyRange: [1, 3],
      hideCompleted: true,
    });
  });

  it('falls back per field, so one bad value does not discard the rest', () => {
    stored({ size: 99, operationsTier: ANY_OPS });
    const seeded = seedGalleryFilters(5, 'no-div');
    expect(seeded.size).toBe(5);
    expect(seeded.operationsTier).toBe(ANY_OPS);
  });
});

describe('loadGalleryFilters', () => {
  it('reports nothing when the store is empty', () => {
    expect(loadGalleryFilters()).toEqual({});
  });

  it('survives a corrupt entry', () => {
    localStorage.setItem(KEY, 'not json');
    expect(loadGalleryFilters()).toEqual({});
    stored('a string');
    expect(loadGalleryFilters()).toEqual({});
    stored(null);
    expect(loadGalleryFilters()).toEqual({});
  });

  it('rejects a size the game no longer offers', () => {
    stored({ size: 8 });
    expect(loadGalleryFilters().size).toBeUndefined();
    stored({ size: 5 });
    expect(loadGalleryFilters().size).toBe(5);
  });

  it('rejects an operations tier that no longer exists, but keeps the any sentinel', () => {
    stored({ operationsTier: 'mul-only' });
    expect(loadGalleryFilters().operationsTier).toBeUndefined();
    stored({ operationsTier: ANY_OPS });
    expect(loadGalleryFilters().operationsTier).toBe(ANY_OPS);
    stored({ operationsTier: 'add' });
    expect(loadGalleryFilters().operationsTier).toBe('add');
  });

  it('rejects a difficulty range that is out of bounds or inverted', () => {
    for (const bad of [[0], [0, 5], [-1, 2], [3, 1], ['a', 'b'], [1.5, 3], 'nope']) {
      stored({ difficultyRange: bad });
      expect(loadGalleryFilters().difficultyRange, JSON.stringify(bad)).toBeUndefined();
    }
    stored({ difficultyRange: [2, 2] });
    expect(loadGalleryFilters().difficultyRange).toEqual([2, 2]);
  });

  it('round-trips everything it was given', () => {
    const filters = {
      size: 7,
      operationsTier: 'no-div',
      difficultyRange: [0, 4] as [number, number],
      hideCompleted: true,
    };
    saveGalleryFilters(filters);
    expect(loadGalleryFilters()).toEqual(filters);
  });
});
