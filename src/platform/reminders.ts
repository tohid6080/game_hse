import { LocalNotifications } from '@capacitor/local-notifications';
import { isNative } from './native';

/** Notification ids used by the daily reminder: a fixed block, so replacing is "cancel the block". */
const FIRST_ID = 7001;
const CHANNEL_ID = 'daily-reminder';
/** Drawable in android/app/src/main/res/drawable and capacitor.config.ts. */
const SMALL_ICON = 'ic_stat_separ';

export type ReminderPermission = 'granted' | 'denied' | 'unsupported';

/** Scheduled notifications exist only in the Android app; the browser build has none. */
export function remindersSupported(): boolean {
  return isNative();
}

/**
 * Current notification permission. With `ask` the system dialog is shown when the permission is
 * still undecided (Android 13+); without it nothing is ever prompted.
 */
export async function reminderPermission(ask: boolean): Promise<ReminderPermission> {
  if (!isNative()) return 'unsupported';
  try {
    let status = await LocalNotifications.checkPermissions();
    if (ask && (status.display === 'prompt' || status.display === 'prompt-with-rationale')) {
      status = await LocalNotifications.requestPermissions();
    }
    return status.display === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

export interface PlannedReminder {
  at: Date;
  title: string;
  body: string;
}

/**
 * Replaces every reminder we scheduled before with `plan` (an empty plan just cancels). Returns false
 * when scheduling failed or is unsupported.
 */
export async function replaceReminders(plan: readonly PlannedReminder[], channelName: string): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map((notification) => ({ id: notification.id })) });
    }
    if (plan.length === 0) return true;
    await LocalNotifications.createChannel({ id: CHANNEL_ID, name: channelName, importance: 3 });
    await LocalNotifications.schedule({
      notifications: plan.map((reminder, index) => ({
        id: FIRST_ID + index,
        title: reminder.title,
        body: reminder.body,
        channelId: CHANNEL_ID,
        smallIcon: SMALL_ICON,
        // MUST stay false. The plugin's default is an exact alarm, and on Android 12+ it then opens the
        // system "Alarms & reminders" settings screen on every schedule() — a permission this app
        // deliberately does not declare (AndroidManifest removes SCHEDULE_EXACT_ALARM), so the player
        // could never grant it and, since schedule() also runs on every resume, got sent back to that
        // screen again and again. A few minutes' drift is fine for a daily reminder.
        isExactNotification: false,
        schedule: { at: reminder.at, allowWhileIdle: true },
      })),
    });
    return true;
  } catch {
    return false;
  }
}
