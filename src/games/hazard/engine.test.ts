import { describe, expect, it } from 'vitest';
import hazardFa from '@/content/packs/fa/hazard.json';
import { HazardPackSchema, type HazardScene } from '@/content/schema';
import { SHIELD_LAYERS } from '@/domain/round';
import { createRng } from '@/lib/rng';
import {
  HAZARD_MAX_HINTS,
  HAZARD_TIME_LIMIT_MS,
  activeHintIds,
  endRound,
  hazardContentId,
  hazardResults,
  hintsLeft,
  isFound,
  lastSeenScenes,
  requestHint,
  selectScene,
  startHazardRound,
  summarizeHazardRound,
  tapScene,
  type HazardRound,
} from './engine';

const scene: HazardScene = HazardPackSchema.parse(hazardFa).scenes[0]!;
const opts = { slop: 0, elapsedMs: 5_000, timed: false };
const centre = (id: string) => scene.hazards.find((hazard) => hazard.id === id)!;
/** A point far from every hazard of the placeholder scene. */
const NOWHERE = { x: 0.5, y: 0.03 };

function findAll(round: HazardRound, ids = scene.hazards.map((hazard) => hazard.id)): HazardRound {
  return ids.reduce((state, id) => tapScene(state, scene, centre(id), opts).round, round);
}

describe('the placeholder scene', () => {
  it('has an empty spot at NOWHERE, and every hazard is hit by its own centre', () => {
    expect(tapScene(startHazardRound(), scene, NOWHERE, opts).kind).toBe('miss');
    for (const hazard of scene.hazards) {
      expect(tapScene(startHazardRound(), scene, hazard, opts).hazard?.id, hazard.id).toBe(hazard.id);
    }
  });
});

describe('tapScene', () => {
  it('finds a hazard, scores it and extends the streak', () => {
    const outcome = tapScene(startHazardRound(), scene, centre('site-01.crane'), opts);
    expect(outcome.kind).toBe('found');
    expect(outcome.hazard?.id).toBe('site-01.crane');
    expect(outcome.points).toBeGreaterThan(0);
    expect(outcome.round.streak).toBe(1);
    expect(outcome.round.found).toHaveLength(1);
    expect(outcome.round.layersLeft).toBe(SHIELD_LAYERS);
  });

  it('breaks a shield layer on a miss and resets the streak', () => {
    const one = tapScene(startHazardRound(), scene, centre('site-01.crane'), opts).round;
    const miss = tapScene(one, scene, NOWHERE, opts);
    expect(miss.kind).toBe('miss');
    expect(miss.round.layersLeft).toBe(SHIELD_LAYERS - 1);
    expect(miss.round.streak).toBe(0);
    expect(miss.round.misses).toBe(1);
    expect(miss.round.found).toHaveLength(1);
  });

  it('ends the round when the last layer breaks', () => {
    let round = startHazardRound();
    for (let index = 0; index < SHIELD_LAYERS; index += 1) round = tapScene(round, scene, NOWHERE, { ...opts, elapsedMs: 9_000 }).round;
    expect(round.status).toBe('shield-broken');
    expect(round.endedAtMs).toBe(9_000);
    expect(tapScene(round, scene, centre('site-01.crane'), opts).kind).toBe('ignored');
  });

  it('treats a second tap on a found hazard as a repeat: no points, no penalty', () => {
    const first = tapScene(startHazardRound(), scene, centre('site-01.crane'), opts).round;
    const again = tapScene(first, scene, centre('site-01.crane'), opts);
    expect(again.kind).toBe('repeat');
    expect(again.round).toBe(first);
    expect(again.points).toBe(0);
  });

  it('completes the round when every hazard is found, in any order', () => {
    const ids = scene.hazards.map((hazard) => hazard.id).reverse();
    const round = findAll(startHazardRound(), ids);
    expect(round.status).toBe('completed');
    expect(round.found).toHaveLength(scene.hazards.length);
    expect(round.layersLeft).toBe(SHIELD_LAYERS);
  });

  it('pays a growing streak multiplier, and a speed bonus only in timed mode', () => {
    const plain = findAll(startHazardRound(), ['site-01.crane', 'site-01.pedestrian']);
    const [first, second] = plain.found;
    expect(second!.points / second!.difficulty).toBeGreaterThanOrEqual(first!.points / first!.difficulty);

    const untimed = tapScene(startHazardRound(), scene, centre('site-01.crane'), { ...opts, elapsedMs: 0 });
    const timed = tapScene(startHazardRound(), scene, centre('site-01.crane'), { ...opts, elapsedMs: 0, timed: true });
    expect(timed.points).toBeGreaterThan(untimed.points);
    expect(HAZARD_TIME_LIMIT_MS).toBeGreaterThan(0);
  });

  it('forgives a tap just outside a hazard when the finger slop reaches it', () => {
    const hazard = centre('site-01.crane');
    const nearby = { x: hazard.x + hazard.radius + 0.02, y: hazard.y };
    expect(tapScene(startHazardRound(), scene, nearby, opts).kind).toBe('miss');
    expect(tapScene(startHazardRound(), scene, nearby, { ...opts, slop: 0.03 }).kind).toBe('found');
  });
});

describe('hints', () => {
  it('spends a hint on the first unfound hazard and rings it until found', () => {
    const { round, hazardId } = requestHint(startHazardRound(), scene);
    expect(hazardId).toBe(scene.hazards[0]!.id);
    expect(round.hintsUsed).toBe(1);
    expect(hintsLeft(round)).toBe(HAZARD_MAX_HINTS - 1);
    expect(activeHintIds(round)).toEqual([hazardId]);

    const found = tapScene(round, scene, centre(hazardId!), opts);
    expect(activeHintIds(found.round)).toEqual([]);
    expect(found.round.found[0]).toMatchObject({ hintsUsed: 1, credit: 0.85 });
  });

  it('costs 15% of that hazard\'s points and nothing else', () => {
    const hinted = tapScene(requestHint(startHazardRound(), scene).round, scene, centre(scene.hazards[0]!.id), opts);
    const plain = tapScene(startHazardRound(), scene, centre(scene.hazards[0]!.id), opts);
    expect(hinted.points).toBe(Math.round(plain.points * 0.85));
  });

  it('skips found and already-hinted hazards, and stops at the maximum', () => {
    let round = tapScene(startHazardRound(), scene, centre(scene.hazards[0]!.id), opts).round;
    const targets: string[] = [];
    for (let index = 0; index < HAZARD_MAX_HINTS + 2; index += 1) {
      const next = requestHint(round, scene);
      round = next.round;
      if (next.hazardId) targets.push(next.hazardId);
    }
    expect(targets).toEqual(scene.hazards.slice(1, 1 + HAZARD_MAX_HINTS).map((hazard) => hazard.id));
    expect(round.hintsUsed).toBe(HAZARD_MAX_HINTS);
    expect(hintsLeft(round)).toBe(0);
  });

  it('spends nothing when there is no hazard left to hint', () => {
    const done = findAll(startHazardRound());
    expect(requestHint(done, scene)).toEqual({ round: done, hazardId: null });
  });
});

describe('ending a round and summarising it', () => {
  it('scores a clean full find as completed, flawless, three stars', () => {
    const summary = summarizeHazardRound(findAll(startHazardRound()), scene);
    expect(summary).toMatchObject({ completed: true, flawless: true, stars: 3, correctCount: scene.hazards.length, answered: scene.hazards.length });
    expect(summary.accuracy).toBe(1);
  });

  it('a miss costs the flawless bonus but not the stars', () => {
    const round = findAll(tapScene(startHazardRound(), scene, NOWHERE, opts).round);
    const summary = summarizeHazardRound(round, scene);
    expect(summary.completed).toBe(true);
    expect(summary.flawless).toBe(false);
    expect(summary.stars).toBe(3);
  });

  it('a hint costs the flawless bonus too', () => {
    const round = findAll(requestHint(startHazardRound(), scene).round);
    expect(summarizeHazardRound(round, scene).flawless).toBe(false);
  });

  it('records unfound hazards as failures when the player gives up or time runs out', () => {
    const three = findAll(startHazardRound(), scene.hazards.slice(0, 3).map((hazard) => hazard.id));
    const gaveUp = endRound(three, 'gave-up', 42_000);
    expect(gaveUp.status).toBe('gave-up');
    const results = hazardResults(gaveUp, scene);
    expect(results).toHaveLength(scene.hazards.length);
    expect(results.filter((result) => result.correct)).toHaveLength(3);
    expect(results.filter((result) => !result.correct).every((result) => result.credit === 0 && result.elapsedMs === 42_000)).toBe(true);

    const summary = summarizeHazardRound(gaveUp, scene);
    expect(summary).toMatchObject({ completed: false, flawless: false, correctCount: 3, answered: scene.hazards.length });
    expect(summary.accuracy).toBeLessThan(1);
    expect(endRound(gaveUp, 'time-up', 99_000)).toBe(gaveUp);
  });

  it('keeps ids and topics from the scene on every result, so topic stats and the radar can use them', () => {
    const results = hazardResults(endRound(startHazardRound(), 'time-up', 1_000), scene);
    expect(results.map((result) => result.questionId)).toEqual(scene.hazards.map((hazard) => hazard.id));
    expect(results.map((result) => result.topic)).toEqual(scene.hazards.map((hazard) => hazard.topic));
  });

  it('knows which hazards are found', () => {
    const round = findAll(startHazardRound(), ['site-01.ladder']);
    expect(isFound(round, 'site-01.ladder')).toBe(true);
    expect(isFound(round, 'site-01.crane')).toBe(false);
  });
});

describe('scene selection', () => {
  const second: HazardScene = { ...scene, id: 'site-02' };
  const base = { scenes: [scene, second], rng: createRng(3), industry: 'general' as const };

  it('prefers a scene the player has never played, then the one played longest ago', () => {
    expect(selectScene({ ...base, lastSeenAt: new Map([['site-01', 100]]) })?.id).toBe('site-02');
    expect(selectScene({ ...base, lastSeenAt: new Map([['site-01', 100], ['site-02', 200]]) })?.id).toBe('site-01');
  });

  it('respects the player industry and returns null when nothing applies', () => {
    const energyOnly: HazardScene = { ...scene, id: 'plant-01', industries: ['energy'] };
    expect(selectScene({ scenes: [energyOnly], lastSeenAt: new Map(), rng: createRng(1), industry: 'construction' })).toBeNull();
    expect(selectScene({ scenes: [energyOnly], lastSeenAt: new Map(), rng: createRng(1), industry: 'energy' })?.id).toBe('plant-01');
  });

  it('reads last-played times from stored attempts, ignoring other games', () => {
    const seen = lastSeenScenes([
      { contentId: hazardContentId('site-01'), finishedAt: 100 },
      { contentId: hazardContentId('site-01'), finishedAt: 300 },
      { contentId: 'risk.mixed', finishedAt: 999 },
      { contentId: hazardContentId('site-02'), finishedAt: 200 },
    ]);
    expect([...seen.entries()].sort()).toEqual([['site-01', 300], ['site-02', 200]]);
  });
});
