import type { BowtieCase, BowtieCategory } from '@/content/schema';
import type { RoundSummary } from '@/domain/round';
import { formatNumber, t } from '@/i18n';
import { Button, Card } from '@/ui';
import type { FinishOutcome } from '../shared/finishRound';
import { RoundResult } from '../shared/RoundResult';
import styles from './BowtieResult.module.css';

export interface BowtieOutcome extends FinishOutcome {
  summary: RoundSummary;
  /** Bowties that did not earn full credit, with the cards that sat in the wrong group. */
  toReview: Array<{ bowtie: BowtieCase; credit: number; wrong: Array<{ text: string; belongs: BowtieCategory }> }>;
}

interface BowtieResultProps {
  outcome: BowtieOutcome;
  onAgain: () => void;
  onBack: () => void;
}

export function BowtieResult({ outcome, onAgain, onBack }: BowtieResultProps) {
  return (
    <RoundResult
      summary={outcome.summary}
      outcome={outcome}
      countLabel={t('bowtie.result.handled')}
      review={
        <section className={styles.review}>
          <h2 className={styles.title}>{t('bowtie.result.review')}</h2>
          {outcome.toReview.length === 0 ? (
            <p className={styles.muted}>{t('bowtie.result.perfect')}</p>
          ) : (
            outcome.toReview.map(({ bowtie, credit, wrong }) => (
              <Card key={bowtie.id}>
                <div className={styles.item}>
                  <strong>{bowtie.title}</strong>
                  <span className={styles.muted}>{t('bowtie.result.credit', { percent: formatNumber(Math.round(credit * 100)) })}</span>
                  <div>
                    <span className={styles.mini}>{t('bowtie.result.wrong')}</span>
                    <ul className={styles.wrong}>
                      {wrong.map(({ text, belongs }) => (
                        <li key={text}>
                          {text} — {t('bowtie.result.belongs', { group: t(`bowtie.group.${belongs}`) })}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p className={styles.muted}>{bowtie.explanation}</p>
                </div>
              </Card>
            ))
          )}
        </section>
      }
      actions={
        <>
          <Button size="lg" fullWidth onClick={onAgain}>
            {t('bowtie.result.again')}
          </Button>
          <Button variant="ghost" fullWidth onClick={onBack}>
            {t('bowtie.result.back')}
          </Button>
        </>
      }
    />
  );
}
