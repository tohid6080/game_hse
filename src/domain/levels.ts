/**
 * XP / level curve. Tunable: the formula lives here only, everything else derives from it.
 *
 * XP needed to go from level L to L+1:  100 + 50 * (L - 1)
 * Cumulative XP needed to *reach* level L:  100n + 25n(n - 1), with n = L - 1
 */

export const RANK_TIERS = [
  { id: 'trainee', minLevel: 1 },
  { id: 'observer', minLevel: 6 },
  { id: 'officer', minLevel: 11 },
  { id: 'specialist', minLevel: 21 },
  { id: 'senior', minLevel: 31 },
  { id: 'guardian', minLevel: 46 },
] as const;

export type RankTierId = (typeof RANK_TIERS)[number]['id'];

export interface LevelProgress {
  level: number;
  /** XP earned inside the current level. */
  xpIntoLevel: number;
  /** XP span of the current level (what it takes to reach the next one). */
  xpForNextLevel: number;
  /** 0..1 progress through the current level. */
  fraction: number;
}

function sanitizeXp(xp: number): number {
  return Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
}

export function xpToNextLevel(level: number): number {
  return 100 + 50 * (Math.max(1, Math.floor(level)) - 1);
}

export function totalXpForLevel(level: number): number {
  const n = Math.max(1, Math.floor(level)) - 1;
  return 100 * n + 25 * n * (n - 1);
}

export function levelFromXp(xp: number): number {
  const safe = sanitizeXp(xp);
  // Closed-form estimate (solves 25n² + 75n = xp), then corrected for floating-point drift.
  let n = Math.floor((-75 + Math.sqrt(75 * 75 + 100 * safe)) / 50);
  while (totalXpForLevel(n + 2) <= safe) n += 1;
  while (n > 0 && totalXpForLevel(n + 1) > safe) n -= 1;
  return n + 1;
}

export function levelProgress(xp: number): LevelProgress {
  const safe = sanitizeXp(xp);
  const level = levelFromXp(safe);
  const xpForNextLevel = xpToNextLevel(level);
  const xpIntoLevel = safe - totalXpForLevel(level);
  return { level, xpIntoLevel, xpForNextLevel, fraction: xpIntoLevel / xpForNextLevel };
}

export function rankTierForLevel(level: number): RankTierId {
  let current: RankTierId = RANK_TIERS[0].id;
  for (const tier of RANK_TIERS) {
    if (level >= tier.minLevel) current = tier.id;
  }
  return current;
}
