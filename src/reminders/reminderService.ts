import { planReminders, reminderVariant } from '@/domain/reminder';
import { t } from '@/i18n';
import { reminderPermission, remindersSupported, replaceReminders } from '@/platform/reminders';
import { useProgressStore } from '@/state/progressStore';
import { useSettingsStore } from '@/state/settingsStore';

const BODIES = ['reminder.body.1', 'reminder.body.2', 'reminder.body.3'] as const;

/**
 * Re-plans the scheduled reminders from the current settings and today's play: the next seven days
 * at the chosen time, without today once the player has played. Cheap and idempotent — call it on
 * app start, on resume, after every round and after any reminder setting changes.
 */
export async function syncReminders(): Promise<void> {
  if (!remindersSupported()) return;
  const { reminderEnabled, reminderTime } = useSettingsStore.getState();
  const plan = reminderEnabled ? planReminders(Date.now(), reminderTime, useProgressStore.getState().streak.playedToday) : [];
  await replaceReminders(
    plan.map((at) => ({ at, title: t('reminder.title'), body: t(BODIES[reminderVariant(at, BODIES.length)]!) })),
    t('reminder.channel'),
  );
}

export type ReminderSwitchResult = 'ok' | 'denied' | 'unsupported';

/** Turns the reminder on (asking for the notification permission first) or off. */
export async function switchReminder(on: boolean): Promise<ReminderSwitchResult> {
  if (!remindersSupported()) return 'unsupported';
  if (on && (await reminderPermission(true)) !== 'granted') return 'denied';
  await useSettingsStore.getState().setReminderEnabled(on);
  await syncReminders();
  return 'ok';
}

export async function changeReminderTime(time: string): Promise<void> {
  await useSettingsStore.getState().setReminderTime(time);
  await syncReminders();
}
