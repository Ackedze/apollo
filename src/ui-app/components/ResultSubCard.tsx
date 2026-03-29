import React from 'react';
import { SmallButton } from './SmallButton';
import styles from './ResultSubCard.module.css';

type ResultAction = {
  label?: string;
  singleIcon?: boolean;
  icon?: React.ReactNode;
  onPress?: () => void;
};

type ResultValueLine = {
  label: string;
  values: string[];
};

type ResultSubCardProps = {
  name: string;
  hovered?: boolean;
  showFocus?: boolean;
  onFocus?: () => void;
  actions?: ResultAction[];
  valueLabel?: string;
  valueParts?: string[];
  valueLines?: ResultValueLine[];
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

export function ResultSubCard({
  name,
  hovered = false,
  showFocus = false,
  onFocus,
  actions = [],
  valueLabel,
  valueParts = [],
  valueLines = [],
  children,
}: ResultSubCardProps): React.JSX.Element {
  const className = [styles.card, hovered ? styles.hovered : '']
    .filter(Boolean)
    .join(' ');

  const hasValue = valueLabel && valueParts.length > 0;
  const normalizedValueLines =
    valueLines.length > 0
      ? valueLines
      : hasValue
        ? [{ label: valueLabel, values: valueParts }]
        : [];
  const hasRenderedValues = normalizedValueLines.length > 0;
  const hasChildren = React.Children.count(children) > 0;
  const interactiveProps = onFocus
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick: (event: React.MouseEvent<HTMLDivElement>) => {
          event.stopPropagation();
          onFocus();
        },
        onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            onFocus();
          }
        },
      }
    : {};

  return (
    <div className={className} {...interactiveProps}>
      <div className={styles.topLine}>
        <div className={styles.nameWrap}>
          <span className={styles.name}>{name}</span>
          {showFocus ? (
            <div className={styles.focusAction}>
              <SmallButton singleIcon icon={<ArrowRightIcon />} onPress={onFocus} />
            </div>
          ) : null}
        </div>
        {actions.length ? (
          <div className={styles.actions}>
            {actions.map((action, index) => (
              <div
                key={`${action.label ?? 'icon'}:${index}`}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <SmallButton
                  singleIcon={action.singleIcon ?? false}
                  label={action.label}
                  icon={action.icon}
                  onPress={action.onPress}
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {hasRenderedValues ? (
        <div className={styles.values}>
          {normalizedValueLines.map((line, lineIndex) => (
            <div className={styles.valueLine} key={`${line.label}:${lineIndex}`}>
              <div className={styles.valueHeader}>
                <span>{line.label}</span>
                <span>:</span>
              </div>
                <div className={styles.valueBody}>
                {line.values.map((part, index) => (
                  <React.Fragment key={`${part}:${index}`}>
                    {index > 0 ? <span>→</span> : null}
                    <span className={styles.valuePart}>{part}</span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {hasChildren ? <div className={styles.stack}>{children}</div> : null}
    </div>
  );
}
