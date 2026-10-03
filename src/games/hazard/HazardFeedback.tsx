import { CircleCheck, CircleX, Info, ShieldOff, Timer } from 'lucide-react';
import type { HazardSpot } from '@/content/schema';
import { t } from '@/i18n';
import { Card, Tag, cx } from '@/ui';
import { HazardDetails } from './HazardDetails';
import styles from './HazardFeedback.module.css';

export type Feedback =
  | { kind: 'hint' }
  | { kind: 'found'; hazard: HazardSpot; points: number; streak: number; again: boolean; all: boolean }
  | { kind: 'miss'; shieldGone: boolean }
  | { kind: 'ended'; reason: 'time-up' | 'gave-up' };

/** The line under the scene: instruction, hint note, miss warning, or the card of the hazard just found. */
export function HazardFeedback({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) {
    return (
      <p className={styles.instruction} role="status">
        {t('hazard.play.instruction')}
      </p>
    );
  }

  if (feedback.kind === 'found') {
    const { hazard } = feedback;
    return (
      <Card key={`found-${hazard.id}-${feedback.again}`} className={cx(styles.panel, styles.good)} role="status" aria-live="polite">
        <div className={styles.head}>
          <CircleCheck size={26} aria-hidden="true" />
          <strong className={styles.title}>{feedback.again ? t('hazard.play.foundAgain') : t('hazard.play.found')}</strong>
          {feedback.points > 0 ? <Tag tone="success">{t('quiz.play.points', { points: feedback.points })}</Tag> : null}
          {!feedback.again && feedback.streak >= 2 ? <Tag tone="primary">{t('hazard.play.streak', { count: feedback.streak })}</Tag> : null}
          {feedback.all ? <Tag tone="primary">{t('hazard.play.allFound')}</Tag> : null}
        </div>
        <h2 className={styles.hazardTitle}>{hazard.title}</h2>
        <HazardDetails hazard={hazard} />
      </Card>
    );
  }

  if (feedback.kind === 'miss') {
    return (
      <Card key={`miss-${feedback.shieldGone}`} className={cx(styles.panel, styles.bad)} role="status" aria-live="polite">
        <p className={styles.line}>
          {feedback.shieldGone ? <ShieldOff size={20} aria-hidden="true" /> : <CircleX size={20} aria-hidden="true" />}
          {feedback.shieldGone ? t('hazard.play.missGone') : t('hazard.play.miss')}
        </p>
      </Card>
    );
  }

  if (feedback.kind === 'hint') {
    return (
      <Card className={cx(styles.panel, styles.hint)} role="status" aria-live="polite">
        <p className={styles.line}>
          <Info size={20} aria-hidden="true" />
          {t('hazard.play.hintShown')}
        </p>
      </Card>
    );
  }

  return (
    <Card className={styles.panel} role="status" aria-live="polite">
      <p className={styles.line}>
        <Timer size={20} aria-hidden="true" />
        {feedback.reason === 'time-up' ? t('hazard.play.timeUp') : t('hazard.play.gaveUp')}
      </p>
    </Card>
  );
}
