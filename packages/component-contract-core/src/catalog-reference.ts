import { sha256Hex } from '../vendor/sha256';
import { stableHash, slug } from './stable';
import { captureVariantReference } from './variant-facts';
import { snapshotPaths } from './snapshot-topology';
import { materializeEffectiveBaseline } from './instance-validation';
import { matchesCaptureRepresentation } from './capture-representation';
import type { CompiledContract, PreviewSnapshot } from './types';
import type { PreparedSourceTopology } from './prepared-source-identity';

type Path = Array<string | number>;
type ResourceKind = 'style' | 'variable' | 'collection' | 'component';
export type CatalogResourceRequirement = { kind: ResourceKind; sourceId: string; sourceKey: string; paths: Path[]; keyPaths: Path[] };
export type CatalogResourceWitness = { kind: ResourceKind; sourceId: string; sourceKey: string; consumerId: string; consumerKey: string;
  consumerModes?: Array<{ modeId: string; name: string }> };
export type CatalogReferenceRequest = { releaseId: string; selection: {
  contractId: string; componentId: string; revision: number; representationId: string; componentKey: string;
  variantKey?: string; config?: Record<string, unknown>; modes?: Record<string, string>; hostContext?: Record<string, unknown>;
} };
export type PreparedCatalogReference = {
  snapshot: PreviewSnapshot;
  variantReference: NonNullable<PreviewSnapshot['variantReference']>;
  preparedSourceTopology: PreparedSourceTopology;
  resourceRequirements: CatalogResourceRequirement[];
  referenceHash: string;
  configuration: CatalogReferenceRequest['selection'];
  definedProperties: string[];
  sourceCollections: Record<string, any>;
  modePaths: Array<{ path: Path; collectionId: string }>;
};
const record = (v: any): v is Record<string, any> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const text = (v: any): v is string => typeof v === 'string' && v.length > 0;
const key = (v: any): v is string => typeof v === 'string' && /^[a-f0-9]{40}$/i.test(v);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
function fail(code: string, details?: unknown): never { throw Object.assign(Error(code), { code, details }); }
function at(value: any, path: Path): any { return path.reduce((v, p) => v?.[p], value); }
const prefix = (id: string) => (id.startsWith('I') ? id : 'I' + id) + ';';
const overlaps = (a: string, b: string) => a === b || a.startsWith(b + '.') || b.startsWith(a + '.');
// Export diagnostics retain native API names; Core consumes normalized fact paths.
function normalizedUnavailable(path: string): string[] {
  const native: Record<string, string[]> = {
    fills: ['appearance.fill'], strokes: ['appearance.stroke'], effects: ['appearance.effects', 'appearance.effectDetailsV1'],
    textStyleId: ['appearance.typography.styleId'], cornerRadius: ['appearance.radius'],
    topLeftRadius: ['appearance.radius'], topRightRadius: ['appearance.radius'], bottomRightRadius: ['appearance.radius'], bottomLeftRadius: ['appearance.radius'],
    layoutMode: ['layout.mode'], layoutSizingHorizontal: ['layout.sizingHorizontal'], layoutSizingVertical: ['layout.sizingVertical'],
    paddingTop: ['layout.padding'], paddingRight: ['layout.padding'], paddingBottom: ['layout.padding'], paddingLeft: ['layout.padding'],
    primaryAxisAlignItems: ['layout.primaryAxisAlignItems'], counterAxisAlignItems: ['layout.counterAxisAlignItems'], itemSpacing: ['layout.itemSpacing'],
    gridStyleId: ['layout.gridStyleId'], clipsContent: ['layout.clipsContent'],
    boundVariables: ['variable.bindings'], resolvedVariableModes: ['resolvedModes', 'variable.modes'], explicitVariableModes: ['explicitModes'],
    componentPropertyReferences: ['component.propertyReferences', 'component.propertyReferenceBindings'],
    x: ['bounds.x'], y: ['bounds.y'], width: ['bounds.width'], height: ['bounds.height'], visible: ['visible'],
  };
  if (path === 'text.textCase') return ['text.case'];
  if (!path.startsWith('native.')) return [path];
  const field = path.slice(7);
  return native[field] || (['fillStyleId', 'strokeStyleId', 'effectStyleId', 'strokeWeight', 'strokeAlign', 'dashPattern', 'opacity', 'blendMode'].includes(field)
    ? ['appearance.' + field] : [path]);
}

/** Read the independently assembled source tree; legacy raw presentation fields are never native evidence. */
export function buildCatalogReference(response: any, contract: CompiledContract, expected: CatalogReferenceRequest): PreparedCatalogReference {
  if (!record(response) || response.success !== true || response.schemaVersion !== 'apollo.catalog-reference.v1'
    || !/^[a-f0-9]{64}$/.test(response.referenceHash)) fail('CATALOG_RESPONSE_INVALID');
  const unsigned = Object.assign({}, response); delete unsigned.referenceHash;
  if (sha256Hex(JSON.stringify(unsigned)) !== response.referenceHash) fail('CATALOG_REFERENCE_HASH_MISMATCH');
  const s = expected.selection;
  if (!/^[a-f0-9]{64}$/.test(expected.releaseId) || response.releaseId !== expected.releaseId
    || stableHash(response.selection) !== stableHash(s)) fail('CATALOG_REQUEST_MISMATCH');
  if (response.contract?.id !== contract.package.id || response.contract?.componentId !== contract.package.componentId
    || response.contract?.manualSourceHash !== contract.package.manualSourceHash || response.contract?.revision !== s.revision
    || contract.package.manualRevision !== undefined && contract.package.manualRevision !== s.revision
    || s.contractId !== contract.package.id || s.componentId !== contract.package.componentId) fail('CATALOG_CONTRACT_MISMATCH');
  const reps = contract.facts.representations.filter(r => r.id === s.representationId && r.kind === 'figma' && r.status !== 'deprecated');
  if (reps.length !== 1) fail('CATALOG_REPRESENTATION_MISMATCH');
  const rep = reps[0], rootKey = rep.locator.componentSetKey || rep.locator.componentKey;
  if (response.component?.key !== rootKey || !key(s.componentKey)
    || response.variant && response.variant.key !== s.componentKey || s.variantKey && response.variant?.key !== s.variantKey
    || !response.variant && s.componentKey !== rootKey) fail('CATALOG_COMPONENT_MISMATCH');
  if (!/^[a-f0-9]{64}$/.test(response.provenance?.catalog?.sha256)
    || !/^[a-f0-9]{64}$/.test(response.provenance?.contract?.sha256)
    || response.completeness?.structure !== 'assembled' || !Array.isArray(response.completeness.issues)
    || response.completeness.issues.length || !Array.isArray(response.structure) || !response.structure.length) fail('CATALOG_SOURCE_INCOMPLETE');
  if (s.hostContext && Object.keys(s.hostContext).length) fail('CATALOG_HOST_CONTEXT_UNSUPPORTED');
  const rawById = new Map<any, any>(), bySource = new Map<string, any>();
  const resources: Record<ResourceKind, Record<string, any>> = { style: {}, variable: {}, collection: {}, component: {} };
  for (const row of response.structure) {
    const n = row?.nativeAuditFactsV1;
    if (!record(row) || typeof row.name !== 'string' || rawById.has(row.id) || !record(n) || n.schemaVersion !== 'athena.native-audit-facts.v1'
      || !text(n.sourceNodeId) || bySource.has(n.sourceNodeId) || n.nodeType !== row.type || !record(n.facts)
      || !Array.isArray(n.sourceChildIds) || new Set(n.sourceChildIds).size !== n.sourceChildIds.length
      || n.sourceChildIds.some((id: any) => !text(id)) || n.sourceParentId !== null && !text(n.sourceParentId)
      || !Array.isArray(n.unavailable) || n.unavailable.some((p: any) => !text(p))) fail('CATALOG_NATIVE_FACTS_UNAVAILABLE');
    if (n.unavailable.some((p: string) => p === 'source.topology' || normalizedUnavailable(p).some(q => overlaps(q, 'component.propertyReferences')))) fail('CATALOG_NATIVE_FACTS_UNAVAILABLE');
    for (const name of ['layout', 'appearance', 'text', 'component', 'variable', 'propertyActivityV1']) {
      if (!record(n.facts[name])) fail('CATALOG_NATIVE_FACTS_UNAVAILABLE', { nodeId: n.sourceNodeId, fact: name });
    }
    if (typeof n.facts.visible !== 'boolean' || !Array.isArray(n.facts.component.propertyReferences)) fail('CATALOG_NATIVE_FACTS_UNAVAILABLE');
    for (const [kind, group] of [['style', 'styles'], ['variable', 'variables'], ['collection', 'collections'], ['component', 'components']] as const) {
      if (kind === 'component' && n.resources?.[group] === undefined) continue;
      if (!record(n.resources?.[group])) fail('CATALOG_RESOURCE_PROFILE_UNAVAILABLE');
      for (const [id, resource] of Object.entries(n.resources[group]) as Array<[string, any]>) {
        if (!record(resource) || resource.id !== id || !key(resource.key)
          || resources[kind][id] && stableHash(resources[kind][id]) !== stableHash(resource)) fail('CATALOG_RESOURCE_IDENTITY_MISMATCH');
        resources[kind][id] = clone(resource);
      }
    }
    const identity = n.facts.component.identity;
    if (identity?.mainComponentId && identity?.componentKey) {
      if (!text(identity.mainComponentId) || !key(identity.componentKey)
        || resources.component[identity.mainComponentId] && resources.component[identity.mainComponentId].key !== identity.componentKey) fail('CATALOG_RESOURCE_IDENTITY_MISMATCH');
      resources.component[identity.mainComponentId] = { id: identity.mainComponentId, key: identity.componentKey };
    }
    rawById.set(row.id, row); bySource.set(n.sourceNodeId, row);
  }
  const roots = response.structure.filter((r: any) => r.parentId === null);
  if (roots.length !== 1 || roots[0].type !== 'COMPONENT') fail('CATALOG_SOURCE_ROOT_INVALID');
  const root = roots[0], rootFacts = root.nativeAuditFactsV1.facts;
  const setKey = rootFacts.component.identity?.componentSetKey || '';
  if (rootFacts.component.identity?.componentKey !== s.componentKey || rootFacts.component.identity?.mainComponentId !== root.nativeAuditFactsV1.sourceNodeId
    || root.nativeAuditFactsV1.unavailable.some((p: string) => overlaps(p, 'component.identity') || overlaps(p, 'component.properties') || overlaps(p, 'component.propertyTypes'))
    || rootFacts.component.configurationValuesKind !== 'source-defaults'
    || !record(rootFacts.component.properties) || !record(rootFacts.component.propertyTypes)
    || !Array.isArray(rootFacts.component.definedProperties)) fail('CATALOG_SOURCE_CONFIGURATION_UNPROVEN');
  if (setKey && !key(setKey) || !matchesCaptureRepresentation(rep, s.componentKey, setKey)) fail('CATALOG_REPRESENTATION_MISMATCH');
  const ordered: any[] = [], visited = new Set<string>();
  function visit(row: any) {
    const n = row.nativeAuditFactsV1;
    if (visited.has(n.sourceNodeId)) fail('CATALOG_SOURCE_TOPOLOGY_INVALID');
    visited.add(n.sourceNodeId); ordered.push(row);
    for (const id of n.sourceChildIds) {
      const child = bySource.get(id);
      if (!child || child.parentId !== row.id || child.nativeAuditFactsV1.sourceParentId !== n.sourceNodeId) fail('CATALOG_SOURCE_TOPOLOGY_INVALID');
      visit(child);
    }
  }
  visit(root);
  if (visited.size !== response.structure.length) fail('CATALOG_SOURCE_TOPOLOGY_INVALID');
  const preparedSourceTopology: PreparedSourceTopology = { componentKey: s.componentKey, rootNodeId: root.nativeAuditFactsV1.sourceNodeId,
    nodes: ordered.map(row => { const n = row.nativeAuditFactsV1; return { sourceNodeId: n.sourceNodeId, sourceParentId: n.sourceParentId,
      sourceChildIds: n.sourceChildIds.slice(), nodeType: n.nodeType, ...(n.facts.component.identity?.componentKey ? { componentKey: n.facts.component.identity.componentKey } : {}) }; }) };
  const ids = new Map(ordered.map((row, i) => [row.nativeAuditFactsV1.sourceNodeId, 'preview:' + i]));
  const roles = new Map<string, number>(), diagnosticPaths = new Map<string, string>();
  const nodes = ordered.map((row, i) => {
    const n = row.nativeAuditFactsV1, f = clone(n.facts), id = n.sourceNodeId;
    const role = slug(row.name), count = (roles.get(role) || 0) + 1; roles.set(role, count);
    const parent = i === 0 ? undefined : bySource.get(n.sourceParentId);
    const path = parent ? diagnosticPaths.get(n.sourceParentId) + ' / ' + row.name : row.name; diagnosticPaths.set(id, path);
    let owner = parent;
    while (owner && !['COMPONENT', 'INSTANCE'].includes(owner.type)) owner = bySource.get(owner.nativeAuditFactsV1.sourceParentId);
    if (owner) {
      const identity = owner.nativeAuditFactsV1.facts.component.identity, p = prefix(owner.nativeAuditFactsV1.sourceNodeId);
      const suffix = owner === root ? id : id.startsWith(p) ? id.slice(p.length) : '';
      if (suffix && key(identity?.componentKey) && text(identity?.mainComponentId)) f.component.sourceIdentity = {
        version: 1, ownerComponentKey: identity.componentKey, ownerMainComponentId: identity.mainComponentId, sourceNodeId: suffix };
    }
    return Object.assign(f, { id: ids.get(id), parentId: i === 0 ? null : ids.get(n.sourceParentId), childIds: n.sourceChildIds.map((child: string) => ids.get(child)),
      name: row.name, type: i === 0 ? 'INSTANCE' : row.type, order: i, semantic: { role: count === 1 ? role : role + '-' + count, path },
      unknownFacts: Array.from(new Set<string>((n.unavailable as string[]).concat(n.unavailable.flatMap(normalizedUnavailable)))) });
  });
  const snapshot: PreviewSnapshot = { schemaVersion: 'apollo.predicate-snapshot.v2', generatedAt: contract.package.sourceGeneratedAt,
    selection: ['preview:0'], context: { platform: rep.platform, modes: clone(rootFacts.resolvedModes || {}), unknownFacts: [] }, nodes,
    source: { fileKey: response.provenance.source?.fileKey, fileName: response.provenance.source?.fileName || response.provenance.catalog.file,
      pageId: String(response.provenance.source?.pageId || 'catalog-source'), rootNodeId: root.nativeAuditFactsV1.sourceNodeId,
      componentKey: s.componentKey, componentSetKey: setKey, representationId: rep.id, truncated: false, nodeLimit: nodes.length,
      instanceIdentityVersion: 1, instanceSourceIdentityVersion: 1, occurrenceAddressVersion: 1, propertyReferenceIdentityVersion: 1,
      gradientPaintCaptureVersion: 1, captureTopology: { version: 1, complete: true, limitReached: false, issues: [] },
      ...(nodes.every(n => ['width', 'height'].every(p => Number.isFinite(n.bounds?.[p]))) ? { geometryCaptureVersion: 1 } : {}) } };
  const result: PreparedCatalogReference = { snapshot, variantReference: captureVariantReference(snapshot, s.componentKey, setKey, rootFacts.component.definedProperties),
    preparedSourceTopology, resourceRequirements: [], referenceHash: response.referenceHash, configuration: clone(s), definedProperties: rootFacts.component.definedProperties.slice(),
    sourceCollections: resources.collection, modePaths: [] };
  const requirements = new Map<string, CatalogResourceRequirement>();
  const requireResource = (kind: ResourceKind, id: any, path: Path, asKey = false) => {
    if (!text(id)) return;
    const resource = resources[kind][id];
    if (!resource || !key(resource.key)) fail('CATALOG_RESOURCE_KEY_UNAVAILABLE', { kind, sourceId: id });
    const token = kind + ':' + id;
    if (!requirements.has(token)) requirements.set(token, { kind, sourceId: id, sourceKey: resource.key, paths: [], keyPaths: [] });
    requirements.get(token)![asKey ? 'keyPaths' : 'paths'].push(path);
  };
  function walk(value: any, path: Path) {
    if (!value || typeof value !== 'object') return;
    if (value.type === 'VARIABLE_ALIAS') requireResource('variable', value.id, path.concat('id'));
    for (const [field, child] of Object.entries(value)) {
      const p = path.concat(Array.isArray(value) ? Number(field) : field);
      if (['fillStyleId', 'strokeStyleId', 'effectStyleId', 'textStyleId', 'styleId'].includes(field)) requireResource('style', child, p);
      else if (field === 'tokenId') requireResource('variable', child, p);
      else if (['tokenIds', 'referencedVariableIds'].includes(field) && Array.isArray(child)) child.forEach((id, i) => requireResource('variable', id, p.concat(i)));
      else if (field === 'collectionId') requireResource('collection', child, p);
      else if (['mainComponentId', 'ownerMainComponentId'].includes(field)) requireResource('component', child, p);
      if (['resolvedModes', 'explicitModes'].includes(field) && record(child)) for (const [id, mode] of Object.entries(child)) {
        requireResource('collection', id, p.concat(id), true); result.modePaths.push({ path: p.concat(id), collectionId: id });
      }
      if (field === 'keysById' && record(child)) for (const id of Object.keys(child)) requireResource(path.includes('textStyleEvidenceV1') ? 'style' : 'variable', id, p.concat(id), true);
      if (field === 'bindings' && path.includes('hostVariableUsageV1') && record(child)) for (const id of Object.keys(child)) requireResource('variable', id, p.concat(id), true);
      walk(child, p);
    }
  }
  walk(snapshot.nodes, ['snapshot', 'nodes']);
  for (const [id] of Object.entries(snapshot.context.modes)) { requireResource('collection', id, ['snapshot', 'context', 'modes', id], true); result.modePaths.push({ path: ['snapshot', 'context', 'modes', id], collectionId: id }); }
  for (const [i, node] of snapshot.nodes.entries()) {
    const c = node.component as any;
    for (const [name, type] of Object.entries(c.propertyTypes || {})) if (type === 'INSTANCE_SWAP') requireResource('component', c.properties?.[name], ['snapshot', 'nodes', i, 'component', 'properties', name]);
    const variable = node.variable as any;
    for (const collection of Object.values(resources.collection)) {
      if (Object.prototype.hasOwnProperty.call(variable.modes || {}, collection.key)) {
        requireResource('collection', collection.id, ['snapshot', 'nodes', i, 'variable', 'modeCatalog', collection.key, 'collectionId']);
        result.modePaths.push({ path: ['snapshot', 'nodes', i, 'variable', 'modes', collection.key], collectionId: collection.id });
      }
      const catalog = variable.modeCatalog?.[collection.key];
      if (catalog) {
        if (typeof catalog.defaultModeId === 'string') result.modePaths.push({ path: ['snapshot', 'nodes', i, 'variable', 'modeCatalog', collection.key, 'defaultModeId'], collectionId: collection.id });
        if (Array.isArray(catalog.modes)) catalog.modes.forEach((mode: any, index: number) => result.modePaths.push({ path: ['snapshot', 'nodes', i, 'variable', 'modeCatalog', collection.key, 'modes', index, 'modeId'], collectionId: collection.id }));
      }
    }
  }
  result.resourceRequirements = Array.from(requirements.values());
  return result;
}

/** Reuse the engine's selectors/applicability/missing policy. Preserve source
 * uncertainty on the matched baseline instead of interpreting the rules twice. */
export function materializeCatalogBaseline(actual: PreviewSnapshot, reference: PreviewSnapshot) {
  const result = materializeEffectiveBaseline(actual, reference, true), paths = snapshotPaths(reference);
  const byPath = new Map(reference.nodes.map(node => [paths?.get(String(node.id)), node]));
  for (const node of result.snapshot.nodes) {
    const provenance = node.baselineProvenance as {status?:string;referencePath?:string} | undefined;
    if (provenance?.status !== 'matched') continue;
    const expected = byPath.get(provenance.referencePath);
    const actualUnknown: string[] = Array.isArray(node.unknownFacts) ? node.unknownFacts as string[] : [];
    const sourceUnknown: string[] = Array.isArray(expected?.unknownFacts) ? expected.unknownFacts as string[] : [];
    node.unknownFacts = Array.from(new Set(actualUnknown.concat(sourceUnknown.map(path => 'baseline.effective.' + path))));
  }
  return result;
}

/** Only key-proven native IDs overlap. Missing actual resources retain independent,
 * non-native IDs so a detached actual style/token remains a detectable difference. */
export function applyCatalogResourceRemap(reference: PreparedCatalogReference, witnesses: CatalogResourceWitness[]): PreparedCatalogReference {
  const result = clone(reference), used = new Set<CatalogResourceWitness>(), replacements = new Map<string, string>();
  const modeMaps = new Map<string, Map<string, string>>();
  for (const requirement of result.resourceRequirements) {
    const found = witnesses.filter(w => w.kind === requirement.kind && w.sourceId === requirement.sourceId);
    if (found.length > 1) fail('CATALOG_RESOURCE_WITNESS_AMBIGUOUS');
    const witness = found[0];
    if (witness && (witness.sourceKey !== requirement.sourceKey || witness.consumerKey !== requirement.sourceKey
      || !text(witness.consumerId) || witness.consumerId.startsWith('catalog-source:'))) fail('CATALOG_RESOURCE_WITNESS_MISMATCH');
    if (witness) used.add(witness);
    const id = witness?.consumerId || 'catalog-source:' + requirement.kind + ':' + reference.referenceHash + ':' + requirement.sourceId;
    replacements.set(requirement.kind + ':' + requirement.sourceId, id);
    for (const path of requirement.paths) { const owner = at(result, path.slice(0, -1)); owner[path[path.length - 1]] = id; }
    if (requirement.kind === 'collection' && witness && reference.modePaths.some(p => p.collectionId === requirement.sourceId)) {
      const sourceModes = reference.sourceCollections[requirement.sourceId]?.modes, targetModes = witness.consumerModes;
      const validModes = (modes: any): modes is Array<{modeId: string; name: string}> => Array.isArray(modes)
        && modes.every(m => record(m) && text(m.modeId) && text(m.name))
        && new Set(modes.map(m => m.modeId)).size === modes.length && new Set(modes.map(m => m.name)).size === modes.length;
      if (!validModes(sourceModes) || !validModes(targetModes)) fail('CATALOG_MODE_IDENTITY_AMBIGUOUS');
      const map = new Map<string, string>();
      for (const mode of sourceModes) { const target = targetModes.find(m => m.name === mode.name); if (target) map.set(mode.modeId, target.modeId); }
      modeMaps.set(requirement.sourceId, map);
    }
  }
  if (used.size !== witnesses.length) fail('CATALOG_RESOURCE_WITNESS_UNREQUESTED');
  for (const mode of result.modePaths) {
    const owner = at(result, mode.path.slice(0, -1)), field = mode.path[mode.path.length - 1], sourceMode = owner?.[field];
    if (!text(sourceMode)) fail('CATALOG_MODE_IDENTITY_UNAVAILABLE');
    owner[field] = modeMaps.get(mode.collectionId)?.get(sourceMode)
      || 'catalog-source:mode:' + reference.referenceHash + ':' + mode.collectionId + ':' + sourceMode;
  }
  const keys = result.resourceRequirements.flatMap(r => r.keyPaths.map(path => ({ path, id: replacements.get(r.kind + ':' + r.sourceId)! }))).sort((a, b) => b.path.length - a.path.length);
  for (const { path, id } of keys) { const owner = at(result, path.slice(0, -1)), field = path[path.length - 1];
    if (id !== field) { if (Object.prototype.hasOwnProperty.call(owner, id)) fail('CATALOG_RESOURCE_REMAP_COLLISION'); owner[id] = owner[field]; delete owner[field]; } }
  const root = result.snapshot.nodes[0], properties = (root.component as any).properties;
  for (const [name, value] of Object.entries(result.configuration.config || {})) if (stableHash(properties[name]) !== stableHash(value)) fail('CATALOG_CONFIGURATION_UNSUPPORTED', { property: name });
  for (const [id, mode] of Object.entries(result.configuration.modes || {})) if ((root.resolvedModes as any)?.[id] !== mode) fail('CATALOG_MODE_CONFIGURATION_UNSUPPORTED', { collectionId: id });
  result.variantReference = captureVariantReference(result.snapshot, result.snapshot.source!.componentKey!, result.snapshot.source!.componentSetKey || '', result.definedProperties);
  return result;
}
