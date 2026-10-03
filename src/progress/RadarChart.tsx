import { useState } from 'react';
import { RADAR_MIN_ANSWERS, type RadarAxis } from '@/domain/radar';
import { formatNumber, t } from '@/i18n';
import styles from './RadarChart.module.css';

/*
 * Competency radar. One series (the player), so no legend box: the card title names it. Marks follow
 * the dataviz specs — 2px outline, ~14% fill wash, ≥8px vertices with a 2px surface ring, solid
 * hairline grid, labels in text tokens. The values are never tooltip-only: the table next to the
 * chart (RadarView) lists every number, and the chart itself is one labelled image.
 */

const WIDTH = 340;
const HEIGHT = 330;
const CX = WIDTH / 2;
const CY = 165;
const RADIUS = 98;
const LABEL_RADIUS = RADIUS + 26;
const RINGS = [0.25, 0.5, 0.75, 1] as const;
/** Fingertip-sized hit target around every vertex (diameter 32px at the 340px design width). */
const HIT_RADIUS = 16;

const percent = (value: number): string => `${formatNumber(Math.round(value * 100))}٪`;

function angleOf(index: number, count: number): number {
  return -Math.PI / 2 + (index * 2 * Math.PI) / count;
}

function pointAt(index: number, count: number, scale: number): { x: number; y: number } {
  const angle = angleOf(index, count);
  return { x: CX + Math.cos(angle) * RADIUS * scale, y: CY + Math.sin(angle) * RADIUS * scale };
}

/** Up to two lines, split at the space nearest the middle of a long label. */
function lines(text: string): string[] {
  if (text.length <= 10 || !text.includes(' ')) return [text];
  const spaces = [...text].map((char, index) => (char === ' ' ? index : -1)).filter((index) => index >= 0);
  const middle = spaces.reduce((best, index) => (Math.abs(index - text.length / 2) < Math.abs(best - text.length / 2) ? index : best));
  return [text.slice(0, middle), text.slice(middle + 1)];
}

export function RadarChart({ axes }: { axes: readonly RadarAxis[] }) {
  const [active, setActive] = useState<number | null>(null);
  const count = axes.length;
  const measured = axes.some((axis) => axis.value !== null);

  const vertices = axes.map((axis, index) => pointAt(index, count, axis.value ?? 0));
  // Domains without data all sit at the centre, so their hit targets (and tooltips) move to the
  // axis label instead of piling up on one another.
  const anchors = axes.map((axis, index) => (axis.value === null ? pointAt(index, count, (RADIUS + 22) / RADIUS) : vertices[index]!));
  const outline = vertices.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const summary = axes
    .map((axis) =>
      t('radar.ariaItem', { domain: t(`domain.${axis.domain}`), value: axis.value === null ? t('radar.noData') : percent(axis.value) }),
    )
    .join('، ');
  const shown = active === null ? null : axes[active];
  const shownPoint = active === null ? null : anchors[active];
  // Keep the tooltip on screen: centred over the vertex, sliding towards the chart's middle near the edges.
  const tipShift = shownPoint ? Math.min(85, Math.max(15, (shownPoint.x / WIDTH) * 100)) : 50;

  return (
    <div className={styles.chart} data-testid="radar" onPointerLeave={() => setActive(null)}>
      <svg className={styles.svg} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={t('radar.aria', { items: summary })}>
        {RINGS.map((ring) => (
          <polygon
            key={ring}
            className={styles.ring}
            points={axes.map((_, index) => `${pointAt(index, count, ring).x.toFixed(1)},${pointAt(index, count, ring).y.toFixed(1)}`).join(' ')}
          />
        ))}
        {axes.map((axis, index) => {
          const end = pointAt(index, count, 1);
          return <line key={axis.domain} className={styles.spoke} x1={CX} y1={CY} x2={end.x} y2={end.y} />;
        })}
        <text className={styles.tick} x={CX + 5} y={CY - RADIUS * 0.5 - 3}>
          {percent(0.5)}
        </text>
        <text className={styles.tick} x={CX + 5} y={CY - RADIUS - 3}>
          {percent(1)}
        </text>

        {measured ? <polygon className={styles.area} points={outline} /> : null}

        {axes.map((axis, index) => {
          const angle = angleOf(index, count);
          const lx = CX + Math.cos(angle) * LABEL_RADIUS;
          const ly = CY + Math.sin(angle) * LABEL_RADIUS;
          const anchor = Math.abs(Math.cos(angle)) < 0.2 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end';
          const parts = lines(t(`domain.${axis.domain}`));
          return (
            <text key={axis.domain} className={styles.label} x={lx} y={ly - ((parts.length - 1) * 8)} textAnchor={anchor} dominantBaseline="central">
              {parts.map((part, partIndex) => (
                <tspan key={part} x={lx} dy={partIndex === 0 ? 0 : 17}>
                  {part}
                </tspan>
              ))}
            </text>
          );
        })}

        {vertices.map((point, index) => {
          const axis = axes[index]!;
          const anchor = anchors[index]!;
          return (
            <g key={axis.domain}>
              {axis.value === null ? (
                <circle className={styles.empty} cx={point.x} cy={point.y} r={5} />
              ) : (
                <circle className={styles.vertex} cx={point.x} cy={point.y} r={5} />
              )}
              <circle
                className={styles.hit}
                data-axis={axis.domain}
                cx={anchor.x}
                cy={anchor.y}
                r={HIT_RADIUS}
                onPointerEnter={() => setActive(index)}
                onPointerDown={() => setActive(index)}
              />
            </g>
          );
        })}
      </svg>

      {shown && shownPoint ? (
        <div
          className={styles.tip}
          role="status"
          // Physical left/top on purpose: the chart's coordinates are left-to-right whatever the page direction.
          style={{
            left: `${(shownPoint.x / WIDTH) * 100}%`,
            top: `${(shownPoint.y / HEIGHT) * 100}%`,
            transform: `translate(-${tipShift}%, calc(-100% - 14px))`,
          }}
        >
          <strong className={styles.tipValue}>{shown.value === null ? t('radar.noData') : percent(shown.value)}</strong>
          <span className={styles.tipName}>{t(`domain.${shown.domain}`)}</span>
          <span className={styles.tipName}>
            {shown.value === null
              ? t('radar.tipNoData', { min: RADAR_MIN_ANSWERS, count: shown.answered })
              : t('radar.tipAnswers', { count: shown.answered })}
          </span>
        </div>
      ) : null}
    </div>
  );
}
