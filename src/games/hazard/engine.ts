import type { HazardScene, HazardSpot } from '@/content/schema';
import { appliesToIndustry, type IndustryId } from '@/domain/industries';
import { SHIELD_LAYERS, summarizeResults, type ItemResult, type RoundSummary } from '@/domain/round';
import { hintCredit, scoreCredit } from '@/domain/scoring';
import { shuffle, type Rng } from '@/lib/rng';
import { hitTest, type Point } from './geometry';

/*
 * Pure engine of Find the Hazard. A round is one scene: the player taps hazards in any order.
 * A tap on empty space breaks one shield layer (three misses end the round); a hint ring costs 15%
 * of that hazard's points and there are at most HAZARD_MAX_HINTS per round.
 */

/** Whole-scene countdown in timed mode (the speed bonus falls as the clock runs down). */
export const HAZARD_TIME_LIMIT_MS = 150_000;
export const HAZARD_MAX_HINTS = 3;

export const hazardContentId = (sceneId: string): string => `hazard.${sceneId}`;

export type RoundEnd = 'completed' | 'shield-broken' | 'time-up' | 'gave-up';

export interface HazardRound {
  layersLeft: number;
  streak: number;
  /** Taps that hit nothing. */
  misses: number;
  hintsUsed: number;
  /** Hazards a hint ring was shown for (found ones stay listed: their result records the hint). */
  hinted: string[];
  /** One result per hazard found, in discovery order. */
  found: ItemResult[];
  status: 'playing' | RoundEnd;
  /** Elapsed time when the round ended; recorded on the hazards that were never found. */
  endedAtMs: number;
}

export function startHazardRound(): HazardRound {
  return { layersLeft: SHIELD_LAYERS, streak: 0, misses: 0, hintsUsed: 0, hinted: [], found: [], status: 'playing', endedAtMs: 0 };
}

export function isFound(round: HazardRound, hazardId: string): boolean {
  return round.found.some((result) => result.questionId === hazardId);
}

export type TapKind = 'found' | 'repeat' | 'miss' | 'ignored';

export interface TapOutcome {
  round: HazardRound;
  kind: TapKind;
  hazard: HazardSpot | null;
  /** Points earned by this tap (only for `found`). */
  points: number;
}

export interface TapOptions {
  /** Extra hit radius in image widths (finger tolerance); depends on the current zoom. */
  slop: number;
  elapsedMs: number;
  timed: boolean;
}

/** Applies one tap at a normalised point. Never mutates `round`. */
export function tapScene(round: HazardRound, scene: HazardScene, point: Point, options: TapOptions): TapOutcome {
  if (round.status !== 'playing') return { round, kind: 'ignored', hazard: null, points: 0 };

  const hazard = hitTest(scene.hazards, point, scene.height / scene.width, options.slop);

  if (!hazard) {
    const layersLeft = round.layersLeft - 1;
    const broken = layersLeft <= 0;
    return {
      round: {
        ...round,
        layersLeft,
        streak: 0,
        misses: round.misses + 1,
        status: broken ? 'shield-broken' : 'playing',
        endedAtMs: broken ? options.elapsedMs : round.endedAtMs,
      },
      kind: 'miss',
      hazard: null,
      points: 0,
    };
  }

  if (isFound(round, hazard.id)) return { round, kind: 'repeat', hazard, points: 0 };

  const hintsUsed = round.hinted.includes(hazard.id) ? 1 : 0;
  const credit = hintCredit(hintsUsed);
  const points = scoreCredit({
    difficulty: hazard.difficulty,
    credit,
    streakBefore: round.streak,
    elapsedMs: options.elapsedMs,
    timeLimitMs: options.timed ? HAZARD_TIME_LIMIT_MS : null,
  });
  const result: ItemResult = {
    questionId: hazard.id,
    topic: hazard.topic,
    difficulty: hazard.difficulty,
    correct: true,
    credit,
    hintsUsed,
    elapsedMs: options.elapsedMs,
    points,
  };
  const found = [...round.found, result];
  const done = found.length >= scene.hazards.length;
  return {
    round: {
      ...round,
      found,
      streak: round.streak + 1,
      status: done ? 'completed' : 'playing',
      endedAtMs: done ? options.elapsedMs : round.endedAtMs,
    },
    kind: 'found',
    hazard,
    points,
  };
}

export function hintsLeft(round: HazardRound): number {
  return Math.max(0, HAZARD_MAX_HINTS - round.hintsUsed);
}

/** Hazards whose hint ring should currently be drawn (hinted and still unfound). */
export function activeHintIds(round: HazardRound): string[] {
  return round.hinted.filter((id) => !isFound(round, id));
}

/**
 * Spends a hint on the first hazard (in authored order) that is neither found nor already hinted.
 * Returns `hazardId: null`, and spends nothing, when no hint is possible.
 */
export function requestHint(round: HazardRound, scene: HazardScene): { round: HazardRound; hazardId: string | null } {
  if (round.status !== 'playing' || hintsLeft(round) === 0) return { round, hazardId: null };
  const target = scene.hazards.find((hazard) => !isFound(round, hazard.id) && !round.hinted.includes(hazard.id));
  if (!target) return { round, hazardId: null };
  return { round: { ...round, hintsUsed: round.hintsUsed + 1, hinted: [...round.hinted, target.id] }, hazardId: target.id };
}

/** Ends a round that is still running because the clock ran out or the player gave up. */
export function endRound(round: HazardRound, reason: 'time-up' | 'gave-up', elapsedMs: number): HazardRound {
  if (round.status !== 'playing') return round;
  return { ...round, status: reason, endedAtMs: elapsedMs };
}

/** A result per hazard of the scene: the ones found, then the ones never found (credit 0). */
export function hazardResults(round: HazardRound, scene: HazardScene): ItemResult[] {
  const missed = scene.hazards
    .filter((hazard) => !isFound(round, hazard.id))
    .map<ItemResult>((hazard) => ({
      questionId: hazard.id,
      topic: hazard.topic,
      difficulty: hazard.difficulty,
      correct: false,
      credit: 0,
      hintsUsed: round.hinted.includes(hazard.id) ? 1 : 0,
      elapsedMs: round.endedAtMs,
      points: 0,
    }));
  return [...round.found, ...missed];
}

export function summarizeHazardRound(round: HazardRound, scene: HazardScene): RoundSummary {
  const summary = summarizeResults(
    hazardResults(round, scene),
    scene.hazards.map((hazard) => hazard.difficulty),
    round.status === 'completed',
  );
  // A wrong tap breaks a shield layer without producing a result, so flawless needs "no misses" too.
  return { ...summary, flawless: summary.flawless && round.misses === 0 };
}

export interface SelectSceneInput {
  scenes: readonly HazardScene[];
  /** When each scene was last played (ms). Missing = never played. */
  lastSeenAt: ReadonlyMap<string, number>;
  rng: Rng;
  industry: IndustryId;
}

/** An unseen scene if there is one, else the one played longest ago. Null when none applies. */
export function selectScene(input: SelectSceneInput): HazardScene | null {
  const pool = input.scenes.filter((scene) => appliesToIndustry(scene.industries, input.industry));
  const shuffled = shuffle(pool, input.rng);
  const unseen = shuffled.filter((scene) => !input.lastSeenAt.has(scene.id));
  const seen = shuffled
    .filter((scene) => input.lastSeenAt.has(scene.id))
    .sort((a, b) => input.lastSeenAt.get(a.id)! - input.lastSeenAt.get(b.id)!);
  return [...unseen, ...seen][0] ?? null;
}

/** When each scene was last played, from a profile's stored hazard attempts (newest wins). */
export function lastSeenScenes(attempts: ReadonlyArray<{ contentId: string; finishedAt: number }>): Map<string, number> {
  const prefix = hazardContentId('');
  const seen = new Map<string, number>();
  for (const attempt of attempts) {
    if (!attempt.contentId.startsWith(prefix)) continue;
    const sceneId = attempt.contentId.slice(prefix.length);
    seen.set(sceneId, Math.max(seen.get(sceneId) ?? 0, attempt.finishedAt));
  }
  return seen;
}
