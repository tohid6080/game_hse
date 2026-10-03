import type { GameId } from '@/games/ids';
import { DAILY_TASK_IDS, taskOfGame, type DailyTaskId } from './daily';
import { computeRadar, type RadarAnswer } from './radar';
import { computeStreak } from './streak';

/**
 * Medals are derived, never stored: each one is a metric over the attempt log with three
 * thresholds (bronze, silver, gold). Because they are recomputed, they can never disagree with the
 * history, and the result screen shows "new medal" by comparing the state before and after a round.
 * Only medals for games that exist are defined (Emergency, Permit and BowTie add theirs with the games).
 */

export const BADGE_TIERS = ['bronze', 'silver', 'gold'] as const;
export type BadgeTier = (typeof BADGE_TIERS)[number];

export const BADGE_IDS = [
  'first-steps',
  'quiz-ace',
  'risk-analyst',
  'hazard-hunter',
  'eagle-eye',
  'streak',
  'daily-hero',
  'all-rounder',
] as const;
export type BadgeId = (typeof BADGE_IDS)[number];

/** Share a radar domain must reach to count for the all-rounder medal. */
export const ALL_ROUNDER_LEVEL = 0.7;

export interface BadgeAttempt {
  gameId: GameId;
  finishedAt: number;
  stars: number;
  detail?: {
    endedBy?: string;
    misses?: number;
    daily?: string;
    answers: ReadonlyArray<RadarAnswer & { hintsUsed?: number }>;
  };
}

interface BadgeContext {
  attempts: readonly BadgeAttempt[];
  now: number;
}

interface BadgeDefinition {
  id: BadgeId;
  /** Metric value needed for bronze, silver, gold. */
  thresholds: readonly [number, number, number];
  metric: (context: BadgeContext) => number;
}

const ofGame = (context: BadgeContext, gameId: GameId): BadgeAttempt[] =>
  context.attempts.filter((attempt) => attempt.gameId === gameId);

/** Days on which all three daily missions have a counted round. */
function perfectDailyDays(attempts: readonly BadgeAttempt[]): number {
  const byDay = new Map<string, Set<DailyTaskId>>();
  for (const attempt of attempts) {
    const day = attempt.detail?.daily;
    const task = taskOfGame(attempt.gameId);
    if (!day || !task) continue;
    byDay.set(day, (byDay.get(day) ?? new Set()).add(task));
  }
  return [...byDay.values()].filter((tasks) => DAILY_TASK_IDS.every((id) => tasks.has(id))).length;
}

export const BADGES: readonly BadgeDefinition[] = [
  { id: 'first-steps', thresholds: [1, 10, 50], metric: (c) => c.attempts.length },
  { id: 'quiz-ace', thresholds: [1, 5, 20], metric: (c) => ofGame(c, 'quiz').filter((a) => a.stars >= 3).length },
  { id: 'risk-analyst', thresholds: [1, 5, 15], metric: (c) => ofGame(c, 'riskAssessment').filter((a) => a.stars >= 2).length },
  {
    id: 'hazard-hunter',
    thresholds: [10, 50, 200],
    metric: (c) => ofGame(c, 'findHazard').reduce((sum, a) => sum + (a.detail?.answers.filter((x) => x.correct).length ?? 0), 0),
  },
  {
    id: 'eagle-eye',
    thresholds: [1, 3, 10],
    // A whole scene found with no wrong tap and no hint.
    metric: (c) =>
      ofGame(c, 'findHazard').filter(
        (a) => a.detail?.endedBy === 'completed' && a.detail.misses === 0 && a.detail.answers.every((x) => (x.hintsUsed ?? 0) === 0),
      ).length,
  },
  {
    id: 'streak',
    thresholds: [3, 7, 30],
    metric: (c) =>
      computeStreak(
        c.attempts.map((a) => a.finishedAt),
        c.now,
      ).best,
  },
  { id: 'daily-hero', thresholds: [1, 7, 30], metric: (c) => perfectDailyDays(c.attempts) },
  {
    id: 'all-rounder',
    thresholds: [2, 4, 6],
    metric: (c) => computeRadar(c.attempts).filter((axis) => axis.value !== null && axis.value >= ALL_ROUNDER_LEVEL).length,
  },
];

export interface BadgeStatus {
  id: BadgeId;
  value: number;
  /** 0 = locked, 1 bronze, 2 silver, 3 gold. */
  tier: 0 | 1 | 2 | 3;
  /** Metric needed for the next tier, null at gold. */
  next: number | null;
  /** Progress towards the next tier, 0..1 (1 at gold). */
  fraction: number;
}

export function evaluateBadges(attempts: readonly BadgeAttempt[], now: number): BadgeStatus[] {
  const context = { attempts, now };
  return BADGES.map((badge) => {
    const value = badge.metric(context);
    const reached = badge.thresholds.filter((threshold) => value >= threshold).length as 0 | 1 | 2 | 3;
    const next = reached === 3 ? null : badge.thresholds[reached]!;
    return { id: badge.id, value, tier: reached, next, fraction: next === null ? 1 : Math.min(1, value / next) };
  });
}

export interface BadgeUnlock {
  id: BadgeId;
  /** The tier now held (the highest one reached, when a round jumps several). */
  tier: 1 | 2 | 3;
}

/** Medals whose tier went up between two evaluations. */
export function newlyUnlocked(before: readonly BadgeStatus[], after: readonly BadgeStatus[]): BadgeUnlock[] {
  const had = new Map(before.map((status) => [status.id, status.tier]));
  return after
    .filter((status) => status.tier > (had.get(status.id) ?? 0))
    .map((status) => ({ id: status.id, tier: status.tier as 1 | 2 | 3 }));
}

export function tierName(tier: 1 | 2 | 3): BadgeTier {
  return BADGE_TIERS[tier - 1]!;
}
