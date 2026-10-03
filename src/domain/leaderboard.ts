import { addDays, dayKey } from './streak';

/**
 * Local leaderboard: the profiles on this device ranked by XP — for a shared phone or a team
 * passing a tablet around. Everything is derived from each profile's attempt log; nothing leaves
 * the device. Ties share a rank (1, 1, 3), and a profile with no XP in the period is unranked.
 */

export type LeaderboardPeriod = 'all' | 'week';

/** The last seven local days, today included. */
export const LEADERBOARD_WEEK_DAYS = 7;

export interface LeaderboardEntry {
  profileId: string;
  nickname: string;
  avatarId: string;
  attempts: ReadonlyArray<{ finishedAt: number; xp: number }>;
}

export interface LeaderboardRow {
  profileId: string;
  nickname: string;
  avatarId: string;
  xp: number;
  rounds: number;
  /** null while the profile has earned nothing in the period. */
  rank: number | null;
}

/** Local midnight at the start of the window, as a timestamp. */
function windowStart(now: number): number {
  const [year, month, day] = addDays(dayKey(now), -(LEADERBOARD_WEEK_DAYS - 1)).split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day).getTime();
}

export function rankProfiles(entries: readonly LeaderboardEntry[], period: LeaderboardPeriod, now: number): LeaderboardRow[] {
  const since = period === 'week' ? windowStart(now) : -Infinity;
  const today = dayKey(now);

  const rows = entries.map((entry) => {
    // Attempts dated after today (a clock moved forward) never count towards a week.
    const counted = entry.attempts.filter(
      (attempt) => attempt.finishedAt >= since && (period === 'all' || dayKey(attempt.finishedAt) <= today),
    );
    return {
      profileId: entry.profileId,
      nickname: entry.nickname,
      avatarId: entry.avatarId,
      xp: counted.reduce((sum, attempt) => sum + attempt.xp, 0),
      rounds: counted.length,
      rank: null as number | null,
    };
  });

  rows.sort((a, b) => b.xp - a.xp || b.rounds - a.rounds || a.nickname.localeCompare(b.nickname));

  let previousXp: number | null = null;
  let previousRank = 0;
  rows.forEach((row, index) => {
    if (row.xp <= 0) return;
    const rank = row.xp === previousXp ? previousRank : index + 1;
    row.rank = rank;
    previousXp = row.xp;
    previousRank = rank;
  });
  return rows;
}
