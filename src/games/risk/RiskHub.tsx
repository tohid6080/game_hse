import { Grid3x3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { appliesToIndustry } from '@/domain/industries';
import { t } from '@/i18n';
import { selectActiveProfile, useProfileStore } from '@/state/profileStore';
import { Button, Card, EmptyState, PageHeader, Tag } from '@/ui';
import { ControlPyramid } from './ControlPyramid';
import { RiskLegend } from './RiskMatrix';
import styles from './RiskHub.module.css';
import { ScaleGuide } from './ScaleGuide';
import { useRiskBank } from './useRiskBank';

export function RiskHub() {
  const { pack, failed } = useRiskBank();
  const profile = useProfileStore(selectActiveProfile);
  const navigate = useNavigate();
  const industry = profile?.industry ?? 'general';
  const count = pack ? pack.scenarios.filter((scenario) => appliesToIndustry(scenario.industries, industry)).length : 0;

  if (failed) {
    return (
      <div className={styles.page}>
        <PageHeader title={t('risk.title')} />
        <EmptyState icon={Grid3x3} title={t('quiz.error.title')} body={t('quiz.error.body')} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader title={t('risk.title')} subtitle={t('risk.subtitle')} />

      <Card tone="accent">
        <div className={styles.start}>
          <div className={styles.startText}>
            <strong>{t('risk.how.title')}</strong>
            <ol className={styles.how}>
              <li>{t('risk.how.1')}</li>
              <li>{t('risk.how.2')}</li>
              <li>{t('risk.how.3')}</li>
            </ol>
            {count > 0 ? <Tag tone="info">{t('risk.scenarioCount', { count })}</Tag> : null}
          </div>
          <Button size="lg" fullWidth disabled={count === 0} onClick={() => navigate('/games/risk/play')}>
            {t('risk.start')}
          </Button>
        </div>
      </Card>

      <ScaleGuide />

      <section className={styles.section}>
        <h2 className={styles.title}>{t('risk.legend')}</h2>
        <RiskLegend />
      </section>

      <section className={styles.section}>
        <h2 className={styles.title}>{t('risk.play.hierarchy')}</h2>
        <ControlPyramid />
      </section>
    </div>
  );
}
