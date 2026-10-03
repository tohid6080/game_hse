import { ArrowUpRight, ShieldOff, Star, Trophy } from 'lucide-react';
import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { feedback } from '@/feedback/feedback';
import { rankTierForLevel } from '@/domain/levels';
import type { RoundSummary } from '@/domain/round';
import { formatNumber, t } from '@/i18n';
import { Card, Tag, cx } from '@/ui';
import type { FinishOutcome } from './finishRound';
import { NewBadges } from './NewBadges';
import styles from './RoundResult.module.css';

export interface RoundResultProps {
  summary: RoundSummary;
  outcome: FinishOutcome;
  /** Heading/body when the round did not complete; default is the broken-shield wording. */
  brokenTitle?: string;
  brokenBody?: string;
  /** Label of the "x/y" statistic: "پاسخ درست", "خطر پیدا شده"… */
  countLabel: string;
  /** Game-specific review of what went wrong (missed questions, unfound hazards…). */
  review: ReactNode;
  actions: ReactNode;
}

/** The result screen every game ends with: stars, level-up, stats, XP breakdown, review, actions. */
export function RoundResult({ summary, outcome, countLabel, review, actions, brokenTitle, brokenBody }: RoundResultProps) {
  const { xp, levelBefore, levelAfter, saved } = outcome;
  const leveledUp = saved && levelAfter > levelBefore;

  // One sound and vibration for the biggest thing that happened: a level, a medal, or just finishing.
  useEffect(() => {
    if (leveledUp) feedback('levelUp');
    else if (outcome.badges.length > 0) feedback('medal');
    else if (summary.completed) feedback('complete');
    // Once per result screen: the values below never change while it is shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.result}>
      <header className={styles.head}>
        {summary.completed ? (
          <Trophy size={44} className={styles.icon} aria-hidden="true" />
        ) : (
          <ShieldOff size={44} className={cx(styles.icon, styles.iconBroken)} aria-hidden="true" />
        )}
        <h1 className={styles.title}>{summary.completed ? t('result.titleCompleted') : (brokenTitle ?? t('result.titleBroken'))}</h1>
        {!summary.completed ? <p className={styles.sub}>{brokenBody ?? t('result.brokenBody')}</p> : null}
        <div className={styles.stars} role="img" aria-label={t('result.stars', { count: summary.stars })}>
          {[1, 2, 3].map((index) => (
            <Star
              key={index}
              size={40}
              className={index <= summary.stars ? styles.starOn : styles.starOff}
              style={{ '--i': index } as CSSProperties}
              fill={index <= summary.stars ? 'currentColor' : 'none'}
            />
          ))}
        </div>
      </header>

      {leveledUp ? (
        <Card tone="accent" role="status">
          <div className={styles.levelUp}>
            <ArrowUpRight size={24} aria-hidden="true" />
            <div>
              <strong>{t('result.levelUp', { level: levelAfter })}</strong>
              <p className={styles.sub}>{t(`rank.${rankTierForLevel(levelAfter)}`)}</p>
            </div>
          </div>
        </Card>
      ) : null}

      {outcome.badges.length > 0 ? <NewBadges unlocks={outcome.badges} /> : null}

      <div className={styles.stats}>
        <Card tone="muted">
          <span className={styles.statValue}>{formatNumber(summary.score)}</span>
          <span className={styles.statLabel}>{t('result.score')}</span>
        </Card>
        <Card tone="muted">
          <span className={styles.statValue}>
            {formatNumber(summary.correctCount)}/{formatNumber(summary.answered)}
          </span>
          <span className={styles.statLabel}>{countLabel}</span>
        </Card>
        <Card tone="muted">
          <span className={styles.statValue}>{formatNumber(Math.round(summary.accuracy * 100))}٪</span>
          <span className={styles.statLabel}>{t('result.accuracy')}</span>
        </Card>
      </div>

      <Card>
        <div className={styles.xpHead}>
          <strong>{t('result.xpTitle')}</strong>
          <Tag tone="primary">{t('result.xp', { xp: xp.total })}</Tag>
        </div>
        <ul className={styles.breakdown}>
          <li>
            <span>{t('result.xpBase')}</span>
            <span>{formatNumber(xp.base)}</span>
          </li>
          {xp.firstTimeBonus > 0 ? (
            <li>
              <span>{t('result.xpFirst')}</span>
              <span>{formatNumber(xp.firstTimeBonus)}</span>
            </li>
          ) : null}
          {xp.flawlessBonus > 0 ? (
            <li>
              <span>{t('result.xpFlawless')}</span>
              <span>{formatNumber(xp.flawlessBonus)}</span>
            </li>
          ) : null}
          {xp.repeatFactor < 1 ? (
            <li>
              <span>{t('result.xpRepeat')}</span>
              <span>×{formatNumber(xp.repeatFactor)}</span>
            </li>
          ) : null}
          {xp.dailyFactor > 1 ? (
            <li>
              <span>{t('result.xpDaily')}</span>
              <span>×{formatNumber(xp.dailyFactor)}</span>
            </li>
          ) : null}
          {xp.dailyBonus > 0 ? (
            <li>
              <span>{t('result.xpDailyBonus')}</span>
              <span>+{formatNumber(xp.dailyBonus)}</span>
            </li>
          ) : null}
        </ul>
        {!saved ? (
          <p className={styles.error} role="alert">
            {t('result.saveError')}
          </p>
        ) : null}
      </Card>

      {review}

      <div className={styles.actions}>{actions}</div>
    </div>
  );
}
