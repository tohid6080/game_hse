import { BookOpen, ChevronDown } from 'lucide-react';
import { t } from '@/i18n';
import { Card, cx } from '@/ui';
import styles from './HomeGuide.module.css';

const OUTPUT_KEYS = ['guide.output.xp', 'guide.output.medals', 'guide.output.radar', 'guide.output.review', 'guide.output.streak'] as const;
const STEP_KEYS = ['guide.step.pick', 'guide.step.shield', 'guide.step.feedback', 'guide.step.hint', 'guide.step.daily'] as const;

/**
 * The "how to play" card on Home: what the game is for, what the player gets out of it and how a round goes.
 * A native <details>, so keyboard and screen readers work with no code; Home opens it for a brand-new player.
 */
export function HomeGuide({ open }: { open: boolean }) {
  return (
    <Card>
      <details className={styles.guide} open={open}>
        <summary className={styles.summary}>
          <BookOpen size={24} aria-hidden="true" />
          <span className={styles.summaryText}>
            <span className={styles.title}>{t('guide.title')}</span>
            <span className={styles.subtitle}>{t('guide.subtitle')}</span>
          </span>
          <ChevronDown className={styles.chevron} size={22} aria-hidden="true" />
        </summary>

        <div className={styles.body}>
          <section className={styles.block}>
            <h2 className={styles.heading}>{t('guide.goal.title')}</h2>
            <p>{t('guide.goal.body')}</p>
          </section>

          <section className={styles.block}>
            <h2 className={styles.heading}>{t('guide.output.title')}</h2>
            <ul className={styles.list}>
              {OUTPUT_KEYS.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
          </section>

          <section className={styles.block}>
            <h2 className={styles.heading}>{t('guide.steps.title')}</h2>
            <ol className={cx(styles.list, styles.steps)}>
              {STEP_KEYS.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ol>
          </section>

          <p className={styles.note}>{t('guide.note')}</p>
        </div>
      </details>
    </Card>
  );
}
