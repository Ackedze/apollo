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
  onTitlePress: () => void;
};

export function TopSection({
  title,
  actionLabel,
  actionDisabled,
  actionLoading,
  actionType,
  onActionPress,
  onTitlePress,
}: TopSectionProps): React.JSX.Element {
  const actionKey = [
    actionType,
    actionLabel,
    actionDisabled ? 'disabled' : 'enabled',
    actionLoading ? 'loading' : 'idle',
  ].join(':');

  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.titleButton}
        onClick={onTitlePress}
        title="Apollo"
      >
        {title}
      </button>
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
