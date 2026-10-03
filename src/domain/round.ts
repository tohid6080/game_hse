import {
  scoreCredit,
  hintCredit,
  starsForAccuracy,
  weightedCredit,
  type Difficulty,
  type Stars,
} from './scoring';
import type { HseTopic } from './topics';

/**
 * The round state machine shared by every game: a fixed list of items is played in order, each
 * result earns points and credit, wrong results break a layer of the shield, and the round ends
 * when the items run out or the shield is gone. Games differ only in what an "item" is.
 */

export const SHIELD_LAYERS = 3;
export const TIME_LIMIT_MS = 30_000;

/** What the machine needs to know about an item (a quiz question, a risk scenario, …). */
export interface RoundItem {
  id: string;
  topic: HseTopic;
  difficulty: Difficulty;
}

export interface ItemResult {
  /** Id of the played item (kept under this name because stored answers use it). */
  questionId: string;
  topic: HseTopic;
  difficulty: Difficulty;
  /** Counts as a success: keeps the streak, does not break a shield layer. */
  correct: boolean;
  /** 0..1 earned, after the hint penalty. Drives points and stars. */
  credit: number;
  hintsUsed: number;
  elapsedMs: number;
  points: number;
}

export type RoundStatus = 'playing' | 'completed' | 'shield-broken';

export interface RoundState {
  total: number;
  difficulties: Difficulty[];
  /** Index of the item being played (== results.length). */
  index: number;
  layersLeft: number;
  streak: number;
  results: ItemResult[];
  status: RoundStatus;
}

export function startRound(items: ReadonlyArray<{ difficulty: Difficulty }>): RoundState {
  return {
    total: items.length,
    difficulties: items.map((item) => item.difficulty),
    index: 0,
    layersLeft: SHIELD_LAYERS,
    streak: 0,
    results: [],
    status: items.length > 0 ? 'playing' : 'completed',
  };
}

export interface ResultInput {
  item: RoundItem;
  correct: boolean;
  /** Defaults to full credit minus the hint penalty when correct, nothing when wrong. */
  credit?: number;
  hintsUsed: number;
  elapsedMs: number;
}

/** `timeLimitMs` null = untimed (no speed bonus). */
export function recordResult(state: RoundState, input: ResultInput, timeLimitMs: number | null): RoundState {
  if (state.status !== 'playing') return state;

  const credit = Math.min(1, input.credit ?? (input.correct ? hintCredit(input.hintsUsed) : 0));
  const points = scoreCredit({
    difficulty: input.item.difficulty,
    credit,
    streakBefore: state.streak,
    elapsedMs: input.elapsedMs,
    timeLimitMs,
  });
  const result: ItemResult = {
    questionId: input.item.id,
    topic: input.item.topic,
    difficulty: input.item.difficulty,
    correct: input.correct,
    credit,
    hintsUsed: input.hintsUsed,
    elapsedMs: input.elapsedMs,
    points,
  };

  const index = state.index + 1;
  const layersLeft = input.correct ? state.layersLeft : state.layersLeft - 1;
  // Finishing every item always counts as completed, even if the last one cost the last layer.
  const status: RoundStatus = index >= state.total ? 'completed' : layersLeft <= 0 ? 'shield-broken' : 'playing';

  return {
    ...state,
    index,
    layersLeft,
    streak: input.correct ? state.streak + 1 : 0,
    results: [...state.results, result],
    status,
  };
}

export interface RoundSummary {
  score: number;
  answered: number;
  correctCount: number;
  /** Difficulty-weighted credit over the whole round (unplayed items count as zero). */
  accuracy: number;
  stars: Stars;
  completed: boolean;
  /** Full credit on every item, no hints, no layer lost. */
  flawless: boolean;
}

/** Summary from a finished list of results (games that don't play strictly in order build their own). */
export function summarizeResults(
  results: readonly ItemResult[],
  roundDifficulties: readonly Difficulty[],
  completed: boolean,
): RoundSummary {
  const accuracy = weightedCredit(results, roundDifficulties);
  return {
    score: results.reduce((sum, result) => sum + result.points, 0),
    answered: results.length,
    correctCount: results.filter((result) => result.correct).length,
    accuracy,
    stars: starsForAccuracy(accuracy),
    completed,
    flawless:
      completed &&
      roundDifficulties.length > 0 &&
      results.length === roundDifficulties.length &&
      results.every((result) => result.credit >= 1 && result.hintsUsed === 0),
  };
}

export function summarizeRound(state: RoundState): RoundSummary {
  return summarizeResults(state.results, state.difficulties, state.status === 'completed');
}
