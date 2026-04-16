import React from 'react';
import styles from './IconSlot.module.css';

export type IconSlotSize = 16 | 20 | 24;

type IconSlotProps = {
  size: IconSlotSize;
  children: React.ReactNode;
  className?: string;
};

export function IconSlot({
  size,
  children,
  className,
}: IconSlotProps): React.JSX.Element {
  const slotClassName = [
    styles.root,
    size === 24 ? styles.size24 : size === 20 ? styles.size20 : styles.size16,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <span className={slotClassName}>{children}</span>;
}
