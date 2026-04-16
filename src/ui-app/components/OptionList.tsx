import React from 'react';
import styles from './OptionList.module.css';

type OptionListProps = {
  children?: React.ReactNode;
  className?: string;
};

export function OptionList({
  children,
  className,
}: OptionListProps): React.JSX.Element {
  const rootClassName = [styles.root, className].filter(Boolean).join(' ');

  return (
    <div className={rootClassName}>
      <div className={styles.container}>{children}</div>
    </div>
  );
}
