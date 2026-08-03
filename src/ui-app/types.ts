export type ChromeTabItem = {
  id: string;
  title: string;
  count: number;
  active: boolean;
  counterType: 'empty' | 'error' | 'warning' | 'general';
};

export type ChromeButtonType = 'primary' | 'secondary';

export type ChromeState = {
  title: string;
  channelId: string;
  pickerLabel: string;
  actionLabel: string;
  actionDisabled: boolean;
  actionLoading: boolean;
  actionType: ChromeButtonType;
  compact: boolean;
  shellAuditEnabled: boolean;
  tabs: ChromeTabItem[];
};

export type GenerationExampleCaptureRequest = {
  exampleId: string;
  exampleSetId: string | null;
  breakpointLabel: string | null;
  title: string;
  pageType:
    | 'form'
    | 'landing'
    | 'data-list'
    | 'details'
    | 'status-screen'
    | 'dashboard'
    | 'other';
  platform: 'desktop' | 'mobile-web' | 'ios' | 'android';
  exampleKind: 'golden' | 'variant' | 'anti-example';
  includeTextContent: boolean;
  sourceFigmaUrl: string | null;
};

export type ChromeBridgeOptions = {
  topRootId: string;
  leftRootId: string;
  onActionPress: () => void;
  onTabSelect: (tabId: string, count: number) => void;
  onToggleCompact: () => void;
  onChannelChange: (channelId: string) => void;
  onPickerChange: (pickerLabel: string) => void;
  onShellAuditToggle: () => void;
  onExampleCapture: (request: GenerationExampleCaptureRequest) => void;
};

export type AuditResultItem = {
  kind: 'audit' | 'customStyle';
  id: string;
  focusId?: string;
  title: string;
  caption?: string;
};

export type DetachedResultItem = {
  kind: 'detached';
  id: string;
  title: string;
  caption?: string;
  targetName: string;
};

export type ThemizationResultItem = {
  kind: 'themization';
  id: string;
  title: string;
  caption?: string;
  targetName: string;
  onReplace?: () => void;
};

export type DeprecatedStyleUsageItem = {
  id: string;
  name: string;
  onFocus?: () => void;
};

export type DeprecatedStyleResultItem = {
  kind: 'deprecatedStyle';
  id: string;
  title: string;
  caption?: string;
  usages: DeprecatedStyleUsageItem[];
};

export type CustomValueLine = {
  label: string;
  values: string[];
  marker?: 'Expected';
};

export type CustomChangeGroup = {
  id: string;
  name: string;
  lines: CustomValueLine[];
  onFocus?: () => void;
  onReset?: () => void;
};

export type CustomizationResultItem = {
  kind: 'customization';
  id: string;
  title: string;
  caption?: string;
  groups: CustomChangeGroup[];
};

export type ResultsItem =
  | AuditResultItem
  | DetachedResultItem
  | ThemizationResultItem
  | DeprecatedStyleResultItem
  | CustomizationResultItem;

export type ResultsBridgeOptions = {
  rootId: string;
  onFocusItem: (id: string) => void;
};
