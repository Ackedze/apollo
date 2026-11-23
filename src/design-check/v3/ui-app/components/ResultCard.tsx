import React from 'react';
import { SmallButton } from './SmallButton';
import styles from './ResultCard.module.css';

type ResultCardProps = {
  title: string;
  indicator?: React.ReactNode;
  actions?: React.ReactNode;
  caption?: string;
  hovered?: boolean;
  showFocus?: boolean;
  onFocus?: () => void;
  children?: React.ReactNode;
};

function ArrowRightIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
      <path
        d="M6 3.5L10.5 8L6 12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ResultCard({
  title,
  indicator,
  actions,
  caption,
  hovered = false,
  showFocus = false,
  onFocus,
  children,
}: ResultCardProps): React.JSX.Element {
  const className = [
    styles.card,
    hovered ? styles.hovered : '',
    onFocus ? styles.clickable : '',
  ]
    .filter(Boolean)
    .join(' ');

  const hasChildren = React.Children.count(children) > 0;
  const interactiveProps = onFocus
    ? {
        role: hasChildren ? undefined : 'button' as const,
        tabIndex: hasChildren ? undefined : 0,
        onClick: (event: React.MouseEvent<HTMLDivElement>) => {
          if (event.defaultPrevented || event.button !== 0 || !(event.target instanceof Element) || event.target.closest('button, select, summary, a, input, textarea') || document.getSelection()?.isCollapsed === false) return;
          onFocus();
        },
        onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
          if (!hasChildren && event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            onFocus();
          }
        },
      }
    : {};

  return (
    <div className={className} {...interactiveProps}>
      <div className={styles.topLine}>
        {indicator}
        <div className={styles.titleGroup}>
          <span className={styles.title}>{title}</span>
          {caption ? <span className={styles.caption}>{caption}</span> : null}
          {showFocus ? (
            <div className={styles.inlineFocus}>
              <SmallButton singleIcon icon={<ArrowRightIcon />} />
            </div>
          ) : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>

      {hasChildren ? (
        <>
          <div className={styles.dividerWrap}>
            <div className={styles.divider} />
          </div>
          <div className={styles.subcards}>{children}</div>
        </>
      ) : null}
    </div>
  );
}
