import type { HTMLAttributes } from 'react';
import { cx } from './cx';
import styles from './Tag.module.css';

interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'primary' | 'info' | 'success';
}

export function Tag({ tone = 'neutral', className, ...rest }: TagProps) {
  return <span className={cx(styles.tag, styles[tone], className)} {...rest} />;
}
