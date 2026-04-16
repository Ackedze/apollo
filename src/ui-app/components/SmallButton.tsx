import React from 'react';
import { IconSlot } from './IconSlot';
import { PickerDiamondsIcon } from './PickerIcons';
import styles from './SmallButton.module.css';

type SmallButtonProps = {
  label?: string;
  hovered?: boolean;
  singleIcon?: boolean;
  icon?: React.ReactNode;
  onPress?: () => void;
};

export function SmallButton({
  label = 'Сбросить',
  hovered = false,
  singleIcon = true,
  icon,
  onPress,
}: SmallButtonProps): React.JSX.Element {
  const className = [
    styles.button,
    singleIcon ? styles.singleIcon : styles.withLabel,
    !singleIcon && hovered ? styles.withLabelHover : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type="button" className={className} onClick={onPress}>
      {singleIcon ? (
        <IconSlot size={16}>{icon ?? <PickerDiamondsIcon />}</IconSlot>
      ) : (
        <span className={styles.text}>{label}</span>
      )}
    </button>
  );
}
