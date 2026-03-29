import React from 'react';
import styles from './SmallButton.module.css';

type SmallButtonProps = {
  label?: string;
  hovered?: boolean;
  singleIcon?: boolean;
  icon?: React.ReactNode;
  onPress?: () => void;
};

function DefaultDiamondsIcon(): React.JSX.Element {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M4.5 4.25 6.75 6.5 4.5 8.75 2.25 6.5 4.5 4.25Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M10.75 4.25 13 6.5 10.75 8.75 8.5 6.5 10.75 4.25Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M7.625 7.375 9.875 9.625 7.625 11.875 5.375 9.625 7.625 7.375Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

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
      {singleIcon ? (icon ?? <DefaultDiamondsIcon />) : <span className={styles.text}>{label}</span>}
    </button>
  );
}
