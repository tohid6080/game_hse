import { planReminders, reminderVariant } from '@/domain/reminder';
import { t } from '@/i18n';
import { reminderPermission, remindersSupported, replaceReminders } from '@/platform/reminders';
import { useProgressStore } from '@/state/progressStore';
import { useSettingsStore } from '@/state/settingsStore';

const BODIES = ['reminder.body.1', 'reminder.body.2', 'reminder.body.3'] as const;

/** The pass in progress (or the last one). Passes run one after another, never overlapping. */
let queue: Promise<void> = Promise.resolve();
const ignore = (): void => undefined;

/**
 * Re-plans the scheduled reminders from the current settings and today's play: the next seven days
 * at the chosen time, without today once the player has played. Cheap and idempotent — call it on
 * app start, on resume, after every round and after any reminder setting changes.
 *
 * App start, resume and the end of a round can fire together, and two overlapping "cancel everything,
 * schedule seven" passes would trample each other; so they are queued.
 */
export function syncReminders(): Promise<void> {
  const run = queue.then(replan);
  queue = run.then(ignore, ignore);
  return run;
}

async function replan(): Promise<void> {
  if (!remindersSupported()) return;
  const { reminderEnabled, reminderTime } = useSettingsStore.getState();
  let plan = reminderEnabled ? planReminders(Date.now(), reminderTime, useProgressStore.getState().streak.playedToday) : [];
  // This runs on every resume, so it must never ask for anything: if the notification permission has been
  // taken away since the player turned the reminder on, schedule nothing (and clear what is pending).
  if (plan.length > 0 && (await reminderPermission(false)) !== 'granted') plan = [];
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
