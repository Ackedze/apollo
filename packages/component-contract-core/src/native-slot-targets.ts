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
  if (![1,2].includes(contract.runtimePolicy.nativeSlotTargetsVersion || 0) || snapshot.source?.truncated
    || !comparison.complete || !snapshot.variantReference?.complete) return;
  const ref = snapshot.variantReference;
  const roots = snapshot.nodes.filter(node => snapshot.selection.includes(String(node.id)));
  const reps = contract.facts.representations.filter(rep => rep.status !== 'deprecated'
    && rep.platform === snapshot.context.platform && matchesCaptureRepresentation(rep, ref.componentKey, ref.componentSetKey));
  if (roots.length !== 1 || reps.length !== 1) return;
  const pathFor = (target: CompiledContract['facts']['targets'][number]) => {
    return selectedTargetPathHint(target,reps[0].id,ref.componentKey,contract.facts.variantEvidence?.occurrenceAddressVersion===1)?.split(' / ').slice(1).join(' / ');
  };
  const byId = new Map(snapshot.nodes.map(node => [String(node.id), node]));
  const ownerOf = (node: PreviewSnapshot['nodes'][number]) => {
    const seen = new Set<string>();
    let current = node;
    while (current.parentId !== null) {
      if (unknown(current, 'parentId') || seen.has(String(current.parentId))) return;
      seen.add(String(current.parentId));
      const parent = byId.get(String(current.parentId));
      if (!parent || unknown(parent, 'type')) return;
      if (parent.type === 'INSTANCE') return parent;
      if (!['FRAME', 'GROUP', 'BOOLEAN_OPERATION'].includes(String(parent.type))) return;
      current = parent;
    }
  };
  const referenceOwnerOf = (path: string): string | undefined => {
    let parent = path.split(' / ').slice(0, -1).join(' / ');
    while (parent) {
      const nodes = ref.nodes.filter(node => node.path === parent);
      if (nodes.length !== 1) return;
      if (nodes[0].type === 'INSTANCE') return parent;
      if (!['FRAME', 'GROUP', 'BOOLEAN_OPERATION'].includes(nodes[0].type)) return;
      parent = parent.split(' / ').slice(0, -1).join(' / ');
    }
    return '';
  };
  for (const target of contract.facts.targets) {
    if (contract.runtimePolicy.nativeSlotTargetsVersion === 2) {
      if (contract.package.sourceExportVersion !== 'component-contract-editor@0.2.110') throw new Error('NATIVE_SLOT_ABSENCE_UNSUPPORTED');
      const declarations = contract.customizationPolicy.filter(r => r.targetId === target.id && r.status !== 'deprecated' && ['allowed','constrained'].includes(r.permission))
        .flatMap(r => r.controlPaths.filter(p => p.kind === 'slot-api' && p.target === target.id && p.property && p.ownerTargetId));
      const ownerIds = [...new Set(declarations.map(p => p.ownerTargetId))];
      const owners = ownerIds.length === 1 ? contract.facts.targets.filter(t => t.id === ownerIds[0] && t.resolution === 'resolved') : [];
      const ownerPath = owners.length === 1 ? pathFor(owners[0]) : undefined, slotPath = pathFor(target);
      const variants = contract.facts.variantEvidence?.variants.filter(v => v.componentKey === ref.componentKey && v.componentSetKey === ref.componentSetKey) || [];
      const catalog = variants.length === 1 ? contract.facts.variantEvidence?.structures[variants[0].structureId] : undefined;
      const expected = ownerPath === undefined ? undefined : ref.nodeProperties[ownerPath];
      const actual = ownerPath === undefined ? [] : snapshot.nodes.filter(n => n.type === 'INSTANCE' && record(n.semantic).role === owners[0].semanticRole
        && comparison.referencePaths?.[paths.get(String(n.id))!] === ownerPath);
      if (target.resolution === 'resolved' && declarations.length && ownerPath && slotPath
        && slotPath.split(' / ').slice(0,-1).join(' / ') === ownerPath && Array.isArray(catalog)
        && !catalog.some(n => n.path === slotPath || n.type === 'SLOT' && n.path.split(' / ').slice(0,-1).join(' / ') === ownerPath)
        && !ref.nodes.some(n => n.path === slotPath || n.type === 'SLOT' && n.path.split(' / ').slice(0,-1).join(' / ') === ownerPath)
        && actual.length === 1 && expected?.identity?.componentKey
        && ['verified','partial'].includes(String(record(roots[0].variantAvailability).status))) {
        const owner = actual[0], component = record(owner.component), identity = record(component.identity);
        const proof = record(owner.baselineProvenance);
        const boundary = comparison.boundaries.some(b => ownerPath === b.referencePath || ownerPath.startsWith(b.referencePath + ' / '));
        if (!boundary && proof.status === 'matched' && proof.referencePath === ownerPath
          && identity.componentKey === expected.identity.componentKey && identity.componentSetKey === expected.identity.componentSetKey
          && identity.mainComponentId === expected.identity.mainComponentId
          && !unknown(owner,'component.identity') && !unknown(owner,'component.propertyTypes') && !unknown(owner,'component.properties')
          && declarations.every(p => component.propertyTypes?.[p.property!] === undefined && expected.propertyTypes[p.property!] === undefined)
          && !Object.values(component.propertyTypes || {}).includes('SLOT') && !Object.values(expected.propertyTypes).includes('SLOT')
          && !snapshot.nodes.some(n => n.parentId === owner.id && n.type === 'SLOT')) {
          for (const node of snapshot.nodes) {
            const available = record(node.variantAvailability);
            available.targets = {...record(available.targets), [target.semanticRole]:{present:false,referenceState:'absent',evidence:'independent-native-slot-absence-v2'}};
            node.variantAvailability = available;
            node.unknownFacts = ((node.unknownFacts || []) as string[]).filter(p => p !== `variantAvailability.targets.${target.semanticRole}.present`);
          }
          continue;
        }
      }
    }
    const controls = contract.customizationPolicy.filter(rule => rule.targetId === target.id
      && rule.status !== 'deprecated' && ['allowed', 'constrained'].includes(rule.permission))
      .flatMap(rule => rule.controlPaths.filter(control => control.kind === 'slot-api' && control.target === target.id && control.property))
      .filter(control => {
        const owner = control.ownerTargetId ? contract.facts.targets.find(t => t.id === control.ownerTargetId) : undefined;
        const ownerPath = owner ? pathFor(owner) : control.ownerTargetId ? undefined : '';
        return ownerPath !== undefined && ['SLOT', 'INSTANCE_SWAP'].includes(String(ref.nodeProperties[ownerPath]?.propertyTypes[control.property!]));
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
    if (ownerPath === undefined || referenceOwnerOf(slotPath) !== ownerPath) continue;
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
    const nativeType = String(expectedOwner?.propertyTypes[property] || '');
    if (!['SLOT', 'INSTANCE_SWAP'].includes(nativeType)
      || !expectedIdentity?.componentKey || identity.componentKey !== expectedIdentity.componentKey
      || (identity.componentSetKey || '') !== (expectedIdentity.componentSetKey || '')
      || unknown(owner, 'component.identity') || unknown(owner, `component.propertyTypes.${property}`)
      || record(record(owner.component).propertyTypes)[property] !== nativeType) continue;
    const nodeType = nativeType === 'SLOT' ? 'SLOT' : 'INSTANCE';
    const binding = nativeType === 'SLOT' ? 'slotContentId' : 'mainComponent';
    const nativeActual = snapshot.nodes.filter(node => node.type === nodeType && ownerOf(node) === owner
      && record(record(node.component).propertyReferenceBindings)[binding] === property);
    const nativeRef = ref.nodes.filter(node => node.type === nodeType && referenceOwnerOf(node.path) === ownerPath
      && ref.nodeProperties[node.path]?.propertyReferenceBindings?.[binding] === property);
    if (nativeActual.length !== 1 || nativeRef.length !== 1 || nativeRef[0].path !== slotPath) continue;
    const node = nativeActual[0], actualPath = paths.get(String(node.id));
    const boundary = comparison.boundaries.filter(entry => entry.nodeId === node.id);
    const swapped = nativeType === 'INSTANCE_SWAP' && boundary.length === 1 && boundary[0].reason === 'instance-swap'
      && boundary[0].referencePath === slotPath && boundary[0].property === property && boundary[0].ownerPath === ownerPath;
    if (!actualPath || (!swapped && comparison.referencePaths?.[actualPath] !== slotPath)
      || unknown(node, 'component.propertyReferenceBindings') || unknown(node, 'type') || unknown(node, 'parentId')
      || snapshot.nodes.some(other => other !== node && record(other.semantic).role === target.semanticRole)) continue;
    if (nativeType === 'INSTANCE_SWAP') {
      const actualIdentity = record(record(node.component).identity), expected = ref.nodeProperties[slotPath]?.identity;
      if (!actualIdentity.componentKey || !actualIdentity.mainComponentId || !expected?.componentKey || !expected.mainComponentId
        || unknown(node, 'component.identity') || unknown(owner, `component.properties.${property}`)
        || record(record(owner.component).properties)[property] !== actualIdentity.mainComponentId
        || expectedOwner.properties[property] !== expected.mainComponentId) continue;
    }
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
        evidence: nativeType === 'SLOT' ? 'native-slot-content-reference' : 'native-instance-swap-reference',
        ...(ownerIds[0] ? { ownerTargetId: ownerIds[0] } : {}) };
    }
  }
}
import { selectedTargetPathHint } from './occurrence-address';
