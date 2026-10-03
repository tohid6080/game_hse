import { addDays, dayKey } from './streak';

/**
 * Daily reminder planning. The app can't run code at notification time (it is offline and often not
 * running), so instead of one repeating notification it schedules the next few days and re-plans
 * every time the app opens or a round ends — which lets it drop today's reminder once the player
 * has already played.
 */

/** How many days ahead are scheduled. A phone left untouched this long just stops reminding. */
export const REMINDER_DAYS = 7;
export const DEFAULT_REMINDER_TIME = '19:00';
/** A time this close to "now" is treated as passed (the alarm would fire before we return). */
const MIN_LEAD_MS = 60_000;

/** "HH:mm" → hour and minute, or null when it is not a valid 24-hour time. */
export function parseReminderTime(text: string): { hour: number; minute: number } | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text);
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
}

/**
 * The moments to remind, oldest first: `time` on each of the next `days` days, minus moments that
 * have passed, and minus today when the player already played (`playedToday`).
 */
export function planReminders(now: number, time: string, playedToday: boolean, days = REMINDER_DAYS): Date[] {
  const parsed = parseReminderTime(time);
  if (!parsed) return [];
  const today = dayKey(now);
  const plan: Date[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    if (offset === 0 && playedToday) continue;
    const [year, month, day] = addDays(today, offset).split('-').map(Number) as [number, number, number];
    const moment = new Date(year, month - 1, day, parsed.hour, parsed.minute, 0, 0);
    if (moment.getTime() - now >= MIN_LEAD_MS) plan.push(moment);
  }
  return plan;
}

/** Which of the rotating message variants a reminder uses (stable per date, varied day to day). */
export function reminderVariant(moment: Date, variants: number): number {
  const key = dayKey(moment.getTime());
  const [year, month, day] = key.split('-').map(Number) as [number, number, number];
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000) % variants;
}
