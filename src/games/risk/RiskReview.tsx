import { CircleCheck, CircleX, ShieldOff } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { CONTROL_LEVELS, controlRank } from '@/domain/risk';
import { formatNumber, t } from '@/i18n';
import { Button, Card, Tag, cx } from '@/ui';
import type { PreparedScenario, ScenarioJudgementDetail } from './engine';
import { ControlPyramid } from './ControlPyramid';
import { RiskLegend, RiskMatrix } from './RiskMatrix';
import styles from './RiskReview.module.css';

interface RiskReviewProps {
  prepared: PreparedScenario;
  detail: ScenarioJudgementDetail;
  chosenControlId: number | null;
  points: number;
  streak: number;
  timedOut: boolean;
  layerBroken: boolean;
  shieldGone: boolean;
  nextLabel: string;
  onNext: () => void;
}

const percent = (value: number) => formatNumber(Math.round(value * 100));

/** What happened on one scenario: both ratings on the matrix, the credit split, and the controls ranked. */
export function RiskReview({
  prepared,
  detail,
  chosenControlId,
  points,
  streak,
  timedOut,
  layerBroken,
  shieldGone,
  nextLabel,
  onNext,
}: RiskReviewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scenario, options } = prepared;

  // The explanation is the point of the game: make sure it is on screen after answering.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  const ranked = [...options].sort((a, b) => controlRank(a.level) - controlRank(b.level));
  const chosen = options.find((option) => option.id === chosenControlId);
  const best = options.find((option) => option.id === detail.bestControlId);

  return (
    <div ref={ref}>
      <Card className={cx(styles.panel, detail.correct ? styles.good : styles.bad)} role="status" aria-live="polite">
        <div className={styles.head}>
          {detail.correct ? <CircleCheck size={26} aria-hidden="true" /> : <CircleX size={26} aria-hidden="true" />}
          <strong className={styles.verdict}>
            {timedOut ? t('quiz.play.timeUp') : detail.correct ? t('risk.review.good') : t('risk.review.notQuite')}
          </strong>
          {points > 0 ? <Tag tone="success">{t('quiz.play.points', { points })}</Tag> : null}
          {detail.correct && streak >= 2 ? <Tag tone="primary">{t('quiz.play.streak', { count: streak })}</Tag> : null}
        </div>

        {layerBroken ? (
          <p className={styles.shield}>
            <ShieldOff size={18} aria-hidden="true" />
            {shieldGone ? t('quiz.play.shieldGone') : t('quiz.play.layerBroken')}
          </p>
        ) : null}

        <div className={styles.credits}>
          <Tag>{t('risk.review.ratingCredit', { percent: percent(detail.ratingCredit) })}</Tag>
          <Tag>{t('risk.review.controlCredit', { percent: percent(detail.controlCredit) })}</Tag>
        </div>

        <RiskMatrix selected={detail.given} expert={detail.expert} />
        <p className={styles.line}>
          {t('risk.review.expert', {
            likelihood: detail.expert.likelihood,
            severity: detail.expert.severity,
            score: detail.expertScore,
            band: t(`risk.band.${detail.expertBand}`),
          })}
        </p>
        {detail.given && detail.givenScore !== null && detail.givenBand ? (
          <p className={styles.line}>
            {t('risk.play.picked', {
              likelihood: detail.given.likelihood,
              severity: detail.given.severity,
              score: detail.givenScore,
              band: t(`risk.band.${detail.givenBand}`),
            })}
          </p>
        ) : (
          <p className={styles.line}>{t('risk.review.noRating')}</p>
        )}
        <RiskLegend />

        <div className={styles.section}>
          <span className={styles.label}>{t('risk.review.controls')}</span>
          <ul className={styles.controls}>
            {ranked.map((option) => (
              <li
                key={option.id}
                className={cx(
                  styles.control,
                  option.id === detail.bestControlId && styles.best,
                  option.id === chosenControlId && styles.yours,
                )}
              >
                <div className={styles.controlTags}>
                  <Tag tone={option.id === detail.bestControlId ? 'success' : 'neutral'}>{t(`risk.level.${option.level}`)}</Tag>
                  {option.id === detail.bestControlId ? <Tag tone="success">{t('risk.review.best')}</Tag> : null}
                  {option.id === chosenControlId ? <Tag tone="info">{t('risk.review.yours')}</Tag> : null}
                </div>
                <span>{option.text}</span>
              </li>
            ))}
          </ul>
          <ControlPyramid
            offered={CONTROL_LEVELS.filter((level) => options.some((option) => option.level === level))}
            best={best?.level ?? null}
            chosen={chosen?.level ?? null}
          />
        </div>

        <div className={styles.section}>
          <span className={styles.label}>{t('quiz.play.explanation')}</span>
          <p>{scenario.explanation}</p>
        </div>

        {scenario.references.length > 0 ? (
          <div className={styles.section}>
            <span className={styles.label}>{t('quiz.play.references')}</span>
            <ul className={styles.refs}>
              {scenario.references.map((reference) => (
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
