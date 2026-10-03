import { Check, Star } from 'lucide-react';
import { Fragment } from 'react';
import {
  BAND_RANGE,
  RATINGS,
  RISK_BANDS,
  riskBand,
  riskScore,
  type Rating,
  type RiskRating,
} from '@/domain/risk';
import { formatNumber, t } from '@/i18n';
import { cx } from '@/ui';
import styles from './RiskMatrix.module.css';

interface RiskMatrixProps {
  /** The player's cell. */
  selected: RiskRating | null;
  /** The expert's cell (review only). */
  expert?: RiskRating | null;
  /** Omit for a read-only matrix. */
  onSelect?: (rating: RiskRating) => void;
}

const bandClass = (score: number) => styles[`b${RISK_BANDS.indexOf(riskBand(score)) + 1}`];

/**
 * The 5×5 heat-map. Likelihood grows upwards, severity to the right. The grid is forced LTR so the
 * numbers read like a matrix; every cell carries its number and a full spoken label, so colour is
 * never the only signal.
 */
export function RiskMatrix({ selected, expert, onSelect }: RiskMatrixProps) {
  const rows: Rating[] = [...RATINGS].reverse();

  return (
    <div className={styles.matrix}>
      <p className={styles.axisTitle}>↑ {t('risk.axis.likelihood')}</p>
      <div className={styles.grid} dir="ltr" role="group" aria-label={t('risk.matrixLabel')}>
        {rows.map((likelihood) => (
          <Fragment key={likelihood}>
            <span className={styles.axisNumber} aria-hidden="true">
              {formatNumber(likelihood)}
            </span>
            {RATINGS.map((severity) => {
              const score = riskScore(likelihood, severity);
              const isSelected = selected?.likelihood === likelihood && selected.severity === severity;
              const isExpert = expert?.likelihood === likelihood && expert.severity === severity;
              const label = [
                t('risk.cell', { likelihood, severity, score, band: t(`risk.band.${riskBand(score)}`) }),
                isSelected ? t('risk.cellYours') : '',
                isExpert ? t('risk.cellExpert') : '',
              ]
                .filter(Boolean)
                .join('، ');
              return (
                <button
                  key={severity}
                  type="button"
                  className={cx(styles.cell, bandClass(score), isSelected && styles.selected, isExpert && styles.expert)}
                  aria-label={label}
                  aria-pressed={onSelect ? isSelected : undefined}
                  disabled={!onSelect}
                  onClick={() => onSelect?.({ likelihood, severity })}
                >
                  {formatNumber(score)}
                  {isSelected ? <Check className={styles.markYours} size={16} strokeWidth={3} aria-hidden="true" /> : null}
                  {isExpert ? <Star className={styles.markExpert} size={14} fill="currentColor" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </Fragment>
        ))}
        <span aria-hidden="true" />
        {RATINGS.map((severity) => (
          <span key={severity} className={styles.axisNumber} aria-hidden="true">
            {formatNumber(severity)}
          </span>
        ))}
      </div>
      <p className={styles.axisTitle}>{t('risk.axis.severity')} →</p>
    </div>
  );
}

/** Colour key of the five risk bands with their score ranges. */
export function RiskLegend() {
  return (
    <ul className={styles.legend} aria-label={t('risk.legend')}>
      {RISK_BANDS.map((band, index) => {
        const [from, to] = BAND_RANGE[band];
        return (
          <li key={band}>
            <span className={cx(styles.swatch, styles[`b${index + 1}`])} aria-hidden="true" />
            <span className={styles.bandName}>{t(`risk.band.${band}`)}</span>
            <span className={styles.bandRange}>{t('risk.range', { from, to })}</span>
          </li>
        );
      })}
    </ul>
  );
}
