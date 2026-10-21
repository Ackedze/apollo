import type { CompiledContract, PreviewSnapshot, VariantEvidence } from './types';
import { stableHash } from './stable';
import { matchesCaptureRepresentation } from './capture-representation';
import { resolveComponentProperty } from './component-property-identity';
import { snapshotShape, snapshotPaths } from './snapshot-topology';
import { catalogOccurrencePaths, diagnosticStructure } from './occurrence-address';
import { declaredRootAliasRoles } from './root-target';
import { publicSwapSlots, projectPublicSwapStructure, projectPublicSwapNames } from './public-swap-reference';
import { compareInstanceBoundaries, correspondingPath, isolateInstanceBoundaries, withinBoundary, type InstanceBoundary } from './instance-boundaries';
export { snapshotShape } from './snapshot-topology';

const record = (x: unknown): Record<string, any> => x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, any> : {};
export const relativeTargetPath = (path: string): string => path.split(' / ').slice(1).join(' / ');
export const propertyAvailabilityKey = (name: string): string => `p_${stableHash(name).slice(0, 16)}`;
const normalizedType = (type: string, path: string): string => path === '' ? 'ROOT' : type;
const ordered = (nodes: Array<{ path: string; type: string }>) => nodes.slice().sort((a, b) => a.path.localeCompare(b.path) || a.type.localeCompare(b.type));

/** Compile Athena structure + variant patches, never infer anatomy from property names. */
export function extractVariantEvidence(candidates: Record<string, unknown>[], includeTextBindings = false): VariantEvidence | undefined {
  const structures: VariantEvidence['structures'] = {};
  const variants: VariantEvidence['variants'] = [];
  const libraryText: NonNullable<VariantEvidence['libraryText']> = [];
  const textBindings: NonNullable<VariantEvidence['textBindings']> = [];
  const occurrences: NonNullable<VariantEvidence['occurrences']> = [];
  let occurrenceAddresses = false;
  for (const candidate of candidates) {
    const f = record(candidate.figma);
    if (!Array.isArray(f.structureSignature) || !Array.isArray(f.variants?.variantKeys)) continue;
    const base = f.structureSignature;
    for (const variant of f.variants.variantKeys) {
      const patches = variant.key === f.defaultVariantKey ? [] : f.variantStructures?.[variant.key];
      if (!Array.isArray(patches)) continue;
      const tree = new Map<string, Record<string, any>>(base.map((node: any) => [String(node.nodeId), { ...node }]));
      let valid = tree.size === base.length;
      for (const patch of patches) {
        const id = String(patch.id);
        if (patch.op === 'remove') { if (!tree.delete(id)) valid = false; }
        else if (patch.op === 'update' && tree.has(id)) tree.set(id, { ...tree.get(id), ...patch.value });
        else if (patch.op === 'add' && !tree.has(id) && patch.value) tree.set(id, { ...patch.value, nodeId: patch.id });
        else valid = false;
      }
      // Derive paths from parent relationships: variant patches do not always update path strings.
      const paths = catalogOccurrencePaths(tree);
      const pathFor = (id:string) => paths?.get(id);
      const nodes = [...tree].map(([id, node]) => ({ path: pathFor(id), type: node.type }));
      if (!valid || nodes.some(n => n.path === undefined || !n.type) || nodes.filter(n => n.path === '').length !== 1
        || new Set(nodes.map(n => n.path)).size !== nodes.length || !variant.key || !candidate.componentKey) continue;
      const shape = ordered(nodes.map(n => ({ path: n.path!, type: normalizedType(n.type, n.path!) })));
      const structureId = stableHash(shape);
      structures[structureId] = shape;
      variants.push({ componentKey: variant.key, componentSetKey: String(candidate.componentKey), structureId, properties: variant.properties || {} });
      occurrences.push({componentKey:variant.key,componentSetKey:String(candidate.componentKey),
        namesByPath:Object.fromEntries([...tree].map(([id,n])=>[pathFor(id)!,String(n.name)]))});
      occurrenceAddresses ||= shape.some(n=>n.path.split(' / ').some(p=>p.startsWith('@')));
      if (includeTextBindings) textBindings.push({componentKey:variant.key, componentSetKey:String(candidate.componentKey),
        styleKeysByPath:Object.fromEntries([...tree].filter(([,n]) => n.type === 'TEXT' && typeof n.styles?.text?.styleKey === 'string')
          .map(([id,n]) => [pathFor(id)!, n.styles.text.styleKey]))});
      const characters = Object.fromEntries([...tree].filter(([, n]) => n.type === 'TEXT' && typeof n.text?.characters === 'string')
        .map(([id,n]) => [pathFor(id)!, n.text.characters]));
      if (Object.keys(characters).length) libraryText.push({ componentKey: variant.key, componentSetKey: String(candidate.componentKey),
        properties: variant.properties || {}, structure: shape, characters });
    }
  }
  if (!variants.length) return undefined;
  return { schemaVersion: 'apollo.variant-anatomy.v1', sourceHash: stableHash(candidates), structures, variants,
    ...(occurrenceAddresses?{occurrenceAddressVersion:1 as const,occurrences}:{}),
    ...(libraryText.length ? { libraryText } : {}), ...(includeTextBindings ? {textBindings} : {}) };
}

export function captureVariantReference(snapshot: PreviewSnapshot, componentKey: string, componentSetKey: string, definedProperties?: string[]): NonNullable<PreviewSnapshot['variantReference']> {
  const shape = snapshotShape(snapshot);
  const paths = snapshotPaths(snapshot);
  const root = snapshot.nodes.find(n => snapshot.selection.includes(String(n.id)));
  const component = record(root?.component);
  const referencesKnown = snapshot.nodes.every(n => Array.isArray(record(n.component).propertyReferences));
  const byId = new Map(snapshot.nodes.map(n => [String(n.id), n]));
  const consumers = new Map<string, Set<string>>();
  for (const node of snapshot.nodes) {
    let parent = byId.get(String(node.parentId));
    const visited = new Set<string>();
    while (parent && !visited.has(String(parent.id))) {
      visited.add(String(parent.id));
      if (parent.type === 'INSTANCE') {
        const names = consumers.get(String(parent.id)) || new Set<string>();
        (record(node.component).propertyReferences || []).forEach((name: string) => names.add(name));
        consumers.set(String(parent.id), names);
        break;
      }
      parent = byId.get(String(parent.parentId));
    }
  }
  const nodeProperties: NonNullable<PreviewSnapshot['variantReference']>['nodeProperties'] = {};
  for (const node of snapshot.nodes) {
    const component = record(node.component);
    const path = paths?.get(String(node.id)) ?? (node === root ? '' : relativeTargetPath(String(record(node.semantic).path || '')));
    nodeProperties[path] = { properties: component.properties || {}, propertyTypes: component.propertyTypes || {},
      propertyReferences: [...(consumers.get(String(node.id)) || [])],
      ...(snapshot.source?.occurrenceAddressVersion===1?{diagnosticName:String(node.name)}:{}),
      ...(component.identity?.componentKey ? {identity:component.identity} : {}),
      ...(component.propertyReferenceBindings ? {propertyReferenceBindings:component.propertyReferenceBindings} : {}),
      ...(node === root && definedProperties ? { definedProperties } : {}) };
    if (snapshot.source?.instanceSourceIdentityVersion === 1 && component.sourceIdentity) nodeProperties[path].sourceIdentity = component.sourceIdentity;
  }
  return { componentKey, componentSetKey, complete: Boolean(shape && referencesKnown), nodes: shape || [],
    ...(snapshot.source?.occurrenceAddressVersion===1?{occurrenceAddressVersion:1 as const}:{}),
    properties: component.properties || {}, propertyTypes: component.propertyTypes || {},
    propertyReferences: [...(consumers.get(String(root?.id)) || [])], nodeProperties,
    ...(definedProperties ? { definedProperties } : {}) };
}

export type VariantAvailability = {
  status: 'verified' | 'partial' | 'unknown'; reason: string;
  targets: Record<string, { state: 'present' | 'absent' | 'unknown'; path?: string }>;
  boundaries?: InstanceBoundary[];
};

export function variantAvailability(snapshot: PreviewSnapshot, contract: CompiledContract): VariantAvailability {
  const unknown = (reason: string): VariantAvailability => ({ status: 'unknown', reason, targets: {} });
  const evidence = contract.facts.variantEvidence, ref = snapshot.variantReference;
  if (!evidence || !ref?.complete || !ref.nodeProperties || typeof ref.nodeProperties !== 'object'
    || Array.isArray(ref.nodeProperties) || !snapshotShape(snapshot)) return unknown('incomplete-variant-evidence');
  if (ref.componentKey !== snapshot.source?.componentKey || ref.componentSetKey !== (snapshot.source?.componentSetKey ?? '')) return unknown('reference-identity-mismatch');
  // Athena v1 groups a standalone component under its own key. That is an
  // evidence grouping key, not a real Figma Component Set. Adapt only when the
  // captured component has no set and both generated keys equal that exact key.
  // Never rewrite capture facts or treat a missing set of a variant as standalone.
  const variants = evidence.variants.filter(v => v.componentKey === ref.componentKey
    && (v.componentSetKey === ref.componentSetKey
      || (ref.componentSetKey === '' && v.componentSetKey === v.componentKey)));
  if (variants.length !== 1) return unknown('variant-key-unresolved');
  const variant = variants[0], shape = evidence.structures[variant.structureId];
  const externalSlots = contract.runtimePolicy?.declaredTargetConfigurationVersion === 2
    ? publicSwapSlots(ref, {targets: contract.facts.targets, policies: contract.customizationPolicy, representations: contract.facts.representations}) : [];
  const occurrenceMode=evidence.occurrenceAddressVersion===1;
  if(occurrenceMode && contract.runtimePolicy?.occurrenceAddressVersion!==1)return unknown('occurrence-policy-version-unavailable');
  if(occurrenceMode && ref.occurrenceAddressVersion!==1)return unknown('occurrence-reference-version-unavailable');
  if(occurrenceMode){
    const catalogs=evidence.occurrences?.filter(o=>o.componentKey===variant.componentKey && o.componentSetKey===variant.componentSetKey) || [];
    const expected=shape && catalogs.length===1 ? diagnosticStructure(projectPublicSwapStructure(shape,externalSlots,true),projectPublicSwapNames(catalogs[0].namesByPath,externalSlots,true)) : undefined;
    const observed=diagnosticStructure(projectPublicSwapStructure(ref.nodes,externalSlots),projectPublicSwapNames(Object.fromEntries(Object.entries(ref.nodeProperties).map(([p,n])=>[p,n.diagnosticName!])),externalSlots));
    if(expected===undefined || observed===undefined || stableHash(expected)!==stableHash(observed))return unknown('reference-catalog-structure-drift');
  } else if (!shape || (externalSlots.length
    ? stableHash(projectPublicSwapStructure(ref.nodes,externalSlots)) !== stableHash(projectPublicSwapStructure(shape,externalSlots,true))
    : stableHash(ordered(ref.nodes)) !== stableHash(shape))) return unknown('reference-catalog-structure-drift');
  const scoped = ['variant-facts-v4','dependency-facts-v5'].includes(contract.package.snapshotProfile || '');
  const comparison = scoped ? compareInstanceBoundaries(snapshot,ref) : undefined;
  if(occurrenceMode && comparison?.referencePaths?.['']!=='')return unknown('root-correspondence-unavailable');
  if (scoped ? !comparison?.complete && !occurrenceMode : stableHash(snapshotShape(snapshot)) !== stableHash(shape)) return unknown('instance-structure-needs-remap');
  const root = snapshot.nodes.find(n => snapshot.selection.includes(String(n.id)));
  // Athena represents a standalone component as a one-entry pseudo variant
  // {raw: componentName}. `raw` is grouping metadata, not a Figma property.
  const standaloneRaw = ref.componentSetKey === '' && variant.componentSetKey === variant.componentKey
    && Object.keys(variant.properties).length === 1 && typeof variant.properties.raw === 'string'
    && !Object.prototype.hasOwnProperty.call(ref.propertyTypes, 'raw')
    && !Object.prototype.hasOwnProperty.call(record(record(root?.component).propertyTypes), 'raw');
  if (Object.entries(variant.properties).some(([key, value]) => !(standaloneRaw && key === 'raw')
    && (record(record(root?.component).properties)[key] !== value || ref.properties[key] !== value))) return unknown('variant-properties-mismatch');
  const reps = contract.facts.representations.filter(r => r.platform === snapshot.context.platform
    && matchesCaptureRepresentation(r, ref.componentKey, ref.componentSetKey));
  if (reps.length !== 1) return unknown('representation-unresolved');
  const targets: VariantAvailability['targets'] = {};
  const siblings = evidence.variants.filter(v => v.componentSetKey === variant.componentSetKey);
  for (const target of contract.facts.targets) {
    const bindings=target.variantHints?.filter(h=>h.representationId===reps[0].id && h.componentKey===ref.componentKey) || [];
    const defaultHint = target.representationHints?.find(h => h.representationId === reps[0].id)?.pathHint || target.pathHint;
    const hint=bindings.length===1 ? bindings[0].pathHint : bindings.length>1 ? undefined : defaultHint;
    const path = hint ? relativeTargetPath(hint) : undefined;
    // A typo/renamed/unmapped target must not become a confirmed absence.
    const witnessed = occurrenceMode ? path!==undefined && (path==='' || bindings.length===1)
      && ref.nodes.some(n=>n.path===path) && Boolean(comparison?.referencePaths && Object.values(comparison.referencePaths).includes(path))
      : path !== undefined && siblings.some(v => evidence.structures[v.structureId]?.some(n => n.path === path));
    const isolated = path !== undefined && comparison?.boundaries.some(b => withinBoundary(path,b.referencePath) || withinBoundary(path,b.actualPath));
    targets[target.semanticRole] = !witnessed || isolated || target.resolution === 'ambiguous' || target.resolution === 'unknown'
      ? { state: 'unknown' } : { state: (occurrenceMode?ref.nodes:shape).some(n => n.path === path) ? 'present' : 'absent', path };
  }
  const aliases = contract.runtimePolicy?.rootTargetAliasesVersion === 1 ? declaredRootAliasRoles(contract.facts.targets) : new Set<string>();
  for (const target of Object.values(targets)) {
    const collisions = Object.entries(targets).filter(([,t]) => t.path === target.path);
    if (target.path !== undefined && collisions.length > 1
      && !(target.path === '' && collisions.every(([role]) => aliases.has(role)))) target.state = 'unknown';
  }
  return { status: comparison?.boundaries.length || occurrenceMode && !comparison?.complete ? 'partial' : 'verified',
    reason: occurrenceMode && !comparison?.complete ? 'occurrence-correspondence-incomplete'
      : comparison?.boundaries.length ? 'verified-outside-instance-boundaries' : 'catalog-and-live-reference-agree', targets,
    ...(scoped ? {boundaries:comparison!.boundaries} : {}) };
}

/** Factual availability only. Verdicts remain owned by Predicate Engine. */
export function materializeVariantFacts(snapshot: PreviewSnapshot, contract: CompiledContract): void {
  snapshot.nodes.forEach(node => { delete node.rootTargetAliasesV1; });
  const availability = variantAvailability(snapshot, contract);
  const scoped = ['variant-facts-v4','dependency-facts-v5'].includes(contract.package.snapshotProfile || '');
  if (scoped) {
    delete snapshot.instanceBoundaries;
    isolateInstanceBoundaries(snapshot, availability.boundaries || []);
  }
  const ref = snapshot.variantReference;
  const root = snapshot.nodes.find(n => snapshot.selection.includes(String(n.id)));
  if (contract.runtimePolicy.rootTargetAliasesVersion === 1 && availability.status !== 'unknown' && root && ref) {
    const identity = record(record(root.component).identity), expected = ref.nodeProperties['']?.identity;
    const missingIdentity = ((root.unknownFacts || []) as string[]).some(p => p === 'component' || p === 'component.identity' || p.startsWith('component.identity.'));
    if (expected && !missingIdentity && typeof identity.mainComponentId === 'string' && identity.mainComponentId.length > 0 && identity.componentKey === expected.componentKey
      && identity.mainComponentId === expected.mainComponentId && (identity.componentSetKey || '') === (expected.componentSetKey || '')) {
      const roles = [...declaredRootAliasRoles(contract.facts.targets)].filter(role => availability.targets[role]?.state === 'present' && availability.targets[role].path === '');
      for (const node of snapshot.nodes) node.rootTargetAliasesV1 = Object.fromEntries(roles.map(role => [role, node === root]));
    }
  }
  const rootPath = record(root?.semantic).path;
  const byPath = new Map<string, Record<string, unknown>[]>();
  const structuralPaths = scoped ? snapshotPaths(snapshot) : undefined;
  const correspondence = snapshot.source?.instanceIdentityVersion === 1 && ref ? compareInstanceBoundaries(snapshot, ref) : undefined;
  for (const node of snapshot.nodes) {
    const path = structuralPaths?.get(String(node.id)) ?? (node === root ? '' : relativeTargetPath(String(record(node.semantic).path || '')));
    if (node !== root && !record(node.semantic).path?.startsWith(`${rootPath} / `)) continue;
    const referencePath = correspondingPath(correspondence, path);
    if (referencePath !== undefined) byPath.set(referencePath, [...(byPath.get(referencePath) || []), node]);
  }
  const targetFacts: Record<string, Record<string, unknown>> = {};
  const properties: Record<string, boolean> = {};
  const propertyAvailable = (name: string, data: NonNullable<PreviewSnapshot['variantReference']>['nodeProperties'][string]): boolean | undefined => {
    const resolved = resolveComponentProperty(name, data);
    if (!('name' in resolved)) return undefined;
    name = resolved.name;
    const type = data.propertyTypes[name];
    if (type === 'VARIANT') return true;
    if (['BOOLEAN', 'TEXT', 'INSTANCE_SWAP'].includes(String(type))) return data.propertyReferences.includes(name);
    // Unknown/stale property ID is not proof of variant-specific unavailability.
    if (!Object.prototype.hasOwnProperty.call(data.properties, name) && data.definedProperties?.includes(name)) return false;
    return undefined;
  };
  for (const [role, target] of Object.entries(availability.targets)) {
    if (target.state === 'unknown' || target.path === undefined) continue;
    const actual = byPath.get(target.path) || [];
    if (actual.length === 1) {
      record(actual[0].semantic).role = role;
      targetFacts[role] = { present: true, referenceState: target.state };
    } else if (actual.length === 0 && target.state === 'absent') targetFacts[role] = { present: false, referenceState: 'absent' };
    // Present in reference, absent in actual: unresolved structural deviation, not non-applicability.
  }
  if (availability.status !== 'unknown' && ref) {
    const reps = contract.facts.representations.filter(r => r.platform === snapshot.context.platform
      && matchesCaptureRepresentation(r, ref.componentKey, ref.componentSetKey));
    for (const property of contract.facts.semanticApi) {
      const surfaceBindings = property.bindings.filter(b => b.representationId === reps[0]?.id && b.path === 'representation.surface' && b.transform === 'identity');
      if (reps.length === 1 && surfaceBindings.length === 1
        && record(record(root?.semanticBindingEvidence)[property.id]).reason === 'resolved') {
        properties[property.id] = true;
      }
      const bindings = property.bindings.filter(b => b.representationId === reps[0]?.id && b.path.startsWith('component.properties.'));
      if (bindings.length !== 1) continue;
      const name = bindings[0].path.slice('component.properties.'.length);
      // Explicit properties may survive in the family API but have no consumer in this variant.
      const supported = propertyAvailable(name, ref);
      if (supported !== undefined) properties[property.id] = supported;
    }
  }
  for (const node of snapshot.nodes) {
    const componentProperties: Record<string, boolean> = {};
    const path = structuralPaths?.get(String(node.id)) ?? (node === root ? '' : relativeTargetPath(String(record(node.semantic).path || '')));
    const isolated = availability.boundaries?.some(b => withinBoundary(path,b.actualPath));
    const referencePath = correspondingPath(correspondence, path);
    const reference = availability.status !== 'unknown' && !isolated && referencePath !== undefined ? ref?.nodeProperties?.[referencePath] : undefined;
    if (reference) {
      const names = new Set([...Object.keys(reference.properties), ...contract.capabilities.facts
        .filter(f => f.startsWith('component.properties.')).map(f => f.slice('component.properties.'.length))]);
      for (const name of names) {
        const supported = propertyAvailable(name, reference);
        if (supported !== undefined) componentProperties[propertyAvailabilityKey(name)] = supported;
      }
    }
    node.variantAvailability = { ...availability, targets: targetFacts, properties, componentProperties, isRoot: node === root };
    const unknown = new Set(((node.unknownFacts || []) as string[]).filter(p => !p.startsWith('variantAvailability.')));
    for (const target of contract.facts.targets) {
      if (targetFacts[target.semanticRole]?.present === undefined) unknown.add(`variantAvailability.targets.${target.semanticRole}.present`);
    }
    for (const property of contract.facts.semanticApi) {
      if (properties[property.id] === undefined) unknown.add(`variantAvailability.properties.${property.id}`);
    }
    for (const fact of contract.capabilities.facts.filter(f => f.startsWith('variantAvailability.componentProperties.'))) {
      if (componentProperties[fact.slice('variantAvailability.componentProperties.'.length)] === undefined) unknown.add(fact);
    }
    node.unknownFacts = [...unknown];
  }
}

/** Restore only a boundary root whose same-family variant and independent host
 * reference have just been verified. Descendants keep isolated semantic roles;
 * target identity is not permission and does not replace the baseline validator. */
export function materializeVerifiedVariantTargets(snapshot: PreviewSnapshot, contract: CompiledContract): void {
  if (contract.runtimePolicy.semanticTargetVisibilityVersion !== 1
    || !['variant-facts-v4', 'dependency-facts-v5'].includes(contract.package.snapshotProfile || '')
    || snapshot.instanceContentReferences?.schemaVersion !== 'apollo.instance-content-references.v4') return;
  const ref = snapshot.variantReference, paths = snapshotPaths(snapshot);
  if (!ref || !paths) return;
  const comparison = compareInstanceBoundaries(snapshot, ref);
  if (!comparison.complete || !comparison.boundaries.some(b => b.reason === 'component-variant-changed')) return;
  const availability = variantAvailability(snapshot, contract);
  if (availability.status !== 'partial') return;
  const reps = contract.facts.representations.filter(r => r.platform === snapshot.context.platform
    && matchesCaptureRepresentation(r, ref.componentKey, ref.componentSetKey));
  if (reps.length !== 1) return;
  const candidates: Array<{ role: string; node: PreviewSnapshot['nodes'][number] }> = [];
  for (const target of contract.facts.targets) {
    if (target.resolution !== 'resolved') continue;
    const hints = target.representationHints?.filter(h => h.representationId === reps[0].id) || [];
    if (hints.length > 1) continue;
    const variantHints=contract.runtimePolicy.assetIdentityLockVersion===1
      ? target.variantHints?.filter(h=>h.representationId===reps[0].id&&h.componentKey===ref.componentKey) || [] : [];
    if(variantHints.length>1)continue;
    const hint = variantHints[0]?.pathHint || hints[0]?.pathHint || target.pathHint;
    if (!hint) continue;
    const path = relativeTargetPath(hint);
    const boundaries = comparison.boundaries.filter(b => b.referencePath === path && b.reason === 'component-variant-changed');
    if (boundaries.length !== 1) continue;
    const boundary = boundaries[0];
    const results = snapshot.instanceContentResults?.filter(r => r.boundaryNodeId === boundary.nodeId) || [];
    if (results.length !== 1 || !results[0].lineageProven
      || !(results[0].status === 'matched' || contract.runtimePolicy.assetIdentityLockVersion === 1 && results[0].status === 'partial')
      || !results[0].matchedNodeIds.includes(boundary.nodeId)) continue;
    const nodes = snapshot.nodes.filter(n => n.id === boundary.nodeId && paths.get(String(n.id)) === boundary.actualPath);
    if (nodes.length !== 1 || nodes[0].type !== 'INSTANCE') continue;
    const node = nodes[0], provenance = record(node.baselineProvenance);
    if (provenance.status !== 'matched' || provenance.kind !== 'independent-host-variant'
      || provenance.boundaryNodeId !== boundary.nodeId || provenance.componentKey !== boundary.actualComponentKey) continue;
    candidates.push({ role: target.semanticRole, node });
  }
  for (const { role, node } of candidates) {
    if (contract.facts.targets.filter(t => t.semanticRole === role).length !== 1
      || candidates.filter(c => c.node.id === node.id).length !== 1
      || snapshot.nodes.some(n => n !== node && record(n.semantic).role === role)) continue;
    record(node.semantic).role = role;
    node.unknownFacts = ((node.unknownFacts || []) as string[]).filter(p => p !== 'semantic.role');
    for (const entry of snapshot.nodes) {
      const facts = record(entry.variantAvailability);
      facts.targets = { ...record(facts.targets), [role]: { present: true, referenceState: 'present', evidence: 'independent-host-variant-root' } };
      entry.variantAvailability = facts;
      entry.unknownFacts = ((entry.unknownFacts || []) as string[]).filter(p => p !== `variantAvailability.targets.${role}.present`);
    }
  }
}
