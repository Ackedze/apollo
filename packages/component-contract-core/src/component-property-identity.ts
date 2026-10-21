/** Figma property IDs remain raw. A display-name binding is only an alias when
 * the observed/declared API proves one unique identity; never repair a stale ID. */
export type ComponentPropertyData = {
  properties?: Record<string, unknown>;
  propertyTypes?: Record<string, unknown>;
  definedProperties?: string[];
  propertyReferences?: string[];
};
export type ComponentPropertyResolution =
  | { name: string; match: 'exact' | 'alias' }
  | { reason: 'property-missing' | 'property-ambiguous' | 'property-type-incompatible' };

export function resolveComponentProperty(
  requested: string, data: ComponentPropertyData, allowedTypes?: string[],
): ComponentPropertyResolution {
  const names = [...new Set([
    ...Object.keys(data.properties || {}), ...Object.keys(data.propertyTypes || {}),
    ...(data.definedProperties || []), ...(data.propertyReferences || []),
  ])];
  const explicitId = /#[^#]+$/.test(requested);
  const candidates = names.filter(name => explicitId ? name === requested : name.replace(/#[^#]+$/, '') === requested);
  if (!candidates.length) return { reason: 'property-missing' };
  if (candidates.length !== 1) return { reason: 'property-ambiguous' };
  const name = candidates[0], type = data.propertyTypes?.[name], alias = name !== requested;
  // Keep exact legacy bindings with absent type metadata readable. An alias
  // requires explicit type evidence; known incompatible types always fail closed.
  if ((alias && !['BOOLEAN', 'TEXT', 'VARIANT', 'INSTANCE_SWAP'].includes(String(type)))
    || (allowedTypes && type !== undefined && !allowedTypes.includes(String(type)))) {
    return { reason: 'property-type-incompatible' };
  }
  return { name, match: alias ? 'alias' : 'exact' };
}
