import { Shield, ShieldOff } from 'lucide-react';
import { t } from '@/i18n';
import { cx } from '@/ui';
import styles from './ShieldMeter.module.css';

interface ShieldMeterProps {
  layersLeft: number;
  total: number;
}

/** The signature mechanic: every wrong answer breaks one layer of the shield. */
export function ShieldMeter({ layersLeft, total }: ShieldMeterProps) {
  return (
    <div className={styles.meter} role="img" aria-label={t('play.shield', { left: layersLeft, total })}>
      {Array.from({ length: total }, (_, index) => {
        const intact = index < layersLeft;
        return (
          <span key={index} className={cx(styles.layer, intact ? styles.intact : styles.broken)}>
            {intact ? <Shield size={22} fill="currentColor" /> : <ShieldOff size={22} />}
          </span>
        );
      })}
    </div>
  );
}
