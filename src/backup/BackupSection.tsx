import { Download } from 'lucide-react';
import { useState } from 'react';
import { dayKey } from '@/domain/streak';
import { t } from '@/i18n';
import { saveAndShareFile, type ExportResult } from '@/platform/fileExport';
import { createBackup, serializeBackup } from '@/storage/backup';
import { repos } from '@/storage/repositories';
import { Button, Card } from '@/ui';
import styles from './Backup.module.css';
import { RestoreControl } from './RestoreControl';

const EXPORT_MESSAGE: Record<ExportResult, 'backup.exported.shared' | 'backup.exported.downloaded' | 'backup.exported.cancelled' | 'backup.exported.failed'> = {
  shared: 'backup.exported.shared',
  downloaded: 'backup.exported.downloaded',
  cancelled: 'backup.exported.cancelled',
  failed: 'backup.exported.failed',
};

/** Settings section: make a backup file, or restore one. */
export function BackupSection() {
  const [result, setResult] = useState<ExportResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function exportNow() {
    setBusy(true);
    setResult(null);
    try {
      const now = Date.now();
      const file = await createBackup(await repos().backup.readAll(), { appVersion: __APP_VERSION__, exportedAt: now });
      setResult(await saveAndShareFile(`hse-quest-backup-${dayKey(now)}.json`, serializeBackup(file), t('backup.shareTitle')));
    } catch {
      setResult('failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className={styles.section}>
        <p className={styles.muted}>{t('backup.body')}</p>
        <Button disabled={busy} onClick={() => void exportNow()}>
          <Download size={18} aria-hidden="true" />
          {busy ? t('backup.busy') : t('backup.export')}
        </Button>
        {result ? (
          <p className={result === 'failed' ? styles.error : styles.ok} role={result === 'failed' ? 'alert' : 'status'}>
            {t(EXPORT_MESSAGE[result])}
          </p>
        ) : null}
        <RestoreControl label={t('backup.import')} />
      </div>
    </Card>
  );
}
