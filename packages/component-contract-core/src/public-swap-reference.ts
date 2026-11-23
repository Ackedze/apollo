import type { CompiledContract, PreviewSnapshot, SemanticTarget } from './types';

type Reference = NonNullable<PreviewSnapshot['variantReference']>;
export type PublicSwapShape = { targets: SemanticTarget[]; policies: CompiledContract['customizationPolicy']; representations: CompiledContract['facts']['representations'] };
export type PublicSwapSlot = { referencePath: string; bindingPath: string; canonicalPath: string; property: string };
const parent = (path: string) => path.split(' / ').slice(0, -1).join(' / ');
const inside = (path: string, boundary: string) => path === boundary || path.startsWith(boundary + ' / ');

function allowedSwapPolicies(target: SemanticTarget, representationId: string, shape: PublicSwapShape) {
  return shape.policies.filter(p => p.targetId === target.id && p.targetScope === 'self'
    && p.capability === 'component.swap' && p.permission === 'allowed' && p.status !== 'deprecated'
    && p.applicability.scopeStatus === 'confirmed' && p.applicability.variants === 'all' && p.applicability.modes === 'all'
    && (!p.applicability.platforms.length || shape.representations.some(r => r.id === representationId && p.applicability.platforms.includes(r.platform)))
    && !p.targetApplicability && !p.propertyApplicability);
}

/** Permission narrows the projection; an independent typed port and native source prove its boundary. */
export function publicSwapSlots(reference: Reference, shape: PublicSwapShape): PublicSwapSlot[] {
  const root = reference.nodeProperties[''], slots: PublicSwapSlot[] = [];
  if (!reference.complete || reference.occurrenceAddressVersion !== 1 || !root?.identity) return slots;
  for (const target of shape.targets) {
    if (target.resolution !== 'resolved') continue;
    const bindings = target.identityBindingsV1?.filter(b => b.componentKey === reference.componentKey && b.componentSetKey === reference.componentSetKey) || [];
    if (bindings.length !== 1 || bindings[0].nodeType !== 'INSTANCE' || !bindings[0].nativeSource) continue;
    const binding = bindings[0], source = binding.nativeSource!;
    if (source.ownerComponentKey !== root.identity.componentKey) continue;
    const policies = allowedSwapPolicies(target, binding.representationId, shape);
    const candidates = reference.nodes.filter(n => {
      const value = reference.nodeProperties[n.path], native = value?.sourceIdentity;
      return n.type === 'INSTANCE' && native?.version === 1 && native.sourceNodeId === source.sourceNodeId
        && native.ownerComponentKey === source.ownerComponentKey && native.ownerMainComponentId === root.identity!.mainComponentId;
    });
    if (candidates.length !== 1) continue;
    const path = candidates[0].path, value = reference.nodeProperties[path], property = value.propertyReferenceBindings?.mainComponent;
    let owner = parent(path);
    while (owner && !['INSTANCE','COMPONENT','SLOT'].includes(reference.nodes.find(n => n.path === owner)?.type || '')) owner = parent(owner);
    if (owner !== '' || !property || !root.definedProperties?.includes(property)
      || root.propertyTypes[property] !== 'INSTANCE_SWAP' || reference.propertyTypes[property] !== 'INSTANCE_SWAP'
      || typeof root.properties[property] !== 'string' || reference.properties[property] !== root.properties[property]
      || !value.identity?.componentKey || typeof value.identity.componentSetKey !== 'string' || !value.identity.mainComponentId
      || root.properties[property] !== value.identity.mainComponentId
      || reference.nodes.filter(n => reference.nodeProperties[n.path]?.propertyReferenceBindings?.mainComponent === property).length !== 1
      || !policies.some(p => p.controlPaths.some(c => c.kind === 'slot-api' && c.target === target.id
        && c.property === property && c.contentOwnership === 'external' && c.exclusive === true && c.ownerTargetId === undefined))) continue;
    slots.push({referencePath: path, bindingPath: binding.referencePath,
      canonicalPath: [parent(path), '@public-swap:' + encodeURIComponent(source.sourceNodeId)].filter(Boolean).join(' / '), property});
  }
  // Overlapping or duplicate claims cannot grant an external boundary.
  return slots.filter(s => !slots.some(other => other !== s && (inside(s.referencePath, other.referencePath)
    || inside(other.referencePath, s.referencePath) || s.canonicalPath === other.canonicalPath || s.property === other.property)));
}

export function projectPublicSwapStructure(nodes: Reference['nodes'], slots: PublicSwapSlot[], bindingSide = false): Reference['nodes'] {
  const pathFor = (s: PublicSwapSlot) => bindingSide ? s.bindingPath : s.referencePath;
  return nodes.filter(n => !slots.some(s => n.path !== pathFor(s) && inside(n.path, pathFor(s))))
    .map(n => ({path: slots.find(s => n.path === pathFor(s))?.canonicalPath || n.path, type: n.type}))
    .sort((a,b) => a.path.localeCompare(b.path) || a.type.localeCompare(b.type));
}

export function projectPublicSwapNames(names: Record<string,string>, slots: PublicSwapSlot[], bindingSide = false): Record<string,string> {
  const result = Object.assign({}, names);
  for (const slot of slots) {
    const path = bindingSide ? slot.bindingPath : slot.referencePath;
    if (Object.prototype.hasOwnProperty.call(names, path)) result[slot.canonicalPath] = slot.canonicalPath.split(' / ').slice(-1)[0];
  }
  return result;
}

export function projectPublicSwapReference(reference: Reference, shape: PublicSwapShape): Reference {
  const slots = publicSwapSlots(reference, shape), projected: Reference = JSON.parse(JSON.stringify(reference));
  projected.nodes = projectPublicSwapStructure(reference.nodes, slots);
  for (const slot of slots) {
    const value = projected.nodeProperties[slot.referencePath];
    for (const path of Object.keys(projected.nodeProperties)) if (inside(path, slot.referencePath)) delete projected.nodeProperties[path];
    projected.nodeProperties[slot.canonicalPath] = {
      properties: {}, propertyTypes: {}, propertyReferences: [], diagnosticName: slot.canonicalPath.split(' / ').slice(-1)[0],
      propertyReferenceBindings: value.propertyReferenceBindings, sourceIdentity: value.sourceIdentity,
    };
    delete projected.properties[slot.property];
    delete projected.nodeProperties[''].properties[slot.property];
  }
  return projected;
}

/** Only proven external ports with no consumer in this variant may disappear from its identity pin. */
export function projectInactivePublicSwapReference(reference: Reference, shape: PublicSwapShape): Reference {
  const projected = projectPublicSwapReference(reference, shape), slots = publicSwapSlots(reference, shape);
  const root = reference.nodeProperties[''], result = projected.nodeProperties[''];
  for (const target of shape.targets) {
    const bindings = target.identityBindingsV1?.filter(b => b.componentKey === reference.componentKey && b.componentSetKey === reference.componentSetKey) || [];
    if (bindings.length !== 1 || !slots.some(s => s.bindingPath === bindings[0].referencePath)) continue;
    const ports = allowedSwapPolicies(target, bindings[0].representationId, shape).flatMap(p => p.controlPaths)
      .filter(c => c.kind === 'slot-api' && c.target === target.id && c.contentOwnership === 'external' && c.exclusive === true && c.ownerTargetId === undefined)
      .map(c => c.property!);
    for (const property of new Set(ports)) {
      if (slots.some(s => s.property === property) || reference.propertyReferences.includes(property)
        || Object.values(reference.nodeProperties).some(n => n.propertyReferences.includes(property)
          || Object.values(n.propertyReferenceBindings || {}).includes(property))) continue;
      if (reference.propertyTypes[property] !== 'INSTANCE_SWAP' || root.propertyTypes[property] !== 'INSTANCE_SWAP'
        || typeof reference.properties[property] !== 'string' || root.properties[property] !== reference.properties[property]
        || reference.definedProperties?.filter(p => p === property).length !== 1
        || root.definedProperties?.filter(p => p === property).length !== 1) continue;
      delete projected.properties[property]; delete result.properties[property];
      delete projected.propertyTypes[property]; delete result.propertyTypes[property];
      projected.definedProperties = projected.definedProperties!.filter(p => p !== property);
      result.definedProperties = result.definedProperties!.filter(p => p !== property);
    }
  }
  return projected;
}
