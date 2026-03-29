import React from 'react';
import styles from './Button.module.css';

type ButtonProps = {
  label: string;
  disabled?: boolean;
  loading?: boolean;
  type?: 'primary' | 'secondary';
  onPress: () => void;
};

export function Button({
  label,
  disabled = false,
  loading = false,
  type = 'primary',
  onPress,
}: ButtonProps): React.JSX.Element {
  const className = [
    styles.button,
    type === 'secondary' ? styles.secondary : styles.primary,
  ].join(' ');

  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      onClick={onPress}
    >
      {loading ? <span className={styles.loader} aria-hidden="true" /> : null}
      <span className={styles.text}>{label}</span>
    </button>
  );
}
