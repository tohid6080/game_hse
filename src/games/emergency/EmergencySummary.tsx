import { CircleCheck, CircleX, ShieldOff } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { EmergencyCase } from '@/content/schema';
import { t } from '@/i18n';
import { Button, Card, Tag, cx } from '@/ui';
import type { CaseJudgement } from './engine';
import { GradeLabel } from './EmergencyFeedback';
import styles from './EmergencySummary.module.css';

interface EmergencySummaryProps {
  emergency: EmergencyCase;
  judgement: CaseJudgement;
  points: number;
  streak: number;
  layerBroken: boolean;
  shieldGone: boolean;
  nextLabel: string;
  onNext: () => void;
}

/** The whole case in one view: how each decision went, and the lesson. */
export function EmergencySummary({ emergency, judgement, points, streak, layerBroken, shieldGone, nextLabel, onNext }: EmergencySummaryProps) {
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
          <strong className={styles.verdict}>{correct ? t('emergency.summary.good') : t('emergency.summary.notQuite')}</strong>
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
          <Tag>{t('emergency.summary.best', { count: judgement.bestCount, total: judgement.steps.length })}</Tag>
          {judgement.harmfulCount > 0 ? <Tag>{t('emergency.summary.harmful', { count: judgement.harmfulCount })}</Tag> : null}
        </div>

        <div className={styles.section}>
          <span className={styles.label}>{t('emergency.summary.steps')}</span>
          <ol className={styles.steps}>
            {emergency.steps.map((step, index) => {
              const given = judgement.steps[index]!;
              const chosen = given.chosenId === null ? undefined : step.options[given.chosenId];
              return (
                <li key={step.situation} className={styles.step}>
                  <strong>{t('emergency.summary.step', { n: index + 1 })}</strong>
                  {chosen && given.grade ? (
                    <>
                      <GradeLabel grade={given.grade} />
                      <span>{chosen.text}</span>
                    </>
                  ) : (
                    <span>{t('emergency.play.noChoice')}</span>
                  )}
                  {given.grade !== 'best' ? (
                    <span className={styles.better}>
                      {t('emergency.feedback.best')}: {step.options[given.bestId]!.text}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>

        <div className={styles.section}>
          <span className={styles.label}>{t('quiz.play.explanation')}</span>
          <p>{emergency.explanation}</p>
        </div>

        {emergency.references.length > 0 ? (
          <div className={styles.section}>
            <span className={styles.label}>{t('quiz.play.references')}</span>
            <ul className={styles.refs}>
              {emergency.references.map((reference) => (
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
