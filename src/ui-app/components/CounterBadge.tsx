import React from 'react';
import styles from './CounterBadge.module.css';

type CounterBadgeProps = {
  count: number;
  active?: boolean;
};

export function CounterBadge({
  count,
  active = false,
}: CounterBadgeProps): React.JSX.Element {
  const className = [
    styles.badge,
    active ? styles.active : styles.muted,
  ]
    .filter(Boolean)
    .join(' ');

  return <span className={className}>{count}</span>;
}
