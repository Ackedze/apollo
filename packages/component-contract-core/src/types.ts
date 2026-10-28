export const LEGACY_MANUAL_SCHEMA_VERSION = 'apollo.component-contract.manual.v1-experimental' as const;
export const MANUAL_SCHEMA_VERSION = 'apollo.component-contract.manual.v2-experimental' as const;
export const COMPILED_SCHEMA_VERSION = 'apollo.component-contract.v2.1-experimental' as const;

export type Permission = 'forbidden' | 'allowed' | 'constrained';
export type TargetScope = 'self' | 'self-and-descendants' | 'descendants';
export type RuleStatus = 'draft' | 'reviewed' | 'deprecated';
export type Severity = 'error' | 'warning' | 'info';
export type TargetResolution = 'resolved' | 'ambiguous' | 'missing' | 'unknown';
export type Lifecycle = 'active' | 'scheduled' | 'deprecated';
export type RepresentationKind = 'figma' | 'code';
export type RepresentationStatus = 'verified' | 'draft' | 'scheduled' | 'deprecated';
export type RuleExecutionRoute = 'auto' | 'predicate' | 'policy-only' | 'delegated' | 'context-only';

export type ControlPathKind =
  | 'direct'
  | 'host-property'
  | 'nested-property'
  | 'slot-api'
  | 'variable-binding'
  | 'inherited-port';

export type ConstraintType =
  | 'propertyDomain'
  | 'propertyExclusion'
  | 'presence'
  | 'propertyForbidden'
  | 'quantity'
  | 'memberCollection'
  | 'positionOrder'
  | 'relationship'
  | 'tokenBinding'
  | 'styleBinding'
  | 'bindingConsistency'
  | 'dependencyDomain'
  | 'transitionInvariant'
  | 'configurationDomain'
  | 'configurationMapping'
  | 'instanceReplacementDomain'
  | 'layoutConstraint';

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ComponentIdentity = {
  componentId: string;
  familyId: string;
  contractId: string;
  family: string;
  layer: string;
  library: string;
  platform: string;
  platforms: string[];
  lifecycle: Lifecycle;
  componentKey: string;
};

export type ComponentSemantics = {
  purpose: string;
  useWhen: string[];
  doNotUseWhen: Array<{
    condition: string;
    useComponentId?: string;
  }>;
  relatedComponentIds: string[];
  keywords: string[];
};


export type EvidenceRef = { path: string; sha256: string };
/** Independent claims: an available API is neither layout parity nor live acceptance. */
export type RepresentationEvidence = {
  version: 1;
  sourcePin: { packageName:string; packageVersion:string; commit:string; registryDigest:string; mappingId:string };
  availability: { status:'confirmed-source-api'|'unresolved'; evidenceRefs:EvidenceRef[] };
  parity: { status:'not-confirmed'|'accepted-for-profile'; profileIds:string[]; unresolvedGapIds:string[] };
  acceptance: { status:'not-run'|'accepted'; receiptRefs:EvidenceRef[] };
  publication: { status:'not-confirmed'|'published' };
};
export type CodeTransform = {version:1;id:'identity'} | {version:1;id:'enum-map';entries:Array<{from:JsonValue;to:string|number|boolean}>};
export type OwnedOccurrenceCodeBinding = {
  version:1; dependencyId:string; dependencyBindingId:string; sourceRepresentationId:string;
  collectionResolver:{version:1;source:'trusted-native-capture';ownerTargetId:string;visibility:'captured-effective';ordering:'captured-source-order'};
  sourceProperty:{property:string;propertyType:'TEXT'|'BOOLEAN'|'VARIANT'};
  transformId:'owned-button-label.v1'|'owned-button-disabled.v1'|'owned-button-primary-first.v1';
};
export type NativeSlotCodeBinding = {
  version:1;figmaRepresentationId:string;targetId:string;propertyIdentity:string;propertyType:'SLOT';
  codeRepresentationId:string;codePath:'props.children';contentPolicy:'preserve-ordered-content';proof:'trusted-native-capture';
};

export type ComponentRepresentation = {
  id: string;
  kind: RepresentationKind;
  platform: string;
  surface?: string;
  status: RepresentationStatus;
  locator: Record<string, JsonValue>;
  codeEvidence?: RepresentationEvidence;
};

export type SemanticApiBinding = {
  representationId: string;
  path: string;
  transform?: string;
  /** Read-only fact of an explicit semantic target, never a Figma property write. */
  targetId?: string;
  codeTransform?: CodeTransform;
  ownedOccurrence?: OwnedOccurrenceCodeBinding;
  nativeSlotBinding?: NativeSlotCodeBinding;
};

export type SemanticApiProperty = {
  id: string;
  kind: 'variant' | 'content' | 'visibility' | 'slot' | 'state' | 'layout' | 'appearance' | 'code-only';
  valueType: 'boolean' | 'string' | 'number' | 'enum' | 'node' | 'content';
  domain?: JsonValue[];
  defaultValue?: JsonValue;
  description?: string;
  bindings: SemanticApiBinding[];
  /** Independent scenario input; never inferred from bindings or defaultValue. */
  validationInput?: { version: 1 | 2; label: string; description: string };
};

export type DocumentationRef = {
  id: string;
  kind: string;
  path: string;
  status: 'verified' | 'draft' | 'deprecated';
  projection?: 'source' | 'generated' | 'reference-only';
};

export type GenerationProfile = {
  id: string;
  intent: string;
  platform: string;
  representationId: string;
  properties: Record<string, JsonValue>;
  rationale?: string;
};

export type ContractExample = {
  id: string;
  kind: 'generation' | 'validation' | 'mapping';
  intent: string;
  input: Record<string, JsonValue>;
  expected: Record<string, JsonValue>;
  ruleIds?: string[];
  sourceRefs?: string[];
  status: RuleStatus;
};

export type ContractDecision = {
  id: string;
  status: 'accepted' | 'needs-confirmation' | 'superseded';
  summary: string;
  rationale: string;
  sourceRefs: string[];
  supersedes?: string[];
  /** Explicit owner cancellation; audit only, never an executable rule. */
  retiredRuleIds?: string[];
};

export type ComponentChoice = {
  contractId: string;
  label: string;
  platform: string;
  componentKey: string;
};

export type VariantScenario = {
  id: string;
  label: string;
  componentKey: string;
  properties: Record<string, string>;
};

/** Closed authoring locator; runtime must independently prove the live native target. */
export type DeclaredTargetBindingV1 = {
  representationId: string;
  componentKey: string;
  componentSetKey: string;
  referenceHash: string;
  /** Policy v2 only; exact hash remains provenance, portable hash excludes file-local main IDs. */
  portableReferenceHash?: string;
  /** Opt-in configuration v1/v2: native structure and types, independent of root TEXT/BOOLEAN values. */
  configurationReferenceHash?: string;
  referencePath: string;
  nodeType: string;
  nativeSource?: { sourceNodeId: string; ownerComponentKey: string; ownerMainComponentId: string };
};

export type SemanticTarget = {
  id: string;
  semanticRole: string;
  label: string;
  componentFamily?: string;
  lineage: string[];
  structuralFingerprint?: string;
  representationHints?: Array<{
    representationId: string;
    nameHint?: string;
    pathHint?: string;
    structuralFingerprint?: string;
  }>;
  /** Reviewed source address for one actual library variant. No sibling-index continuity. */
  variantHints?: Array<{representationId:string;componentKey:string;pathHint:string}>;
  identityBindingsV1?: DeclaredTargetBindingV1[];
  /** Explicit native owner/source addresses; not permission to change a component. */
  nativeSourceContinuity?: { version: 1; anchorTargetId: string; nodeType: 'INSTANCE' | 'TEXT';
    sources: Array<{ ownerComponentKey: string; sourceNodeId: string }> };
  nameHint?: string;
  pathHint?: string;
  nodeIdHint?: string;
  resolution?: TargetResolution;
  /** Explicit continuity inside an independently verified same-family variant; never a swap. */
  variantContinuity?: { kind: 'same-family-text'; anchorTargetId: string };
};

/** Values remain typed Figma properties; no implicit Boolean/string conversion. */
export type CollectionProperty = { property: string; propertyType: 'VARIANT' | 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP' };
export type CollectionFilter = CollectionProperty & { values: JsonValue[] };
export type MemberCollection = {
  version: 1;
  ownerTargetRole: string;
  memberTargetRoles: string[];
  /** Ignore only source-proven native reference containers, never foreign actual children. */
  nonMemberReferenceTypes?: Array<'FRAME' | 'GROUP'>;
  /** Open native SLOT payload: compare only the declared component families, without closing its contents. */
  slotContent?: { componentSetKeys: string[] };
  representationIds: string[];
  visibleOnly: boolean;
  filter?: CollectionFilter;
  whenHost?: CollectionFilter;
  whenMember?: CollectionFilter;
  assertion:
    | { kind: 'membership' }
    | { kind: 'count'; min?: number; max?: number }
    | { kind: 'position'; position: 'first' | 'last' }
    | ({ kind: 'propertyDomain'; values: JsonValue[] } & CollectionProperty)
    | ({ kind: 'propertyMapping'; hostProperty: string; hostPropertyType: CollectionProperty['propertyType']; transform?: 'identity' | 'string-to-boolean' } & CollectionProperty)
    | ({ kind: 'hostRequirement'; values: JsonValue[] } & CollectionProperty);
};

export type ControlPath = {
  kind: ControlPathKind;
  property?: string;
  target?: string;
  /** Explicit local owner of a nested slot's native BOOLEAN property. Omitted = component root. */
  ownerTargetId?: string;
  /** Open slot contents are outside this component contract; the slot root is still checked. */
  contentOwnership?: 'external';
  collection?: string;
  variable?: string;
  port?: string;
  priority?: number;
  required?: boolean;
  exclusive?: boolean;
};

export type TypedConstraint = {
  type: ConstraintType;
  collection?: MemberCollection;
  replacement?: { targetRole: string; alternatives: Array<{ componentSetKey: string; properties?: Record<string,string[]> }> };
  /** Equality of explicit visible TEXT targets; no name-based subtree collection. */
  bindingKind?: 'fill-token' | 'text-style';
  bindingReference?: 'shared' | 'selected-variant';
  /** Pinned generated text-style catalog; no per-component copied key allowlist. */
  styleCatalog?: string;
  /** Conditional specification mapping; not an intrinsic permission or code prop. */
  mapping?: {
    activeRoles: string[];
    cases: Array<{ id: string; when: Record<string, JsonValue>; requirements: Array<{
      targetRole: string; fact: string; value?: JsonValue; values?: JsonValue[];
    }> }>;
  };
  /** Joint, component-local configurations; executed by ordinary RuleIR predicates. */
  configuration?: {
    activeRoles: string[];
    profiles: Array<{ id: string; requirements: Array<{ targetRole: string; fact: string; value?: JsonValue; baseline?: true }> }>;
    specificationInput?: string;
  };
  /** Transfer just this fact on named targets to a validated configuration rule. */
  exceptConfiguration?: { ruleId: string; targetRoles: string[] };
  fact?: string;
  /** Explicit opt-in: pinned selected library variant, not contextual host overrides. */
  baselineSource?: 'library-text';
  textNormalization?: 'trim';
  values?: JsonValue[];
  value?: JsonValue;
  min?: number;
  max?: number;
  expected?: boolean;
  order?: string[];
  /** Omitted preserves legacy visible-child ordering. Structural includes hidden children. */
  orderScope?: 'visible' | 'structural';
  relation?: 'direct-parent' | 'ancestor' | 'direct-child' | 'descendant' | 'before' | 'after' | 'adjacent';
  targetRole?: string;
  /** Explicit union of declared semantic targets, not a name-based slot heuristic. */
  targetRoles?: string[];
  visibleOnly?: boolean;
  /** Count visible identity-proven instances across the declared fixed bindings. */
  contractDependencyId?: string;
  tokenIds?: string[];
  bindingRequired?: boolean;
  operator?: 'equals' | 'between' | 'at-most-line-height';
  transition?: {
    dependencyId: string;
    from: boolean;
    to: boolean;
    invariantFacts: string[];
    tolerance: number;
    evidenceProfile: 'same-instance-context@1';
  };
  /** Explicit component-local selectors. Paths are relative to a semantic target. */
  dependency?: {
    /** Fixed nested component declared once in componentDependencies; not an icon swap. */
    contractDependencyId?: string;
    subjects: Array<{ targetRole: string; relativePath: string }>;
    subjectCondition?: CollectionFilter;
    field: 'componentSetKey' | 'catalog' | 'portName' | 'width' | 'height' | 'variantProperty' | 'changed';
    /** Exact typed VARIANT property of the bound asset, never inferred from bounds/name. */
    property?: string;
    /** Applicability filter; portNames still declares the complete consumer domain. */
    activePorts?: string[];
    portNames?: string[];
    /** Restrict asset checks to proven catalog membership; missing identity stays unknown. */
    catalogs?: string[];
    /** Explicit absolute tolerance in Figma px, for width/height only. */
    tolerance?: number;
    baselinePolicy: 'require-domain' | 'allow-unchanged';
    sourceFact?: string;
    cases?: Array<{ when: JsonValue[]; values: JsonValue[]; context?: Record<string, JsonValue> }>;
  };
};

export type Applicability = {
  /** Explicit finite domains for observed context facts; no prose inference. */
  contextDomains?: Record<string, JsonValue[]>;
  variants: 'all' | Record<string, string[]>;
  /** New authoring writes collectionId -> allowed modeIds. string[] is legacy evidence only. */
  modes: 'all' | string[] | Record<string, string[]>;
  platforms: string[];
  products?: string[];
  channels?: string[];
  context?: Record<string, JsonValue>;
  /** Legacy rules remain subject-relative until the author explicitly chooses the host. */
  conditionSubject?: 'target' | 'component-root';
  /** Active when at least one visible, proven owner selects the dependency variant. */
  activeDependency?: string;
  /** Cross-representation conformance only; omission means intrinsic checks in both modes. */
  validationMode?: 'specification';
  scopeStatus?: 'confirmed' | 'needs-confirmation';
};

export type RuleExecution = {
  route: RuleExecutionRoute;
  externalRuleIds?: string[];
  missingFacts?: string[];
};

/** Normative responsibility; independent of the author/team in `owner` and execution route. */
export type RuleOwnership = {
  kind: 'component' | 'product-policy' | 'pattern' | 'editorial-policy';
  ownerId: string;
};

export type ManualRule = {
  id: string;
  targetId: string;
  targetScope?: TargetScope;
  /** Opt-in: recursive baseline policies stop at proven contract-owned children. */
  boundaryPolicy?: 'component-owned@1';
  /** Opt-in for visible style/text details; absence/visibility requirements are separate. */
  targetApplicability?: 'visible-target@1';
  /** Opt-in configured native BOOLEAN/VARIANT value conformance; visual activity stays separate. */
  propertyConformance?: 'configured-native@1';
  capability: string;
  capabilitySet?: string;
  capabilitySelection?: string[];
  permission: Permission;
  controlPaths: ControlPath[];
  constraints: TypedConstraint[];
  /** Exact-property gates; omitted means the historical unconditional comparison. */
  propertyApplicability?: {
    'appearance.strokeWeight'?: 'stroke-present-either@1';
    'layout.itemSpacing'?: 'flow-gap-either@1';
    'layout.padding.top'?: 'auto-layout-padding-either@1';
    'layout.padding.right'?: 'auto-layout-padding-either@1';
    'layout.padding.bottom'?: 'auto-layout-padding-either@1';
    'layout.padding.left'?: 'auto-layout-padding-either@1';
    'layout.primaryAxisAlignItems'?: 'flow-alignment-either@1';
    'layout.counterAxisAlignItems'?: 'flow-alignment-either@1';
  };
  applicability: Applicability;
  severity: Severity;
  rationale: string;
  message?: string;
  remediationMessage?: string;
  remediationIntent?: string;
  status: RuleStatus;
  owner: string;
  ownership?: RuleOwnership;
  sourceRefs?: string[];
  execution?: RuleExecution;
};

export type ControlPort = {
  id: string;
  label: string;
  targetId: string;
  capability: string;
  required: boolean;
};

export type ManualSource = {
  schemaVersion: typeof MANUAL_SCHEMA_VERSION;
  documentType: 'component-contract-manual';
  component: ComponentIdentity;
  semantics: ComponentSemantics;
  representations: ComponentRepresentation[];
  semanticApi: SemanticApiProperty[];
  /** Explicit scenario context, separate from the component's semantic API. */
  validationContext?: Array<{ id: string; valueType: 'boolean' | 'enum'; domain?: string[]; label: string; description: string }>;
  documentation: DocumentationRef[];
  examples: ContractExample[];
  decisions: ContractDecision[];
  generation: {
    profiles: GenerationProfile[];
    instructions: string[];
  };
  source: {
    kind: 'athena-package' | 'component-contract-v2' | 'manual-source' | 'figma-selection';
    importedFiles: string[];
    sourceHash: string;
    importedAt: string;
  };
  targets: SemanticTarget[];
  controlPorts: ControlPort[];
  componentDependencies?: ComponentDependency[];
  rules: ManualRule[];
  metadata: {
    declaredTargetIdentityVersion?: 1 | 2 | 3;
    declaredTargetConfigurationVersion?: 1 | 2;
    ruleOwnershipVersion?: 1;
    publicRepresentationBoundaryVersion?: 1;
    dependencyCompletionVersion?: 1;
    instanceMainComponentAliasesVersion?: 1;
    owners: {
      generated: 'athena-cli';
      manual: string;
      runtime: 'apollo-runtime';
    };
    revision: number;
    createdAt?: string;
    updatedAt?: string;
  };
};

export type FixedNestedBinding = {
  kind?: 'fixed-nested' | 'fixed-nested-scoped';
  id: string;
  targetRole: string;
  relativePath: string;
  ownerComponentSetKeys: string[];
  activeVariant: { property: string; values: string[] };
  childPath: string;
  representationIds?: string[];
};

/** A component-owned direct occurrence. Empty legacy childPath is never reinterpreted. */
export type DirectChildBinding = {
  kind: 'direct-child';
  id: string;
  targetRole: string;
  relativePath: '';
  ownerTargetRole: string;
  ownerComponentKeys: string[];
  representationIds: string[];
};

export type ComponentDependencyBinding = FixedNestedBinding | DirectChildBinding;

/** Only a pin and local composition bindings are authored by the parent owner. */
export type ComponentDependency = {
  id: string;
  componentId: string;
  revision: number;
  manualSourceHash: string;
  compiledHash: string;
  bindings: ComponentDependencyBinding[];
};

export type CompiledComponentDependency = ComponentDependency & {
  contract?: CompiledContract;
  issue?: string;
};

export type AnatomyNode = {
  id: string;
  /** Diagnostic locator only; never used as semantic identity. */
  figmaNodeId?: string;
  parentId: string | null;
  name: string;
  type: string;
  path: string;
  semanticRole: string;
  visible: boolean;
  order: number;
  depth: number;
  childIds: string[];
  properties: Record<string, JsonValue>;
  unknownFacts: string[];
};

export type PreviewSnapshot = {
  schemaVersion: 'apollo.predicate-snapshot.v2';
  generatedAt: string;
  validationRequest?: { version: 1; mode: 'component-audit' | 'specification' };
  validationIntent?: {
    schemaVersion: 'apollo.validation-intent.v1';
    origin: 'explicit-scenario-input';
    manualSourceHash: string;
    subject: { rootNodeId: string; pageId: string; componentKey: string; componentSetKey: string };
    values: Record<string, JsonValue>;
  };
  /** Capture-only temporal evidence; not stored in the editable manual. */
  transitionCapture?: {
    schemaVersion: 'apollo.transition-capture.v1';
    sessionId: string;
    sequence: number;
    manualSourceHash: string;
    externalContext: Record<string, unknown>;
    complete: boolean;
    reason?: string;
  };
  transitionBefore?: PreviewSnapshot;
  /** Opt-in read-only legacy remap evidence; never persisted to manual source. */
  targetResolution?: import('./target-resolution').TargetResolutionEvidence;
  instanceBoundaries?: import('./instance-boundaries').InstanceBoundary[];
  /** Capture-only read-only evidence. Never author this in contract.manual.json. */
  instanceContentReferences?: import('./instance-content-reference').InstanceContentReferences;
  instanceContentResults?: import('./instance-content-reference').InstanceContentResult[];
  /** Independent selected-variant captures, never authored or inferred from actual values. */
  componentDependencyCaptures?: Array<{
    nodeId: string;
    nodeMap?: Record<string, string>;
    snapshot?: PreviewSnapshot;
    failure?: string;
    /** Optional native error metadata; never used as reference or coverage proof. */
    failureDetails?: import('./dependency-capture-diagnostics').DependencyCaptureFailureDetails;
  }>;
  /** Independent, complete reference for the actually selected Figma variant. */
  variantReference?: {
    occurrenceAddressVersion?: 1;
    componentKey: string;
    componentSetKey: string;
    complete: boolean;
    nodes: Array<{ path: string; type: string }>;
    properties: Record<string, JsonValue>;
    propertyTypes: Record<string, JsonValue>;
    propertyReferences: string[];
    definedProperties?: string[];
    nodeProperties: Record<string, {
      properties: Record<string, JsonValue>;
      propertyTypes: Record<string, JsonValue>;
      propertyReferences: string[];
      diagnosticName?: string;
      definedProperties?: string[];
      identity?: { componentKey: string; componentSetKey?: string; mainComponentId?: string };
      sourceIdentity?: import('./instance-source-identity').InstanceSourceIdentity;
      propertyReferenceBindings?: Record<string, string>;
    }>;
  };
  source?: {
    /** Independent reference dimensions captured by Editor 0.2.30+. */
    geometryCaptureVersion?: 1;
    gradientPaintCaptureVersion?: 1;
    /** Parent-scoped key/port correspondence; legacy reports keep path semantics. */
    instanceIdentityVersion?: 1;
    /** Verified component-owned source layers distinguish equal-key siblings. */
    instanceSourceIdentityVersion?: 1;
    /** Capture/consumer opt-in; canonical keys may have distinct file-local main IDs. */
    instanceMainComponentAliasesVersion?: 1;
    /** Opt-in occurrence addresses; unmarked historical captures retain name paths. */
    occurrenceAddressVersion?: 1;
    instanceSourceIdentityCapture?: {version:1;owners:Array<{mainComponentId:string;componentKey:string;status:string;sourceInstanceId?:string;reason?:string}>};
    propertyReferenceIdentityVersion?: 1;
    captureTopology?: {version:1;complete:boolean;limitReached:boolean;issues:Array<{kind:string;nodeId?:string;path:string}>};
    nativeSlotCaptureScope?: {version:1;manualSourceHash:string;omissions:Array<{nodeId:string;targetId:string;property:string;path:string}>};
    fileKey?: string;
    fileName: string;
    pageId: string;
    rootNodeId: string;
    componentKey?: string;
    componentSetKey?: string;
    truncated: boolean;
    representationId?: string;
    nodeLimit: number;
  };
  selection: string[];
  context: {
    platform: string;
    product?: string;
    channel?: string;
    pageType?: string;
    modes: Record<string, string>;
    unknownFacts: string[];
  };
  nodes: Array<Record<string, unknown>>;
};

export type ImportedWorkspace = {
  manual: ManualSource;
  variantEvidence?: VariantEvidence;
  dependencyContracts?: CompiledContract[];
  activeContractId?: string;
  componentChoices?: ComponentChoice[];
  variants: VariantScenario[];
  hasVariantEvidence: boolean;
  anatomy: AnatomyNode[];
  tokens: string[];
  warnings: string[];
  compiledInput?: Record<string, unknown>;
  /** Immutable input inventory; generated evidence never becomes normative manual data. */
  sourceFiles?: Array<{name:string;text:string}>;
};

/** Read-only generated input. Never serialized into contract.manual.json. */
export type TextStyleCatalog = { id: string; sourceHash: string; styles: Array<{key: string; name: string}> };
export type VariantEvidence = {
  occurrenceAddressVersion?: 1;
  /** Local catalog addresses and diagnostic names; never source-layer identity. */
  occurrences?: Array<{componentKey:string;componentSetKey:string;namesByPath:Record<string,string>}>;
  textBindings?: Array<{ componentKey: string; componentSetKey: string; styleKeysByPath: Record<string, string> }>;
  textStyleCatalogs?: TextStyleCatalog[];
  schemaVersion: 'apollo.variant-anatomy.v1';
  sourceHash: string;
  structures: Record<string, Array<{ path: string; type: string }>>;
  variants: Array<{
    componentKey: string;
    componentSetKey: string;
    structureId: string;
    properties: Record<string, string>;
  }>;
  assetCatalogs?: AssetCatalogEvidence[];
  libraryText?: Array<{
    componentKey: string; componentSetKey: string; properties: Record<string, string>;
    structure: Array<{ path: string; type: string }>;
    characters: Record<string, string>;
  }>;
};

export type AssetCatalogEvidence = {
  catalog: string;
  library: string;
  sourceHash: string;
  generatedAt: string;
  members: Array<{ componentKey: string; componentSetKey: string }>;
};

export type DependencyBinding = {
  id: string;
  targetRole: string;
  relativePath: string;
  portNames: string[];
  /** Opt-in projection: historical contracts retain their exact fact shape. */
  metrics?: true;
  variantProperty?: string;
  contractDependencyId?: string;
  subjectCondition?: CollectionFilter;
  /** Compare the swap consumer with a proved independent library reference. */
  identityLock?: true;
};

export type ValidationIssue = {
  level: 'error' | 'warning';
  code: string;
  path: string;
  message: string;
};

export type RuleIr = Record<string, unknown> & {
  schemaVersion: 'apollo.rule-ir.v1';
  ruleId: string;
};

export type CompiledContract = {
  schemaVersion: typeof COMPILED_SCHEMA_VERSION;
  documentType: 'component-contract';
  package: {
    id: string;
    componentId: string;
    family: string;
    library: string;
    sourcePath: string;
    sourceGeneratedAt: string;
    sourceExportVersion: string;
    manualSourceHash: string;
    manualRevision?: number;
    snapshotProfile?: 'component-facts-v2' | 'variant-facts-v3' | 'variant-facts-v4' | 'dependency-facts-v5';
    generatedFactsHash?: string;
  };
  status: 'draft' | 'ready';
  componentDependencies?: CompiledComponentDependency[];
  facts: {
    memberCollections?: Array<{id: string; sourceRuleId: string; collection: MemberCollection}>;
    textBindingComparisons?: TypedConstraint[];
    transitions?: Array<{id: string; sourceRuleId: string; fact: string; transition: NonNullable<TypedConstraint['transition']>}>;
    dependencyCompositionIds?: string[];
    dependencyBindings?: DependencyBinding[];
    variantEvidence?: VariantEvidence;
    component: ComponentIdentity;
    semantics: ComponentSemantics;
    representations: ComponentRepresentation[];
    semanticApi: SemanticApiProperty[];
    validationContext?: ManualSource['validationContext'];
    documentation: DocumentationRef[];
    examples: ContractExample[];
    decisions: ContractDecision[];
    generation: ManualSource['generation'];
    targets: SemanticTarget[];
    controlPorts: ControlPort[];
  };
  customizationPolicy: Array<{
    id: string;
    targetId: string;
    targetScope?: TargetScope;
    boundaryPolicy?: ManualRule['boundaryPolicy'];
    targetApplicability?: ManualRule['targetApplicability'];
    capability: string;
    capabilitySet?: string;
    capabilitySelection?: string[];
    permission: Permission;
    propertyApplicability?: ManualRule['propertyApplicability'];
    propertyConformance?: ManualRule['propertyConformance'];
    controlPaths: ControlPath[];
    applicability: Applicability;
    severity: Severity;
    status: RuleStatus;
    owner: string;
    ownership?: RuleOwnership;
    sourceRefs?: string[];
    execution: RuleExecution;
  }>;
  rules: RuleIr[];
  nonExecutableRules: Array<{
    id: string;
    reason: string;
    sourceRuleId: string;
  }>;
  capabilities: {
    selectors: string[];
    facts: string[];
    operators: string[];
    remediations: string[];
  };
  coverage: {
    sourceRules: number;
    policyRules: number;
    policyOnlyRules: number;
    compiledRules: number;
    nonExecutableRules: number;
    byConstraintType: Record<string, number>;
    byExecutionRoute: Record<string, number>;
    byOwnership?: Record<'component' | 'usage' | 'unclassified', number>;
  };
  runtimePolicy: {
    textContentFactsVersion?: 1;
    nativeTargetPropertyFactsVersion?: 1;
    configuredNativePropertyConformanceVersion?: 1;
    declaredTargetIdentityVersion?: 1 | 2 | 3;
    declaredTargetConfigurationVersion?: 1 | 2;
    representationEvidenceVersion?: 1;
    crossRepresentationBindingsVersion?: 1 | 2;
    rootTargetAliasesVersion?: 1;
    dependencySubjectConditionsVersion?: 1;
    assetIdentityLockVersion?: 1;
    instanceMainComponentAliasesVersion?: 1;
    memberCollectionsVersion?: 1;
    directChildDependenciesVersion?: 1;
    occurrenceAddressVersion?: 1;
    engine: 'apollo-predicate-engine';
    unknownPolicy: 'fail-closed';
    compiledIsSourceOfTruth: false;
    gradientPaintFactsVersion?: 1;
    ruleScopeFactsVersion?: 1;
    semanticTargetVisibilityVersion?: 1;
    paintBindingFactsVersion?: 1;
    nativeInstanceReplacementsVersion?: 1;
    nativeInstanceReplacements?: Array<{id:string;sourceRuleId:string;targetRole:string;propertyNames:string[]}>;
    textStyleBindingFactsVersion?: 1;
    textBindingIdentityFactsVersion?: 1;
    structuralOrderFactsVersion?: 1;
    variantTextTargetsVersion?: 1;
    nativeSourceContinuityVersion?: 1;
    dependencyCompletionVersion?: 1;
    slotTargetFactsVersion?: 1;
    nativeSlotTargetsVersion?: 1;
    transitionFactsVersion?: 1;
    ruleOwnershipVersion?: 1;
    validationIntentVersion?: 1 | 2;
    validationModeVersion?: 1;
  };
};

export type CompileResult = {
  contract: CompiledContract;
  issues: ValidationIssue[];
};

export type ExportBundle = {
  /** Local export guard, omitted from the serialized manual and compiled contract. */
  sourceFactsHash?: string;
  manual: ManualSource;
  compiled: CompiledContract;
  validation: {
    schemaVersion: 'apollo.component-contract-validation.v1';
    valid: boolean;
    issues: ValidationIssue[];
  };
  coverage: CompiledContract['coverage'];
};
