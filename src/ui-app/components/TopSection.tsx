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
  SettingsIcon,
} from './PickerIcons';
import { SmallButton } from './SmallButton';
import styles from './TopSection.module.css';

type TopSectionProps = {
  title: string;
  channelId: string;
  pickerLabel: string;
  actionLabel: string;
  actionDisabled: boolean;
  actionLoading: boolean;
  actionType: 'primary' | 'secondary';
  compact: boolean;
  shellAuditEnabled: boolean;
  onActionPress: () => void;
  onToggleCompact: () => void;
  onChannelChange?: (channelId: string) => void;
  onPickerChange?: (pickerLabel: string) => void;
  onShellAuditToggle?: () => void;
};

type PickerOption = {
  id: string;
  label: string;
  section: 'Web' | 'АБМ';
  icon: React.ReactNode;
};

type WorkshopOption = {
  id: string;
  label: string;
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

const WORKSHOP_OPTIONS: WorkshopOption[] = [
  {
    id: 'b2b',
    label: 'b2b',
  },
  {
    id: 'b2c',
    label: 'b2c',
  },
  {
    id: 'site',
    label: 'site',
  },
  {
    id: 'invest',
    label: 'invest',
  },
];

export function TopSection({
  title,
  channelId,
  pickerLabel,
  actionLabel,
  actionDisabled,
  actionLoading,
  actionType,
  compact,
  shellAuditEnabled,
  onActionPress,
  onToggleCompact,
  onChannelChange,
  onPickerChange,
  onShellAuditToggle,
}: TopSectionProps): React.JSX.Element {
  const settingsRootRef = useRef<HTMLDivElement | null>(null);
  const pickerRootRef = useRef<HTMLDivElement | null>(null);
  const workshopRootRef = useRef<HTMLDivElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [workshopOpen, setWorkshopOpen] = useState(false);
  const [selectedPickerLabel, setSelectedPickerLabel] = useState(pickerLabel);
  const [selectedWorkshopId, setSelectedWorkshopId] = useState(
    channelId || WORKSHOP_OPTIONS[0].id,
  );

  useEffect(() => {
    setSelectedPickerLabel(pickerLabel);
  }, [pickerLabel]);

  useEffect(() => {
    setSelectedWorkshopId(channelId || WORKSHOP_OPTIONS[0].id);
  }, [channelId]);

  useEffect(() => {
    if (compact || actionLoading) {
      setSettingsOpen(false);
      setPickerOpen(false);
      setWorkshopOpen(false);
    }
  }, [compact, actionLoading]);

  useEffect(() => {
    if (!settingsOpen && !pickerOpen && !workshopOpen) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent): void {
      const target = event.target as Node;
      if (!settingsRootRef.current?.contains(target)) {
        setSettingsOpen(false);
      }
      if (!pickerRootRef.current?.contains(target)) {
        setPickerOpen(false);
      }
      if (!workshopRootRef.current?.contains(target)) {
        setWorkshopOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setSettingsOpen(false);
        setPickerOpen(false);
        setWorkshopOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [settingsOpen, pickerOpen, workshopOpen]);

  const selectedOption =
    PICKER_OPTIONS.find((option) => option.label === selectedPickerLabel) ??
    PICKER_OPTIONS[0];
  const selectedWorkshop =
    WORKSHOP_OPTIONS.find((option) => option.id === selectedWorkshopId) ??
    WORKSHOP_OPTIONS[0];
  const actionKey = [
    selectedOption.label,
    selectedWorkshop.id,
    shellAuditEnabled ? 'shared-on' : 'shared-off',
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
          <div className={styles.settingsWrap} ref={settingsRootRef}>
            <Button
              label="Настройки"
              singleIcon
              type="secondary"
              ariaLabel="Открыть настройки Apollo"
              title="Настройки"
              icon={<SettingsIcon />}
              onPress={() => {
                setPickerOpen(false);
                setWorkshopOpen(false);
                setSettingsOpen((value) => !value);
              }}
            />
            {settingsOpen ? (
              <div className={styles.settingsPanel} role="dialog" aria-label="Настройки Apollo">
                <div className={styles.settingsField}>
                  <div className={styles.settingsLabel}>Канал</div>
                  <div className={styles.pickerWrap} ref={workshopRootRef}>
                    <PickerButton
                      label={selectedWorkshop.label}
                      open={workshopOpen}
                      disabled={actionLoading}
                      onPress={() => {
                        setPickerOpen(false);
                        setWorkshopOpen((value) => !value);
                      }}
                    />
                    {workshopOpen ? (
                      <OptionList className={styles.pickerMenu}>
                        {WORKSHOP_OPTIONS.map((option) => (
                          <OptionListCell
                            key={option.id}
                            label={option.label}
                            selected={selectedWorkshop.id === option.id}
                            onPress={() => {
                              setSelectedWorkshopId(option.id);
                              onChannelChange?.(option.id);
                              setWorkshopOpen(false);
                            }}
                          />
                        ))}
                      </OptionList>
                    ) : null}
                  </div>
                </div>
                <div className={styles.settingsField}>
                  <div className={styles.settingsLabel}>Платформа</div>
                  <div className={styles.pickerWrap} ref={pickerRootRef}>
                    <PickerButton
                      label={selectedOption.label}
                      open={pickerOpen}
                      selected
                      disabled={actionLoading}
                      leadingIcon={selectedOption.icon}
                      onPress={() => {
                        setWorkshopOpen(false);
                        setPickerOpen((value) => !value);
                      }}
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
                            onPickerChange?.('Desktop');
                            setPickerOpen(false);
                          }}
                        />
                        <OptionListCell
                          label="MobileWeb"
                          selected={selectedOption.id === 'mobile-web'}
                          leadingIcon={<PickerMobilePhoneIcon />}
                          onPress={() => {
                            setSelectedPickerLabel('MobileWeb');
                            onPickerChange?.('MobileWeb');
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
                            onPickerChange?.('iOS');
                            setPickerOpen(false);
                          }}
                        />
                        <OptionListCell
                          label="Android"
                          selected={selectedOption.id === 'android'}
                          leadingIcon={<PickerAndroidIcon />}
                          onPress={() => {
                            setSelectedPickerLabel('Android');
                            onPickerChange?.('Android');
                            setPickerOpen(false);
                          }}
                        />
                      </OptionList>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.switchRow}
                  disabled={actionLoading}
                  aria-pressed={shellAuditEnabled}
                  onClick={onShellAuditToggle}
                >
                  <span className={styles.switchText}>Проверять шаред</span>
                  <span className={[styles.switchTrack, shellAuditEnabled ? styles.switchTrackActive : ''].filter(Boolean).join(' ')}>
                    <span className={styles.switchThumb} />
                  </span>
                </button>
              </div>
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
