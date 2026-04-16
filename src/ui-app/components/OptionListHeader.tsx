import React from 'react';
import styles from './OptionListHeader.module.css';

type OptionListHeaderProps = {
  label: string;
  className?: string;
};

export function OptionListHeader({
  label,
  className,
}: OptionListHeaderProps): React.JSX.Element {
  const rootClassName = [styles.root, className].filter(Boolean).join(' ');

  return (
    <div className={rootClassName}>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
