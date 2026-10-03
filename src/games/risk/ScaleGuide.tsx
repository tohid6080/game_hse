import { RATINGS } from '@/domain/risk';
import { t } from '@/i18n';
import styles from './ScaleGuide.module.css';

/** Collapsible definition of the 1–5 likelihood and severity scales, so judging is fair. */
export function ScaleGuide() {
  return (
    <details className={styles.guide}>
      <summary className={styles.summary}>{t('risk.play.scaleGuide')}</summary>
      <div className={styles.body}>
        <div>
          <strong>{t('risk.likelihood.title')}</strong>
          <ol className={styles.list}>
            {RATINGS.map((rating) => (
              <li key={rating}>{t(`risk.likelihood.${rating}`)}</li>
            ))}
          </ol>
        </div>
        <div>
          <strong>{t('risk.severity.title')}</strong>
          <ol className={styles.list}>
            {RATINGS.map((rating) => (
              <li key={rating}>{t(`risk.severity.${rating}`)}</li>
            ))}
          </ol>
        </div>
      </div>
    </details>
  );
}
