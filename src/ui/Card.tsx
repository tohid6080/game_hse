import type { HTMLAttributes } from 'react';
import styles from './Card.module.css';
import { cx } from './cx';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: 'default' | 'accent' | 'muted';
}

export function Card({ tone = 'default', className, ...rest }: CardProps) {
  return <div className={cx(styles.card, styles[tone], className)} {...rest} />;
}
