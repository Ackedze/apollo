import React, { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GenerationExampleCaptureRequest, PageTypeId } from "../types";
import { Button } from "./Button";
import { GenerationExampleModal } from "./GenerationExampleModal";
import { ContractDataModal, type ContractData } from "../../../ContractDataModal";
import { OptionList } from "./OptionList";
import { OptionListCell } from "./OptionListCell";
import { OptionListHeader } from "./OptionListHeader";
import { PickerButton } from "./PickerButton";
import {
  FlashIcon,
  PickerAndroidIcon,
  PickerAppleIcon,
  PickerDisplayIcon,
  PickerMobilePhoneIcon,
  SettingsIcon,
} from "./PickerIcons";
import styles from "./TopSection.module.css";

type ControlId = 'pageTypeId' | 'channelId' | 'pickerLabel' | 'shellAuditEnabled' | 'compact' | 'experimentalContractV2Enabled' | 'showExpectedCustomizations' | 'hideCustomizations' | 'captureExample';

type TopSectionProps = {
  controlAvailability: Record<ControlId, boolean>;
  title: string;
  settingsHost?: HTMLElement | null;
  readContractData?: () => Promise<ContractData>;
  proxy?: { available: boolean | null; version: string | null };
  proxyError?: string;
  settingsMessage?: string;
  onProxyRefresh?: () => Promise<void>;
  auditControlsVisible?: boolean;
  overlayScope?: string;
  pageTypeId: PageTypeId | null;
  channelId: string;
  pickerLabel: string;
  actionLabel: string;
  actionDisabled: boolean;
  actionLoading: boolean;
  actionType: 'primary' | 'secondary';
  compact: boolean;
  shellAuditEnabled: boolean;
  showExpectedCustomizations: boolean;
  hideCustomizations: boolean;
  experimentalContractV2Enabled: boolean;
  onActionPress: () => void;
  onToggleCompact: () => void;
  onChannelChange?: (channelId: string) => void;
  onPickerChange?: (pickerLabel: string) => void;
  onPageTypeChange?: (pageTypeId: PageTypeId) => void;
  onShellAuditToggle?: () => void;
  onShowExpectedToggle?: () => void;
  onHideCustomizationsToggle?: () => void;
  onExperimentalContractV2Toggle?: () => void;
  onExampleCapture?: (request: GenerationExampleCaptureRequest) => void;
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

type PageTypeOption = {
  id: PageTypeId;
  label: string;
};

const PAGE_TYPE_OPTIONS: PageTypeOption[] = [
  { id: 'form', label: 'Форма' },
  { id: 'details', label: 'Просмотровая' },
  { id: 'data-list', label: 'Страница с таблицей' },
  { id: 'landing', label: 'Лендинг' },
  { id: 'dashboard', label: 'Дашборд' },
  { id: 'other', label: 'Другое' },
];

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

function SettingsPickerMenu({anchor, menuRef, label, onClose, children}: {
  anchor: React.RefObject<HTMLDivElement | null>; menuRef: React.RefObject<HTMLDivElement | null>;
  label: string; onClose: () => void; children: React.ReactNode;
}) {
  const close = useEffectEvent(onClose);
  useLayoutEffect(() => {
    const menu = menuRef.current, trigger = anchor.current?.querySelector('button');
    if (!menu || !trigger) return;
    const bounds = trigger.getBoundingClientRect(), size = menu.getBoundingClientRect();
    const below = Math.max(0, window.innerHeight - bounds.bottom - 12), above = Math.max(0, bounds.top - 12);
    const flipped = size.height > below && above > below, height = Math.min(size.height, flipped ? above : below);
    menu.style.left = `${Math.max(8, Math.min(bounds.right - size.width, window.innerWidth - size.width - 8))}px`;
    menu.style.top = `${flipped ? bounds.top - height - 4 : bounds.bottom + 4}px`;
    menu.style.maxHeight = `${flipped ? above : below}px`;
    (menu.querySelector<HTMLButtonElement>('button[aria-pressed="true"]:not(:disabled)') ?? menu.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus({preventScroll:true});
    const scroll = (event: Event) => { if (!(event.target instanceof Node) || !menu.contains(event.target)) close(); };
    const resize = () => close();
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', resize);
      if (menu.contains(document.activeElement) && trigger.isConnected) trigger.focus({preventScroll:true});
    };
  }, [anchor, menuRef]);
  return createPortal(<div ref={menuRef} className={styles.pickerOverlay} role="group" aria-label={label} onKeyDown={event => {
    if (event.key === 'Tab') { anchor.current?.querySelector('button')?.focus({preventScroll:true}); onClose(); return; }
    if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    if (!buttons.length) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
    buttons[next].focus({preventScroll:true});
  }}><OptionList className={styles.pickerMenu}>{children}</OptionList></div>, document.body);
}

export function TopSection({
  controlAvailability,
  title,
  settingsHost,
  readContractData,
  proxy,
  proxyError,
  settingsMessage,
  onProxyRefresh,
  auditControlsVisible = true,
  overlayScope,
  pageTypeId,
  channelId,
  pickerLabel,
  actionLabel,
  actionDisabled,
  actionLoading,
  actionType,
  compact,
  shellAuditEnabled,
  showExpectedCustomizations,
  hideCustomizations,
  experimentalContractV2Enabled,
  onActionPress,
  onChannelChange,
  onPickerChange,
  onPageTypeChange,
  onShellAuditToggle,
  onExampleCapture,
}: TopSectionProps): React.JSX.Element {
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const settingsRootRef = useRef<HTMLDivElement | null>(null);
  const pageTypeRootRef = useRef<HTMLDivElement | null>(null);
  const pickerRootRef = useRef<HTMLDivElement | null>(null);
  const workshopRootRef = useRef<HTMLDivElement | null>(null);
  const pickerMenuRef = useRef<HTMLDivElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pageTypeOpen, setPageTypeOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [workshopOpen, setWorkshopOpen] = useState(false);
  const closeSettingsPicker = useCallback(() => { setPickerOpen(false); setWorkshopOpen(false); }, []);
  const [exampleModalOpen, setExampleModalOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [selectedPickerLabel, setSelectedPickerLabel] = useState(pickerLabel);
  const [selectedWorkshopId, setSelectedWorkshopId] = useState(
    channelId || WORKSHOP_OPTIONS[0].id,
  );

  useEffect(() => {
    setSettingsOpen(false);
    setPageTypeOpen(false);
    setPickerOpen(false);
    setWorkshopOpen(false);
  }, [overlayScope]);

  useEffect(() => {
    setSelectedPickerLabel(pickerLabel);
  }, [pickerLabel]);

  useEffect(() => {
    setSelectedWorkshopId(channelId || WORKSHOP_OPTIONS[0].id);
  }, [channelId]);

  useEffect(() => {
    if (actionLoading) {
      setSettingsOpen(false);
      setPickerOpen(false);
      setWorkshopOpen(false);
      setExampleModalOpen(false);
    }
  }, [actionLoading]);

  useEffect(() => {
    if (!settingsOpen && !pageTypeOpen && !pickerOpen && !workshopOpen) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent): void {
      const target = event.target as Node;
      if (pickerMenuRef.current?.contains(target)) return;
      if (!settingsRootRef.current?.contains(target)) {
        setSettingsOpen(false);
      }
      if (!pageTypeRootRef.current?.contains(target)) {
        setPageTypeOpen(false);
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
        if (pickerOpen || workshopOpen) {
          event.preventDefault();
          closeSettingsPicker();
          return;
        }
        if (settingsOpen && settingsRootRef.current?.contains(document.activeElement)) settingsButtonRef.current?.focus();
        setSettingsOpen(false);
        setPageTypeOpen(false);
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
  }, [settingsOpen, pageTypeOpen, pickerOpen, workshopOpen, closeSettingsPicker]);

  const selectedOption =
    PICKER_OPTIONS.find((option) => option.label === selectedPickerLabel) ??
    PICKER_OPTIONS[0];
  const selectedWorkshop =
    WORKSHOP_OPTIONS.find((option) => option.id === selectedWorkshopId) ??
    WORKSHOP_OPTIONS[0];
  const selectedPageType =
    PAGE_TYPE_OPTIONS.find((option) => option.id === pageTypeId) ?? null;
  const actionKey = [
    selectedOption.label,
    selectedWorkshop.id,
    shellAuditEnabled ? 'shared-on' : 'shared-off',
    showExpectedCustomizations ? 'expected-on' : 'expected-off',
    hideCustomizations ? 'customizations-hidden' : 'customizations-visible',
    experimentalContractV2Enabled ? 'contract-v2-on' : 'contract-v2-off',
    actionType,
    actionLabel,
    actionDisabled ? 'disabled' : 'enabled',
    actionLoading ? 'loading' : 'idle',
    compact ? 'compact' : 'full',
  ].join(':');

  const proxyStatus = proxy?.available === null ? 'Не проверен' : proxy?.available ? 'Подключён' : 'Недоступен';
  const proxyLabel = `Proxy${proxy?.version ? ` v${proxy.version}` : ''}`;

  const settingsControl = (
    <div className={styles.settingsWrap} ref={settingsRootRef}>
      <Button
        label="Настройки"
        singleIcon
        type="secondary"
        ariaLabel="Открыть настройки Apollo"
        title={proxy?.available === false ? 'Настройки: Proxy недоступен' : 'Настройки'}
        ariaExpanded={settingsOpen}
        ariaControls="apollo-settings"
        buttonRef={settingsButtonRef}
        size="regular"
        icon={<SettingsIcon />}
        onPress={() => {
          if (!settingsOpen) void onProxyRefresh?.();
          setPageTypeOpen(false);
          setPickerOpen(false);
          setWorkshopOpen(false);
          setSettingsOpen((value) => !value);
        }}
      />
      {proxy?.available === false && <span className={styles.proxyDot} role="status" aria-label="Proxy недоступен" />}
      {settingsOpen ? (
        <div id="apollo-settings" className={styles.settingsPanel} role="dialog" aria-label="Настройки Apollo">
          {proxy && <button
            type="button"
            className={styles.proxyBadge}
            data-state={proxy.available === null ? 'unknown' : proxy.available ? 'connected' : 'unavailable'}
            aria-label={`${proxyLabel}: ${proxyStatus}. Проверить подключение`}
            title={[proxyStatus, proxy.available === false ? proxyError || 'Запусти локальный Proxy.' : '', 'Нажми, чтобы проверить подключение.'].filter(Boolean).join('\n')}
            disabled={!onProxyRefresh}
            onClick={() => { void onProxyRefresh?.(); }}
          >
            <span className={styles.proxyIndicator} aria-hidden="true" />
            <span>{proxyLabel}</span>
          </button>}
          {settingsMessage && <p className={styles.settingsMessage} role="status">{settingsMessage}</p>}
          <div className={styles.settingsField}>
            <div className={styles.settingsLabel}>Канал</div>
            <div className={styles.pickerWrap} ref={workshopRootRef}>
              <PickerButton
                label={selectedWorkshop.label}
                open={workshopOpen}
                disabled={actionLoading || !controlAvailability.channelId}
                onPress={() => {
                  setPickerOpen(false);
                  setWorkshopOpen((value) => !value);
                }}
              />
              {workshopOpen ? (
                <SettingsPickerMenu anchor={workshopRootRef} menuRef={pickerMenuRef} label="Канал" onClose={closeSettingsPicker}>
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
                </SettingsPickerMenu>
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
                disabled={actionLoading || !controlAvailability.pickerLabel}
                leadingIcon={selectedOption.icon}
                onPress={() => {
                  setWorkshopOpen(false);
                  setPickerOpen((value) => !value);
                }}
              />
              {pickerOpen ? (
                <SettingsPickerMenu anchor={pickerRootRef} menuRef={pickerMenuRef} label="Платформа" onClose={closeSettingsPicker}>
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
                </SettingsPickerMenu>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            className={styles.switchRow}
            disabled={actionLoading || !controlAvailability.shellAuditEnabled}
            title={!controlAvailability.shellAuditEnabled ? 'Эта настройка ещё не подключена к проверке v4' : undefined}
            aria-pressed={shellAuditEnabled}
            onClick={onShellAuditToggle}
          >
            <span className={styles.switchText}>Проверять шаред</span>
            <span className={[styles.switchTrack, shellAuditEnabled ? styles.switchTrackActive : ''].filter(Boolean).join(' ')}>
              <span className={styles.switchThumb} />
            </span>
          </button>
          <div className={styles.settingsDivider} />
          {readContractData && <button type="button" className={styles.settingsAction} aria-haspopup="dialog"
            onClick={() => { setSettingsOpen(false); setDataOpen(true); }}>
            <span className={styles.settingsActionTitle}>Посмотреть данные</span>
          </button>}
          <button
            type="button"
            className={styles.settingsAction}
            disabled={actionLoading || !controlAvailability.captureExample}
            title={!controlAvailability.captureExample ? 'Подготовка примера ещё не подключена' : undefined}
            onClick={() => {
              setSettingsOpen(false);
              setPickerOpen(false);
              setWorkshopOpen(false);
              setExampleModalOpen(true);
            }}
          >
            <span className={styles.settingsActionTitle}>Подготовить пример</span>
            <span className={styles.settingsActionCaption}>
              Собрать JSON из выделенного макета
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );

  const actionButton = (
    <Button
      key={actionKey}
      label={actionLabel}
      disabled={actionDisabled}
      loading={actionLoading}
      type={actionType}
      size={compact ? 'compact' : 'regular'}
      singleIcon={compact}
      icon={<FlashIcon />}
      onPress={() => {
        setPageTypeOpen(false);
        onActionPress();
      }}
    />
  );

  const pageTypeControl = (
    <div className={styles.pageTypeWrap} ref={pageTypeRootRef}>
      <PickerButton
        label={selectedPageType?.label ?? 'Тип страницы'}
        open={pageTypeOpen}
        disabled={!controlAvailability.pageTypeId || (actionLoading && actionLabel === 'Остановить')}
        className={[
          'design-check-page-picker',
          styles.pageTypeButton,
          selectedPageType ? styles.pageTypeButtonSelected : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onPress={() => {
          setSettingsOpen(false);
          setPickerOpen(false);
          setWorkshopOpen(false);
          setPageTypeOpen((value) => !value);
        }}
      />
      {pageTypeOpen ? (
        <OptionList className={styles.pageTypeMenu}>
          {PAGE_TYPE_OPTIONS.map((option) => (
            <OptionListCell
              key={option.id}
              label={option.label}
              selected={pageTypeId === option.id}
              showLeadingIcon={false}
              onPress={() => {
                onPageTypeChange?.(option.id);
                setPageTypeOpen(false);
              }}
            />
          ))}
        </OptionList>
      ) : null}
    </div>
  );

  return (
    <>
      <div
        className={[styles.root, compact ? styles.rootCompact : '']
          .filter(Boolean)
          .join(' ')}
        data-product={title}
        hidden={!auditControlsVisible}
      >
        {pageTypeControl}
        <div className={compact ? styles.compactRightSide : styles.rightSide}>
          {settingsHost === undefined ? settingsControl : null}
          {actionButton}
        </div>
      </div>
      {settingsHost ? createPortal(settingsControl, settingsHost) : null}
      {dataOpen && readContractData && <ContractDataModal readData={readContractData} returnFocus={settingsButtonRef} onClose={() => setDataOpen(false)} />}
      {exampleModalOpen ? (
        <GenerationExampleModal
          initialPlatform={
            toGenerationExamplePlatform(selectedOption.id)
          }
          disabled={actionLoading}
          onClose={() => setExampleModalOpen(false)}
          onSubmit={(request) => onExampleCapture?.(request)}
        />
      ) : null}
    </>
  );
}

function toGenerationExamplePlatform(
  pickerId: string,
): GenerationExampleCaptureRequest['platform'] {
  if (pickerId === 'mobile-web') return 'mobile-web';
  if (pickerId === 'ios') return 'ios';
  if (pickerId === 'android') return 'android';
  return 'desktop';
}
