import { describe, expect, it } from 'vitest';
import { rankProfiles, type LeaderboardEntry } from './leaderboard';

const NOW = new Date(2026, 5, 15, 12).getTime();
const day = (offset: number, hour = 10) => new Date(2026, 5, 15 + offset, hour).getTime();
const entry = (nickname: string, attempts: Array<[number, number]>): LeaderboardEntry => ({
  profileId: nickname,
  nickname,
  avatarId: 'shield',
  attempts: attempts.map(([finishedAt, xp]) => ({ finishedAt, xp })),
});

describe('rankProfiles — all time', () => {
  it('ranks by total XP, highest first', () => {
    const rows = rankProfiles([entry('علی', [[day(-30), 100]]), entry('سارا', [[day(-2), 300], [day(0), 50]]), entry('رضا', [[day(0), 120]])], 'all', NOW);
    expect(rows.map((row) => [row.nickname, row.xp, row.rank])).toEqual([
      ['سارا', 350, 1],
      ['رضا', 120, 2],
      ['علی', 100, 3],
    ]);
  });

  it('counts rounds, and shares a rank on equal XP (1, 1, 3)', () => {
    const rows = rankProfiles([entry('الف', [[day(0), 100], [day(0), 100]]), entry('ب', [[day(0), 200]]), entry('ج', [[day(0), 50]])], 'all', NOW);
    expect(rows.map((row) => [row.nickname, row.rank, row.rounds])).toEqual([
      ['الف', 1, 2],
      ['ب', 1, 1],
      ['ج', 3, 1],
    ]);
  });

  it('leaves a profile without XP unranked, listed last', () => {
    const rows = rankProfiles([entry('تازه‌وارد', []), entry('علی', [[day(0), 10]])], 'all', NOW);
    expect(rows.map((row) => [row.nickname, row.rank])).toEqual([['علی', 1], ['تازه‌وارد', null]]);
  });

  it('copes with no profiles', () => {
    expect(rankProfiles([], 'all', NOW)).toEqual([]);
  });
});

describe('rankProfiles — last seven days', () => {
  it('counts today and the six days before, not older rounds', () => {
    const rows = rankProfiles([entry('علی', [[day(-6, 0), 40], [day(-7, 23), 500], [day(0), 10]])], 'week', NOW);
    expect(rows[0]).toMatchObject({ xp: 50, rounds: 2, rank: 1 });
  });

  it('ranks by recent XP, so a veteran can be overtaken this week', () => {
    const rows = rankProfiles([entry('کهنه‌کار', [[day(-60), 5000], [day(-1), 20]]), entry('تازه‌کار', [[day(0), 90]])], 'week', NOW);
    expect(rows.map((row) => row.nickname)).toEqual(['تازه‌کار', 'کهنه‌کار']);
    expect(rankProfiles([entry('کهنه‌کار', [[day(-60), 5000]])], 'week', NOW)[0]!.rank).toBeNull();
  });

  it('ignores rounds dated after today (a clock moved forward)', () => {
    const rows = rankProfiles([entry('علی', [[day(0), 10], [day(3), 1000]])], 'week', NOW);
    expect(rows[0]!.xp).toBe(10);
  });

  it('uses the local calendar day for the window edge', () => {
    const rows = rankProfiles([entry('علی', [[day(-6, 0), 1], [day(-7, 23), 100]])], 'week', day(0, 0));
    expect(rows[0]!.xp).toBe(1);
  });
});
