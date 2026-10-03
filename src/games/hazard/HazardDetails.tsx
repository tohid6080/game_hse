import type { HazardSpot } from '@/content/schema';
import { riskBand, riskScore } from '@/domain/risk';
import { t } from '@/i18n';
import styles from './HazardDetails.module.css';

/** What a found hazard teaches: why it is dangerous, how serious it is, and the best control. */
export function HazardDetails({ hazard }: { hazard: HazardSpot }) {
  const score = riskScore(hazard.likelihood, hazard.severity);
  return (
    <div className={styles.details}>
      <p>{hazard.explanation}</p>
      <p className={styles.risk}>
        {t('hazard.play.risk', {
          likelihood: hazard.likelihood,
          severity: hazard.severity,
          score,
          band: t(`risk.band.${riskBand(score)}`),
        })}
      </p>
      <div className={styles.control}>
        <span className={styles.label}>{t('hazard.play.control', { level: t(`risk.level.${hazard.control.level}`) })}</span>
        <p>{hazard.control.text}</p>
      </div>
    </div>
  );
}
