/**
 * Leitner spaced repetition for quiz questions.
 * Wrong → back to box 1 (due again right away); correct → one box up, due after the box's interval.
 * An *assisted* correct answer (hint used) is kept in its box instead of being promoted.
 *
 * `questionStats` rows are a cache of this reducer applied to the attempt log's answers, so they
 * can be rebuilt from `attempts` if the rules change.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

export type Box = 1 | 2 | 3 | 4 | 5;

/** Days until review, per box (index = box - 1). */
export const BOX_INTERVAL_DAYS: Record<Box, number> = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 14 };

export interface LeitnerState {
  box: Box;
  dueAt: number;
  seen: number;
  correct: number;
  wrong: number;
  lastAnsweredAt: number;
}

function promote(box: Box): Box {
  return Math.min(5, box + 1) as Box;
}

export function nextLeitner(
  previous: LeitnerState | undefined,
  outcome: { correct: boolean; assisted: boolean },
  now: number,
): LeitnerState {
  const prev: LeitnerState = previous ?? {
    box: 1,
    dueAt: now,
    seen: 0,
    correct: 0,
    wrong: 0,
    lastAnsweredAt: now,
  };

  let box: Box;
  if (!outcome.correct) box = 1;
  else if (outcome.assisted) box = previous ? prev.box : 1;
  else box = promote(prev.box);

  return {
    box,
    dueAt: now + BOX_INTERVAL_DAYS[box] * DAY_MS,
    seen: prev.seen + 1,
    correct: prev.correct + (outcome.correct ? 1 : 0),
    wrong: prev.wrong + (outcome.correct ? 0 : 1),
    lastAnsweredAt: now,
  };
}

export function isDue(state: Pick<LeitnerState, 'dueAt'>, now: number): boolean {
  return state.dueAt <= now;
}
