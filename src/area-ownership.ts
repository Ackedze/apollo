import type { CompiledContract, PreviewSnapshot } from "../packages/component-contract-core/src/types";
import { snapshotPaths } from "../packages/component-contract-core/src/snapshot-topology";
import { variantAvailability } from "../packages/component-contract-core/src/variant-facts";
import { compareInstanceBoundaries, correspondingPath, withinBoundary } from "../packages/component-contract-core/src/instance-boundaries";

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
  for (const node of snapshot.nodes) {
    if (node.type !== 'INSTANCE') continue;
    const path = paths.get(String(node.id))!;
    if (!path || comparison.boundaries.some(boundary => withinBoundary(path, boundary.actualPath))) continue;
    const referencePath = correspondingPath(comparison, path);
    if (referencePath === undefined || external.some(boundary => withinBoundary(referencePath, boundary))) continue;
    const targets = contract.facts.targets.filter(target => target.resolution === 'resolved'
      && available.targets[target.semanticRole]?.state === 'present' && available.targets[target.semanticRole]?.path === referencePath);
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
    if (!expected || !identity.componentKey || identity.componentKey !== expected.componentKey
      || (identity.componentSetKey || '') !== (expected.componentSetKey || '')) continue;
    parts.push({ snapshotNodeId: String(node.id), ownerComponentId: contract.package.componentId,
      ownerContractId: contract.package.id, manualSourceHash: contract.package.manualSourceHash,
      targetId: targets[0].id, targetRole: targets[0].semanticRole, referencePath, reason: 'component-owned-part' });
  }
  return parts;
}
