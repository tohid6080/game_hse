import { ChevronLeft, GraduationCap, RotateCcw, Shuffle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { HSE_TOPICS } from '@/domain/topics';
import { t } from '@/i18n';
import { selectActiveProfile, useProfileStore } from '@/state/profileStore';
import type { QuestionStatRow } from '@/storage/db';
import { repos } from '@/storage/repositories';
import { Card, EmptyState, PageHeader, ProgressBar, Tag } from '@/ui';
import { dueQuestions, modeToSearch, questionsForIndustry, type QuizMode } from './engine';
import styles from './QuizHub.module.css';
import { useQuizBank } from './useQuizBank';

const playLink = (mode: QuizMode) => `/games/quiz/play?${modeToSearch(mode)}`;

export function QuizHub() {
  const { pack, failed } = useQuizBank();
  const profile = useProfileStore(selectActiveProfile);
  const profileId = profile?.id;
  // `at` is the moment the stats were read, so "due" is evaluated against a fixed instant.
  const [loaded, setLoaded] = useState<{ rows: ReadonlyMap<string, QuestionStatRow>; at: number } | null>(null);
  const stats = loaded?.rows ?? null;

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    repos()
      .questionStats.getAll(profileId)
      .then(
        (rows) => !cancelled && setLoaded({ rows, at: Date.now() }),
        () => !cancelled && setLoaded({ rows: new Map(), at: Date.now() }),
      );
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const industry = profile?.industry ?? 'general';
  const visible = useMemo(() => (pack ? questionsForIndustry(pack.questions, industry) : []), [pack, industry]);
  const dueCount = useMemo(
    () => (pack && loaded ? dueQuestions(pack.questions, loaded.rows, loaded.at, industry).length : 0),
    [pack, loaded, industry],
  );

  if (failed) {
    return (
      <div className={styles.page}>
        <PageHeader title={t('quiz.title')} />
        <EmptyState icon={GraduationCap} title={t('quiz.error.title')} body={t('quiz.error.body')} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader title={t('quiz.title')} subtitle={t('quiz.subtitle')} />

      <section className={styles.modes}>
        <Link to={playLink({ kind: 'mixed' })} className={styles.link}>
          <Card tone="accent" className={styles.mode}>
            <Shuffle size={26} aria-hidden="true" />
            <div className={styles.modeText}>
              <strong>{t('quiz.mixed')}</strong>
              <span>{t('quiz.mixedDesc')}</span>
            </div>
            <ChevronLeft size={22} aria-hidden="true" />
          </Card>
        </Link>

        {dueCount > 0 ? (
          <Link to={playLink({ kind: 'weak' })} className={styles.link}>
            <Card className={styles.mode}>
              <RotateCcw size={26} aria-hidden="true" />
              <div className={styles.modeText}>
                <strong>{t('quiz.weak')}</strong>
                <span>{t('quiz.weakDesc', { count: dueCount })}</span>
              </div>
              <ChevronLeft size={22} aria-hidden="true" />
            </Card>
          </Link>
        ) : (
          <Card tone="muted" className={styles.mode}>
            <RotateCcw size={26} aria-hidden="true" />
            <div className={styles.modeText}>
              <strong>{t('quiz.weak')}</strong>
              <span>{t('quiz.weakNone')}</span>
            </div>
          </Card>
        )}
      </section>

      <section className={styles.topics}>
        <h2 className={styles.sectionTitle}>{t('quiz.topics')}</h2>
        {HSE_TOPICS.map((topic) => {
          const inTopic = visible.filter((question) => question.topic === topic);
          if (inTopic.length === 0) return null;
          const seen = stats ? inTopic.filter((question) => stats.has(question.id)).length : 0;
          return (
            <Link key={topic} to={playLink({ kind: 'topic', topic })} className={styles.link}>
              <Card className={styles.topic}>
                <div className={styles.topicHead}>
                  <strong>{t(`topic.${topic}`)}</strong>
                  <Tag>{t('quiz.topicCount', { count: inTopic.length })}</Tag>
                </div>
                <ProgressBar value={seen / inTopic.length} label={t('quiz.topicProgress', { seen, total: inTopic.length })} />
                <span className={styles.progressText}>{t('quiz.topicProgress', { seen, total: inTopic.length })}</span>
              </Card>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
