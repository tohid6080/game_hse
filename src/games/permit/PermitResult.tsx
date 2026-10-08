import type { PermitCase } from '@/content/schema';
import type { RoundSummary } from '@/domain/round';
import { formatNumber, t } from '@/i18n';
import { Button, Card } from '@/ui';
import type { FinishOutcome } from '../shared/finishRound';
import { RoundResult } from '../shared/RoundResult';
import styles from './PermitResult.module.css';

export interface PermitOutcome extends FinishOutcome {
  summary: RoundSummary;
  /** Permits that did not earn full credit: the credit, and the defects that were not found. */
  toReview: Array<{ permit: PermitCase; credit: number; missed: string[] }>;
}

interface PermitResultProps {
  outcome: PermitOutcome;
  onAgain: () => void;
  onBack: () => void;
}

export function PermitResult({ outcome, onAgain, onBack }: PermitResultProps) {
  return (
    <RoundResult
      summary={outcome.summary}
      outcome={outcome}
      countLabel={t('permit.result.handled')}
      review={
        <section className={styles.review}>
          <h2 className={styles.title}>{t('permit.result.review')}</h2>
          {outcome.toReview.length === 0 ? (
            <p className={styles.muted}>{t('permit.result.perfect')}</p>
          ) : (
            outcome.toReview.map(({ permit, credit, missed }) => (
              <Card key={permit.id}>
                <div className={styles.item}>
                  <strong>{permit.title}</strong>
                  <span className={styles.muted}>{t('permit.result.credit', { percent: formatNumber(Math.round(credit * 100)) })}</span>
                  {missed.length > 0 ? (
                    <div>
                      <span className={styles.mini}>{t('permit.result.missed')}</span>
                      <ul className={styles.missed}>
                        {missed.map((why) => (
                          <li key={why}>{why}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <p className={styles.muted}>{permit.explanation}</p>
                </div>
              </Card>
            ))
          )}
        </section>
      }
      actions={
        <>
          <Button size="lg" fullWidth onClick={onAgain}>
            {t('permit.result.again')}
          </Button>
          <Button variant="ghost" fullWidth onClick={onBack}>
            {t('permit.result.back')}
          </Button>
        </>
      }
    />
  );
}
