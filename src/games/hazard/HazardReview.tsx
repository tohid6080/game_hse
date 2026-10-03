import { CircleCheck, CircleX } from 'lucide-react';
import type { HazardScene } from '@/content/schema';
import { formatNumber, t } from '@/i18n';
import { Card, Tag } from '@/ui';
import { isFound, type HazardRound } from './engine';
import { HazardDetails } from './HazardDetails';
import { SceneMap, type Marker } from './HazardMarkers';
import styles from './HazardReview.module.css';

interface HazardReviewProps {
  scene: HazardScene;
  imageUrl: string;
  round: HazardRound;
}

/** Scene map (green found / dashed red missed, numbered) plus the lesson of every hazard. */
export function HazardReview({ scene, imageUrl, round }: HazardReviewProps) {
  const entries = scene.hazards.map((hazard, index) => ({ hazard, number: index + 1, found: isFound(round, hazard.id) }));
  const missed = entries.filter((entry) => !entry.found);
  const found = entries.filter((entry) => entry.found);
  const markers: Marker[] = entries.map(({ hazard, number, found: wasFound }) => ({
    key: hazard.id,
    kind: wasFound ? 'found' : 'missed',
    x: hazard.x,
    y: hazard.y,
    radius: hazard.radius,
    label: formatNumber(number),
  }));

  const renderEntry = (entry: (typeof entries)[number]) => (
    <Card key={entry.hazard.id}>
      <div className={styles.item}>
        <div className={styles.head}>
          {entry.found ? (
            <CircleCheck size={22} className={styles.ok} aria-hidden="true" />
          ) : (
            <CircleX size={22} className={styles.no} aria-hidden="true" />
          )}
          <Tag>{formatNumber(entry.number)}</Tag>
          <strong>{entry.hazard.title}</strong>
        </div>
        <HazardDetails hazard={entry.hazard} />
      </div>
    </Card>
  );

  return (
    <section className={styles.review}>
      <h2 className={styles.title}>{t('hazard.result.review')}</h2>
      <SceneMap src={imageUrl} alt={scene.imageAlt} width={scene.width} height={scene.height} markers={markers} />
      <p className={styles.caption}>{t('hazard.result.map')}</p>
      {round.misses > 0 ? <Tag tone="info">{t('hazard.result.misses', { count: round.misses })}</Tag> : null}

      {missed.length === 0 ? (
        <p className={styles.muted}>{t('hazard.result.perfect')}</p>
      ) : (
        <div className={styles.group}>
          <h3 className={styles.groupTitle}>{t('hazard.result.missed', { count: missed.length })}</h3>
          {missed.map(renderEntry)}
        </div>
      )}

      {found.length > 0 ? (
        <details className={styles.found}>
          <summary>{t('hazard.result.foundList', { count: found.length })}</summary>
          <div className={styles.group}>{found.map(renderEntry)}</div>
        </details>
      ) : null}
    </section>
  );
}
