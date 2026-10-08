import type { EmergencyCase, EmergencyGrade, EmergencyStep } from '@/content/schema';
import type { Experience } from '@/domain/experience';
import type { IndustryId } from '@/domain/industries';
import { recordResult, type RoundState } from '@/domain/round';
import { shuffle, type Rng } from '@/lib/rng';
import { selectItems } from '../shared/selectItems';

/* Pure engine of Emergency Response: choosing cases, judging each decision, scoring a whole case. */

export const EMERGENCY_ROUND_LENGTH = 3;
/** Per-decision countdown in timed mode: an emergency asks for a quick call, not a long study. */
export const EMERGENCY_STEP_TIME_LIMIT_MS = 30_000;

/** What a chosen action earns: the best move, a safe but weaker one, or one that makes things worse. */
export const GRADE_CREDIT: Readonly<Record<EmergencyGrade, number>> = { best: 1, acceptable: 0.5, harmful: 0 };
/** A case counts as handled (keeps the streak, keeps the shield) from this average credit upwards, with no harmful choice. */
export const CORRECT_THRESHOLD = 0.7;

export interface EmergencyOptionView {
  /** Stable id: the option's index in the authored step (before shuffling). */
  id: number;
  text: string;
}

export interface PreparedEmergency {
  emergency: EmergencyCase;
  /** Per step, the options in the order shown to the player. */
  options: EmergencyOptionView[][];
}

export function prepareEmergency(emergency: EmergencyCase, rng: Rng): PreparedEmergency {
  return {
    emergency,
    options: emergency.steps.map((step) => shuffle(step.options.map((option, id) => ({ id, text: option.text })), rng)),
  };
}

export interface SelectEmergenciesInput {
  cases: readonly EmergencyCase[];
  /** When each case was last played (ms). Missing = never played. */
  lastSeenAt: ReadonlyMap<string, number>;
  rng: Rng;
  experience: Experience;
  industry: IndustryId;
  count?: number;
}

export function selectEmergencies(input: SelectEmergenciesInput): EmergencyCase[] {
  const { cases, ...rest } = input;
  return selectItems({ ...rest, items: cases, count: input.count ?? EMERGENCY_ROUND_LENGTH });
}

export interface StepJudgement {
  /** Option id (original index) the player chose; null = nothing chosen (the countdown ran out). */
  chosenId: number | null;
  grade: EmergencyGrade | null;
  credit: number;
  /** Option id of the best action. */
  bestId: number;
}

export function bestOptionId(step: EmergencyStep): number {
  return step.options.findIndex((option) => option.grade === 'best');
}

export function judgeStep(step: EmergencyStep, chosenId: number | null): StepJudgement {
  const chosen = chosenId === null ? undefined : step.options[chosenId];
  return {
    chosenId: chosen ? chosenId : null,
    grade: chosen?.grade ?? null,
    credit: chosen ? GRADE_CREDIT[chosen.grade] : 0,
    bestId: bestOptionId(step),
  };
}

export interface CaseJudgement {
  steps: StepJudgement[];
  /** Average credit of the steps, 0..1. */
  credit: number;
  harmfulCount: number;
  bestCount: number;
  correct: boolean;
}

/** Judges a whole case from the option the player chose at each step (a missing entry = not decided). */
export function judgeCase(emergency: EmergencyCase, chosen: ReadonlyArray<number | null>): CaseJudgement {
  const steps = emergency.steps.map((step, index) => judgeStep(step, chosen[index] ?? null));
  const credit = steps.reduce((sum, step) => sum + step.credit, 0) / steps.length;
  const harmfulCount = steps.filter((step) => step.grade === 'harmful').length;
  return {
    steps,
    credit,
    harmfulCount,
    bestCount: steps.filter((step) => step.grade === 'best').length,
    correct: harmfulCount === 0 && credit >= CORRECT_THRESHOLD,
  };
}

/** Records a judged case on the shared round machine. `elapsedMs` is the time spent on all its decisions. */
export function recordEmergency(
  state: RoundState,
  input: { emergency: EmergencyCase; judgement: CaseJudgement; elapsedMs: number },
  timed: boolean,
): RoundState {
  return recordResult(
    state,
    {
      item: input.emergency,
      correct: input.judgement.correct,
      credit: input.judgement.credit,
      hintsUsed: 0,
      elapsedMs: input.elapsedMs,
    },
    timed ? EMERGENCY_STEP_TIME_LIMIT_MS * input.emergency.steps.length : null,
  );
}

export { lastSeenFromAttempts } from '../shared/selectItems';
