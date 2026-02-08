import { VALID_SIZES, DIFFICULTY_LEVELS, OPERATION_TIERS } from '../constants/gameConstants';

export type TimeTier = 'platinum' | 'gold' | 'silver' | 'bronze';

export type Achievement = {
  size: number;
  difficulty: string;
  operationsTier: string;
  tier: TimeTier;
  timeSeconds: number;
  achievedAt: string;
};

export type AchievementStore = Record<string, Achievement>;

export type AchievementResult = {
  tier: TimeTier;
  isNew: boolean;
  isUpgrade: boolean;
  previousTier?: TimeTier;
  comboKey: string;
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

function comboKey(size: number, difficulty: string, operationsTier: string): string {
  return `${size}-${difficulty}-${operationsTier}`;
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
  operationsTier: string,
  timeSeconds: number
): AchievementResult {
  const key = comboKey(size, difficulty, operationsTier);
  const tier = getTimeTier(size, difficulty, timeSeconds);
  const store = getAchievements();
  const existing = store[key];

  if (!existing) {
    return { tier, isNew: true, isUpgrade: false, comboKey: key };
  }

  if (tierRank(tier) > tierRank(existing.tier)) {
    return { tier, isNew: false, isUpgrade: true, previousTier: existing.tier, comboKey: key };
  }

  return { tier, isNew: false, isUpgrade: false, comboKey: key };
}

export function saveAchievement(
  size: number,
  difficulty: string,
  operationsTier: string,
  tier: TimeTier,
  timeSeconds: number
): void {
  try {
    const store = getAchievements();
    const key = comboKey(size, difficulty, operationsTier);
    store[key] = {
      size,
      difficulty,
      operationsTier,
      tier,
      timeSeconds,
      achievedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    console.error('Failed to save achievement:', error);
  }
}

export function getAchievements(): AchievementStore {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    return JSON.parse(stored) as AchievementStore;
  } catch {
    return {};
  }
}

export function getAchievementProgress(): {
  total: number;
  unlocked: number;
  byTier: Record<TimeTier, number>;
} {
  const store = getAchievements();
  const achievements = Object.values(store);
  const total = VALID_SIZES.length * DIFFICULTY_LEVELS.length * OPERATION_TIERS.length * TIER_ORDER.length;
  const byTier: Record<TimeTier, number> = { bronze: 0, silver: 0, gold: 0, platinum: 0 };

  // Count total unlocked tiers: e.g. a gold achievement also counts bronze + silver
  let unlocked = 0;
  for (const a of achievements) {
    const rank = tierRank(a.tier);
    // Each achievement unlocks all tiers up to and including its rank
    for (let i = 0; i <= rank; i++) {
      byTier[TIER_ORDER[i]]++;
      unlocked++;
    }
  }

  return { total, unlocked, byTier };
}

export function getAllCombinations(): { key: string; size: number; difficulty: string; operationsTier: string }[] {
  const combos: { key: string; size: number; difficulty: string; operationsTier: string }[] = [];
  for (const size of VALID_SIZES) {
    for (const difficulty of DIFFICULTY_LEVELS) {
      for (const tier of OPERATION_TIERS) {
        combos.push({ key: comboKey(size, difficulty, tier), size, difficulty, operationsTier: tier });
      }
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
