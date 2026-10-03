import { useSearchParams } from 'react-router-dom';
import { taskOfGame } from '@/domain/daily';
import type { HseTopic } from '@/domain/topics';
import type { GameId } from '@/games/ids';
import { t } from '@/i18n';
import { useActiveDaily } from '@/state/progressStore';
import { Tag } from '@/ui';

/** Shown while playing a round opened from the Daily page whose mission is still open. */
export function DailyBadge({ gameId, topic }: { gameId: GameId; topic?: HseTopic }) {
  const [params] = useSearchParams();
  const daily = useActiveDaily();
  const id = taskOfGame(gameId);
  if (params.get('daily') !== '1' || !id || daily.done[id]) return null;
  const task = daily.tasks.find((candidate) => candidate.id === id);
  if (task?.topic && task.topic !== topic) return null;
  return <Tag tone="primary">{t('daily.badge')}</Tag>;
}
