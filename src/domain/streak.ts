/**
 * Day streak, derived from the attempt log (never stored): a day "counts" when at least one round
 * was finished on it, in the device's local calendar.
 *
 * Tamper-safety: days after today are ignored, so winding the clock forward and playing cannot
 * bank future days. Winding it BACK can still fill an earlier day — an offline app has no trusted
 * clock, so the streak is a motivator, not a competitive score (docs/DECISIONS.md).
 */

const pad = (value: number): string => String(value).padStart(2, '0');

/** Local calendar day as "YYYY-MM-DD" (sorts and compares as text). */
export function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Calendar arithmetic on a day key; immune to 23/25-hour days around DST changes. */
export function addDays(key: string, delta: number): string {
  const [year, month, day] = key.split('-').map(Number) as [number, number, number];
  return dayKey(new Date(year, month - 1, day + delta).getTime());
}

export interface StreakDay {
  key: string;
  played: boolean;
  today: boolean;
}

export interface StreakInfo {
  /** Consecutive days ending today — or yesterday while today is still open. */
  current: number;
  best: number;
  playedToday: boolean;
  /** A streak exists but today is still empty: play to keep it. */
  atRisk: boolean;
  /** The last seven days, oldest first, ending today. */
  week: StreakDay[];
}

export function computeStreak(finishedAt: readonly number[], now: number): StreakInfo {
  const today = dayKey(now);
  const played = new Set<string>();
  for (const timestamp of finishedAt) {
    const key = dayKey(timestamp);
    if (key <= today) played.add(key);
  }

  const playedToday = played.has(today);

  let current = 0;
  for (let key = playedToday ? today : addDays(today, -1); played.has(key); key = addDays(key, -1)) current += 1;

  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const key of [...played].sort()) {
    run = previous !== null && addDays(previous, 1) === key ? run + 1 : 1;
    best = Math.max(best, run);
    previous = key;
  }

  const week = Array.from({ length: 7 }, (_, index) => {
    const key = addDays(today, index - 6);
    return { key, played: played.has(key), today: key === today };
  });

  return { current, best, playedToday, atRisk: current > 0 && !playedToday, week };
}
