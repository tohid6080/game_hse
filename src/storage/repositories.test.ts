import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { DB_SCHEMA_VERSION, HqDatabase, type QuestionStatRow } from './db';
import { createRepositories, type NewAttempt, type NewProfile, type Repositories } from './repositories';

let counter = 0;
let db: HqDatabase;
let repo: Repositories;

beforeEach(() => {
  counter += 1;
  db = new HqDatabase(`test-${counter}`);
  repo = createRepositories(db);
});

const person: NewProfile = { nickname: 'علی', avatarId: 'hard-hat', industry: 'general', experience: 'beginner' };

function attemptFor(profileId: string, overrides: Partial<NewAttempt> = {}): NewAttempt {
  return {
    profileId,
    gameId: 'quiz',
    contentId: 'quiz.mixed',
    startedAt: 1,
    finishedAt: 10,
    score: 100,
    stars: 2,
    xp: 10,
    durationMs: 5000,
    ...overrides,
  };
}

function statFor(profileId: string, questionId: string): QuestionStatRow {
  return {
    profileId,
    questionId,
    topic: 'ppe',
    box: 2,
    dueAt: 5,
    seen: 1,
    correct: 1,
    wrong: 0,
    lastAnsweredAt: 1,
  };
}

describe('storage schema', () => {
  it('opens at the declared schema version with the expected tables', async () => {
    await db.open();
    expect(db.verno).toBe(DB_SCHEMA_VERSION);
    expect(db.tables.map((table) => table.name).sort()).toEqual([
      'attempts',
      'profiles',
      'questionStats',
      'settings',
    ]);
  });

  it('upgrades a v1 database without losing data and backfills profile experience', async () => {
    class V1Database extends Dexie {
      constructor(name: string) {
        super(name);
        this.version(1).stores({
          settings: 'key',
          profiles: 'id, createdAt',
          attempts: 'id, profileId, gameId, finishedAt, [profileId+gameId]',
        });
      }
    }
    const name = `migration-${counter}`;
    const old = new V1Database(name);
    await old.table('profiles').add({
      id: 'p1',
      nickname: 'قدیمی',
      avatarId: 'hard-hat',
      industry: 'general',
      createdAt: 1,
      updatedAt: 1,
    });
    await old.table('settings').put({ key: 'theme', value: 'dark' });
    old.close();

    const upgraded = new HqDatabase(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(2);
    expect((await upgraded.profiles.get('p1'))?.experience).toBe('beginner');
    expect((await upgraded.settings.get('theme'))?.value).toBe('dark');
    expect(await upgraded.questionStats.count()).toBe(0);
  });
});

describe('settings repository', () => {
  it('returns undefined for unset keys and round-trips values', async () => {
    expect(await repo.settings.get('theme')).toBeUndefined();
    await repo.settings.set('theme', 'dark');
    expect(await repo.settings.get('theme')).toBe('dark');
    await repo.settings.set('timedMode', true);
    expect(await repo.settings.get('timedMode')).toBe(true);
    await repo.settings.set('activeProfileId', null);
    expect(await repo.settings.get('activeProfileId')).toBeNull();
  });
});

describe('profiles repository', () => {
  it('creates and lists profiles in creation order', async () => {
    const first = await repo.profiles.create(person);
    const second = await repo.profiles.create({ ...person, nickname: 'سارا', industry: 'oil-gas' });
    expect(first.id).not.toBe(second.id);
    expect((await repo.profiles.list()).map((p) => p.nickname)).toEqual(['علی', 'سارا']);
    expect((await repo.profiles.get(second.id))?.industry).toBe('oil-gas');
  });

  it('updates a profile and bumps updatedAt', async () => {
    const created = await repo.profiles.create(person);
    const updated = await repo.profiles.update(created.id, { nickname: 'علیرضا', experience: 'expert' });
    expect(updated?.nickname).toBe('علیرضا');
    expect(updated?.experience).toBe('expert');
    expect(updated?.avatarId).toBe('hard-hat');
    expect(updated!.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
    expect(await repo.profiles.update('missing', { nickname: 'x' })).toBeUndefined();
  });

  it('deletes a profile together with its attempts and question stats only', async () => {
    const keep = await repo.profiles.create(person);
    const drop = await repo.profiles.create({ ...person, nickname: 'سارا' });
    await repo.rounds.record(attemptFor(keep.id), [statFor(keep.id, 'q1')]);
    await repo.rounds.record(attemptFor(drop.id), [statFor(drop.id, 'q1'), statFor(drop.id, 'q2')]);

    await repo.profiles.delete(drop.id);

    expect(await repo.profiles.get(drop.id)).toBeUndefined();
    expect(await repo.attempts.listAll(drop.id)).toEqual([]);
    expect((await repo.questionStats.getAll(drop.id)).size).toBe(0);
    expect((await repo.attempts.listAll(keep.id)).length).toBe(1);
    expect((await repo.questionStats.getAll(keep.id)).size).toBe(1);
  });
});

describe('attempts repository', () => {
  it('lists attempts newest-first and per game', async () => {
    const profile = await repo.profiles.create(person);
    await repo.attempts.add(attemptFor(profile.id, { finishedAt: 10 }));
    await repo.attempts.add(attemptFor(profile.id, { gameId: 'findHazard', finishedAt: 30 }));
    await repo.attempts.add(attemptFor(profile.id, { finishedAt: 50 }));

    expect((await repo.attempts.listByProfile(profile.id)).map((a) => a.finishedAt)).toEqual([50, 30, 10]);
    expect((await repo.attempts.listByProfile(profile.id, 2)).length).toBe(2);
    expect((await repo.attempts.listByProfileAndGame(profile.id, 'quiz')).length).toBe(2);
  });

  it('sums XP per profile only', async () => {
    const a = await repo.profiles.create(person);
    const b = await repo.profiles.create({ ...person, nickname: 'سارا' });
    await repo.attempts.add(attemptFor(a.id, { xp: 40 }));
    await repo.attempts.add(attemptFor(a.id, { xp: 15 }));
    await repo.attempts.add(attemptFor(b.id, { xp: 999 }));
    expect(await repo.attempts.totalXp(a.id)).toBe(55);
    expect(await repo.attempts.totalXp('nobody')).toBe(0);
  });

  it('counts repeats since a moment and detects earned stars per content', async () => {
    const profile = await repo.profiles.create(person);
    await repo.attempts.add(attemptFor(profile.id, { contentId: 'quiz.topic.ppe', finishedAt: 100, stars: 0 }));
    expect(await repo.attempts.hasEarnedStars(profile.id, 'quiz.topic.ppe')).toBe(false);

    await repo.attempts.add(attemptFor(profile.id, { contentId: 'quiz.topic.ppe', finishedAt: 200, stars: 1 }));
    await repo.attempts.add(attemptFor(profile.id, { contentId: 'quiz.topic.fire-safety', finishedAt: 300 }));

    expect(await repo.attempts.hasEarnedStars(profile.id, 'quiz.topic.ppe')).toBe(true);
    expect(await repo.attempts.countSince(profile.id, 'quiz.topic.ppe', 150)).toBe(1);
    expect(await repo.attempts.countSince(profile.id, 'quiz.topic.ppe', 0)).toBe(2);
  });
});

describe('rounds repository', () => {
  it('records the attempt and the question stats together', async () => {
    const profile = await repo.profiles.create(person);
    const saved = await repo.rounds.record(attemptFor(profile.id), [statFor(profile.id, 'q1'), statFor(profile.id, 'q2')]);

    expect((await repo.attempts.listAll(profile.id)).map((a) => a.id)).toEqual([saved.id]);
    const stats = await repo.questionStats.getAll(profile.id);
    expect([...stats.keys()].sort()).toEqual(['q1', 'q2']);
  });

  it('upserts stats for a question answered again and leaves no attempt behind on failure', async () => {
    const profile = await repo.profiles.create(person);
    await repo.rounds.record(attemptFor(profile.id), [statFor(profile.id, 'q1')]);
    await repo.rounds.record(attemptFor(profile.id, { finishedAt: 20 }), [{ ...statFor(profile.id, 'q1'), box: 3 }]);
    expect((await repo.questionStats.getAll(profile.id)).get('q1')?.box).toBe(3);

    // A malformed stat row (missing key part) must abort the whole transaction.
    const broken = { ...statFor(profile.id, 'q9'), questionId: undefined } as unknown as QuestionStatRow;
    await expect(repo.rounds.record(attemptFor(profile.id, { finishedAt: 30 }), [broken])).rejects.toThrow();
    expect((await repo.attempts.listAll(profile.id)).length).toBe(2);
  });
});

describe('attempts.listSince', () => {
  it('returns one profile\'s attempts from a moment on, oldest first', async () => {
    const ali = await repo.profiles.create(person);
    const sara = await repo.profiles.create({ ...person, nickname: 'سارا' });
    await repo.attempts.add(attemptFor(ali.id, { finishedAt: 50 }));
    await repo.attempts.add(attemptFor(ali.id, { finishedAt: 300 }));
    await repo.attempts.add(attemptFor(ali.id, { finishedAt: 200, detail: { mode: 'topic', endedBy: 'completed', daily: '2026-06-15', answers: [] } }));
    await repo.attempts.add(attemptFor(sara.id, { finishedAt: 250 }));

    const rows = await repo.attempts.listSince(ali.id, 100);
    expect(rows.map((row) => row.finishedAt)).toEqual([200, 300]);
    expect(rows[0]!.detail?.daily).toBe('2026-06-15');
  });
});
