import { describe, expect, it } from 'vitest';
import type { EmergencyCase, EmergencyStep } from '@/content/schema';
import { startRound, summarizeRound } from '@/domain/round';
import { createRng } from '@/lib/rng';
import {
  CORRECT_THRESHOLD,
  EMERGENCY_ROUND_LENGTH,
  EMERGENCY_STEP_TIME_LIMIT_MS,
  GRADE_CREDIT,
  bestOptionId,
  judgeCase,
  judgeStep,
  lastSeenFromAttempts,
  prepareEmergency,
  recordEmergency,
  selectEmergencies,
} from './engine';

/** Options are written best / acceptable / harmful so the authored index tells the grade. */
function step(label: string): EmergencyStep {
  return {
    situation: `situation ${label}`,
    options: [
      { text: `${label}: best`, grade: 'best', consequence: 'c' },
      { text: `${label}: acceptable`, grade: 'acceptable', consequence: 'c' },
      { text: `${label}: harmful`, grade: 'harmful', consequence: 'c' },
    ],
    why: 'why',
  };
}

function emergency(id: string, overrides: Partial<EmergencyCase> = {}): EmergencyCase {
  return {
    id,
    reviewStatus: 'draft',
    difficulty: 2,
    topic: 'emergency',
    industries: ['general'],
    title: id,
    prompt: 'prompt',
    emergencyType: 'fire',
    steps: [step('a'), step('b'), step('c'), step('d')],
    explanation: 'explanation',
    references: [],
    ...overrides,
  };
}

const BEST = 0;
const OK = 1;
const BAD = 2;
const sample = emergency('emergency.fire.sample');

describe('judging one decision', () => {
  it('maps the grade of the chosen option to its credit', () => {
    expect(judgeStep(sample.steps[0]!, BEST)).toMatchObject({ grade: 'best', credit: GRADE_CREDIT.best, bestId: 0 });
    expect(judgeStep(sample.steps[0]!, OK)).toMatchObject({ grade: 'acceptable', credit: 0.5 });
    expect(judgeStep(sample.steps[0]!, BAD)).toMatchObject({ grade: 'harmful', credit: 0 });
  });

  it('finds the best option wherever the author put it', () => {
    const moved: EmergencyStep = { ...step('x'), options: [...step('x').options].reverse() };
    expect(bestOptionId(moved)).toBe(2);
    expect(judgeStep(moved, 2).grade).toBe('best');
  });

  it('treats no choice (the countdown ran out) and an unknown id as nothing decided', () => {
    expect(judgeStep(sample.steps[0]!, null)).toMatchObject({ chosenId: null, grade: null, credit: 0 });
    expect(judgeStep(sample.steps[0]!, 9)).toMatchObject({ chosenId: null, grade: null, credit: 0 });
  });
});

describe('judging a whole case', () => {
  it('gives full credit for the best action at every step', () => {
    expect(judgeCase(sample, [BEST, BEST, BEST, BEST])).toMatchObject({ credit: 1, harmfulCount: 0, bestCount: 4, correct: true });
  });

  it('averages the steps and still counts a mostly good case as handled', () => {
    const judged = judgeCase(sample, [BEST, BEST, BEST, OK]);
    expect(judged.credit).toBeCloseTo(0.875);
    expect(judged.correct).toBe(true);
  });

  it('fails a case that contains a harmful choice, even with a high average', () => {
    const judged = judgeCase(sample, [BEST, BEST, BEST, BAD]);
    expect(judged.credit).toBeCloseTo(0.75);
    expect(judged.credit).toBeGreaterThanOrEqual(CORRECT_THRESHOLD);
    expect(judged.harmfulCount).toBe(1);
    expect(judged.correct).toBe(false);
  });

  it('fails a case that was safe but never better than acceptable', () => {
    const judged = judgeCase(sample, [OK, OK, OK, OK]);
    expect(judged.credit).toBe(0.5);
    expect(judged.correct).toBe(false);
  });

  it('counts steps nobody decided as zero', () => {
    const judged = judgeCase(sample, [BEST, BEST]);
    expect(judged.steps).toHaveLength(4);
    expect(judged.credit).toBe(0.5);
    expect(judged.correct).toBe(false);
  });
});

describe('preparing a case', () => {
  it('shuffles each step\'s options but keeps their original ids', () => {
    const prepared = prepareEmergency(sample, createRng(3));
    expect(prepared.options).toHaveLength(sample.steps.length);
    prepared.options.forEach((options, index) => {
      expect([...options].map((option) => option.id).sort()).toEqual([0, 1, 2]);
      for (const option of options) expect(option.text).toBe(sample.steps[index]!.options[option.id]!.text);
    });
  });

  it('judges by original id, whatever the shuffled position', () => {
    const prepared = prepareEmergency(sample, createRng(11));
    const bestShown = prepared.options[0]!.find((option) => option.text.endsWith('best'))!;
    expect(judgeStep(sample.steps[0]!, bestShown.id).grade).toBe('best');
  });
});

describe('choosing the cases of a round', () => {
  const bank = Array.from({ length: 8 }, (_, i) => emergency(`emergency.fire.c${i}`, { difficulty: ((i % 3) + 1) as 1 | 2 | 3 }));
  const base = { cases: bank, lastSeenAt: new Map<string, number>(), experience: 'expert' as const, industry: 'general' as const };

  it('picks a round of distinct cases, easiest first', () => {
    const round = selectEmergencies({ ...base, rng: createRng(5) });
    expect(round).toHaveLength(EMERGENCY_ROUND_LENGTH);
    expect(new Set(round.map((c) => c.id)).size).toBe(EMERGENCY_ROUND_LENGTH);
    expect(round.map((c) => c.difficulty)).toEqual([...round.map((c) => c.difficulty)].sort((a, b) => a - b));
  });

  it('prefers cases the player has not seen', () => {
    const lastSeenAt = new Map(bank.slice(0, 5).map((c, i) => [c.id, 1000 + i]));
    const round = selectEmergencies({ ...base, lastSeenAt, rng: createRng(9) });
    expect(round.every((c) => !lastSeenAt.has(c.id))).toBe(true);
  });

  it('keeps hard cases away from beginners while easier ones are available', () => {
    const round = selectEmergencies({ ...base, experience: 'beginner', rng: createRng(4) });
    expect(round.every((c) => c.difficulty <= 2)).toBe(true);
  });
});

describe('a case on the shared machine', () => {
  it('keeps the streak on a handled case and breaks a layer on a failed one', () => {
    let state = startRound([sample, emergency('emergency.fire.other')]);
    state = recordEmergency(state, { emergency: sample, judgement: judgeCase(sample, [BEST, BEST, BEST, BEST]), elapsedMs: 1000 }, false);
    expect(state.results[0]).toMatchObject({ credit: 1, correct: true });
    expect(state.streak).toBe(1);

    const other = emergency('emergency.fire.other');
    state = recordEmergency(state, { emergency: other, judgement: judgeCase(other, [BAD, BAD, BAD, BAD]), elapsedMs: 1000 }, false);
    expect(state.layersLeft).toBe(2);
    expect(state.streak).toBe(0);
    expect(summarizeRound(state).completed).toBe(true);
  });

  it('gives a speed bonus only in timed mode, against the time all its steps allow', () => {
    const judgement = judgeCase(sample, [BEST, BEST, BEST, BEST]);
    const input = { emergency: sample, judgement, elapsedMs: 0 };
    const timed = recordEmergency(startRound([sample]), input, true);
    const untimed = recordEmergency(startRound([sample]), input, false);
    expect(timed.results[0]!.points).toBeGreaterThan(untimed.results[0]!.points);

    // half of the allowed time left → half of the maximum bonus: slower than instant, faster than the limit
    const half = recordEmergency(startRound([sample]), { ...input, elapsedMs: (EMERGENCY_STEP_TIME_LIMIT_MS * sample.steps.length) / 2 }, true);
    expect(half.results[0]!.points).toBeGreaterThan(untimed.results[0]!.points);
    expect(half.results[0]!.points).toBeLessThan(timed.results[0]!.points);
  });
});

describe('lastSeenFromAttempts', () => {
  it('is shared with the other games', () => {
    expect(lastSeenFromAttempts([{ finishedAt: 5, detail: { answers: [{ questionId: 'x' }] } }]).get('x')).toBe(5);
  });
});
