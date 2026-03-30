import React from 'react';
import type { ChromeTabItem } from '../types';
import { CategoryCard } from './CategoryCard';
import { Divider } from './Divider';
import styles from './LeftSection.module.css';

type LeftSectionProps = {
  tabs: ChromeTabItem[];
  onTabSelect: (tabId: string) => void;
};

export function LeftSection({
  tabs,
  onTabSelect,
}: LeftSectionProps): React.JSX.Element {
  const orderedTabs = reorderTabs(tabs);

  return (
    <div className={styles.root}>
      {orderedTabs.map((tab) =>
        tab === '__divider_after_customStyles__' ? (
          <Divider key={tab} />
        ) : tab === '__divider_after_detached__' ? (
          <Divider key={tab} />
        ) : (
          <CategoryCard
            key={tab.id}
            id={tab.id}
            title={tab.title}
            count={tab.count}
            counterType={tab.counterType}
            active={tab.active}
            onPress={onTabSelect}
          />
        ),
      )}
    </div>
  );
}

type LeftSectionItem = ChromeTabItem | '__divider_after_customStyles__' | '__divider_after_detached__';

const LEFT_SECTION_ORDER: Array<ChromeTabItem['id'] | LeftSectionItem> = [
  'deprecated',
  'update',
  'themization',
  'customStyles',
  '__divider_after_customStyles__',
  'changes',
  'local',
  'detached',
  '__divider_after_detached__',
  'presets',
  'current',
];

function reorderTabs(tabs: ChromeTabItem[]): LeftSectionItem[] {
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  return LEFT_SECTION_ORDER.flatMap((entry) => {
    if (entry.startsWith('__divider_')) {
      return entry as LeftSectionItem;
    }
    const tab = byId.get(entry);
    return tab ? [tab] : [];
  });
}
