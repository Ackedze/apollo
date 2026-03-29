import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { Placeholder } from '../components/Placeholder';
import {
  AuditResultCard,
  CustomizationResultCard,
  DetachedResultCard,
  ThemeErrorResultCard,
} from '../components/ResultCardPresets';
import type { ResultsBridgeOptions, ResultsItem } from '../types';
import styles from './CurrentResultsPane.module.css';

type ResultsState =
  | { mode: 'hidden' }
  | { mode: 'placeholder'; title: string; description: string }
  | { mode: 'items'; items: ResultsItem[] };

function ResultsPane({
  items,
  onFocusItem,
}: {
  items: ResultsItem[];
  onFocusItem: (id: string) => void;
}): React.JSX.Element {
  return (
    <div className={styles.root}>
      {items.map((item) => {
        if (item.kind === 'detached') {
          return (
            <DetachedResultCard
              key={item.id}
              title={item.title}
              caption={item.caption}
              targetName={item.targetName}
              showFocus={Boolean(item.id)}
              onFocus={() => onFocusItem(item.id)}
            />
          );
        }

        if (item.kind === 'themeError') {
          return (
            <ThemeErrorResultCard
              key={item.id}
              title={item.title}
              caption={item.caption}
              targetName={item.targetName}
              showFocus={Boolean(item.id)}
              onFocus={() => onFocusItem(item.id)}
            />
          );
        }

        if (item.kind === 'customization') {
          return (
            <CustomizationResultCard
              key={item.id}
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
            key={item.id}
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
