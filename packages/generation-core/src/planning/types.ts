import type { PackageInventory, PackageLock } from '../contracts/packages';

export type Scalar = string | number | boolean;
export type Hash = (value: unknown) => string;
export type Target = 'figma' | 'frontend';
export type Platform = 'desktop' | 'mobile-web';
export type PropertyValue = Scalar | { state: Record<string, Scalar> };
export type OwnedAction = { id: string; label: string;
  view?: 'primary' | 'secondary'; disabled?: boolean | { state: Record<string, boolean> } }
  & ({ eventId: string; behavior?: never } | { behavior: 'none'; eventId?: never });
export type ComponentNode = {
  kind: 'component'; id: string; mappingId: string;
  props: Record<string, PropertyValue>; slots: Record<string, string[]>;
  /** Owned implementation elements, never independent library imports. */
  actions?: { port: string; items: OwnedAction[] };
};
export type PlanNode = ComponentNode
  | { kind: 'stack'; id: string; direction: 'vertical' | 'horizontal'; gap: number; children: string[] }
  | { kind: 'text'; id: string; text: string };
export type ScreenSpec = {
  schemaVersion: 'apollo.screen-spec.v1-experimental' | 'apollo.screen-spec.v2-experimental'; id: string; platform: Platform;
  viewport: { width: number; height: number }; root: string; nodes: PlanNode[];
  states: { initial: string; values: string[] };
  events: Array<{ id: string }>;
  transitions: Array<{ eventId: string; from: string; to: string }>;
  /** Unresolved product decisions are blockers, not inferred defaults. */
  unresolved: string[];
  /** v2: implementation gaps cannot be resolved by asking the user. */
  capabilityGaps?: Array<{ code: string; message: string; nodeId?: string }>;
};
export type ContractPin = Pick<PackageLock['packages'][number], 'componentId' | 'contractId' | 'revision' | 'manualSourceHash' | 'compiledHash'>;
export type GenerationView = {
  schemaVersion: 'apollo.generation-view.v1-experimental'; lock: PackageLock; lockHash: string;
  components: Array<{
    pin: ContractPin; sourceStatus: 'ready' | 'draft';
    api: PackageInventory['packages'][number]['source']['manual']['semanticApi'];
    representations: PackageInventory['packages'][number]['representations'];
    targets: string[]; dependencies: string[];
    coverage: { predicateRuleIds: string[]; pendingRoutes: Array<{ ruleId: string; route: string }>; nonExecutableRuleIds: string[] };
    sourceErrors: number;
    generationProfiles?: PackageInventory['packages'][number]['source']['manual']['generation']['profiles'];
    evidenceScopeHash?: string;
  }>;
};
export type ValueTransform = { kind: 'identity' } | { kind: 'lookup'; values: Array<{ input: Scalar; output: Scalar }> };
export type PropertyMapping = {
  type: 'string' | 'number' | 'boolean'; values?: Scalar[]; required?: boolean;
  code: { prop: string; transform: ValueTransform };
  figma?: { property: string; type: 'VARIANT' | 'BOOLEAN' | 'TEXT'; transform: ValueTransform };
};
export type MappingEntry = {
  generationProfileId?: string;
  id: string; status: 'verified' | 'draft'; pin: ContractPin; platform: Platform;
  code: { module: string; exportName: string; representationId: string; indexFile: string };
  figma: { componentKey: string; representationId: string; handlerId: string };
  /** Every API/transform/slot claim must refer to pinned producer evidence. */
  evidenceFiles: string[];
  profile?: { code: Record<string, Scalar>; figma: Record<string, Scalar>; requiresRuntimeWidthFit: boolean };
  /** Producer API evidence and acceptance remain independent. */
  assurance?: { apiMapping: string; fullContractParity: string; codeRepresentation: string; builtPackage: string; liveAcceptance: string; publication: string; release: string };
  gaps?: Array<{ id: string; description: string; sources: unknown[] }>;
  props: Record<string, PropertyMapping>;
  slots: Record<string, { min: number; max: number; codeProp: 'children'; figma?: { targetId: string; property: string } }>;
  actions?: { port: string; min: number; max: number; codeProp: 'elements';
    fields: { label: 'children'; event: 'onClick'; disabled?: 'disabled'; priorityProp?: 'primaryFirst' }; figmaHandlerId?: string };
};
/** Read-only consumer port. Code Connect owns the producer registry/approval. */
export type MappingRegistry = {
  schemaVersion: 'apollo.generation-registry-port.v1-experimental';
  producer: { name: 'code-connect'; revision: string; status: 'verified' | 'draft' };
  package: { name: 'arui-private'; version: string; commit: string; files: Record<string, string>;
    implementationDependencies: Array<{ name: string; version: string }> };
  entries: MappingEntry[];
  source?: { schemaVersion: 'apollo.arui-private-mappings.v1'; version: string; digest: string; lockHash: string;
    producerInputs?:{authoringBasis:import('./code-connect').CodeConnectAuthoringBasis;currentInputs:import('./code-connect').CodeConnectCurrentInputs;inputPackages:import('./code-connect').CodeConnectInputPin[];basisRegistryDigest:string;currentInputsDigest:string};
    mappingArtifacts: Array<{ path: string; sha256: string }>;
    contracts: Array<{ mappingId: string; archivePath: string; archiveSha256: string; manualSha256: string; manualSourceHash: string;
      pin: ContractPin; dependencies: Array<{ componentId: string; revision: number; manualSourceHash: string; compiledHash: string }> }> };
};
/** Supplied by a trusted fresh checkout/Proxy reader, never by a prompt. */
export type CodeObservation = {
  package: { name: string; version: string; commit: string; files: Record<string, string> };
  publicExports: Array<{ module: string; exportName: string; indexFile: string }>;
};
export type ProducerObservation = {
  schemaVersion: 'apollo.code-connect-observation.v1-experimental'; status: 'availability-pass'; targetProduct: 'apollo-v4';
  fullContractParity: 'not-confirmed'; registryDigest: string; lockHash: string; specHash: string; codeHash: string;
  inputObservation?:{version:1;basisRegistryDigest:string;currentRegistryDigest:string;currentInputsDigest:string;codeRepresentations:'draft';acceptance:'not-run';proofScope:'source-api-freshness-only'};
  stateReceipts: Array<{ state: string; preparedHash: string }>; receiptHash: string;
};
/** A trusted Node/Proxy port supplies this draft; imported ScreenSpec cannot. */
export type PatternAttachment = {
  schemaVersion: 'apollo.pattern-plan-attachment.v1-draft'; requirementsHash: string;
  requirements: import('../../../pattern-core/src/requirements').Requirements;
  sourceReceipt: import('../../../pattern-core/src/sources').SourceReceipt;
  nodeBindings: Array<{ compositionId: string; roleId: string; nodeIds: string[] }>;
};
export type RepresentationObservation = {version:1;componentId:string;representationId:string;scopeHash:string;basisRegistryDigest:string;currentRegistryDigest:string;codeHash:string;verifiedRefs:Array<{path:string;sha256:string}>;acceptedProfileIds:string[];receiptHash:string};
export type GenerationContext = {
  /** Produced only by a trusted read-only host. No ScreenSpec field supplies this proof. */
  representationObservations?: RepresentationObservation[]; view: GenerationView; registry: MappingRegistry; code: CodeObservation;
  producerObservation?: ProducerObservation; patterns?: PatternAttachment[] };

export type CompositionPlan = {
  schemaVersion: 'apollo.composition-plan.v1-experimental'; spec: ScreenSpec;
  pins: { specHash: string; packageLockHash: string; viewHash: string; registryHash: string; codeHash: string };
  components: Array<{ nodeId: string; mappingId: string; pin: ContractPin }>;
  patterns?: PatternAttachment[];
};
export type Diagnostic = { code: string; stage: 'schema' | 'availability' | 'source' | 'preflight' | 'execution';
  target?: Target; nodeId?: string; message: string };
export type Preflight = {
  schemaVersion: 'apollo.generation-preflight.v1-experimental'; planHash: string;
  apiAvailability: 'confirmed' | 'blocked'; sourceReadiness: 'ready' | 'blocked';
  targets: Record<Target, 'prepared' | 'blocked'>;
  /** Execution coverage remains separate from generation availability. */
  coverage: GenerationView['components'][number]['coverage'][];
  diagnostics: Diagnostic[];
};
export type TargetReceipt = {
  schemaVersion: 'apollo.generation-target-receipt.v1-experimental'; target: Target;
  planHash: string; pins: CompositionPlan['pins']; status: 'created' | 'verified' | 'blocked' | 'failed';
  provenance: Array<{ planNodeId: string; artifactId: string }>;
  verification: 'not-run' | 'passed' | 'failed' | 'incomplete';
  artifact?: {version:1;id:string;entryPath:'dist/index.html';profileId:string;authority:'accepted-source'|'synthetic-local';manifestHash:string;files:Array<{path:string;sha256:string;bytes:number}>};
  verificationEvidence?: VerificationEvidence;
  diagnostics: Diagnostic[]; rollback: 'not-needed' | 'complete' | 'incomplete';
};
export type VerificationEvidence = { factsHash: string; checks: Array<{
  id: string; componentId?: string; status: 'passed' | 'failed' | 'unknown' | 'not-applicable'; evidenceHash: string;
}> };
export type HostVerification = { status: 'passed' | 'failed' | 'incomplete'; evidence?: VerificationEvidence; diagnostics: Diagnostic[] };
