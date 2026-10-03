import { describe, expect, it } from 'vitest';
import {
  hintCredit,
  scoreQuestion,
  speedBonus,
  starsForAccuracy,
  streakMultiplier,
  weightedAccuracy,
  xpForRound,
  type Difficulty,
} from './scoring';

const base = { difficulty: 1 as Difficulty, correct: true, hintsUsed: 0, streakBefore: 0, elapsedMs: 0, timeLimitMs: null };

describe('question scoring', () => {
  it('awards 100 × difficulty for a plain correct answer', () => {
    expect(scoreQuestion(base)).toBe(100);
    expect(scoreQuestion({ ...base, difficulty: 2 })).toBe(150);
    expect(scoreQuestion({ ...base, difficulty: 3 })).toBe(200);
  });

  it('scores nothing for a wrong answer, whatever the bonuses', () => {
    expect(scoreQuestion({ ...base, correct: false, streakBefore: 9, elapsedMs: 0, timeLimitMs: 1000 })).toBe(0);
  });

  it('subtracts 15% per hint', () => {
    expect(scoreQuestion({ ...base, hintsUsed: 1 })).toBe(85);
    expect(hintCredit(10)).toBe(0);
  });

  it('ramps the streak multiplier from 1× to a 2× cap', () => {
    expect(streakMultiplier(0)).toBe(1);
    expect(streakMultiplier(5)).toBeCloseTo(1.5);
    expect(streakMultiplier(10)).toBe(2);
    expect(streakMultiplier(50)).toBe(2);
    expect(scoreQuestion({ ...base, streakBefore: 10 })).toBe(200);
  });

  it('gives a speed bonus only in timed mode, up to 30%', () => {
    expect(speedBonus(0, null)).toBe(0);
    expect(speedBonus(0, 30000)).toBeCloseTo(0.3);
    expect(speedBonus(15000, 30000)).toBeCloseTo(0.15);
    expect(speedBonus(30000, 30000)).toBe(0);
    expect(speedBonus(99999, 30000)).toBe(0);
    expect(scoreQuestion({ ...base, elapsedMs: 0, timeLimitMs: 30000 })).toBe(130);
  });
});

describe('stars', () => {
  it('computes accuracy over the whole round, counting unplayed questions as zero', () => {
    const played = [
      { difficulty: 1 as Difficulty, correct: true, hintsUsed: 0 },
      { difficulty: 1 as Difficulty, correct: false, hintsUsed: 0 },
    ];
    expect(weightedAccuracy(played, [1, 1])).toBe(0.5);
    expect(weightedAccuracy(played, [1, 1, 1, 1])).toBe(0.25);
  });

  it('weights harder questions more and reduces credit for hints', () => {
    const played = [
      { difficulty: 3 as Difficulty, correct: true, hintsUsed: 0 },
      { difficulty: 1 as Difficulty, correct: false, hintsUsed: 0 },
    ];
    expect(weightedAccuracy(played, [3, 1])).toBeCloseTo(2 / 3);
    expect(weightedAccuracy([{ difficulty: 1, correct: true, hintsUsed: 1 }], [1])).toBeCloseTo(0.85);
  });

  it('maps accuracy to stars at the documented thresholds', () => {
    expect(starsForAccuracy(0.49)).toBe(0);
    expect(starsForAccuracy(0.5)).toBe(1);
    expect(starsForAccuracy(0.74)).toBe(1);
    expect(starsForAccuracy(0.75)).toBe(2);
    expect(starsForAccuracy(0.89)).toBe(2);
    expect(starsForAccuracy(0.9)).toBe(3);
    expect(starsForAccuracy(1)).toBe(3);
  });

  it('guards against an empty round', () => {
    expect(weightedAccuracy([], [])).toBe(0);
  });
});

describe('round XP', () => {
  const input = { score: 1000, completed: true, flawless: false, firstTime: false, repeatsToday: 0 };

  it('converts 10 points to 1 XP', () => {
    expect(xpForRound(input)).toEqual({ base: 100, firstTimeBonus: 0, flawlessBonus: 0, repeatFactor: 1, dailyFactor: 1, dailyBonus: 0, total: 100 });
  });

  it('adds first-time and flawless bonuses on completed rounds', () => {
    const xp = xpForRound({ ...input, firstTime: true, flawless: true });
    expect(xp.firstTimeBonus).toBe(20);
    expect(xp.flawlessBonus).toBe(25);
    expect(xp.total).toBe(145);
  });

  it('halves XP and drops bonuses when the shield broke', () => {
    const xp = xpForRound({ ...input, completed: false, firstTime: true, flawless: true });
    expect(xp).toEqual({ base: 50, firstTimeBonus: 0, flawlessBonus: 0, repeatFactor: 1, dailyFactor: 1, dailyBonus: 0, total: 50 });
  });

  it('damps XP after three rounds on the same content in a day', () => {
    expect(xpForRound({ ...input, repeatsToday: 2 }).total).toBe(100);
    expect(xpForRound({ ...input, repeatsToday: 3 }).total).toBe(50);
    expect(xpForRound({ ...input, repeatsToday: 3 }).repeatFactor).toBe(0.5);
  });

  it('doubles the XP of the first completed round of a daily mission, bonuses included', () => {
    const xp = xpForRound({ ...input, firstTime: true, flawless: true, dailyFirst: true });
    expect(xp.dailyFactor).toBe(2);
    expect(xp.total).toBe(290);
  });

  it('adds the flat daily completion bonus after the doubling, and never doubles it', () => {
    const xp = xpForRound({ ...input, dailyFirst: true, dailyCompletes: true });
    expect(xp.dailyBonus).toBe(100);
    expect(xp.total).toBe(300);
    expect(xpForRound({ ...input, dailyCompletes: true }).total).toBe(200);
  });

  it('gives no daily reward for a round that did not complete', () => {
    const xp = xpForRound({ ...input, completed: false, dailyFirst: true, dailyCompletes: true });
    expect(xp).toMatchObject({ dailyFactor: 1, dailyBonus: 0, total: 50 });
  });

  it('never yields negative or fractional XP', () => {
    for (const score of [0, 1, 9, 10, 15, 999]) {
      const total = xpForRound({ ...input, score, repeatsToday: 5 }).total;
      expect(Number.isInteger(total)).toBe(true);
      expect(total).toBeGreaterThanOrEqual(0);
    }
  });
});
