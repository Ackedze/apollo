import React from 'react';
import { Button } from './Button';
import { SmallButton } from './SmallButton';
import styles from './TopSection.module.css';

type TopSectionProps = {
  title: string;
  actionLabel: string;
  actionDisabled: boolean;
  actionLoading: boolean;
  actionType: 'primary' | 'secondary';
  compact: boolean;
  onActionPress: () => void;
  onToggleCompact: () => void;
};

function ArrowsInIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 3.5H3.5V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 12.5H12.5V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 6L6.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9.5 13L12.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ArrowsOutIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 3.5H3.5V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 12.5H12.5V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 6.5L3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function FlashIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M9.3 1.8 4.9 8h2.7l-0.9 6.2 4.4-6.2H8.4l0.9-6.2Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TopSection({
  title,
  actionLabel,
  actionDisabled,
  actionLoading,
  actionType,
  compact,
  onActionPress,
  onToggleCompact,
}: TopSectionProps): React.JSX.Element {
  const actionKey = [
    actionType,
    actionLabel,
    actionDisabled ? 'disabled' : 'enabled',
    actionLoading ? 'loading' : 'idle',
    compact ? 'compact' : 'full',
  ].join(':');

  return (
    <div className={[styles.root, compact ? styles.rootCompact : ''].filter(Boolean).join(' ')}>
      <div className={[styles.titleWrap, compact ? styles.titleWrapCompact : ''].filter(Boolean).join(' ')}>
        <div className={styles.titleButton}>
          {title}
        </div>
        <SmallButton
          singleIcon
          icon={compact ? <ArrowsOutIcon /> : <ArrowsInIcon />}
          onPress={onToggleCompact}
        />
      </div>
      <Button
        key={actionKey}
        label={actionLabel}
        disabled={actionDisabled}
        loading={actionLoading}
        type={actionType}
        singleIcon={compact}
        icon={<FlashIcon />}
        onPress={onActionPress}
      />
    </div>
  );
}
