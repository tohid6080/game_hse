import type { GameId } from '@/games/ids';
import type { HseTopic } from './topics';

/** Structural subset of an attempt — the storage row satisfies it, domain stays storage-free. */
export interface AttemptLike {
  gameId: GameId;
  score: number;
  stars: number;
  detail?: { answers: ReadonlyArray<{ topic: HseTopic; correct: boolean }> };
}

export interface TopicAccuracy {
  topic: HseTopic;
  answered: number;
  correct: number;
  /** 0..1 */
  accuracy: number;
}

export interface ProgressSummary {
  rounds: number;
  answered: number;
  correct: number;
  /** 0..1, over every answered question. 0 when nothing has been answered. */
  accuracy: number;
  threeStarRounds: number;
  bestScore: Partial<Record<GameId, number>>;
  /** Topics with at least one answer, weakest first. */
  topics: TopicAccuracy[];
}

export function summarizeAttempts(attempts: readonly AttemptLike[]): ProgressSummary {
  let answered = 0;
  let correct = 0;
  let threeStarRounds = 0;
  const bestScore: Partial<Record<GameId, number>> = {};
  const byTopic = new Map<HseTopic, { answered: number; correct: number }>();

  for (const attempt of attempts) {
    if (attempt.stars >= 3) threeStarRounds += 1;
    bestScore[attempt.gameId] = Math.max(bestScore[attempt.gameId] ?? 0, attempt.score);

    for (const answer of attempt.detail?.answers ?? []) {
      answered += 1;
      if (answer.correct) correct += 1;
      const entry = byTopic.get(answer.topic) ?? { answered: 0, correct: 0 };
      entry.answered += 1;
      if (answer.correct) entry.correct += 1;
      byTopic.set(answer.topic, entry);
    }
  }

  const topics = [...byTopic.entries()]
    .map(([topic, entry]) => ({ topic, ...entry, accuracy: entry.correct / entry.answered }))
    .sort((a, b) => a.accuracy - b.accuracy || b.answered - a.answered);

  return {
    rounds: attempts.length,
    answered,
    correct,
    accuracy: answered === 0 ? 0 : correct / answered,
    threeStarRounds,
    bestScore,
    topics,
  };
}

/** Local midnight of the day containing `now` (for "rounds today" counters). */
export function startOfLocalDay(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}
