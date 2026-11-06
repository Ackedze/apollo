export type ApolloEvidenceScalar = string | number | boolean | null;

export type ApolloEvidenceBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ApolloEvidenceRadius = number | {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
};

export type ApolloEvidenceVariableBinding = {
  property: string;
  variableIds: string[];
  variables: Array<{
    id: string;
    key: string | null;
    name: string | null;
    collectionId: string | null;
    collectionName: string | null;
  }>;
};

export type ApolloEvidencePaint = {
  value: string | null;
  resourceType: string | null;
  resourceId: string | null;
  resourceName: string | null;
  bindingName: string | null;
  bindingCollection: string | null;
  styleId: string | null;
  visible: boolean;
  paintCount: number;
  paintTypes: string[];
  weight: number | null;
  weights: {
    top: number | null;
    right: number | null;
    bottom: number | null;
    left: number | null;
  } | null;
  align: string | null;
};

export type ApolloEvidenceComponent = {
  key: string | null;
  name: string;
  variantProperties: Record<string, string>;
  componentProperties: Record<string, ApolloEvidenceScalar>;
  directOverrides: Array<{
    nodeId: string;
    fields: string[];
  }>;
};

export type ApolloEvidenceComponentOwner = {
  nodeId: string;
  componentKey: string | null;
  name: string;
  path: string;
  relativePath: string;
  variantProperties: Record<string, string>;
  componentProperties: Record<string, ApolloEvidenceScalar>;
};

export type ApolloEvidenceNode = {
  nodeId: string;
  parentNodeId: string | null;
  childNodeIds: string[];
  childOrder: number;
  depth: number;
  path: string;
  type: string;
  name: string;
  visible: boolean;
  bounds: ApolloEvidenceBounds | null;
  layout: {
    mode: string | null;
    positioning: string | null;
    wrap: string | null;
    sizingHorizontal: string | null;
    sizingVertical: string | null;
    primaryAxisAlignItems: string | null;
    counterAxisAlignItems: string | null;
    padding: {
      top: number | null;
      right: number | null;
      bottom: number | null;
      left: number | null;
    } | null;
    itemSpacing: number | null;
    clipsContent: boolean | null;
  };
  component: ApolloEvidenceComponent | null;
  componentOwner: ApolloEvidenceComponentOwner | null;
  text: {
    characters: string;
    length: number;
    textStyleId: string | null;
    lineHeight: number | null;
  } | null;
  styles: {
    fillStyleId: string | null;
    strokeStyleId: string | null;
    textStyleId: string | null;
    effectStyleId: string | null;
  };
  appearance: {
    opacity: number | null;
    radius: ApolloEvidenceRadius | null;
    fill: ApolloEvidencePaint | null;
    stroke: ApolloEvidencePaint | null;
  };
  variableBindings: ApolloEvidenceVariableBinding[];
};

export type ApolloEvidenceRelation = {
  id: string;
  kind: 'direct-child' | 'sibling-gap' | 'container-padding';
  fromNodeId: string;
  toNodeId: string | null;
  containerNodeId: string | null;
  axis: 'horizontal' | 'vertical' | null;
  edge: 'top' | 'right' | 'bottom' | 'left' | null;
  measurement: {
    actualPx: number;
    source: 'bounding-box-gap' | 'child-envelope';
    quality: 'exact';
  } | null;
};

export type ApolloEvidenceBaselineReference = {
  id: string;
  componentKey: string | null;
  nestedOwnerComponentKey: string | null;
  nestedOwnerRelativePath: string | null;
  variantProperties: Record<string, string>;
};

export type ApolloEvidenceChangeFact = {
  id: string;
  nodeId: string;
  nodeName: string;
  nodePath: string;
  property: string;
  kind: string;
  ownerComponentKey: string | null;
  baselineReferenceId: string;
  baseline: {
    value: ApolloEvidenceScalar;
    resourceType: string | null;
    resourceName: string | null;
    bindingName: string | null;
    bindingCollection: string | null;
  };
  actual: {
    value: ApolloEvidenceScalar;
    resourceType: string | null;
    resourceName: string | null;
    bindingName: string | null;
    bindingCollection: string | null;
  };
  bindingStatus: string | null;
  mapping: {
    method: 'apollo-effective-baseline-diff';
    quality: 'exact' | 'derived';
    referenceOrigin: 'host' | 'nested-component';
    nestedOwnerRelativePath: string | null;
  };
  candidateRuleIds: string[];
};

export type ApolloEvidenceRuleCandidate = {
  ruleId: string;
  severity: string;
  source: string;
  ruleKind: string | null;
  authority: {
    status: string | null;
    provenance: string | null;
    revision: number | null;
  } | null;
  appliesTo: string;
  checkType: string | null;
  matchKind: string | null;
  ruleText: string;
  remediation: string | null;
};

export type ApolloAuditEvidenceBundle = {
  schemaVersion: 2;
  documentType: 'apollo-audit-evidence-bundle';
  reportId: string;
  sourceReportId: string;
  generatedAt: string;
  context: {
    fileKey: string | null;
    pageId: string;
    platform: 'desktop' | 'mobile-web' | 'ios' | 'android';
    channel: string;
    pageType: string | null;
    viewportWidth: number | null;
    selectionNodeIds: string[];
  };
  graph: {
    nodes: ApolloEvidenceNode[];
    relations: ApolloEvidenceRelation[];
  };
  baselines: ApolloEvidenceBaselineReference[];
  changes: ApolloEvidenceChangeFact[];
  ruleCandidates: ApolloEvidenceRuleCandidate[];
  coverage: {
    visibleNodeCount: number;
    excludedHiddenNodeCount: number;
    excludedDecorativeNodeCount: number;
    componentNodeCount: number;
    textNodeCount: number;
    baselineChangeCount: number;
    limitations: string[];
  };
};
