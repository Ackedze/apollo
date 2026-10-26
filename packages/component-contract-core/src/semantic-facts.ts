import type { CompiledContract, PreviewSnapshot, SemanticApiProperty, SemanticApiBinding } from './types';
import { resolveComponentProperty, type ComponentPropertyData } from './component-property-identity';

/** Explicit root properties and opt-in metadata of an identity-proven representation. */
export function supportedSemanticBinding(binding: SemanticApiBinding): boolean {
  if (binding.targetId !== undefined) return false; // Materialized after target/visibility evidence.
  if (binding.path === 'representation.surface') return binding.transform === 'identity';
  return binding.path.startsWith('component.properties.')
    && ['identity', 'number-to-string', 'boolean-string', 'pascal-case'].includes(binding.transform || 'identity');
}

function decode(value: unknown, property: SemanticApiProperty, transform = 'identity'): unknown {
  if (transform === 'number-to-string') {
    if (!['number', 'enum'].includes(property.valueType) || typeof value !== 'string' || !/^-?\d+(\.\d+)?$/.test(value)) return undefined;
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }
  if (transform === 'boolean-string') {
    if (property.valueType !== 'boolean') return undefined;
    return value === 'True' || value === 'true' ? true : value === 'False' || value === 'false' ? false : undefined;
  }
  if (transform === 'pascal-case') {
    const matches = (property.domain || []).filter((entry) => typeof entry === 'string'
      && entry.charAt(0).toUpperCase() + entry.slice(1) === value);
    return matches.length === 1 ? matches[0] : undefined;
  }
  if (property.valueType === 'boolean') return typeof value === 'boolean' ? value : undefined;
  if (property.valueType === 'number') return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  if (['enum', 'string', 'content'].includes(property.valueType)) return typeof value === 'string' || typeof value === 'number' ? value : undefined;
  return undefined;
}

export function materializeSemanticFacts(snapshot: PreviewSnapshot, contract: CompiledContract): void {
  if (!contract.facts.semanticApi.length) return;
  const keys = [snapshot.source?.componentKey, snapshot.source?.componentSetKey].filter(Boolean);
  const representations = contract.facts.representations.filter((rep) => rep.kind === 'figma'
    && rep.platform === snapshot.context.platform && rep.status !== 'deprecated'
    && keys.some((key) => key === rep.locator.componentKey || key === rep.locator.componentSetKey));
  for (const node of snapshot.nodes.filter((entry) => snapshot.selection.includes(String(entry.id)))) {
    const values: Record<string, unknown> = Object.create(null);
    const evidence: Record<string, unknown> = Object.create(null);
    const unknown = new Set(Array.isArray(node.unknownFacts) ? node.unknownFacts as string[] : []);
    const component = node.component as (ComponentPropertyData & { identity?: Record<string, unknown> }) | undefined;
    for (const property of contract.facts.semanticApi) {
      const fact = `semanticApi.${property.id}`;
      let reason = 'representation-unresolved';
      if (representations.length === 1) {
        const bindings = property.bindings.filter((binding) => binding.representationId === representations[0].id);
        reason = bindings.length === 1 ? 'unsupported-binding' : 'binding-missing-or-ambiguous';
        if (bindings.length === 1 && supportedSemanticBinding(bindings[0])) {
          const binding = bindings[0];
          const surface = binding.path === 'representation.surface';
          const allowedTypes = ['boolean-string', 'number-to-string', 'pascal-case'].includes(binding.transform || '')
            ? ['VARIANT'] : property.valueType === 'boolean' ? ['BOOLEAN']
              : ['TEXT', 'VARIANT', 'INSTANCE_SWAP'];
          const reference = snapshot.variantReference;
          const propertyData = { ...component, definedProperties: [
            ...(component?.definedProperties || []), ...(reference?.definedProperties || []),
            ...Object.keys(reference?.properties || {}), ...Object.keys(reference?.propertyTypes || {}),
          ] };
          const resolved = !surface ? resolveComponentProperty(binding.path.slice('component.properties.'.length), propertyData, allowedTypes) : undefined;
          const name = resolved && 'name' in resolved ? resolved.name : undefined;
          const identity = component?.identity;
          const identityProven = Boolean(snapshot.source?.componentSetKey && identity?.componentSetKey === snapshot.source.componentSetKey
            && snapshot.source?.componentKey && identity?.componentKey === snapshot.source.componentKey
            && [representations[0].locator.componentKey, representations[0].locator.componentSetKey].includes(snapshot.source.componentSetKey))
            || Boolean(!snapshot.source?.componentSetKey && !identity?.componentSetKey
              && snapshot.source?.componentKey && identity?.componentKey === snapshot.source.componentKey
              && representations[0].locator.componentKey === snapshot.source.componentKey);
          const raw = surface ? (identityProven ? representations[0].surface : undefined)
            : name !== undefined ? component?.properties?.[name] : undefined;
          const inputs = surface ? ['component.identity.componentKey', 'component.identity.componentSetKey', binding.path]
            : [binding.path, ...(name !== undefined ? [`component.properties.${name}`, `component.propertyTypes.${name}`] : [])];
          const sourceUnknown = Array.from(unknown).some((path) => inputs.some(input => input === path || input.startsWith(`${path}.`)));
          const value = sourceUnknown ? undefined : decode(raw, property, binding.transform);
          const valid = value !== undefined && (!surface || !property.domain || property.domain.includes(value as string));
          reason = valid ? 'resolved' : 'source-missing-unknown-or-incompatible';
          if (valid) { values[property.id] = value; unknown.delete(fact); }
          evidence[property.id] = { reason, representationId: representations[0].id, path: binding.path, transform: binding.transform || 'identity',
            ...(resolved && 'name' in resolved && resolved.match === 'alias' ? { resolvedPath: `component.properties.${resolved.name}`, match: 'unique-property-alias' } : {}),
            ...(resolved && 'reason' in resolved && resolved.reason === 'property-ambiguous' ? { propertyResolution: resolved.reason } : {}) };
        }
      }
      if (!Object.prototype.hasOwnProperty.call(evidence, property.id)) evidence[property.id] = { reason };
      if (!Object.prototype.hasOwnProperty.call(values, property.id)) unknown.add(fact);
    }
    node.semanticApi = values;
    node.semanticBindingEvidence = evidence;
    node.unknownFacts = Array.from(unknown);
  }
}
