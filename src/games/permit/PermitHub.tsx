import { FileCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { appliesToIndustry } from '@/domain/industries';
import { t } from '@/i18n';
import { selectActiveProfile, useProfileStore } from '@/state/profileStore';
import { Button, Card, EmptyState, PageHeader, Tag } from '@/ui';
import styles from './PermitHub.module.css';
import { usePermitBank } from './usePermitBank';

const HOW = ['permit.how.1', 'permit.how.2', 'permit.how.3', 'permit.how.4'] as const;
const GUIDE = ['permit.guide.1', 'permit.guide.2', 'permit.guide.3', 'permit.guide.4', 'permit.guide.5', 'permit.guide.6'] as const;

export function PermitHub() {
  const { pack, failed } = usePermitBank();
  const profile = useProfileStore(selectActiveProfile);
  const navigate = useNavigate();
  const industry = profile?.industry ?? 'general';
  const count = pack ? pack.permits.filter((permit) => appliesToIndustry(permit.industries, industry)).length : 0;

  if (failed) {
    return (
      <div className={styles.page}>
        <PageHeader title={t('permit.title')} />
        <EmptyState icon={FileCheck} title={t('quiz.error.title')} body={t('quiz.error.body')} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader title={t('permit.title')} subtitle={t('permit.subtitle')} />

      <Card tone="accent">
        <div className={styles.start}>
          <div className={styles.startText}>
            <strong>{t('permit.how.title')}</strong>
            <ol className={styles.how}>
              {HOW.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ol>
            {count > 0 ? <Tag tone="info">{t('permit.count', { count })}</Tag> : null}
          </div>
          <Button size="lg" fullWidth disabled={count === 0} onClick={() => navigate('/games/permit/play')}>
            {t('permit.start')}
          </Button>
        </div>
      </Card>

      <section className={styles.section}>
        <h2 className={styles.title}>{t('permit.guide.title')}</h2>
        <Card>
          <ul className={styles.how}>
            {GUIDE.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
