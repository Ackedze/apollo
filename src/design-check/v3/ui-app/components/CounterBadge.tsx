import React from 'react';
import styles from "./CounterBadge.module.css";

type CounterBadgeProps = {
  count: number | null;
  type: 'empty' | 'error' | 'warning' | 'general';
};

export function CounterBadge({
  count,
  type,
}: CounterBadgeProps): React.JSX.Element {
  const className = [
    styles.badge,
    styles[type],
  ]
    .filter(Boolean)
    .join(' ');

  return <span className={className} aria-label={count === null ? 'Не проверено' : undefined}>{count === null ? '—' : count}</span>;
}
