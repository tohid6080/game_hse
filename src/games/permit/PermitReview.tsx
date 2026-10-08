import { CircleCheck, CircleX, ShieldOff } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { PermitCase } from '@/content/schema';
import { t } from '@/i18n';
import { Button, Card, Tag, cx } from '@/ui';
import type { PermitJudgement } from './engine';
import { PermitForm } from './PermitForm';
import styles from './PermitReview.module.css';

interface PermitReviewProps {
  permit: PermitCase;
  judgement: PermitJudgement;
  flagged: ReadonlySet<string>;
  points: number;
  streak: number;
  timedOut: boolean;
  layerBroken: boolean;
  shieldGone: boolean;
  nextLabel: string;
  onNext: () => void;
}

/** What happened on one permit: the decision, what was found and missed, the form with its answers. */
export function PermitReview({
  permit,
  judgement,
  flagged,
  points,
  streak,
  timedOut,
  layerBroken,
  shieldGone,
  nextLabel,
  onNext,
}: PermitReviewProps) {
  const ref = useRef<HTMLDivElement>(null);

  // The explanation is the point of the game: make sure it is on screen after deciding.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  const { correct, decision, decisionRight, shouldReject, missedCritical, falseFlags } = judgement;
  const approvedDefective = decision === 'approve' && shouldReject;

  return (
    <div ref={ref}>
      <Card className={cx(styles.panel, correct ? styles.good : styles.bad)} role="status" aria-live="polite">
        <div className={styles.head}>
          {correct ? <CircleCheck size={26} aria-hidden="true" /> : <CircleX size={26} aria-hidden="true" />}
          <strong className={styles.verdict}>
            {timedOut ? t('quiz.play.timeUp') : correct ? t('permit.review.good') : t('permit.review.notQuite')}
          </strong>
          {points > 0 ? <Tag tone="success">{t('quiz.play.points', { points })}</Tag> : null}
          {correct && streak >= 2 ? <Tag tone="primary">{t('quiz.play.streak', { count: streak })}</Tag> : null}
        </div>

        {layerBroken ? (
          <p className={styles.shield}>
            <ShieldOff size={18} aria-hidden="true" />
            {shieldGone ? t('quiz.play.shieldGone') : t('quiz.play.layerBroken')}
          </p>
        ) : null}

        <div className={styles.facts}>
          <Tag tone={decisionRight ? 'success' : 'neutral'}>{decisionRight ? t('permit.review.right') : t('permit.review.wrong')}</Tag>
          {shouldReject ? (
            <Tag>{t('permit.review.found', { found: judgement.foundCount, total: judgement.defects.length })}</Tag>
          ) : null}
          {falseFlags.length > 0 ? <Tag>{t('permit.review.falseAlarms', { count: falseFlags.length })}</Tag> : null}
        </div>

        <p className={styles.line}>
          {decision ? t('permit.review.decision', { decision: t(`permit.review.decision.${decision}`) }) : t('permit.review.noDecision')}{' '}
          {shouldReject ? t('permit.review.verdictReject') : t('permit.review.verdictApprove')}
        </p>
        {approvedDefective ? <p className={styles.alert}>{t('permit.review.approvedDefective')}</p> : null}
        {missedCritical && !approvedDefective ? <p className={styles.alert}>{t('permit.review.missedCritical')}</p> : null}

        <div className={styles.section}>
          <span className={styles.label}>{t('permit.review.formTitle')}</span>
          <PermitForm permit={permit} flagged={flagged} />
        </div>

        <div className={styles.section}>
          <span className={styles.label}>{t('quiz.play.explanation')}</span>
          <p>{permit.explanation}</p>
        </div>

        {permit.references.length > 0 ? (
          <div className={styles.section}>
            <span className={styles.label}>{t('quiz.play.references')}</span>
            <ul className={styles.refs}>
              {permit.references.map((reference) => (
                <li key={`${reference.standard}:${reference.clause ?? ''}`} dir="auto">
                  {reference.standard}
                  {reference.clause ? ` — ${t('quiz.play.clause', { clause: reference.clause })}` : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Button size="lg" fullWidth onClick={onNext}>
          {nextLabel}
        </Button>
      </Card>
    </div>
  );
}
