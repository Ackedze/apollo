export type CustomizationAssessmentVerdict =
  | 'expected'
  | 'allowed'
  | 'violation'
  | 'unknown';

export type CustomizationAssessmentSource =
  | 'catalog-host'
  | 'component-contract'
  | 'pattern-rule'
  | 'standalone-reference';

export type CustomizationAssessment = {
  verdict: CustomizationAssessmentVerdict;
  source: CustomizationAssessmentSource;
  reasonCode: string;
  ruleId: string | null;
  contractId?: string | null;
  constraintId?: string | null;
  evidence?: Record<string, unknown> | null;
  message: string;
  presentation?:
    | 'show'
    | 'show-expected'
    | 'suppress-derived'
    | 'semantic-variant';
  semanticVariantChanges?: Array<{
    nodeId: string;
    property: string;
    expected: string;
    actual: string;
  }>;
  remediation?: {
    kind: 'set-variant-properties';
    nodeId: string;
    properties: Record<string, string>;
  } | null;
};
