import { describe, expect, it } from 'vitest';
import type { PermitCase } from '@/content/schema';
import { startRound, summarizeRound } from '@/domain/round';
import { createRng } from '@/lib/rng';
import {
  CORRECT_THRESHOLD,
  FALSE_FLAG_PENALTY,
  PERMIT_ROUND_LENGTH,
  PERMIT_TIME_LIMIT_MS,
  judgePermit,
  lastSeenFromAttempts,
  recordPermit,
  selectPermits,
  shouldReject,
} from './engine';

function permit(id: string, defects: PermitCase['defects'], overrides: Partial<PermitCase> = {}): PermitCase {
  return {
    id,
    reviewStatus: 'draft',
    difficulty: 2,
    topic: 'permit-to-work',
    industries: ['general'],
    title: id,
    prompt: 'prompt',
    permitType: 'hot-work',
    sections: [
      {
        title: 'a',
        fields: [
          { id: 'gas', label: 'gas', value: 'v' },
          { id: 'watch', label: 'watch', value: 'v' },
          { id: 'sign', label: 'sign', value: 'v' },
          { id: 'area', label: 'area', value: 'v' },
        ],
      },
      { title: 'b', fields: [{ id: 'ppe', label: 'ppe', value: 'v' }] },
    ],
    defects,
    explanation: 'explanation',
    references: [],
    ...overrides,
  };
}

const critical = { fieldIds: ['gas'], critical: true, why: 'x' };
const minor = { fieldIds: ['sign'], critical: false, why: 'x' };
const twoDefects = permit('permit.hot-work.two', [critical, minor]);
const valid = permit('permit.hot-work.valid', []);

describe('judging a permit', () => {
  it('gives full credit for rejecting a defective permit with every defect found and nothing else flagged', () => {
    const judged = judgePermit(twoDefects, { flagged: ['gas', 'sign'], decision: 'reject' });
    expect(judged).toMatchObject({ shouldReject: true, decisionRight: true, foundCount: 2, missedCritical: false, falseFlags: [], credit: 1, correct: true });
  });

  it('gives full credit for approving a valid permit with nothing flagged', () => {
    expect(judgePermit(valid, { flagged: [], decision: 'approve' })).toMatchObject({ shouldReject: false, decisionRight: true, credit: 1, correct: true });
  });

  it('accepts any one of the fields a defect is attached to', () => {
    const contradiction = permit('permit.hot-work.contradiction', [{ fieldIds: ['gas', 'area'], critical: true, why: 'x' }]);
    expect(judgePermit(contradiction, { flagged: ['area'], decision: 'reject' }).defects[0]!.found).toBe(true);
    expect(judgePermit(contradiction, { flagged: ['gas', 'area'], decision: 'reject' }).falseFlags).toEqual([]);
  });

  it('fails a permit whose critical defect was missed, even with the right decision and a high credit', () => {
    const judged = judgePermit(twoDefects, { flagged: ['sign'], decision: 'reject' });
    expect(judged.missedCritical).toBe(true);
    expect(judged.credit).toBeGreaterThanOrEqual(CORRECT_THRESHOLD);
    expect(judged.correct).toBe(false);
  });

  it('may miss a minor defect and still count as handled', () => {
    const minorOnly = permit('permit.hot-work.minor', [critical, { ...minor, fieldIds: ['sign'] }, { fieldIds: ['area'], critical: false, why: 'x' }]);
    const judged = judgePermit(minorOnly, { flagged: ['gas', 'sign'], decision: 'reject' });
    expect(judged.missedCritical).toBe(false);
    expect(judged.credit).toBeCloseTo(0.4 + 0.6 * (2 / 3));
    expect(judged.correct).toBe(true);
  });

  it('takes a share off for every flagged field that is not a defect', () => {
    const judged = judgePermit(twoDefects, { flagged: ['gas', 'sign', 'ppe'], decision: 'reject' });
    expect(judged.falseFlags).toEqual(['ppe']);
    expect(judged.findingsCredit).toBeCloseTo(1 - FALSE_FLAG_PENALTY);
    expect(judged.credit).toBeCloseTo(0.4 + 0.6 * (1 - FALSE_FLAG_PENALTY));
    // …and a valid permit is not "handled" if the player cried wolf all over it
    const wolf = judgePermit(valid, { flagged: ['gas', 'watch', 'ppe'], decision: 'approve' });
    expect(wolf.findingsCredit).toBeCloseTo(0.1);
    expect(wolf.correct).toBe(false);
  });

  it('never returns a negative credit', () => {
    const judged = judgePermit(valid, { flagged: ['gas', 'watch', 'sign', 'area', 'ppe'], decision: 'approve' });
    expect(judged.findingsCredit).toBe(0);
    expect(judged.credit).toBeCloseTo(0.4);
  });

  it('punishes approving a defective permit even when every defect was marked', () => {
    const judged = judgePermit(twoDefects, { flagged: ['gas', 'sign'], decision: 'approve' });
    expect(judged.decisionRight).toBe(false);
    expect(judged.credit).toBeCloseTo(0.3);
    expect(judged.correct).toBe(false);
  });

  it('punishes rejecting a valid permit', () => {
    const judged = judgePermit(valid, { flagged: [], decision: 'reject' });
    expect(judged.decisionRight).toBe(false);
    expect(judged.credit).toBeLessThan(CORRECT_THRESHOLD);
    expect(judged.correct).toBe(false);
  });

  it('handles a timeout: no decision counts as wrong, the findings still count a little', () => {
    const judged = judgePermit(twoDefects, { flagged: ['gas', 'sign'], decision: null });
    expect(judged).toMatchObject({ decision: null, decisionRight: false, correct: false });
    expect(judged.credit).toBeCloseTo(0.3);
    expect(judgePermit(twoDefects, { flagged: [], decision: null }).credit).toBe(0);
  });

  it('knows which permits should be rejected', () => {
    expect(shouldReject(twoDefects)).toBe(true);
    expect(shouldReject(valid)).toBe(false);
  });
});

describe('choosing the permits of a round', () => {
  const bank: PermitCase[] = [
    ...Array.from({ length: 8 }, (_, i) => permit(`permit.hot-work.d${i}`, [critical], { difficulty: ((i % 3) + 1) as 1 | 2 | 3 })),
    permit('permit.hot-work.valid-1', [], { difficulty: 1 }),
    permit('permit.hot-work.valid-2', [], { difficulty: 3 }),
  ];
  const base = { permits: bank, lastSeenAt: new Map<string, number>(), experience: 'expert' as const, industry: 'general' as const };

  it('picks a full round, easiest first, with no repeats', () => {
    const round = selectPermits({ ...base, rng: createRng(5) });
    expect(round).toHaveLength(PERMIT_ROUND_LENGTH);
    expect(new Set(round.map((p) => p.id)).size).toBe(PERMIT_ROUND_LENGTH);
    expect(round.map((p) => p.difficulty)).toEqual([...round.map((p) => p.difficulty)].sort((a, b) => a - b));
  });

  it('never deals a round of rejects only while the pool has a valid permit', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const round = selectPermits({ ...base, rng: createRng(seed) });
      expect(round.some((p) => !shouldReject(p)), `seed ${seed}`).toBe(true);
      expect(round).toHaveLength(PERMIT_ROUND_LENGTH);
    }
  });

  it('leaves the draw alone when the pool has no valid permit', () => {
    const rejectsOnly = bank.filter(shouldReject);
    const round = selectPermits({ ...base, permits: rejectsOnly, rng: createRng(3) });
    expect(round).toHaveLength(PERMIT_ROUND_LENGTH);
    expect(round.every(shouldReject)).toBe(true);
  });

  it('prefers permits the player has not seen', () => {
    const lastSeenAt = new Map(bank.slice(0, 5).map((p, i) => [p.id, 1000 + i]));
    const round = selectPermits({ ...base, lastSeenAt, rng: createRng(9) });
    expect(round.filter((p) => lastSeenAt.has(p.id)).length).toBeLessThanOrEqual(1);
  });

  it('keeps hard permits away from beginners while easier ones are available', () => {
    const round = selectPermits({ ...base, experience: 'beginner', rng: createRng(4) });
    expect(round.every((p) => p.difficulty <= 2)).toBe(true);
  });

  it('respects the player\'s industry', () => {
    const mixed = [permit('permit.hot-work.gas', [critical], { industries: ['oil-gas'] }), permit('permit.hot-work.build', [critical], { industries: ['construction'] })];
    const round = selectPermits({ ...base, permits: mixed, industry: 'construction', rng: createRng(2), count: 2 });
    expect(round.map((p) => p.id)).toEqual(['permit.hot-work.build']);
  });
});

describe('a permit round on the shared machine', () => {
  it('keeps the streak and the shield on a handled permit, and breaks a layer on a miss', () => {
    let state = startRound([twoDefects, valid]);
    const good = judgePermit(twoDefects, { flagged: ['gas', 'sign'], decision: 'reject' });
    state = recordPermit(state, { permit: twoDefects, judgement: good, hintsUsed: 0, elapsedMs: 1000 }, false);
    expect(state.results[0]).toMatchObject({ credit: 1, correct: true, hintsUsed: 0 });
    expect(state.streak).toBe(1);

    const bad = judgePermit(valid, { flagged: [], decision: 'reject' });
    state = recordPermit(state, { permit: valid, judgement: bad, hintsUsed: 0, elapsedMs: 1000 }, false);
    expect(state.layersLeft).toBe(2);
    expect(state.streak).toBe(0);
    expect(summarizeRound(state).completed).toBe(true);
  });

  it('takes the usual share off for the hint, and still counts the permit as handled', () => {
    const judgement = judgePermit(twoDefects, { flagged: ['gas', 'sign'], decision: 'reject' });
    const state = recordPermit(startRound([twoDefects]), { permit: twoDefects, judgement, hintsUsed: 1, elapsedMs: 0 }, false);
    expect(state.results[0]!.credit).toBeCloseTo(0.85);
    expect(state.results[0]!.correct).toBe(true);
  });

  it('gives a speed bonus only in timed mode', () => {
    const judgement = judgePermit(twoDefects, { flagged: ['gas', 'sign'], decision: 'reject' });
    const input = { permit: twoDefects, judgement, hintsUsed: 0, elapsedMs: 0 };
    const timed = recordPermit(startRound([twoDefects]), input, true);
    const untimed = recordPermit(startRound([twoDefects]), input, false);
    expect(timed.results[0]!.points).toBeGreaterThan(untimed.results[0]!.points);
    expect(PERMIT_TIME_LIMIT_MS).toBeGreaterThan(0);
  });
});

describe('lastSeenFromAttempts', () => {
  it('is shared with the other games: newest play per permit wins', () => {
    const seen = lastSeenFromAttempts([
      { finishedAt: 100, detail: { answers: [{ questionId: 'a' }] } },
      { finishedAt: 300, detail: { answers: [{ questionId: 'a' }] } },
    ]);
    expect(seen.get('a')).toBe(300);
  });
});
