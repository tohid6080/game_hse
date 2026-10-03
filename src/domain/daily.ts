import { createRng, shuffle } from '@/lib/rng';
import type { GameId } from '@/games/ids';
import { HSE_TOPICS, type HseTopic } from './topics';

/**
 * The daily challenge: three short missions that depend only on the date, so every device shows the
 * same ones and nothing about them needs storing. A mission counts when its round was played from
 * the Daily page and completed (shield intact); that first round pays double XP, and finishing all
 * three pays a flat bonus. Progress is read back from the attempt log (`detail.daily`).
 */

export const DAILY_XP_FACTOR = 2;
export const DAILY_COMPLETION_BONUS = 100;

export type DailyTaskId = 'quiz' | 'risk' | 'hazard';

export interface DailyTask {
  id: DailyTaskId;
  gameId: GameId;
  /** Quiz mission only: today's topic. */
  topic?: HseTopic;
}

export const DAILY_TASK_IDS: readonly DailyTaskId[] = ['quiz', 'risk', 'hazard'];

const GAME_OF_TASK: Record<DailyTaskId, GameId> = { quiz: 'quiz', risk: 'riskAssessment', hazard: 'findHazard' };
/** Fixed order, so a topic never repeats until all topics have been used (a 15-day cycle). */
const TOPIC_CYCLE = shuffle(HSE_TOPICS, createRng(20_260_101));

/** Whole days since 1970-01-01 for a "YYYY-MM-DD" key (timezone-free). */
export function dayNumber(key: string): number {
  const [year, month, day] = key.split('-').map(Number) as [number, number, number];
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function dailyTasks(key: string): DailyTask[] {
  const topic = TOPIC_CYCLE[((dayNumber(key) % TOPIC_CYCLE.length) + TOPIC_CYCLE.length) % TOPIC_CYCLE.length]!;
  return [
    { id: 'quiz', gameId: GAME_OF_TASK.quiz, topic },
    { id: 'risk', gameId: GAME_OF_TASK.risk },
    { id: 'hazard', gameId: GAME_OF_TASK.hazard },
  ];
}

export function taskOfGame(gameId: GameId): DailyTaskId | null {
  return DAILY_TASK_IDS.find((id) => GAME_OF_TASK[id] === gameId) ?? null;
}

/** Where a mission starts. The `daily=1` flag is what makes the round count. */
export function dailyTaskRoute(task: DailyTask): string {
  switch (task.id) {
    case 'quiz':
      return `/games/quiz/play?mode=topic&topic=${task.topic}&daily=1`;
    case 'risk':
      return '/games/risk/play?daily=1';
    case 'hazard':
      return '/games/hazard/play?daily=1';
  }
}

export interface DailyAttemptLike {
  gameId: GameId;
  detail?: { daily?: string };
}

export interface DailyProgress {
  dayKey: string;
  tasks: DailyTask[];
  done: Record<DailyTaskId, boolean>;
  doneCount: number;
  complete: boolean;
}

/** Which of the day's missions have a counted round, from the attempts of that day. */
export function dailyProgress(key: string, attempts: readonly DailyAttemptLike[]): DailyProgress {
  const tasks = dailyTasks(key);
  const done: Record<DailyTaskId, boolean> = { quiz: false, risk: false, hazard: false };
  for (const attempt of attempts) {
    if (attempt.detail?.daily !== key) continue;
    const id = taskOfGame(attempt.gameId);
    if (id) done[id] = true;
  }
  const doneCount = tasks.filter((task) => done[task.id]).length;
  return { dayKey: key, tasks, done, doneCount, complete: doneCount === tasks.length };
}
