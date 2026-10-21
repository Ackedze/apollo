import type { CompiledContract, PreviewSnapshot } from './types';
import { snapshotPaths } from './snapshot-topology';
import { matchesCaptureRepresentation } from './capture-representation';
import { resolveComponentProperty } from './component-property-identity';
import { matchesTargetRole } from './root-target';

const record = (v: unknown): Record<string, any> => v && typeof v === 'object' ? v as Record<string, any> : {};
const unknown = (n: Record<string, unknown>, fact: string) => ((n.unknownFacts || []) as string[])
  .some(p => p === fact || fact.startsWith(p + '.'));

/** Read-only semantic projections. Existing role resolution/visibility evidence is
 * authoritative; neither the configured boolean nor the layer name is a fallback. */
export function materializeTargetSemanticFacts(snapshot: PreviewSnapshot, contract: CompiledContract): void {
  if (contract.runtimePolicy.semanticTargetVisibilityVersion !== 1) return;
  const roots = snapshot.nodes.filter(n => snapshot.selection.includes(String(n.id)));
  const root = roots.length === 1 ? roots[0] : undefined;
  if (!root) return;
  const paths = snapshotPaths(snapshot);
  const identity = record(record(root.component).identity);
  const sourceKey = snapshot.source?.componentKey ?? '';
  const sourceSetKey = snapshot.source?.componentSetKey ?? '';
  const reps = contract.facts.representations.filter(r => r.platform === snapshot.context.platform
    && matchesCaptureRepresentation(r, sourceKey, sourceSetKey));
  const identityKnown = sourceKey && identity.componentKey === sourceKey
    && (identity.componentSetKey ?? '') === sourceSetKey
    && !unknown(root, 'component.identity.componentKey') && !unknown(root, 'component.identity.componentSetKey');
  for (const property of contract.facts.semanticApi.filter(p => p.bindings.some(b => b.targetId && !b.ownedOccurrence && !b.nativeSlotBinding))) {
    const bindings = property.bindings.filter(b => b.representationId === reps[0]?.id);
    const binding = bindings.length === 1 ? bindings[0] : undefined;
    const target = contract.facts.targets.filter(t => t.id === binding?.targetId);
    const role = target[0]?.semanticRole;
    const candidates = snapshot.nodes.filter(n => matchesTargetRole(n, role, contract) && !unknown(n, 'semantic.role'));
    const available = record(record(root.variantAvailability).targets)[role];
    const resolved = snapshot.targetResolution?.targets.filter(t => t.targetId === binding?.targetId);
    const anchor = available?.present === true || (resolved?.length === 1 && resolved[0].resolution === 'resolved'
      && candidates.length === 1 && resolved[0].nodeId === String(candidates[0].id));
    const absent = available?.present === false && candidates.length === 0;
    const targetKnown = Boolean(paths && identityKnown && reps.length === 1 && bindings.length === 1
      && binding && (binding.path === 'visibility.effective' || binding.path.startsWith('component.properties.'))
      && [undefined, 'identity'].includes(binding.transform)
      && target.length === 1 && target[0].resolution === 'resolved'
      && contract.facts.targets.filter(t => t.semanticRole === role).length === 1
      && (absent || (anchor && candidates.length === 1)));
    const fact = `semanticApi.${property.id}`;
    const sourceFact = `ruleScopeV1.targets.${role}.visible`;
    const isVisibility = binding?.path === 'visibility.effective';
    const visible = targetKnown && !unknown(root, sourceFact) ? record(record(root.ruleScopeV1).targets)[role]?.visible : undefined;
    let value: unknown = isVisibility ? visible : undefined;
    if (targetKnown && !isVisibility && !absent && candidates.length === 1) {
      const node = candidates[0], data = record(node.component);
      const resolved = resolveComponentProperty(binding!.path.slice('component.properties.'.length), data,
        property.valueType === 'boolean' ? ['BOOLEAN'] : property.kind === 'variant' ? ['VARIANT'] : ['TEXT', 'VARIANT']);
      if ('name' in resolved && !unknown(node, `component.properties.${resolved.name}`)
        && !unknown(node, `component.propertyTypes.${resolved.name}`)) {
        const raw = record(data.properties)[resolved.name];
        if ((property.valueType === 'boolean' ? typeof raw === 'boolean' : typeof raw === 'string')
          && (!property.domain || property.domain.includes(raw))) value = raw;
      }
    }
    const known = value !== undefined;
    const values = record(root.semanticApi);
    delete values[property.id];
    if (known) values[property.id] = value;
    root.semanticApi = values;
    root.semanticBindingEvidence = { ...record(root.semanticBindingEvidence), [property.id]: {
      reason: known ? 'resolved' : targetKnown ? isVisibility ? 'target-visibility-unknown' : 'target-property-unknown' : 'target-unresolved',
      representationId: reps.length === 1 ? reps[0].id : undefined,
      targetId: binding?.targetId, path: binding?.path, readOnly: true,
      ...(known ? isVisibility ? { effectiveVisible: visible, confirmedAbsent: absent } : { value } : {}),
    } };
    // Keep property availability distinct from its boolean value. A confirmed
    // absent target is a known false visibility, not an unsupported property.
    for (const node of snapshot.nodes) {
      const missing = new Set(((node.unknownFacts || []) as string[]).filter(p => p !== `variantAvailability.properties.${property.id}`
        && p !== `host.${fact}` && (node !== root || p !== fact)));
      const availability = record(node.variantAvailability), properties = { ...record(availability.properties) };
      delete properties[property.id];
      if (targetKnown) properties[property.id] = true;
      else missing.add(`variantAvailability.properties.${property.id}`);
      node.variantAvailability = { ...availability, properties };
      if (!known) { missing.add(`host.${fact}`); if (node === root) missing.add(fact); }
      node.host = { ...record(node.host), semanticApi: JSON.parse(JSON.stringify(values)) };
      node.unknownFacts = [...missing];
    }
  }
}
