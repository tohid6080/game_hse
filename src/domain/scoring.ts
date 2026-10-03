import { DAILY_COMPLETION_BONUS, DAILY_XP_FACTOR } from './daily';

/**
 * Round scoring shared by all games. Every number here is a tunable constant.
 *
 * Per question:  points = 100 × difficulty × credit × streak × (1 + speed)
 *   credit  = 1 − 0.15 per hint used (0 when wrong)
 *   streak  = 1.0 … 2.0, +0.1 per consecutive correct answer before this one
 *   speed   = 0 … 0.3 of the remaining time (only in timed mode)
 * Stars come from weighted accuracy, never from bonuses, so speed can't inflate them.
 */

export type Difficulty = 1 | 2 | 3;

export const BASE_POINTS = 100;
export const DIFFICULTY_MULTIPLIER: Record<Difficulty, number> = { 1: 1, 2: 1.5, 3: 2 };
export const HINT_PENALTY = 0.15;
export const MAX_STREAK_MULTIPLIER = 2;
export const MAX_SPEED_BONUS = 0.3;

export const STAR_THRESHOLDS = { one: 0.5, two: 0.75, three: 0.9 } as const;

export const XP = {
  pointsPerXp: 10,
  firstTimeBonus: 20,
  flawlessBonus: 25,
  /** Share of normal XP kept when the shield breaks before the round is complete. */
  brokenShieldFactor: 0.5,
  /** Rounds on the same content beyond this many in one day give reduced XP. */
  fullXpRepeatsPerDay: 3,
  repeatFactor: 0.5,
} as const;

export function hintCredit(hintsUsed: number): number {
  return Math.max(0, 1 - HINT_PENALTY * hintsUsed);
}

export function streakMultiplier(streakBefore: number): number {
  return Math.min(MAX_STREAK_MULTIPLIER, 1 + 0.1 * Math.max(0, streakBefore));
}

/** `timeLimitMs` null = untimed → no bonus. */
export function speedBonus(elapsedMs: number, timeLimitMs: number | null): number {
  if (timeLimitMs === null || timeLimitMs <= 0) return 0;
  const remaining = Math.max(0, 1 - elapsedMs / timeLimitMs);
  return MAX_SPEED_BONUS * remaining;
}

export interface QuestionScoreInput {
  difficulty: Difficulty;
  correct: boolean;
  hintsUsed: number;
  streakBefore: number;
  elapsedMs: number;
  timeLimitMs: number | null;
}

export interface CreditScoreInput {
  difficulty: Difficulty;
  /** 0..1 — how much of the item was earned (already reduced for hints). 0 = nothing. */
  credit: number;
  streakBefore: number;
  elapsedMs: number;
  timeLimitMs: number | null;
}

/** Points for an item earned with partial credit (e.g. a risk rating that was close, not exact). */
export function scoreCredit(input: CreditScoreInput): number {
  if (input.credit <= 0) return 0;
  const raw =
    BASE_POINTS *
    DIFFICULTY_MULTIPLIER[input.difficulty] *
    Math.min(1, input.credit) *
    streakMultiplier(input.streakBefore) *
    (1 + speedBonus(input.elapsedMs, input.timeLimitMs));
  return Math.round(raw);
}

/** All-or-nothing items (quiz questions): full credit minus the hint penalty, or nothing. */
export function scoreQuestion(input: QuestionScoreInput): number {
  return scoreCredit({
    difficulty: input.difficulty,
    credit: input.correct ? hintCredit(input.hintsUsed) : 0,
    streakBefore: input.streakBefore,
    elapsedMs: input.elapsedMs,
    timeLimitMs: input.timeLimitMs,
  });
}

/** Difficulty-weighted share of credit earned, over *all* items of the round (unplayed = 0). */
export function weightedCredit(
  played: ReadonlyArray<{ difficulty: Difficulty; credit: number }>,
  roundDifficulties: readonly Difficulty[],
): number {
  const total = roundDifficulties.reduce((sum, d) => sum + DIFFICULTY_MULTIPLIER[d], 0);
  if (total === 0) return 0;
  const earned = played.reduce((sum, item) => sum + DIFFICULTY_MULTIPLIER[item.difficulty] * Math.min(1, item.credit), 0);
  return Math.min(1, earned / total);
}

/** Same as `weightedCredit` for all-or-nothing items: a hint costs part of the credit. */
export function weightedAccuracy(
  played: ReadonlyArray<{ difficulty: Difficulty; correct: boolean; hintsUsed: number }>,
  roundDifficulties: readonly Difficulty[],
): number {
  return weightedCredit(
    played.map((item) => ({ difficulty: item.difficulty, credit: item.correct ? hintCredit(item.hintsUsed) : 0 })),
    roundDifficulties,
  );
}

export type Stars = 0 | 1 | 2 | 3;

export function starsForAccuracy(accuracy: number): Stars {
  if (accuracy >= STAR_THRESHOLDS.three) return 3;
  if (accuracy >= STAR_THRESHOLDS.two) return 2;
  if (accuracy >= STAR_THRESHOLDS.one) return 1;
  return 0;
}

export interface RoundXpInput {
  score: number;
  /** The round was played to the end (shield not broken). */
  completed: boolean;
  /** Every question correct, no hints, no shield layer lost. */
  flawless: boolean;
  firstTime: boolean;
  /** Finished rounds on this content earlier today. */
  repeatsToday: number;
  /** First completed round of a daily mission: its XP is doubled. */
  dailyFirst?: boolean;
  /** This round finished the last open daily mission: adds the flat completion bonus. */
  dailyCompletes?: boolean;
}

export interface RoundXp {
  base: number;
  firstTimeBonus: number;
  flawlessBonus: number;
  /** 1 normally, <1 when the same content is farmed repeatedly. */
  repeatFactor: number;
  /** 1 normally, 2 on the first completed round of a daily mission. */
  dailyFactor: number;
  /** Flat reward for completing all three daily missions (already part of `total`). */
  dailyBonus: number;
  total: number;
}

export function xpForRound(input: RoundXpInput): RoundXp {
  const raw = Math.floor(input.score / XP.pointsPerXp);
  const base = input.completed ? raw : Math.floor(raw * XP.brokenShieldFactor);
  const firstTimeBonus = input.completed && input.firstTime ? XP.firstTimeBonus : 0;
  const flawlessBonus = input.completed && input.flawless ? XP.flawlessBonus : 0;
  const repeatFactor = input.repeatsToday >= XP.fullXpRepeatsPerDay ? XP.repeatFactor : 1;
  const dailyFactor = input.completed && input.dailyFirst ? DAILY_XP_FACTOR : 1;
  const dailyBonus = input.completed && input.dailyCompletes ? DAILY_COMPLETION_BONUS : 0;
  const total = Math.floor((base + firstTimeBonus + flawlessBonus) * repeatFactor * dailyFactor) + dailyBonus;
  return { base, firstTimeBonus, flawlessBonus, repeatFactor, dailyFactor, dailyBonus, total };
}
