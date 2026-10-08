import { EXPERIENCE_MAX_DIFFICULTY, type Experience } from '@/domain/experience';
import { appliesToIndustry, type IndustryId } from '@/domain/industries';
import type { Difficulty } from '@/domain/scoring';
import { shuffle, type Rng } from '@/lib/rng';

/** What the selector needs to know about a content item (a risk scenario, a permit, …). */
export interface SelectableItem {
  id: string;
  difficulty: Difficulty;
  industries: readonly IndustryId[];
}

export interface SelectItemsInput<T extends SelectableItem> {
  items: readonly T[];
  /** When each item was last played (ms). Missing = never played. */
  lastSeenAt: ReadonlyMap<string, number>;
  rng: Rng;
  experience: Experience;
  industry: IndustryId;
  count: number;
}

/**
 * The items of one round. Unseen items first, then the longest-ago played; beginners meet the
 * hardest ones last. The round is mixed, then ramps from easier to harder.
 */
export function selectItems<T extends SelectableItem>(input: SelectItemsInput<T>): T[] {
  const { items, lastSeenAt, rng, experience, industry, count } = input;
  const maxDifficulty = EXPERIENCE_MAX_DIFFICULTY[experience];
  const pool = items.filter((item) => appliesToIndustry(item.industries, industry));

  const byFreshness = (group: T[]): T[] => {
    const shuffled = shuffle(group, rng);
    const unseen = shuffled.filter((item) => !lastSeenAt.has(item.id));
    const seen = shuffled.filter((item) => lastSeenAt.has(item.id)).sort((a, b) => lastSeenAt.get(a.id)! - lastSeenAt.get(b.id)!);
    return [...unseen, ...seen];
  };

  const ordered = [
    ...byFreshness(pool.filter((item) => item.difficulty <= maxDifficulty)),
    ...byFreshness(pool.filter((item) => item.difficulty > maxDifficulty)),
  ];
  return shuffle(ordered.slice(0, count), rng).sort((a, b) => a.difficulty - b.difficulty);
}

/** When each item was last played, from a profile's stored attempts of one game (newest wins). */
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
