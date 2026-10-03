import { Lock, ShieldCheck, Target, Timer } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { RestoreControl } from '@/backup/RestoreControl';
import { t } from '@/i18n';
import { useProfileStore } from '@/state/profileStore';
import { Button } from '@/ui';
import { DEFAULT_AVATAR_ID } from './avatars';
import styles from './Onboarding.module.css';
import { ProfileFields, type ProfileDraft } from './ProfileFields';
import { normalizeNickname, validateNickname } from './validation';

const STEPS = 3;

/** First-run flow: welcome → who you are → where you work. Nothing is saved until the last step. */
export function Onboarding() {
  const profiles = useProfileStore((state) => state.profiles);
  const create = useProfileStore((state) => state.create);

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ProfileDraft>({
    nickname: '',
    avatarId: DEFAULT_AVATAR_ID,
    industry: 'general',
    experience: 'beginner',
  });
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);

  const nicknameKey = validateNickname(
    draft.nickname,
    profiles.map((profile) => profile.nickname),
  );
  const nicknameError = showErrors && nicknameKey ? t(nicknameKey) : null;
  const patch = (changes: Partial<ProfileDraft>) => setDraft((current) => ({ ...current, ...changes }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (step === 0) {
      setStep(1);
      return;
    }
    if (step === 1) {
      if (nicknameKey) {
        setShowErrors(true);
        return;
      }
      setStep(2);
      return;
    }
    setSaving(true);
    try {
      await create({ ...draft, nickname: normalizeNickname(draft.nickname) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className={styles.screen}>
      <form className={styles.card} onSubmit={handleSubmit} noValidate>
        <div className={styles.progress} role="img" aria-label={t('onboarding.step', { current: step + 1, total: STEPS })}>
          {Array.from({ length: STEPS }, (_, index) => (
            <span key={index} className={index <= step ? styles.dotOn : styles.dot} />
          ))}
        </div>

        {step === 0 ? (
          <div className={styles.body}>
            <span className={styles.logo} aria-hidden="true">
              <ShieldCheck size={44} />
            </span>
            <h1 className={styles.title}>{t('onboarding.welcomeTitle')}</h1>
            <p className={styles.lead}>{t('onboarding.welcomeBody')}</p>
            <ul className={styles.points}>
              <li>
                <Timer size={22} aria-hidden="true" />
                {t('onboarding.point1')}
              </li>
              <li>
                <Target size={22} aria-hidden="true" />
                {t('onboarding.point2')}
              </li>
              <li>
                <Lock size={22} aria-hidden="true" />
                {t('onboarding.point3')}
              </li>
            </ul>
          </div>
        ) : null}

        {step === 1 ? (
          <div className={styles.body}>
            <h1 className={styles.title}>{t('onboarding.identityTitle')}</h1>
            <ProfileFields part="identity" draft={draft} onChange={patch} nicknameError={nicknameError} autoFocus />
          </div>
        ) : null}

        {step === 2 ? (
          <div className={styles.body}>
            <h1 className={styles.title}>{t('onboarding.workTitle')}</h1>
            <ProfileFields part="work" draft={draft} onChange={patch} nicknameError={null} />
          </div>
        ) : null}

        <div className={styles.actions}>
          <Button type="submit" size="lg" fullWidth disabled={saving}>
            {step === 0 ? t('onboarding.start') : step === 1 ? t('onboarding.next') : t('onboarding.finish')}
          </Button>
          {step > 0 ? (
            <Button variant="ghost" fullWidth onClick={() => setStep(step - 1)} disabled={saving}>
              {t('onboarding.back')}
            </Button>
          ) : null}
          {step === 0 ? <RestoreControl label={t('backup.importFirstRun')} variant="ghost" /> : null}
        </div>
      </form>
    </main>
  );
}
