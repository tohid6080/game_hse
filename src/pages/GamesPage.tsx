import { GameCard } from '@/games/GameCard';
import { gamesByTier, type GameTier } from '@/games/registry';
import { t, type MessageKey } from '@/i18n';
import { PageHeader } from '@/ui';
import styles from './pages.module.css';

const SECTIONS: ReadonlyArray<{ tier: GameTier; title: MessageKey }> = [
  { tier: 'core', title: 'games.core' },
  { tier: 'later', title: 'games.later' },
];

export function GamesPage() {
  return (
    <div className={styles.page}>
      <PageHeader title={t('games.title')} subtitle={t('games.subtitle')} />
      {SECTIONS.map(({ tier, title }) => (
        <section key={tier} className={styles.section}>
          <h2 className={styles.sectionTitle}>{t(title)}</h2>
          {gamesByTier(tier).map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </section>
      ))}
    </div>
  );
}
