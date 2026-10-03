import { Star, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { evaluateBadges, type BadgeStatus } from '@/domain/badges';
import { levelProgress, rankTierForLevel } from '@/domain/levels';
import { rankProfiles } from '@/domain/leaderboard';
import { computeRadar, type RadarAxis } from '@/domain/radar';
import { summarizeAttempts, type ProgressSummary } from '@/domain/stats';
import { formatDate, formatNumber, t, type MessageKey } from '@/i18n';
import { BadgesView } from '@/progress/BadgesView';
import { RadarView } from '@/progress/RadarView';
import { RankingView, type RankingData } from '@/progress/RankingView';
import { selectActiveProfile, useProfileStore } from '@/state/profileStore';
import { useActiveXp } from '@/state/progressStore';
import type { AttemptRow } from '@/storage/db';
import { repos } from '@/storage/repositories';
import { Button, Card, EmptyState, PageHeader, ProgressBar, Tabs, Tag, panelId, tabId } from '@/ui';
import styles from './pages.module.css';

type TabId = 'score' | 'badges' | 'radar' | 'ranking';
const TAB_IDS: readonly TabId[] = ['score', 'badges', 'radar', 'ranking'];
const TAB_PREFIX = 'progress';

interface Loaded {
  summary: ProgressSummary;
  recent: AttemptRow[];
  badges: BadgeStatus[];
  radar: RadarAxis[];
  ranking: RankingData;
}

function modeLabelKey(attempt: AttemptRow): MessageKey {
  const mode = attempt.detail?.mode;
  if (mode === 'topic') return 'progress.mode.topic';
  if (mode === 'weak') return 'progress.mode.weak';
  return 'progress.mode.mixed';
}

export function ProgressPage() {
  const profile = useProfileStore(selectActiveProfile);
  const profileId = profile?.id;
  const profiles = useProfileStore((state) => state.profiles);
  const xp = useActiveXp();
  const [data, setData] = useState<Loaded | null>(null);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: TabId = TAB_IDS.find((id) => id === requested) ?? 'score';
  const level = levelProgress(xp);

  const selectTab = (next: TabId) => setParams(next === 'score' ? {} : { tab: next }, { replace: true });

  // Re-read when XP changes (a round was just recorded), the profile switches, or profiles change.
  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    Promise.all([
      repos().attempts.listAll(profileId),
      repos().attempts.listByProfile(profileId, 5),
      Promise.all(profiles.map((entry) => repos().attempts.listAll(entry.id))),
    ])
      .then(([all, recent, everyone]) => {
        if (cancelled) return;
        const now = Date.now();
        const entries = profiles.map((entry, index) => ({
          profileId: entry.id,
          nickname: entry.nickname,
          avatarId: entry.avatarId,
          attempts: everyone[index] ?? [],
        }));
        setData({
          summary: summarizeAttempts(all),
          recent,
          badges: evaluateBadges(all, now),
          radar: computeRadar(all),
          ranking: { all: rankProfiles(entries, 'all', now), week: rankProfiles(entries, 'week', now) },
        });
      })
      .catch(() => {
        if (cancelled) return;
        const now = Date.now();
        setData({
          summary: summarizeAttempts([]),
          recent: [],
          badges: evaluateBadges([], now),
          radar: computeRadar([]),
          ranking: { all: [], week: [] },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, profiles, xp]);

  const summary = data?.summary;
  const bestScore = summary ? Math.max(0, ...Object.values(summary.bestScore)) : 0;

  const scoreTab = (
    <>
      {summary && summary.rounds === 0 ? (
        <div className={styles.stack}>
          <EmptyState icon={Trophy} body={t('progress.noRounds')} />
          <Button fullWidth onClick={() => navigate('/games/quiz')}>
            {t('progress.toQuiz')}
          </Button>
        </div>
      ) : null}

      {summary && summary.rounds > 0 ? (
        <>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('progress.score')}</h2>
            <div className={styles.statGrid}>
              <Card tone="muted" className={styles.stat}>
                <span className={styles.statValue}>{formatNumber(summary.rounds)}</span>
                <span className={styles.muted}>{t('progress.rounds')}</span>
              </Card>
              <Card tone="muted" className={styles.stat}>
                <span className={styles.statValue}>{formatNumber(Math.round(summary.accuracy * 100))}٪</span>
                <span className={styles.muted}>{t('progress.accuracy')}</span>
              </Card>
              <Card tone="muted" className={styles.stat}>
                <span className={styles.statValue}>{formatNumber(summary.threeStarRounds)}</span>
                <span className={styles.muted}>{t('progress.threeStar')}</span>
              </Card>
              <Card tone="muted" className={styles.stat}>
                <span className={styles.statValue}>{formatNumber(bestScore)}</span>
                <span className={styles.muted}>{t('progress.bestScore')}</span>
              </Card>
            </div>
          </section>

          {summary.topics.length > 0 ? (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('progress.topics')}</h2>
              <p className={styles.muted}>{t('progress.topicsHint')}</p>
              <ul className={styles.rows}>
                {summary.topics.map((topic) => {
                  const percent = Math.round(topic.accuracy * 100);
                  return (
                    <li key={topic.topic}>
                      <Card>
                        <div className={styles.stack}>
                          <div className={styles.split}>
                            <span className={styles.strong}>{t(`topic.${topic.topic}`)}</span>
                            <span className={styles.muted}>
                              {formatNumber(percent)}٪ · {t('progress.topicAnswers', { correct: topic.correct, answered: topic.answered })}
                            </span>
                          </div>
                          <ProgressBar value={topic.accuracy} label={`${t(`topic.${topic.topic}`)}: ${percent}%`} />
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('progress.recent')}</h2>
            <ul className={styles.rows}>
              {(data?.recent ?? []).map((attempt) => (
                <li key={attempt.id}>
                  <Card>
                    <div className={styles.split}>
                      <div className={styles.stack}>
                        <span className={styles.strong}>
                          {t(`game.${attempt.gameId}.name`)}
                          {attempt.gameId === 'quiz' ? ` · ${t(modeLabelKey(attempt))}` : ''}
                        </span>
                        <span className={styles.muted}>
                          {formatDate(attempt.finishedAt, { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                      </div>
                      <div className={styles.stack}>
                        <span className={styles.starsRow} role="img" aria-label={t('result.stars', { count: attempt.stars })}>
                          {[1, 2, 3].map((index) => (
                            <Star
                              key={index}
                              size={16}
                              fill={index <= attempt.stars ? 'currentColor' : 'none'}
                              aria-hidden="true"
                            />
                          ))}
                        </span>
                        <span className={styles.muted}>
                          {formatNumber(attempt.score)} · {t('result.xp', { xp: attempt.xp })}
                        </span>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

    </>
  );

  return (
    <div className={styles.page}>
      <PageHeader title={t('progress.title')} />

      <Card>
        <div className={styles.stack}>
          <div className={styles.split}>
            <span className={styles.strong}>{t('home.level', { level: level.level })}</span>
            <Tag tone="primary">{t(`rank.${rankTierForLevel(level.level)}`)}</Tag>
          </div>
          <ProgressBar value={level.fraction} label={t('home.level', { level: level.level })} />
          <div className={styles.split}>
            <span className={styles.muted}>
              {t('home.xp', { current: level.xpIntoLevel, total: level.xpForNextLevel })}
            </span>
            <span className={styles.muted}>{t('progress.xpTotal', { xp })}</span>
          </div>
        </div>
      </Card>

      <Tabs
        label={t('progress.tabs')}
        idPrefix={TAB_PREFIX}
        value={tab}
        onChange={selectTab}
        tabs={[
          { value: 'score', label: t('progress.tab.score') },
          { value: 'badges', label: t('progress.tab.badges') },
          { value: 'radar', label: t('progress.tab.radar') },
          { value: 'ranking', label: t('progress.tab.ranking') },
        ]}
      />

      <div
        role="tabpanel"
        id={panelId(TAB_PREFIX, tab)}
        aria-labelledby={tabId(TAB_PREFIX, tab)}
        className={styles.page}
      >
        {tab === 'score' ? scoreTab : null}
        {tab === 'badges' && data ? <BadgesView badges={data.badges} /> : null}
        {tab === 'radar' && data ? <RadarView axes={data.radar} /> : null}
        {tab === 'ranking' && data ? <RankingView data={data.ranking} activeId={profileId ?? null} /> : null}
      </div>
    </div>
  );
}
