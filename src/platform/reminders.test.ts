import { beforeEach, describe, expect, it, vi } from 'vitest';

const plugin = vi.hoisted(() => ({
  getPending: vi.fn(async () => ({ notifications: [] as Array<{ id: number }> })),
  cancel: vi.fn<(options: unknown) => Promise<undefined>>(async () => undefined),
  createChannel: vi.fn<(channel: unknown) => Promise<undefined>>(async () => undefined),
  schedule: vi.fn<(options: unknown) => Promise<{ notifications: unknown[] }>>(async () => ({ notifications: [] })),
  checkPermissions: vi.fn(async () => ({ display: 'granted' as string })),
  requestPermissions: vi.fn(async () => ({ display: 'granted' as string })),
  // Opens the system "Alarms & reminders" screen. This app has no business ever calling it.
  changeExactNotificationSetting: vi.fn(async () => ({ exact_alarm: 'denied' })),
}));

vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: plugin }));
vi.mock('./native', () => ({ isNative: () => true }));

import { reminderPermission, replaceReminders } from './reminders';

const at = (day: number) => new Date(2026, 5, day, 19, 0);
const plan = [
  { at: at(15), title: 't', body: 'b1' },
  { at: at(16), title: 't', body: 'b2' },
];

beforeEach(() => {
  for (const mock of Object.values(plugin)) mock.mockClear();
  plugin.getPending.mockResolvedValue({ notifications: [] });
  plugin.schedule.mockResolvedValue({ notifications: [] });
  plugin.checkPermissions.mockResolvedValue({ display: 'granted' });
});

type Scheduled = { id: number; schedule: { at: Date; allowWhileIdle: boolean }; isExactNotification?: boolean; isExactMandatory?: boolean };
const scheduled = (): Scheduled[] => (plugin.schedule.mock.calls[0]![0] as { notifications: Scheduled[] }).notifications;

describe('replaceReminders', () => {
  it('schedules every reminder as an inexact alarm, so Android never sends the player to the "Alarms & reminders" screen', async () => {
    // Regression: the plugin's default is an EXACT alarm, which on Android 12+ opens that system screen on every
    // schedule() — for a permission the app does not declare — and, since this runs on resume, in a loop.
    expect(await replaceReminders(plan, 'channel')).toBe(true);
    const notifications = scheduled();
    expect(notifications).toHaveLength(2);
    for (const notification of notifications) {
      expect(notification.isExactNotification).toBe(false);
      expect(notification.isExactMandatory).toBeUndefined();
    }
    expect(plugin.changeExactNotificationSetting).not.toHaveBeenCalled();
  });

  it('numbers them from a fixed id, at the planned times, allowed to fire while the phone dozes', async () => {
    await replaceReminders(plan, 'channel');
    const notifications = scheduled();
    expect(notifications.map((notification) => notification.id)).toEqual([7001, 7002]);
    expect(notifications.map((notification) => notification.schedule.at)).toEqual([at(15), at(16)]);
    expect(notifications.every((notification) => notification.schedule.allowWhileIdle)).toBe(true);
    expect(plugin.createChannel).toHaveBeenCalledOnce();
  });

  it('cancels what was pending before scheduling the new plan', async () => {
    plugin.getPending.mockResolvedValue({ notifications: [{ id: 7001 }, { id: 7002 }, { id: 7003 }] });
    await replaceReminders(plan, 'channel');
    expect(plugin.cancel).toHaveBeenCalledWith({ notifications: [{ id: 7001 }, { id: 7002 }, { id: 7003 }] });
    expect(plugin.cancel.mock.invocationCallOrder[0]!).toBeLessThan(plugin.schedule.mock.invocationCallOrder[0]!);
  });

  it('an empty plan only cancels', async () => {
    plugin.getPending.mockResolvedValue({ notifications: [{ id: 7001 }] });
    expect(await replaceReminders([], 'channel')).toBe(true);
    expect(plugin.cancel).toHaveBeenCalledOnce();
    expect(plugin.createChannel).not.toHaveBeenCalled();
    expect(plugin.schedule).not.toHaveBeenCalled();
  });

  it('reports failure instead of throwing when the plugin refuses', async () => {
    plugin.schedule.mockRejectedValue(new Error('boom'));
    expect(await replaceReminders(plan, 'channel')).toBe(false);
  });
});

describe('reminderPermission', () => {
  it('only asks when told to, and only while the answer is still open', async () => {
    plugin.checkPermissions.mockResolvedValue({ display: 'prompt' });
    expect(await reminderPermission(false)).toBe('denied');
    expect(plugin.requestPermissions).not.toHaveBeenCalled();

    plugin.requestPermissions.mockResolvedValue({ display: 'granted' });
    expect(await reminderPermission(true)).toBe('granted');
    expect(plugin.requestPermissions).toHaveBeenCalledOnce();
  });

  it('does not ask again once the answer is a refusal', async () => {
    plugin.checkPermissions.mockResolvedValue({ display: 'denied' });
    expect(await reminderPermission(true)).toBe('denied');
    expect(plugin.requestPermissions).not.toHaveBeenCalled();
  });
});
