const { boundedRead } = require('../document-audit/reads');
const SCHEMA = 'apollo.link-context-evidence.v1';
const unavailable = () => ({ status: 'unavailable', value: null });
const available = value => ({ status: 'available', value });
const unsupported = () => ({ status: 'not-supported', value: null });

// Actual document facts only. No imports, reference values, or inferred semantic slot names.
async function captureContextEvidence({ api, nodes, refs, guard, deadline, now = Date.now }) {
  const variables = new Map(), collections = new Map();
  const read = fn => boundedRead(fn, Math.max(1, deadline - now()), guard);
  const resource = async (cache, id, fn) => {
    if (!cache.has(id)) cache.set(id, await read(fn));
    return cache.get(id);
  };
  async function binding(id, consumer) {
    const chain = [], seen = new Set(); let current = id;
    try {
      while (current) {
        guard();
        if (seen.has(current) || seen.size >= 16) throw Error('VARIABLE_ALIAS_INCOMPLETE');
        seen.add(current);
        const variable = await resource(variables, current, () => api.variables.getVariableByIdAsync(current));
        if (!variable || variable.resolvedType !== 'COLOR') throw Error('VARIABLE_UNAVAILABLE');
        const collection = await resource(collections, variable.variableCollectionId, () => api.variables.getVariableCollectionByIdAsync(variable.variableCollectionId));
        if (!collection) throw Error('COLLECTION_UNAVAILABLE');
        const modeId = consumer.resolvedVariableModes?.[collection.id] || collection.defaultModeId;
        const mode = collection.modes.find(item => item.modeId === modeId), value = variable.valuesByMode[modeId];
        if (!mode || !value) throw Error('VARIABLE_MODE_UNAVAILABLE');
        const aliasId = value.type === 'VARIABLE_ALIAS' ? value.id : null;
        chain.push({ id: variable.id, key: variable.key, name: variable.name, remote: variable.remote,
          collection: { id: collection.id, key: collection.key, name: collection.name, modeId, modeName: mode.name },
          aliasId, color: aliasId ? null : { r: value.r, g: value.g, b: value.b, a: value.a ?? 1 } });
        current = aliasId;
      }
      return { id, status: 'available', chain };
    } catch (error) { guard(); return { id, status: 'unavailable', chain: [] }; }
  }
  async function paints(value, consumer) {
    if (!Array.isArray(value)) return unavailable();
    if (value.length > 16) throw Error('PROGRESSBAR_CONTEXT_LIMIT');
    const result = [];
    for (const paint of value) {
      const alias = paint.boundVariables?.color;
      result.push({ type: paint.type, visible: paint.visible !== false, opacity: paint.opacity ?? 1,
        color: paint.type === 'SOLID' ? { r: paint.color.r, g: paint.color.g, b: paint.color.b } : null,
        binding: alias?.type === 'VARIABLE_ALIAS' ? await binding(alias.id, consumer) : null });
    }
    return available(result);
  }
  function action(value, depth) {
    if (depth > 8) throw Error('REACTIONS_UNAVAILABLE');
    // Conditional branches are kept explicitly; their conditions are not assumed to execute.
    const result = { type: value.type };
    for (const key of ['url','openInNewTab','destinationId','navigation','variableId','variableCollectionId','variableModeId','mediaAction']) {
      if (value[key] !== undefined) result[key] = value[key];
    }
    if (value.type === 'CONDITIONAL') {
      if (!Array.isArray(value.conditionalBlocks) || value.conditionalBlocks.length > 16) throw Error('REACTIONS_UNAVAILABLE');
      result.branches = value.conditionalBlocks.map(block => ({ conditional: !!block.condition, actions: actions(block.actions, depth + 1) }));
    }
    return result;
  }
  function actions(value, depth = 0) {
    if (!Array.isArray(value) || value.length > 16) throw Error('REACTIONS_UNAVAILABLE');
    return value.map(value => action(value, depth));
  }
  const output = [];
  for (const item of nodes) {
    guard(); const node = refs.get(item.id), fact = { nodeId: item.id };
    if (!node || node.removed) throw Error('PROGRESSBAR_CAPTURE_STALE');
    try { fact.fills = 'fills' in node ? await paints(node.fills, node) : unsupported(); }
    catch { guard(); fact.fills = unavailable(); }
    try {
      const value = node.componentPropertyReferences;
      fact.propertyReferences = available(value == null ? null : Object.assign({}, value));
    } catch { fact.propertyReferences = unavailable(); }
    try {
      if (item.type !== 'INSTANCE') fact.componentProperties = unsupported();
      else {
        const properties = node.componentProperties;
        if (!properties || Object.keys(properties).length > 64) throw Error('PROPERTIES_UNAVAILABLE');
        fact.componentProperties = available(Object.keys(properties).sort().map(name => ({ name, type: properties[name].type, value: properties[name].value })));
      }
    } catch { fact.componentProperties = unavailable(); }
    try {
      if (item.type !== 'TEXT') fact.textSegments = unsupported();
      else {
        const segments = node.getStyledTextSegments(['fills', 'hyperlink', 'textDecoration']);
        if (segments.length > 64) throw Error('PROGRESSBAR_CONTEXT_LIMIT');
        const value = [];
        for (const segment of segments) value.push({ start: segment.start, end: segment.end,
          fills: await paints(segment.fills, node), hyperlink: segment.hyperlink, textDecoration: segment.textDecoration });
        fact.textSegments = available(value);
      }
    } catch { guard(); fact.textSegments = unavailable(); }
    try {
      if (!('reactions' in node)) fact.reactions = unsupported();
      else {
        if (node.reactions.length > 16) throw Error('REACTIONS_UNAVAILABLE');
        fact.reactions = available(node.reactions.map(reaction => ({ trigger: reaction.trigger?.type || null,
          actions: actions(reaction.actions || (reaction.action ? [reaction.action] : [])) })));
      }
    } catch { fact.reactions = unavailable(); }
    try {
      if (!('annotations' in node)) fact.annotations = unsupported();
      else {
        if (node.annotations.length > 16) throw Error('ANNOTATIONS_UNAVAILABLE');
        fact.annotations = available(node.annotations.map(value => ({ label: value.label || '', labelMarkdown: value.labelMarkdown || '' })));
      }
    } catch { fact.annotations = unavailable(); }
    output.push(fact);
  }
  guard();
  const result = { schemaVersion: SCHEMA, nodes: output };
  if (JSON.stringify(result).length > 500000) throw Error('PROGRESSBAR_CONTEXT_LIMIT');
  return result;
}
module.exports = { SCHEMA, captureContextEvidence };
