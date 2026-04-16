import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { LeftSection } from '../components/LeftSection';
import { TopSection } from '../components/TopSection';
import type { ChromeBridgeOptions, ChromeState } from '../types';

const defaultState: ChromeState = {
  title: 'Apollo',
  pickerLabel: 'Desktop',
  actionLabel: 'Загрузка каталогов...',
  actionDisabled: true,
  actionLoading: true,
  actionType: 'secondary',
  compact: false,
  tabs: [],
};

class ApolloChromeBridge {
  private topRoot: Root | null = null;
  private leftRoot: Root | null = null;
  private state: ChromeState = defaultState;
  private options: ChromeBridgeOptions | null = null;

  mount(options: ChromeBridgeOptions): boolean {
    this.options = options;

    const topContainer = document.getElementById(options.topRootId);
    const leftContainer = document.getElementById(options.leftRootId);

    if (!topContainer || !leftContainer) {
      return false;
    }

    this.topRoot = createRoot(topContainer);
    this.leftRoot = createRoot(leftContainer);
    this.render();

    return topContainer.childNodes.length > 0 && leftContainer.childNodes.length > 0;
  }

  update(nextState: ChromeState): void {
    this.state = nextState;
    this.render();
  }

  private render(): void {
    if (!this.options || !this.topRoot || !this.leftRoot) {
      return;
    }

    flushSync(() => {
      this.topRoot?.render(
        <TopSection
          title={this.state.title}
          pickerLabel={this.state.pickerLabel}
          actionLabel={this.state.actionLabel}
          actionDisabled={this.state.actionDisabled}
          actionLoading={this.state.actionLoading}
          actionType={this.state.actionType}
          compact={this.state.compact}
          onActionPress={this.options.onActionPress}
          onToggleCompact={this.options.onToggleCompact}
        />,
      );

      this.leftRoot?.render(
        <LeftSection tabs={this.state.tabs} onTabSelect={this.options.onTabSelect} />,
      );
    });
  }
}

declare global {
  interface Window {
    ApolloChromeBridge?: ApolloChromeBridge;
  }
}

window.ApolloChromeBridge = new ApolloChromeBridge();
