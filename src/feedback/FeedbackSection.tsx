import { t } from '@/i18n';
import { useSettingsStore } from '@/state/settingsStore';
import { Card, Switch } from '@/ui';
import { feedback } from './feedback';
import styles from './FeedbackSection.module.css';

/** Settings: sound effects (off by default) and vibration (on by default). */
export function FeedbackSection() {
  const soundEnabled = useSettingsStore((state) => state.soundEnabled);
  const hapticsEnabled = useSettingsStore((state) => state.hapticsEnabled);
  const { setSoundEnabled, setHapticsEnabled } = useSettingsStore.getState();

  return (
    <Card>
      <div className={styles.stack}>
        <Switch
          label={t('feedback.sound')}
          description={t('feedback.soundDesc')}
          checked={soundEnabled}
          onChange={(next) => {
            void setSoundEnabled(next);
            // The switch is a user gesture, so this is also what lets the browser play sound later.
            if (next) feedback('preview');
          }}
        />
        <Switch
          label={t('feedback.haptics')}
          description={t('feedback.hapticsDesc')}
          checked={hapticsEnabled}
          onChange={(next) => {
            void setHapticsEnabled(next);
            if (next) feedback('preview');
          }}
        />
      </div>
    </Card>
  );
}
