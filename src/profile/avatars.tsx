import { Eye, Flame, FlaskConical, Glasses, HardHat, Shield, Wrench, Zap, type LucideIcon } from 'lucide-react';
import styles from './Avatar.module.css';

export const AVATAR_IDS = ['hard-hat', 'shield', 'flame', 'zap', 'eye', 'wrench', 'flask', 'glasses'] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];

interface AvatarDef {
  id: AvatarId;
  icon: LucideIcon;
  /** Light enough for the dark icon ink to stay readable in both themes. */
  color: string;
}

export const AVATARS: readonly AvatarDef[] = [
  { id: 'hard-hat', icon: HardHat, color: '#ffb81c' },
  { id: 'shield', icon: Shield, color: '#5aaeff' },
  { id: 'flame', icon: Flame, color: '#ff8a4c' },
  { id: 'zap', icon: Zap, color: '#f5d547' },
  { id: 'eye', icon: Eye, color: '#4fd1c5' },
  { id: 'wrench', icon: Wrench, color: '#b79cff' },
  { id: 'flask', icon: FlaskConical, color: '#3ccf8e' },
  { id: 'glasses', icon: Glasses, color: '#ff8fb1' },
];

export const DEFAULT_AVATAR_ID: AvatarId = 'hard-hat';

/** Unknown ids (e.g. from an older/newer data file) fall back to the default avatar. */
function avatarFor(id: string): AvatarDef {
  return AVATARS.find((avatar) => avatar.id === id) ?? AVATARS[0]!;
}

export function Avatar({ avatarId, size = 48 }: { avatarId: string; size?: number }) {
  const { icon: Icon, color } = avatarFor(avatarId);
  return (
    <span
      className={styles.avatar}
      style={{ inlineSize: size, blockSize: size, background: color }}
      aria-hidden="true"
    >
      <Icon size={Math.round(size * 0.55)} />
    </span>
  );
}
