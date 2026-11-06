export type CompositionPosition = 'first' | 'last' | number;

export type CompositionContractSelector = {
  nestedComponentKeys?: string[];
  nestedComponentNames?: string[];
  visibility?: 'visible' | 'all';
  order?: 'document';
};

export type CountBetweenConstraint = {
  id: string;
  op: 'countBetween';
  min: number;
  max: number;
  message: string;
};

export type PropertyDomainConstraint = {
  id: string;
  op: 'propertyDomain';
  property: string;
  values: string[];
  message: string;
};

export type ValuePositionConstraint = {
  id: string;
  op: 'valuePosition';
  property: string;
  value: string;
  positions: CompositionPosition[];
  maxCount?: number;
  replacement?: string;
  message: string;
};

export type PropertyEqualsHostConstraint = {
  id: string;
  op: 'propertyEqualsHost';
  property: string;
  hostProperty?: string;
  message: string;
};

export type PropertyEqualsFirstConstraint = {
  id: string;
  op: 'propertyEqualsFirst';
  property: string;
  message: string;
};

export type PropertySequenceConstraint = {
  id: string;
  op: 'propertySequence';
  property: string;
  values: string[];
  message: string;
};

export type CompositionConstraint =
  | CountBetweenConstraint
  | PropertyDomainConstraint
  | ValuePositionConstraint
  | PropertyEqualsHostConstraint
  | PropertyEqualsFirstConstraint
  | PropertySequenceConstraint;

export type SubtreePropertyPolicy = {
  id: string;
  variantProperty: string;
  controlledProperties: string[];
  allowedPropertiesByValue: Record<string, string[]>;
  allowedMessage: string;
  violationMessage: string;
};

export type CompositionContract = {
  id: string;
  match: {
    hostComponentKeys?: string[];
    hostComponentNames?: string[];
  };
  select: CompositionContractSelector;
  constraints: CompositionConstraint[];
  subtreePropertyPolicies?: SubtreePropertyPolicy[];
};

export type CompositionContractsConfig = {
  schemaVersion: 1;
  contracts: CompositionContract[];
};

export type CompositionContractMember = {
  nodeId: string;
  nodeName: string;
  nodePath: string;
  visible: boolean;
  componentKey: string | null;
  componentName: string | null;
  position: number;
  count: number;
  variantProperties: Record<string, string>;
  expectedVariantProperties: Record<string, string>;
  subtreeNodeIds: Set<string>;
};

export type CompositionContractContext = {
  contract: CompositionContract;
  host: {
    nodeId: string | null;
    nodeName: string;
    nodePath: string;
    componentKey: string | null;
    componentName: string | null;
    variantProperties: Record<string, string>;
  };
  members: CompositionContractMember[];
};

export type CompositionConstraintDecision = {
  verdict: 'expected' | 'violation';
  contractId: string;
  constraintId: string;
  message: string;
  target: CompositionContractMember | null;
  property: string | null;
  expected: string | number | null;
  actual: string | number | null;
  evidence: Record<string, unknown>;
  remediation: {
    kind: 'set-variant-properties';
    nodeId: string;
    properties: Record<string, string>;
  } | null;
};

export type CompositionConstraintEvaluator<T extends CompositionConstraint> = (
  constraint: T,
  context: CompositionContractContext,
) => CompositionConstraintDecision[];

export type CompositionSubtreePropertyDecision = {
  verdict: 'expected' | 'violation';
  contractId: string;
  policyId: string;
  message: string;
  variantProperty: string;
  variantValue: string;
  property: string;
  allowedProperties: string[];
};
