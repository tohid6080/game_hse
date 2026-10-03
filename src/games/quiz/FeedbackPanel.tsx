import { CircleCheck, CircleX, ShieldOff } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Reference } from '@/content/schema';
import { t } from '@/i18n';
import { Button, Card, Tag, cx } from '@/ui';
import styles from './FeedbackPanel.module.css';

interface FeedbackPanelProps {
  correct: boolean;
  timedOut: boolean;
  points: number;
  streak: number;
  /** Wrong answer that just cost a shield layer. */
  layerBroken: boolean;
  /** The last layer broke: the round ends here. */
  shieldGone: boolean;
  explanation: string;
  references: readonly Reference[];
  nextLabel: string;
  onNext: () => void;
}

export function FeedbackPanel({
  correct,
  timedOut,
  points,
  streak,
  layerBroken,
  shieldGone,
  explanation,
  references,
  nextLabel,
  onNext,
}: FeedbackPanelProps) {
  const ref = useRef<HTMLDivElement>(null);

  // The explanation is the point of the game: make sure it is on screen after answering.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  return (
    <div ref={ref}>
      <Card className={cx(styles.panel, correct ? styles.good : styles.bad)} role="status" aria-live="polite">
        <div className={styles.head}>
          {correct ? <CircleCheck size={26} aria-hidden="true" /> : <CircleX size={26} aria-hidden="true" />}
          <strong className={styles.verdict}>
            {correct ? t('quiz.play.correct') : timedOut ? t('quiz.play.timeUp') : t('quiz.play.wrong')}
          </strong>
          {correct && points > 0 ? <Tag tone="success">{t('quiz.play.points', { points })}</Tag> : null}
          {correct && streak >= 2 ? <Tag tone="primary">{t('quiz.play.streak', { count: streak })}</Tag> : null}
        </div>

        {layerBroken ? (
          <p className={styles.shield}>
            <ShieldOff size={18} aria-hidden="true" />
            {shieldGone ? t('quiz.play.shieldGone') : t('quiz.play.layerBroken')}
          </p>
        ) : null}

        <div className={styles.section}>
          <span className={styles.label}>{t('quiz.play.explanation')}</span>
          <p>{explanation}</p>
        </div>

        {references.length > 0 ? (
          <div className={styles.section}>
            <span className={styles.label}>{t('quiz.play.references')}</span>
            <ul className={styles.refs}>
              {references.map((reference) => (
                <li key={`${reference.standard}:${reference.clause ?? ''}`} dir="auto">
                  {reference.standard}
                  {reference.clause ? ` — ${t('quiz.play.clause', { clause: reference.clause })}` : ''}
                  {reference.note ? ` (${reference.note})` : ''}
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
