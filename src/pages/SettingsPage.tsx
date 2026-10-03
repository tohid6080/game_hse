import { FlaskConical, Info, Lock, Scale } from 'lucide-react';
import { BackupSection } from '@/backup/BackupSection';
import { FeedbackSection } from '@/feedback/FeedbackSection';
import { t } from '@/i18n';
import { ReminderSection } from '@/reminders/ReminderSection';
import { ProfileManager } from '@/profile/ProfileManager';
import { useProfileStore } from '@/state/profileStore';
import { useSettingsStore } from '@/state/settingsStore';
import type { ThemePref } from '@/storage/db';
import { Card, PageHeader, Segmented, Switch } from '@/ui';
import styles from './pages.module.css';

export function SettingsPage() {
  const theme = useSettingsStore((state) => state.theme);
  const timedMode = useSettingsStore((state) => state.timedMode);
  const settingsError = useSettingsStore((state) => state.storageError);
  const profileError = useProfileStore((state) => state.storageError);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setTimedMode = useSettingsStore((state) => state.setTimedMode);

  const themeOptions: ReadonlyArray<{ value: ThemePref; label: string }> = [
    { value: 'system', label: t('settings.theme.system') },
    { value: 'light', label: t('settings.theme.light') },
    { value: 'dark', label: t('settings.theme.dark') },
  ];

  return (
    <div className={styles.page}>
      <PageHeader title={t('settings.title')} />

      {settingsError || profileError ? (
        <Card tone="muted" className={styles.notice} role="alert">
          {t('settings.storageError')}
        </Card>
      ) : null}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('settings.profiles')}</h2>
        <ProfileManager />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('settings.quiz')}</h2>
        <Card>
          <Switch
            label={t('settings.timedMode')}
            description={t('settings.timedModeDesc')}
            checked={timedMode}
            onChange={(value) => void setTimedMode(value)}
          />
        </Card>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('feedback.section')}</h2>
        <FeedbackSection />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('settings.appearance')}</h2>
        <Card>
          <div className={styles.stack}>
            <span className={styles.strong}>{t('settings.theme')}</span>
            <Segmented
              label={t('settings.theme')}
              options={themeOptions}
              value={theme}
              onChange={(value) => void setTheme(value)}
            />
          </div>
        </Card>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('reminder.section')}</h2>
        <ReminderSection />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('backup.title')}</h2>
        <BackupSection />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('settings.privacy')}</h2>
        <Card>
          <div className={styles.iconRow}>
            <Lock size={22} aria-hidden="true" />
            <p>{t('settings.privacyBody')}</p>
          </div>
        </Card>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('settings.about')}</h2>
        <Card>
          <div className={styles.stack}>
            <div className={styles.iconRow}>
              <Info size={22} aria-hidden="true" />
              <div>
                <p className={styles.strong}>
                  {t('app.name')} · {t('app.subtitle')}
                </p>
                <p className={styles.muted}>{t('settings.version', { version: __APP_VERSION__ })}</p>
              </div>
            </div>
            <div className={styles.iconRow}>
              <Scale size={22} aria-hidden="true" />
              <div>
                <p className={styles.strong}>{t('settings.disclaimer')}</p>
                <p className={styles.muted}>{t('settings.disclaimerBody')}</p>
              </div>
            </div>
            {__CONTENT_UNREVIEWED__ ? (
              <div className={styles.iconRow} data-testid="unreviewed-notice">
                <FlaskConical size={22} aria-hidden="true" />
                <p className={styles.muted}>{t('settings.unreviewed')}</p>
              </div>
            ) : null}
          </div>
        </Card>
      </section>
    </div>
  );
}
