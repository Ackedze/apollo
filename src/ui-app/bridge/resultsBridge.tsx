import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { Placeholder } from '../components/Placeholder';
import {
  AuditResultCard,
  CustomizationResultCard,
  DeprecatedStyleResultCard,
  DetachedResultCard,
  ThemeErrorResultCard,
} from '../components/ResultCardPresets';
import type { ResultsBridgeOptions, ResultsItem } from '../types';
import styles from './CurrentResultsPane.module.css';

type ResultsState =
  | { mode: 'hidden' }
  | { mode: 'placeholder'; title: string; description: string }
  | { mode: 'items'; items: ResultsItem[] };

function getResultItemKey(item: ResultsItem, index: number): string {
  switch (item.kind) {
    case 'customization':
      return `${item.kind}:${item.id}:${item.title}:${item.groups.length}:${index}`;
    case 'deprecatedStyle':
      return `${item.kind}:${item.id}:${item.title}:${item.usages.length}:${index}`;
    case 'detached':
    case 'themization':
      return `${item.kind}:${item.id}:${item.title}:${item.targetName}:${index}`;
    case 'audit':
    case 'customStyle':
      return `${item.kind}:${item.id}:${item.title}:${item.caption ?? ''}:${index}`;
    default:
      return `${item.kind}:${item.id}:${index}`;
  }
}

function ResultsPane({
  items,
  onFocusItem,
}: {
  items: ResultsItem[];
  onFocusItem: (id: string) => void;
}): React.JSX.Element {
  return (
    <div className={styles.root}>
      {items.map((item, index) => {
        const itemKey = getResultItemKey(item, index);

        if (item.kind === 'detached') {
          return (
            <DetachedResultCard
              key={itemKey}
              title={item.title}
              caption={item.caption}
              targetName={item.targetName}
              showFocus={Boolean(item.id)}
              onFocus={() => onFocusItem(item.id)}
            />
          );
        }

        if (item.kind === 'themization') {
          return (
            <ThemeErrorResultCard
              key={itemKey}
              title={item.title}
              caption={item.caption}
              targetName={item.targetName}
              showFocus={Boolean(item.id)}
              onFocus={() => onFocusItem(item.id)}
              onReplace={item.onReplace}
              actionLabel="Сменить"
            />
          );
        }

        if (item.kind === 'deprecatedStyle') {
          return (
            <DeprecatedStyleResultCard
              key={itemKey}
              title={item.title}
              caption={item.caption}
              usages={item.usages}
            />
          );
        }

        if (item.kind === 'customization') {
          return (
            <CustomizationResultCard
              key={itemKey}
              title={item.title}
              caption={item.caption}
              groups={item.groups}
              showFocus={Boolean(item.id)}
              onFocus={() => onFocusItem(item.id)}
            />
          );
        }

        return (
          <AuditResultCard
            key={itemKey}
            title={item.title}
            caption={item.caption}
            showFocus={Boolean(item.id)}
            onFocus={() => onFocusItem(item.id)}
          />
        );
      })}
    </div>
  );
}

class ApolloResultsBridge {
  private root: Root | null = null;
  private options: ResultsBridgeOptions | null = null;
  private state: ResultsState = { mode: 'hidden' };

  mount(options: ResultsBridgeOptions): boolean {
    this.options = options;

    const container = document.getElementById(options.rootId);
    if (!container) {
      return false;
    }

    this.root = createRoot(container);
    this.render();
    return true;
  }

  showItems(items: ResultsItem[]): void {
    this.state = { mode: 'items', items };
    this.render();
  }

  showPlaceholder(title: string, description: string): void {
    this.state = { mode: 'placeholder', title, description };
    this.render();
  }

  clear(): void {
    this.state = { mode: 'hidden' };
    this.render();
  }

  private render(): void {
    if (!this.root || !this.options) {
      return;
    }

    flushSync(() => {
      if (this.state.mode === 'placeholder') {
        this.root?.render(
          <Placeholder
            title={this.state.title}
            description={this.state.description}
          />,
        );
        return;
      }

      if (this.state.mode === 'items') {
        this.root?.render(
          <ResultsPane
            items={this.state.items}
            onFocusItem={this.options!.onFocusItem}
          />,
        );
        return;
      }

      this.root?.render(<></>);
    });
  }
}

declare global {
  interface Window {
    ApolloResultsBridge?: ApolloResultsBridge;
  }
}

window.ApolloResultsBridge = new ApolloResultsBridge();
