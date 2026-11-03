import type { PreparedCatalogReference, CatalogResourceWitness } from './catalog-reference';
import { stableHash } from './stable';

const own = (v: any, key: string) => Object.prototype.hasOwnProperty.call(v || {}, key);
const fail = (code: string, details?: unknown): never => { throw Object.assign(Error(code), { code, details }); };
const unknown = (node: any, path: string) => (node.unknownFacts || []).some((p: string) => p === path || p.startsWith(path + '.') || path.startsWith(p + '.'));

/** Configuration parameters may select independent facts; observed visual values never enter this projection. */
export function configureCatalogReference(reference: PreparedCatalogReference, witnesses: CatalogResourceWitness[]): void {
  const { snapshot, sourceResources: resources } = reference, root = snapshot.nodes[0] as any;
  const metricChanges = new Set<string>(), byId = new Map(snapshot.nodes.map(n => [n.id, n]));
  for (const [name, value] of Object.entries(reference.configuration.config || {})) {
    if (!own(root.component.properties, name)) fail('CATALOG_CONFIGURATION_UNSUPPORTED', { property: name });
    if (root.component.propertyTypes[name] === 'INSTANCE_SWAP') continue; // Compare typed native IDs after key remapping.
    if (stableHash(root.component.properties[name]) === stableHash(value)) continue;
    const type = root.component.propertyTypes[name];
    const wiringKnown = snapshot.nodes.every((n: any) => !unknown(n, 'component.propertyReferences') && !unknown(n, 'component.propertyReferenceBindings'));
    const consumers = snapshot.nodes.filter((n: any) => n.component.propertyReferences.includes(name)
      || Object.values(n.component.propertyReferenceBindings || {}).includes(name));
    // A direct BOOLEAN→visible binding needs no rendered host; geometry after reflow is still unknown.
    const visibilityOnly = wiringKnown && type === 'BOOLEAN' && typeof value === 'boolean'
      && root.component.definedProperties.filter((p: string) => p === name).length === 1
      && typeof root.component.properties[name] === 'boolean' && consumers.length > 0
      && consumers.every((n: any) => n.component.sourceIdentity?.ownerComponentKey === root.component.identity.componentKey
        && n.component.propertyReferences.includes(name)
        && n.component.propertyReferenceBindings?.visible === name
        && Object.entries(n.component.propertyReferenceBindings).every(([field, property]) => property !== name || field === 'visible')
        && !unknown(n, 'visible') && n.visible === root.component.properties[name]);
    if (visibilityOnly) {
      for (const node of consumers as any[]) { node.visible = value; metricChanges.add(node.id); }
      root.component.properties[name] = value;
      continue;
    }
    const unused = root.component.definedProperties.filter((p: string) => p === name).length === 1
      && typeof root.component.properties[name] === typeof value
      && (type === 'BOOLEAN' && typeof value === 'boolean' || type === 'TEXT' && typeof value === 'string')
      && snapshot.nodes.every((n: any) => !unknown(n, 'component.propertyReferences') && !unknown(n, 'component.propertyReferenceBindings')
        && !n.component.propertyReferences.includes(name) && !Object.values(n.component.propertyReferenceBindings || {}).includes(name));
    if (!unused) fail('CATALOG_CONFIGURATION_UNSUPPORTED', { property: name });
    root.component.properties[name] = value;
  }
  const requested = new Map<string, string>();
  for (const [consumerId, modeId] of Object.entries(reference.configuration.modes || {})) {
    // An export may retain other local IDs for the same published collection.
    const matches = witnesses.filter(w => w.kind === 'collection' && w.consumerId === consumerId
      && reference.modePaths.some(path => path.collectionId === w.sourceId));
    if (matches.length !== 1) fail('CATALOG_MODE_CONFIGURATION_UNSUPPORTED', { collectionId: consumerId });
    const witness = matches[0], source = resources.collection[witness.sourceId];
    const selected = witness.consumerModes?.filter(m => m.modeId === modeId);
    const mode = selected?.length === 1 && source?.modes?.filter((m: any) => m.name === selected[0].name);
    if (!mode || mode.length !== 1 || !source.modes.every((m: any) => typeof m.modeId === 'string' && typeof m.name === 'string')
      || new Set(source.modes.map((m: any) => m.modeId)).size !== source.modes.length
      || new Set(source.modes.map((m: any) => m.name)).size !== source.modes.length)
      fail('CATALOG_MODE_IDENTITY_AMBIGUOUS');
    requested.set(witness.sourceId, mode[0].modeId);
  }
  if (!requested.size && !metricChanges.size) return;
  const pairKnown = (family: string, style: string) => reference.fontPairs.some(p => p.family === family && p.style === style);
  for (const node of snapshot.nodes as any[]) {
    if (!node.resolvedModes || typeof node.resolvedModes !== 'object') fail('CATALOG_MODE_SOURCE_UNPROVEN');
    const before = Object.assign({}, node.resolvedModes), parent = byId.get(node.parentId) as any;
    for (const [id, mode] of requested) {
      node.resolvedModes[id] = node === root ? mode : own(node.explicitModes, id) ? node.explicitModes[id] : parent?.resolvedModes[id] || mode;
    }
    const changed = Object.keys(node.resolvedModes).some(id => before[id] !== node.resolvedModes[id]);
    if (!changed) continue;
    if (unknown(node, 'variable.bindings') || node.hostVariableUsageV1?.complete !== true)
      fail('CATALOG_MODE_SOURCE_UNPROVEN', { nodeId: node.id });
    const resolve = (id: string, modes: Record<string, string>, bindings: Record<string, any>, visiting = new Set<string>()): any => {
      if (visiting.has(id) || visiting.size >= 16 || Object.keys(bindings).length >= 128) fail('CATALOG_VARIABLE_ALIAS_CYCLE');
      const variable = own(resources.variable, id) && resources.variable[id];
      if (!variable || !own(variable.valuesByMode, modes[variable.variableCollectionId])) fail('CATALOG_VARIABLE_VALUE_UNAVAILABLE', { variableId: id });
      const collection = resources.collection[variable.variableCollectionId], value = variable.valuesByMode[modes[variable.variableCollectionId]];
      if (!collection) fail('CATALOG_MODE_SOURCE_UNPROVEN');
      visiting.add(id);
      const alias = value && typeof value === 'object' && value.type === 'VARIABLE_ALIAS';
      bindings[id] = { collectionId: collection.id, collectionKey: collection.key, referencedVariableIds: alias ? [value.id] : [] };
      const result = alias ? resolve(value.id, modes, bindings, visiting) : value;
      visiting.delete(id);
      if (variable.resolvedType === 'FLOAT' && (typeof result !== 'number' || !Number.isFinite(result))
        || variable.resolvedType === 'STRING' && typeof result !== 'string' || variable.resolvedType === 'BOOLEAN' && typeof result !== 'boolean')
        fail('CATALOG_VARIABLE_TYPE_MISMATCH');
      return result;
    };
    const selectedBindings: Record<string, any> = {};
    for (const [field, binding] of Object.entries(node.variable.bindings) as Array<[string, any]>) {
      for (const id of binding.tokenIds || []) {
        const oldValue = resolve(id, before, {}), value = resolve(id, node.resolvedModes, selectedBindings);
        if (stableHash(oldValue) === stableHash(value)) continue;
        if (binding.tokenIds.length !== 1) fail('CATALOG_MODE_BINDING_UNSUPPORTED', { field });
        if (field === 'fontFamily' && typeof value === 'string' && node.type === 'TEXT'
          && node.text.fontName?.family === oldValue && pairKnown(value, node.text.fontName.style)) {
          node.text.fontName.family = value; metricChanges.add(node.id);
        } else if (field === 'letterSpacing' && typeof value === 'number' && node.type === 'TEXT'
          && node.text.letterSpacing?.unit === 'PIXELS' && node.text.letterSpacing.value === oldValue) {
          node.text.letterSpacing.value = value; metricChanges.add(node.id);
        } else fail('CATALOG_MODE_BINDING_UNSUPPORTED', { field, nodeId: node.id });
      }
    }
    // Retain roots not represented in ordinary visual fields (e.g. mixed ranges), but replace their selected alias branches.
    const oldBindings = node.hostVariableUsageV1.bindings, aliases = new Set<string>();
    for (const binding of Object.values(oldBindings) as any[]) for (const id of binding.referencedVariableIds) aliases.add(id);
    for (const id of Object.keys(oldBindings)) if (!aliases.has(id)) resolve(id, node.resolvedModes, selectedBindings);
    node.hostVariableUsageV1.bindings = selectedBindings;
    for (const [id, mode] of Object.entries(node.resolvedModes)) {
      const collection = resources.collection[id];
      if (!collection) fail('CATALOG_MODE_SOURCE_UNPROVEN');
      node.variable.modes[collection.key] = mode;
      node.variable.modeCatalog[collection.key] = { collectionId: id, collectionName: collection.name,
        defaultModeId: collection.defaultModeId, modes: collection.modes.map((m: any) => ({ modeId: m.modeId, name: m.name })) };
    }
    if (node === root) Object.assign(snapshot.context.modes, node.resolvedModes);
  }
  // Font metrics are not a rendered layout. Preserve uncertainty on dependent intrinsic dimensions only.
  const pending = Array.from(metricChanges);
  const mark = (node: any) => { if (node && !metricChanges.has(node.id)) { metricChanges.add(node.id); pending.push(node.id); } };
  for (let i = 0; i < pending.length; i++) {
    const node = byId.get(pending[i]) as any, parent = byId.get(node?.parentId) as any;
    if (parent) {
      if (parent.layout.sizingHorizontal === 'HUG' || parent.layout.sizingVertical === 'HUG') mark(parent);
      for (const sibling of snapshot.nodes as any[]) if (sibling.parentId === parent.id
        && (parent.layout.mode === 'HORIZONTAL' && sibling.layout.sizingHorizontal === 'FILL'
          || parent.layout.mode === 'VERTICAL' && sibling.layout.sizingVertical === 'FILL')) mark(sibling);
    }
    for (const child of snapshot.nodes as any[]) if (child.parentId === node.id
      && (child.layout.sizingHorizontal === 'FILL' || child.layout.sizingVertical === 'FILL')) mark(child);
  }
  for (const id of metricChanges) {
    const node = byId.get(id) as any; node.unknownFacts = Array.from(new Set([...(node.unknownFacts || []), 'bounds']));
  }
}
