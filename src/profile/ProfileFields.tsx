import { INDUSTRIES, type IndustryId } from '@/domain/industries';
import { t } from '@/i18n';
import { EXPERIENCES, type Experience } from '@/storage/db';
import { Segmented, SelectField, TextField, cx } from '@/ui';
import { AVATARS, Avatar } from './avatars';
import styles from './ProfileFields.module.css';
import { NICKNAME_MAX } from './validation';

export interface ProfileDraft {
  nickname: string;
  avatarId: string;
  industry: IndustryId;
  experience: Experience;
}

interface ProfileFieldsProps {
  /** `identity`: nickname + avatar · `work`: industry + experience · `all`: everything. */
  part: 'identity' | 'work' | 'all';
  draft: ProfileDraft;
  onChange: (patch: Partial<ProfileDraft>) => void;
  nicknameError: string | null;
  autoFocus?: boolean;
}

export function ProfileFields({ part, draft, onChange, nicknameError, autoFocus }: ProfileFieldsProps) {
  const showIdentity = part !== 'work';
  const showWork = part !== 'identity';

  return (
    <div className={styles.fields}>
      {showIdentity ? (
        <>
          <TextField
            label={t('profile.nickname')}
            value={draft.nickname}
            maxLength={NICKNAME_MAX}
            autoComplete="off"
            autoFocus={autoFocus}
            error={nicknameError}
            onChange={(event) => onChange({ nickname: event.target.value })}
          />
          <div className={styles.group} role="radiogroup" aria-label={t('profile.avatar')}>
            <span className={styles.groupLabel}>{t('profile.avatar')}</span>
            <div className={styles.avatarGrid}>
              {AVATARS.map((avatar) => {
                const selected = draft.avatarId === avatar.id;
                return (
                  <button
                    key={avatar.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={t(`avatar.${avatar.id}`)}
                    className={cx(styles.avatarOption, selected && styles.avatarSelected)}
                    onClick={() => onChange({ avatarId: avatar.id })}
                  >
                    <Avatar avatarId={avatar.id} size={44} />
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : null}

      {showWork ? (
        <>
          <SelectField
            label={t('profile.industry')}
            hint={t('profile.industryHint')}
            value={draft.industry}
            options={INDUSTRIES.map((industry) => ({ value: industry, label: t(`industry.${industry}`) }))}
            onChange={(event) => onChange({ industry: event.target.value as IndustryId })}
          />
          <div className={styles.group}>
            <span className={styles.groupLabel}>{t('profile.experience')}</span>
            <Segmented
              label={t('profile.experience')}
              options={EXPERIENCES.map((experience) => ({ value: experience, label: t(`experience.${experience}`) }))}
              value={draft.experience}
              onChange={(experience) => onChange({ experience })}
            />
            <p className={styles.hint}>{t('profile.experienceHint')}</p>
          </div>
        </>
      ) : null}
    </div>
  );
}
