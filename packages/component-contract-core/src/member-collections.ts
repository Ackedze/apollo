import type { CollectionFilter, CollectionProperty, CompiledContract, ManualSource, MemberCollection, PreviewSnapshot } from './types';
import { diagnosticStructure, selectedTargetPathHint } from './occurrence-address';
import { matchesCaptureRepresentation } from './capture-representation';
import { stableHash } from './stable';

const record = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};
const parent = (path: string) => path.split(' / ').slice(0, -1).join(' / ');
const propertyTypes = ['VARIANT', 'BOOLEAN', 'TEXT', 'INSTANCE_SWAP'];
const unknown = (node: Record<string, any>, fact: string) => (node.unknownFacts || []).some((p: string) => p === fact || fact.startsWith(p + '.') || p.startsWith(fact + '.'));
const valueType = (type: string, value: unknown) => type === 'BOOLEAN' ? typeof value === 'boolean' : typeof value === 'string';

export function memberCollectionErrors(c: MemberCollection, manual: Pick<ManualSource, 'targets' | 'representations'>): string[] {
  const errors: string[] = [];
  if (!c || c.version !== 1) return ['Member collection version 1 is required.'];
  if(Object.keys(c).some(k=>!['version','ownerTargetRole','memberTargetRoles','slotContent','representationIds','visibleOnly','filter','whenHost','whenMember','assertion'].includes(k)))errors.push('Unsupported member collection field.');
  const resolved = (role: string) => manual.targets.filter(t => t.semanticRole === role && t.resolution === 'resolved').length === 1;
  if (!resolved(c.ownerTargetRole)) errors.push('Choose one resolved collection owner.');
  if (!Array.isArray(c.memberTargetRoles) || !c.memberTargetRoles.length || new Set(c.memberTargetRoles).size !== c.memberTargetRoles.length
    || c.memberTargetRoles.some(role => role === c.ownerTargetRole || !resolved(role))) errors.push('Choose distinct resolved member roles, separate from the owner.');
  if (!Array.isArray(c.representationIds) || !c.representationIds.length || new Set(c.representationIds).size !== c.representationIds.length
    || c.representationIds.some(id => !manual.representations.some(r => r.id === id && r.kind === 'figma' && r.status !== 'deprecated'))) errors.push('Choose explicit active Figma representations.');
  if (typeof c.visibleOnly !== 'boolean') errors.push('Declare whether the collection includes only visible members.');
  const property = (p: CollectionProperty | undefined, values?: unknown[]) => {
    if (!p || typeof p.property !== 'string' || !p.property.trim() || !propertyTypes.includes(p.propertyType)) errors.push('A typed Figma property is required.');
    if (values !== undefined && (!Array.isArray(values) || !values.length || values.some(v => !valueType(p?.propertyType || '', v)))) errors.push('Property values must match the declared Figma type. VARIANT values are strings.');
  };
  for (const f of [c.filter, c.whenHost, c.whenMember]) if (f !== undefined) {
    property(f, Array.isArray(f?.values) ? f.values : []);
    if(Object.keys(f || {}).some(k=>!['property','propertyType','values'].includes(k)))errors.push('Unsupported typed filter field.');
  }
  if (c.slotContent !== undefined) {
    const keys = c.slotContent?.componentSetKeys;
    if (Object.keys(c.slotContent || {}).some(k => k !== 'componentSetKeys') || !Array.isArray(keys) || !keys.length
      || keys.some(k => typeof k !== 'string' || !/^[a-f0-9]{40}$/i.test(k)) || new Set(keys).size !== keys.length
      || !Array.isArray(c.memberTargetRoles) || c.memberTargetRoles.length !== 1 || c.assertion?.kind !== 'propertyMapping') errors.push('Open SLOT requires one target, explicit family keys and propertyMapping.');
  }
  const a = c.assertion;
  if (!a || !['membership', 'count', 'position', 'propertyDomain', 'propertyMapping', 'hostRequirement'].includes(a.kind)) return [...errors, 'Unsupported collection assertion.'];
  const allowed:Record<string,string[]>={membership:['kind'],count:['kind','min','max'],position:['kind','position'],propertyDomain:['kind','property','propertyType','values'],propertyMapping:['kind','property','propertyType','hostProperty','hostPropertyType','transform'],hostRequirement:['kind','property','propertyType','values']};
  if(Object.keys(a).some(k=>!allowed[a.kind].includes(k)))errors.push('Unsupported collection assertion field.');
  if (a.kind === 'membership' && (c.visibleOnly || c.filter || c.whenHost || c.whenMember)) errors.push('Closed membership always includes hidden children and cannot have a property gate.');
  if (a.kind === 'count' && ((a.min === undefined && a.max === undefined) || [a.min, a.max].some(v => v !== undefined && (!Number.isInteger(v) || v < 0))
    || (a.min !== undefined && a.max !== undefined && a.min > a.max))) errors.push('Count needs ordered non-negative integer bounds.');
  if (a.kind === 'position' && (!['first', 'last'].includes(a.position) || !c.filter)) errors.push('First/last position requires an explicit member filter.');
  if (a.kind === 'propertyDomain' || a.kind === 'hostRequirement') property(a, Array.isArray(a.values) ? a.values : []);
  if (a.kind === 'hostRequirement' && !c.filter && !c.whenMember) errors.push('Choose members that require the host property.');
  if (a.kind === 'propertyMapping') {
    property(a); property({property: a.hostProperty, propertyType: a.hostPropertyType});
    if (a.transform !== undefined && !['identity', 'string-to-boolean'].includes(a.transform)) errors.push('Unsupported explicit property transform.');
    if (a.transform === 'string-to-boolean' ? a.propertyType !== 'VARIANT' || a.hostPropertyType !== 'BOOLEAN' : a.propertyType !== a.hostPropertyType) errors.push('Mapping types must agree, or declare VARIANT to BOOLEAN string-to-boolean.');
  }
  return errors;
}

/** Topology proof deliberately uses capture IDs, not occurrence paths. An added
 * duplicate source occurrence must be reportable even when snapshotPaths cannot
 * assign a unique address. Capture IDs establish edges only, never membership. */
function completeGraph(snapshot: PreviewSnapshot): Map<string, Record<string, any>> | undefined {
  // source.rootNodeId is the Figma provenance ID. Selection and graph edges use
  // local capture IDs; their equality is neither required nor identity proof.
  if (snapshot.selection.length !== 1 || snapshot.source?.truncated !== false || snapshot.source?.captureTopology?.complete === false) return;
  const nodes = new Map(snapshot.nodes.map(n => [String(n.id), n as Record<string, any>]));
  if (nodes.size !== snapshot.nodes.length || nodes.get(snapshot.selection[0])?.parentId !== null) return;
  const seen = new Set<string>();
  const visit = (id: string): boolean => {
    const n = nodes.get(id);
    if (!n || seen.has(id) || !Array.isArray(n.childIds) || new Set(n.childIds).size !== n.childIds.length) return false;
    seen.add(id);
    return n.childIds.every((child: string) => nodes.get(child)?.parentId === id && visit(child));
  };
  return visit(snapshot.selection[0]) && seen.size === nodes.size ? nodes : undefined;
}

function referenceMatchesCatalog(snapshot: PreviewSnapshot, contract: CompiledContract): boolean {
  const ref = snapshot.variantReference, e = contract.facts.variantEvidence;
  if (!ref?.complete || ref.occurrenceAddressVersion !== 1 || !e || ref.componentKey !== snapshot.source?.componentKey
    || ref.componentSetKey !== (snapshot.source?.componentSetKey || '')) return false;
  const variants = e.variants.filter(v => v.componentKey === ref.componentKey && (v.componentSetKey === ref.componentSetKey || (!ref.componentSetKey && v.componentSetKey === v.componentKey)));
  if (variants.length !== 1) return false;
  const v = variants[0], shape = e.structures[v.structureId];
  const names = e.occurrences?.filter(o => o.componentKey === v.componentKey && o.componentSetKey === v.componentSetKey);
  const expected = shape && (e.occurrenceAddressVersion === 1
    ? names?.length === 1 && diagnosticStructure(shape, names[0].namesByPath)
    : diagnosticStructure(shape, Object.fromEntries(shape.map(n => [n.path, n.path.split(' / ').slice(-1)[0]]))));
  const observed = diagnosticStructure(ref.nodes, Object.fromEntries(Object.entries(ref.nodeProperties).map(([p, n]) => [p, n.diagnosticName!])));
  if (!expected || !observed || stableHash(expected) !== stableHash(observed)) return false;
  const root = snapshot.nodes.find(n => n.id === snapshot.selection[0]);
  return Object.entries(v.properties).every(([p, value]) => p === 'raw' && !ref.componentSetKey && !ref.propertyTypes[p]
    || ref.properties[p] === value && record(record(root?.component).properties)[p] === value);
}

type Member = { role: string; node: Record<string, any>; sourceNodeId: string };
type Resolution = { owner?: Record<string, any>; members?: Member[]; issues?: Array<Record<string, unknown>>; missing: string[]; actualCount?: number };

function resolveCollection(snapshot: PreviewSnapshot, contract: CompiledContract, c: MemberCollection, representationId: string): Resolution {
  const result: Resolution = {missing: []}, ref = snapshot.variantReference!, graph = completeGraph(snapshot);
  if (!graph || snapshot.source?.occurrenceAddressVersion !== 1 || snapshot.source.instanceSourceIdentityVersion !== 1 || !referenceMatchesCatalog(snapshot, contract)) {
    result.missing.push('collection-topology-or-reference-unavailable'); return result;
  }
  const pathFor = (role: string) => {
    const targets = contract.facts.targets.filter(t => t.semanticRole === role && t.resolution === 'resolved');
    return targets.length === 1 ? selectedTargetPathHint(targets[0], representationId, ref.componentKey, true)?.split(' / ').slice(1).join(' / ') : undefined;
  };
  const ownerPath = pathFor(c.ownerTargetRole), memberPaths = c.memberTargetRoles.map(pathFor);
  if (ownerPath === undefined || memberPaths.some(p => !p || parent(p) !== ownerPath) || new Set(memberPaths).size !== memberPaths.length) {
    result.missing.push('collection-bindings-unresolved'); return result;
  }
  const root = graph.get(snapshot.selection[0])!, rootIdentity = record(record(root.component).identity), expectedRoot = ref.nodeProperties['']?.identity;
  if (!expectedRoot || unknown(root, 'component.identity') || rootIdentity.componentKey !== expectedRoot.componentKey
    || rootIdentity.mainComponentId !== expectedRoot.mainComponentId || (rootIdentity.componentSetKey || '') !== (expectedRoot.componentSetKey || '')) {
    result.missing.push('collection-owner-identity-unproven'); return result;
  }
  const actualFor = (path: string, seen = new Set<string>()): Record<string, any> | undefined => {
    if (path === '') return root;
    if (seen.has(path)) return;
    seen.add(path);
    const expected = ref.nodeProperties[path], expectedParent = actualFor(parent(path), seen);
    const source = expected?.sourceIdentity;
    if (!expectedParent || !source) return;
    const identity = record(record(expectedParent.component).identity);
    const candidates = [...graph.values()].filter(n => n.parentId === expectedParent.id && (() => {
      const s = record(record(n.component).sourceIdentity);
      return !unknown(n, 'component.sourceIdentity') && s.version === 1 && s.sourceNodeId === source.sourceNodeId
        && s.ownerComponentKey === identity.componentKey && s.ownerMainComponentId === identity.mainComponentId;
    })());
    return candidates.length === 1 ? candidates[0] : undefined;
  };
  const owner = actualFor(ownerPath), expectedOwner = ref.nodeProperties[ownerPath]?.identity;
  const ownerIdentity = record(record(owner?.component).identity);
  if (!owner || owner.type !== 'INSTANCE' || !expectedOwner || unknown(owner, 'component.identity')
    || ownerIdentity.componentKey !== expectedOwner.componentKey || ownerIdentity.mainComponentId !== expectedOwner.mainComponentId) {
    result.missing.push('collection-owner-identity-unproven'); return result;
  }
  result.owner = owner;
  if (c.slotContent) {
    const slotPath = memberPaths[0]!, slot = actualFor(slotPath), expected = ref.nodeProperties[slotPath];
    const property = expected?.propertyReferenceBindings?.slotContentId;
    const controls = contract.customizationPolicy.filter(p => p.status !== 'deprecated' && ['allowed','constrained'].includes(p.permission)
      && p.targetId === contract.facts.targets.find(t => t.semanticRole === c.memberTargetRoles[0])?.id)
      .flatMap(p => p.controlPaths).filter(p => p.kind === 'slot-api' && p.property === property && p.contentOwnership === 'external');
    if (snapshot.source?.captureTopology?.complete !== true || snapshot.source.captureTopology.limitReached
      || snapshot.source.captureTopology.issues?.length || !slot || slot.type !== 'SLOT'
      || ref.nodes.find(n => n.path === slotPath)?.type !== 'SLOT' || typeof property !== 'string' || !controls.length
      || unknown(owner,'component.propertyTypes.' + property) || record(owner.component).propertyTypes?.[property] !== 'SLOT'
      || ref.nodeProperties[ownerPath]?.propertyTypes?.[property] !== 'SLOT' || unknown(slot,'component.propertyReferenceBindings')
      || record(record(slot.component).propertyReferenceBindings).slotContentId !== property
      || record(slot.slotBoundaryV1).evidence !== 'native-slot-content-reference'
      || record(slot.slotBoundaryV1).contentOwnership !== 'external') {
      result.missing.push('collection-slot-boundary-unproven'); return result;
    }
    const members:Member[] = [];
    const visit = (node:Record<string,any>) => {
      if (node.type === 'INSTANCE') {
        const identity = record(record(node.component).identity);
        if (unknown(node,'component.identity') || !/^[a-f0-9]{40}$/i.test(identity.componentKey || '')
          || typeof identity.mainComponentId !== 'string' || !identity.mainComponentId) {
          result.missing.push('collection-member-identity-unavailable:' + node.id); return;
        }
        if (c.slotContent!.componentSetKeys.includes(identity.componentSetKey)) members.push({role:c.memberTargetRoles[0],node,sourceNodeId:node.id});
        return; // A nested component owns its descendants, including nested groups.
      }
      if (['FRAME','GROUP'].includes(node.type)) for (const id of node.childIds) visit(graph.get(id)!);
    };
    for (const id of slot.childIds) visit(graph.get(id)!);
    result.members = members; result.issues = []; result.actualCount = members.length;
    return result;
  }
  const originalChildren = ref.nodes.filter(n => n.path && parent(n.path) === ownerPath);
  if (originalChildren.length !== memberPaths.length || originalChildren.some(n => n.type !== 'INSTANCE' || !memberPaths.includes(n.path))) {
    result.missing.push('collection-members-do-not-cover-reference'); return result;
  }
  const children = owner.childIds.map((id: string) => graph.get(id)!);
  result.actualCount = children.length;
  const issues: Array<Record<string, unknown>> = [], members: Member[] = [];
  if (children.length > originalChildren.length) issues.push({reason: 'added-children', ownerNodeId: owner.id, expected: originalChildren.length, actual: children.length});
  if (children.length < originalChildren.length) issues.push({reason: 'missing-children', ownerNodeId: owner.id, expected: originalChildren.length, actual: children.length});
  const expectedBySource = new Map<string, {path: string; role: string}>();
  for (let i = 0; i < memberPaths.length; i++) {
    const p = memberPaths[i]!, s = ref.nodeProperties[p]?.sourceIdentity;
    if (!s || s.version !== 1 || s.ownerComponentKey !== ownerIdentity.componentKey || s.ownerMainComponentId !== ownerIdentity.mainComponentId || expectedBySource.has(s.sourceNodeId)) {
      result.missing.push('collection-reference-lineage-unavailable'); return result;
    }
    expectedBySource.set(s.sourceNodeId, {path: p, role: c.memberTargetRoles[i]});
  }
  const claimed = new Set<string>();
  for (const node of children) {
    if (node.type !== 'INSTANCE') { issues.push({reason: 'foreign-child-type', nodeId: node.id, type: node.type}); continue; }
    const s = record(record(node.component).sourceIdentity), identity = record(record(node.component).identity);
    if (unknown(node, 'component.sourceIdentity') || s.version !== 1 || typeof s.sourceNodeId !== 'string'
      || s.ownerComponentKey !== ownerIdentity.componentKey || s.ownerMainComponentId !== ownerIdentity.mainComponentId) {
      result.missing.push('collection-member-lineage-unavailable:' + node.id); continue;
    }
    const original = expectedBySource.get(s.sourceNodeId);
    if (!original) { issues.push({reason: 'foreign-occurrence', nodeId: node.id, sourceNodeId: s.sourceNodeId}); continue; }
    if (claimed.has(s.sourceNodeId)) { issues.push({reason: 'duplicate-occurrence', nodeId: node.id, memberRole: original.role, sourceNodeId: s.sourceNodeId}); continue; }
    claimed.add(s.sourceNodeId);
    const expected = ref.nodeProperties[original.path]?.identity;
    if (unknown(node, 'component.identity') || !identity.componentKey || !expected?.componentKey) {
      result.missing.push('collection-member-identity-unavailable:' + node.id); continue;
    }
    if (expected.componentSetKey ? identity.componentSetKey !== expected.componentSetKey : identity.componentSetKey || identity.componentKey !== expected.componentKey) {
      issues.push({reason: 'member-family-replaced', nodeId: node.id, memberRole: original.role, expected: expected.componentSetKey || expected.componentKey, actual: identity.componentSetKey || identity.componentKey}); continue;
    }
    members.push({role: original.role, node, sourceNodeId: s.sourceNodeId});
  }
  result.members = members; result.issues = issues;
  return result;
}

export function typedCollectionValue(node: Record<string, any>, p: CollectionProperty): unknown {
  const component = record(node.component), fact = 'component.properties.' + p.property;
  if (unknown(node, fact) || unknown(node, 'component.propertyTypes.' + p.property) || component.propertyTypes?.[p.property] !== p.propertyType) return undefined;
  const value = component.properties?.[p.property];
  return valueType(p.propertyType, value) ? value : undefined;
}

export const collectionPropertyMatches = (node: Record<string, any>, filter: CollectionFilter): boolean | undefined => {
  const value = typedCollectionValue(node, filter);
  return value === undefined ? undefined : filter.values.some(v => stableHash(v) === stableHash(value));
};
const typedValue = typedCollectionValue;
const matches = collectionPropertyMatches;

/** Presentation of recorded facts only; never evaluates a constraint. */
export function memberCollectionSummary(fact: Record<string, any>): string {
  const labels: Record<string,string> = {'added-children':'добавлены дочерние элементы','missing-children':'удалены исходные элементы','foreign-child-type':'посторонний тип дочернего элемента','foreign-occurrence':'посторонняя occurrence','duplicate-occurrence':'дубликат исходной occurrence','member-family-replaced':'семейство member подменено'};
  const reasons=(fact.violations || []).map((v:any)=>{
    const role=v.memberRole || v.nodeId || 'Owner';
    if(v.reason==='count-outside-domain')return `Количество ${v.actual}; допустимо ${v.min ?? 0}–${v.max ?? '∞'}`;
    if(v.reason==='member-position')return `${role}: позиция ${v.actualIndex + 1}, требуется ${v.position==='first'?'первая':'последняя'}`;
    if(v.reason==='member-property-domain')return `${role}: ${v.property}=${JSON.stringify(v.actual)}, допустимо ${v.expected.map((x:any)=>JSON.stringify(x)).join(', ')}`;
    if(v.reason==='member-host-mapping')return `${role}: ${v.property}=${JSON.stringify(v.actual)}, требуется ${v.hostProperty} владельца=${JSON.stringify(v.expected)}`;
    if(v.reason==='required-host-property')return `Владелец: ${v.property}=${JSON.stringify(v.actual)}, требуется ${v.expected.map((x:any)=>JSON.stringify(x)).join(', ')}`;
    return `${role}: ${labels[v.reason] || v.reason}${v.actual!==undefined?`; сейчас ${v.actual}, исходно ${v.expected}`:''}`;
  });
  if(fact.missing?.length)reasons.push('Недостаточно данных: '+fact.missing.join('; '));
  return reasons.length?reasons.join('. '):fact.active===false?'Условие коллекции не выполнено; ограничение не применяется':`Состав подтверждён${fact.count!==undefined?`; элементов ${fact.count}, отобрано ${fact.selectedCount ?? fact.count}`:fact.actualCount!==undefined?`; исходных экземпляров ${fact.actualCount}`:''}`;
}

/** New opt-in facts leave historical snapshots/hashes untouched. Each constraint
 * receives independent completeness: a missing View cannot erase root baseline
 * or an independently proved membership violation. */
export function materializeMemberCollections(snapshot: PreviewSnapshot, contract: CompiledContract): void {
  if (contract.runtimePolicy.memberCollectionsVersion !== 1 || !contract.facts.memberCollections?.length) return;
  const all: Record<string, unknown> = {}, ref = snapshot.variantReference;
  for (const entry of contract.facts.memberCollections) {
    const c = entry.collection, fact: Record<string, any> = {assertionKind: entry.collection.assertion.kind, missing: [], evidence: []}; all[entry.id] = fact;
    const reps = ref && contract.facts.representations.filter(r => r.kind === 'figma' && r.status !== 'deprecated'
      && ['universal', snapshot.context.platform].includes(r.platform) && matchesCaptureRepresentation(r, ref.componentKey, ref.componentSetKey));
    if (!reps || reps.length !== 1) { fact.missing.push('collection-representation-unresolved'); continue; }
    if (!c.representationIds.includes(reps[0].id)) { fact.active = false; continue; }
    const resolution = resolveCollection(snapshot, contract, c, reps[0].id);
    fact.missing.push(...resolution.missing); fact.evidence = resolution.issues || [];
    if (resolution.actualCount !== undefined) fact.actualCount = resolution.actualCount;
    if (!resolution.owner || !resolution.members || !resolution.issues) continue;
    const owner = resolution.owner;
    fact.ownerNodeId = owner.id;
    if (c.assertion.kind === 'membership') {
      fact.active = true;
      if (resolution.issues.length || !resolution.missing.length) fact.violations = resolution.issues;
      continue;
    }
    const independentPropertyCheck=['propertyDomain','propertyMapping'].includes(c.assertion.kind) && !c.filter && !c.whenHost && !c.whenMember;
    if (resolution.missing.length || resolution.issues.length) {
      fact.missing.push('collection-membership-unproven');
      if(!independentPropertyCheck)continue;
    }
    let members = resolution.members;
    if (c.visibleOnly) {
      if (members.some(m => unknown(m.node, 'visible') || unknown(m.node, 'visibility.effective') || typeof record(m.node.visibility).effective !== 'boolean')) {
        fact.missing.push('collection-visibility-unavailable');
        if(!independentPropertyCheck)continue;
      }
      members = members.filter(m => !unknown(m.node,'visible') && !unknown(m.node,'visibility.effective') && record(m.node.visibility).effective===true);
    }
    fact.memberNodeIds = members.map(m => m.node.id);
    if(fact.missing.length)fact.knownCount=members.length;else fact.count=members.length;
    if (c.whenHost) {
      const active = matches(owner, c.whenHost);
      fact.hostConditionValue = typedValue(owner, c.whenHost);
      if (active === undefined) { fact.missing.push('collection-host-condition-unavailable'); continue; }
      if (!active) { fact.active = false; continue; }
    }
    if (c.whenMember) {
      const results = members.map(m => matches(m.node, c.whenMember!));
      if (!results.includes(true)) {
        if (results.includes(undefined)) fact.missing.push('collection-member-condition-unavailable');
        else fact.active = false;
        continue;
      }
    }
    let selected = members;
    if (c.filter) {
      const results = members.map(m => matches(m.node, c.filter!));
      if (results.includes(undefined)) { fact.missing.push('collection-filter-property-unavailable'); continue; }
      selected = members.filter((_, i) => results[i]);
    }
    fact.selectedNodeIds = selected.map(m => m.node.id);
    if(fact.missing.length)fact.knownSelectedCount=selected.length;else fact.selectedCount=selected.length;
    const a = c.assertion, violations: Array<Record<string, unknown>> = [];
    if (a.kind === 'hostRequirement' && !selected.length) { fact.active = false; continue; }
    fact.active = true;
    if (a.kind === 'count') {
      if (a.min !== undefined && selected.length < a.min || a.max !== undefined && selected.length > a.max) violations.push({reason: 'count-outside-domain', actual: selected.length, min: a.min, max: a.max});
    } else if (a.kind === 'position') {
      if (unknown(owner, 'childIds') || unknown(owner, 'children.order')) { fact.missing.push('collection-order-unavailable'); continue; }
      const edge = members[a.position === 'first' ? 0 : members.length - 1];
      fact.edgeNodeId = edge?.node.id;
      selected.filter(m => m !== edge).forEach(m => violations.push({reason: 'member-position', nodeId: m.node.id, memberRole: m.role, position: a.position, actualIndex: members.indexOf(m), edgeNodeId: edge?.node.id}));
    } else if (a.kind === 'propertyDomain') {
      const values = selected.map(m => typedValue(m.node, a));
      fact.memberValues = values;
      if (values.includes(undefined)) fact.missing.push('collection-member-property-unavailable');
      selected.forEach((m, i) => { if (values[i]!==undefined && !a.values.some(v => stableHash(v) === stableHash(values[i]))) violations.push({reason: 'member-property-domain', nodeId: m.node.id, memberRole: m.role, property: a.property, actual: values[i], expected: a.values}); });
    } else if (a.kind === 'propertyMapping') {
      const host = typedValue(owner, {property: a.hostProperty, propertyType: a.hostPropertyType}), values = selected.map(m => typedValue(m.node, a));
      fact.hostValue = host; fact.memberValues = values;
      if (host === undefined) { fact.missing.push('collection-mapping-property-unavailable'); continue; }
      if (values.includes(undefined)) fact.missing.push('collection-mapping-property-unavailable');
      const normalized = values.map(v => a.transform === 'string-to-boolean' ? typeof v === 'string' && /^(true|false)$/i.test(v) ? v.toLowerCase() === 'true' : undefined : v);
      if (normalized.some((v,i)=>v===undefined && values[i]!==undefined)) fact.missing.push('collection-transform-value-unavailable');
      selected.forEach((m, i) => { if (normalized[i]!==undefined && stableHash(normalized[i]) !== stableHash(host)) violations.push({reason: 'member-host-mapping', nodeId: m.node.id, memberRole: m.role, property: a.property, actual: values[i], hostProperty: a.hostProperty, expected: host}); });
    } else if (a.kind === 'hostRequirement') {
      const value = typedValue(owner, a); fact.hostValue = value;
      if (value === undefined) { fact.missing.push('collection-host-property-unavailable'); continue; }
      if (!a.values.some(v => stableHash(v) === stableHash(value))) violations.push({reason: 'required-host-property', nodeId: owner.id, memberNodeIds: fact.selectedNodeIds, property: a.property, actual: value, expected: a.values});
    }
    if(violations.length || !fact.missing.length)fact.violations = violations;
  }
  for (const node of snapshot.nodes) {
    node.memberCollectionsV1 = all;
    node.unknownFacts = ((node.unknownFacts || []) as string[]).filter(p => p !== 'memberCollectionsV1' && !p.startsWith('memberCollectionsV1.'));
  }
}
