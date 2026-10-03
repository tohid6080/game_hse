import { useState } from 'react';
import { parseReminderTime } from '@/domain/reminder';
import { t } from '@/i18n';
import { remindersSupported } from '@/platform/reminders';
import { useSettingsStore } from '@/state/settingsStore';
import { Card, Switch, TextField } from '@/ui';
import styles from './ReminderSection.module.css';
import { changeReminderTime, switchReminder } from './reminderService';

/** Settings section for the daily reminder. In a browser it explains that the reminder needs the app. */
export function ReminderSection() {
  const enabled = useSettingsStore((state) => state.reminderEnabled);
  const time = useSettingsStore((state) => state.reminderTime);
  const [denied, setDenied] = useState(false);
  const supported = remindersSupported();
  const on = enabled && supported;

  async function toggle(next: boolean) {
    setDenied(false);
    setDenied((await switchReminder(next)) === 'denied');
  }

  return (
    <Card>
      <div className={styles.stack}>
        <Switch
          label={t('reminder.switch')}
          description={supported ? t('reminder.desc') : t('reminder.unsupported')}
          checked={on}
          disabled={!supported}
          onChange={(next) => void toggle(next)}
        />
        {on ? (
          <TextField
            label={t('reminder.time')}
            type="time"
            dir="ltr"
            value={time}
            onChange={(event) => {
              // A half-edited or cleared field is not a time; keep the last valid one.
              if (parseReminderTime(event.target.value)) void changeReminderTime(event.target.value);
            }}
          />
        ) : null}
        {denied ? (
          <p className={styles.error} role="alert">
            {t('reminder.denied')}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
