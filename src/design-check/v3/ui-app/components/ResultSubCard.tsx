import React from 'react';
import { createPortal } from 'react-dom';
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
  marker?: 'Expected';
  ruleText?: string;
};

type ResultSubCardProps = {
  name: string;
  hovered?: boolean;
  showFocus?: boolean;
  onFocus?: () => void;
  actions?: ResultAction[];
  actionSlot?: React.ReactNode;
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

type RuleTooltipPosition = {
  top?: number;
  bottom?: number;
  left: number;
};

function RuleInfo({ text }: { text: string }): React.JSX.Element {
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const tooltipId = React.useId();
  const [position, setPosition] = React.useState<RuleTooltipPosition | null>(null);

  const showTooltip = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const tooltipWidth = Math.min(320, window.innerWidth - 16);
    const left = Math.max(
      8,
      Math.min(rect.left - 12, window.innerWidth - tooltipWidth - 8),
    );
    if (window.innerHeight - rect.bottom >= 120) {
      setPosition({ top: rect.bottom + 8, left });
      return;
    }
    setPosition({ bottom: window.innerHeight - rect.top + 8, left });
  };

  return (
    <span
      className={styles.ruleInfo}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        ref={buttonRef}
        type="button"
        className={styles.ruleInfoButton}
        aria-label="Показать нарушенное правило"
        aria-describedby={position ? tooltipId : undefined}
        onMouseEnter={showTooltip}
        onMouseLeave={() => setPosition(null)}
        onFocus={showTooltip}
        onBlur={() => setPosition(null)}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 7.25V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="4.75" r="0.75" fill="currentColor" />
        </svg>
      </button>
      {position
        ? createPortal(
            <div
              id={tooltipId}
              role="tooltip"
              className={styles.ruleTooltip}
              style={position}
            >
              {text}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

export function ResultSubCard({
  name,
  hovered = false,
  showFocus = false,
  onFocus,
  actions = [],
  actionSlot,
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
        {actionSlot || actions.length ? (
          <div className={styles.actions}>
            {actionSlot}
            {actions.map((action, index) => (
              <div
                key={`${action.label ?? 'icon'}:${index}`}
                className={styles.actionItem}
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
          {normalizedValueLines.map((line, lineIndex) =>
            line.values.length === 0 ? (
              <div
                className={styles.valueSectionHeader}
                key={`${line.label}:${lineIndex}`}
              >
                {line.label}
              </div>
            ) : (
              <div className={styles.valueLine} key={`${line.label}:${lineIndex}`}>
                <div className={styles.valueHeader}>
                  <span>{line.label}</span>
                  {line.ruleText ? <RuleInfo text={line.ruleText} /> : null}
                  <span>:</span>
                </div>
                {line.marker ? (
                  <span className={styles.valueMarker}>{line.marker}</span>
                ) : null}
                <div className={styles.valueBody}>
                  {line.values.map((part, index) => (
                    <React.Fragment key={`${part}:${index}`}>
                      {index > 0 ? <span>→</span> : null}
                      <span className={styles.valuePart}>{part}</span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ),
          )}
        </div>
      ) : null}

      {hasChildren ? <div className={styles.stack}>{children}</div> : null}
    </div>
  );
}
