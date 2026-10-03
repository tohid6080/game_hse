import { Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { practiceRoute, recommend, type RadarAxis } from '@/domain/radar';
import { formatNumber, t } from '@/i18n';
import { Button, Card, Tag } from '@/ui';
import { RadarChart } from './RadarChart';
import styles from './RadarView.module.css';

const percent = (value: number): string => `${formatNumber(Math.round(value * 100))}٪`;

export function RadarView({ axes }: { axes: readonly RadarAxis[] }) {
  const navigate = useNavigate();
  const advice = recommend(axes);

  return (
    <div className={styles.view}>
      <Card>
        <div className={styles.card}>
          <h2 className={styles.title}>{t('radar.title')}</h2>
          <p className={styles.muted}>{t('radar.subtitle')}</p>
          <RadarChart axes={axes} />
        </div>
      </Card>

      <Card tone="accent">
        <div className={styles.card}>
          <span className={styles.rec}>
            <Target size={22} aria-hidden="true" />
            <strong>{t('radar.rec.title')}</strong>
          </span>
          {advice ? (
            <>
              <p>
                {advice.reason === 'untried'
                  ? t('radar.rec.untried', { domain: t(`domain.${advice.domain}`) })
                  : t('radar.rec.weak', { domain: t(`domain.${advice.domain}`), percent: formatNumber(Math.round((advice.value ?? 0) * 100)) })}
              </p>
              <Button fullWidth onClick={() => navigate(practiceRoute(advice.domain))}>
                {t('radar.rec.go')}
              </Button>
            </>
          ) : (
            <>
              <p>{t('radar.rec.empty')}</p>
              <Button fullWidth onClick={() => navigate('/games')}>
                {t('radar.rec.toGames')}
              </Button>
            </>
          )}
        </div>
      </Card>

      <Card>
        <table className={styles.table}>
          <caption className={styles.caption}>{t('radar.table')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('radar.col.domain')}</th>
              <th scope="col">{t('radar.col.value')}</th>
              <th scope="col">{t('radar.col.answers')}</th>
            </tr>
          </thead>
          <tbody>
            {axes.map((axis) => (
              <tr key={axis.domain}>
                <th scope="row">{t(`domain.${axis.domain}`)}</th>
                <td>{axis.value === null ? <Tag>{t('radar.noData')}</Tag> : <strong>{percent(axis.value)}</strong>}</td>
                <td>{formatNumber(axis.answered)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
