import { useState, type FormEvent } from 'react';
import { t } from '@/i18n';
import type { ProfileRow } from '@/storage/db';
import type { NewProfile } from '@/storage/repositories';
import { Button, ConfirmDialog } from '@/ui';
import { DEFAULT_AVATAR_ID } from './avatars';
import { ProfileFields, type ProfileDraft } from './ProfileFields';
import styles from './ProfileEditor.module.css';
import { normalizeNickname, validateNickname } from './validation';

interface ProfileEditorProps {
  /** Present when editing; absent when creating a new profile. */
  profile?: ProfileRow;
  /** Nicknames of the *other* profiles (for the uniqueness check). */
  otherNames: readonly string[];
  onSave: (values: NewProfile) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}

/** Explicit-commit form: nothing is saved until "ذخیره" is pressed. */
export function ProfileEditor({ profile, otherNames, onSave, onCancel, onDelete }: ProfileEditorProps) {
  const [draft, setDraft] = useState<ProfileDraft>({
    nickname: profile?.nickname ?? '',
    avatarId: profile?.avatarId ?? DEFAULT_AVATAR_ID,
    industry: profile?.industry ?? 'general',
    experience: profile?.experience ?? 'beginner',
  });
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const nicknameKey = validateNickname(draft.nickname, otherNames);
  const nicknameError = showErrors && nicknameKey ? t(nicknameKey) : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (nicknameKey) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...draft, nickname: normalizeNickname(draft.nickname) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <ProfileFields
        part="all"
        draft={draft}
        nicknameError={nicknameError}
        onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        autoFocus
      />
      <div className={styles.actions}>
        <Button type="submit" disabled={saving}>
          {t('profile.save')}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          {t('profile.cancel')}
        </Button>
        {onDelete ? (
          <Button variant="danger" onClick={() => setConfirmingDelete(true)} disabled={saving}>
            {t('profile.delete')}
          </Button>
        ) : null}
      </div>

      {onDelete && profile ? (
        <ConfirmDialog
          open={confirmingDelete}
          danger
          title={t('profile.deleteTitle', { name: profile.nickname })}
          body={t('profile.deleteBody')}
          confirmLabel={t('profile.deleteConfirm')}
          cancelLabel={t('profile.cancel')}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false);
            void onDelete();
          }}
        />
      ) : null}
    </form>
  );
}
