import type { BadgeId } from '@/domain/badges';
import { BADGE_ICONS } from './badgeMeta';
import styles from './BadgeHex.module.css';

interface BadgeHexProps {
  id: BadgeId;
  /** 0 = locked, 1 bronze, 2 silver, 3 gold. */
  tier: 0 | 1 | 2 | 3;
  size?: number;
  /** Accessible name; when omitted the hexagon is decorative. */
  label?: string;
}

// Pointy-top hexagon in a 100×100 box.
const HEX = '50,4 91,27 91,73 50,96 9,73 9,27';
const TIER_CLASS = [styles.locked, styles.bronze, styles.silver, styles.gold] as const;

/**
 * A medal: hexagon in the tier colour, the medal's icon, and three pips that fill with the tier, so
 * the level never depends on colour alone.
 */
export function BadgeHex({ id, tier, size = 72, label }: BadgeHexProps) {
  const Icon = BADGE_ICONS[id];
  return (
    <svg
      className={TIER_CLASS[tier]}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <polygon className={styles.hex} points={HEX} />
      <Icon className={styles.icon} x={30} y={25} width={40} height={40} strokeWidth={2} />
      {[0, 1, 2].map((index) => (
        <circle key={index} className={index < tier ? styles.pipOn : styles.pipOff} cx={36 + index * 14} cy={79} r={4} />
      ))}
    </svg>
  );
}
