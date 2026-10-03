import type { LucideIcon } from 'lucide-react';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  icon: LucideIcon;
  title?: string;
  body: string;
}

export function EmptyState({ icon: Icon, title, body }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <span className={styles.icon} aria-hidden="true">
        <Icon size={32} />
      </span>
      {title ? <h2 className={styles.title}>{title}</h2> : null}
      <p className={styles.body}>{body}</p>
    </div>
  );
}
