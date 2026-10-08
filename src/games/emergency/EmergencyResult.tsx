import type { EmergencyCase } from '@/content/schema';
import type { RoundSummary } from '@/domain/round';
import { formatNumber, t } from '@/i18n';
import { Button, Card } from '@/ui';
import type { FinishOutcome } from '../shared/finishRound';
import { RoundResult } from '../shared/RoundResult';
import styles from './EmergencyResult.module.css';

export interface EmergencyOutcome extends FinishOutcome {
  summary: RoundSummary;
  /** Cases that did not earn full credit, with the steps where a better action existed. */
  toReview: Array<{ emergency: EmergencyCase; credit: number; better: Array<{ step: number; text: string }> }>;
}

interface EmergencyResultProps {
  outcome: EmergencyOutcome;
  onAgain: () => void;
  onBack: () => void;
}

export function EmergencyResult({ outcome, onAgain, onBack }: EmergencyResultProps) {
  return (
    <RoundResult
      summary={outcome.summary}
      outcome={outcome}
      countLabel={t('emergency.result.handled')}
      review={
        <section className={styles.review}>
          <h2 className={styles.title}>{t('emergency.result.review')}</h2>
          {outcome.toReview.length === 0 ? (
            <p className={styles.muted}>{t('emergency.result.perfect')}</p>
          ) : (
            outcome.toReview.map(({ emergency, credit, better }) => (
              <Card key={emergency.id}>
                <div className={styles.item}>
                  <strong>{emergency.title}</strong>
                  <span className={styles.muted}>{t('emergency.result.credit', { percent: formatNumber(Math.round(credit * 100)) })}</span>
                  {better.map(({ step, text }) => (
                    <div key={step}>
                      <span className={styles.mini}>{t('emergency.result.better', { n: formatNumber(step) })}</span>
                      <p>{text}</p>
                    </div>
                  ))}
                  <p className={styles.muted}>{emergency.explanation}</p>
                </div>
              </Card>
            ))
          )}
        </section>
      }
      actions={
        <>
          <Button size="lg" fullWidth onClick={onAgain}>
            {t('emergency.result.again')}
          </Button>
          <Button variant="ghost" fullWidth onClick={onBack}>
            {t('emergency.result.back')}
          </Button>
        </>
      }
    />
  );
}
