/**
 * Risk assessment rules shared by the Risk Assessment Challenge and its content schema.
 *
 * Likelihood × severity on a 5×5 matrix, banded as in the product design:
 *   1–5 very low · 6–10 low · 11–15 medium · 16–20 high · 21–25 very high.
 * A scenario is judged on two things: how close the player's rating is to the expert rating, and
 * how high up the hierarchy of controls the chosen control sits.
 */

export type Rating = 1 | 2 | 3 | 4 | 5;
export const RATINGS: readonly Rating[] = [1, 2, 3, 4, 5];

export type RiskBand = 'veryLow' | 'low' | 'medium' | 'high' | 'veryHigh';
export const RISK_BANDS: readonly RiskBand[] = ['veryLow', 'low', 'medium', 'high', 'veryHigh'];

/** Inclusive score range of each band — the legend shows these. */
export const BAND_RANGE: Record<RiskBand, readonly [number, number]> = {
  veryLow: [1, 5],
  low: [6, 10],
  medium: [11, 15],
  high: [16, 20],
  veryHigh: [21, 25],
};

export function riskScore(likelihood: Rating, severity: Rating): number {
  return likelihood * severity;
}

export function riskBand(score: number): RiskBand {
  if (score <= 5) return 'veryLow';
  if (score <= 10) return 'low';
  if (score <= 15) return 'medium';
  if (score <= 20) return 'high';
  return 'veryHigh';
}

export interface RiskRating {
  likelihood: Rating;
  severity: Rating;
}

/** Most effective first. The index is the "rank": lower = better. */
export const CONTROL_LEVELS = ['elimination', 'substitution', 'engineering', 'administrative', 'ppe'] as const;
export type ControlLevel = (typeof CONTROL_LEVELS)[number];

export function controlRank(level: ControlLevel): number {
  return CONTROL_LEVELS.indexOf(level);
}

/** Share of credit for a rating by how far (in matrix steps) it is from the expert's. */
const RATING_CREDIT_BY_DISTANCE = [1, 0.6, 0.25] as const;

export function ratingDistance(given: RiskRating, expert: RiskRating): number {
  return Math.abs(given.likelihood - expert.likelihood) + Math.abs(given.severity - expert.severity);
}

export function ratingCredit(given: RiskRating, expert: RiskRating): number {
  return RATING_CREDIT_BY_DISTANCE[ratingDistance(given, expert)] ?? 0;
}

/**
 * Credit for the chosen control: the best option on offer earns everything, the next best half,
 * anything else nothing. "Best" = highest in the hierarchy; scenarios never offer two controls of
 * the same level, so the ranking is unambiguous.
 */
export function controlCredit(levels: readonly ControlLevel[], chosenIndex: number): number {
  const chosen = levels[chosenIndex];
  if (chosen === undefined) return 0;
  const ranks = [...new Set(levels.map(controlRank))].sort((a, b) => a - b);
  const position = ranks.indexOf(controlRank(chosen));
  return position === 0 ? 1 : position === 1 ? 0.5 : 0;
}

export function bestControlIndex(levels: readonly ControlLevel[]): number {
  let best = 0;
  levels.forEach((level, index) => {
    if (controlRank(level) < controlRank(levels[best]!)) best = index;
  });
  return best;
}

export const RATING_WEIGHT = 0.6;
export const CONTROL_WEIGHT = 0.4;
/** A scenario counts as handled (keeps the streak, spares the shield) from this credit upward. */
export const CORRECT_THRESHOLD = 0.5;

export interface ScenarioJudgement {
  ratingCredit: number;
  controlCredit: number;
  credit: number;
  correct: boolean;
}

/** `null` for `given` / `chosenControl` = nothing chosen (e.g. the countdown ran out): that part earns 0. */
export function judgeScenario(
  given: RiskRating | null,
  expert: RiskRating,
  levels: readonly ControlLevel[],
  chosenControl: number | null,
): ScenarioJudgement {
  const rating = given === null ? 0 : ratingCredit(given, expert);
  const control = chosenControl === null ? 0 : controlCredit(levels, chosenControl);
  const credit = RATING_WEIGHT * rating + CONTROL_WEIGHT * control;
  return { ratingCredit: rating, controlCredit: control, credit, correct: credit >= CORRECT_THRESHOLD };
}
