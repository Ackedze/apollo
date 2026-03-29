import React from 'react';
import styles from './Placeholder.module.css';

type PlaceholderProps = {
  title: string;
  description: string;
};

export function Placeholder({
  title,
  description,
}: PlaceholderProps): React.JSX.Element {
  return (
    <div className={styles.root}>
      <div className={styles.title}>{title}</div>
      <div className={styles.description}>{description}</div>
    </div>
  );
}
