import { describe, expect, it } from 'vitest';
import { DAY_MS, isDue, nextLeitner, type LeitnerState } from './leitner';

const NOW = 1_000_000_000_000;
const right = { correct: true, assisted: false };
const wrong = { correct: false, assisted: false };

describe('leitner', () => {
  it('moves a new question that is answered correctly to box 2, due in a day', () => {
    const next = nextLeitner(undefined, right, NOW);
    expect(next).toMatchObject({ box: 2, seen: 1, correct: 1, wrong: 0, lastAnsweredAt: NOW });
    expect(next.dueAt).toBe(NOW + DAY_MS);
  });

  it('keeps a new question that is answered wrong in box 1, due immediately', () => {
    const next = nextLeitner(undefined, wrong, NOW);
    expect(next).toMatchObject({ box: 1, seen: 1, correct: 0, wrong: 1 });
    expect(next.dueAt).toBe(NOW);
    expect(isDue(next, NOW)).toBe(true);
  });

  it('climbs one box per correct answer with growing intervals, capped at box 5', () => {
    let state: LeitnerState | undefined;
    const intervals: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      state = nextLeitner(state, right, NOW);
      intervals.push((state.dueAt - NOW) / DAY_MS);
    }
    expect(intervals).toEqual([1, 3, 7, 14, 14, 14, 14]);
    expect(state?.box).toBe(5);
  });

  it('sends any wrong answer back to box 1 regardless of how high it was', () => {
    let state = nextLeitner(undefined, right, NOW);
    state = nextLeitner(state, right, NOW);
    state = nextLeitner(state, right, NOW);
    expect(state.box).toBe(4);
    const after = nextLeitner(state, wrong, NOW + 5);
    expect(after.box).toBe(1);
    expect(after.wrong).toBe(1);
    expect(after.correct).toBe(3);
  });

  it('does not promote an assisted (hinted) correct answer', () => {
    const start = nextLeitner(undefined, right, NOW);
    const assisted = nextLeitner(start, { correct: true, assisted: true }, NOW);
    expect(assisted.box).toBe(start.box);
    expect(assisted.correct).toBe(2);
    expect(nextLeitner(undefined, { correct: true, assisted: true }, NOW).box).toBe(1);
  });

  it('reports due only once the due time has passed', () => {
    const state = nextLeitner(undefined, right, NOW);
    expect(isDue(state, NOW)).toBe(false);
    expect(isDue(state, NOW + DAY_MS)).toBe(true);
  });
});
