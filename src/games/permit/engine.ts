import type { PermitCase } from '@/content/schema';
import type { Experience } from '@/domain/experience';
import type { IndustryId } from '@/domain/industries';
import { recordResult, type RoundState } from '@/domain/round';
import { hintCredit } from '@/domain/scoring';
import type { Rng } from '@/lib/rng';
import { selectItems } from '../shared/selectItems';

/* Pure engine of the Permit to Work Challenge: choosing permits, judging a review, scoring. */

export const PERMIT_ROUND_LENGTH = 5;
/** Per-permit countdown in timed mode: reading a whole form takes longer than answering a question. */
export const PERMIT_TIME_LIMIT_MS = 120_000;
/** One hint per permit: it tells how many defects the form has. */
export const PERMIT_MAX_HINTS = 1;

/** Share of a permit's credit that comes from the approve/reject decision; the rest is the findings. */
export const DECISION_WEIGHT = 0.4;
export const FINDINGS_WEIGHT = 1 - DECISION_WEIGHT;
/**
 * With the wrong decision (or none) only half of the findings count: approving a permit that has
 * defects is the worst mistake an issuer can make, even if the player marked every defect first.
 */
export const WRONG_DECISION_FACTOR = 0.5;
/** Each flagged field that is not a defect takes this share off the findings credit. */
export const FALSE_FLAG_PENALTY = 0.3;
/** A permit counts as handled (keeps the streak, keeps the shield) from this credit upwards. */
export const CORRECT_THRESHOLD = 0.7;

export type PermitDecision = 'approve' | 'reject';

/** What the player did with one permit. `decision` null = nothing decided (the countdown ran out). */
export interface PermitAnswer {
  /** Ids of the fields the player marked as suspicious. */
  flagged: readonly string[];
  decision: PermitDecision | null;
}

export interface DefectOutcome {
  /** Index in the permit's `defects`. */
  index: number;
  critical: boolean;
  found: boolean;
}

export interface PermitJudgement {
  /** The permit has at least one defect, so the right decision is to reject it. */
  shouldReject: boolean;
  decision: PermitDecision | null;
  decisionRight: boolean;
  defects: DefectOutcome[];
  foundCount: number;
  /** A defect that could hurt someone went through: the permit fails whatever else is right. */
  missedCritical: boolean;
  /** Flagged fields that are not part of any defect. */
  falseFlags: string[];
  decisionCredit: number;
  findingsCredit: number;
  credit: number;
  correct: boolean;
}

export function shouldReject(permit: PermitCase): boolean {
  return permit.defects.length > 0;
}

export function judgePermit(permit: PermitCase, answer: PermitAnswer): PermitJudgement {
  const flagged = new Set(answer.flagged);
  const defects: DefectOutcome[] = permit.defects.map((defect, index) => ({
    index,
    critical: defect.critical,
    found: defect.fieldIds.some((id) => flagged.has(id)),
  }));
  const defectFields = new Set(permit.defects.flatMap((defect) => defect.fieldIds));
  const falseFlags = [...flagged].filter((id) => !defectFields.has(id));

  const reject = shouldReject(permit);
  const decisionRight = answer.decision === (reject ? 'reject' : 'approve');
  const foundCount = defects.filter((defect) => defect.found).length;
  const missedCritical = defects.some((defect) => defect.critical && !defect.found);

  const foundShare = defects.length === 0 ? 1 : foundCount / defects.length;
  const decisionCredit = decisionRight ? 1 : 0;
  const findingsCredit = Math.max(0, foundShare - FALSE_FLAG_PENALTY * falseFlags.length);
  const credit = decisionRight
    ? DECISION_WEIGHT + FINDINGS_WEIGHT * findingsCredit
    : FINDINGS_WEIGHT * WRONG_DECISION_FACTOR * findingsCredit;

  return {
    shouldReject: reject,
    decision: answer.decision,
    decisionRight,
    defects,
    foundCount,
    missedCritical,
    falseFlags,
    decisionCredit,
    findingsCredit,
    credit,
    correct: decisionRight && !missedCritical && credit >= CORRECT_THRESHOLD,
  };
}

export interface SelectPermitsInput {
  permits: readonly PermitCase[];
  /** When each permit was last played (ms). Missing = never played. */
  lastSeenAt: ReadonlyMap<string, number>;
  rng: Rng;
  experience: Experience;
  industry: IndustryId;
  count?: number;
}

/**
 * Unseen permits first, ramping from easier to harder — and never a round of rejects only: when
 * the draw has no valid permit but the player's pool has one, the last pick is swapped for it.
 * (A player who learns "always reject" would otherwise score well without reading anything.)
 */
export function selectPermits(input: SelectPermitsInput): PermitCase[] {
  const { permits, ...rest } = input;
  const count = input.count ?? PERMIT_ROUND_LENGTH;
  const picked = selectItems({ ...rest, items: permits, count });
  if (picked.length < 2 || picked.some((permit) => !shouldReject(permit))) return picked;

  const pickedIds = new Set(picked.map((permit) => permit.id));
  const spare = selectItems({
    ...rest,
    items: permits.filter((permit) => !shouldReject(permit) && !pickedIds.has(permit.id)),
    count: 1,
  })[0];
  if (!spare) return picked;
  return [...picked.slice(0, -1), spare].sort((a, b) => a.difficulty - b.difficulty);
}

/** Records a judged permit on the shared round machine; the hint (if used) takes its usual share off. */
export function recordPermit(
  state: RoundState,
  input: { permit: PermitCase; judgement: PermitJudgement; hintsUsed: number; elapsedMs: number },
  timed: boolean,
): RoundState {
  return recordResult(
    state,
    {
      item: input.permit,
      correct: input.judgement.correct,
      credit: input.judgement.credit * hintCredit(input.hintsUsed),
      hintsUsed: input.hintsUsed,
      elapsedMs: input.elapsedMs,
    },
    timed ? PERMIT_TIME_LIMIT_MS : null,
  );
}

export { lastSeenFromAttempts } from '../shared/selectItems';
