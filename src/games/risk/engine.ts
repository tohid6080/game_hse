import type { RiskScenario } from '@/content/schema';
import { EXPERIENCE_MAX_DIFFICULTY, type Experience } from '@/domain/experience';
import { appliesToIndustry, type IndustryId } from '@/domain/industries';
import {
  bestControlIndex,
  judgeScenario,
  riskBand,
  riskScore,
  type ControlLevel,
  type RiskBand,
  type RiskRating,
  type ScenarioJudgement,
} from '@/domain/risk';
import { recordResult, type RoundState } from '@/domain/round';
import { shuffle, type Rng } from '@/lib/rng';

/* Pure engine of the Risk Assessment Challenge: choosing scenarios, judging answers, scoring. */

export const RISK_ROUND_LENGTH = 6;
/** Per-scenario countdown in timed mode (rating + control need more thought than a quiz answer). */
export const RISK_TIME_LIMIT_MS = 60_000;

export interface ControlOption {
  /** Stable id: the option's index in the authored scenario (before shuffling). */
  id: number;
  text: string;
  level: ControlLevel;
}

export interface PreparedScenario {
  scenario: RiskScenario;
  options: ControlOption[];
}

export function prepareScenario(scenario: RiskScenario, rng: Rng): PreparedScenario {
  const options = scenario.controls.map((control, id) => ({ id, text: control.text, level: control.level }));
  return { scenario, options: shuffle(options, rng) };
}

export interface SelectScenariosInput {
  scenarios: readonly RiskScenario[];
  /** When each scenario was last played (ms). Missing = never played. */
  lastSeenAt: ReadonlyMap<string, number>;
  rng: Rng;
  experience: Experience;
  industry: IndustryId;
  count?: number;
}

/** Unseen scenarios first, then the longest-ago played; beginners meet the hardest ones last. */
export function selectScenarios(input: SelectScenariosInput): RiskScenario[] {
  const { scenarios, lastSeenAt, rng, experience, industry } = input;
  const count = input.count ?? RISK_ROUND_LENGTH;
  const maxDifficulty = EXPERIENCE_MAX_DIFFICULTY[experience];
  const pool = scenarios.filter((scenario) => appliesToIndustry(scenario.industries, industry));

  const byFreshness = (group: RiskScenario[]): RiskScenario[] => {
    const shuffled = shuffle(group, rng);
    const unseen = shuffled.filter((scenario) => !lastSeenAt.has(scenario.id));
    const seen = shuffled
      .filter((scenario) => lastSeenAt.has(scenario.id))
      .sort((a, b) => lastSeenAt.get(a.id)! - lastSeenAt.get(b.id)!);
    return [...unseen, ...seen];
  };

  const ordered = [
    ...byFreshness(pool.filter((scenario) => scenario.difficulty <= maxDifficulty)),
    ...byFreshness(pool.filter((scenario) => scenario.difficulty > maxDifficulty)),
  ];
  // Mix what the round needs, then ramp from easier to harder.
  return shuffle(ordered.slice(0, count), rng).sort((a, b) => a.difficulty - b.difficulty);
}

/** A player's answer; `null` parts mean "nothing chosen" (e.g. the countdown ran out). */
export interface RiskAnswer {
  rating: RiskRating | null;
  /** Option id (original index) of the chosen control. */
  controlId: number | null;
}

export interface ScenarioJudgementDetail extends ScenarioJudgement {
  expert: RiskRating;
  expertBand: RiskBand;
  expertScore: number;
  given: RiskRating | null;
  givenBand: RiskBand | null;
  givenScore: number | null;
  /** Option id of the most effective control on offer. */
  bestControlId: number;
}

export function judgeAnswer(scenario: RiskScenario, answer: RiskAnswer): ScenarioJudgementDetail {
  const expert: RiskRating = { likelihood: scenario.likelihood, severity: scenario.severity };
  const levels = scenario.controls.map((control) => control.level);
  const judgement = judgeScenario(answer.rating, expert, levels, answer.controlId);
  const expertScore = riskScore(expert.likelihood, expert.severity);
  const givenScore = answer.rating ? riskScore(answer.rating.likelihood, answer.rating.severity) : null;


  return {
    ...judgement,
    expert,
    expertScore,
    expertBand: riskBand(expertScore),
    given: answer.rating,
    givenScore,
    givenBand: givenScore === null ? null : riskBand(givenScore),
    bestControlId: bestControlIndex(levels),
  };
}

/** Records a judged scenario on the shared round machine. */
export function recordScenario(
  state: RoundState,
  input: { scenario: RiskScenario; judgement: ScenarioJudgement; elapsedMs: number },
  timed: boolean,
): RoundState {
  return recordResult(
    state,
    {
      item: input.scenario,
      correct: input.judgement.correct,
      credit: input.judgement.credit,
      hintsUsed: 0,
      elapsedMs: input.elapsedMs,
    },
    timed ? RISK_TIME_LIMIT_MS : null,
  );
}

/** When each scenario was last played, from a profile's stored risk attempts (newest wins). */
export function lastSeenFromAttempts(
  attempts: ReadonlyArray<{ finishedAt: number; detail?: { answers: ReadonlyArray<{ questionId: string }> } }>,
): Map<string, number> {
  const seen = new Map<string, number>();
  for (const attempt of attempts) {
    for (const answer of attempt.detail?.answers ?? []) {
      seen.set(answer.questionId, Math.max(seen.get(answer.questionId) ?? 0, attempt.finishedAt));
    }
  }
  return seen;
}
