import { useRef, useState, type ChangeEvent } from 'react';
import { BACKUP_MAX_BYTES, parseBackup, planMerge, type BackupFile, type BackupProblem } from '@/storage/backup';
import { formatDate, formatNumber, t, type MessageKey } from '@/i18n';
import { useProfileStore } from '@/state/profileStore';
import { useProgressStore } from '@/state/progressStore';
import { repos } from '@/storage/repositories';
import { Button, ConfirmDialog } from '@/ui';
import styles from './Backup.module.css';

const PROBLEM_MESSAGE: Record<BackupProblem, MessageKey> = {
  'not-json': 'backup.error.notJson',
  'wrong-format': 'backup.error.wrongFormat',
  'newer-version': 'backup.error.newer',
  corrupt: 'backup.error.corrupt',
  invalid: 'backup.error.invalid',
};

interface RestoreControlProps {
  label: string;
  variant?: 'secondary' | 'ghost';
}

/**
 * Picks a backup file, verifies it, shows what it holds and — only after the player confirms —
 * merges it in. Used in Settings and on the first-run welcome screen (the new-phone case).
 */
export function RestoreControl({ label, variant = 'secondary' }: RestoreControlProps) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // picking the same file again must fire `change` again
    if (!file) return;
    setMessage(null);
    if (file.size > BACKUP_MAX_BYTES) {
      setMessage({ tone: 'error', text: t('backup.error.tooBig') });
      return;
    }
    setBusy(true);
    try {
      const parsed = await parseBackup(await file.text());
      if (parsed.ok) setPending(parsed.file);
      else setMessage({ tone: 'error', text: t(PROBLEM_MESSAGE[parsed.problem]) });
    } catch {
      setMessage({ tone: 'error', text: t('backup.error.failed') });
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!pending) return;
    const file = pending;
    setPending(null);
    setBusy(true);
    try {
      const plan = planMerge(await repos().backup.existing(), file.data);
      await repos().backup.applyMerge(plan);
      await useProfileStore.getState().load();
      await useProgressStore.getState().refresh(useProfileStore.getState().activeId);
      const { report } = plan;
      const parts =
        report.profilesAdded === 0 && report.attemptsAdded === 0
          ? [t('backup.nothingNew')]
          : [
              t('backup.done', { profiles: formatNumber(report.profilesAdded), attempts: formatNumber(report.attemptsAdded) }),
              ...(report.profilesRenamed > 0 ? [t('backup.renamed', { count: formatNumber(report.profilesRenamed) })] : []),
            ];
      setMessage({ tone: 'ok', text: parts.join(' ') });
    } catch {
      setMessage({ tone: 'error', text: t('backup.error.failed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.control}>
      <input
        ref={input}
        className={styles.file}
        type="file"
        accept=".json,application/json"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="backup-file"
        onChange={(event) => void onPick(event)}
      />
      <Button variant={variant} disabled={busy} onClick={() => input.current?.click()}>
        {busy ? t('backup.busy') : label}
      </Button>
      {message ? (
        <p className={message.tone === 'ok' ? styles.ok : styles.error} role={message.tone === 'ok' ? 'status' : 'alert'}>
          {message.text}
        </p>
      ) : null}

      <ConfirmDialog
        open={pending !== null}
        title={t('backup.confirm.title')}
        body={
          pending
            ? t('backup.confirm.body', {
                profiles: formatNumber(pending.data.profiles.length),
                attempts: formatNumber(pending.data.attempts.length),
                date: formatDate(pending.exportedAt, { dateStyle: 'medium' }),
              })
            : ''
        }
        confirmLabel={t('backup.confirm.yes')}
        cancelLabel={t('backup.confirm.no')}
        onCancel={() => setPending(null)}
        onConfirm={() => void confirm()}
      />
    </div>
  );
}
