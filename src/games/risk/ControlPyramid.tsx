import { CONTROL_LEVELS, type ControlLevel } from '@/domain/risk';
import { formatNumber, t } from '@/i18n';
import { Tag, cx } from '@/ui';
import styles from './ControlPyramid.module.css';

interface ControlPyramidProps {
  /** Levels offered by the scenario; others are dimmed. Omit to show the plain reference. */
  offered?: readonly ControlLevel[];
  best?: ControlLevel | null;
  chosen?: ControlLevel | null;
}

/** The hierarchy of controls as a pyramid: the most effective level on top. */
export function ControlPyramid({ offered, best, chosen }: ControlPyramidProps) {
  return (
    <ol className={styles.pyramid} aria-label={t('risk.play.hierarchy')}>
      {CONTROL_LEVELS.map((level, index) => (
        <li
          key={level}
          className={cx(
            styles.step,
            styles[`s${index}`],
            offered && !offered.includes(level) && styles.absent,
            (best === level || chosen === level) && styles.marked,
          )}
        >
          <span className={styles.number}>{formatNumber(index + 1)}</span>
          <span className={styles.label}>{t(`risk.level.${level}`)}</span>
          {offered && !offered.includes(level) ? <span className="sr-only">{t('risk.review.notOffered')}</span> : null}
          {best === level ? <Tag tone="success">{t('risk.review.best')}</Tag> : null}
          {chosen === level ? <Tag tone="info">{t('risk.review.yours')}</Tag> : null}
        </li>
      ))}
    </ol>
  );
}
