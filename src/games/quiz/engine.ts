import type {
  MatchingQuestion,
  OrderingQuestion,
  QuizQuestion,
  SingleChoiceQuestion,
  TrueFalseQuestion,
} from '@/content/schema';
import { isDue, nextLeitner, type LeitnerState } from '@/domain/leitner';
import { EXPERIENCE_MAX_DIFFICULTY, type Experience } from '@/domain/experience';
import { appliesToIndustry, type IndustryId } from '@/domain/industries';
import { recordResult, TIME_LIMIT_MS, type ItemResult as QuestionResult, type RoundState } from '@/domain/round';
import { HSE_TOPICS, type HseTopic } from '@/domain/topics';
import type { QuestionStatRow } from '@/storage/db';
import { shuffle, type Rng } from '@/lib/rng';

/* The quiz engine is pure: no React, no storage. The UI feeds it answers; it returns state. */

export const ROUND_LENGTH = 10;

/* ── Preparing a question for display ─────────────────────────────────────────────────────── */

export interface Option {
  /** Stable id: the option's index in the authored question (before shuffling). */
  id: number;
  text: string;
}

export type PreparedQuestion =
  | { type: 'single-choice'; question: SingleChoiceQuestion; options: Option[] }
  | { type: 'true-false'; question: TrueFalseQuestion }
  | { type: 'matching'; question: MatchingQuestion; rightOptions: Option[] }
  | { type: 'ordering'; question: OrderingQuestion; options: Option[] };

export type QuizAnswer =
  | { type: 'single-choice'; optionId: number }
  | { type: 'true-false'; value: boolean }
  /** assignment[leftIndex] = id of the right-hand option chosen for it. */
  | { type: 'matching'; assignment: number[] }
  /** Option ids in the order the player put them. */
  | { type: 'ordering'; order: number[] };

function toOptions(texts: readonly string[]): Option[] {
  return texts.map((text, id) => ({ id, text }));
}

/** Shuffles, but never hands back the solved arrangement (which would make a question trivial). */
function shuffleUnsolved(options: Option[], rng: Rng): Option[] {
  if (options.length < 2) return options;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = shuffle(options, rng);
    if (result.some((option, index) => option.id !== index)) return result;
  }
  return [...options].reverse();
}

export function prepareQuestion(question: QuizQuestion, rng: Rng): PreparedQuestion {
  switch (question.type) {
    case 'single-choice':
      return { type: 'single-choice', question, options: shuffle(toOptions(question.choices), rng) };
    case 'true-false':
      return { type: 'true-false', question };
    case 'matching':
      return {
        type: 'matching',
        question,
        rightOptions: shuffleUnsolved(
          toOptions(question.pairs.map((pair) => pair.right)),
          rng,
        ),
      };
    case 'ordering':
      return { type: 'ordering', question, options: shuffleUnsolved(toOptions(question.items), rng) };
  }
}

export function isCorrect(prepared: PreparedQuestion, answer: QuizAnswer): boolean {
  if (prepared.type !== answer.type) return false;
  switch (prepared.type) {
    case 'single-choice':
      return (
        answer.type === 'single-choice' && answer.optionId === prepared.question.correctIndex
      );
    case 'true-false':
      return answer.type === 'true-false' && answer.value === prepared.question.answer;
    case 'matching':
      return (
        answer.type === 'matching' &&
        answer.assignment.length === prepared.question.pairs.length &&
        answer.assignment.every((rightId, leftIndex) => rightId === leftIndex)
      );
    case 'ordering':
      return (
        answer.type === 'ordering' &&
        answer.order.length === prepared.question.items.length &&
        answer.order.every((id, position) => id === position)
      );
  }
}

/** The 50/50 hint only makes sense when there are wrong options to take away. */
export function canUseHint(prepared: PreparedQuestion): boolean {
  return prepared.type === 'single-choice' && prepared.options.length >= 3;
}

/** Ids of wrong options to hide: two of them, but always leaving the answer plus one distractor. */
export function hintEliminations(prepared: PreparedQuestion, rng: Rng): number[] {
  if (prepared.type !== 'single-choice') return [];
  const wrong = prepared.options
    .filter((option) => option.id !== prepared.question.correctIndex)
    .map((option) => option.id);
  const removable = Math.min(2, wrong.length - 1);
  return shuffle(wrong, rng).slice(0, Math.max(0, removable));
}

/* ── Choosing the questions of a round ────────────────────────────────────────────────────── */

export type QuizMode = { kind: 'topic'; topic: HseTopic } | { kind: 'mixed' } | { kind: 'weak' };

export function contentIdForMode(mode: QuizMode): string {
  return mode.kind === 'topic' ? `quiz.topic.${mode.topic}` : `quiz.${mode.kind}`;
}

/** Practice on weak spots is review, not progress — it never pays the first-time bonus. */
export function isFirstTimeEligible(mode: QuizMode): boolean {
  return mode.kind !== 'weak';
}

export function modeToSearch(mode: QuizMode): string {
  return mode.kind === 'topic' ? `mode=topic&topic=${mode.topic}` : `mode=${mode.kind}`;
}

export function parseMode(params: URLSearchParams): QuizMode | null {
  const kind = params.get('mode');
  if (kind === 'mixed' || kind === 'weak') return { kind };
  if (kind === 'topic') {
    const topic = HSE_TOPICS.find((candidate) => candidate === params.get('topic'));
    return topic ? { kind: 'topic', topic } : null;
  }
  return null;
}

export interface SelectInput {
  questions: readonly QuizQuestion[];
  mode: QuizMode;
  stats: ReadonlyMap<string, LeitnerState>;
  now: number;
  rng: Rng;
  experience: Experience;
  industry: IndustryId;
  count?: number;
}

export function questionsForIndustry(questions: readonly QuizQuestion[], industry: IndustryId): QuizQuestion[] {
  return questions.filter((question) => appliesToIndustry(question.industries, industry));
}

/** Questions the player has met before and that are due for review. */
export function dueQuestions(
  questions: readonly QuizQuestion[],
  stats: ReadonlyMap<string, LeitnerState>,
  now: number,
  industry: IndustryId,
): QuizQuestion[] {
  return questions.filter((question) => {
    const state = stats.get(question.id);
    return state !== undefined && isDue(state, now) && appliesToIndustry(question.industries, industry);
  });
}

export function selectQuestions(input: SelectInput): QuizQuestion[] {
  const { questions, mode, stats, now, rng, experience, industry } = input;
  const count = input.count ?? ROUND_LENGTH;

  let ordered: QuizQuestion[];
  if (mode.kind === 'weak') {
    // Lowest box first (weakest), then the longest overdue.
    ordered = shuffle(dueQuestions(questions, stats, now, industry), rng).sort((a, b) => {
      const sa = stats.get(a.id)!;
      const sb = stats.get(b.id)!;
      return sa.box - sb.box || sa.dueAt - sb.dueAt;
    });
  } else {
    const pool = questions.filter(
      (question) =>
        appliesToIndustry(question.industries, industry) && (mode.kind === 'mixed' || question.topic === mode.topic),
    );
    const maxDifficulty = EXPERIENCE_MAX_DIFFICULTY[experience];
    const byFreshness = (group: QuizQuestion[]): QuizQuestion[] => {
      const shuffled = shuffle(group, rng);
      const unseen = shuffled.filter((question) => !stats.has(question.id));
      const seen = shuffled
        .filter((question) => stats.has(question.id))
        .sort((a, b) => stats.get(a.id)!.dueAt - stats.get(b.id)!.dueAt);
      return [...unseen, ...seen];
    };
    ordered = [
      ...byFreshness(pool.filter((question) => question.difficulty <= maxDifficulty)),
      ...byFreshness(pool.filter((question) => question.difficulty > maxDifficulty)),
    ];
  }

  // Take what the round needs, mix it, then ramp from easier to harder.
  const picked = shuffle(ordered.slice(0, count), rng);
  return picked.sort((a, b) => a.difficulty - b.difficulty);
}

/* ── Round state machine (shared with the other games: see domain/round.ts) ───────────────── */

export {
  SHIELD_LAYERS,
  TIME_LIMIT_MS,
  startRound,
  summarizeRound,
  type RoundState,
  type RoundStatus,
  type RoundSummary,
  type ItemResult as QuestionResult,
} from '@/domain/round';

export interface AnswerInput {
  question: QuizQuestion;
  correct: boolean;
  hintsUsed: number;
  elapsedMs: number;
}

export function recordAnswer(state: RoundState, input: AnswerInput, timed: boolean): RoundState {
  return recordResult(
    state,
    { item: input.question, correct: input.correct, hintsUsed: input.hintsUsed, elapsedMs: input.elapsedMs },
    timed ? TIME_LIMIT_MS : null,
  );
}

/** Applies the Leitner reducer to every answered question; returns the rows to persist. */
export function buildStatUpdates(
  profileId: string,
  results: readonly QuestionResult[],
  previous: ReadonlyMap<string, LeitnerState>,
  now: number,
): QuestionStatRow[] {
  return results.map((result) => ({
    profileId,
    questionId: result.questionId,
    topic: result.topic,
    ...nextLeitner(previous.get(result.questionId), {
      correct: result.correct,
      assisted: result.hintsUsed > 0,
    }, now),
  }));
}
