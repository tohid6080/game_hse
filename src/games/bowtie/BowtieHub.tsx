import { Workflow } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { appliesToIndustry } from '@/domain/industries';
import { t } from '@/i18n';
import { selectActiveProfile, useProfileStore } from '@/state/profileStore';
import { Button, Card, EmptyState, PageHeader, Tag } from '@/ui';
import { PLACEMENT_GROUPS } from './engine';
import styles from './BowtieHub.module.css';
import { useBowtieBank } from './useBowtieBank';

const HOW = ['bowtie.how.1', 'bowtie.how.2', 'bowtie.how.3'] as const;

export function BowtieHub() {
  const { pack, failed } = useBowtieBank();
  const profile = useProfileStore(selectActiveProfile);
  const navigate = useNavigate();
  const industry = profile?.industry ?? 'general';
  const count = pack ? pack.bowties.filter((item) => appliesToIndustry(item.industries, industry)).length : 0;

  if (failed) {
    return (
      <div className={styles.page}>
        <PageHeader title={t('bowtie.title')} />
        <EmptyState icon={Workflow} title={t('quiz.error.title')} body={t('quiz.error.body')} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader title={t('bowtie.title')} subtitle={t('bowtie.subtitle')} />

      <Card tone="accent">
        <div className={styles.start}>
          <div className={styles.startText}>
            <strong>{t('bowtie.how.title')}</strong>
            <ol className={styles.how}>
              {HOW.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ol>
            {count > 0 ? <Tag tone="info">{t('bowtie.count', { count })}</Tag> : null}
          </div>
          <Button size="lg" fullWidth disabled={count === 0} onClick={() => navigate('/games/bowtie/play')}>
            {t('bowtie.start')}
          </Button>
        </div>
      </Card>

      <section className={styles.section}>
        <h2 className={styles.title}>{t('bowtie.guide.title')}</h2>
        <Card>
          <dl className={styles.guide}>
            {PLACEMENT_GROUPS.map((group) => (
              <div key={group}>
                <dt>{t(`bowtie.group.${group}`)}</dt>
                <dd>{t(`bowtie.guide.${group}`)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </section>
    </div>
  );
}
