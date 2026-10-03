import { Trophy } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LeaderboardPeriod, LeaderboardRow } from '@/domain/leaderboard';
import { formatNumber, t } from '@/i18n';
import { Avatar } from '@/profile/avatars';
import { Button, Card, Segmented, Tag, cx } from '@/ui';
import styles from './RankingView.module.css';

export interface RankingData {
  all: LeaderboardRow[];
  week: LeaderboardRow[];
}

interface RankingViewProps {
  data: RankingData;
  activeId: string | null;
}

const PODIUM = [styles.gold, styles.silver, styles.bronze] as const;

export function RankingView({ data, activeId }: RankingViewProps) {
  const [period, setPeriod] = useState<LeaderboardPeriod>('all');
  const navigate = useNavigate();
  const rows = data[period];
  const anyone = rows.some((row) => row.rank !== null);

  return (
    <div className={styles.view}>
      <div className={styles.head}>
        <h2 className={styles.title}>{t('ranking.title')}</h2>
        <p className={styles.muted}>{t('ranking.subtitle')}</p>
      </div>

      <Segmented
        label={t('ranking.period')}
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'all', label: t('ranking.period.all') },
          { value: 'week', label: t('ranking.period.week') },
        ]}
      />

      {!anyone ? <p className={styles.muted}>{t('ranking.nobody')}</p> : null}

      <ol className={styles.list} aria-label={t('ranking.title')}>
        {rows.map((row) => {
          const mine = row.profileId === activeId;
          return (
            <li key={row.profileId} data-profile={row.nickname} data-rank={row.rank ?? ''}>
              <Card tone={mine ? 'accent' : 'default'}>
                <div className={styles.row}>
                  <span
                    className={cx(styles.rank, row.rank !== null && row.rank <= 3 && PODIUM[row.rank - 1])}
                    aria-label={row.rank === null ? t('ranking.unranked') : t('ranking.rank', { rank: row.rank })}
                  >
                    {row.rank === null ? '—' : formatNumber(row.rank)}
                  </span>
                  <Avatar avatarId={row.avatarId} size={40} />
                  <div className={styles.who}>
                    <strong className={styles.name}>
                      {row.nickname} {mine ? <Tag tone="primary">{t('ranking.you')}</Tag> : null}
                    </strong>
                    <span className={styles.muted}>{t('ranking.rounds', { count: row.rounds })}</span>
                  </div>
                  <Tag tone={row.rank === null ? 'neutral' : 'success'}>{t('result.xp', { xp: row.xp })}</Tag>
                </div>
              </Card>
            </li>
          );
        })}
      </ol>

      {rows.length < 2 ? (
        <Card tone="muted">
          <div className={styles.single}>
            <Trophy size={22} aria-hidden="true" />
            <p>{t('ranking.single')}</p>
            <Button variant="secondary" onClick={() => navigate('/settings')}>
              {t('ranking.toSettings')}
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
