import React from 'react';
import type { ChromeTabItem } from '../types';
import { CategoryCard } from './CategoryCard';
import styles from './LeftSection.module.css';

type LeftSectionProps = {
  tabs: ChromeTabItem[];
  onTabSelect: (tabId: string) => void;
};

export function LeftSection({
  tabs,
  onTabSelect,
}: LeftSectionProps): React.JSX.Element {
  return (
    <div className={styles.root}>
      {tabs.map((tab) => (
        <CategoryCard
          key={tab.id}
          id={tab.id}
          title={tab.title}
          count={tab.count}
          active={tab.active}
          onPress={onTabSelect}
        />
      ))}
    </div>
  );
}
