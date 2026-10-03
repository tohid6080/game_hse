import type { CSSProperties } from 'react';
import { tierName, type BadgeUnlock } from '@/domain/badges';
import { t } from '@/i18n';
import { BadgeHex } from '@/progress/BadgeHex';
import { Card } from '@/ui';
import styles from './NewBadges.module.css';

/** Medals unlocked (or upgraded) by the round that just ended. */
export function NewBadges({ unlocks }: { unlocks: readonly BadgeUnlock[] }) {
  return (
    <Card tone="accent" role="status" data-testid="new-badges">
      <div className={styles.box}>
        <strong>{t('badge.new.title')}</strong>
        <ul className={styles.list}>
          {unlocks.map((unlock, index) => {
            const name = t(`badge.${unlock.id}.name`);
            const tier = t(`badge.tier.${tierName(unlock.tier)}`);
            return (
              <li key={unlock.id} className={styles.item} style={{ '--i': index } as CSSProperties}>
                <BadgeHex id={unlock.id} tier={unlock.tier} size={52} />
                <span>{t('badge.new.item', { name, tier })}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
