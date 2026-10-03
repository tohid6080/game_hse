import { describe, expect, it } from 'vitest';
import { REMINDER_DAYS, parseReminderTime, planReminders, reminderVariant } from './reminder';

const at = (month: number, day: number, hour: number, minute = 0) => new Date(2026, month - 1, day, hour, minute).getTime();

describe('parseReminderTime', () => {
  it('reads 24-hour HH:mm and nothing else', () => {
    expect(parseReminderTime('19:00')).toEqual({ hour: 19, minute: 0 });
    expect(parseReminderTime('00:05')).toEqual({ hour: 0, minute: 5 });
    expect(parseReminderTime('23:59')).toEqual({ hour: 23, minute: 59 });
    for (const bad of ['', '7:00', '24:00', '19:60', '19-00', '19:00:00', 'ab:cd', ' 19:00']) expect(parseReminderTime(bad), bad).toBeNull();
  });
});

describe('planReminders', () => {
  it('schedules the chosen time on each of the next seven days, starting today when it is still ahead', () => {
    const plan = planReminders(at(6, 15, 9), '19:00', false);
    expect(plan).toHaveLength(REMINDER_DAYS);
    expect(plan[0]).toEqual(new Date(2026, 5, 15, 19, 0));
    expect(plan[6]).toEqual(new Date(2026, 5, 21, 19, 0));
  });

  it('skips today when the time has passed already', () => {
    const plan = planReminders(at(6, 15, 20), '19:00', false);
    expect(plan).toHaveLength(REMINDER_DAYS - 1);
    expect(plan[0]).toEqual(new Date(2026, 5, 16, 19, 0));
  });

  it('skips today when the player already played, but keeps tomorrow on', () => {
    const plan = planReminders(at(6, 15, 9), '19:00', true);
    expect(plan[0]).toEqual(new Date(2026, 5, 16, 19, 0));
    expect(plan).toHaveLength(REMINDER_DAYS - 1);
  });

  it('treats a time within a minute as passed', () => {
    expect(planReminders(at(6, 15, 18, 59) + 30_000, '19:00', false)[0]).toEqual(new Date(2026, 5, 16, 19, 0));
    expect(planReminders(at(6, 15, 18, 58), '19:00', false)[0]).toEqual(new Date(2026, 5, 15, 19, 0));
  });

  it('crosses month and year ends', () => {
    const plan = planReminders(at(12, 29, 8), '07:30', false, 5);
    expect(plan.map((moment) => `${moment.getFullYear()}-${moment.getMonth() + 1}-${moment.getDate()}`)).toEqual(['2026-12-30', '2026-12-31', '2027-1-1', '2027-1-2']);
  });

  it('plans nothing for an invalid time', () => {
    expect(planReminders(at(6, 15, 9), 'soon', false)).toEqual([]);
  });

  it('is in ascending order', () => {
    const plan = planReminders(at(6, 15, 9), '08:00', false);
    expect(plan.map((moment) => moment.getTime())).toEqual([...plan.map((moment) => moment.getTime())].sort((a, b) => a - b));
  });
});

describe('reminderVariant', () => {
  it('is stable for a date and changes from day to day', () => {
    const a = reminderVariant(new Date(2026, 5, 15, 19), 3);
    expect(reminderVariant(new Date(2026, 5, 15, 7), 3)).toBe(a);
    expect(reminderVariant(new Date(2026, 5, 16, 19), 3)).not.toBe(a);
    for (let day = 1; day <= 10; day += 1) expect(reminderVariant(new Date(2026, 5, day), 3)).toBeLessThan(3);
  });
});
