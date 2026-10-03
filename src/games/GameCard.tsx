import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { t } from '@/i18n';
import { Card, Tag } from '@/ui';
import styles from './GameCard.module.css';
import type { GameDefinition } from './registry';

/** A playable game is a link into its hub; games still being built are plain, labelled cards. */
export function GameCard({ game }: { game: GameDefinition }) {
  const Icon = game.icon;
  const card = (
    <Card className={styles.card}>
      <span className={styles.icon} aria-hidden="true">
        <Icon size={26} />
      </span>
      <div className={styles.text}>
        <h3 className={styles.name}>{t(`game.${game.id}.name`)}</h3>
        <p className={styles.desc}>{t(`game.${game.id}.desc`)}</p>
        <div className={styles.tags}>
          <Tag tone="info">{t(`competency.${game.competency}`)}</Tag>
          {game.status === 'planned' ? <Tag>{t('common.comingSoon')}</Tag> : null}
          {game.status === 'in-development' ? <Tag tone="primary">{t('common.inDevelopment')}</Tag> : null}
        </div>
      </div>
      {game.status === 'available' ? <ChevronLeft size={22} className={styles.chevron} aria-hidden="true" /> : null}
    </Card>
  );

  if (game.status === 'available' && game.route) {
    return (
      <Link to={game.route} className={styles.link}>
        {card}
      </Link>
    );
  }
  return card;
}
