/** Standalone H1 structural boundary. Submitted observations are never trusted facts. */
export type Target = 'figma' | 'frontend';
export type EvidenceRef = Readonly<{ path: string; sha256: string }>;
export type ComponentPin = Readonly<{
  componentId: string; revision: number; manualByteSha256: string;
  manualSourceHash: string; compiledHash: string;
}>;
export type ProducerRef = Readonly<{ id: string; version: number; pin: EvidenceRef; target: Target }>;
export type ScenarioScope = Readonly<{
  evaluationId: string; target: Target; rootSubjectId: string; snapshotId: string;
  representationId: string; variantIdentity: string; platform: 'desktop' | 'mobile-web';
  modes: ReadonlyArray<Readonly<{ collectionId: string; modeId: string }>>;
  stateId: string; sessionId: string; sourceVector: ReadonlyArray<ComponentPin>;
  requestHash: string; producerVector: ReadonlyArray<ProducerRef>;
}>;
export type Observation<T> =
  | Readonly<{ state: 'known'; value: T; scope: ScenarioScope; rawEvidenceRefs: ReadonlyArray<EvidenceRef>;
      producerRef: ProducerRef; enumerationRef: EvidenceRef }>
  | Readonly<{ state: 'unknown'; reasons: ReadonlyArray<string>; scope: ScenarioScope }>;
export type SourceAuthorityRef = Readonly<{
  source: EvidenceRef; revision: number; ruleIds: ReadonlyArray<string>;
  platform: 'desktop' | 'mobile-web'; target: Target; representationId: string;
  conditionRef: EvidenceRef; reviewRef: EvidenceRef;
}>;
export type ActionIdentity = Readonly<{ kind: 'business-action'; actionId: string }>
  | Readonly<{ kind: 'source-absent'; evidenceRef: EvidenceRef }>;
export type CanonicalOccurrence = Readonly<{
  bindingId: string; occurrenceId: string; targetSubjectId: string; targetId: string;
  visible: Observation<boolean>;
  role: Observation<'business-action' | 'overflow-trigger' | 'no-business-binding'>;
  actionIdentity: Observation<ActionIdentity>; identityRef: EvidenceRef;
}>;
export type ActionJoin = Readonly<{
  occurrenceId: string; subjectId: string; identity: ActionIdentity;
  role: 'business-action' | 'overflow-trigger'; handlerRef: Observation<EvidenceRef>;
}>;
export type PriorityRelation = Readonly<{
  domain: ReadonlyArray<string>;
  relations: ReadonlyArray<Readonly<{ a: string; b: string; relation: 'higher' | 'lower' | 'equal' | 'incomparable' }>>;
  declarationRef: EvidenceRef;
}>;
export type Content = Readonly<{ occurrenceId: string; subjectId: string; actionId: string; label: string; iconPresent: boolean }>;
export type ItemJoin = Readonly<{ itemId: string; itemSubjectId: string; sourceOccurrenceId: string; actionId: string; rendererIdentityRef: EvidenceRef }>;
export type ScenarioEvent = Readonly<{
  eventId: string; sequence: number; sessionId: string; snapshotId: string;
  subjectId: string; causedBy: Observation<string>; context: ScenarioScope;
}>;
export type OwnedContainer = Readonly<{ subjectId: string; ownerRootSubjectId: string; identityRef: EvidenceRef; rendererProfileRef: EvidenceRef }>;
export type OpenOutcome = Readonly<{ event: ScenarioEvent; containerSubjectId: string; open: boolean; activationEventId: string }>;
export type BeforeTransfer = Readonly<{
  visibleOrder: ReadonlyArray<string>; triggerOccurrenceId: string;
  content: ReadonlyArray<Content>; captureRef: EvidenceRef; geometryRef: EvidenceRef;
}>;
export type TransferStep = Readonly<{ event: ScenarioEvent; sourceOccurrenceId: string; itemId: string; beforeCaptureRef: EvidenceRef; afterCaptureRef: EvidenceRef }>;
export type TriggerIntent = Readonly<{ occurrenceId: string; subjectId: string; purpose: 'overflow-entry' | 'business-action'; handlerRef: EvidenceRef; identityRef: EvidenceRef }>;
export type DisabledAction = Readonly<{ occurrenceId: string; actionId: string; disabled: boolean; reasonRef: Observation<SourceAuthorityRef> }>;
export type Hover = Readonly<{ event: ScenarioEvent; itemId: string; itemSubjectId: string; hovered: boolean }>;
export type TooltipOutcome = Readonly<{
  event: ScenarioEvent; hoverEventId: string; itemId: string; tooltipSubjectId: string;
  visible: boolean; tooltipIdentityRef: EvidenceRef; reasonId: string; reasonText: string;
  semanticReasonEvidenceRef: EvidenceRef;
}>;
export type Selection = Readonly<{ event: ScenarioEvent; item: ItemJoin; selected: boolean; enabled: boolean; actionCommandRef: EvidenceRef }>;
export type SelectionContainerState = Readonly<{
  event: ScenarioEvent; selectionEventId: string; containerSubjectId: string;
  open: boolean; boundaryAuthorityRef: Observation<SourceAuthorityRef>;
}>;
export type SpinnerBindingEvidence = Readonly<{
  bindingId: string; status: 'active' | 'inactive' | 'unknown';
  ownerActive: Observation<boolean>; childSubject: Observation<string>; captureRef: Observation<EvidenceRef>;
}>;
export type VisibleLoading = Readonly<{
  occurrenceId: string; subjectId: string; declaredLoading: boolean; observedLoading: boolean;
  spinnerBindings: ReadonlyArray<SpinnerBindingEvidence>; afterCaptureRef: EvidenceRef;
  beforeCaptureRef: Observation<EvidenceRef>; coreEvaluationsRef: Observation<EvidenceRef>;
}>;
export type SelectedApiProof = Readonly<{
  sourceRuleId: string; sourceCorrespondenceRef: SourceAuthorityRef;
  callerSelectionRef: SourceAuthorityRef; apiClosureRefs: ReadonlyArray<EvidenceRef>;
  loadingStateSupported: boolean;
}>;
export type ButtonContractClosure = Readonly<{
  button: ComponentPin; spinner: ComponentPin; nativeCodeBridgeRef: EvidenceRef;
  coreEvaluationRefs: ReadonlyArray<EvidenceRef>;
}>;
export type OverflowDomain = Readonly<{
  sourceOccurrenceIds: ReadonlyArray<string>; transferredOccurrenceIds: ReadonlyArray<string>;
  items: ReadonlyArray<ItemJoin>; triggerOccurrenceId: Observation<string>;
  container: Observation<OwnedContainer>; captureRef: EvidenceRef;
  enumerationEvidenceRefs: ReadonlyArray<EvidenceRef>;
}>;
export type ScenarioEvidenceV1 = Readonly<{
  schemaVersion: 'apollo.scenario-evidence.v1-draft'; scope: ScenarioScope;
  actions: Readonly<{
    identity: Observation<ReadonlyArray<ActionJoin>>; priority: Observation<PriorityRelation>;
    visibleOrder: Observation<ReadonlyArray<string>>; beforeTransfer: Observation<BeforeTransfer>;
    transferSequence: Observation<ReadonlyArray<TransferStep>>; sourceContent: Observation<ReadonlyArray<Content>>;
    visibleIdentity: Observation<ReadonlyArray<ActionJoin>>; disabled: Observation<ReadonlyArray<DisabledAction>>;
  }>;
  trigger: Readonly<{ activations: Observation<ReadonlyArray<ScenarioEvent>>; intent: Observation<TriggerIntent> }>;
  overflow: Readonly<{
    openOutcomes: Observation<ReadonlyArray<OpenOutcome>>; container: Observation<OwnedContainer>;
    items: Readonly<{
      identity: Observation<ReadonlyArray<ItemJoin>>;
      labels: Observation<ReadonlyArray<Readonly<{ item: ItemJoin; label: string }>>>;
      icons: Observation<ReadonlyArray<Readonly<{ item: ItemJoin; iconPresent: boolean }>>>;
      disabled: Observation<ReadonlyArray<Readonly<{ item: ItemJoin; disabled: boolean }>>>;
    }>;
    hovers: Observation<ReadonlyArray<Hover>>; tooltipOutcomes: Observation<ReadonlyArray<TooltipOutcome>>;
    selections: Observation<ReadonlyArray<Selection>>;
    beforeSelection: Observation<ReadonlyArray<SelectionContainerState>>;
    afterSelection: Observation<ReadonlyArray<SelectionContainerState>>;
  }>;
  platform: Observation<'desktop' | 'mobile-web'>;
  loading: Readonly<{ visibleButtons: Observation<ReadonlyArray<VisibleLoading>>;
    selectedOverflowApi: Observation<SelectedApiProof>; buttonClosure: Observation<ButtonContractClosure> }>;
  canonical: Observation<ReadonlyArray<CanonicalOccurrence>>;
  applicability: Observation<Readonly<{ rootSubjectId: string; platform: 'desktop' | 'mobile-web';
    Overflow: boolean; sourceOverflowLiteral: 'true' | 'false'; transformRef: EvidenceRef }>>;
  overflowDomain: Observation<OverflowDomain>;
  correspondences: Readonly<{ container: Observation<SourceAuthorityRef>; renderer: Observation<SourceAuthorityRef>; tooltip: Observation<SourceAuthorityRef> }>;
  reasonAuthorities: Observation<ReadonlyArray<SourceAuthorityRef>>;
  immediacyAuthority: Observation<SourceAuthorityRef>; captureContext: Observation<ScenarioScope>;
  eventEnumeration: Observation<Readonly<{ observedEventIds: ReadonlyArray<string>; expectedSubjects: ReadonlyArray<string>;
    traceIntervalRef: EvidenceRef; rawCausalEdges: ReadonlyArray<Readonly<{ beforeEventId: string; afterEventId: string; evidenceRef: EvidenceRef }>> }>>;
  loadingDependencyEvidence: Observation<ReadonlyArray<Readonly<{ occurrenceId: string;
    spinnerBindings: ReadonlyArray<SpinnerBindingEvidence>; coreResultsRef: Observation<EvidenceRef>; transitionPairsRef: Observation<EvidenceRef> }>>>;
  pendingSourceChoices: Readonly<{ transferOrder: null; immediateBoundary: null; selectedRenderer: null; loadingProhibition: null }>;
}>;

/** Future operator interface, deliberately absent from the serialized evidence schema.
 * H1 never calls these functions and grants no authority even when a caller supplies them. */
export interface ScenarioEvaluationContext {
  readonly expectedScope: ScenarioScope;
  readonly resolveAuthority: (ref: SourceAuthorityRef) => 'unverified' | 'verified' | 'rejected';
  readonly verifyOriginalCapture: (ref: EvidenceRef, producer: ProducerRef) => 'unverified' | 'verified' | 'rejected';
}
export type StructuralIssue = Readonly<{ code: string; path: string; message: string }>;
export type StructuralValidation = Readonly<{
  structuralStatus: 'valid' | 'invalid'; issues: ReadonlyArray<StructuralIssue>;
  authority: 'unverified'; actualFacts: 'unknown';
}>;
type Schema = Readonly<{ kind: 'string' | 'text' | 'sha' | 'boolean' | 'integer' | 'sequence' | 'null' }>
  | Readonly<{ kind: 'enum'; values: ReadonlyArray<string> }>
  | Readonly<{ kind: 'array'; item: Schema; min: number; max?: number }>
  | Readonly<{ kind: 'object'; fields: Readonly<Record<string, Schema>> }>
  | Readonly<{ kind: 'tagged'; tag: string; variants: Readonly<Record<string, Schema>> }>;
const string: Schema = { kind: 'string' }, hash: Schema = { kind: 'sha' }, boolean: Schema = { kind: 'boolean' };
const integer: Schema = { kind: 'integer' }, text: Schema = { kind:'text' }, sequence: Schema = { kind:'sequence' }, nil: Schema = { kind: 'null' };
const enumeration = (...values: string[]): Schema => ({ kind: 'enum', values });
const array = (item: Schema, min = 0, max?: number): Schema => max === undefined ? { kind: 'array', item, min } : { kind: 'array', item, min, max };
const object = (fields: Readonly<Record<string, Schema>>): Schema => ({ kind: 'object', fields });
const refSchema = object({ path: string, sha256: hash });
const pinSchema = object({ componentId: string, revision: integer, manualByteSha256: hash, manualSourceHash: hash, compiledHash: hash });
const target = enumeration('figma','frontend'), platform = enumeration('desktop','mobile-web');
const producerSchema = object({ id: string, version: integer, pin: refSchema, target });
const scopeSchema = object({ evaluationId: string, target, rootSubjectId: string, snapshotId: string,
  representationId: string, variantIdentity: string, platform, modes: array(object({ collectionId: string, modeId: string }),1),
  stateId: string, sessionId: string, sourceVector: array(pinSchema,1), requestHash: hash, producerVector: array(producerSchema,1) });
const observation = (value: Schema): Schema => ({ kind: 'tagged', tag: 'state', variants: {
  known: object({ state: enumeration('known'), value, scope: scopeSchema, rawEvidenceRefs: array(refSchema,1), producerRef: producerSchema, enumerationRef: refSchema }),
  unknown: object({ state: enumeration('unknown'), reasons: array(string,1), scope: scopeSchema })
} });
const authoritySchema = object({ source: refSchema, revision: integer, ruleIds: array(string,1), platform, target,
  representationId: string, conditionRef: refSchema, reviewRef: refSchema });
const actionIdentitySchema: Schema = { kind: 'tagged', tag: 'kind', variants: {
  'business-action': object({ kind: enumeration('business-action'), actionId: string }),
  'source-absent': object({ kind: enumeration('source-absent'), evidenceRef: refSchema })
} };
const canonicalSchema = object({ bindingId: string, occurrenceId: string, targetSubjectId: string, targetId: string,
  visible: observation(boolean), role: observation(enumeration('business-action','overflow-trigger','no-business-binding')),
  actionIdentity: observation(actionIdentitySchema), identityRef: refSchema });
const actionSchema = object({ occurrenceId: string, subjectId: string, identity: actionIdentitySchema,
  role: enumeration('business-action','overflow-trigger'), handlerRef: observation(refSchema) });
const contentSchema = object({ occurrenceId: string, subjectId: string, actionId: string, label: text, iconPresent: boolean });
const itemSchema = object({ itemId: string, itemSubjectId: string, sourceOccurrenceId: string, actionId: string, rendererIdentityRef: refSchema });
const eventSchema = object({ eventId: string, sequence, sessionId: string, snapshotId: string,
  subjectId: string, causedBy: observation(string), context: scopeSchema });
const containerSchema = object({ subjectId: string, ownerRootSubjectId: string, identityRef: refSchema, rendererProfileRef: refSchema });
const spinnerSchema = object({ bindingId: string, status: enumeration('active','inactive','unknown'),
  ownerActive: observation(boolean), childSubject: observation(string), captureRef: observation(refSchema) });
const selectionStateSchema = object({ event: eventSchema, selectionEventId: string, containerSubjectId: string,
  open: boolean, boundaryAuthorityRef: observation(authoritySchema) });
const evidenceSchema = object({
  schemaVersion: enumeration('apollo.scenario-evidence.v1-draft'), scope: scopeSchema,
  actions: object({ identity: observation(array(actionSchema)), priority: observation(object({ domain: array(string),
    relations: array(object({ a: string, b: string, relation: enumeration('higher','lower','equal','incomparable') })), declarationRef: refSchema })),
    visibleOrder: observation(array(string)), beforeTransfer: observation(object({ visibleOrder: array(string), triggerOccurrenceId: string, content: array(contentSchema), captureRef: refSchema, geometryRef: refSchema })),
    transferSequence: observation(array(object({ event: eventSchema, sourceOccurrenceId: string, itemId: string, beforeCaptureRef: refSchema, afterCaptureRef: refSchema }))),
    sourceContent: observation(array(contentSchema)), visibleIdentity: observation(array(actionSchema)),
    disabled: observation(array(object({ occurrenceId: string, actionId: string, disabled: boolean, reasonRef: observation(authoritySchema) }))) }),
  trigger: object({ activations: observation(array(eventSchema)), intent: observation(object({ occurrenceId: string, subjectId: string,
    purpose: enumeration('overflow-entry','business-action'), handlerRef: refSchema, identityRef: refSchema })) }),
  overflow: object({ openOutcomes: observation(array(object({ event: eventSchema, containerSubjectId: string, open: boolean, activationEventId: string }))),
    container: observation(containerSchema), items: object({ identity: observation(array(itemSchema)),
      labels: observation(array(object({ item: itemSchema, label: text }))), icons: observation(array(object({ item: itemSchema, iconPresent: boolean }))),
      disabled: observation(array(object({ item: itemSchema, disabled: boolean }))) }),
    hovers: observation(array(object({ event: eventSchema, itemId: string, itemSubjectId: string, hovered: boolean }))),
    tooltipOutcomes: observation(array(object({ event: eventSchema, hoverEventId: string, itemId: string, tooltipSubjectId: string, visible: boolean,
      tooltipIdentityRef: refSchema, reasonId: string, reasonText: text, semanticReasonEvidenceRef: refSchema }))),
    selections: observation(array(object({ event: eventSchema, item: itemSchema, selected: boolean, enabled: boolean, actionCommandRef: refSchema }))),
    beforeSelection: observation(array(selectionStateSchema)), afterSelection: observation(array(selectionStateSchema)) }),
  platform: observation(platform), loading: object({ visibleButtons: observation(array(object({ occurrenceId: string, subjectId: string,
    declaredLoading: boolean, observedLoading: boolean, spinnerBindings: array(spinnerSchema,2,2), afterCaptureRef: refSchema,
    beforeCaptureRef: observation(refSchema), coreEvaluationsRef: observation(refSchema) }))),
    selectedOverflowApi: observation(object({ sourceRuleId: string, sourceCorrespondenceRef: authoritySchema,
      callerSelectionRef: authoritySchema, apiClosureRefs: array(refSchema,1), loadingStateSupported: boolean })),
    buttonClosure: observation(object({ button: pinSchema, spinner: pinSchema, nativeCodeBridgeRef: refSchema, coreEvaluationRefs: array(refSchema,1) })) }),
  canonical: observation(array(canonicalSchema,4,4)), applicability: observation(object({ rootSubjectId: string, platform,
    Overflow: boolean, sourceOverflowLiteral: enumeration('true','false'), transformRef: refSchema })),
  overflowDomain: observation(object({ sourceOccurrenceIds: array(string,4,4), transferredOccurrenceIds: array(string), items: array(itemSchema),
    triggerOccurrenceId: observation(string), container: observation(containerSchema), captureRef: refSchema, enumerationEvidenceRefs: array(refSchema,1) })),
  correspondences: object({ container: observation(authoritySchema), renderer: observation(authoritySchema), tooltip: observation(authoritySchema) }),
  reasonAuthorities: observation(array(authoritySchema)), immediacyAuthority: observation(authoritySchema), captureContext: observation(scopeSchema),
  eventEnumeration: observation(object({ observedEventIds: array(string), expectedSubjects: array(string), traceIntervalRef: refSchema,
    rawCausalEdges: array(object({ beforeEventId: string, afterEventId: string, evidenceRef: refSchema })) })),
  loadingDependencyEvidence: observation(array(object({ occurrenceId: string, spinnerBindings: array(spinnerSchema,2,2),
    coreResultsRef: observation(refSchema), transitionPairsRef: observation(refSchema) }))),
  pendingSourceChoices: object({ transferOrder: nil, immediateBoundary: nil, selectedRenderer: nil, loadingProhibition: nil })
});

function own(value: object, key: PropertyKey): boolean { return Object.prototype.hasOwnProperty.call(value,key); }
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function add(issues: StructuralIssue[], code: string, path: string, message: string): void { issues.push({ code, path, message }); }
/** Reject non-data arrays before any iteration. No imported index getter is read.
 * The returned copy contains every index, in order, only after the whole array passes. */
export function readDenseDataArray(value: unknown, path = ''): Readonly<{
  values: ReadonlyArray<unknown> | null; issues: ReadonlyArray<StructuralIssue>; declaredLength: number;
}> {
  const issues: StructuralIssue[]=[];
  if (!Array.isArray(value) || Object.getPrototypeOf(value)!==Array.prototype) {
    add(issues,'PLAIN_ARRAY_REQUIRED',path,'Expected a plain Array with its normal prototype.');
    return {values:null,issues,declaredLength:0};
  }
  const lengthDescriptor=Object.getOwnPropertyDescriptor(value,'length');
  const length: unknown=lengthDescriptor && own(lengthDescriptor,'value') ? lengthDescriptor.value : undefined;
  if (typeof length!=='number' || !Number.isSafeInteger(length) || length<0 || lengthDescriptor?.enumerable) {
    add(issues,'ARRAY_LENGTH_REQUIRED',path,'Array length must be its own non-enumerable data property.');
    return {values:null,issues,declaredLength:0};
  }
  const keys=Reflect.ownKeys(value);
  if (keys.length!==length+1) add(issues,'ARRAY_CLOSED_DOMAIN',path,'Array has holes or extra properties.');
  for (const key of keys) {
    if (key==='length') continue;
    if (typeof key!=='string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key)>=length) {
      add(issues,'ARRAY_EXTRA_FIELD',path,'Only array indices and the ordinary length property are permitted.'); continue;
    }
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if (!descriptor || !descriptor.enumerable || !own(descriptor,'value')) add(issues,'ARRAY_DATA_INDEX_REQUIRED',path+'/'+key,'Each index must be an enumerable own data property.');
  }
  if (issues.length) return {values:null,issues,declaredLength:length};
  const values: unknown[]=[];
  for (let index=0;index<length;index++) {
    const descriptor=Object.getOwnPropertyDescriptor(value,String(index));
    if (!descriptor || !descriptor.enumerable || !own(descriptor,'value')) {
      add(issues,'ARRAY_DATA_INDEX_REQUIRED',path+'/'+index,'No inherited, sparse or accessor index values.');
      return {values:null,issues,declaredLength:length};
    }
    values.push(descriptor.value);
  }
  return {values,issues,declaredLength:length};
}
function inspect(value: unknown, schema: Schema, path: string, issues: StructuralIssue[], ancestors: Set<object>, depth: number): void {
  if (depth > 48) { add(issues,'NESTING_LIMIT',path,'Data exceeds the structural depth limit.'); return; }
  if (typeof value === 'object' && value !== null) {
    if (ancestors.has(value)) { add(issues,'CYCLIC_DATA',path,'Evidence must be acyclic data.'); return; }
    ancestors.add(value);
  }
  const finish = () => { if (typeof value === 'object' && value !== null) ancestors.delete(value); };
  switch (schema.kind) {
    case 'string': if (typeof value !== 'string' || !value.trim()) add(issues,'STRING_REQUIRED',path,'An explicit nonempty string is required.'); break;
    case 'text': if (typeof value !== 'string') add(issues,'TEXT_REQUIRED',path,'Actual text is a string, including observed empty text.'); break;
    case 'sequence': if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) add(issues,'SEQUENCE_REQUIRED',path,'Expected an explicit nonnegative sequence, no temporal norm.'); break;
    case 'sha': if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) add(issues,'PIN_REQUIRED',path,'Expected a lowercase SHA256 pin.'); break;
    case 'boolean': if (typeof value !== 'boolean') add(issues,'BOOLEAN_REQUIRED',path,'No truthy strings or Boolean defaults.'); break;
    case 'integer': if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) add(issues,'INTEGER_REQUIRED',path,'Expected an explicit positive safe integer.'); break;
    case 'null': if (value !== null) add(issues,'SOURCE_CHOICE_HELD',path,'H1 leaves the source choice unresolved.'); break;
    case 'enum': if (typeof value !== 'string' || !schema.values.includes(value)) add(issues,'ENUM_REQUIRED',path,'Unsupported closed enum value.'); break;
    case 'array': {
      const data=readDenseDataArray(value,path); issues.push(...data.issues);
      if (!data.values) break;
      if (data.values.length < schema.min || (schema.max !== undefined && data.values.length > schema.max)) add(issues,'ARRAY_DOMAIN',path,'Missing or incorrectly sized explicit array domain.');
      else for (let i=0;i<data.values.length;i++) inspect(data.values[i],schema.item,path+'/'+i,issues,ancestors,depth+1);
      break;
    }
    case 'object':
      if (!isPlainRecord(value)) { add(issues,'RECORD_REQUIRED',path,'Expected a plain closed data record.'); break; }
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== 'string' || !own(schema.fields,key)) add(issues,'EXTRA_FIELD',path+'/'+String(key),'Field is outside the closed H1 shape.');
        else if (!Object.getOwnPropertyDescriptor(value,key)?.enumerable || !own(Object.getOwnPropertyDescriptor(value,key) || {},'value')) add(issues,'DATA_PROPERTY_REQUIRED',path+'/'+key,'Accessors and hidden data fields are not evidence.');
      }
      for (const key of Object.keys(schema.fields)) {
        const descriptor=Object.getOwnPropertyDescriptor(value,key), childSchema=schema.fields[key];
        if (!descriptor) add(issues,'MISSING_FIELD',path+'/'+key,'No missing-field defaults.');
        else if (own(descriptor,'value') && childSchema) inspect(descriptor.value,childSchema,path+'/'+key,issues,ancestors,depth+1);
      }
      break;
    case 'tagged': {
      if (!isPlainRecord(value)) { add(issues,'RECORD_REQUIRED',path,'Expected an explicitly tagged observation.'); break; }
      const descriptor=Object.getOwnPropertyDescriptor(value,schema.tag), tag=descriptor && own(descriptor,'value') ? descriptor.value : undefined;
      const variant=typeof tag==='string' && own(schema.variants,tag) ? schema.variants[tag] : undefined;
      if (!variant) add(issues,'TAG_REQUIRED',path+'/'+schema.tag,'Missing or unsupported explicit union tag.');
      else { ancestors.delete(value); inspect(value,variant,path,issues,ancestors,depth+1); }
      break;
    }
  }
  finish();
}
export function validateComponentPin(value: unknown): ReadonlyArray<StructuralIssue> {
  const issues: StructuralIssue[]=[]; inspect(value,pinSchema,'',issues,new Set(),0); return issues;
}
export function validateScenarioScope(value: unknown): ReadonlyArray<StructuralIssue> {
  const issues: StructuralIssue[]=[]; inspect(value,scopeSchema,'',issues,new Set(),0);
  if (!issues.length) {
    const scope=value as ScenarioScope;
    for (const [name,ids] of [['sourceVector',scope.sourceVector.map(x=>x.componentId)],['producerVector',scope.producerVector.map(x=>x.id)],['modes',scope.modes.map(x=>x.collectionId)]] as const)
      if (new Set(ids).size!==ids.length) add(issues,'DUPLICATE_SCOPE_ID','/'+name,'Scope identifiers must be unique.');
    if (scope.producerVector.some(x=>x.target!==scope.target)) add(issues,'PRODUCER_TARGET_CONFLICT','/producerVector','Producer target differs from scope.');
  }
  return issues;
}
/** Order-insensitive object comparison, preserving array order. No hash grants trust. */
export function structuralDataEqual(a: unknown,b: unknown): boolean {
  function equal(left: unknown,right: unknown,ancestors: Set<object>,depth: number): boolean {
    if (depth>48) return false;
    if (left===null || right===null || typeof left!=='object' || typeof right!=='object') return left===right;
    if (ancestors.has(left)||ancestors.has(right)) return false;
    ancestors.add(left);ancestors.add(right);
    let matches=false;
    if (Array.isArray(left)||Array.isArray(right)) {
      const a=readDenseDataArray(left),b=readDenseDataArray(right);
      if (a.values && b.values && a.values.length===b.values.length) matches=a.values.every((x,i)=>equal(x,b.values?.[i],ancestors,depth+1));
    } else if (isPlainRecord(left)&&isPlainRecord(right)) {
      const keys=Reflect.ownKeys(left),otherKeys=Reflect.ownKeys(right);
      matches=keys.length===otherKeys.length && keys.every(key=>{
        if (typeof key!=='string') return false;
        const a=Object.getOwnPropertyDescriptor(left,key),b=Object.getOwnPropertyDescriptor(right,key);
        return !!a && !!b && a.enumerable===true && b.enumerable===true && own(a,'value') && own(b,'value') && equal(a.value,b.value,ancestors,depth+1);
      });
    }
    ancestors.delete(left);ancestors.delete(right);return matches;
  }
  return equal(a,b,new Set(),0);
}
function checkScopes(value: unknown,root: ScenarioScope,path: string,issues: StructuralIssue[]): void {
  if (Array.isArray(value)) { value.forEach((x,i)=>checkScopes(x,root,path+'/'+i,issues)); return; }
  if (!isPlainRecord(value)) return;
  if (value.state==='known'||value.state==='unknown') {
    if (!structuralDataEqual(value.scope,root)) add(issues,'OBSERVATION_SCOPE_CONFLICT',path+'/scope','Observation does not match the finite root scope.');
    if (value.state==='known' && !root.producerVector.some(x=>structuralDataEqual(x,value.producerRef))) add(issues,'PRODUCER_VECTOR_CONFLICT',path+'/producerRef','Submitted producer does not match the submitted scope vector.');
  }
  if (own(value,'eventId')) {
    if (value.sessionId!==root.sessionId || value.snapshotId!==root.snapshotId || !structuralDataEqual(value.context,root)) add(issues,'EVENT_SCOPE_CONFLICT',path,'Event has a contradictory session/capture/context.');
  }
  if (own(value,'ownerRootSubjectId') && value.ownerRootSubjectId!==root.rootSubjectId) add(issues,'CONTAINER_OWNER_CONFLICT',path+'/ownerRootSubjectId','Submitted container belongs to another root.');
  for (const key of Object.keys(value)) if (key!=='scope' && key!=='context') checkScopes(value[key],root,path+'/'+key,issues);
}
export function validateScenarioEvidence(value: unknown): StructuralValidation {
  const issues: StructuralIssue[]=[];
  inspect(value,evidenceSchema,'',issues,new Set(),0);
  if (!issues.length) {
    const evidence=value as ScenarioEvidenceV1;
    issues.push(...validateScenarioScope(evidence.scope));
    checkScopes(value,evidence.scope,'',issues);
    if (evidence.applicability.state==='known') {
      const a=evidence.applicability.value;
      if (a.rootSubjectId!==evidence.scope.rootSubjectId || a.platform!==evidence.scope.platform || a.sourceOverflowLiteral!==(a.Overflow?'true':'false')) add(issues,'APPLICABILITY_CONFLICT','/applicability','Submitted root/platform/literal mapping conflicts.');
    }
    if (evidence.platform.state==='known' && evidence.platform.value!==evidence.scope.platform) add(issues,'PLATFORM_CONFLICT','/platform','Submitted platform conflicts with scope.');
    if (evidence.captureContext.state==='known' && !structuralDataEqual(evidence.captureContext.value,evidence.scope)) add(issues,'CAPTURE_CONTEXT_CONFLICT','/captureContext','Submitted capture context differs.');
    if (evidence.canonical.state==='known') {
      const rows=evidence.canonical.value;
      for (const field of ['bindingId','occurrenceId','targetSubjectId','targetId'] as const)
        if (new Set(rows.map(x=>x[field])).size!==rows.length) add(issues,'CANONICAL_ALIAS','/canonical/value','Two source occurrences share '+field+'.');
      for (const row of rows) if (row.role.state==='known' && row.actionIdentity.state==='known') {
        const business=row.role.value==='business-action';
        if (business!==(row.actionIdentity.value.kind==='business-action')) add(issues,'ACTION_ROLE_CONFLICT','/canonical/value','Submitted business role and identity contradict.');
      }
      const sources=new Map(rows.map(row=>[row.occurrenceId,row]));
      function sourceJoin(occurrenceId: string,subjectId: string | undefined,actionId: string | undefined,path: string): void {
        const source=sources.get(occurrenceId);
        if (!source || (subjectId!==undefined && source.targetSubjectId!==subjectId)) { add(issues,'ACTION_SOURCE_CONFLICT',path,'Submitted action has a foreign occurrence or original subject.'); return; }
        if (actionId!==undefined && source.actionIdentity.state==='known') {
          const identity=source.actionIdentity.value;
          if (identity.kind!=='business-action' || identity.actionId!==actionId) add(issues,'ACTION_IDENTITY_CONFLICT',path,'Submitted action contradicts the independently supplied canonical identity.');
        }
      }
      for (const group of [evidence.actions.identity,evidence.actions.visibleIdentity]) if (group.state==='known') for (const row of group.value)
        sourceJoin(row.occurrenceId,row.subjectId,row.identity.kind==='business-action'?row.identity.actionId:undefined,'/actions');
      if (evidence.actions.sourceContent.state==='known') for (const row of evidence.actions.sourceContent.value) sourceJoin(row.occurrenceId,row.subjectId,row.actionId,'/actions/sourceContent');
      if (evidence.actions.disabled.state==='known') for (const row of evidence.actions.disabled.value) sourceJoin(row.occurrenceId,undefined,row.actionId,'/actions/disabled');
      if (evidence.loading.visibleButtons.state==='known') for (const row of evidence.loading.visibleButtons.value) sourceJoin(row.occurrenceId,row.subjectId,undefined,'/loading/visibleButtons');
      if (evidence.trigger.intent.state==='known') sourceJoin(evidence.trigger.intent.value.occurrenceId,evidence.trigger.intent.value.subjectId,undefined,'/trigger/intent');
      if (evidence.overflowDomain.state==='known') {
        const domain=evidence.overflowDomain.value;
        const actual=new Set(domain.sourceOccurrenceIds),expected=new Set(rows.map(x=>x.occurrenceId));
        if (actual.size!==4 || actual.size!==expected.size || Array.from(actual).some(x=>!expected.has(x))) add(issues,'SOURCE_MEMBERSHIP_CONFLICT','/overflowDomain/value/sourceOccurrenceIds','All four original memberships must match.');
        if (domain.items.some(x=>!expected.has(x.sourceOccurrenceId)) || new Set(domain.items.map(x=>x.itemId)).size!==domain.items.length || new Set(domain.items.map(x=>x.itemSubjectId)).size!==domain.items.length) add(issues,'ITEM_IDENTITY_CONFLICT','/overflowDomain/value/items','Unknown source occurrence or aliased item.');
        if (domain.transferredOccurrenceIds.some(x=>!expected.has(x))) add(issues,'TRANSFER_SOURCE_CONFLICT','/overflowDomain/value/transferredOccurrenceIds','Transferred occurrence is outside the original membership.');
        for (const item of domain.items) sourceJoin(item.sourceOccurrenceId,undefined,item.actionId,'/overflowDomain/value/items');
      }
    }
    for (const group of [evidence.loading.visibleButtons,evidence.loadingDependencyEvidence]) if (group.state==='known') for (const row of group.value) {
      const bindings=row.spinnerBindings;
      if (new Set(bindings.map(x=>x.bindingId)).size!==2 || !bindings.some(x=>x.bindingId==='left') || !bindings.some(x=>x.bindingId==='right')) add(issues,'SPINNER_BINDING_DOMAIN','/loading','Both explicit left/right bindings are required.');
      if (bindings.some(x=>x.ownerActive.state==='known' && ((x.status==='inactive' && x.ownerActive.value) || (x.status==='active' && !x.ownerActive.value)))) add(issues,'SPINNER_STATE_CONFLICT','/loading','Submitted binding status and ownerActive contradict.');
    }
  }
  return { structuralStatus:issues.length?'invalid':'valid',issues,authority:'unverified',actualFacts:'unknown' };
}
