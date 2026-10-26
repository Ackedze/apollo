import type { CompiledContract, PreviewSnapshot } from './types';
import type { InstanceComparison } from './instance-boundaries';
import { matchesCaptureRepresentation } from './capture-representation';
import { snapshotPaths } from './snapshot-topology';

const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const unknown = (node: Record<string, unknown>, fact: string) => ((node.unknownFacts || []) as string[])
  .some(path => path === fact || fact.startsWith(path + '.') || path.startsWith(fact + '.'));

/** Prove the native SLOT boundary, not its payload or a child contract. */
export function materializeNativeSlotTargets(snapshot: PreviewSnapshot, contract: CompiledContract,
  comparison: InstanceComparison, paths: Map<string, string>): void {
  if (contract.runtimePolicy.nativeSlotTargetsVersion !== 1 || snapshot.source?.truncated
    || !comparison.complete || !snapshot.variantReference?.complete) return;
  const ref = snapshot.variantReference;
  const roots = snapshot.nodes.filter(node => snapshot.selection.includes(String(node.id)));
  const reps = contract.facts.representations.filter(rep => rep.status !== 'deprecated'
    && rep.platform === snapshot.context.platform && matchesCaptureRepresentation(rep, ref.componentKey, ref.componentSetKey));
  if (roots.length !== 1 || reps.length !== 1) return;
  const pathFor = (target: CompiledContract['facts']['targets'][number]) => {
    return selectedTargetPathHint(target,reps[0].id,ref.componentKey,contract.facts.variantEvidence?.occurrenceAddressVersion===1)?.split(' / ').slice(1).join(' / ');
  };
  for (const target of contract.facts.targets) {
    const controls = contract.customizationPolicy.filter(rule => rule.targetId === target.id
      && rule.status !== 'deprecated' && ['allowed', 'constrained'].includes(rule.permission))
      .flatMap(rule => rule.controlPaths.filter(control => control.kind === 'slot-api' && control.target === target.id && control.property))
      .filter(control => {
        const owner = control.ownerTargetId ? contract.facts.targets.find(t => t.id === control.ownerTargetId) : undefined;
        const ownerPath = owner ? pathFor(owner) : control.ownerTargetId ? undefined : '';
        return ownerPath !== undefined && ref.nodeProperties[ownerPath]?.propertyTypes[control.property!] === 'SLOT';
      });
    const anchors = [...new Set(controls.map(control => control.property!))];
    const ownerIds = [...new Set(controls.map(control => control.ownerTargetId || ''))];
    const slotPath = pathFor(target);
    if (target.resolution !== 'resolved' || anchors.length !== 1 || ownerIds.length !== 1 || !slotPath
      || contract.facts.targets.filter(other => other.semanticRole === target.semanticRole).length !== 1) continue;
    const property = anchors[0];
    const owners = ownerIds[0] ? contract.facts.targets.filter(other => other.id === ownerIds[0] && other.resolution === 'resolved') : [];
    if (ownerIds[0] && owners.length !== 1) continue;
    const ownerPath = owners.length ? pathFor(owners[0]) : '';
    if (ownerPath === undefined || slotPath.split(' / ').slice(0, -1).join(' / ') !== ownerPath) continue;
    const actualOwners = ownerIds[0] ? snapshot.nodes.filter(node => node.type === 'INSTANCE'
      && record(node.semantic).role === owners[0].semanticRole
      && comparison.referencePaths?.[paths.get(String(node.id))!] === ownerPath) : roots;
    if (actualOwners.length !== 1) continue;
    const owner = actualOwners[0], expectedOwner = ref.nodeProperties[ownerPath];
    const identity = record(record(owner.component).identity), expectedIdentity = expectedOwner?.identity;
    const proof = record(owner.baselineProvenance);
    const results = snapshot.instanceContentResults?.filter(r => r.boundaryNodeId === owner.id) || [];
    const attempts = snapshot.instanceContentReferences?.attempts.filter(a => a.boundaryNodeId === owner.id) || [];
    if (ownerIds[0] && proof.status === 'matched' && proof.kind === 'independent-host-variant'
      && proof.boundaryNodeId === owner.id && proof.componentKey === identity.componentKey
      && results.length === 1 && results[0].status === 'matched' && results[0].lineageProven
      && attempts.length === 1 && !attempts[0].failure && attempts[0].strategy === 'pristine-host-variant-properties'
      && attempts[0].reference && !attempts[0].reference.source?.truncated && ownerPath !== undefined) {
      const independent = attempts[0].reference, addresses = snapshotPaths(independent);
      const owners = independent.nodes.filter(n => addresses?.get(String(n.id)) === ownerPath);
      const expected = record(record(owners[0]?.component).identity);
      const known = owners.length === 1 && expected.componentKey === identity.componentKey
        && expected.componentSetKey === identity.componentSetKey && !unknown(owner, 'component.propertyTypes')
        && !unknown(owners[0], 'component.propertyTypes')
        && controls.every(c => record(record(owner.component).propertyTypes)[c.property!]
          === record(record(owners[0].component).propertyTypes)[c.property!]);
      if (known && !snapshot.nodes.some(n => n.type === 'SLOT' && n.parentId === owner.id)
        && !independent.nodes.some(n => n.type === 'SLOT' && n.parentId === owners[0].id)) {
        for (const entry of snapshot.nodes) {
          const available = record(entry.variantAvailability);
          available.targets = { ...record(available.targets), [target.semanticRole]: { present: false, referenceState: 'absent', evidence: 'independent-host-variant-slot-absence' } };
          entry.variantAvailability = available;
          entry.unknownFacts = ((entry.unknownFacts || []) as string[]).filter(p => p !== `variantAvailability.targets.${target.semanticRole}.present`);
        }
        continue;
      }
    }
    if (!expectedIdentity?.componentKey || identity.componentKey !== expectedIdentity.componentKey
      || (identity.componentSetKey || '') !== (expectedIdentity.componentSetKey || '')
      || unknown(owner, 'component.identity') || unknown(owner, `component.propertyTypes.${property}`)
      || record(record(owner.component).propertyTypes)[property] !== 'SLOT'
      || expectedOwner.propertyTypes[property] !== 'SLOT') continue;
    const nativeActual = snapshot.nodes.filter(node => node.type === 'SLOT' && node.parentId === owner.id
      && record(record(node.component).propertyReferenceBindings).slotContentId === property);
    const nativeRef = ref.nodes.filter(node => node.type === 'SLOT'
      && node.path.split(' / ').slice(0, -1).join(' / ') === ownerPath
      && ref.nodeProperties[node.path]?.propertyReferenceBindings?.slotContentId === property);
    if (nativeActual.length !== 1 || nativeRef.length !== 1 || nativeRef[0].path !== slotPath) continue;
    const node = nativeActual[0], actualPath = paths.get(String(node.id));
    if (!actualPath || comparison.referencePaths?.[actualPath] !== slotPath
      || unknown(node, 'component.propertyReferenceBindings') || unknown(node, 'type') || unknown(node, 'parentId')
      || snapshot.nodes.some(other => other !== node && record(other.semantic).role === target.semanticRole)) continue;
    node.semantic = { ...record(node.semantic), role: target.semanticRole };
    node.unknownFacts = ((node.unknownFacts || []) as string[]).filter(path => path !== 'semantic.role');
    for (const entry of snapshot.nodes) {
      const availability = record(entry.variantAvailability);
      availability.targets = { ...record(availability.targets), [target.semanticRole]: {
        present: true, referenceState: 'present', evidence: 'native-slot-content-reference',
      } };
      entry.variantAvailability = availability;
      entry.unknownFacts = ((entry.unknownFacts || []) as string[])
        .filter(path => path !== `variantAvailability.targets.${target.semanticRole}.present`);
    }
    if (controls.some(control => control.contentOwnership === 'external')) {
      node.slotBoundaryV1 = { contentOwnership: 'external', targetId: target.id, property,
        evidence: 'native-slot-content-reference', ...(ownerIds[0] ? { ownerTargetId: ownerIds[0] } : {}) };
    }
  }
}
import { selectedTargetPathHint } from './occurrence-address';
