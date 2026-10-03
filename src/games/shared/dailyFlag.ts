import { dailyTasks, taskOfGame } from '@/domain/daily';
import { dayKey } from '@/domain/streak';
import type { HseTopic } from '@/domain/topics';
import type { GameId } from '@/games/ids';

/**
 * The day key a round should count for: set only when the round was opened from the Daily page
 * (`?daily=1`) and, for the quiz, plays the day's own topic. `finishRound` still decides whether it
 * really counts (completed, mission not done yet).
 */
export function dailyKeyForRound(
  params: URLSearchParams,
  gameId: GameId,
  startedAt: number,
  topic?: HseTopic,
): string | undefined {
  if (params.get('daily') !== '1') return undefined;
  const key = dayKey(startedAt);
  const task = dailyTasks(key).find((candidate) => candidate.id === taskOfGame(gameId));
  if (!task) return undefined;
  if (task.topic && task.topic !== topic) return undefined;
  return key;
}
