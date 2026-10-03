import { describe, expect, it } from 'vitest';
import { addDays, computeStreak, dayKey } from './streak';

const at = (year: number, month: number, day: number, hour = 12) => new Date(year, month - 1, day, hour).getTime();
const NOW = at(2026, 6, 15);

describe('day keys', () => {
  it('formats local days and adds calendar days across month, year and leap boundaries', () => {
    expect(dayKey(at(2026, 6, 5))).toBe('2026-06-05');
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
  });

  it('puts late-evening and just-after-midnight rounds on different days', () => {
    expect(dayKey(at(2026, 6, 15, 23))).not.toBe(dayKey(at(2026, 6, 16, 0)));
  });
});

describe('computeStreak', () => {
  it('is empty with no attempts', () => {
    const info = computeStreak([], NOW);
    expect(info).toMatchObject({ current: 0, best: 0, playedToday: false, atRisk: false });
    expect(info.week).toHaveLength(7);
    expect(info.week.every((day) => !day.played)).toBe(true);
    expect(info.week[6]).toMatchObject({ today: true, key: '2026-06-15' });
  });

  it('counts consecutive days ending today', () => {
    const info = computeStreak([at(2026, 6, 13), at(2026, 6, 14), at(2026, 6, 15, 8)], NOW);
    expect(info).toMatchObject({ current: 3, best: 3, playedToday: true, atRisk: false });
  });

  it('counts several rounds on one day once', () => {
    expect(computeStreak([at(2026, 6, 15, 8), at(2026, 6, 15, 9), at(2026, 6, 15, 22)], NOW).current).toBe(1);
  });

  it('keeps a streak alive through yesterday and flags it at risk until today is played', () => {
    const info = computeStreak([at(2026, 6, 13), at(2026, 6, 14)], NOW);
    expect(info).toMatchObject({ current: 2, playedToday: false, atRisk: true });
  });

  it('is lost after a missed day, but best remembers the longest run', () => {
    const info = computeStreak([at(2026, 6, 1), at(2026, 6, 2), at(2026, 6, 3), at(2026, 6, 4), at(2026, 6, 12), at(2026, 6, 13)], NOW);
    expect(info).toMatchObject({ current: 0, best: 4, atRisk: false });
  });

  it('ignores days after today, so a clock moved forward cannot bank future days', () => {
    const info = computeStreak([at(2026, 6, 15), at(2026, 6, 16), at(2026, 6, 17), at(2026, 6, 18)], NOW);
    expect(info).toMatchObject({ current: 1, best: 1 });
    // The same attempts count once their day has really arrived.
    expect(computeStreak([at(2026, 6, 15), at(2026, 6, 16), at(2026, 6, 17)], at(2026, 6, 17)).current).toBe(3);
  });

  it('marks the played days of the week and today', () => {
    const info = computeStreak([at(2026, 6, 10), at(2026, 6, 13), at(2026, 6, 15)], NOW);
    expect(info.week.map((day) => day.key)).toEqual(['2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14', '2026-06-15']);
    expect(info.week.map((day) => day.played)).toEqual([false, true, false, false, true, false, true]);
  });

  it('bridges a month boundary', () => {
    const info = computeStreak([at(2026, 5, 31), at(2026, 6, 1), at(2026, 6, 2)], at(2026, 6, 2));
    expect(info.current).toBe(3);
  });
});
