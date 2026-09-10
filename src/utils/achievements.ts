import { VALID_SIZES, DIFFICULTY_LEVELS } from '../constants/gameConstants';

export type TimeTier = 'platinum' | 'gold' | 'silver' | 'bronze';

/**
 * How a puzzle was solved, as opposed to how fast.
 *
 * Time was the only thing recorded, so a player could hint and autofill their
 * way to platinum - the achievement rewarded the opposite of what the hints
 * are there to teach. These two say something time cannot.
 */
export type GameConduct = {
  /** No hint, no autofill, no check-answer. */
  unaided: boolean;
  /** No wrong value was ever placed, at any point. */
  clean: boolean;
};

export const NEUTRAL_CONDUCT: GameConduct = { unaided: true, clean: true };

export type Achievement = {
  size: number;
  difficulty: string;
  tier: TimeTier;
  timeSeconds: number;
  achievedAt: string;
  /** Earned at least once on this board, whether or not on the best time. */
  unaided?: boolean;
  clean?: boolean;
};

export type AchievementStore = Record<string, Achievement>;

export type AchievementResult = {
  tier: TimeTier;
  isNew: boolean;
  isUpgrade: boolean;
  previousTier?: TimeTier;
  comboKey: string;
  /** Badges earned for the first time by this solve. */
  newBadges: (keyof GameConduct)[];
};

const STORAGE_KEY = 'arithmatrix_achievements';

// Gold-tier base times (seconds) per size and difficulty
// Silver = 2x, Platinum = 0.5x, Bronze = any completion
const GOLD_TIMES: Record<number, Record<string, number>> = {
  4: { easiest: 30, easy: 45, medium: 60, hard: 90, expert: 120 },
  5: { easiest: 75, easy: 112, medium: 150, hard: 225, expert: 300 },
  6: { easiest: 150, easy: 225, medium: 300, hard: 450, expert: 600 },
  7: { easiest: 300, easy: 450, medium: 600, hard: 900, expert: 1200 },
};

const TIER_MULTIPLIERS: Record<TimeTier, number> = {
  platinum: 0.5,
  gold: 1,
  silver: 2,
  bronze: Infinity,
};

export const TIER_ORDER: TimeTier[] = ['bronze', 'silver', 'gold', 'platinum'];

export const TIER_COLORS: Record<TimeTier, string> = {
  bronze: '#CD7F32',
  silver: '#C0C0C0',
  gold: '#FFD700',
  platinum: '#B9F2FF',
};

export const TIER_LABELS: Record<TimeTier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
};

/*
 * Boards are size and difficulty only.
 *
 * The operations tier used to be part of the key, giving 80 boards - but the
 * time targets never depended on it, so a 7x7 expert in addition-only and one
 * in + - * / demanded the same 20 minutes. Three quarters of the grid was the
 * same target four times over.
 */
function comboKey(size: number, difficulty: string): string {
  return `${size}-${difficulty}`;
}

export function getTimeThreshold(size: number, difficulty: string, tier: TimeTier): number {
  const gold = GOLD_TIMES[size]?.[difficulty];
  if (!gold) return Infinity;
  return gold * TIER_MULTIPLIERS[tier];
}

export function getTimeTier(size: number, difficulty: string, timeSeconds: number): TimeTier {
  if (timeSeconds <= getTimeThreshold(size, difficulty, 'platinum')) return 'platinum';
  if (timeSeconds <= getTimeThreshold(size, difficulty, 'gold')) return 'gold';
  if (timeSeconds <= getTimeThreshold(size, difficulty, 'silver')) return 'silver';
  return 'bronze';
}

function tierRank(tier: TimeTier): number {
  return TIER_ORDER.indexOf(tier);
}

export function evaluateAchievement(
  size: number,
  difficulty: string,
  timeSeconds: number,
  conduct: GameConduct = NEUTRAL_CONDUCT
): AchievementResult {
  const key = comboKey(size, difficulty);
  const tier = getTimeTier(size, difficulty, timeSeconds);
  const store = getAchievements();
  const existing = store[key];

  // A badge is news only the first time this board earns it
  const newBadges = (['unaided', 'clean'] as const).filter(
    badge => conduct[badge] && !existing?.[badge]
  );

  if (!existing) {
    return { tier, isNew: true, isUpgrade: false, comboKey: key, newBadges };
  }

  if (tierRank(tier) > tierRank(existing.tier)) {
    return {
      tier,
      isNew: false,
      isUpgrade: true,
      previousTier: existing.tier,
      comboKey: key,
      newBadges,
    };
  }

  return { tier, isNew: false, isUpgrade: false, comboKey: key, newBadges };
}

/**
 * Records a completion, keeping the best of everything.
 *
 * Badges and tier are tracked separately on purpose: a careful unaided solve
 * and a fast one are different accomplishments, and demanding both at once
 * would make the badge unreachable on any board worth the name.
 */
export function saveAchievement(
  size: number,
  difficulty: string,
  tier: TimeTier,
  timeSeconds: number,
  conduct: GameConduct = NEUTRAL_CONDUCT
): void {
  try {
    const store = getAchievements();
    const key = comboKey(size, difficulty);
    const existing = store[key];
    const beatsTime = !existing || tierRank(tier) > tierRank(existing.tier);
    store[key] = {
      size,
      difficulty,
      tier: beatsTime ? tier : existing.tier,
      timeSeconds: beatsTime ? timeSeconds : Math.min(existing.timeSeconds, timeSeconds),
      achievedAt: beatsTime ? new Date().toISOString() : existing.achievedAt,
      unaided: existing?.unaided || conduct.unaided,
      clean: existing?.clean || conduct.clean,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    console.error('Failed to save achievement:', error);
  }
}

/**
 * Folds records written under the old size-difficulty-operations key into the
 * size-difficulty one, keeping the best tier and fastest time of each group.
 * Without this a player's whole history would silently vanish from the grid.
 */
function migrateLegacyKeys(store: AchievementStore): AchievementStore {
  const merged: AchievementStore = {};
  for (const [key, achievement] of Object.entries(store)) {
    if (!achievement || typeof achievement.size !== 'number') continue;
    const target = comboKey(achievement.size, achievement.difficulty);
    const existing = merged[target];
    if (!existing || tierRank(achievement.tier) > tierRank(existing.tier)) {
      merged[target] = {
        ...achievement,
        timeSeconds: existing
          ? Math.min(existing.timeSeconds, achievement.timeSeconds)
          : achievement.timeSeconds,
        unaided: existing?.unaided || achievement.unaided,
        clean: existing?.clean || achievement.clean,
      };
    } else {
      merged[target] = {
        ...existing,
        timeSeconds: Math.min(existing.timeSeconds, achievement.timeSeconds),
        unaided: existing.unaided || achievement.unaided,
        clean: existing.clean || achievement.clean,
      };
    }
    if (key !== target) merged[target].achievedAt ??= achievement.achievedAt;
  }
  return merged;
}

export function getAchievements(): AchievementStore {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as AchievementStore;
    const migrated = migrateLegacyKeys(parsed);
    // Rewrite only when the shape actually changed, so reads stay cheap
    if (Object.keys(migrated).length !== Object.keys(parsed).length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    }
    return migrated;
  } catch {
    return {};
  }
}

export function getAchievementProgress(): {
  /** Boards in the grid. */
  total: number;
  /** Boards with any tier at all. */
  unlocked: number;
  /** Boards whose best is this tier - each board counted once. */
  byTier: Record<TimeTier, number>;
  unaided: number;
  clean: number;
} {
  const store = getAchievements();
  const achievements = Object.values(store);
  const total = VALID_SIZES.length * DIFFICULTY_LEVELS.length;
  const byTier: Record<TimeTier, number> = { bronze: 0, silver: 0, gold: 0, platinum: 0 };

  /*
   * One board, one count. This used to add every tier up to a board's rank,
   * so a single platinum read as four unlocks against a total of 320 - a
   * number with no meaning a player could hold on to.
   */
  for (const a of achievements) byTier[a.tier]++;

  return {
    total,
    unlocked: achievements.length,
    byTier,
    unaided: achievements.filter(a => a.unaided).length,
    clean: achievements.filter(a => a.clean).length,
  };
}

export function getAllCombinations(): { key: string; size: number; difficulty: string }[] {
  const combos: { key: string; size: number; difficulty: string }[] = [];
  for (const size of VALID_SIZES) {
    for (const difficulty of DIFFICULTY_LEVELS) {
      combos.push({ key: comboKey(size, difficulty), size, difficulty });
    }
  }
  return combos;
}

export function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '--';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function nextTier(current: TimeTier): TimeTier | null {
  const idx = TIER_ORDER.indexOf(current);
  if (idx >= TIER_ORDER.length - 1) return null;
  return TIER_ORDER[idx + 1];
}
