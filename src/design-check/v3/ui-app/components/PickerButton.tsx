import React from 'react';
import { IconSlot, type IconSlotSize } from "./IconSlot";
import styles from "./PickerButton.module.css";
import {
  PickerChevronDownIcon,
  PickerChevronUpIcon,
  PickerDiamondsIcon,
} from "./PickerIcons";

type PickerButtonProps = {
  label: string;
  open?: boolean;
  selected?: boolean;
  disabled?: boolean;
  compact?: boolean;
  leadingIcon?: React.ReactNode;
  iconSize?: IconSlotSize;
  className?: string;
  onPress?: () => void;
};

export function PickerButton({
  label,
  open = false,
  selected = false,
  disabled = false,
  compact = false,
  leadingIcon,
  iconSize = 16,
  className,
  onPress,
}: PickerButtonProps): React.JSX.Element {
  const buttonClassName = [
    styles.button,
    compact ? styles.compact : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
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
      {selected ? <IconSlot size={iconSize}>{selectedIcon}</IconSlot> : null}
      <span className={[styles.label, 'design-check-picker-label'].join(' ')}>{label}</span>
      <IconSlot size={iconSize}>{chevronIcon}</IconSlot>
    </button>
  );
}
