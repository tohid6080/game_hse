import { evaluateBadges, newlyUnlocked, type BadgeUnlock } from '@/domain/badges';
import { dailyProgress, taskOfGame } from '@/domain/daily';
import { levelFromXp } from '@/domain/levels';
import type { ItemResult, RoundSummary } from '@/domain/round';
import { xpForRound, type RoundXp } from '@/domain/scoring';
import { startOfLocalDay } from '@/domain/stats';
import { dayKey } from '@/domain/streak';
import type { GameId } from '@/games/ids';
import { syncReminders } from '@/reminders/reminderService';
import { useProgressStore } from '@/state/progressStore';
import type { AttemptDetail, ProfileRow, QuestionStatRow } from '@/storage/db';
import { repos } from '@/storage/repositories';

export interface FinishInput {
  profile: ProfileRow;
  gameId: GameId;
  /** Stable id of what was played (e.g. "quiz.topic.ppe"); XP damping and first-time bonus key off it. */
  contentId: string;
  /** Free-form mode label stored with the attempt ("topic", "mixed", "weak", …). */
  mode: string;
  firstTimeEligible: boolean;
  startedAt: number;
  results: readonly ItemResult[];
  summary: RoundSummary;
  /** Overrides the default "completed or shield-broken" (e.g. the hazard clock ran out). */
  endedBy?: AttemptDetail['endedBy'];
  /** Taps that hit nothing, for games with free tapping (Find the Hazard). */
  misses?: number;
  /**
   * Day key of the daily challenge this round was started for (the `daily=1` flag). It counts, and
   * pays double XP, only if the round completes and that mission had no counted round yet today.
   */
  daily?: string;
  /** Spaced repetition: builds the rows to persist from the stats read just before saving. */
  buildStats?: (previous: ReadonlyMap<string, QuestionStatRow>, now: number) => QuestionStatRow[];
}

export interface FinishOutcome {
  xp: RoundXp;
  /** False when local storage failed: the round did not count towards progress. */
  saved: boolean;
  levelBefore: number;
  levelAfter: number;
  /** Medals this round unlocked or upgraded. */
  badges: BadgeUnlock[];
}

/**
 * Persists a finished round in one transaction (the attempt plus any spaced-repetition updates),
 * then refreshes XP. Never throws: if storage fails the player still gets a result, marked unsaved.
 */
export async function finishRound(input: FinishInput): Promise<FinishOutcome> {
  const { profile, summary } = input;
  const now = Date.now();
  const xpBefore = useProgressStore.getState().xp;
  let xp: RoundXp = xpForRound({
    score: summary.score,
    completed: summary.completed,
    flawless: summary.flawless,
    firstTime: false,
    repeatsToday: 0,
  });
  let saved = false;
  let badges: BadgeUnlock[] = [];

  try {
    const [earnedBefore, repeatsToday, previous, history] = await Promise.all([
      repos().attempts.hasEarnedStars(profile.id, input.contentId),
      repos().attempts.countSince(profile.id, input.contentId, startOfLocalDay(now)),
      input.buildStats ? repos().questionStats.getAll(profile.id) : Promise.resolve(new Map<string, QuestionStatRow>()),
      repos().attempts.listAll(profile.id),
    ]);
    // Only a day key that matches the day the round started can count (guards against a stale flag).
    let dailyFirst = false;
    let dailyCompletes = false;
    const taskId = taskOfGame(input.gameId);
    if (input.daily && input.daily === dayKey(input.startedAt) && summary.completed && taskId) {
      const today = dailyProgress(input.daily, await repos().attempts.listSince(profile.id, startOfLocalDay(input.startedAt)));
      if (!today.done[taskId]) {
        dailyFirst = true;
        dailyCompletes = today.doneCount + 1 === today.tasks.length;
      }
    }
    xp = xpForRound({
      score: summary.score,
      completed: summary.completed,
      flawless: summary.flawless,
      firstTime: input.firstTimeEligible && !earnedBefore,
      repeatsToday,
      dailyFirst,
      dailyCompletes,
    });
    const row = await repos().rounds.record(
      {
        profileId: profile.id,
        gameId: input.gameId,
        contentId: input.contentId,
        startedAt: input.startedAt,
        finishedAt: now,
        score: summary.score,
        stars: summary.stars,
        xp: xp.total,
        durationMs: now - input.startedAt,
        detail: {
          mode: input.mode,
          endedBy: input.endedBy ?? (summary.completed ? 'completed' : 'shield-broken'),
          ...(input.misses === undefined ? {} : { misses: input.misses }),
          ...(dailyFirst ? { daily: input.daily } : {}),
          ...(xp.dailyBonus > 0 ? { dailyBonus: xp.dailyBonus } : {}),
          answers: input.results.map((result) => ({
            questionId: result.questionId,
            topic: result.topic,
            difficulty: result.difficulty,
            correct: result.correct,
            credit: result.credit,
            hintsUsed: result.hintsUsed,
            elapsedMs: result.elapsedMs,
          })),
        },
      },
      input.buildStats ? input.buildStats(previous, now) : [],
    );
    saved = true;
    badges = newlyUnlocked(evaluateBadges(history, now), evaluateBadges([...history, row], now));
    await useProgressStore.getState().refresh(profile.id);
    // Played today: today's reminder (if any) is dropped. Failure here must never affect the result.
    void syncReminders().catch(() => undefined);
  } catch {
    // `saved` stays false (or true if only the XP refresh failed): the result screen says which.
  }

  return {
    xp,
    saved,
    levelBefore: levelFromXp(xpBefore),
    levelAfter: saved ? levelFromXp(useProgressStore.getState().xp) : levelFromXp(xpBefore),
    badges,
  };
}
