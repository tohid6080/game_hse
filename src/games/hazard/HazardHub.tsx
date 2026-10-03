import { ScanSearch } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { appliesToIndustry } from '@/domain/industries';
import { t } from '@/i18n';
import { selectActiveProfile, useProfileStore } from '@/state/profileStore';
import { Button, Card, EmptyState, PageHeader, Tag } from '@/ui';
import styles from './HazardHub.module.css';
import { useHazardBank } from './useHazardBank';

export function HazardHub() {
  const { pack, failed } = useHazardBank();
  const profile = useProfileStore(selectActiveProfile);
  const navigate = useNavigate();
  const industry = profile?.industry ?? 'general';
  const scenes = pack ? pack.scenes.filter((scene) => appliesToIndustry(scene.industries, industry)) : [];
  const mostHazards = scenes.reduce((most, scene) => Math.max(most, scene.hazards.length), 0);

  if (failed) {
    return (
      <div className={styles.page}>
        <PageHeader title={t('hazard.title')} />
        <EmptyState icon={ScanSearch} title={t('quiz.error.title')} body={t('quiz.error.body')} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader title={t('hazard.title')} subtitle={t('hazard.subtitle')} />

      <Card tone="accent">
        <div className={styles.start}>
          <div className={styles.startText}>
            <strong>{t('hazard.how.title')}</strong>
            <ol className={styles.how}>
              <li>{t('hazard.how.1')}</li>
              <li>{t('hazard.how.2')}</li>
              <li>{t('hazard.how.3')}</li>
              <li>{t('hazard.how.4')}</li>
            </ol>
            {scenes.length > 0 ? (
              <div className={styles.tags}>
                <Tag tone="info">{t('hazard.sceneCount', { count: scenes.length })}</Tag>
                <Tag tone="info">{t('hazard.hazardCount', { count: mostHazards })}</Tag>
              </div>
            ) : null}
          </div>
          <Button size="lg" fullWidth disabled={scenes.length === 0} onClick={() => navigate('/games/hazard/play')}>
            {t('hazard.start')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
