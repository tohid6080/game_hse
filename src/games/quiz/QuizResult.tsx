import type { QuizQuestion } from '@/content/schema';
import { t } from '@/i18n';
import { Button, Card } from '@/ui';
import { RoundResult } from '../shared/RoundResult';
import type { FinishOutcome } from '../shared/finishRound';
import { correctAnswerLines } from './answerText';
import type { RoundSummary } from './engine';
import styles from './QuizResult.module.css';

export interface RoundOutcome extends FinishOutcome {
  summary: RoundSummary;
  missed: QuizQuestion[];
}

interface QuizResultProps {
  outcome: RoundOutcome;
  onAgain: () => void;
  onWeakSpots: () => void;
  onBack: () => void;
}

export function QuizResult({ outcome, onAgain, onWeakSpots, onBack }: QuizResultProps) {
  const { missed } = outcome;

  return (
    <RoundResult
      summary={outcome.summary}
      outcome={outcome}
      countLabel={t('result.correct')}
      review={
        <section className={styles.review}>
          <h2 className={styles.reviewTitle}>{t('quiz.result.review')}</h2>
          {missed.length === 0 ? (
            <p className={styles.sub}>{t('quiz.result.perfect')}</p>
          ) : (
            missed.map((question) => (
              <Card key={question.id}>
                <div className={styles.missed}>
                  <strong>{question.prompt}</strong>
                  <div>
                    <span className={styles.miniLabel}>{t('quiz.play.correctAnswer')}</span>
                    {correctAnswerLines(question).map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                  <p className={styles.sub}>{question.explanation}</p>
                </div>
              </Card>
            ))
          )}
        </section>
      }
      actions={
        <>
          <Button size="lg" fullWidth onClick={onAgain}>
            {t('quiz.result.again')}
          </Button>
          {missed.length > 0 ? (
            <Button variant="secondary" fullWidth onClick={onWeakSpots}>
              {t('quiz.result.weak')}
            </Button>
          ) : null}
          <Button variant="ghost" fullWidth onClick={onBack}>
            {t('quiz.result.back')}
          </Button>
        </>
      }
    />
  );
}
