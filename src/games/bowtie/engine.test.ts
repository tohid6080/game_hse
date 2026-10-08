import { describe, expect, it } from 'vitest';
import type { BowtieCase, BowtieCategory } from '@/content/schema';
import { startRound, summarizeRound } from '@/domain/round';
import { createRng } from '@/lib/rng';
import {
  BOWTIE_ROUND_LENGTH,
  BOWTIE_TIME_LIMIT_MS,
  CORRECT_THRESHOLD,
  judgeBowtie,
  lastSeenFromAttempts,
  prepareBowtie,
  recordBowtie,
  selectBowties,
  type Placements,
} from './engine';

const LAYOUT: ReadonlyArray<[string, BowtieCategory]> = [
  ['t1', 'threat'],
  ['t2', 'threat'],
  ['p1', 'preventive'],
  ['p2', 'preventive'],
  ['m1', 'mitigating'],
  ['m2', 'mitigating'],
  ['c1', 'consequence'],
  ['c2', 'consequence'],
  ['n1', 'none'],
  ['n2', 'none'],
];

function bowtie(id: string, overrides: Partial<BowtieCase> = {}): BowtieCase {
  return {
    id,
    reviewStatus: 'draft',
    difficulty: 2,
    topic: 'fire-safety',
    industries: ['general'],
    title: id,
    hazard: 'hazard',
    topEvent: 'top event',
    prompt: 'prompt',
    cards: LAYOUT.map(([cardId, category]) => ({ id: cardId, text: `text ${cardId}`, category, why: 'why' })),
    explanation: 'explanation',
    references: [],
    ...overrides,
  };
}

const sample = bowtie('bowtie.sample');
const perfect: Placements = Object.fromEntries(LAYOUT);

describe('judging a placement', () => {
  it('gives full credit when every card is in its group', () => {
    expect(judgeBowtie(sample, perfect)).toMatchObject({ rightCount: 10, unplaced: 0, timingMixups: 0, credit: 1, correct: true });
  });

  it('counts each wrong card and keeps the case handled while enough are right', () => {
    const judged = judgeBowtie(sample, { ...perfect, t1: 'consequence', c1: 'threat' });
    expect(judged.rightCount).toBe(8);
    expect(judged.credit).toBe(0.8);
    expect(judged.correct).toBe(true);
    expect(judged.cards.find((card) => card.id === 't1')).toMatchObject({ expected: 'threat', given: 'consequence', right: false });
  });

  it('fails a case below the threshold', () => {
    const judged = judgeBowtie(sample, { ...perfect, t1: 'none', t2: 'none', p1: 'none' });
    expect(judged.credit).toBe(0.7);
    expect(judged.credit).toBeLessThan(CORRECT_THRESHOLD);
    expect(judged.correct).toBe(false);
  });

  it('counts cards the player left alone as wrong', () => {
    const judged = judgeBowtie(sample, { t1: 'threat', t2: 'threat' });
    expect(judged).toMatchObject({ rightCount: 2, unplaced: 8, credit: 0.2, correct: false });
    expect(judged.cards.find((card) => card.id === 'p1')!.given).toBeNull();
  });

  it('knows that "none" is a real answer for a distractor', () => {
    expect(judgeBowtie(sample, { ...perfect, n1: 'preventive' }).cards.find((card) => card.id === 'n1')!.right).toBe(false);
    expect(judgeBowtie(sample, perfect).cards.find((card) => card.id === 'n1')!.right).toBe(true);
  });

  it('points out barriers put on the wrong side of the top event, and only those', () => {
    const judged = judgeBowtie(sample, { ...perfect, p1: 'mitigating', m1: 'preventive', t1: 'preventive', c1: 'mitigating' });
    // p1 and m1 swapped sides: two timing mix-ups. t1 (a threat) and c1 (a consequence) are other mistakes.
    expect(judged.timingMixups).toBe(2);
    expect(judged.rightCount).toBe(6);
  });
});

describe('preparing a case', () => {
  it('shuffles the cards without losing or changing any', () => {
    const prepared = prepareBowtie(sample, createRng(3));
    expect(prepared.cards).toHaveLength(sample.cards.length);
    expect([...prepared.cards].map((card) => card.id).sort()).toEqual([...sample.cards].map((card) => card.id).sort());
    expect(prepared.cards.map((card) => card.id)).not.toEqual(sample.cards.map((card) => card.id));
  });
});

describe('choosing the bowties of a round', () => {
  const bank = Array.from({ length: 7 }, (_, i) => bowtie(`bowtie.b${i}`, { difficulty: ((i % 3) + 1) as 1 | 2 | 3 }));
  const base = { bowties: bank, lastSeenAt: new Map<string, number>(), experience: 'expert' as const, industry: 'general' as const };

  it('picks distinct bowties, easiest first', () => {
    const round = selectBowties({ ...base, rng: createRng(8) });
    expect(round).toHaveLength(BOWTIE_ROUND_LENGTH);
    expect(new Set(round.map((b) => b.id)).size).toBe(BOWTIE_ROUND_LENGTH);
    expect(round.map((b) => b.difficulty)).toEqual([...round.map((b) => b.difficulty)].sort((a, b) => a - b));
  });

  it('prefers bowties the player has not seen and respects the sector', () => {
    const lastSeenAt = new Map(bank.slice(0, 4).map((b, i) => [b.id, 10 + i]));
    expect(selectBowties({ ...base, lastSeenAt, rng: createRng(2) }).every((b) => !lastSeenAt.has(b.id))).toBe(true);
    const sectors = [bowtie('bowtie.gas', { industries: ['oil-gas'] }), bowtie('bowtie.site', { industries: ['construction'] })];
    expect(selectBowties({ ...base, bowties: sectors, industry: 'construction', rng: createRng(2), count: 2 }).map((b) => b.id)).toEqual(['bowtie.site']);
  });
});

describe('a bowtie on the shared machine', () => {
  it('keeps the streak on a handled bowtie and breaks a layer on a failed one', () => {
    const other = bowtie('bowtie.other');
    let state = startRound([sample, other]);
    state = recordBowtie(state, { bowtie: sample, judgement: judgeBowtie(sample, perfect), elapsedMs: 1000 }, false);
    expect(state.results[0]).toMatchObject({ credit: 1, correct: true });
    expect(state.streak).toBe(1);

    state = recordBowtie(state, { bowtie: other, judgement: judgeBowtie(other, {}), elapsedMs: 1000 }, false);
    expect(state.layersLeft).toBe(2);
    expect(state.streak).toBe(0);
    expect(state.results[1]!.credit).toBe(0);
    expect(summarizeRound(state).completed).toBe(true);
  });

  it('gives a speed bonus only in timed mode', () => {
    const input = { bowtie: sample, judgement: judgeBowtie(sample, perfect), elapsedMs: 0 };
    const timed = recordBowtie(startRound([sample]), input, true);
    const untimed = recordBowtie(startRound([sample]), input, false);
    expect(timed.results[0]!.points).toBeGreaterThan(untimed.results[0]!.points);
    expect(BOWTIE_TIME_LIMIT_MS).toBeGreaterThan(0);
  });
});

describe('lastSeenFromAttempts', () => {
  it('is shared with the other games', () => {
    expect(lastSeenFromAttempts([{ finishedAt: 7, detail: { answers: [{ questionId: 'y' }] } }]).get('y')).toBe(7);
  });
});
