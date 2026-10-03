import { describe, expect, it } from 'vitest';
import {
  BAND_RANGE,
  RATINGS,
  RISK_BANDS,
  bestControlIndex,
  controlCredit,
  controlRank,
  judgeScenario,
  ratingCredit,
  ratingDistance,
  riskBand,
  riskScore,
  type ControlLevel,
} from './risk';

describe('risk matrix', () => {
  it('multiplies likelihood and severity', () => {
    expect(riskScore(1, 1)).toBe(1);
    expect(riskScore(3, 4)).toBe(12);
    expect(riskScore(5, 5)).toBe(25);
  });

  it('bands every possible score exactly as the legend says', () => {
    for (const band of RISK_BANDS) {
      const [low, high] = BAND_RANGE[band];
      expect(riskBand(low)).toBe(band);
      expect(riskBand(high)).toBe(band);
    }
    expect(riskBand(5)).toBe('veryLow');
    expect(riskBand(6)).toBe('low');
    expect(riskBand(15)).toBe('medium');
    expect(riskBand(16)).toBe('high');
    expect(riskBand(21)).toBe('veryHigh');
  });

  it('has contiguous bands covering 1..25 and every product of two ratings lands in one', () => {
    for (const l of RATINGS) for (const s of RATINGS) expect(RISK_BANDS).toContain(riskBand(riskScore(l, s)));
    let expected = 1;
    for (const band of RISK_BANDS) {
      expect(BAND_RANGE[band][0]).toBe(expected);
      expected = BAND_RANGE[band][1] + 1;
    }
    expect(expected).toBe(26);
  });
});

describe('rating credit', () => {
  const expert = { likelihood: 3, severity: 4 } as const;

  it('is full for the exact cell and falls with distance in matrix steps', () => {
    expect(ratingDistance(expert, expert)).toBe(0);
    expect(ratingCredit(expert, expert)).toBe(1);
    expect(ratingCredit({ likelihood: 4, severity: 4 }, expert)).toBe(0.6);
    expect(ratingCredit({ likelihood: 3, severity: 3 }, expert)).toBe(0.6);
    expect(ratingCredit({ likelihood: 4, severity: 5 }, expert)).toBe(0.25);
    expect(ratingCredit({ likelihood: 1, severity: 4 }, expert)).toBe(0.25);
    expect(ratingCredit({ likelihood: 1, severity: 1 }, expert)).toBe(0);
  });
});

describe('control credit', () => {
  const levels: ControlLevel[] = ['administrative', 'elimination', 'ppe', 'engineering'];

  it('ranks the hierarchy from elimination down to PPE', () => {
    expect(controlRank('elimination')).toBeLessThan(controlRank('substitution'));
    expect(controlRank('substitution')).toBeLessThan(controlRank('engineering'));
    expect(controlRank('engineering')).toBeLessThan(controlRank('administrative'));
    expect(controlRank('administrative')).toBeLessThan(controlRank('ppe'));
  });

  it('finds the best option on offer, whatever its position', () => {
    expect(bestControlIndex(levels)).toBe(1);
    expect(bestControlIndex(['ppe', 'administrative'])).toBe(1);
  });

  it('gives the best option 1, the runner-up 0.5, the rest 0', () => {
    expect(controlCredit(levels, 1)).toBe(1); // elimination
    expect(controlCredit(levels, 3)).toBe(0.5); // engineering
    expect(controlCredit(levels, 0)).toBe(0); // administrative
    expect(controlCredit(levels, 2)).toBe(0); // ppe
  });

  it('judges relative to what is offered: with no elimination, engineering is the best', () => {
    const offered: ControlLevel[] = ['ppe', 'engineering', 'administrative'];
    expect(controlCredit(offered, 1)).toBe(1);
    expect(controlCredit(offered, 2)).toBe(0.5);
    expect(controlCredit(offered, 0)).toBe(0);
  });

  it('is zero for an out-of-range choice', () => {
    expect(controlCredit(levels, 9)).toBe(0);
    expect(controlCredit(levels, -1)).toBe(0);
  });
});

describe('scenario judgement', () => {
  const expert = { likelihood: 3, severity: 4 } as const;
  const levels: ControlLevel[] = ['elimination', 'engineering', 'administrative', 'ppe'];

  it('a perfect answer earns full credit', () => {
    expect(judgeScenario(expert, expert, levels, 0)).toMatchObject({ credit: 1, correct: true });
  });

  it('weights the rating 60% and the control 40%', () => {
    expect(judgeScenario(expert, expert, levels, 3).credit).toBeCloseTo(0.6); // exact rating, worst control
    expect(judgeScenario({ likelihood: 1, severity: 1 }, expert, levels, 0).credit).toBeCloseTo(0.4); // wrong rating, best control
  });

  it('counts "close rating + decent control" as handled but "far rating + bad control" as not', () => {
    expect(judgeScenario({ likelihood: 4, severity: 4 }, expert, levels, 1).correct).toBe(true); // 0.36 + 0.2
    expect(judgeScenario({ likelihood: 5, severity: 5 }, expert, levels, 3).correct).toBe(false); // 0.15 + 0
    expect(judgeScenario({ likelihood: 1, severity: 1 }, expert, levels, 0).correct).toBe(false); // 0.4 alone is not enough
  });

  it('treats a missing rating as zero rating credit', () => {
    expect(judgeScenario(null, expert, levels, 0)).toMatchObject({ ratingCredit: 0, controlCredit: 1, credit: 0.4, correct: false });
    expect(judgeScenario(null, expert, levels, null).credit).toBe(0);
  });

  it('treats a missing control choice as zero control credit', () => {
    expect(judgeScenario(expert, expert, levels, null)).toMatchObject({ controlCredit: 0, credit: 0.6, correct: true });
  });
});
