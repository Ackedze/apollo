import { sharedUsageContract } from './dependency-usage';
import type { CompiledContract, PreviewSnapshot, SemanticTarget, DeclaredTargetBindingV1, ManualSource } from './types';
import { stableHash } from './stable';
import { snapshotPaths } from './snapshot-topology';
import { matchesCaptureRepresentation } from './capture-representation';
import { compareInstanceBoundaries, withinBoundary } from './instance-boundaries';
import { variantAvailability, captureVariantReference, propertyAvailabilityKey } from './variant-facts';
import { isDeclaredRootTarget } from './root-target';
import { resolveComponentProperty } from './component-property-identity';
import { declaredTargetMembershipKey } from './declared-target-membership';
import { materializeInstanceContentReferences } from './instance-content-reference';
import { projectPublicSwapReference, publicSwapSlots, type PublicSwapShape } from './public-swap-reference';

export const DECLARED_TARGET_IDENTITY_VERSION = 3 as const;
export const DECLARED_TARGET_IDENTITY_SCHEMA = 'apollo.declared-target-identities.v1' as const;
const record = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};
const text = (v: unknown) => typeof v === 'string' && v.length > 0 && v === v.trim();
const closed = (v: unknown, required: string[], optional: string[] = []) => {
  const r = record(v); return v === r && required.every(k => Object.prototype.hasOwnProperty.call(r,k)) && Object.keys(r).every(k => required.includes(k) || optional.includes(k));
};
const unknown = (n: Record<string, any>, fact: string) => (n.unknownFacts || []).some((p: string) => p === fact || fact.startsWith(p + '.'));
const types = new Set(['INSTANCE','COMPONENT','FRAME','GROUP','TEXT','RECTANGLE','ELLIPSE','VECTOR','BOOLEAN_OPERATION','LINE','POLYGON','STAR','SLOT','SECTION']);

/** Published source addresses survive import; main IDs are local to the capture file.
 * Everything except these two explicitly typed local IDs remains pinned. */
export function portableDeclaredTargetReferenceHash(reference: NonNullable<PreviewSnapshot['variantReference']>): string {
  const portable = JSON.parse(JSON.stringify(reference));
  for (const value of Object.values(record(portable.nodeProperties))) {
    const properties = record(value);
    if (properties.identity) delete properties.identity.mainComponentId;
    if (properties.sourceIdentity) delete properties.sourceIdentity.ownerMainComponentId;
  }
  return stableHash(portable);
}

/** Configuration is checked by its own rules; typed public values do not identify a native occurrence. */
export function configurationDeclaredTargetReferenceHash(reference: NonNullable<PreviewSnapshot['variantReference']>): string {
  const portable = JSON.parse(JSON.stringify(reference));
  for (const value of Object.values(record(portable.nodeProperties))) {
    const properties = record(value);
    if (properties.identity) delete properties.identity.mainComponentId;
    if (properties.sourceIdentity) delete properties.sourceIdentity.ownerMainComponentId;
  }
  const root = record(record(portable.nodeProperties)['']);
  const configurationProperties: Array<{name:string;type:string}> = [];
  for (const name of Array.isArray(root.definedProperties) ? root.definedProperties : []) {
    const type = record(root.propertyTypes)[name], value = record(root.properties)[name];
    if (record(portable.propertyTypes)[name] !== type || record(portable.properties)[name] !== value
      || !(type === 'TEXT' && typeof value === 'string' || type === 'BOOLEAN' && typeof value === 'boolean')) continue;
    // Keep names, types, definitions, source identities and all nested values pinned.
    delete root.properties[name];
    delete portable.properties[name];
    configurationProperties.push({name,type});
  }
  return stableHash({schemaVersion:'apollo.declared-target-configuration-reference.v1',configurationProperties,reference:portable});
}

export function publicSwapDeclaredTargetReferenceHash(reference: NonNullable<PreviewSnapshot['variantReference']>, shape: PublicSwapShape): string {
  return stableHash({schemaVersion: 'apollo.declared-target-configuration-reference.v2',
    referenceHash: configurationDeclaredTargetReferenceHash(projectPublicSwapReference(reference, shape))});
}

function contractConfigurationHash(reference: NonNullable<PreviewSnapshot['variantReference']>, contract: CompiledContract): string | undefined {
  if (contract.runtimePolicy.declaredTargetConfigurationVersion === 2) return publicSwapDeclaredTargetReferenceHash(reference, {targets: contract.facts.targets, policies: contract.customizationPolicy, representations: contract.facts.representations});
  if (contract.runtimePolicy.declaredTargetConfigurationVersion === 1) return configurationDeclaredTargetReferenceHash(reference);
}

function configuredReferencePath(reference: NonNullable<PreviewSnapshot['variantReference']>, binding: DeclaredTargetBindingV1, contract: CompiledContract): string {
  if (contract.runtimePolicy.declaredTargetConfigurationVersion === 2) {
    const slots = publicSwapSlots(reference, {targets: contract.facts.targets, policies: contract.customizationPolicy, representations: contract.facts.representations});
    const slot = slots.find(s => s.bindingPath === binding.referencePath);
    if (slot) return slot.referencePath;
  }
  return binding.referencePath;
}

type Shape = { version?: unknown; configurationVersion?: unknown; targets: SemanticTarget[]; representations: ManualSource['representations'] };
/** Technical authoring shape only. Locator validity does not prove a live target. */
export function declaredTargetIdentityErrors(shape: Shape): string[] {
  const bindings = shape.targets.flatMap(t => t.identityBindingsV1 === undefined ? [] : [t.identityBindingsV1]);
  if (shape.version === undefined && shape.configurationVersion === undefined && !bindings.length) return [];
  const errors: string[] = [];
  if (shape.configurationVersion !== undefined && (shape.configurationVersion !== 1 && shape.configurationVersion !== 2 || shape.version !== 3)) errors.push('declared target configuration requires version 1 or 2 and identity policy v3');
  if (typeof shape.version !== 'number' || ![1,2,3].includes(shape.version)) errors.push('declared target bindings require explicit supported policy version 1, 2 or 3');
  if (!bindings.length) errors.push('declared target policy requires explicit bindings');
  const ids = new Set<string>(), roles = new Set<string>();
  for (const target of shape.targets) {
    if (!text(target.id) || !text(target.semanticRole) || ids.has(target.id) || roles.has(target.semanticRole)) errors.push('declared target IDs and roles must be unique');
    ids.add(target.id); roles.add(target.semanticRole);
    if (target.identityBindingsV1 === undefined) continue;
    if (!Array.isArray(target.identityBindingsV1) || !target.identityBindingsV1.length) { errors.push('target bindings must be a nonempty array'); continue; }
    const keys = new Set<string>();
    for (const b of target.identityBindingsV1) {
      if (!closed(b,['representationId','componentKey','componentSetKey','referenceHash','referencePath','nodeType'],[1,2].includes(Number(shape.configurationVersion)) ? ['nativeSource','portableReferenceHash','configurationReferenceHash'] : shape.version === 2 || shape.version === 3 ? ['nativeSource','portableReferenceHash'] : ['nativeSource'])
        || !text(b.representationId) || !text(b.componentKey) || typeof b.componentSetKey !== 'string'
        || !/^[a-f0-9]{64}$/.test(b.referenceHash) || b.portableReferenceHash !== undefined && !/^[a-f0-9]{64}$/.test(b.portableReferenceHash) || typeof b.referencePath !== 'string'
        || b.referencePath !== b.referencePath.trim() || !types.has(b.nodeType)
        || b.referencePath.split(' / ').some(p => /^@(local|catalog):/.test(p))
        || !shape.representations.some(r => r.kind === 'figma' && r.id === b.representationId && r.status !== 'deprecated')) {
        errors.push('malformed typed declared target binding'); continue;
      }
      if ([1,2].includes(Number(shape.configurationVersion)) && (!/^[a-f0-9]{64}$/.test(b.configurationReferenceHash || '') || !b.portableReferenceHash)) errors.push('configuration binding requires exact portable and configuration SHA256 pins');
      const key = JSON.stringify([b.representationId,b.componentKey,b.componentSetKey]);
      if (keys.has(key)) errors.push('duplicate selected-variant target binding'); keys.add(key);
      if (b.referencePath === '') {
        if (!isDeclaredRootTarget(target) || !['INSTANCE','COMPONENT'].includes(b.nodeType) || b.nativeSource !== undefined) errors.push('root binding requires an explicit root target and native root type');
      } else if (!closed(b.nativeSource,['sourceNodeId','ownerComponentKey','ownerMainComponentId'])
        || !Object.values(b.nativeSource!).every(text)) errors.push('descendant binding requires exact native source identity');
    }
  }
  return errors;
}

export function assertDeclaredTargetContract(contract: CompiledContract): void {
  contract = sharedUsageContract(contract);
  const errors = declaredTargetIdentityErrors({ version:contract.runtimePolicy.declaredTargetIdentityVersion,
    configurationVersion:contract.runtimePolicy.declaredTargetConfigurationVersion,
    targets:contract.facts.targets, representations:contract.facts.representations });
  if (contract.runtimePolicy.declaredTargetIdentityVersion !== undefined && !contract.facts.variantEvidence) errors.push('independent variant anatomy is required');
  if ([1,2,3].includes(contract.runtimePolicy.declaredTargetIdentityVersion || 0)) {
    for (const target of contract.facts.targets) if (!contract.capabilities.facts.includes(`declaredTargetMembershipV1.${declaredTargetMembershipKey(target.id)}`)) errors.push('declared membership capability missing');
    const exporter = contract.runtimePolicy.nativeInstanceReplacementsVersion === 1 ? 'component-contract-editor@0.2.108' : contract.runtimePolicy.declaredTargetConfigurationVersion === 2 ? 'component-contract-editor@0.2.103' : contract.runtimePolicy.declaredTargetConfigurationVersion === 1 ? 'component-contract-editor@0.2.99' : contract.runtimePolicy.declaredTargetIdentityVersion === 3 ? 'component-contract-editor@0.2.95' : contract.runtimePolicy.textContentFactsVersion === 1 || contract.runtimePolicy.nativeTargetPropertyFactsVersion === 1 ? 'component-contract-editor@0.2.94' : contract.runtimePolicy.declaredTargetIdentityVersion === 2 ? 'component-contract-editor@0.2.93' : 'component-contract-editor@0.2.92';
    if (contract.package.sourceExportVersion !== exporter) errors.push('declared target exporter compatibility stamp missing');
    if (contract.rules.some(rule => {
      const inspect = (value: any): boolean => Array.isArray(value) ? value.some(inspect) : value && typeof value === 'object'
        ? (value.actual?.fact === 'semantic.role' && value.expected?.literal !== undefined) || Object.values(value).some(inspect) : false;
      return inspect(rule);
    })) errors.push('unbound diagnostic role selector in declared target IR');
  }
  if (contract.runtimePolicy.declaredTargetIdentityVersion === undefined
    && contract.capabilities.facts.some(f => f.startsWith('declaredTargetMembershipV1.'))) errors.push('membership capability requires its policy');
  if (errors.length) throw Object.assign(new Error('DECLARED_TARGET_IDENTITY_UNSUPPORTED: ' + errors.join('; ')),{code:'DECLARED_TARGET_IDENTITY_UNSUPPORTED'});
}

type TargetFact = { targetId: string; semanticRole: string; status: 'resolved' | 'unknown' | 'ambiguous'; reason: string;
  nodeId?: string; nodeType?: string; present?: true; effectiveVisible?: boolean; referencePath?: string };
type Ledger = { schemaVersion: typeof DECLARED_TARGET_IDENTITY_SCHEMA; manualSourceHash: string; referenceHash?: string; portableReferenceHash?: string; configurationReferenceHash?: string; targets: TargetFact[] };

/** Complete rooted chains are checked without names, ordering or diagnostic roles. */
function rootedTopology(snapshot: PreviewSnapshot): { root: Record<string, any>; byId: Map<string, Record<string, any>> } | undefined {
  if (snapshot.selection.length !== 1 || snapshot.source?.truncated !== false || snapshot.source.captureTopology?.complete !== true) return;
  const byId = new Map<string, Record<string, any>>();
  for (const n of snapshot.nodes) {
    if (!text(n.id) || byId.has(String(n.id)) || typeof n.type !== 'string' || !types.has(n.type) || unknown(n,'type')
      || !Array.isArray(n.childIds) || new Set(n.childIds).size !== n.childIds.length) return;
    byId.set(String(n.id),n);
  }
  const root = byId.get(snapshot.selection[0]);
  if (!root || root.parentId !== null) return;
  for (const n of byId.values()) {
    if (unknown(n,'parentId') || unknown(n,'childIds')) return;
    if (n !== root && (!byId.has(String(n.parentId)) || !byId.get(String(n.parentId))!.childIds.includes(n.id))) return;
    if (n.childIds.some((id: string) => !byId.has(id) || byId.get(id)!.parentId !== n.id)) return;
    const visited = new Set<string>(); let current: Record<string, any> | undefined = n;
    while (current !== root) {
      if (!current || visited.has(String(current.id))) return;
      visited.add(String(current.id)); current = byId.get(String(current.parentId));
    }
  }
  return {root,byId};
}
function effectiveVisibility(node: Record<string, any>, topology: NonNullable<ReturnType<typeof rootedTopology>>): boolean | undefined {
  let n: Record<string, any> | undefined = node, hidden = false, uncertain = false;
  while (n) {
    if (unknown(n,'visible') || typeof n.visible !== 'boolean') uncertain = true;
    else if (n.visible === false) hidden = true;
    if (n === topology.root) return hidden ? false : uncertain ? undefined : true;
    n = topology.byId.get(String(n.parentId));
  }
  return;
}

/** Source identity is checked against its actual and independent reference owner.
 * No diagnostic path/name is allowed to create a match. */
function sourceMatches(node: Record<string, any>, path: string, binding: DeclaredTargetBindingV1,
  snapshot: PreviewSnapshot, topology: NonNullable<ReturnType<typeof rootedTopology>>, portable: boolean): boolean {
  const source = record(record(node.component).sourceIdentity), expected = binding.nativeSource;
  const reference = snapshot.variantReference!;
  if (!expected || source.version !== 1 || snapshot.source?.instanceSourceIdentityVersion !== 1
    || snapshot.source.occurrenceAddressVersion !== 1 || reference.occurrenceAddressVersion !== 1
    || Object.entries(expected).some(([key,value]) => (!portable || key !== 'ownerMainComponentId') && source[key] !== value || unknown(node,`component.sourceIdentity.${key}`))
    || unknown(node,'component.sourceIdentity.version')) return false;
  const independentlyCaptured = reference.nodeProperties[path]?.sourceIdentity;
  if (!independentlyCaptured || independentlyCaptured.version !== 1
    || Object.entries(expected).some(([key,value]) => (!portable || key !== 'ownerMainComponentId') && (independentlyCaptured as any)[key] !== value)) return false;
  let owner = topology.byId.get(String(node.parentId));
  while (owner && owner !== topology.root && owner.type !== 'INSTANCE' && owner.type !== 'COMPONENT') {
    if (owner.type === 'SLOT') return false;
    owner = topology.byId.get(String(owner.parentId));
  }
  const identity = record(record(owner?.component).identity);
  if (!owner || unknown(owner,'component.identity') || unknown(owner,'component.identity.componentKey')
    || unknown(owner,'component.identity.mainComponentId') || identity.componentKey !== expected.ownerComponentKey
    || !text(identity.mainComponentId) || identity.mainComponentId !== source.ownerMainComponentId
    || !portable && identity.mainComponentId !== expected.ownerMainComponentId) return false;
  // Independently require the nearest reference owner, not an arbitrary key somewhere in the tree.
  let parent = path.split(' / ').slice(0,-1).join(' / ');
  while (parent && reference.nodes.find(n => n.path === parent)?.type !== 'INSTANCE') parent = parent.split(' / ').slice(0,-1).join(' / ');
  const refOwner = reference.nodeProperties[parent]?.identity;
  if (refOwner?.componentKey !== expected.ownerComponentKey || refOwner.mainComponentId !== independentlyCaptured.ownerMainComponentId
    || refOwner.mainComponentId !== identity.mainComponentId || !portable && refOwner.mainComponentId !== expected.ownerMainComponentId) return false;
  if (owner === topology.root) return parent === '';
  // Equal component variants can occur in different branches; prove each native owner occurrence up to the root.
  const ownerSource = reference.nodeProperties[parent]?.sourceIdentity;
  if (!ownerSource || ownerSource.version !== 1 || !text(ownerSource.sourceNodeId)
    || !text(ownerSource.ownerComponentKey) || !text(ownerSource.ownerMainComponentId)) return false;
  return sourceMatches(owner, parent, { ...binding, nativeSource: {
    sourceNodeId: ownerSource.sourceNodeId, ownerComponentKey: ownerSource.ownerComponentKey,
    ownerMainComponentId: ownerSource.ownerMainComponentId,
  } }, snapshot, topology, portable);
}

/** Configuration is read on a proven native occurrence, including its changed variant.
 * Descendants of a foreign owner do not inherit its old target identity. */
export function materializeNativeTargetProperties(snapshot: PreviewSnapshot, contract: CompiledContract): void {
  if (contract.runtimePolicy.nativeTargetPropertyFactsVersion !== 1) return;
  for (const node of snapshot.nodes) delete node.nativeTargetPropertiesV1;
  const topology = rootedTopology(snapshot), ref = snapshot.variantReference, paths = snapshotPaths(snapshot);
  if (!topology || !paths || !ref?.complete) return;
  const root = topology.root, identity = record(record(root.component).identity);
  const reps = contract.facts.representations.filter(r => r.kind === 'figma' && r.status !== 'deprecated'
    && r.platform === snapshot.context.platform && matchesCaptureRepresentation(r, ref.componentKey, ref.componentSetKey));
  if (reps.length !== 1 || unknown(root, 'component.identity') || identity.componentKey !== ref.componentKey
    || identity.componentSetKey !== ref.componentSetKey || identity.mainComponentId !== ref.nodeProperties?.['']?.identity?.mainComponentId
    || snapshot.source?.componentKey !== ref.componentKey || snapshot.source?.componentSetKey !== ref.componentSetKey) return;
  const comparison = compareInstanceBoundaries(snapshot, ref), facts: Record<string, any> = {}, proven = new Map<string, string>();
  if (!comparison.complete) return;
  for (const target of contract.facts.targets) {
    if (target.resolution !== 'resolved') continue;
    const bindings = target.identityBindingsV1?.filter(b => b.representationId === reps[0].id && b.componentKey === ref.componentKey && b.componentSetKey === ref.componentSetKey) || [];
    if (bindings.length !== 1) continue;
    const b = bindings[0], portable = [2,3].includes(contract.runtimePolicy.declaredTargetIdentityVersion || 0) && b.portableReferenceHash !== undefined;
    const configurationHash = contractConfigurationHash(ref, contract), referencePath = configuredReferencePath(ref, b, contract);
    if (configurationHash ? b.configurationReferenceHash !== configurationHash
      : portable ? b.portableReferenceHash !== portableDeclaredTargetReferenceHash(ref) : b.referenceHash !== stableHash(ref)) continue;
    const candidates = snapshot.nodes.filter(n => referencePath === '' ? n === root : sourceMatches(n, referencePath, b, snapshot, topology, portable));
    if (candidates.length !== 1 || candidates[0].type !== b.nodeType) continue;
    const node = candidates[0], path = paths.get(String(node.id));
    if (path === undefined || comparison.referencePaths?.[path] !== referencePath) continue;
    const key = declaredTargetMembershipKey(target.id), component = record(node.component), props: Record<string, unknown> = {};
    const original = ref.nodeProperties[referencePath];
    for (const [name, value] of Object.entries(record(component.properties))) {
      const type = record(component.propertyTypes)[name];
      if (original?.propertyTypes[name] === type && !unknown(node, `component.properties.${name}`) && !unknown(node, `component.propertyTypes.${name}`)
        && (type === 'VARIANT' && typeof value === 'string' || type === 'BOOLEAN' && typeof value === 'boolean')) props[name] = value;
    }
    facts[key] = {properties: props};
    if (!unknown(node, 'component.identity.componentSetKey')) facts[key].componentSetKey = record(component.identity).componentSetKey;
    proven.set(key, path);
  }
  for (const fact of contract.capabilities.facts.filter(f => f.startsWith('nativeTargetPropertiesV1.swapCountExcept_'))) {
    const key = fact.slice('nativeTargetPropertiesV1.swapCountExcept_'.length), except = proven.get(key);
    if (except === undefined) continue;
    let count = 0, complete = true;
    const seen = new Set<string>();
    const visit = (reference: NonNullable<PreviewSnapshot['variantReference']>) => {
      const cmp = compareInstanceBoundaries(snapshot, reference);
      if (!cmp.complete) { complete = false; return; }
      for (const boundary of cmp.boundaries) {
        if (withinBoundary(boundary.actualPath, except) || seen.has(boundary.nodeId)) continue;
        seen.add(boundary.nodeId);
        if (boundary.reason === 'component-variant-changed') {
          const result = snapshot.instanceContentResults?.find(r => r.boundaryNodeId === boundary.nodeId);
          const attempts = snapshot.instanceContentReferences?.attempts.filter(a => a.boundaryNodeId === boundary.nodeId) || [];
          if (!result?.lineageProven || attempts.length !== 1 || attempts[0].failure || !attempts[0].reference) {complete = false; continue;}
          const host = attempts[0].reference;
          visit(captureVariantReference(host, host.source?.componentKey || '', host.source?.componentSetKey || ''));
        } else if (boundary.reason === 'instance-identity-unavailable') complete = false;
        else count++;
      }
    };
    visit(ref);
    if (complete || count > 0) facts['swapCountExcept_' + key] = count;
  }
  root.nativeTargetPropertiesV1 = facts;
}

export function materializeDeclaredTargetIdentities(snapshot: PreviewSnapshot, contract: CompiledContract): void {
  if (![1,2,3].includes(contract.runtimePolicy.declaredTargetIdentityVersion || 0)) return;
  const topology = rootedTopology(snapshot), ref = snapshot.variantReference;
  const ledger: Ledger = {schemaVersion:DECLARED_TARGET_IDENTITY_SCHEMA,manualSourceHash:contract.package.manualSourceHash,targets:[]};
  const reps = ref ? contract.facts.representations.filter(r => r.status !== 'deprecated' && r.platform === snapshot.context.platform
    && matchesCaptureRepresentation(r,ref.componentKey,ref.componentSetKey)) : [];
  const identity = record(record(topology?.root.component).identity);
  const identityKnown = !!(topology && ref?.complete && !unknown(topology.root,'component.identity')
    && snapshot.source?.componentKey === ref.componentKey && (snapshot.source.componentSetKey || '') === ref.componentSetKey
    && identity.componentKey === ref.componentKey && (identity.componentSetKey || '') === ref.componentSetKey
    && identity.mainComponentId === ref.nodeProperties?.['']?.identity?.mainComponentId && reps.length === 1);
  const paths = topology && snapshotPaths(snapshot), comparison = identityKnown ? compareInstanceBoundaries(snapshot,ref!) : undefined;
  const availability = identityKnown ? variantAvailability(snapshot,contract) : undefined;
  const refHash = ref ? stableHash(ref) : undefined; ledger.referenceHash = refHash;
  const portableHash = ref && [2,3].includes(contract.runtimePolicy.declaredTargetIdentityVersion || 0) ? portableDeclaredTargetReferenceHash(ref) : undefined;
  if (portableHash) ledger.portableReferenceHash = portableHash;
  const configurationHash = ref ? contractConfigurationHash(ref, contract) : undefined;
  if (configurationHash) ledger.configurationReferenceHash = configurationHash;
  let independent: PreviewSnapshot | undefined;
  const configuredEvidence=()=>{
    if (!independent && snapshot.instanceContentReferences?.schemaVersion==='apollo.instance-content-references.v4') {
      independent=JSON.parse(JSON.stringify(snapshot));
      delete independent!.instanceContentResults;
      materializeInstanceContentReferences(independent!);
    }
    return independent;
  };
  for (const target of contract.facts.targets) {
    const fact: TargetFact = {targetId:target.id,semanticRole:target.semanticRole,status:'unknown',reason:'source-or-reference-incomplete'}; ledger.targets.push(fact);
    if (!identityKnown || !paths) continue;
    if (target.resolution !== 'resolved') {fact.reason='authoring-target-unresolved';continue;}
    const bindings = target.identityBindingsV1?.filter(b => b.representationId === reps[0].id && b.componentKey === ref!.componentKey && b.componentSetKey === ref!.componentSetKey) || [];
    if (bindings.length !== 1) {fact.status=bindings.length>1?'ambiguous':'unknown';fact.reason='selected-binding-unavailable';continue;}
    const b = bindings[0], referencePath = configuredReferencePath(ref!, bindings[0], contract);
    const portable = [2,3].includes(contract.runtimePolicy.declaredTargetIdentityVersion || 0) && b.portableReferenceHash !== undefined;
    if (configurationHash ? b.configurationReferenceHash !== configurationHash : portable ? b.portableReferenceHash !== portableHash : b.referenceHash !== refHash) {fact.reason='reference-pin-stale';continue;}
    const referenceNodes = ref!.nodes.filter(n => n.path === referencePath && n.type === (referencePath === '' ? 'ROOT' : b.nodeType));
    if (referenceNodes.length !== 1 || contract.runtimePolicy.declaredTargetIdentityVersion !== 3
      && comparison?.boundaries.some(boundary => withinBoundary(referencePath,boundary.referencePath))) {fact.reason='independent-correspondence-unavailable';continue;}
    // Cardinality precedes visibility. A second native source match is a real ambiguity.
    let candidates = snapshot.nodes.filter(n => referencePath === '' ? n === topology!.root && n.type === b.nodeType
      : sourceMatches(n,referencePath,b,snapshot,topology!,portable));
    let alternative=false;
    if (!candidates.length && contract.runtimePolicy.declaredTargetIdentityVersion===3 && comparison?.complete && availability?.status!=='unknown') {
      const proof=configuredEvidence();
      if (proof) candidates=declaredVariantAlternatives(proof,contract,target,b,referencePath,comparison,portable);
      alternative=candidates.length>0;
    }
    if (candidates.length !== 1) {fact.status=candidates.length>1?'ambiguous':'unknown';fact.reason='native-cardinality-unresolved';continue;}
    if (!comparison?.complete || availability?.status === 'unknown') {fact.reason='independent-correspondence-unavailable';continue;}
    const node = candidates[0], actualPath = paths.get(String(node.id));
    const boundaries = comparison.boundaries.filter(boundary => withinBoundary(referencePath,boundary.referencePath) || actualPath !== undefined && withinBoundary(actualPath,boundary.actualPath));
    const configured = contract.runtimePolicy.declaredTargetIdentityVersion === 3 && boundaries.length === 1
      && verifiedConfiguredTarget(configuredEvidence(), node, referencePath, actualPath, boundaries[0],contract);
    if (boundaries.length && !configured && !alternative) {fact.reason='independent-correspondence-unavailable';continue;}
    if (node.type !== b.nodeType || actualPath === undefined || !alternative && comparison.referencePaths?.[actualPath] !== referencePath) {fact.reason='typed-correspondence-unavailable';continue;}
    if (configured && boundaries[0].reason==='instance-swap') materializeConfiguredSwapProperties(node,configuredEvidence()!,contract);
    Object.assign(fact,{status:'resolved',reason:alternative?'exact-independent-declared-variant-alternative':'exact-independent-native-identity',nodeId:String(node.id),nodeType:node.type,present:true,referencePath:referencePath});
    const visible = effectiveVisibility(node,topology!); if (visible !== undefined) fact.effectiveVisible = visible;
  }
  for (const fact of ledger.targets) if (fact.nodeId) {
    const claims = ledger.targets.filter(t => t.nodeId === fact.nodeId);
    const rootAliases = claims.every(t => isDeclaredRootTarget(contract.facts.targets.find(x => x.id === t.targetId)))
      && contract.runtimePolicy.rootTargetAliasesVersion === 1 && fact.nodeId === topology?.root.id;
    if (claims.length > 1 && !rootAliases) {fact.status='ambiguous';fact.reason='declared-target-collision';delete fact.present;delete fact.effectiveVisible;}
  }
  (snapshot as any).declaredTargetIdentitiesV1 = ledger;
  for (const node of snapshot.nodes) {
    const capturedRole = record(node.semantic).role;
    node.targetDiagnosticsV1 = {capturedRole: Object.prototype.hasOwnProperty.call(record(node.targetDiagnosticsV1),'capturedRole') ? record(node.targetDiagnosticsV1).capturedRole : capturedRole}; // Diagnostic only; never consumed as identity.
    node.semantic = Object.assign({},record(node.semantic),{role:''});
    const membership: Record<string, boolean> = {}, relations: Record<string,string> = {}, targets: Record<string,any> = {}, availabilityFacts: Record<string,any> = {};
    const missing = new Set(((node.unknownFacts || []) as string[]).filter((p: string) => !p.startsWith('declaredTargetMembershipV1.')
      && !p.startsWith('semanticTargets.') && !p.startsWith('variantAvailability.targets.') && p !== 'visibility.effective' && p !== 'semantic.role'));
    for (const fact of ledger.targets) {
      const key = declaredTargetMembershipKey(fact.targetId);
      if (fact.status === 'resolved') {
        membership[key] = fact.nodeId === node.id;
        targets[fact.semanticRole] = {resolved:true,present:true}; availabilityFacts[fact.semanticRole] = {present:true};
        relations[fact.semanticRole] = fact.nodeId!;
        if (fact.effectiveVisible !== undefined) targets[fact.semanticRole].visibilityKnown = true;
        else missing.add(`semanticTargets.${fact.semanticRole}.visibilityKnown`);
        if (fact.nodeId === node.id && !record(node.semantic).role) record(node.semantic).role = fact.semanticRole;
      } else {
        missing.add(`declaredTargetMembershipV1.${key}`); missing.add(`semanticTargets.${fact.semanticRole}`); missing.add(`variantAvailability.targets.${fact.semanticRole}.present`);
      }
    }
    const visible = topology ? effectiveVisibility(node,topology) : undefined;
    node.visibility = visible === undefined ? {} : {effective:visible}; if (visible === undefined) missing.add('visibility.effective');
    node.declaredTargetMembershipV1 = membership; node.relations = relations; node.semanticTargets = targets;
    node.variantAvailability = Object.assign({},record(node.variantAvailability),{targets:availabilityFacts});
    node.unknownFacts = [...missing];
  }
}

/** The public slot root API comes from its independently captured selected asset. */
function materializeConfiguredSwapProperties(node:Record<string,any>,proof:PreviewSnapshot,contract:CompiledContract):void {
  const proven=proof.nodes.find(n=>n.id===node.id), provenance=record(proven?.baselineProvenance);
  const attempts=proof.instanceContentReferences?.attempts.filter(a=>a.boundaryNodeId===node.id)||[], reference=attempts.length===1?attempts[0].reference:undefined;
  const paths=reference && snapshotPaths(reference), refNodes=reference?.nodes.filter(n=>paths?.get(String(n.id))===provenance.referencePath)||[];
  if (refNodes.length!==1) return;
  const refNode=refNodes[0], expected=record(refNode.component), actual=record(node.component);
  const available=record(record(node.variantAvailability).componentProperties);
  for (const fact of contract.capabilities.facts.filter(f=>f.startsWith('component.properties.'))) {
    const name=fact.slice('component.properties.'.length), a=resolveComponentProperty(name,actual), b=resolveComponentProperty(name,expected);
    if (!('name' in a) || !('name' in b) || a.name!==b.name || record(actual.propertyTypes)[a.name]!=='VARIANT'
      || record(expected.propertyTypes)[b.name]!=='VARIANT' || typeof record(actual.properties)[a.name]!=='string'
      || record(actual.properties)[a.name]!==record(expected.properties)[b.name]
      || unknown(refNode,'component.properties.'+b.name) || unknown(refNode,'component.propertyTypes.'+b.name)
      || unknown(node,'component.properties.'+a.name) || unknown(node,'component.propertyTypes.'+a.name)) continue;
    const key=propertyAvailabilityKey(name);available[key]=true;
    node.unknownFacts=(node.unknownFacts||[]).filter((f:string)=>f!=='variantAvailability.componentProperties.'+key);
  }
  node.variantAvailability=Object.assign({},record(node.variantAvailability),{componentProperties:available});
}

/** A declared alternative is corroborated inside this exact independently configured owner occurrence. */
function declaredVariantAlternatives(snapshot:PreviewSnapshot,contract:CompiledContract,target:SemanticTarget,binding:DeclaredTargetBindingV1,
  referencePath:string,comparison:ReturnType<typeof compareInstanceBoundaries>,portable:boolean):Record<string,any>[] {
  const boundaries=comparison.boundaries.filter(b=>b.reason==='component-variant-changed' && referencePath!==b.referencePath && withinBoundary(referencePath,b.referencePath));
  if (boundaries.length!==1) return [];
  const boundary=boundaries[0], results=snapshot.instanceContentResults?.filter(r=>r.boundaryNodeId===boundary.nodeId)||[];
  const attempts=snapshot.instanceContentReferences?.attempts.filter(a=>a.boundaryNodeId===boundary.nodeId)||[];
  if (results.length!==1 || !results[0].lineageProven || !['matched','partial'].includes(results[0].status)
    || attempts.length!==1 || attempts[0].failure || attempts[0].strategy!=='pristine-host-variant-properties' || !attempts[0].reference) return [];
  const reference=attempts[0].reference, ref=captureVariantReference(reference,reference.source?.componentKey||'',reference.source?.componentSetKey||''),
    change=compareInstanceBoundaries(reference,snapshot.variantReference!,true), selected=change.boundaries.filter(b=>b.referencePath===boundary.referencePath
      && b.actualComponentKey===boundary.actualComponentKey && b.componentSetKey===boundary.componentSetKey);
  const topology=rootedTopology(snapshot), paths=snapshotPaths(snapshot);
  if (!topology || !paths || !ref.complete || !change.complete || selected.length!==1) return [];
  const virtual=Object.assign({},snapshot,{variantReference:ref}), matches=new Map<string,Record<string,any>>();
  const alternatives=target.identityBindingsV1?.filter(a=>a.representationId===binding.representationId && a.componentSetKey===binding.componentSetKey
    && a.nodeType===binding.nodeType && a.nativeSource?.ownerComponentKey===boundary.actualComponentKey
    && contract.facts.variantEvidence?.variants.some(v=>v.componentKey===a.componentKey && v.componentSetKey===a.componentSetKey))||[];
  for (const alternative of alternatives) for (const candidate of ref.nodes) {
    if (candidate.type!==alternative.nodeType || !withinBoundary(candidate.path,selected[0].actualPath)) continue;
    const source=ref.nodeProperties[candidate.path]?.sourceIdentity, expected=alternative.nativeSource!;
    if (!source || source.version!==1 || Object.entries(expected).some(([k,v])=>(!portable||k!=='ownerMainComponentId')&&(source as any)[k]!==v)) continue;
    for (const node of snapshot.nodes) {
      const actualPath=paths.get(String(node.id)), proof=record(node.baselineProvenance);
      if (node.type!==alternative.nodeType || actualPath===undefined || !withinBoundary(actualPath,boundary.actualPath)
        || !results[0].matchedNodeIds.includes(String(node.id)) || proof.status!=='matched' || proof.kind!=='independent-host-variant'
        || proof.boundaryNodeId!==boundary.nodeId || proof.componentKey!==boundary.actualComponentKey || proof.referencePath!==candidate.path) continue;
      let owner=topology.byId.get(String(node.parentId));
      while (owner && owner!==topology.root && !['INSTANCE','COMPONENT','SLOT'].includes(owner.type)) owner=topology.byId.get(String(owner.parentId));
      if (owner?.id!==boundary.nodeId || !sourceMatches(node,candidate.path,alternative,virtual,topology,portable)) continue;
      matches.set(String(node.id),node);
    }
  }
  return [...matches.values()];
}

/** Only the exact configured boundary root survives; descendants keep their own proof. */
function verifiedConfiguredTarget(snapshot: PreviewSnapshot | undefined, node: Record<string, any>, referencePath: string,
  actualPath: string | undefined, boundary: ReturnType<typeof compareInstanceBoundaries>['boundaries'][number], contract:CompiledContract): boolean {
  if (!snapshot) return false;
  node=snapshot.nodes.find(n=>n.id===node.id)!;
  const swap=boundary.reason==='instance-swap' && contract.runtimePolicy.declaredTargetConfigurationVersion===2
    && publicSwapSlots(snapshot.variantReference!,{targets:contract.facts.targets,policies:contract.customizationPolicy,representations:contract.facts.representations})
      .some(slot=>slot.referencePath===referencePath && slot.property===boundary.property && boundary.ownerPath===''
        && record(node.component).propertyReferenceBindings?.mainComponent===slot.property
        && record(record(snapshot.nodes.find(n=>snapshot.selection.includes(String(n.id)))?.component).propertyTypes)[slot.property]==='INSTANCE_SWAP'
        && record(record(snapshot.nodes.find(n=>snapshot.selection.includes(String(n.id)))?.component).properties)[slot.property]===record(record(node.component).identity).mainComponentId);
  if (snapshot.instanceContentReferences?.schemaVersion !== 'apollo.instance-content-references.v4'
    || !swap && boundary.reason !== 'component-variant-changed' || boundary.nodeId !== node.id
    || boundary.referencePath !== referencePath || boundary.actualPath !== actualPath || node.type !== 'INSTANCE') return false;
  const results = snapshot.instanceContentResults?.filter(r => r.boundaryNodeId === node.id) || [];
  const identity = record(record(node.component).identity), provenance = record(node.baselineProvenance);
  return results.length === 1 && results[0].lineageProven === true && results[0].matchedNodeIds.includes(String(node.id))
    && ['matched','partial'].includes(results[0].status) && provenance.status === 'matched'
    && provenance.kind === (swap?'independent-host-swap':'independent-host-variant') && provenance.boundaryNodeId === node.id
    && provenance.componentKey === boundary.actualComponentKey && (swap || provenance.componentSetKey === boundary.componentSetKey)
    && !unknown(node,'component.identity') && !unknown(node,'component.identity.componentKey') && !unknown(node,'component.identity.componentSetKey')
    && identity.componentKey === boundary.actualComponentKey && (swap || identity.componentSetKey === boundary.componentSetKey);
}

/** Rewrites only the new opt-in IR; every target role filter uses exact membership. */
export function bindDeclaredTargetRuleSelectors(contract: CompiledContract): void {
  const byRole = new Map(contract.facts.targets.map(t => [t.semanticRole,t]));
  const membership = (role: string) => ({predicate:'equals',actual:{fact:`declaredTargetMembershipV1.${declaredTargetMembershipKey(byRole.get(role)!.id)}`},expected:{literal:true},missingPolicy:'unknown'});
  function visit(value: any): any {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;
    const fact = value.actual?.fact;
    if (fact === 'semantic.role' && value.expected?.literal !== undefined) {
      const roles = value.predicate === 'one-of' ? value.expected.literal : value.predicate === 'equals' ? [value.expected.literal] : [];
      if (Array.isArray(roles) && roles.length && roles.every(role => byRole.has(role))) return roles.length === 1 ? membership(roles[0]) : {predicate:'any',args:roles.map(membership)};
    }
    if (typeof fact === 'string' && fact.startsWith('rootTargetAliasesV1.') && value.predicate === 'equals' && value.expected?.literal === true && byRole.has(fact.slice('rootTargetAliasesV1.'.length))) return membership(fact.slice('rootTargetAliasesV1.'.length));
    return Object.fromEntries(Object.entries(value).map(([key,v]) => [key,visit(v)]));
  }
  contract.rules = contract.rules.map(rule => visit(rule));
  const facts = contract.facts.targets.map(t => `declaredTargetMembershipV1.${declaredTargetMembershipKey(t.id)}`);
  contract.capabilities.facts = [...new Set(contract.capabilities.facts.concat(facts))].sort();
}
