import React from 'react';
import { IconSlot } from './IconSlot';
import styles from './OptionListCell.module.css';
import {
  PickerCheckmarkIcon,
  PickerDiamondsIcon,
} from './PickerIcons';

type OptionListCellProps = {
  label: string;
  hovered?: boolean;
  selected?: boolean;
  disabled?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  showLeadingIcon?: boolean;
  className?: string;
  onPress?: () => void;
};

export function OptionListCell({
  label,
  hovered = false,
  selected = false,
  disabled = false,
  leadingIcon,
  trailingIcon,
  showLeadingIcon = true,
  className,
  onPress,
}: OptionListCellProps): React.JSX.Element {
  const buttonClassName = [
    styles.button,
    hovered ? styles.hovered : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const leftAddon = leadingIcon ?? <PickerDiamondsIcon />;
  const rightAddon = trailingIcon ?? <PickerCheckmarkIcon />;

  return (
    <button
      type="button"
      className={buttonClassName}
      disabled={disabled}
      aria-selected={selected}
      onClick={onPress}
    >
      {showLeadingIcon ? <IconSlot size={16}>{leftAddon}</IconSlot> : null}
      <span className={styles.labelWrap}>
        <span className={styles.label}>{label}</span>
      </span>
      {selected ? <IconSlot size={16}>{rightAddon}</IconSlot> : null}
    </button>
  );
}
