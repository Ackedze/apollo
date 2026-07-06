import React from 'react';
import { IconSlot } from './IconSlot';
import styles from './Button.module.css';

type ButtonProps = {
  label: string;
  ariaLabel?: string;
  title?: string;
  disabled?: boolean;
  loading?: boolean;
  type?: 'primary' | 'secondary';
  size?: 'regular' | 'compact';
  singleIcon?: boolean;
  icon?: React.ReactNode;
  onPress: () => void;
};

export function Button({
  label,
  ariaLabel,
  title,
  disabled = false,
  loading = false,
  type = 'primary',
  size = 'regular',
  singleIcon = false,
  icon,
  onPress,
}: ButtonProps): React.JSX.Element {
  const className = [
    styles.button,
    type === 'secondary' ? styles.secondary : styles.primary,
    size === 'compact' ? styles.compact : '',
    singleIcon ? styles.singleIcon : '',
  ].join(' ');

  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      title={title ?? ariaLabel ?? label}
      onClick={onPress}
    >
      {loading ? <span className={styles.loader} aria-hidden="true" /> : null}
      {singleIcon ? (!loading ? <IconSlot size={20}>{icon}</IconSlot> : null) : <span className={styles.text}>{label}</span>}
    </button>
  );
}
