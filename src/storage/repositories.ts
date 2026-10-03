import { newId } from '@/lib/id';
import type { BackupData, ExistingData, MergePlan } from './backup';
import type { GameId } from '@/games/ids';
import {
  HqDatabase,
  type AttemptRow,
  type ProfileRow,
  type QuestionStatRow,
  type SettingsMap,
} from './db';

export type NewProfile = Pick<ProfileRow, 'nickname' | 'avatarId' | 'industry' | 'experience'>;
export type ProfilePatch = Partial<NewProfile>;
export type NewAttempt = Omit<AttemptRow, 'id'>;

/**
 * Repositories are the only code that touches Dexie tables. UI and domain code depend on these
 * functions, so the storage engine can change without touching screens.
 */
export function createRepositories(db: HqDatabase) {
  return {
    settings: {
      async get<K extends keyof SettingsMap>(key: K): Promise<SettingsMap[K] | undefined> {
        const row = await db.settings.get(key);
        return row?.value as SettingsMap[K] | undefined;
      },
      async set<K extends keyof SettingsMap>(key: K, value: SettingsMap[K]): Promise<void> {
        await db.settings.put({ key, value });
      },
    },

    profiles: {
      async create(input: NewProfile): Promise<ProfileRow> {
        const now = Date.now();
        const row: ProfileRow = { id: newId(), createdAt: now, updatedAt: now, ...input };
        await db.profiles.add(row);
        return row;
      },
      list(): Promise<ProfileRow[]> {
        return db.profiles.orderBy('createdAt').toArray();
      },
      get(id: string): Promise<ProfileRow | undefined> {
        return db.profiles.get(id);
      },
      async update(id: string, patch: ProfilePatch): Promise<ProfileRow | undefined> {
        const changed = await db.profiles.update(id, { ...patch, updatedAt: Date.now() });
        return changed ? db.profiles.get(id) : undefined;
      },
      /** Removes the profile together with everything derived from it. */
      async delete(id: string): Promise<void> {
        await db.transaction('rw', db.profiles, db.attempts, db.questionStats, async () => {
          await db.attempts.where('profileId').equals(id).delete();
          await db.questionStats.where('profileId').equals(id).delete();
          await db.profiles.delete(id);
        });
      },
    },

    attempts: {
      async add(input: NewAttempt): Promise<AttemptRow> {
        const row: AttemptRow = { id: newId(), ...input };
        await db.attempts.add(row);
        return row;
      },
      /** Newest first. */
      listByProfile(profileId: string, limit = 100): Promise<AttemptRow[]> {
        return db.attempts
          .where('profileId')
          .equals(profileId)
          .reverse()
          .sortBy('finishedAt')
          .then((rows) => rows.slice(0, limit));
      },
      listAll(profileId: string): Promise<AttemptRow[]> {
        return db.attempts.where('profileId').equals(profileId).toArray();
      },
      /** Attempts finished at or after `since` (ms), oldest first. */
      listSince(profileId: string, since: number): Promise<AttemptRow[]> {
        return db.attempts
          .where('finishedAt')
          .aboveOrEqual(since)
          .filter((attempt) => attempt.profileId === profileId)
          .sortBy('finishedAt');
      },
      listByProfileAndGame(profileId: string, gameId: GameId): Promise<AttemptRow[]> {
        return db.attempts.where('[profileId+gameId]').equals([profileId, gameId]).toArray();
      },
      async totalXp(profileId: string): Promise<number> {
        let total = 0;
        await db.attempts
          .where('profileId')
          .equals(profileId)
          .each((attempt) => {
            total += attempt.xp;
          });
        return total;
      },
      /** Finished rounds on this content since `since` (ms) — used to damp XP farming. */
      countSince(profileId: string, contentId: string, since: number): Promise<number> {
        return db.attempts
          .where('[profileId+contentId]')
          .equals([profileId, contentId])
          .filter((attempt) => attempt.finishedAt >= since)
          .count();
      },
      /** True once the profile has earned at least one star on this content. */
      async hasEarnedStars(profileId: string, contentId: string): Promise<boolean> {
        const count = await db.attempts
          .where('[profileId+contentId]')
          .equals([profileId, contentId])
          .filter((attempt) => attempt.stars >= 1)
          .count();
        return count > 0;
      },
    },

    questionStats: {
      async getAll(profileId: string): Promise<Map<string, QuestionStatRow>> {
        const rows = await db.questionStats.where('profileId').equals(profileId).toArray();
        return new Map(rows.map((row) => [row.questionId, row]));
      },
    },

    backup: {
      /** Everything a player owns, as written to a backup file. */
      async readAll(): Promise<BackupData> {
        const [profiles, attempts, questionStats] = await Promise.all([
          db.profiles.toArray(),
          db.attempts.toArray(),
          db.questionStats.toArray(),
        ]);
        return { profiles, attempts, questionStats };
      },
      /** What is already stored, in the shape `planMerge` needs. */
      async existing(): Promise<ExistingData> {
        const [profiles, attemptIds, stats] = await Promise.all([
          db.profiles.toArray(),
          db.attempts.toCollection().primaryKeys(),
          db.questionStats.toArray(),
        ]);
        return {
          profiles,
          attemptIds: new Set(attemptIds as string[]),
          statTimes: new Map(stats.map((stat) => [`${stat.profileId}|${stat.questionId}`, stat.lastAnsweredAt])),
        };
      },
      /** Applies a merge plan atomically: either all of it is written or none. */
      async applyMerge(plan: MergePlan): Promise<void> {
        await db.transaction('rw', db.profiles, db.attempts, db.questionStats, async () => {
          await db.profiles.bulkAdd(plan.profiles);
          await db.attempts.bulkAdd(plan.attempts);
          await db.questionStats.bulkPut(plan.stats);
        });
      },
    },

    rounds: {
      /** Persists a finished round and its spaced-repetition updates atomically. */
      async record(attempt: NewAttempt, stats: QuestionStatRow[]): Promise<AttemptRow> {
        const row: AttemptRow = { id: newId(), ...attempt };
        await db.transaction('rw', db.attempts, db.questionStats, async () => {
          await db.attempts.add(row);
          await db.questionStats.bulkPut(stats);
        });
        return row;
      },
    },
  };
}

export type Repositories = ReturnType<typeof createRepositories>;

let shared: Repositories | undefined;

/** App-wide repositories on the real database (created lazily, so tests never open it). */
export function repos(): Repositories {
  shared ??= createRepositories(new HqDatabase());
  return shared;
}
