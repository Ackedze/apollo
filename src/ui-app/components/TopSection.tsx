import React, { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { OptionList } from './OptionList';
import { OptionListCell } from './OptionListCell';
import { OptionListHeader } from './OptionListHeader';
import { PickerButton } from './PickerButton';
import {
  ArrowsInIcon,
  ArrowsOutIcon,
  FlashIcon,
  PickerAndroidIcon,
  PickerAppleIcon,
  PickerDisplayIcon,
  PickerMobilePhoneIcon,
} from './PickerIcons';
import { SmallButton } from './SmallButton';
import styles from './TopSection.module.css';

type TopSectionProps = {
  title: string;
  pickerLabel: string;
  actionLabel: string;
  actionDisabled: boolean;
  actionLoading: boolean;
  actionType: 'primary' | 'secondary';
  compact: boolean;
  onActionPress: () => void;
  onToggleCompact: () => void;
};

type PickerOption = {
  id: string;
  label: string;
  section: 'Web' | 'АБМ';
  icon: React.ReactNode;
};

const PICKER_OPTIONS: PickerOption[] = [
  {
    id: 'desktop',
    label: 'Desktop',
    section: 'Web',
    icon: <PickerDisplayIcon />,
  },
  {
    id: 'mobile-web',
    label: 'MobileWeb',
    section: 'Web',
    icon: <PickerMobilePhoneIcon />,
  },
  {
    id: 'ios',
    label: 'iOS',
    section: 'АБМ',
    icon: <PickerAppleIcon />,
  },
  {
    id: 'android',
    label: 'Android',
    section: 'АБМ',
    icon: <PickerAndroidIcon />,
  },
];

export function TopSection({
  title,
  pickerLabel,
  actionLabel,
  actionDisabled,
  actionLoading,
  actionType,
  compact,
  onActionPress,
  onToggleCompact,
}: TopSectionProps): React.JSX.Element {
  const pickerRootRef = useRef<HTMLDivElement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedPickerLabel, setSelectedPickerLabel] = useState(pickerLabel);

  useEffect(() => {
    setSelectedPickerLabel(pickerLabel);
  }, [pickerLabel]);

  useEffect(() => {
    if (compact || actionLoading) {
      setPickerOpen(false);
    }
  }, [compact, actionLoading]);

  useEffect(() => {
    if (!pickerOpen) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent): void {
      if (!pickerRootRef.current?.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setPickerOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [pickerOpen]);

  const selectedOption =
    PICKER_OPTIONS.find((option) => option.label === selectedPickerLabel) ??
    PICKER_OPTIONS[0];
  const actionKey = [
    selectedOption.label,
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
          icon={compact ? <ArrowsInIcon /> : <ArrowsOutIcon />}
          onPress={onToggleCompact}
        />
      </div>
      {compact ? (
        <Button
          key={actionKey}
          label={actionLabel}
          disabled={actionDisabled}
          loading={actionLoading}
          type={actionType}
          singleIcon
          icon={<FlashIcon />}
          onPress={onActionPress}
        />
      ) : (
        <div className={styles.rightSide}>
          <div className={styles.pickerWrap} ref={pickerRootRef}>
            <PickerButton
              label={selectedOption.label}
              open={pickerOpen}
              selected
              disabled={actionLoading}
              leadingIcon={selectedOption.icon}
              onPress={() => setPickerOpen((value) => !value)}
            />
            {pickerOpen ? (
              <OptionList className={styles.pickerMenu}>
                <OptionListHeader label="Web" />
                <OptionListCell
                  label="Desktop"
                  selected={selectedOption.id === 'desktop'}
                  leadingIcon={<PickerDisplayIcon />}
                  onPress={() => {
                    setSelectedPickerLabel('Desktop');
                    setPickerOpen(false);
                  }}
                />
                <OptionListCell
                  label="MobileWeb"
                  selected={selectedOption.id === 'mobile-web'}
                  leadingIcon={<PickerMobilePhoneIcon />}
                  onPress={() => {
                    setSelectedPickerLabel('MobileWeb');
                    setPickerOpen(false);
                  }}
                />
                <OptionListHeader label="АБМ" />
                <OptionListCell
                  label="iOS"
                  selected={selectedOption.id === 'ios'}
                  leadingIcon={<PickerAppleIcon />}
                  onPress={() => {
                    setSelectedPickerLabel('iOS');
                    setPickerOpen(false);
                  }}
                />
                <OptionListCell
                  label="Android"
                  selected={selectedOption.id === 'android'}
                  leadingIcon={<PickerAndroidIcon />}
                  onPress={() => {
                    setSelectedPickerLabel('Android');
                    setPickerOpen(false);
                  }}
                />
              </OptionList>
            ) : null}
          </div>
          <Button
            key={actionKey}
            label={actionLabel}
            disabled={actionDisabled}
            loading={actionLoading}
            type={actionType}
            icon={<FlashIcon />}
            onPress={onActionPress}
          />
        </div>
      )}
    </div>
  );
}
