import React from 'react';
import { IconSlot } from './IconSlot';
import { PickerDiamondsIcon } from './PickerIcons';
import styles from './SmallButton.module.css';

type SmallButtonProps = {
  label?: string;
  ariaLabel?: string;
  title?: string;
  hovered?: boolean;
  active?: boolean;
  disabled?: boolean;
  singleIcon?: boolean;
  icon?: React.ReactNode;
  className?: string;
  onPress?: () => void;
};

export function SmallButton({
  label = 'Сбросить',
  ariaLabel,
  title,
  hovered = false,
  active = false,
  disabled = false,
  singleIcon = true,
  icon,
  className: customClassName,
  onPress,
}: SmallButtonProps): React.JSX.Element {
  const className = [
    styles.button,
    singleIcon ? styles.singleIcon : styles.withLabel,
    active ? styles.active : '',
    !singleIcon && hovered ? styles.withLabelHover : '',
    customClassName,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      aria-pressed={active}
      title={title ?? ariaLabel ?? label}
      onClick={onPress}
    >
      {singleIcon ? (
        <IconSlot size={16}>{icon ?? <PickerDiamondsIcon />}</IconSlot>
      ) : (
        <span className={styles.text}>{label}</span>
      )}
    </button>
  );
}
