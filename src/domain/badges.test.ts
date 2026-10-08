import { describe, expect, it } from 'vitest';
import type { GameId } from '@/games/ids';
import { BADGES, BADGE_IDS, evaluateBadges, newlyUnlocked, tierName, type BadgeAttempt, type BadgeId } from './badges';

const NOW = new Date(2026, 5, 15, 12).getTime();
const day = (offset: number, hour = 10) => new Date(2026, 5, 15 + offset, hour).getTime();

function attempt(gameId: GameId, overrides: Partial<BadgeAttempt> = {}): BadgeAttempt {
  return { gameId, finishedAt: day(0), stars: 1, ...overrides };
}
const status = (attempts: BadgeAttempt[], id: BadgeId) => evaluateBadges(attempts, NOW).find((s) => s.id === id)!;
const answers = (count: number, correct = true, hintsUsed = 0) =>
  Array.from({ length: count }, () => ({ topic: 'ppe' as const, correct, hintsUsed }));

describe('badge definitions', () => {
  it('defines every id once, with strictly rising thresholds', () => {
    expect(BADGES.map((badge) => badge.id)).toEqual([...BADGE_IDS]);
    for (const badge of BADGES) {
      const [bronze, silver, gold] = badge.thresholds;
      expect(bronze, badge.id).toBeGreaterThan(0);
      expect(silver, badge.id).toBeGreaterThan(bronze);
      expect(gold, badge.id).toBeGreaterThan(silver);
    }
  });

  it('starts locked for a player with no history', () => {
    for (const result of evaluateBadges([], NOW)) {
      expect(result).toMatchObject({ value: 0, tier: 0, fraction: 0 });
      expect(result.next).not.toBeNull();
    }
  });
});

describe('metrics', () => {
  it('first-steps counts every finished round', () => {
    const rounds = Array.from({ length: 10 }, () => attempt('quiz'));
    expect(status(rounds, 'first-steps')).toMatchObject({ value: 10, tier: 2, next: 50 });
  });

  it('quiz-ace needs three-star quiz rounds only', () => {
    const rounds = [attempt('quiz', { stars: 3 }), attempt('quiz', { stars: 2 }), attempt('riskAssessment', { stars: 3 })];
    expect(status(rounds, 'quiz-ace')).toMatchObject({ value: 1, tier: 1 });
  });

  it('risk-analyst counts risk rounds with two or more stars', () => {
    const rounds = [attempt('riskAssessment', { stars: 2 }), attempt('riskAssessment', { stars: 1 }), attempt('quiz', { stars: 3 })];
    expect(status(rounds, 'risk-analyst')).toMatchObject({ value: 1, tier: 1 });
  });

  it('permit-inspector counts permit rounds with two or more stars', () => {
    const rounds = [attempt('permit', { stars: 2 }), attempt('permit', { stars: 1 }), attempt('riskAssessment', { stars: 3 })];
    expect(status(rounds, 'permit-inspector')).toMatchObject({ value: 1, tier: 1 });
  });

  it('first-responder counts emergency rounds with two or more stars', () => {
    const rounds = [attempt('emergency', { stars: 3 }), attempt('emergency', { stars: 1 }), attempt('permit', { stars: 3 })];
    expect(status(rounds, 'first-responder')).toMatchObject({ value: 1, tier: 1 });
  });

  it('hazard-hunter sums hazards found across scenes', () => {
    const scene = attempt('findHazard', { detail: { answers: [...answers(6), ...answers(4, false)] } });
    expect(status([scene, scene], 'hazard-hunter')).toMatchObject({ value: 12, tier: 1, next: 50 });
  });

  it('eagle-eye wants a whole scene without a wrong tap or a hint', () => {
    const clean = attempt('findHazard', { detail: { endedBy: 'completed', misses: 0, answers: answers(10) } });
    const missed = attempt('findHazard', { detail: { endedBy: 'completed', misses: 1, answers: answers(10) } });
    const hinted = attempt('findHazard', { detail: { endedBy: 'completed', misses: 0, answers: answers(10, true, 1) } });
    const gaveUp = attempt('findHazard', { detail: { endedBy: 'gave-up', misses: 0, answers: answers(10) } });
    expect(status([clean, missed, hinted, gaveUp], 'eagle-eye').value).toBe(1);
  });

  it('streak uses the best run of days, ignoring days in the future', () => {
    const run = [day(-3), day(-2), day(-1), day(0)].map((finishedAt) => attempt('quiz', { finishedAt }));
    expect(status(run, 'streak')).toMatchObject({ value: 4, tier: 1 });
    const future = [day(0), day(1), day(2), day(3)].map((finishedAt) => attempt('quiz', { finishedAt }));
    expect(status(future, 'streak').value).toBe(1);
  });

  it('daily-hero needs all three missions counted on the same day', () => {
    const counted = (gameId: GameId, daily: string) => attempt(gameId, { detail: { daily, answers: [] } });
    const full = [counted('quiz', '2026-06-14'), counted('riskAssessment', '2026-06-14'), counted('findHazard', '2026-06-14')];
    const partial = [counted('quiz', '2026-06-15'), counted('riskAssessment', '2026-06-15')];
    expect(status([...full, ...partial], 'daily-hero')).toMatchObject({ value: 1, tier: 1 });
    expect(status(partial, 'daily-hero').value).toBe(0);
  });

  it('all-rounder counts radar domains at 70% or better', () => {
    const strong = (topic: 'ppe' | 'emergency' | 'law-and-regulation') =>
      attempt('quiz', { detail: { answers: Array.from({ length: 4 }, () => ({ topic, correct: true })) } });
    expect(status([strong('ppe'), strong('emergency')], 'all-rounder')).toMatchObject({ value: 2, tier: 1 });
    expect(status([strong('ppe')], 'all-rounder').value).toBe(1);
  });
});

describe('tiers and progress', () => {
  it('reports the next threshold and the fraction towards it', () => {
    expect(status([attempt('quiz', { stars: 3 }), attempt('quiz', { stars: 3 })], 'quiz-ace')).toMatchObject({ tier: 1, next: 5, fraction: 0.4 });
  });

  it('is maxed at gold', () => {
    const rounds = Array.from({ length: 20 }, () => attempt('quiz', { stars: 3 }));
    expect(status(rounds, 'quiz-ace')).toMatchObject({ tier: 3, next: null, fraction: 1 });
  });

  it('names the tiers', () => {
    expect([1, 2, 3].map((tier) => tierName(tier as 1 | 2 | 3))).toEqual(['bronze', 'silver', 'gold']);
  });
});

describe('newlyUnlocked', () => {
  it('lists only medals whose tier rose', () => {
    const before = evaluateBadges([], NOW);
    const after = evaluateBadges([attempt('quiz', { stars: 3 })], NOW);
    expect(newlyUnlocked(before, after)).toEqual([
      { id: 'first-steps', tier: 1 },
      { id: 'quiz-ace', tier: 1 },
    ]);
    expect(newlyUnlocked(after, after)).toEqual([]);
  });

  it('reports the highest tier when one round jumps several, and nothing when tiers fall', () => {
    const none = evaluateBadges([], NOW);
    const scene = attempt('findHazard', { detail: { answers: answers(60) } });
    expect(newlyUnlocked(none, evaluateBadges([scene], NOW)).find((u) => u.id === 'hazard-hunter')).toEqual({ id: 'hazard-hunter', tier: 2 });
    expect(newlyUnlocked(evaluateBadges([scene], NOW), none)).toEqual([]);
  });
});
