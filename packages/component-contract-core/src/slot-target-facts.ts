import type { CompiledContract, PreviewSnapshot } from './types';
import { compareInstanceBoundaries } from './instance-boundaries';
import { snapshotPaths } from './snapshot-topology';
import { matchesCaptureRepresentation } from './capture-representation';
import { materializeNativeSlotTargets } from './native-slot-targets';
import { selectedTargetPathHint } from './occurrence-address';

const record = (v: unknown): Record<string, any> => v && typeof v === 'object' ? v as Record<string, any> : {};

/** A manual slot-api declaration plus a unique native BOOLEAN anchor restores
 * only the slot root. Never copy placeholder baselines/roles into its replacement. */
export function materializeSlotTargets(snapshot: PreviewSnapshot, contract: CompiledContract): void {
  if (contract.runtimePolicy.slotTargetFactsVersion !== 1) return;
  for (const node of snapshot.nodes) delete node.slotBoundaryV1;
  // Explicit nested bindings are recomputed each run, including after a failed capture.
  const nestedTargets = new Set(contract.customizationPolicy.flatMap(r => r.controlPaths.filter(p => p.kind === 'slot-api' && p.ownerTargetId).map(p => p.target)));
  for (const target of contract.facts.targets.filter(t => nestedTargets.has(t.id))) for (const node of snapshot.nodes) {
    if (record(node.semantic).role === target.semanticRole) delete record(node.semantic).role;
    delete record(record(node.variantAvailability).targets)[target.semanticRole];
    const key = `variantAvailability.targets.${target.semanticRole}.present`;
    node.unknownFacts = [...new Set([...((node.unknownFacts || []) as string[]), key])];
  }
  if (snapshot.source?.propertyReferenceIdentityVersion !== 1) return;
  const ref = snapshot.variantReference, paths = snapshotPaths(snapshot);
  if (!ref || !paths) return;
  const comparison = compareInstanceBoundaries(snapshot, ref);
  if (!comparison.complete) return;
  const root = snapshot.nodes.find(n => snapshot.selection.includes(String(n.id)));
  if (!root || !['verified','partial'].includes(String(record(root.variantAvailability).status))) return;
  materializeNativeSlotTargets(snapshot, contract, comparison, paths);
  for (const target of contract.facts.targets) {
    const rules = contract.customizationPolicy.filter(r => r.targetId === target.id && r.status !== 'deprecated'
      && ['allowed','constrained'].includes(r.permission));
    const properties = [...new Set(rules.flatMap(r => r.controlPaths.filter(p => p.kind === 'slot-api' && p.target === target.id && p.property).map(p => p.property!)))];
    if (target.resolution !== 'resolved' || properties.length !== 1) continue;
    const representations:CompiledContract['facts']['representations']=contract.facts.representations.filter(r=>r.status!=='deprecated' && r.platform===snapshot.context.platform
      && matchesCaptureRepresentation(r,ref.componentKey,ref.componentSetKey));
    const property = properties[0], referencePath = (contract.runtimePolicy.occurrenceAddressVersion===1
      ? representations.length===1 ? selectedTargetPathHint(target,representations[0].id,ref.componentKey,contract.facts.variantEvidence?.occurrenceAddressVersion===1) : undefined
      : target.pathHint)?.split(' / ').slice(1).join(' / ');
    const declarations = rules.flatMap(r => r.controlPaths.filter(p => p.kind === 'slot-api' && p.target === target.id && p.property === property));
    if (declarations.some(p => p.ownerTargetId !== undefined)) {
      const ownerIds = [...new Set(declarations.map(p => p.ownerTargetId))];
      if (ownerIds.length !== 1 || !ownerIds[0]) continue;
      const owners = contract.facts.targets.filter(t => t.id === ownerIds[0] && t.resolution === 'resolved');
      const reps = contract.facts.representations.filter(r => r.status !== 'deprecated' && r.platform === snapshot.context.platform
        && matchesCaptureRepresentation(r, ref.componentKey, ref.componentSetKey));
      if (owners.length !== 1 || reps.length !== 1 || owners[0].id === target.id) continue;
      const pathFor = (t: typeof target) => {
        return selectedTargetPathHint(t,reps[0].id,ref.componentKey,contract.facts.variantEvidence?.occurrenceAddressVersion===1)?.split(' / ').slice(1).join(' / ');
      };
      const ownerPath = pathFor(owners[0]), slotPath = pathFor(target);
      if (ownerPath === undefined || !slotPath || slotPath.split(' / ').slice(0,-1).join(' / ') !== ownerPath) continue;
      const nodes = snapshot.nodes.filter(n => n.type === 'INSTANCE' && record(n.semantic).role === owners[0].semanticRole
        && comparison.referencePaths?.[paths.get(String(n.id))!] === ownerPath);
      if (nodes.length !== 1) continue;
      const owner = nodes[0], expectedOwner = ref.nodeProperties[ownerPath], ownerComponent = record(owner.component);
      const identity = record(ownerComponent.identity), expectedIdentity = expectedOwner?.identity;
      const unknown = (n: typeof owner, p: string) => ((n.unknownFacts || []) as string[]).some(v => v === p || p.startsWith(v + '.') || v.startsWith(p + '.'));
      if (!expectedIdentity?.componentKey || identity.componentKey !== expectedIdentity.componentKey
        || (identity.componentSetKey || '') !== (expectedIdentity.componentSetKey || '')
        || unknown(owner,'component.identity') || unknown(owner,`component.propertyTypes.${property}`)
        || ownerComponent.propertyTypes?.[property] !== 'BOOLEAN' || expectedOwner.propertyTypes[property] !== 'BOOLEAN'
        || comparison.boundaries.some(b => ownerPath === b.referencePath || ownerPath.startsWith(b.referencePath + ' / '))) continue;
      const nativeRef = ref.nodes.filter(n => n.type === 'INSTANCE' && n.path.split(' / ').slice(0,-1).join(' / ') === ownerPath
        && ref.nodeProperties[n.path]?.propertyReferenceBindings?.visible === property);
      const nativeActual = snapshot.nodes.filter(n => n.type === 'INSTANCE' && n.parentId === owner.id
        && record(record(n.component).propertyReferenceBindings).visible === property);
      if (nativeRef.length !== 1 || nativeRef[0].path !== slotPath || nativeActual.length !== 1) continue;
      const node = nativeActual[0];
      if (unknown(node,'component.propertyReferenceBindings') || unknown(node,'parentId') || unknown(node,'type')
        || comparison.referencePaths?.[paths.get(String(node.id))!] !== slotPath
        || contract.facts.targets.filter(t => t.semanticRole === target.semanticRole).length !== 1
        || snapshot.nodes.some(n => n !== node && record(n.semantic).role === target.semanticRole)) continue;
      node.semantic = { ...record(node.semantic), role: target.semanticRole };
      if (declarations.some(p => p.contentOwnership === 'external')) node.slotBoundaryV1 = {
        contentOwnership:'external',targetId:target.id,property,evidence:'native-slot-reference',ownerTargetId:owners[0].id
      };
      node.unknownFacts = ((node.unknownFacts || []) as string[]).filter(p => p !== 'semantic.role');
      for (const entry of snapshot.nodes) {
        const availability = record(entry.variantAvailability);
        availability.targets = { ...record(availability.targets), [target.semanticRole]: {present:true,referenceState:'present',evidence:'native-nested-slot-reference'} };
        entry.variantAvailability = availability;
        entry.unknownFacts = ((entry.unknownFacts || []) as string[]).filter(p => p !== `variantAvailability.targets.${target.semanticRole}.present`);
      }
      continue;
    }
    if (!referencePath || ref.nodeProperties[referencePath]?.propertyReferenceBindings?.visible !== property
      || ref.nodeProperties['']?.propertyTypes[property] !== 'BOOLEAN') continue;
    if (snapshot.nodes.filter(n => n.type === 'INSTANCE' && n.parentId === root.id && record(record(n.component).propertyReferenceBindings).visible === property).length !== 1
      || ref.nodes.filter(n => n.type === 'INSTANCE' && !n.path.includes(' / ') && ref.nodeProperties[n.path]?.propertyReferenceBindings?.visible === property).length !== 1) continue;
    const candidates = snapshot.nodes.filter(n => n.type === 'INSTANCE' && n.parentId === root.id
      && record(record(n.component).propertyReferenceBindings).visible === property
      && comparison.referencePaths?.[paths.get(String(n.id))!] === referencePath);
    if (candidates.length !== 1 || snapshot.nodes.some(n => n !== candidates[0] && record(n.semantic).role === target.semanticRole)) continue;
    const node = candidates[0]; node.semantic = { ...record(node.semantic), role: target.semanticRole };
    if (rules.some(r => r.controlPaths.some(p => p.kind === 'slot-api' && p.target === target.id && p.property === property && p.contentOwnership === 'external'))) {
      node.slotBoundaryV1 = {contentOwnership:'external',targetId:target.id,property,evidence:'native-slot-reference'};
    }
    node.unknownFacts = ((node.unknownFacts || []) as string[]).filter(p => p !== 'semantic.role');
    for (const entry of snapshot.nodes) {
      const availability = record(entry.variantAvailability);
      availability.targets = { ...record(availability.targets), [target.semanticRole]: { present:true, referenceState:'present', evidence:'native-slot-reference' } };
      entry.variantAvailability = availability;
      entry.unknownFacts = ((entry.unknownFacts || []) as string[]).filter(p => p !== `variantAvailability.targets.${target.semanticRole}.present`);
    }
  }
}
