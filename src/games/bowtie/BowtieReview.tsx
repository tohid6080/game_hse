import { CircleCheck, CircleX, ShieldOff } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { BowtieCase } from '@/content/schema';
import { t } from '@/i18n';
import { Button, Card, Tag, cx } from '@/ui';
import { ReviewBoard } from './BowtieBoard';
import type { BowtieJudgement } from './engine';
import styles from './BowtieReview.module.css';

interface BowtieReviewProps {
  bowtie: BowtieCase;
  judgement: BowtieJudgement;
  points: number;
  streak: number;
  timedOut: boolean;
  layerBroken: boolean;
  shieldGone: boolean;
  nextLabel: string;
  onNext: () => void;
}

/** What happened on one bowtie: the score, the timing mistake if any, the right diagram with every card judged. */
export function BowtieReview({ bowtie, judgement, points, streak, timedOut, layerBroken, shieldGone, nextLabel, onNext }: BowtieReviewProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  const { correct } = judgement;

  return (
    <div ref={ref}>
      <Card className={cx(styles.panel, correct ? styles.good : styles.bad)} role="status" aria-live="polite">
        <div className={styles.head}>
          {correct ? <CircleCheck size={26} aria-hidden="true" /> : <CircleX size={26} aria-hidden="true" />}
          <strong className={styles.verdict}>{timedOut ? t('quiz.play.timeUp') : correct ? t('bowtie.review.good') : t('bowtie.review.notQuite')}</strong>
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
          <Tag>{t('bowtie.review.right', { right: judgement.rightCount, total: judgement.cards.length })}</Tag>
          {judgement.timingMixups > 0 ? <Tag>{t('bowtie.review.mixups', { count: judgement.timingMixups })}</Tag> : null}
        </div>
        {judgement.timingMixups > 0 ? <p className={styles.tip}>{t('bowtie.review.mixupTip')}</p> : null}

        <div className={styles.section}>
          <span className={styles.label}>{t('bowtie.review.board')}</span>
          <ReviewBoard bowtie={bowtie} judgement={judgement} />
        </div>

        <div className={styles.section}>
          <span className={styles.label}>{t('quiz.play.explanation')}</span>
          <p>{bowtie.explanation}</p>
        </div>

        {bowtie.references.length > 0 ? (
          <div className={styles.section}>
            <span className={styles.label}>{t('quiz.play.references')}</span>
            <ul className={styles.refs}>
              {bowtie.references.map((reference) => (
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
