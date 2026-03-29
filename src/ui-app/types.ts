export type ChromeTabItem = {
  id: string;
  title: string;
  count: number;
  active: boolean;
};

export type ChromeButtonType = 'primary' | 'secondary';

export type ChromeState = {
  title: string;
  actionLabel: string;
  actionDisabled: boolean;
  actionLoading: boolean;
  actionType: ChromeButtonType;
  tabs: ChromeTabItem[];
};

export type ChromeBridgeOptions = {
  topRootId: string;
  leftRootId: string;
  onActionPress: () => void;
  onTabSelect: (tabId: string) => void;
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

export type ThemeErrorResultItem = {
  kind: 'themeError';
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
  | ThemeErrorResultItem
  | ThemizationResultItem
  | CustomizationResultItem;

export type ResultsBridgeOptions = {
  rootId: string;
  onFocusItem: (id: string) => void;
};
