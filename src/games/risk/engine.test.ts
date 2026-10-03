import { describe, expect, it } from 'vitest';
import riskFa from '@/content/packs/fa/risk.json';
import { RiskPackSchema, type RiskScenario } from '@/content/schema';
import { startRound, summarizeRound } from '@/domain/round';
import { createRng } from '@/lib/rng';
import {
  RISK_ROUND_LENGTH,
  RISK_TIME_LIMIT_MS,
  judgeAnswer,
  lastSeenFromAttempts,
  prepareScenario,
  recordScenario,
  selectScenarios,
} from './engine';

const bank: RiskScenario[] = RiskPackSchema.parse(riskFa).scenarios;
const noneSeen = new Map<string, number>();
const base = { scenarios: bank, lastSeenAt: noneSeen, experience: 'intermediate' as const, industry: 'general' as const };

describe('prepareScenario', () => {
  it('shuffles the controls but keeps ids and levels attached to their text', () => {
    const scenario = bank[0]!;
    const prepared = prepareScenario(scenario, createRng(5));
    expect(prepared.options.map((o) => o.id).sort()).toEqual(scenario.controls.map((_, i) => i));
    for (const option of prepared.options) {
      expect(scenario.controls[option.id]).toEqual({ text: option.text, level: option.level });
    }
  });

  it('prepares every scenario in the real pack', () => {
    for (const scenario of bank) expect(prepareScenario(scenario, createRng(3)).options).toHaveLength(scenario.controls.length);
  });
});

describe('selectScenarios', () => {
  it('is deterministic for a seed and returns a full round of distinct scenarios', () => {
    const a = selectScenarios({ ...base, rng: createRng(8) });
    const b = selectScenarios({ ...base, rng: createRng(8) });
    expect(a.map((s) => s.id)).toEqual(b.map((s) => s.id));
    expect(a).toHaveLength(RISK_ROUND_LENGTH);
    expect(new Set(a.map((s) => s.id)).size).toBe(RISK_ROUND_LENGTH);
  });

  it('ramps from easier to harder', () => {
    const round = selectScenarios({ ...base, rng: createRng(2) });
    const difficulties = round.map((s) => s.difficulty);
    expect(difficulties).toEqual([...difficulties].sort((x, y) => x - y));
  });

  it('prefers scenarios the player has not seen, then the longest ago', () => {
    const lastSeenAt = new Map(bank.slice(0, bank.length - 3).map((s, i) => [s.id, 1000 + i] as const));
    const round = selectScenarios({ ...base, lastSeenAt, rng: createRng(4), count: 3 });
    const unseenIds = new Set(bank.slice(bank.length - 3).map((s) => s.id));
    expect(round.every((s) => unseenIds.has(s.id))).toBe(true);

    const allSeen = new Map(bank.map((s, i) => [s.id, 1000 + i] as const));
    const oldest = selectScenarios({ ...base, lastSeenAt: allSeen, experience: 'expert', rng: createRng(4), count: 3 });
    const expectedOldest = new Set(bank.slice(0, 3).map((s) => s.id));
    // Beginners/others are capped by difficulty only for 'beginner'; expert takes the oldest three.
    expect(oldest.every((s) => expectedOldest.has(s.id))).toBe(true);
  });

  it('keeps the hardest scenarios out of a beginner round when enough easier ones exist', () => {
    const round = selectScenarios({ ...base, experience: 'beginner', rng: createRng(6) });
    expect(round.every((s) => s.difficulty <= 2)).toBe(true);
  });

  it('respects the player industry', () => {
    const energyOnly: RiskScenario = { ...bank[0]!, id: 'risk.test.energy', industries: ['energy'] };
    const pool = [energyOnly];
    expect(selectScenarios({ ...base, scenarios: pool, industry: 'energy', rng: createRng(1) })).toHaveLength(1);
    expect(selectScenarios({ ...base, scenarios: pool, industry: 'construction', rng: createRng(1) })).toHaveLength(0);
    expect(selectScenarios({ ...base, scenarios: pool, industry: 'general', rng: createRng(1) })).toHaveLength(1);
  });

  it('shrinks to what exists', () => {
    expect(selectScenarios({ ...base, scenarios: bank.slice(0, 2), rng: createRng(1) })).toHaveLength(2);
  });
});

describe('judgeAnswer', () => {
  const scenario = bank[0]!; // scaffold: L4 S4, best control = elimination
  const exact = { likelihood: scenario.likelihood, severity: scenario.severity };
  const bestId = scenario.controls.findIndex((c) => c.level === 'elimination');
  const worstId = scenario.controls.findIndex((c) => c.level === 'ppe');

  it('gives full credit for the expert rating and the best control', () => {
    const judged = judgeAnswer(scenario, { rating: exact, controlId: bestId });
    expect(judged).toMatchObject({ credit: 1, correct: true, bestControlId: bestId, expertScore: 16, expertBand: 'high', givenScore: 16 });
  });

  it('judges by original control index, regardless of how options were shuffled', () => {
    const prepared = prepareScenario(scenario, createRng(11));
    const bestOption = prepared.options.find((o) => o.level === 'elimination')!;
    expect(judgeAnswer(scenario, { rating: exact, controlId: bestOption.id }).controlCredit).toBe(1);
  });

  it('reports partial credit for a near rating and a weaker control', () => {
    const near = { likelihood: 3 as const, severity: 4 as const };
    const judged = judgeAnswer(scenario, { rating: near, controlId: worstId });
    expect(judged.ratingCredit).toBe(0.6);
    expect(judged.controlCredit).toBe(0);
    expect(judged.credit).toBeCloseTo(0.36);
    expect(judged.correct).toBe(false);
  });

  it('handles a timeout: no rating and no control', () => {
    const judged = judgeAnswer(scenario, { rating: null, controlId: null });
    expect(judged).toMatchObject({ credit: 0, correct: false, given: null, givenScore: null, givenBand: null });
  });
});

describe('risk round on the shared machine', () => {
  it('earns partial points, keeps the streak on a "handled" scenario, and breaks the shield on misses', () => {
    const scenarios = bank.slice(0, 4);
    let state = startRound(scenarios);
    const good = judgeAnswer(scenarios[0]!, { rating: { likelihood: 4, severity: 4 }, controlId: 0 });
    state = recordScenario(state, { scenario: scenarios[0]!, judgement: good, elapsedMs: 1000 }, false);
    expect(state.results[0]!.credit).toBe(1);
    expect(state.streak).toBe(1);

    const bad = judgeAnswer(scenarios[1]!, { rating: null, controlId: null });
    state = recordScenario(state, { scenario: scenarios[1]!, judgement: bad, elapsedMs: 1000 }, false);
    expect(state.layersLeft).toBe(2);
    expect(state.streak).toBe(0);
    expect(summarizeRound(state).completed).toBe(false);
  });

  it('gives a speed bonus only in timed mode', () => {
    const scenario = bank[0]!;
    const judgement = judgeAnswer(scenario, { rating: { likelihood: 4, severity: 4 }, controlId: 0 });
    const timed = recordScenario(startRound([scenario]), { scenario, judgement, elapsedMs: 0 }, true);
    const untimed = recordScenario(startRound([scenario]), { scenario, judgement, elapsedMs: 0 }, false);
    expect(timed.results[0]!.points).toBeGreaterThan(untimed.results[0]!.points);
    expect(RISK_TIME_LIMIT_MS).toBeGreaterThan(0);
  });
});

describe('lastSeenFromAttempts', () => {
  it('keeps the most recent time per scenario across attempts', () => {
    const seen = lastSeenFromAttempts([
      { finishedAt: 100, detail: { answers: [{ questionId: 'a' }, { questionId: 'b' }] } },
      { finishedAt: 300, detail: { answers: [{ questionId: 'a' }] } },
      { finishedAt: 200 },
    ]);
    expect(seen.get('a')).toBe(300);
    expect(seen.get('b')).toBe(100);
    expect(seen.size).toBe(2);
  });
});
