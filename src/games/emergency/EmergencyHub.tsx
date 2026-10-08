import { Siren } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { appliesToIndustry } from '@/domain/industries';
import { t } from '@/i18n';
import { selectActiveProfile, useProfileStore } from '@/state/profileStore';
import { Button, Card, EmptyState, PageHeader, Tag } from '@/ui';
import styles from './EmergencyHub.module.css';
import { useEmergencyBank } from './useEmergencyBank';

const HOW = ['emergency.how.1', 'emergency.how.2', 'emergency.how.3'] as const;
const RULES = ['emergency.rules.1', 'emergency.rules.2', 'emergency.rules.3', 'emergency.rules.4'] as const;

export function EmergencyHub() {
  const { pack, failed } = useEmergencyBank();
  const profile = useProfileStore(selectActiveProfile);
  const navigate = useNavigate();
  const industry = profile?.industry ?? 'general';
  const count = pack ? pack.cases.filter((item) => appliesToIndustry(item.industries, industry)).length : 0;

  if (failed) {
    return (
      <div className={styles.page}>
        <PageHeader title={t('emergency.title')} />
        <EmptyState icon={Siren} title={t('quiz.error.title')} body={t('quiz.error.body')} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader title={t('emergency.title')} subtitle={t('emergency.subtitle')} />

      <Card tone="accent">
        <div className={styles.start}>
          <div className={styles.startText}>
            <strong>{t('emergency.how.title')}</strong>
            <ol className={styles.how}>
              {HOW.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ol>
            {count > 0 ? <Tag tone="info">{t('emergency.count', { count })}</Tag> : null}
          </div>
          <Button size="lg" fullWidth disabled={count === 0} onClick={() => navigate('/games/emergency/play')}>
            {t('emergency.start')}
          </Button>
        </div>
      </Card>

      <section className={styles.section}>
        <h2 className={styles.title}>{t('emergency.rules.title')}</h2>
        <Card>
          <ul className={styles.how}>
            {RULES.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
