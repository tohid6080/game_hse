import { Pencil, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { levelFromXp, rankTierForLevel } from '@/domain/levels';
import { t } from '@/i18n';
import { useProfileStore } from '@/state/profileStore';
import { repos } from '@/storage/repositories';
import { Button, Card, Tag } from '@/ui';
import { Avatar } from './avatars';
import { ProfileEditor } from './ProfileEditor';
import styles from './ProfileManager.module.css';

type Mode = { kind: 'list' } | { kind: 'edit'; id: string } | { kind: 'create' };

/** Lists, switches, edits, adds and deletes the local profiles (Settings → پروفایل). */
export function ProfileManager() {
  const profiles = useProfileStore((state) => state.profiles);
  const activeId = useProfileStore((state) => state.activeId);
  const { create, update, remove, setActive } = useProfileStore.getState();

  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [xpById, setXpById] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      profiles.map(async (profile) => [profile.id, await repos().attempts.totalXp(profile.id).catch(() => 0)] as const),
    ).then((entries) => {
      if (!cancelled) setXpById(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [profiles]);

  const editing = mode.kind === 'edit' ? profiles.find((profile) => profile.id === mode.id) : undefined;

  if (mode.kind === 'create') {
    return (
      <Card>
        <ProfileEditor
          otherNames={profiles.map((profile) => profile.nickname)}
          onCancel={() => setMode({ kind: 'list' })}
          onSave={async (values) => {
            await create(values);
            setMode({ kind: 'list' });
          }}
        />
      </Card>
    );
  }

  if (editing) {
    return (
      <Card>
        <ProfileEditor
          profile={editing}
          otherNames={profiles.filter((other) => other.id !== editing.id).map((other) => other.nickname)}
          onCancel={() => setMode({ kind: 'list' })}
          onSave={async (values) => {
            await update(editing.id, values);
            setMode({ kind: 'list' });
          }}
          onDelete={async () => {
            await remove(editing.id);
            setMode({ kind: 'list' });
          }}
        />
      </Card>
    );
  }

  return (
    <div className={styles.list}>
      {profiles.map((profile) => {
        const level = levelFromXp(xpById[profile.id] ?? 0);
        const isActive = profile.id === activeId;
        return (
          <Card key={profile.id} tone={isActive ? 'accent' : 'default'}>
            <div className={styles.row}>
              <Avatar avatarId={profile.avatarId} size={48} />
              <div className={styles.info}>
                <span className={styles.name}>{profile.nickname}</span>
                <span className={styles.meta}>
                  {t('profile.levelShort', { level })} · {t(`rank.${rankTierForLevel(level)}`)}
                </span>
              </div>
              {isActive ? <Tag tone="primary">{t('profile.active')}</Tag> : null}
            </div>
            <div className={styles.actions}>
              {!isActive ? (
                <Button variant="secondary" onClick={() => void setActive(profile.id)}>
                  {t('profile.switchTo')}
                </Button>
              ) : null}
              <Button variant="ghost" onClick={() => setMode({ kind: 'edit', id: profile.id })}>
                <Pencil size={18} aria-hidden="true" />
                {t('profile.edit')}
              </Button>
            </div>
          </Card>
        );
      })}
      <Button variant="secondary" onClick={() => setMode({ kind: 'create' })}>
        <Plus size={18} aria-hidden="true" />
        {t('profile.add')}
      </Button>
    </div>
  );
}
