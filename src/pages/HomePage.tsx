import { ChevronLeft, Flame, ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { rankTierForLevel } from '@/domain/levels';
import { GameCard } from '@/games/GameCard';
import { gamesByTier } from '@/games/registry';
import { useDueCount } from '@/games/quiz/useDueCount';
import { t } from '@/i18n';
import { Avatar } from '@/profile/avatars';
import { selectActiveProfile, useProfileStore } from '@/state/profileStore';
import { useActiveDaily, useActiveStreak, useLevelProgress } from '@/state/progressStore';
import { Card, ProgressBar, Tag } from '@/ui';
import styles from './pages.module.css';

export function HomePage() {
  const profile = useProfileStore(selectActiveProfile);
  const progress = useLevelProgress();
  const dueCount = useDueCount();
  const streak = useActiveStreak();
  const daily = useActiveDaily();
  const rank = rankTierForLevel(progress.level);

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <span className={styles.logo} aria-hidden="true">
          <ShieldCheck size={36} />
        </span>
        <div>
          <h1 className={styles.brand}>{t('app.name')}</h1>
          <p className={styles.muted}>
            {t('app.subtitle')} · {t('app.tagline')}
          </p>
        </div>
      </div>

      {profile ? (
        <div className={styles.iconRow}>
          <Avatar avatarId={profile.avatarId} size={40} />
          <p>{t('home.greetingName', { name: profile.nickname })}</p>
        </div>
      ) : null}

      <Card>
        <div className={styles.stack}>
          <div className={styles.split}>
            <span className={styles.strong}>{t('home.level', { level: progress.level })}</span>
            <Tag tone="primary">{t(`rank.${rank}`)}</Tag>
          </div>
          <ProgressBar value={progress.fraction} label={t('home.level', { level: progress.level })} />
          <span className={styles.muted}>
            {t('home.xp', { current: progress.xpIntoLevel, total: progress.xpForNextLevel })}
          </span>
        </div>
      </Card>

      <Link to="/games/quiz" className={styles.cardLink}>
        <Card tone="accent">
          <div className={styles.split}>
            <div className={styles.stack}>
              <span className={styles.strong}>{t('home.continue')}</span>
              <span className={styles.muted}>{t('home.continueBody')}</span>
              {dueCount > 0 ? <Tag tone="info">{t('home.weakDue', { count: dueCount })}</Tag> : null}
            </div>
            <ChevronLeft size={24} aria-hidden="true" />
          </div>
        </Card>
      </Link>

      <Link to="/daily" className={styles.cardLink}>
        <Card tone={daily.complete ? 'muted' : 'default'}>
          <div className={styles.split}>
            <div className={styles.stack}>
              <span className={styles.iconRow}>
                <Sparkles size={22} aria-hidden="true" />
                <span className={styles.strong}>{t('home.dailyTitle')}</span>
              </span>
              <span className={styles.muted}>{t('home.dailyBody')}</span>
              <span className={styles.iconRow}>
                <Tag tone={daily.complete ? 'success' : 'info'}>
                  {t('home.dailyProgress', { done: daily.doneCount, total: daily.tasks.length })}
                </Tag>
                {streak.current > 0 ? (
                  <Tag tone="primary">
                    <Flame size={14} aria-hidden="true" /> {t('daily.streak.days', { count: streak.current })}
                  </Tag>
                ) : null}
              </span>
            </div>
            <ChevronLeft size={24} aria-hidden="true" />
          </div>
        </Card>
      </Link>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>{t('home.coreGames')}</h2>
          <Link to="/games" className={styles.link}>
            {t('home.allGames')}
          </Link>
        </div>
        {gamesByTier('core').map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </section>
    </div>
  );
}
