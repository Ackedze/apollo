import React from 'react';
import { IconSlot } from './IconSlot';
import styles from './PickerButton.module.css';
import {
  PickerChevronDownIcon,
  PickerChevronUpIcon,
  PickerDiamondsIcon,
} from './PickerIcons';

type PickerButtonProps = {
  label: string;
  open?: boolean;
  selected?: boolean;
  disabled?: boolean;
  leadingIcon?: React.ReactNode;
  className?: string;
  onPress?: () => void;
};

export function PickerButton({
  label,
  open = false,
  selected = false,
  disabled = false,
  leadingIcon,
  className,
  onPress,
}: PickerButtonProps): React.JSX.Element {
  const buttonClassName = [styles.button, className].filter(Boolean).join(' ');
  const chevronIcon = open ? <PickerChevronUpIcon /> : <PickerChevronDownIcon />;
  const selectedIcon = leadingIcon ?? <PickerDiamondsIcon />;

  return (
    <button
      type="button"
      className={buttonClassName}
      disabled={disabled}
      aria-expanded={open}
      onClick={onPress}
    >
      {selected ? <IconSlot size={16}>{selectedIcon}</IconSlot> : null}
      <span className={styles.label}>{label}</span>
      <IconSlot size={16}>{chevronIcon}</IconSlot>
    </button>
  );
}
