import { EXPERIENCES } from '@/domain/experience';
import { INDUSTRIES } from '@/domain/industries';
import { HSE_TOPICS } from '@/domain/topics';
import { GAME_IDS } from '@/games/ids';
import { NICKNAME_MAX, normalizeNickname } from '@/profile/validation';
import { DB_SCHEMA_VERSION, type AttemptRow, type ProfileRow, type QuestionStatRow } from './db';

/*
 * Backup file: everything a player owns (profiles, the attempt log, the spaced-repetition cache) as
 * one JSON document with the format and database versions and a SHA-256 checksum of the data.
 * The checksum catches truncated, corrupted or hand-edited files; it is not a signature (anyone can
 * recompute it), which is fine because progress is local and not competitive. Importing is a safe
 * merge — it only ever adds — so a wrong file can never destroy what is on the device.
 */

export const BACKUP_FORMAT = 'hse-quest-backup';
export const BACKUP_FORMAT_VERSION = 1;
/** Refuse files larger than this before even reading them (a real backup is a few MB at most). */
export const BACKUP_MAX_BYTES = 25 * 1024 * 1024;
const MAX_ROWS = 200_000;

export interface BackupData {
  profiles: ProfileRow[];
  attempts: AttemptRow[];
  questionStats: QuestionStatRow[];
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  /** Database schema the data was written under (`DB_SCHEMA_VERSION` of the exporting app). */
  schemaVersion: number;
  appVersion: string;
  exportedAt: number;
  data: BackupData;
  checksum: string;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createBackup(data: BackupData, meta: { appVersion: string; exportedAt: number }): Promise<BackupFile> {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: DB_SCHEMA_VERSION,
    appVersion: meta.appVersion,
    exportedAt: meta.exportedAt,
    data,
    checksum: await sha256Hex(JSON.stringify(data)),
  };
}

export const serializeBackup = (file: BackupFile): string => JSON.stringify(file);

export type BackupProblem = 'not-json' | 'wrong-format' | 'newer-version' | 'corrupt' | 'invalid';
export type ParsedBackup = { ok: true; file: BackupFile } | { ok: false; problem: BackupProblem; detail?: string };

/* ── validation (hand-written: zod is a dev-only dependency and is not in the bundle) ─────────── */

type Row = Record<string, unknown>;
const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown, max = 200): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
const isNumber = (value: unknown, min = 0): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min;
const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === 'string' && (list as readonly string[]).includes(value);

const END_REASONS = ['completed', 'shield-broken', 'time-up', 'gave-up'] as const;

function profileProblem(row: unknown): string | null {
  if (!isRow(row)) return 'profile is not an object';
  if (!isString(row.id, 100) || !isString(row.nickname, 100) || !isString(row.avatarId, 50)) return 'profile text fields';
  if (!oneOf(INDUSTRIES, row.industry) || !oneOf(EXPERIENCES, row.experience)) return 'profile industry or experience';
  if (!isNumber(row.createdAt) || !isNumber(row.updatedAt)) return 'profile times';
  return null;
}

function answerProblem(row: unknown): string | null {
  if (!isRow(row)) return 'answer is not an object';
  if (!isString(row.questionId, 120) || !oneOf(HSE_TOPICS, row.topic) || typeof row.correct !== 'boolean') return 'answer fields';
  if (![1, 2, 3].includes(row.difficulty as number)) return 'answer difficulty';
  if (!isNumber(row.hintsUsed) || !isNumber(row.elapsedMs)) return 'answer numbers';
  if (row.credit !== undefined && (!isNumber(row.credit) || row.credit > 1)) return 'answer credit';
  return null;
}

function attemptProblem(row: unknown): string | null {
  if (!isRow(row)) return 'attempt is not an object';
  if (!isString(row.id, 100) || !isString(row.profileId, 100) || !isString(row.contentId, 200)) return 'attempt ids';
  if (!oneOf(GAME_IDS, row.gameId)) return 'attempt game';
  if (!isNumber(row.startedAt) || !isNumber(row.finishedAt) || !isNumber(row.score) || !isNumber(row.xp) || !isNumber(row.durationMs)) return 'attempt numbers';
  if (![0, 1, 2, 3].includes(row.stars as number)) return 'attempt stars';
  if (row.detail === undefined) return null;
  const detail = row.detail;
  if (!isRow(detail) || !isString(detail.mode, 50) || !oneOf(END_REASONS, detail.endedBy)) return 'attempt detail';
  if (detail.misses !== undefined && !isNumber(detail.misses)) return 'attempt misses';
  if (detail.daily !== undefined && !isString(detail.daily, 10)) return 'attempt daily';
  if (detail.dailyBonus !== undefined && !isNumber(detail.dailyBonus)) return 'attempt daily bonus';
  if (!Array.isArray(detail.answers) || detail.answers.length > 200) return 'attempt answers';
  for (const answer of detail.answers) {
    const problem = answerProblem(answer);
    if (problem) return problem;
  }
  return null;
}

function statProblem(row: unknown): string | null {
  if (!isRow(row)) return 'stat is not an object';
  if (!isString(row.profileId, 100) || !isString(row.questionId, 120) || !oneOf(HSE_TOPICS, row.topic)) return 'stat fields';
  for (const key of ['box', 'dueAt', 'seen', 'correct', 'wrong', 'lastAnsweredAt']) if (!isNumber(row[key])) return `stat ${key}`;
  return null;
}

/** Null when the data is well-formed and consistent, otherwise a short English reason for the log. */
export function dataProblem(data: unknown): string | null {
  if (!isRow(data)) return 'data is not an object';
  const { profiles, attempts, questionStats } = data;
  if (!Array.isArray(profiles) || !Array.isArray(attempts) || !Array.isArray(questionStats)) return 'data tables';
  if (profiles.length > 100 || attempts.length > MAX_ROWS || questionStats.length > MAX_ROWS) return 'too many rows';

  const profileIds = new Set<string>();
  for (const row of profiles) {
    const problem = profileProblem(row);
    if (problem) return problem;
    const id = (row as Row).id as string;
    if (profileIds.has(id)) return 'duplicate profile id';
    profileIds.add(id);
  }
  const attemptIds = new Set<string>();
  for (const row of attempts) {
    const problem = attemptProblem(row);
    if (problem) return problem;
    const { id, profileId } = row as Row;
    if (attemptIds.has(id as string)) return 'duplicate attempt id';
    attemptIds.add(id as string);
    if (!profileIds.has(profileId as string)) return 'attempt of an unknown profile';
  }
  for (const row of questionStats) {
    const problem = statProblem(row);
    if (problem) return problem;
    if (!profileIds.has((row as Row).profileId as string)) return 'stat of an unknown profile';
  }
  return null;
}

/** Reads and verifies a backup file's text. Never throws. */
export async function parseBackup(text: string): Promise<ParsedBackup> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, problem: 'not-json' };
  }
  if (!isRow(raw) || raw.format !== BACKUP_FORMAT) return { ok: false, problem: 'wrong-format' };
  if (!isNumber(raw.formatVersion) || !isNumber(raw.schemaVersion)) return { ok: false, problem: 'invalid', detail: 'versions' };
  if (raw.formatVersion > BACKUP_FORMAT_VERSION || raw.schemaVersion > DB_SCHEMA_VERSION) return { ok: false, problem: 'newer-version' };
  if (typeof raw.checksum !== 'string' || (await sha256Hex(JSON.stringify(raw.data))) !== raw.checksum) {
    return { ok: false, problem: 'corrupt' };
  }
  const problem = dataProblem(raw.data);
  if (problem) return { ok: false, problem: 'invalid', detail: problem };
  if (!isString(raw.appVersion, 50) || !isNumber(raw.exportedAt)) return { ok: false, problem: 'invalid', detail: 'meta' };
  return { ok: true, file: raw as unknown as BackupFile };
}

/* ── merge planning (pure; the repository applies the plan in one transaction) ───────────────── */

export interface ExistingData {
  profiles: ReadonlyArray<Pick<ProfileRow, 'id' | 'nickname'>>;
  attemptIds: ReadonlySet<string>;
  /** `lastAnsweredAt` of the stat rows already stored, by "profileId|questionId". */
  statTimes: ReadonlyMap<string, number>;
}

export interface MergeReport {
  profilesAdded: number;
  profilesRenamed: number;
  attemptsAdded: number;
  attemptsSkipped: number;
  statsUpdated: number;
}

export interface MergePlan {
  profiles: ProfileRow[];
  attempts: AttemptRow[];
  stats: QuestionStatRow[];
  report: MergeReport;
}

/** `base`, or `base (2)`, `base (3)`… — case-insensitive against `taken`, within the nickname limit. */
function uniqueNickname(base: string, taken: ReadonlySet<string>): string {
  const clean = normalizeNickname(base).slice(0, NICKNAME_MAX);
  if (!taken.has(clean.toLocaleLowerCase())) return clean;
  for (let n = 2; ; n += 1) {
    const suffix = ` (${n})`;
    const candidate = `${clean.slice(0, NICKNAME_MAX - suffix.length).trimEnd()}${suffix}`;
    if (!taken.has(candidate.toLocaleLowerCase())) return candidate;
  }
}

/**
 * What importing `data` would add to a device that already holds `existing`. Nothing is ever
 * replaced or removed: known ids are skipped, a repeated nickname is renamed, and a stat row only
 * replaces an older one.
 */
export function planMerge(existing: ExistingData, data: BackupData): MergePlan {
  const knownProfileIds = new Set(existing.profiles.map((profile) => profile.id));
  const takenNames = new Set(existing.profiles.map((profile) => normalizeNickname(profile.nickname).toLocaleLowerCase()));
  const report: MergeReport = { profilesAdded: 0, profilesRenamed: 0, attemptsAdded: 0, attemptsSkipped: 0, statsUpdated: 0 };

  const profiles: ProfileRow[] = [];
  for (const profile of data.profiles) {
    if (knownProfileIds.has(profile.id)) continue;
    const nickname = uniqueNickname(profile.nickname, takenNames);
    takenNames.add(nickname.toLocaleLowerCase());
    if (nickname !== normalizeNickname(profile.nickname)) report.profilesRenamed += 1;
    profiles.push({ ...profile, nickname });
    report.profilesAdded += 1;
  }

  const attempts = data.attempts.filter((attempt) => !existing.attemptIds.has(attempt.id));
  report.attemptsAdded = attempts.length;
  report.attemptsSkipped = data.attempts.length - attempts.length;

  const stats = data.questionStats.filter((stat) => {
    const current = existing.statTimes.get(`${stat.profileId}|${stat.questionId}`);
    return current === undefined || stat.lastAnsweredAt > current;
  });
  report.statsUpdated = stats.length;

  return { profiles, attempts, stats, report };
}
