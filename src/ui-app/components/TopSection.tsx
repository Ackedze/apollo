import React from 'react';
import { Button } from './Button';
import styles from './TopSection.module.css';

type TopSectionProps = {
  title: string;
  actionLabel: string;
  actionDisabled: boolean;
  actionLoading: boolean;
  actionType: 'primary' | 'secondary';
  onActionPress: () => void;
};

export function TopSection({
  title,
  actionLabel,
  actionDisabled,
  actionLoading,
  actionType,
  onActionPress,
}: TopSectionProps): React.JSX.Element {
  const actionKey = [
    actionType,
    actionLabel,
    actionDisabled ? 'disabled' : 'enabled',
    actionLoading ? 'loading' : 'idle',
  ].join(':');

  return (
    <div className={styles.root}>
      <div className={styles.titleButton}>
        {title}
      </div>
      <Button
        key={actionKey}
        label={actionLabel}
        disabled={actionDisabled}
        loading={actionLoading}
        type={actionType}
        onPress={onActionPress}
      />
    </div>
  );
}
