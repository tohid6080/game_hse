import { BADGE_TIERS, tierName, type BadgeStatus } from '@/domain/badges';
import { formatNumber, t } from '@/i18n';
import { Card, ProgressBar, Tag } from '@/ui';
import { BadgeHex } from './BadgeHex';
import styles from './BadgesView.module.css';

const tierLabel = (tier: 0 | 1 | 2 | 3): string => (tier === 0 ? t('badge.tier.none') : t(`badge.tier.${tierName(tier)}`));

export function BadgesView({ badges }: { badges: readonly BadgeStatus[] }) {
  const earned = badges.reduce((sum, badge) => sum + badge.tier, 0);
  const total = badges.length * BADGE_TIERS.length;

  return (
    <div className={styles.view}>
      <p className={styles.muted}>{t('badge.subtitle')}</p>
      <Tag tone="primary">{t('badge.summary', { count: earned, total })}</Tag>

      <ul className={styles.grid}>
        {badges.map((badge) => {
          const name = t(`badge.${badge.id}.name`);
          const nextTier = badge.tier < 3 ? tierLabel((badge.tier + 1) as 1 | 2 | 3) : null;
          return (
            <li key={badge.id} data-badge={badge.id} data-tier={badge.tier}>
              <Card tone={badge.tier === 0 ? 'muted' : 'default'}>
                <div className={styles.badge}>
                  <BadgeHex id={badge.id} tier={badge.tier} size={84} label={t('badge.label', { name, tier: tierLabel(badge.tier) })} />
                  <strong className={styles.name}>{name}</strong>
                  <Tag tone={badge.tier === 0 ? 'neutral' : 'success'}>{tierLabel(badge.tier)}</Tag>
                  <p className={styles.muted}>{t(`badge.${badge.id}.desc`)}</p>
                  {badge.next === null ? (
                    <span className={styles.muted}>{t('badge.maxed')}</span>
                  ) : (
                    <div className={styles.progress}>
                      <ProgressBar value={badge.fraction} label={`${name}: ${t('badge.progress', { value: badge.value, next: badge.next })}`} />
                      <span className={styles.muted}>
                        {t('badge.progress', { value: formatNumber(badge.value), next: formatNumber(badge.next) })} · {t('badge.next', { tier: nextTier ?? '' })}
                      </span>
                    </div>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
