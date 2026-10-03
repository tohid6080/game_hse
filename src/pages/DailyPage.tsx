import { Check, CircleCheck, Flame, PartyPopper } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DAILY_COMPLETION_BONUS, dailyTaskRoute, type DailyTask } from '@/domain/daily';
import { GAMES } from '@/games/registry';
import { formatDate, formatNumber, t } from '@/i18n';
import { useProfileStore } from '@/state/profileStore';
import { useActiveDaily, useActiveStreak, useProgressStore } from '@/state/progressStore';
import { Button, Card, PageHeader, ProgressBar, Tag, cx } from '@/ui';
import styles from './DailyPage.module.css';

/** A "YYYY-MM-DD" day key as a local date at noon (safe from DST edges when formatting). */
function dateOfKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day, 12);
}

function taskTitle(task: DailyTask): string {
  switch (task.id) {
    case 'quiz':
      return t('daily.task.quiz', { topic: t(`topic.${task.topic!}`) });
    case 'risk':
      return t('daily.task.risk');
    case 'hazard':
      return t('daily.task.hazard');
  }
}

export function DailyPage() {
  const activeId = useProfileStore((state) => state.activeId);
  const streak = useActiveStreak();
  const daily = useActiveDaily();
  const navigate = useNavigate();

  // The page may stay open across midnight or be reopened a day later: recompute for today.
  useEffect(() => {
    void useProgressStore.getState().refresh(activeId);
  }, [activeId]);

  const total = daily.tasks.length;
  const statusLine = streak.playedToday
    ? t('daily.streak.safe')
    : streak.atRisk
      ? t('daily.streak.atRisk')
      : t('daily.streak.none');

  return (
    <div className={styles.page}>
      <PageHeader title={t('daily.title')} subtitle={formatDate(dateOfKey(daily.dayKey), { dateStyle: 'full' })} />

      <Card tone="accent">
        <div className={styles.streak}>
          <div className={styles.streakHead}>
            <Flame size={34} className={streak.current > 0 ? styles.flameOn : styles.flameOff} aria-hidden="true" />
            <div>
              <strong className={styles.streakCount}>{t('daily.streak.days', { count: streak.current })}</strong>
              <p className={styles.muted}>{statusLine}</p>
            </div>
            {streak.best > 0 ? <Tag tone="info">{t('daily.streak.best', { count: streak.best })}</Tag> : null}
          </div>
          <ol className={styles.week} aria-label={t('daily.week')}>
            {streak.week.map((day) => {
              const name = formatDate(dateOfKey(day.key), { weekday: 'short' });
              const label = day.today
                ? t(day.played ? 'daily.day.todayPlayed' : 'daily.day.todayOpen', { day: name })
                : t(day.played ? 'daily.day.played' : 'daily.day.missed', { day: name });
              return (
                <li key={day.key} className={styles.day} aria-label={label}>
                  <span className={cx(styles.dot, day.played && styles.dotOn, day.today && styles.dotToday)} aria-hidden="true">
                    {day.played ? <Check size={16} /> : null}
                  </span>
                  <span className={styles.dayName} aria-hidden="true">
                    {name}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </Card>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.title}>{t('daily.tasks.title')}</h2>
          <Tag tone={daily.complete ? 'success' : 'neutral'}>{t('daily.tasks.progress', { done: daily.doneCount, total })}</Tag>
        </div>
        <ProgressBar value={daily.doneCount / total} label={t('daily.tasks.progress', { done: daily.doneCount, total })} />

        <ul className={styles.tasks}>
          {daily.tasks.map((task) => {
            const game = GAMES.find((candidate) => candidate.id === task.gameId);
            const Icon = game?.icon;
            const done = daily.done[task.id];
            return (
              <li key={task.id}>
                <Card tone={done ? 'muted' : 'default'}>
                  <div className={styles.task}>
                    <span className={styles.taskIcon} aria-hidden="true">
                      {Icon ? <Icon size={24} /> : null}
                    </span>
                    <div className={styles.taskText}>
                      <strong>{taskTitle(task)}</strong>
                      <span className={styles.muted}>{t('daily.badge')}</span>
                    </div>
                    {done ? (
                      <Tag tone="success">
                        <CircleCheck size={14} aria-hidden="true" /> {t('daily.task.done')}
                      </Tag>
                    ) : (
                      <Button onClick={() => navigate(dailyTaskRoute(task))}>{t('daily.task.go')}</Button>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      {daily.complete ? (
        <Card tone="accent" role="status">
          <div className={styles.complete}>
            <PartyPopper size={30} aria-hidden="true" />
            <div>
              <strong>{t('daily.complete.title')}</strong>
              <p className={styles.muted}>{t('daily.complete.body', { xp: formatNumber(DAILY_COMPLETION_BONUS) })}</p>
            </div>
          </div>
        </Card>
      ) : (
        <Card tone="muted">
          <p className={styles.muted}>{t('daily.rules')}</p>
          <p className={styles.muted}>{t('daily.bonus', { xp: formatNumber(DAILY_COMPLETION_BONUS) })}</p>
        </Card>
      )}
    </div>
  );
}
