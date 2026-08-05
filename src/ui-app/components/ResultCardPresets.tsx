import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { OptionList } from './OptionList';
import { OptionListCell } from './OptionListCell';
import { PickerButton } from './PickerButton';
import { ResultCard } from './ResultCard';
import { ResultSubCard } from './ResultSubCard';
import styles from './ResultCardPresets.module.css';

type BasePresetProps = {
  title: string;
  caption?: string;
  hovered?: boolean;
  onFocus?: () => void;
  showFocus?: boolean;
};

type FindingAction = {
  id: string;
  label: string;
  targetName: string;
  onPress: () => void;
};

type ChangeLine = {
  label: string;
  values: string[];
  marker?: 'Expected';
};

type ChangeGroup = {
  name: string;
  onFocus?: () => void;
  onReset?: () => void;
  actions?: Array<{
    label: string;
    onPress: () => void;
    singleIcon?: boolean;
  }>;
  lines: ChangeLine[];
};

export function AuditResultCard(
  props: BasePresetProps & { actions?: FindingAction[] },
): React.JSX.Element {
  const { actions = [], ...cardProps } = props;
  return (
    <ResultCard {...cardProps}>
      {actions.length ? <FindingActions actions={actions} /> : null}
    </ResultCard>
  );
}

function FindingActions({ actions }: { actions: FindingAction[] }) {
  if (actions.length === 0) return null;
  if (actions.length === 1) {
    const action = actions[0];
    return (
      <ResultSubCard
        name={action.targetName}
        actions={[
          {
            label: action.label,
            onPress: action.onPress,
            singleIcon: false,
          },
        ]}
      />
    );
  }

  const commonLabel = actions.every(
    (action) => action.label === actions[0].label,
  )
    ? actions[0].label
    : 'Выбрать';
  return (
    <ResultSubCard
      name={`Найдено совпадений: ${actions.length}`}
      actionSlot={
        <FindingActionPicker actions={actions} label={commonLabel} />
      }
    />
  );
}

type PickerPosition = {
  top: number;
  left: number;
};

function FindingActionPicker({
  actions,
  label,
}: {
  actions: FindingAction[];
  label: string;
}): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PickerPosition | null>(null);

  useEffect(() => {
    if (!open || !rootRef.current) return undefined;
    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuWidth = 320;
      const estimatedHeight = Math.min(actions.length * 44 + 8, 320);
      const availableBelow = window.innerHeight - rect.bottom - 8;
      const top =
        availableBelow >= estimatedHeight
          ? rect.bottom + 4
          : Math.max(8, rect.top - estimatedHeight - 4);
      setPosition({
        top,
        left: Math.max(
          8,
          Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8),
        ),
      });
    };
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const menuTarget =
        target instanceof Element
          ? target.closest('[data-finding-action-picker-menu="true"]')
          : null;
      if (!rootRef.current?.contains(target) && !menuTarget) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    updatePosition();
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [actions.length, open]);

  return (
    <div className={styles.candidatePicker} ref={rootRef}>
      <PickerButton
        className={styles.candidatePickerButton}
        label={label}
        open={open}
        compact
        onPress={() => setOpen((value) => !value)}
      />
      {open && position
        ? createPortal(
            <div
              data-finding-action-picker-menu="true"
              className={styles.candidatePickerMenu}
              style={{ top: position.top, left: position.left }}
            >
              <OptionList className={styles.candidatePickerList}>
                {actions.map((action) => (
                  <OptionListCell
                    key={action.id}
                    label={action.targetName}
                    showLeadingIcon={false}
                    onPress={() => {
                      setOpen(false);
                      action.onPress();
                    }}
                  />
                ))}
              </OptionList>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function DetachedResultCard({
  title,
  caption,
  hovered = false,
  onFocus,
  showFocus = false,
  targetName,
}: BasePresetProps & {
  targetName: string;
}): React.JSX.Element {
  return (
    <ResultCard
      title={title}
      caption={caption}
      hovered={hovered}
      onFocus={onFocus}
      showFocus={showFocus}
    >
      <ResultSubCard name={targetName} />
    </ResultCard>
  );
}

export function CustomizationResultCard({
  title,
  caption,
  hovered = false,
  onFocus,
  showFocus = false,
  groups,
}: BasePresetProps & {
  groups: ChangeGroup[];
}): React.JSX.Element {
  return (
    <ResultCard
      title={title}
      caption={caption}
      hovered={hovered}
      onFocus={onFocus}
      showFocus={showFocus}
    >
      {groups.map((group, index) => (
        <ResultSubCard
          key={`${group.name}:${index}`}
          name={group.name}
          onFocus={group.onFocus}
          showFocus={Boolean(group.onFocus)}
          valueLines={group.lines}
          actions={
            group.actions?.length
              ? group.actions
              : group.onReset
              ? [{ label: 'Сбросить', onPress: group.onReset, singleIcon: false }]
              : []
          }
        />
      ))}
    </ResultCard>
  );
}

export function ThemeErrorResultCard({
  title,
  caption,
  hovered = false,
  onFocus,
  showFocus = false,
  targetName,
  onReplace,
  actionLabel = 'Заменить',
}: BasePresetProps & {
  targetName: string;
  onReplace?: () => void;
  actionLabel?: string;
}): React.JSX.Element {
  return (
    <ResultCard
      title={title}
      caption={caption}
      hovered={hovered}
      onFocus={onFocus}
      showFocus={showFocus}
    >
      <ResultSubCard
        name={targetName}
        actions={onReplace ? [{ label: actionLabel, onPress: onReplace, singleIcon: false }] : []}
      />
    </ResultCard>
  );
}

export function DeprecatedStyleResultCard({
  title,
  caption,
  hovered = false,
  usages,
}: BasePresetProps & {
  usages: Array<{
    id: string;
    name: string;
    onFocus?: () => void;
    actions?: FindingAction[];
  }>;
}): React.JSX.Element {
  return (
    <ResultCard
      title={title}
      caption={caption}
      hovered={hovered}
      showFocus={false}
    >
      {usages.map((usage, index) => (
        <ResultSubCard
          key={`${usage.id}:${usage.name}:${index}`}
          name={usage.name}
          onFocus={usage.onFocus}
          showFocus={Boolean(usage.onFocus)}
          actions={(usage.actions ?? []).map((action) => ({
            label: action.label,
            onPress: action.onPress,
            singleIcon: false,
          }))}
        />
      ))}
    </ResultCard>
  );
}

export function CustomStyleResultCard({
  title,
  caption,
  hovered = false,
  onFocus,
  showFocus = false,
}: BasePresetProps): React.JSX.Element {
  return (
    <ResultCard
      title={title}
      caption={caption}
      hovered={hovered}
      onFocus={onFocus}
      showFocus={showFocus}
    />
  );
}
