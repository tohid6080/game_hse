import { CircleAlert, CircleCheck, CircleX } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { EmergencyGrade, EmergencyStep } from '@/content/schema';
import { t } from '@/i18n';
import { Button, Card, cx } from '@/ui';
import type { StepJudgement } from './engine';
import styles from './EmergencyFeedback.module.css';

const ORDER: readonly EmergencyGrade[] = ['best', 'acceptable', 'harmful'];

/** One grade as words and an icon: never colour alone. */
export function GradeLabel({ grade }: { grade: EmergencyGrade }) {
  return (
    <span className={cx(styles.grade, styles[grade])}>
      {grade === 'best' ? <CircleCheck size={16} aria-hidden="true" /> : null}
      {grade === 'acceptable' ? <CircleAlert size={16} aria-hidden="true" /> : null}
      {grade === 'harmful' ? <CircleX size={16} aria-hidden="true" /> : null}
      {t(`emergency.grade.${grade}`)}
    </span>
  );
}

interface EmergencyFeedbackProps {
  step: EmergencyStep;
  judgement: StepJudgement;
  nextLabel: string;
  onNext: () => void;
}

/** What one decision led to: its consequence, the best action and why, and every option with its outcome. */
export function EmergencyFeedback({ step, judgement, nextLabel, onNext }: EmergencyFeedbackProps) {
  const ref = useRef<HTMLDivElement>(null);

  // The lesson is the point of the game: make sure it is on screen after deciding.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  const chosen = judgement.chosenId === null ? undefined : step.options[judgement.chosenId];
  const best = step.options[judgement.bestId]!;
  const tone = judgement.grade ?? 'harmful';
  const ranked = step.options
    .map((option, id) => ({ option, id }))
    .sort((a, b) => ORDER.indexOf(a.option.grade) - ORDER.indexOf(b.option.grade));

  return (
    <div ref={ref}>
      <Card className={cx(styles.panel, styles[`panel-${tone}`])} role="status" aria-live="polite">
        {chosen && judgement.grade ? (
          <>
            <div className={styles.head}>
              <GradeLabel grade={judgement.grade} />
            </div>
            <div className={styles.block}>
              <span className={styles.label}>{t('emergency.feedback.yours')}</span>
              <p>{chosen.text}</p>
            </div>
            <div className={styles.block}>
              <span className={styles.label}>{t('emergency.feedback.consequence')}</span>
              <p>{chosen.consequence}</p>
            </div>
          </>
        ) : (
          <div className={styles.head}>
            <strong>{t('quiz.play.timeUp')}</strong>
            <span>{t('emergency.play.noChoice')}</span>
          </div>
        )}

        {judgement.grade !== 'best' ? (
          <div className={styles.block}>
            <span className={styles.label}>{t('emergency.feedback.best')}</span>
            <p>{best.text}</p>
          </div>
        ) : null}

        <div className={styles.block}>
          <span className={styles.label}>{t('emergency.feedback.why')}</span>
          <p>{step.why}</p>
        </div>

        <details className={styles.all}>
          <summary>{t('emergency.feedback.all')}</summary>
          <ul className={styles.options}>
            {ranked.map(({ option, id }) => (
              <li key={id} className={cx(styles.option, id === judgement.chosenId && styles.yours)}>
                <GradeLabel grade={option.grade} />
                <span>{option.text}</span>
                <span className={styles.consequence}>{option.consequence}</span>
              </li>
            ))}
          </ul>
        </details>

        <Button size="lg" fullWidth onClick={onNext}>
          {nextLabel}
        </Button>
      </Card>
    </div>
  );
}
