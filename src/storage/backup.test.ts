import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  BACKUP_FORMAT_VERSION,
  createBackup,
  dataProblem,
  parseBackup,
  planMerge,
  serializeBackup,
  sha256Hex,
  type BackupData,
  type BackupFile,
} from './backup';
import { DB_SCHEMA_VERSION, HqDatabase, type AttemptRow, type ProfileRow, type QuestionStatRow } from './db';
import { createRepositories, type Repositories } from './repositories';

const profile = (id: string, nickname: string): ProfileRow => ({
  id,
  nickname,
  avatarId: 'shield',
  industry: 'general',
  experience: 'beginner',
  createdAt: 1,
  updatedAt: 1,
});

const attempt = (id: string, profileId: string, overrides: Partial<AttemptRow> = {}): AttemptRow => ({
  id,
  profileId,
  gameId: 'quiz',
  contentId: 'quiz.mixed',
  startedAt: 1,
  finishedAt: 10,
  score: 100,
  stars: 2,
  xp: 10,
  durationMs: 5000,
  detail: {
    mode: 'mixed',
    endedBy: 'completed',
    answers: [{ questionId: 'q1', topic: 'ppe', difficulty: 1, correct: true, hintsUsed: 0, elapsedMs: 900, credit: 1 }],
  },
  ...overrides,
});

const stat = (profileId: string, questionId: string, lastAnsweredAt: number): QuestionStatRow => ({
  profileId,
  questionId,
  topic: 'ppe',
  box: 2,
  dueAt: 5,
  seen: 1,
  correct: 1,
  wrong: 0,
  lastAnsweredAt,
});

const sample = (): BackupData => ({
  profiles: [profile('p1', 'علی'), profile('p2', 'سارا')],
  attempts: [attempt('a1', 'p1'), attempt('a2', 'p1', { gameId: 'findHazard', detail: { mode: 'scene', endedBy: 'time-up', misses: 2, answers: [] } }), attempt('a3', 'p2')],
  questionStats: [stat('p1', 'q1', 100)],
});

const META = { appVersion: '0.0.1', exportedAt: 1_750_000_000_000 };
const exported = async (data = sample()) => serializeBackup(await createBackup(data, META));

describe('the backup file', () => {
  it('records the format, the schema version, the app version and a SHA-256 checksum of the data', async () => {
    const file = await createBackup(sample(), META);
    expect(file).toMatchObject({ format: 'hse-quest-backup', formatVersion: BACKUP_FORMAT_VERSION, schemaVersion: DB_SCHEMA_VERSION, appVersion: '0.0.1' });
    expect(file.checksum).toBe(await sha256Hex(JSON.stringify(file.data)));
    expect(file.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('round-trips exactly through serialize and parse', async () => {
    const parsed = await parseBackup(await exported());
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.file.data).toEqual(sample());
  });
});

describe('parseBackup rejects what it must', () => {
  const tweak = async (change: (file: Record<string, unknown>) => void): Promise<string> => {
    const file = JSON.parse(await exported()) as Record<string, unknown>;
    change(file);
    return JSON.stringify(file);
  };
  /** A change to the data with its checksum recomputed, so only validation (not the checksum) can object. */
  const tweakData = async (change: (data: BackupData) => void): Promise<string> => {
    const file = JSON.parse(await exported()) as BackupFile;
    change(file.data);
    file.checksum = await sha256Hex(JSON.stringify(file.data));
    return JSON.stringify(file);
  };

  it('text that is not JSON, and JSON that is not a backup', async () => {
    expect(await parseBackup('{oops')).toMatchObject({ ok: false, problem: 'not-json' });
    expect(await parseBackup('[]')).toMatchObject({ ok: false, problem: 'wrong-format' });
    expect(await parseBackup(JSON.stringify({ format: 'something-else' }))).toMatchObject({ ok: false, problem: 'wrong-format' });
  });

  it('files from a newer app', async () => {
    expect(await parseBackup(await tweak((file) => (file.schemaVersion = DB_SCHEMA_VERSION + 1)))).toMatchObject({ problem: 'newer-version' });
    expect(await parseBackup(await tweak((file) => (file.formatVersion = BACKUP_FORMAT_VERSION + 1)))).toMatchObject({ problem: 'newer-version' });
  });

  it('a file whose data no longer matches its checksum (corrupted or edited)', async () => {
    const edited = await tweak((file) => ((file.data as BackupData).attempts[0]!.xp = 99_999));
    expect(await parseBackup(edited)).toMatchObject({ ok: false, problem: 'corrupt' });
    expect(await parseBackup((await exported()).slice(0, -40))).toMatchObject({ ok: false });
  });

  it('well-checksummed but malformed or inconsistent data', async () => {
    expect(await parseBackup(await tweakData((data) => ((data.attempts[0] as unknown as Record<string, unknown>).gameId = 'poker')))).toMatchObject({ problem: 'invalid' });
    expect(await parseBackup(await tweakData((data) => (data.attempts[0]!.stars = 7 as never)))).toMatchObject({ problem: 'invalid' });
    expect(await parseBackup(await tweakData((data) => (data.attempts[0]!.xp = -5)))).toMatchObject({ problem: 'invalid' });
    expect(await parseBackup(await tweakData((data) => (data.attempts[0]!.profileId = 'ghost')))).toMatchObject({ problem: 'invalid' });
    expect(await parseBackup(await tweakData((data) => data.attempts.push(data.attempts[0]!)))).toMatchObject({ problem: 'invalid' });
    expect(await parseBackup(await tweakData((data) => (data.profiles[0]!.industry = 'mining' as never)))).toMatchObject({ problem: 'invalid' });
    expect(await parseBackup(await tweakData((data) => ((data.attempts[0]!.detail!.answers[0] as unknown as Record<string, unknown>).topic = 'astrology')))).toMatchObject({ problem: 'invalid' });
    expect(await parseBackup(await tweakData((data) => (data.questionStats[0]!.profileId = 'ghost')))).toMatchObject({ problem: 'invalid' });
  });

  it('accepts a backup with no rounds at all', async () => {
    expect(dataProblem({ profiles: [profile('p1', 'علی')], attempts: [], questionStats: [] })).toBeNull();
  });
});

describe('planMerge', () => {
  const empty = { profiles: [], attemptIds: new Set<string>(), statTimes: new Map<string, number>() };

  it('adds everything to an empty device', () => {
    const plan = planMerge(empty, sample());
    expect(plan.report).toEqual({ profilesAdded: 2, profilesRenamed: 0, attemptsAdded: 3, attemptsSkipped: 0, statsUpdated: 1 });
    expect(plan.profiles.map((p) => p.nickname)).toEqual(['علی', 'سارا']);
  });

  it('skips what is already there, so importing the same file twice changes nothing', () => {
    const existing = { profiles: sample().profiles, attemptIds: new Set(['a1', 'a2', 'a3']), statTimes: new Map([['p1|q1', 100]]) };
    const plan = planMerge(existing, sample());
    expect(plan.report).toEqual({ profilesAdded: 0, profilesRenamed: 0, attemptsAdded: 0, attemptsSkipped: 3, statsUpdated: 0 });
    expect(plan.profiles).toEqual([]);
  });

  it('adds only the new rounds of a profile that exists, and only newer stat rows', () => {
    const existing = { profiles: [profile('p1', 'علی')], attemptIds: new Set(['a1']), statTimes: new Map([['p1|q1', 50]]) };
    const plan = planMerge(existing, sample());
    expect(plan.attempts.map((a) => a.id)).toEqual(['a2', 'a3']);
    expect(plan.profiles.map((p) => p.id)).toEqual(['p2']);
    expect(plan.report.statsUpdated).toBe(1);
    const older = planMerge({ ...existing, statTimes: new Map([['p1|q1', 500]]) }, sample());
    expect(older.report.statsUpdated).toBe(0);
  });

  it('renames a new profile whose nickname is taken by a different profile, within the length limit', () => {
    const existing = { profiles: [profile('x', 'علی'), profile('y', 'سارا'), profile('z', 'سارا (2)')], attemptIds: new Set<string>(), statTimes: new Map<string, number>() };
    const plan = planMerge(existing, sample());
    expect(plan.profiles.map((p) => p.nickname)).toEqual(['علی (2)', 'سارا (3)']);
    expect(plan.report.profilesRenamed).toBe(2);

    const long = planMerge({ ...empty, profiles: [profile('x', 'ا'.repeat(20))] }, { profiles: [profile('n', 'ا'.repeat(20))], attempts: [], questionStats: [] });
    expect(long.profiles[0]!.nickname.length).toBeLessThanOrEqual(20);
    expect(long.profiles[0]!.nickname.endsWith('(2)')).toBe(true);
  });

  it('treats nicknames case- and space-insensitively', () => {
    const plan = planMerge({ ...empty, profiles: [profile('x', 'Ali  Reza')] }, { profiles: [profile('n', ' ali reza ')], attempts: [], questionStats: [] });
    expect(plan.profiles[0]!.nickname).toBe('ali reza (2)');
  });

  it('renames two incoming profiles that share a nickname with each other', () => {
    const plan = planMerge(empty, { profiles: [profile('1', 'علی'), profile('2', 'علی')], attempts: [], questionStats: [] });
    expect(plan.profiles.map((p) => p.nickname)).toEqual(['علی', 'علی (2)']);
  });
});

describe('through the real repositories', () => {
  let counter = 0;
  let from: Repositories;
  let to: Repositories;

  beforeEach(() => {
    counter += 1;
    from = createRepositories(new HqDatabase(`backup-from-${counter}`));
    to = createRepositories(new HqDatabase(`backup-to-${counter}`));
  });

  it('exports one device and restores it on another, then ignores a second import', async () => {
    const data = sample();
    await from.backup.applyMerge(planMerge({ profiles: [], attemptIds: new Set(), statTimes: new Map() }, data));
    const file = await createBackup(await from.backup.readAll(), META);
    const parsed = await parseBackup(serializeBackup(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const first = planMerge(await to.backup.existing(), parsed.file.data);
    await to.backup.applyMerge(first);
    expect(first.report).toMatchObject({ profilesAdded: 2, attemptsAdded: 3 });
    const restored = await to.backup.readAll();
    expect(restored.profiles.map((p) => p.id).sort()).toEqual(['p1', 'p2']);
    expect(restored.attempts.map((a) => a.id).sort()).toEqual(['a1', 'a2', 'a3']);
    expect(restored.attempts.find((a) => a.id === 'a2')!.detail).toEqual(data.attempts[1]!.detail);
    expect(await to.attempts.totalXp('p1')).toBe(20);

    const second = planMerge(await to.backup.existing(), parsed.file.data);
    expect(second.report).toMatchObject({ profilesAdded: 0, attemptsAdded: 0, attemptsSkipped: 3, statsUpdated: 0 });
    await to.backup.applyMerge(second);
    expect((await to.backup.readAll()).attempts).toHaveLength(3);
  });

  it('rolls the whole merge back if any row cannot be written', async () => {
    const data = sample();
    const plan = planMerge(await to.backup.existing(), data);
    // A second attempt with an existing id makes bulkAdd fail midway.
    plan.attempts.push({ ...plan.attempts[0]! });
    await expect(to.backup.applyMerge(plan)).rejects.toBeDefined();
    const after = await to.backup.readAll();
    expect(after.profiles).toHaveLength(0);
    expect(after.attempts).toHaveLength(0);
  });
});
