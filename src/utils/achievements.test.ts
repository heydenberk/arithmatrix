/**
 * Tests for the achievement store.
 *
 * The parts worth protecting are the ones a player would notice losing: their
 * history surviving the change of key, and a badge staying earned.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  evaluateAchievement,
  getAchievementProgress,
  getAchievements,
  getAllCombinations,
  getTimeTier,
  saveAchievement,
} from './achievements';

const KEY = 'arithmatrix_achievements';
const CLEAN = { unaided: true, clean: true };
const AIDED = { unaided: false, clean: false };

beforeEach(() => localStorage.clear());

describe('boards', () => {
  it('is one per size and difficulty, not per operations tier', () => {
    const combos = getAllCombinations();
    expect(combos).toHaveLength(20);
    expect(new Set(combos.map(c => c.key)).size).toBe(20);
  });
});

describe('conduct badges', () => {
  it('reports a badge the first time and not after', () => {
    const first = evaluateAchievement(4, 'medium', 30, CLEAN);
    expect(first.newBadges).toEqual(['unaided', 'clean']);
    saveAchievement(4, 'medium', first.tier, 30, CLEAN);

    const second = evaluateAchievement(4, 'medium', 25, CLEAN);
    expect(second.newBadges).toEqual([]);
  });

  it('keeps a badge earned on a slow solve when a fast aided one follows', () => {
    // Careful and fast are different accomplishments; one must not erase the other
    saveAchievement(4, 'medium', getTimeTier(4, 'medium', 500), 500, CLEAN);
    saveAchievement(4, 'medium', getTimeTier(4, 'medium', 10), 10, AIDED);

    const stored = getAchievements()['4-medium'];
    expect(stored.tier).toBe('platinum');
    expect(stored.timeSeconds).toBe(10);
    expect(stored.unaided).toBe(true);
    expect(stored.clean).toBe(true);
  });

  it('earns a badge later on a board already completed aided', () => {
    saveAchievement(5, 'hard', getTimeTier(5, 'hard', 100), 100, AIDED);
    expect(getAchievements()['5-hard'].unaided).toBe(false);

    const result = evaluateAchievement(5, 'hard', 400, CLEAN);
    expect(result.isNew).toBe(false);
    expect(result.isUpgrade).toBe(false);
    // Nothing about the time improved, but the solve is still worth reporting
    expect(result.newBadges).toEqual(['unaided', 'clean']);
  });

  it('does not lose the best tier to a slower later solve', () => {
    saveAchievement(6, 'easy', getTimeTier(6, 'easy', 50), 50, CLEAN);
    saveAchievement(6, 'easy', getTimeTier(6, 'easy', 5000), 5000, CLEAN);
    expect(getAchievements()['6-easy'].tier).toBe('platinum');
    expect(getAchievements()['6-easy'].timeSeconds).toBe(50);
  });
});

describe('records written under the old key', () => {
  it('folds four operations tiers into one board, keeping the best', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        '7-expert-add': {
          size: 7,
          difficulty: 'expert',
          operationsTier: 'add',
          tier: 'bronze',
          timeSeconds: 3000,
          achievedAt: '2026-01-01T00:00:00.000Z',
        },
        '7-expert-all': {
          size: 7,
          difficulty: 'expert',
          operationsTier: 'all',
          tier: 'gold',
          timeSeconds: 900,
          achievedAt: '2026-02-01T00:00:00.000Z',
        },
      })
    );

    const store = getAchievements();
    expect(Object.keys(store)).toEqual(['7-expert']);
    expect(store['7-expert'].tier).toBe('gold');
    expect(store['7-expert'].timeSeconds).toBe(900);
  });

  it('rewrites the store so the fold happens once', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        '4-easy-add': { size: 4, difficulty: 'easy', tier: 'silver', timeSeconds: 80 },
        '4-easy-all': { size: 4, difficulty: 'easy', tier: 'bronze', timeSeconds: 200 },
      })
    );
    getAchievements();
    expect(Object.keys(JSON.parse(localStorage.getItem(KEY)!))).toEqual(['4-easy']);
  });

  it('survives junk without throwing away the rest', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        broken: { nonsense: true },
        '4-easy-all': { size: 4, difficulty: 'easy', tier: 'gold', timeSeconds: 40 },
      })
    );
    expect(Object.keys(getAchievements())).toEqual(['4-easy']);
  });
});

describe('progress', () => {
  it('counts each board once rather than every tier below it', () => {
    saveAchievement(4, 'easy', 'platinum', 10, CLEAN);
    saveAchievement(5, 'hard', 'bronze', 9999, AIDED);

    const progress = getAchievementProgress();
    expect(progress.total).toBe(20);
    expect(progress.unlocked).toBe(2);
    expect(progress.byTier.platinum).toBe(1);
    expect(progress.byTier.bronze).toBe(1);
    expect(progress.byTier.gold).toBe(0);
    expect(progress.unaided).toBe(1);
    expect(progress.clean).toBe(1);
  });
});
