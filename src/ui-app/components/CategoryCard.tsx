import React from 'react';
import { CounterBadge } from './CounterBadge';
import styles from './CategoryCard.module.css';

type CategoryCardProps = {
  id: string;
  title: string;
  count: number;
  counterType: 'empty' | 'error' | 'warning' | 'general';
  active?: boolean;
  onPress: (id: string, count: number) => void;
};

export function CategoryCard({
  id,
  title,
  count,
  counterType,
  active = false,
  onPress,
}: CategoryCardProps): React.JSX.Element {
  const isEmpty = count === 0;
  const className = [
    styles.button,
    active ? styles.active : '',
    isEmpty ? styles.empty : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={className}
      onClick={() => onPress(id, count)}
      aria-pressed={active}
    >
      <span className={styles.title}>{title}</span>
      <CounterBadge count={count} type={counterType} />
    </button>
  );
}
