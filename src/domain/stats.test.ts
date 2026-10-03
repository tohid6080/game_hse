import { describe, expect, it } from 'vitest';
import { startOfLocalDay, summarizeAttempts, type AttemptLike } from './stats';

const quiz = (overrides: Partial<AttemptLike> = {}): AttemptLike => ({
  gameId: 'quiz',
  score: 500,
  stars: 2,
  detail: {
    answers: [
      { topic: 'ppe', correct: true },
      { topic: 'ppe', correct: false },
      { topic: 'fire-safety', correct: true },
    ],
  },
  ...overrides,
});

describe('summarizeAttempts', () => {
  it('returns zeros for no attempts', () => {
    expect(summarizeAttempts([])).toEqual({
      rounds: 0,
      answered: 0,
      correct: 0,
      accuracy: 0,
      threeStarRounds: 0,
      bestScore: {},
      topics: [],
    });
  });

  it('aggregates rounds, answers, three-star rounds and best score', () => {
    const summary = summarizeAttempts([quiz(), quiz({ score: 900, stars: 3 }), quiz({ score: 100, stars: 0 })]);
    expect(summary.rounds).toBe(3);
    expect(summary.answered).toBe(9);
    expect(summary.correct).toBe(6);
    expect(summary.accuracy).toBeCloseTo(6 / 9);
    expect(summary.threeStarRounds).toBe(1);
    expect(summary.bestScore).toEqual({ quiz: 900 });
  });

  it('lists topics weakest first', () => {
    const summary = summarizeAttempts([quiz(), quiz()]);
    expect(summary.topics.map((t) => t.topic)).toEqual(['ppe', 'fire-safety']);
    expect(summary.topics[0]).toMatchObject({ answered: 4, correct: 2, accuracy: 0.5 });
    expect(summary.topics[1]).toMatchObject({ answered: 2, correct: 2, accuracy: 1 });
  });

  it('tolerates attempts without answer detail', () => {
    const summary = summarizeAttempts([quiz({ detail: undefined })]);
    expect(summary.rounds).toBe(1);
    expect(summary.answered).toBe(0);
    expect(summary.accuracy).toBe(0);
  });
});

describe('startOfLocalDay', () => {
  it('returns local midnight and is idempotent', () => {
    const noon = new Date(2026, 5, 15, 12, 30, 45).getTime();
    const midnight = startOfLocalDay(noon);
    expect(new Date(midnight).getHours()).toBe(0);
    expect(new Date(midnight).getMinutes()).toBe(0);
    expect(new Date(midnight).getDate()).toBe(15);
    expect(startOfLocalDay(midnight)).toBe(midnight);
  });
});
