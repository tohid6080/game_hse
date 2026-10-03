import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES, useSettingsStore } from '@/state/settingsStore';
import { useProgressStore } from '@/state/progressStore';
import { computeStreak } from '@/domain/streak';

const platform = vi.hoisted(() => ({
  supported: true,
  permission: 'granted' as 'granted' | 'denied' | 'unsupported',
  replaceReminders: vi.fn(async () => true),
}));

vi.mock('@/platform/reminders', () => ({
  remindersSupported: () => platform.supported,
  reminderPermission: async () => platform.permission,
  replaceReminders: platform.replaceReminders,
}));

import { changeReminderTime, switchReminder, syncReminders } from './reminderService';

const NOW = new Date(2026, 5, 15, 9, 0).getTime();

function played(playedToday: boolean) {
  const at = playedToday ? NOW - 60_000 : NOW - 2 * 86_400_000;
  useProgressStore.setState({ streak: computeStreak([at], NOW) });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  platform.supported = true;
  platform.permission = 'granted';
  platform.replaceReminders.mockClear();
  useSettingsStore.setState({ ...DEFAULT_PREFERENCES, reminderEnabled: true, reminderTime: '19:00' });
  played(false);
});

afterEach(() => vi.useRealTimers());

const lastPlan = () => {
  const call = platform.replaceReminders.mock.calls.at(-1) as unknown as [Array<{ at: Date; title: string; body: string }>, string];
  return call[0];
};

describe('syncReminders', () => {
  it('schedules the next seven evenings with a Persian title and a rotating body', async () => {
    await syncReminders();
    const plan = lastPlan();
    expect(plan).toHaveLength(7);
    expect(plan[0]!.at).toEqual(new Date(2026, 5, 15, 19, 0));
    expect(plan.every((reminder) => reminder.title.length > 0 && reminder.body.length > 0)).toBe(true);
    expect(new Set(plan.map((reminder) => reminder.body)).size).toBeGreaterThan(1);
  });

  it('drops today once the player has played, and keeps the other days', async () => {
    played(true);
    await syncReminders();
    const plan = lastPlan();
    expect(plan).toHaveLength(6);
    expect(plan[0]!.at).toEqual(new Date(2026, 5, 16, 19, 0));
  });

  it('cancels everything when the reminder is off', async () => {
    useSettingsStore.setState({ reminderEnabled: false });
    await syncReminders();
    expect(lastPlan()).toEqual([]);
  });

  it('does nothing outside the Android app', async () => {
    platform.supported = false;
    await syncReminders();
    expect(platform.replaceReminders).not.toHaveBeenCalled();
  });
});

describe('switchReminder', () => {
  it('asks for permission, turns the reminder on and schedules', async () => {
    useSettingsStore.setState({ reminderEnabled: false });
    expect(await switchReminder(true)).toBe('ok');
    expect(useSettingsStore.getState().reminderEnabled).toBe(true);
    expect(lastPlan()).toHaveLength(7);
  });

  it('stays off when the permission is refused', async () => {
    useSettingsStore.setState({ reminderEnabled: false });
    platform.permission = 'denied';
    expect(await switchReminder(true)).toBe('denied');
    expect(useSettingsStore.getState().reminderEnabled).toBe(false);
    expect(platform.replaceReminders).not.toHaveBeenCalled();
  });

  it('turns off and cancels without asking for anything', async () => {
    platform.permission = 'denied';
    expect(await switchReminder(false)).toBe('ok');
    expect(useSettingsStore.getState().reminderEnabled).toBe(false);
    expect(lastPlan()).toEqual([]);
  });

  it('reports "unsupported" in a browser', async () => {
    platform.supported = false;
    expect(await switchReminder(true)).toBe('unsupported');
    expect(useSettingsStore.getState().reminderEnabled).toBe(true); // untouched
  });
});

describe('changeReminderTime', () => {
  it('saves the time and reschedules at it', async () => {
    await changeReminderTime('07:30');
    expect(useSettingsStore.getState().reminderTime).toBe('07:30');
    expect(lastPlan()[0]!.at).toEqual(new Date(2026, 5, 16, 7, 30));
  });
});
