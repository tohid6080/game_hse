import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES, useSettingsStore } from '@/state/settingsStore';
import { useProgressStore } from '@/state/progressStore';
import { computeStreak } from '@/domain/streak';

type Permission = 'granted' | 'denied' | 'unsupported';

const platform = vi.hoisted(() => {
  const state: {
    supported: boolean;
    permission: Permission;
    replaceReminders: ReturnType<typeof vi.fn<(plan: unknown, channel: unknown) => Promise<boolean>>>;
    reminderPermission: ReturnType<typeof vi.fn<(ask: boolean) => Promise<Permission>>>;
  } = {
    supported: true,
    permission: 'granted',
    replaceReminders: vi.fn<(plan: unknown, channel: unknown) => Promise<boolean>>(async () => true),
    reminderPermission: vi.fn<(ask: boolean) => Promise<Permission>>(async () => state.permission),
  };
  return state;
});

vi.mock('@/platform/reminders', () => ({
  remindersSupported: () => platform.supported,
  reminderPermission: platform.reminderPermission,
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
  platform.reminderPermission.mockClear();
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

  it('never asks for a permission: it runs on every resume, and a prompt there would loop', async () => {
    await syncReminders();
    expect(platform.reminderPermission).toHaveBeenCalledWith(false);
    expect(platform.reminderPermission).not.toHaveBeenCalledWith(true);
  });

  it('schedules nothing, and clears what was pending, once the notification permission is gone', async () => {
    platform.permission = 'denied';
    await syncReminders();
    expect(lastPlan()).toEqual([]);
  });

  it('runs one pass at a time, in the order they were asked for', async () => {
    const events: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    platform.replaceReminders.mockImplementation(async (plan: unknown) => {
      const size = (plan as unknown[]).length;
      events.push(`start ${size}`);
      if (size === 7) await gate; // the first pass is held here until the test lets it go
      events.push(`end ${size}`);
      return true;
    });
    const first = syncReminders();
    await vi.waitFor(() => expect(events).toEqual(['start 7']));
    useSettingsStore.setState({ reminderEnabled: false }); // changed while the first pass is still running
    const second = syncReminders();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(events).toEqual(['start 7']); // the second pass is waiting, not running alongside
    release();
    await Promise.all([first, second]);
    // the second pass starts only after the first has finished, and plans from the settings as they are then
    expect(events).toEqual(['start 7', 'end 7', 'start 0', 'end 0']);
    platform.replaceReminders.mockImplementation(async () => true);
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
