import type {
  AuditItem,
  CustomStyleEntry,
  DeprecatedStyleEntry,
  DetachedEntry,
  ThemeAuditEntry,
} from '../types/audit';

export type StatsResourceType =
  | 'component'
  | 'component-variant'
  | 'style'
  | 'token'
  | 'raw-value';

export type StatsResource = {
  type: StatsResourceType;
  name: string;
  key: string | null;
  id: string | null;
  library: string | null;
  sourceFile: string | null;
};

export type StatsNode = {
  id: string;
  name: string;
  type: string | null;
  pageName: string;
  path: string;
  visible: boolean;
};

export type StatsComponentItem = {
  node: StatsNode;
  component: StatsResource;
  variant: StatsResource | null;
  comparisonIssues: string[];
};

export type StatsCustomizationChange = {
  node: StatsNode;
  kind: string;
  property: string;
  message: string;
  reference: {
    value: string | number | null;
    resource: StatsResource | null;
  };
  actual: {
    value: string | number | null;
    resource: StatsResource | null;
  };
  signature: string;
  context: Record<string, string | null>;
  assessment: {
    verdict: string;
    source: string;
    reasonCode: string;
    ruleId: string | null;
    message: string;
    remediation: {
      kind: string;
      nodeId: string;
      properties: Record<string, string>;
    } | null;
  } | null;
};

export type StatsCustomizationItem = StatsComponentItem & {
  changes: StatsCustomizationChange[];
};

export type StatsStyleItem = {
  node: StatsNode;
  style: StatsResource;
  usage: string;
};

export type StatsDetachedItem = {
  node: StatsNode;
  component: StatsResource;
};

export type StatsThemeItem = {
  node: StatsNode;
  kind: string;
  recommendation: string;
  component: StatsResource | null;
};

export type StatsCategory<T> = {
  count: number;
  items: T[];
};

export type ApolloStatsViews = {
  deprecatedComponents: AuditItem[];
  deprecatedStyles: DeprecatedStyleEntry[];
  customStyles: CustomStyleEntry[];
  updates: AuditItem[];
  customizations: AuditItem[];
  localComponents: AuditItem[];
  detachedComponents: DetachedEntry[];
  presets: AuditItem[];
  technicalComponents: AuditItem[];
  currentComponents: AuditItem[];
  wrongChannel: AuditItem[];
  themization: ThemeAuditEntry[];
};

export type ApolloStatsReport = {
  schemaVersion: 1;
  reportKind?: 'apollo-full-report';
  reportId: string;
  generatedAt: string;
  suggestedFileName: string;
  user: {
    id: string | null;
    name: string;
    slug: string;
  };
  plugin: {
    name: 'Apollo';
    version: string;
  };
  figma: {
    fileKey: string | null;
    fileName: string | null;
    editorType: string;
  };
  scan: {
    channel: string;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    selection: Array<{
      nodeId: string;
      name: string;
      nodeType: string;
      path: string;
      componentKey: string | null;
    }>;
  };
  summary: {
    scannedComponents: number;
    problemOccurrenceCount: number;
    categoryCounts: Record<keyof ApolloStatsViews, number>;
  };
  categories: {
    deprecatedComponents: StatsCategory<StatsComponentItem>;
    deprecatedStyles: StatsCategory<StatsStyleItem>;
    customStyles: StatsCategory<StatsStyleItem>;
    updates: StatsCategory<StatsComponentItem>;
    customizations: StatsCategory<StatsCustomizationItem>;
    localComponents: StatsCategory<StatsComponentItem>;
    detachedComponents: StatsCategory<StatsDetachedItem>;
    presets: StatsCategory<StatsComponentItem>;
    technicalComponents: StatsCategory<StatsComponentItem>;
    currentComponents: StatsCategory<StatsComponentItem>;
    wrongChannel: StatsCategory<StatsComponentItem>;
    themization: StatsCategory<StatsThemeItem>;
  };
};

export type ApolloAgentSeverityHint = 'high' | 'medium' | 'low';

export type ApolloAgentFindingCategory =
  | 'deprecatedComponents'
  | 'deprecatedStyles'
  | 'customStyles'
  | 'updates'
  | 'customizations'
  | 'localComponents'
  | 'detachedComponents'
  | 'presets'
  | 'technicalComponents'
  | 'wrongChannel'
  | 'themization';

export type ApolloAgentFinding = {
  category: ApolloAgentFindingCategory;
  severityHint: ApolloAgentSeverityHint;
  title: string;
  node: StatsNode;
  component?: Pick<StatsResource, 'name' | 'key' | 'library' | 'sourceFile'> | null;
  variant?: Pick<StatsResource, 'name' | 'key'> | null;
  style?: Pick<StatsResource, 'name' | 'key' | 'library' | 'sourceFile'> | null;
  usage?: string;
  kind?: string;
  recommendation?: string;
  comparisonIssues?: string[];
  changes?: Array<{
    node: StatsNode;
    kind: string;
    property: string;
    message: string;
    referenceValue: string | number | null;
    actualValue: string | number | null;
    referenceResource?: Pick<StatsResource, 'name' | 'key' | 'library'> | null;
    actualResource?: Pick<StatsResource, 'name' | 'key' | 'library'> | null;
    assessment: StatsCustomizationChange['assessment'];
  }>;
};

export type ApolloAgentReport = {
  schemaVersion: 1;
  reportKind: 'apollo-agent-report';
  reportId: string;
  sourceReportId: string;
  generatedAt: string;
  suggestedFileName: string;
  user: ApolloStatsReport['user'];
  plugin: ApolloStatsReport['plugin'];
  figma: ApolloStatsReport['figma'];
  scan: ApolloStatsReport['scan'];
  summary: ApolloStatsReport['summary'] & {
    includedFindingCount: number;
    omittedCurrentComponentCount: number;
  };
  guidance: {
    purpose: string;
    expectedOutput: string;
    notes: string[];
  };
  categorySummaries: Record<
    ApolloAgentFindingCategory,
    {
      totalCount: number;
      includedCount: number;
      severityHint: ApolloAgentSeverityHint;
    }
  >;
  findings: ApolloAgentFinding[];
};
