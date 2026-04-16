import React from 'react';
import { IconSlot } from './IconSlot';
import styles from './Button.module.css';

type ButtonProps = {
  label: string;
  disabled?: boolean;
  loading?: boolean;
  type?: 'primary' | 'secondary';
  singleIcon?: boolean;
  icon?: React.ReactNode;
  onPress: () => void;
};

export function Button({
  label,
  disabled = false,
  loading = false,
  type = 'primary',
  singleIcon = false,
  icon,
  onPress,
}: ButtonProps): React.JSX.Element {
  const className = [
    styles.button,
    type === 'secondary' ? styles.secondary : styles.primary,
    singleIcon ? styles.singleIcon : '',
  ].join(' ');

  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      onClick={onPress}
    >
      {loading ? <span className={styles.loader} aria-hidden="true" /> : null}
      {singleIcon ? (!loading ? <IconSlot size={16}>{icon}</IconSlot> : null) : <span className={styles.text}>{label}</span>}
    </button>
  );
}
