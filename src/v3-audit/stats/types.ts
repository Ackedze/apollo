import type { ComponentLifecycle } from '../component-lifecycle';
import type {
  AuditItem,
  CustomStyleEntry,
  DeprecatedStyleEntry,
  DetachedEntry,
  ThemeAuditEntry,
} from '../types/audit';
import type {
  LibraryComponentFreshness,
} from '../services/libraryComponentFreshness';
import type { UpdateReason } from '../types/audit';
import type {
  RuntimeAuditPresentation,
  RuntimeComponentAgentContext,
} from '../rules/artifactContext';
import type { ApolloPageType } from '../types/pageContext';
import type { ApolloAuditEvidenceBundle } from './evidenceTypes';
import type {
  DiffContext,
  VariableBindingEvidence,
  VariableBindingStatus,
  VariableModeEvidence,
} from '../structure/diff';

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

export type StatsComponentContractRule = {
  ruleId: string;
  severity: string;
  source: string;
  ruleKind: string | null;
  authority: {
    status: string | null;
    provenance: string | null;
    revision: number | null;
  } | null;
  severityScope: string | null;
  appliesTo: string;
  checkType: string | null;
  matchKind: string | null;
  changeScope: string | null;
  ruleText: string;
  remediation: string | null;
  numericConstraint: {
    minimum?: number;
    maximum?: number;
    recommended?: number;
  } | null;
  requiredTokenSource: {
    path?: string;
    collection?: string;
    tokenNames?: string[];
  } | null;
};

export type StatsNode = {
  id: string;
  name: string;
  type: string | null;
  pageName: string;
  path: string;
  visible: boolean;
  ancestorNodeIds?: string[];
};

export type StatsComponentItem = {
  node: StatsNode;
  component: StatsResource;
  variant: StatsResource | null;
  comparisonIssues: string[];
  updateReasons: UpdateReason[];
  libraryFreshness: LibraryComponentFreshness | null;
  catalogLifecycle?: ComponentLifecycle | null;
  localComponentOwner: StatsNode | null;
};

export type StatsCustomizationChange = {
  node: StatsNode;
  kind: string;
  property: string;
  message: string;
  reference: {
    value: string | number | null;
    resource: StatsResource | null;
    binding: VariableBindingEvidence | null;
  };
  actual: {
    value: string | number | null;
    resource: StatsResource | null;
    binding: VariableBindingEvidence | null;
  };
  bindingStatus: VariableBindingStatus | null;
  variableMode: VariableModeEvidence | null;
  signature: string;
  context: DiffContext;
  componentRules: StatsComponentContractRule[];
  presentation: RuntimeAuditPresentation | null;
  assessment: {
    verdict: string;
    source: string;
    reasonCode: string;
    ruleId: string | null;
    contractId?: string | null;
    constraintId?: string | null;
    evidence?: Record<string, unknown> | null;
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
    pageType: ApolloPageType | null;
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
    settings: {
      shellAuditEnabled: boolean;
      experimentalContractV2Enabled: boolean;
    };
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
  updateReasons?: UpdateReason[];
  libraryFreshness?: LibraryComponentFreshness | null;
  catalogLifecycle?: ComponentLifecycle | null;
  localComponentOwner?: StatsNode | null;
  changes?: Array<{
    node: StatsNode;
    kind: string;
    property: string;
    message: string;
    referenceValue: string | number | null;
    actualValue: string | number | null;
    referenceRawValue?: string | number | null;
    actualRawValue?: string | number | null;
    referenceDisplayValue?: string | number | null;
    actualDisplayValue?: string | number | null;
    referenceResource?: Pick<StatsResource, 'name' | 'key' | 'library'> | null;
    actualResource?: Pick<StatsResource, 'name' | 'key' | 'library'> | null;
    referenceBinding?: VariableBindingEvidence | null;
    actualBinding?: VariableBindingEvidence | null;
    bindingStatus?: VariableBindingStatus | null;
    variableMode?: VariableModeEvidence | null;
    context?: StatsCustomizationChange['context'];
    componentRules?: StatsComponentContractRule[];
    presentation?: RuntimeAuditPresentation | null;
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
  componentContexts: RuntimeComponentAgentContext[];
};

export type ApolloBaselineCustomizationReport = {
  schemaVersion: 1;
  reportKind: 'apollo-customizations-wip-report';
  reportId: string;
  sourceReportId: string;
  generatedAt: string;
  suggestedFileName: string;
  user: ApolloStatsReport['user'];
  plugin: ApolloStatsReport['plugin'];
  figma: ApolloStatsReport['figma'];
  scan: ApolloStatsReport['scan'];
  summary: {
    scannedComponents: number;
    componentCount: number;
    changeCount: number;
  };
  category: {
    id: 'customizationsWip';
    title: 'Кастомизации [WIP]';
    count: number;
    changeCount: number;
    items: StatsCustomizationItem[];
  };
};

export type ApolloPatternOccurrence = {
  node: StatsNode;
  component: Pick<
    StatsResource,
    'name' | 'key' | 'library' | 'sourceFile'
  >;
  variant: {
    name: string;
    key: string | null;
    properties: Record<string, string>;
  } | null;
  ancestors: Array<{
    nodeId: string;
    name: string;
    componentName: string;
    componentKey: string | null;
    variantProperties: Record<string, string>;
  }>;
  documentOrder: number;
};

export type ApolloLayoutRelationNode = {
  nodeId: string;
  name: string;
  type: string;
  path: string;
};

export type ApolloLayoutRelation = {
  id: string;
  axis: 'vertical';
  relationKind: 'page-top-margin' | 'next-content-gap';
  from: ApolloLayoutRelationNode;
  to: ApolloLayoutRelationNode;
  container: (ApolloLayoutRelationNode & {
    layoutMode: string | null;
    itemSpacing: number | null;
  }) | null;
  measurement: {
    actualPx: number;
    source: 'bounding-box-gap' | 'spacer-height';
  };
  semantic: {
    fromRole: 'header' | 'title-view';
    toRole: 'title-view' | 'content' | 'tabs-view' | 'filters-block' | 'plate' | 'top-bar';
  };
  contextComplete: boolean;
};

export type ApolloPatternAuditReport = {
  schemaVersion: 1;
  reportKind: 'apollo-pattern-audit-report';
  reportId: string;
  sourceReportId: string;
  generatedAt: string;
  suggestedFileName: string;
  user: ApolloStatsReport['user'];
  plugin: ApolloStatsReport['plugin'];
  figma: ApolloStatsReport['figma'];
  scan: ApolloStatsReport['scan'];
  summary: {
    scannedComponents: number;
    occurrenceCount: number;
    layoutRelationCount: number;
    generalChangeCount: number;
    requestedRuleCount: number;
  };
  requestedRuleIds: string[];
  category: ApolloBaselineCustomizationReport['category'];
  facts: {
    occurrences: ApolloPatternOccurrence[];
    layoutRelations: ApolloLayoutRelation[];
  };
  evidenceBundle?: ApolloAuditEvidenceBundle;
};

export type ApolloTextComponentContext = {
  nodeId: string;
  name: string;
  componentName: string;
  componentKey: string | null;
  variantProperties: Record<string, string>;
};

export type ApolloTextFact = {
  node: StatsNode;
  text: string;
  owner: ApolloTextComponentContext | null;
  ancestors: ApolloTextComponentContext[];
  documentOrder: number;
};

export type ApolloTextAuditReport = {
  schemaVersion: 1;
  reportKind: 'apollo-text-audit-report';
  reportId: string;
  sourceReportId: string;
  generatedAt: string;
  suggestedFileName: string;
  user: ApolloStatsReport['user'];
  plugin: ApolloStatsReport['plugin'];
  figma: ApolloStatsReport['figma'];
  scan: ApolloStatsReport['scan'];
  summary: {
    scannedTextNodes: number;
  };
  facts: {
    texts: ApolloTextFact[];
  };
};
