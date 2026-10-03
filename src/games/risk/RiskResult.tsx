import type { RiskScenario } from '@/content/schema';
import { bestControlIndex } from '@/domain/risk';
import type { RoundSummary } from '@/domain/round';
import { formatNumber, t } from '@/i18n';
import { Button, Card } from '@/ui';
import type { FinishOutcome } from '../shared/finishRound';
import { RoundResult } from '../shared/RoundResult';
import styles from './RiskResult.module.css';

export interface RiskOutcome extends FinishOutcome {
  summary: RoundSummary;
  /** Scenarios that did not earn full credit, with the credit they earned. */
  toReview: Array<{ scenario: RiskScenario; credit: number }>;
}

interface RiskResultProps {
  outcome: RiskOutcome;
  onAgain: () => void;
  onBack: () => void;
}

export function RiskResult({ outcome, onAgain, onBack }: RiskResultProps) {
  return (
    <RoundResult
      summary={outcome.summary}
      outcome={outcome}
      countLabel={t('result.handled')}
      review={
        <section className={styles.review}>
          <h2 className={styles.title}>{t('risk.result.review')}</h2>
          {outcome.toReview.length === 0 ? (
            <p className={styles.muted}>{t('risk.result.perfect')}</p>
          ) : (
            outcome.toReview.map(({ scenario, credit }) => {
              const best = scenario.controls[bestControlIndex(scenario.controls.map((control) => control.level))]!;
              return (
                <Card key={scenario.id}>
                  <div className={styles.item}>
                    <strong>{scenario.title}</strong>
                    <span className={styles.muted}>{t('risk.result.credit', { percent: formatNumber(Math.round(credit * 100)) })}</span>
                    <div>
                      <span className={styles.mini}>{t('risk.result.bestControl')}</span>
                      <p>{best.text}</p>
                    </div>
                    <p className={styles.muted}>{scenario.explanation}</p>
                  </div>
                </Card>
              );
            })
          )}
        </section>
      }
      actions={
        <>
          <Button size="lg" fullWidth onClick={onAgain}>
            {t('risk.result.again')}
          </Button>
          <Button variant="ghost" fullWidth onClick={onBack}>
            {t('risk.result.back')}
          </Button>
        </>
      }
    />
  );
}
