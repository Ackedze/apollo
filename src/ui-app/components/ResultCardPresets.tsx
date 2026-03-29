import React from 'react';
import { ResultCard } from './ResultCard';
import { ResultSubCard } from './ResultSubCard';

type BasePresetProps = {
  title: string;
  caption?: string;
  hovered?: boolean;
  onFocus?: () => void;
  showFocus?: boolean;
};

type ChangeLine = {
  label: string;
  values: string[];
};

type ChangeGroup = {
  name: string;
  onFocus?: () => void;
  onReset?: () => void;
  lines: ChangeLine[];
};

export function AuditResultCard(props: BasePresetProps): React.JSX.Element {
  return <ResultCard {...props} />;
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
          actions={[{ label: 'Сбросить', onPress: group.onReset, singleIcon: false }]}
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
}: BasePresetProps & {
  targetName: string;
  onReplace?: () => void;
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
        actions={[{ label: 'Заменить', onPress: onReplace, singleIcon: false }]}
      />
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
