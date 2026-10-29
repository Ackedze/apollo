import type { PreviewSnapshot } from "../packages/component-contract-core/src/types";
import { snapshotPaths } from "../packages/component-contract-core/src/snapshot-topology";
import { compareInstanceBoundaries, correspondingPath } from "../packages/component-contract-core/src/instance-boundaries";

const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const unknown = (node: PreviewSnapshot['nodes'][number], fact: string) => node.unknownFacts !== undefined
  && (!Array.isArray(node.unknownFacts) || node.unknownFacts.some(path => typeof path !== 'string'
    || path === fact || path.startsWith(fact + '.') || fact.startsWith(path + '.')));

/** Native SLOT payload has no library baseline. This scopes diagnostics only;
 * captured nodes, contract evaluation and component ownership stay untouched. */
export function scopeNativeSlotCaptureWarnings(captured: {
  snapshot: PreviewSnapshot; warnings: string[]; unmatchedBaselineNodeIds: string[]; baselineDiagnostics?: unknown;
}) {
  const { snapshot } = captured, unmatched = captured.unmatchedBaselineNodeIds.slice(), external = new Set<string>();
  const paths = snapshotPaths(snapshot), ref = snapshot.variantReference, root = snapshot.nodes.find(node => node.id === snapshot.selection[0]);
  const rootIdentity = record(record(root?.component).identity), expectedRoot = ref?.nodeProperties?.['']?.identity;
  if (paths && ref?.complete && ref.nodeProperties && Array.isArray(ref.nodes)
    && snapshot.nodes.every(node => node.unknownFacts === undefined || Array.isArray(node.unknownFacts) && node.unknownFacts.every(fact => typeof fact === 'string'))
    && snapshot.source?.propertyReferenceIdentityVersion === 1 && snapshot.source.instanceIdentityVersion === 1
    && new Set(unmatched).size === unmatched.length && ref.componentKey === snapshot.source.componentKey
    && ref.componentSetKey === (snapshot.source.componentSetKey || '') && root && !unknown(root, 'component.identity')
    && rootIdentity.componentKey === ref.componentKey && expectedRoot?.componentKey === ref.componentKey
    && (rootIdentity.componentSetKey || '') === ref.componentSetKey && (expectedRoot.componentSetKey || '') === ref.componentSetKey) {
    const comparison = compareInstanceBoundaries(snapshot, ref);
    const byId = new Map(snapshot.nodes.map(node => [String(node.id), node])), refNodes = new Map(ref.nodes.map(node => [node.path, node]));
    const slots = new Set<string>();
    if (comparison.complete) for (const slot of snapshot.nodes.filter(node => node.type === 'SLOT')) {
      const path = correspondingPath(comparison, paths.get(String(slot.id))!);
      const property = record(record(slot.component).propertyReferenceBindings).slotContentId;
      if (path === undefined || typeof property !== 'string' || !property || refNodes.get(path)?.type !== 'SLOT'
        || ref.nodeProperties[path]?.propertyReferenceBindings?.slotContentId !== property
        || ['type', 'parentId', 'component.propertyReferenceBindings'].some(fact => unknown(slot, fact))) continue;
      let owner = byId.get(String(slot.parentId));
      while (owner && owner.type !== 'INSTANCE' && !unknown(owner, 'type') && !unknown(owner, 'parentId')) owner = byId.get(String(owner.parentId));
      const ownerPath = owner && correspondingPath(comparison, paths.get(String(owner.id))!);
      const expected = ownerPath === undefined ? undefined : ref.nodeProperties[ownerPath];
      const component = record(owner?.component), identity = record(component.identity);
      if (!owner || owner.type !== 'INSTANCE' || !expected?.identity?.componentKey || identity.componentKey !== expected.identity.componentKey
        || (identity.componentSetKey || '') !== (expected.identity.componentSetKey || '')
        || ['type', 'parentId', 'component.identity', `component.propertyTypes.${property}`].some(fact => unknown(owner!, fact))
        || record(component.propertyTypes)[property] !== 'SLOT' || expected.propertyTypes[property] !== 'SLOT') continue;
      slots.add(String(slot.id));
    }
    for (const id of unmatched) {
      let node = byId.get(id);
      while (node && !unknown(node, 'parentId') && !unknown(node, 'type')) {
        node = byId.get(String(node.parentId));
        if (node && slots.has(String(node.id))) { external.add(id); break; }
      }
    }
  }
  const unresolved = unmatched.filter(id => !external.has(id)), marker = record(captured.baselineDiagnostics), index = marker.warningIndex;
  const markerAccepted = Object.keys(marker).sort().join(',') === 'kind,unmatchedNodeIds,warning,warningIndex'
    && marker.kind === 'unmatched-baseline' && unmatched.length > 0 && Number.isSafeInteger(index)
    && index >= 0 && index < captured.warnings.length && typeof marker.warning === 'string'
    && captured.warnings[index] === marker.warning && Array.isArray(marker.unmatchedNodeIds)
    && marker.unmatchedNodeIds.length === unmatched.length && marker.unmatchedNodeIds.every((id: unknown, position: number) => id === unmatched[position]);
  const warnings = captured.warnings.slice();
  if (external.size && markerAccepted) warnings.splice(index, 1,
    ...(unresolved.length ? [`${unresolved.length} узлов instance не сопоставлены с reference baseline.`] : []));
  return { warnings, baselineDiagnostics: { rawWarnings: captured.warnings.slice(), rawUnmatchedBaselineNodeIds: unmatched,
    unresolvedBaselineNodeIds: unresolved, externalSlotPayloadNodeIds: [...external], markerAccepted, producer: captured.baselineDiagnostics } };
}
