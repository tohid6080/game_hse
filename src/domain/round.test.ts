import { describe, expect, it } from 'vitest';
import {
  SHIELD_LAYERS,
  recordResult,
  startRound,
  summarizeResults,
  summarizeRound,
  type ResultInput,
  type RoundItem,
  type RoundState,
} from './round';
import { scoreCredit, weightedCredit } from './scoring';

const item = (id: string, difficulty: 1 | 2 | 3 = 1): RoundItem => ({ id, topic: 'ppe', difficulty });
const items = [item('a'), item('b'), item('c'), item('d')];

function play(results: Array<Partial<ResultInput> & { correct: boolean }>): RoundState {
  let state = startRound(items);
  results.forEach((result, index) => {
    state = recordResult(state, { item: items[index]!, hintsUsed: 0, elapsedMs: 1000, ...result }, null);
  });
  return state;
}

describe('partial credit scoring', () => {
  it('scales points by the credit earned', () => {
    const base = { difficulty: 2 as const, streakBefore: 0, elapsedMs: 0, timeLimitMs: null };
    expect(scoreCredit({ ...base, credit: 1 })).toBe(150);
    expect(scoreCredit({ ...base, credit: 0.6 })).toBe(90);
    expect(scoreCredit({ ...base, credit: 0 })).toBe(0);
    expect(scoreCredit({ ...base, credit: -1 })).toBe(0);
    expect(scoreCredit({ ...base, credit: 5 })).toBe(150); // never more than full credit
  });

  it('weights credit by difficulty over the whole round', () => {
    expect(weightedCredit([{ difficulty: 1, credit: 1 }], [1, 1])).toBe(0.5);
    expect(weightedCredit([{ difficulty: 3, credit: 0.5 }, { difficulty: 1, credit: 1 }], [3, 1])).toBeCloseTo(2 / 3);
    expect(weightedCredit([], [])).toBe(0);
  });
});

describe('round machine', () => {
  it('starts with a full shield', () => {
    expect(startRound(items)).toMatchObject({ total: 4, index: 0, layersLeft: SHIELD_LAYERS, status: 'playing' });
  });

  it('defaults credit to full for a correct result and nothing for a wrong one', () => {
    const state = play([{ correct: true }, { correct: false }]);
    expect(state.results.map((r) => r.credit)).toEqual([1, 0]);
  });

  it('applies the hint penalty to the default credit', () => {
    const state = play([{ correct: true, hintsUsed: 1 }]);
    expect(state.results[0]!.credit).toBeCloseTo(0.85);
  });

  it('honours an explicit partial credit and still counts it as correct for the shield', () => {
    const state = play([{ correct: true, credit: 0.6 }]);
    expect(state.results[0]).toMatchObject({ credit: 0.6, correct: true, points: 60 });
    expect(state.layersLeft).toBe(SHIELD_LAYERS);
    expect(state.streak).toBe(1);
  });

  it('breaks the shield after three failures and stops accepting results', () => {
    const state = play([{ correct: false }, { correct: false }, { correct: false }]);
    expect(state.status).toBe('shield-broken');
    const after = recordResult(state, { item: items[3]!, correct: true, hintsUsed: 0, elapsedMs: 0 }, null);
    expect(after).toBe(state);
  });

  it('completes when the items run out, even if the last one broke the last layer', () => {
    expect(play([{ correct: true }, { correct: false }, { correct: false }, { correct: false }]).status).toBe('completed');
  });

  it('adds a speed bonus only when a time limit is given', () => {
    const fast = recordResult(startRound(items), { item: items[0]!, correct: true, hintsUsed: 0, elapsedMs: 0 }, 60_000);
    const untimed = recordResult(startRound(items), { item: items[0]!, correct: true, hintsUsed: 0, elapsedMs: 0 }, null);
    expect(fast.results[0]!.points).toBeGreaterThan(untimed.results[0]!.points);
  });
});

describe('summaries', () => {
  it('a perfect, hint-free round is flawless; partial credit or hints are not', () => {
    const perfect = summarizeRound(play(items.map(() => ({ correct: true }))));
    expect(perfect).toMatchObject({ completed: true, flawless: true, stars: 3, correctCount: 4 });

    const partial = summarizeRound(play(items.map(() => ({ correct: true, credit: 0.9 }))));
    expect(partial.flawless).toBe(false);
    expect(partial.accuracy).toBeCloseTo(0.9);
    expect(partial.stars).toBe(3);

    const hinted = summarizeRound(play(items.map((_, i) => ({ correct: true, hintsUsed: i === 0 ? 1 : 0 }))));
    expect(hinted.flawless).toBe(false);
  });

  it('counts a broken shield as incomplete and unplayed items against accuracy', () => {
    const summary = summarizeRound(play([{ correct: true }, { correct: false }, { correct: false }, { correct: false }]));
    expect(summary.accuracy).toBeCloseTo(0.25);
  });

  it('summarises externally built results (games that do not play strictly in order)', () => {
    const results = play([{ correct: true }, { correct: true }]).results;
    const summary = summarizeResults(results, [1, 1, 1, 1], false);
    expect(summary).toMatchObject({ answered: 2, correctCount: 2, completed: false, flawless: false });
    expect(summary.accuracy).toBe(0.5);
  });
});
