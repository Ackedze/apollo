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
  pickerLabel: string;
  actionLabel: string;
  actionDisabled: boolean;
  actionLoading: boolean;
  actionType: ChromeButtonType;
  compact: boolean;
  tabs: ChromeTabItem[];
};

export type ChromeBridgeOptions = {
  topRootId: string;
  leftRootId: string;
  onActionPress: () => void;
  onTabSelect: (tabId: string, count: number) => void;
  onToggleCompact: () => void;
};

export type AuditResultItem = {
  kind: 'audit' | 'customStyle';
  id: string;
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
