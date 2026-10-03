import Dexie, { type EntityTable, type Table } from 'dexie';
import type { LeitnerState } from '@/domain/leitner';
import type { Experience } from '@/domain/experience';
import type { IndustryId } from '@/domain/industries';
import type { Difficulty } from '@/domain/scoring';
import type { HseTopic } from '@/domain/topics';
import type { GameId } from '@/games/ids';

/**
 * Local-only persistence (IndexedDB via Dexie). Nothing here ever leaves the device.
 *
 * Progress is *derived*: `attempts` is an append-only log of finished rounds, and XP / level /
 * badges / leaderboards are computed from it. That keeps rules changeable (fix a badge rule,
 * rebalance XP) without migrating stored totals. `questionStats` is a rebuildable cache of the
 * Leitner reducer applied to the answers inside `attempts`.
 */

export type ThemePref = 'system' | 'light' | 'dark';

export { EXPERIENCES, type Experience } from '@/domain/experience';

/** Typed key-value settings. Add keys here; values must be structured-clone friendly. */
export interface SettingsMap {
  theme: ThemePref;
  activeProfileId: string | null;
  /** Quiz: per-question countdown with a speed bonus. Off by default (calm learning first). */
  timedMode: boolean;
  /** Synthesised sound effects. Off by default: this is a workplace tool. */
  soundEnabled: boolean;
  /** Short vibrations on results. On by default. */
  hapticsEnabled: boolean;
  /** Daily reminder notification (Android app only). Off until the player turns it on. */
  reminderEnabled: boolean;
  /** Reminder time, 24-hour "HH:mm". */
  reminderTime: string;
}

export interface SettingRow {
  key: keyof SettingsMap;
  value: SettingsMap[keyof SettingsMap];
}

export interface ProfileRow {
  id: string;
  nickname: string;
  avatarId: string;
  industry: IndustryId;
  experience: Experience;
  createdAt: number;
  updatedAt: number;
}

/** One answered question inside a round — enough to rebuild stats and per-topic accuracy. */
export interface AttemptAnswer {
  questionId: string;
  topic: HseTopic;
  difficulty: Difficulty;
  correct: boolean;
  /** 0..1 earned (partial credit games such as risk assessment). Absent = all-or-nothing. */
  credit?: number;
  hintsUsed: number;
  elapsedMs: number;
}

export interface AttemptDetail {
  /** Game-specific mode label, e.g. "topic", "mixed", "weak". */
  mode: string;
  /** How the round ended; `time-up` and `gave-up` only occur in Find the Hazard. */
  endedBy: 'completed' | 'shield-broken' | 'time-up' | 'gave-up';
  /** Taps that hit nothing (Find the Hazard). */
  misses?: number;
  /** Day key ("YYYY-MM-DD") of the daily challenge this round counted for (set only when it counted). */
  daily?: string;
  /** Flat XP included in this attempt's `xp` for completing the whole daily challenge. */
  dailyBonus?: number;
  answers: AttemptAnswer[];
}

export interface AttemptRow {
  id: string;
  profileId: string;
  gameId: GameId;
  /** Stable content id the round was played on (e.g. "quiz.topic.ppe"). */
  contentId: string;
  startedAt: number;
  finishedAt: number;
  score: number;
  stars: 0 | 1 | 2 | 3;
  xp: number;
  durationMs: number;
  detail?: AttemptDetail;
}

export interface QuestionStatRow extends LeitnerState {
  profileId: string;
  questionId: string;
  topic: HseTopic;
}

/** Bump together with a new `this.version(n)` block below; export/import files carry it too. */
export const DB_SCHEMA_VERSION = 2;

export class HqDatabase extends Dexie {
  settings!: EntityTable<SettingRow, 'key'>;
  profiles!: EntityTable<ProfileRow, 'id'>;
  attempts!: EntityTable<AttemptRow, 'id'>;
  questionStats!: Table<QuestionStatRow, [string, string]>;

  constructor(name = 'hse-quest') {
    super(name);

    this.version(1).stores({
      settings: 'key',
      profiles: 'id, createdAt',
      attempts: 'id, profileId, gameId, finishedAt, [profileId+gameId]',
    });

    // v2 (Phase 1): profile experience, spaced-repetition cache, per-content attempt index.
    this.version(2)
      .stores({
        settings: 'key',
        profiles: 'id, createdAt',
        attempts: 'id, profileId, gameId, finishedAt, [profileId+gameId], [profileId+contentId]',
        questionStats: '[profileId+questionId], profileId, dueAt',
      })
      .upgrade((tx) =>
        tx
          .table('profiles')
          .toCollection()
          .modify((profile: Partial<ProfileRow>) => {
            profile.experience ??= 'beginner';
          }),
      );
  }
}
