import type { CompiledContract, PreviewSnapshot } from "../packages/component-contract-core/src/types";
import { snapshotPaths } from "../packages/component-contract-core/src/snapshot-topology";
import { materializeVariantFacts, materializeVerifiedVariantTargets, variantAvailability } from "../packages/component-contract-core/src/variant-facts";
import { compareInstanceBoundaries, correspondingPath, withinBoundary } from "../packages/component-contract-core/src/instance-boundaries";
import { materializeInstanceContentReferences } from "../packages/component-contract-core/src/instance-content-reference";

export type OwnedAreaPart = {
  snapshotNodeId: string;
  ownerComponentId: string;
  ownerContractId: string;
  manualSourceHash: string;
  targetId: string;
  targetRole: string;
  referencePath: string;
  reason: 'component-owned-part';
};
const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const unknown = (node: Record<string, unknown>, fact: string) => ((node.unknownFacts || []) as string[])
  .some(path => path === fact || fact.startsWith(path + '.') || path.startsWith(fact + '.'));

/** Attribution only. A declared semantic part needs independent correspondence;
 * this never executes rules, hides host gaps or grants a library baseline. */
export function collectContractOwnedParts(snapshot: PreviewSnapshot, contract: CompiledContract): OwnedAreaPart[] {
  const paths = snapshotPaths(snapshot), reference = snapshot.variantReference;
  if (!paths || !reference?.complete || snapshot.source?.propertyReferenceIdentityVersion !== 1) return [];
  const available = variantAvailability(snapshot, contract);
  if (available.status === 'unknown') return [];
  const comparison = compareInstanceBoundaries(snapshot, reference);
  const external: string[] = [];
  // External content stays independently routed even when it has a declared
  // semantic target or agrees with the initial component reference.
  for (const policy of contract.customizationPolicy.filter(policy => policy.status !== 'deprecated')) {
    for (const control of policy.controlPaths.filter(control => control.contentOwnership === 'external')) {
      const target = contract.facts.targets.find(target => target.id === control.target);
      const resolved = target && available.targets[target.semanticRole];
      if (!resolved || resolved.state === 'unknown') return [];
      if (resolved.state === 'present' && resolved.path !== undefined) external.push(resolved.path);
    }
  }
  const byId = new Map(snapshot.nodes.map(node => [String(node.id), node]));
  const parts: OwnedAreaPart[] = [];
  let verified: PreviewSnapshot | undefined;
  for (const node of snapshot.nodes) {
    if (node.type !== 'INSTANCE') continue;
    const path = paths.get(String(node.id))!;
    if (!path) continue;
    const referencePath = correspondingPath(comparison, path);
    if (referencePath === undefined || external.some(boundary => withinBoundary(referencePath, boundary))) continue;
    const boundaries = comparison.boundaries.filter(boundary => withinBoundary(path, boundary.actualPath));
    let configuredVariant = false;
    let proven: Record<string, any> | undefined;
    if (boundaries.length) {
      const boundary = boundaries[0];
      if (boundaries.length !== 1 || boundary.nodeId !== node.id || boundary.reason !== 'component-variant-changed') continue;
      if (!verified) {
        // Revalidate the existing independent host evidence; cached roles or a
        // shared component set alone cannot turn a replacement into an owned part.
        verified = JSON.parse(JSON.stringify(snapshot)) as PreviewSnapshot;
        materializeVariantFacts(verified, contract);
        materializeInstanceContentReferences(verified);
        materializeVerifiedVariantTargets(verified, contract);
      }
      proven = verified.nodes.find(candidate => candidate.id === node.id);
      const provenance = record(proven?.baselineProvenance);
      const results = verified.instanceContentResults?.filter(result => result.boundaryNodeId === node.id) || [];
      configuredVariant = results.length === 1 && results[0].status === 'matched' && results[0].lineageProven === true
        && results[0].matchedNodeIds.includes(String(node.id)) && provenance.status === 'matched'
        && provenance.kind === 'independent-host-variant' && provenance.boundaryNodeId === node.id
        && provenance.componentKey === boundary.actualComponentKey && provenance.componentSetKey === boundary.componentSetKey;
      if (!configuredVariant || unknown(node, 'type') || unknown(node, 'parentId')) continue;
    }
    const targets = contract.facts.targets.filter(target => target.resolution === 'resolved'
      && (configuredVariant ? record(proven?.semantic).role === target.semanticRole
        && record(record(proven?.variantAvailability).targets)[target.semanticRole]?.present === true
        : available.targets[target.semanticRole]?.state === 'present' && available.targets[target.semanticRole]?.path === referencePath));
    if (targets.length !== 1) continue;
    // Caller content in native SLOTs and INSTANCE_SWAP ports is never an
    // implicit owned part. An unknown port/identity cannot prove ownership.
    let ancestor: Record<string, unknown> | undefined = node, blocked = false;
    while (ancestor) {
      const component = record(ancestor.component);
      if (ancestor.type === 'SLOT' || component.propertyReferenceBindings?.mainComponent !== undefined
        || unknown(ancestor, 'component.identity') || unknown(ancestor, 'component.propertyReferenceBindings')) { blocked = true; break; }
      ancestor = ancestor.parentId === null ? undefined : byId.get(String(ancestor.parentId));
    }
    if (blocked) continue;
    const identity = record(record(node.component).identity), expected = reference.nodeProperties[referencePath]?.identity;
    if (!expected?.componentKey || !identity.componentKey || !configuredVariant && identity.componentKey !== expected.componentKey
      || (identity.componentSetKey || '') !== (expected.componentSetKey || '')) continue;
    parts.push({ snapshotNodeId: String(node.id), ownerComponentId: contract.package.componentId,
      ownerContractId: contract.package.id, manualSourceHash: contract.package.manualSourceHash,
      targetId: targets[0].id, targetRole: targets[0].semanticRole, referencePath, reason: 'component-owned-part' });
  }
  return parts;
}

/** Parent diagnostics only. External SLOT payload retains its raw missing
 * baseline evidence and remains eligible for its own independent checks. */
export function scopeContractCaptureWarnings(captured: {
  snapshot: PreviewSnapshot; warnings: string[]; unmatchedBaselineNodeIds: string[]; baselineDiagnostics?: unknown;
}, contract: CompiledContract) {
  const { snapshot } = captured, paths = snapshotPaths(snapshot), reference = snapshot.variantReference;
  const unmatched = captured.unmatchedBaselineNodeIds.slice(), external = new Set<string>();
  const byId = new Map(snapshot.nodes.map(node => [String(node.id), node]));
  if (paths && reference?.complete && new Set(unmatched).size === unmatched.length) {
    const available = variantAvailability(snapshot, contract), comparison = compareInstanceBoundaries(snapshot, reference);
    const refNodes = new Map(reference.nodes.map(node => [node.path, node]));
    const slots = new Set<string>();
    if (available.status !== 'unknown' && comparison.complete) for (const slot of snapshot.nodes.filter(node => node.type === 'SLOT')) {
      const path = paths.get(String(slot.id))!, referencePath = correspondingPath(comparison, path);
      const property = record(record(slot.component).propertyReferenceBindings).slotContentId;
      if (referencePath === undefined || typeof property !== 'string' || !property
        || refNodes.get(referencePath)?.type !== 'SLOT' || reference.nodeProperties[referencePath]?.propertyReferenceBindings?.slotContentId !== property
        || unknown(slot, 'component.propertyReferenceBindings') || unknown(slot, 'type') || unknown(slot, 'parentId')) continue;
      const targets = contract.facts.targets.filter(target => target.resolution === 'resolved'
        && available.targets[target.semanticRole]?.state === 'present' && available.targets[target.semanticRole]?.path === referencePath);
      if (targets.length !== 1) continue;
      const controls = contract.customizationPolicy.filter(policy => policy.status !== 'deprecated'
        && ['allowed', 'constrained'].includes(policy.permission)).flatMap(policy => policy.controlPaths.filter(control => control.kind === 'slot-api'
          && control.target === targets[0].id && control.property === property && control.contentOwnership === 'external'));
      if (!controls.length) continue;
      let owner = byId.get(String(slot.parentId));
      while (owner && owner.type !== 'INSTANCE' && !unknown(owner, 'parentId') && !unknown(owner, 'type')) owner = byId.get(String(owner.parentId));
      const ownerPath = owner && paths.get(String(owner.id)), expected = ownerPath !== undefined
        ? reference.nodeProperties[correspondingPath(comparison, ownerPath)!] : undefined;
      const identity = record(record(owner?.component).identity);
      if (!owner || owner.type !== 'INSTANCE' || !expected?.identity?.componentKey || identity.componentKey !== expected.identity.componentKey
        || (identity.componentSetKey || '') !== (expected.identity.componentSetKey || '') || unknown(owner, 'component.identity')
        || unknown(owner, 'type') || unknown(owner, 'parentId') || unknown(owner, `component.propertyTypes.${property}`)
        || record(record(owner.component).propertyTypes)[property] !== 'SLOT' || expected.propertyTypes[property] !== 'SLOT') continue;
      if (!controls.some(control => !control.ownerTargetId || (() => {
        const owners = contract.facts.targets.filter(target => target.id === control.ownerTargetId && target.resolution === 'resolved');
        const resolved = owners.length === 1 ? available.targets[owners[0].semanticRole] : undefined;
        return resolved?.state === 'present' && resolved.path === correspondingPath(comparison, ownerPath!);
      })())) continue;
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
  const unresolved = unmatched.filter(id => !external.has(id));
  const marker = record(captured.baselineDiagnostics), baselineIndex = marker.warningIndex;
  const markerAccepted = Object.keys(marker).sort().join(',') === 'kind,unmatchedNodeIds,warning,warningIndex'
    && marker.kind === 'unmatched-baseline' && unmatched.length > 0 && Number.isSafeInteger(baselineIndex)
    && baselineIndex >= 0 && baselineIndex < captured.warnings.length && typeof marker.warning === 'string'
    && captured.warnings[baselineIndex] === marker.warning && Array.isArray(marker.unmatchedNodeIds)
    && marker.unmatchedNodeIds.length === unmatched.length && marker.unmatchedNodeIds.every((id: unknown, index: number) => id === unmatched[index]);
  const warnings = captured.warnings.slice();
  if (external.size && markerAccepted) warnings.splice(baselineIndex, 1,
    ...(unresolved.length ? [`${unresolved.length} узлов instance не сопоставлены с reference baseline.`] : []));
  return { warnings, baselineDiagnostics: { rawWarnings: captured.warnings.slice(), rawUnmatchedBaselineNodeIds: unmatched,
    unresolvedBaselineNodeIds: unresolved, externalSlotPayloadNodeIds: [...external], markerAccepted,
    producer: captured.baselineDiagnostics } };
}
