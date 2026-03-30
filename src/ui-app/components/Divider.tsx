import React from 'react';
import styles from './Divider.module.css';

export function Divider(): React.JSX.Element {
  return (
    <div className={styles.root} aria-hidden="true">
      <div className={styles.line} />
    </div>
  );
}
