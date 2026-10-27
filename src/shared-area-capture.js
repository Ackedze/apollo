const { boundedRead } = require('./document-audit/reads');

// Projection of observed actual facts only; independent reference/baseline values never enter it.
function createSharedAreaCapture({ scan, captures, roots, auditId, pageId, hash, verify }) {
  if (roots.length !== 1) return null;
  const root = roots[0], gaps = [], actual = new Map(), identities = new Map(scan.selection.components.map(n => [n.nodeId, n]));
  const metrics = { reusedTextReads: 0, reusedVariantReads: 0, additionalTextReads: 0, additionalVariantReads: 0, pngExports: 0 };
  const gap = reason => { if (!gaps.includes(reason)) gaps.push(reason); };
  if (!scan.selection.complete) gap('incomplete-area-scan');
  for (const entry of captures) {
    const captured = entry.captured;
    if (captured.snapshot.source?.truncated || captured.snapshot.source?.captureTopology?.complete === false) gap('incomplete-contract-capture');
    if (captured.snapshot.source?.nativeSlotCaptureScope?.omissions?.length) gap('opaque-slot-content');
    for (const node of captured.anatomy) {
      if (!node.figmaNodeId) continue;
      const component = node.properties?.component, variants = component?.propertyTypes && component?.properties ? {} : null;
      if (variants) for (const key of Object.keys(component.propertyTypes)) if (component.propertyTypes[key] === 'VARIANT') variants[key] = component.properties[key];
      const value = { text: node.properties?.text?.characters ?? null, key: component?.identity?.componentKey || null,
        setKey: component?.identity?.componentSetKey || null, variants };
      if (actual.has(node.figmaNodeId) && hash(actual.get(node.figmaNodeId)) !== hash(value)) gap('conflicting-actual-observations');
      else actual.set(node.figmaNodeId, value);
    }
  }
  const nodes = [], refs = new Map(), observedIds = new Set(), depths = new Map(); let excludedHidden = 0, textChars = 0, instances = 0;
  for (const row of scan.topology) {
    if (row.length < 8) continue; // Identity rows are already indexed by native node ID.
    const [id, parent, type, name] = row, native = scan.nodes.get(id), observed = actual.get(id);
    if (!native || typeof name !== 'string') { gap('native-node-unavailable'); continue; }
    const item = { id, parentId: id === root.id ? null : parent, type, name, visible: true };
    if (item.parentId !== null && !refs.has(item.parentId)) gap('incomplete-area-topology');
    const depth = item.parentId === null ? 0 : (depths.get(item.parentId) ?? 24) + 1; depths.set(id, depth);
    if (depth > 24 || nodes.length >= 300 || name.length > 1000) gap('pattern-context-limit');
    observedIds.add(id);
    try { if ('children' in native) for (const child of native.children) if (child.visible === false) { excludedHidden++; observedIds.add(child.id); } }
    catch { gap('topology-unavailable'); }
    if (type === 'TEXT') {
      if (typeof observed?.text === 'string') { item.text = observed.text; metrics.reusedTextReads++; }
      else { metrics.additionalTextReads++; try { const text = native.characters; if (typeof text === 'string') item.text = text; } catch { gap('text-unavailable'); } }
      if (typeof item.text !== 'string') gap('text-unavailable');
      else { textChars += item.text.length; if (item.text.length > 4000 || textChars > 24000) gap('pattern-context-limit'); }
    }
    if (type === 'INSTANCE') {
      if (++instances > 32) gap('pattern-context-limit');
      const identity = identities.get(id), variants = {};
      if (identity?.identityRead || !/^[a-f0-9]{40}$/i.test(identity?.componentKey || '')) gap('identity-unavailable');
      if (typeof identity?.componentName !== 'string' || !identity.componentName) gap('identity-name-unavailable');
      if ((observed?.key && observed.key !== identity?.componentKey) || (observed?.setKey && observed.setKey !== identity?.componentSetKey)) gap('identity-conflict');
      if (observed?.variants) {
        Object.assign(variants, observed.variants);
        metrics.reusedVariantReads++;
      } else {
        metrics.additionalVariantReads++;
        try { Object.assign(variants, native.variantProperties || {}); } catch { gap('variants-unavailable'); }
      }
      if (Object.keys(variants).length > 32 || Object.entries(variants).some(([k,v]) => k.length > 100 || typeof v !== 'string' || v.length > 200)) gap('variants-unavailable');
      item.component = { key: identity?.componentKey || '', setKey: identity?.componentSetKey || null, name: identity?.componentName || '', variants };
    }
    nodes.push(item); refs.set(id, native);
  }
  if (!nodes.length || nodes[0].id !== root.id) gap('incomplete-area-topology');
  // Copy out of mutable capture containers before sharing between consumers.
  const immutable = JSON.parse(JSON.stringify(nodes));
  function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  freeze(immutable);
  let png = null;
  const shared = { id: auditId, pageId, root, nodes: immutable, refs, observedIds, excludedHidden, complete: gaps.length === 0,
    gaps: Object.freeze(gaps), metrics, verify,
    async image() {
      await verify();
      if (!shared.complete) throw Error('SHARED_AREA_INCOMPLETE');
      if (!png) {
        metrics.pngExports++;
        png = boundedRead(() => root.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: Math.min(1, 1600 / root.width, 1600 / root.height) } }), 25000, () => {}).catch(error => { png = null; throw error; });
      }
      const bytes = await png; await verify(); return bytes;
    },
  };
  return shared;
}
module.exports = { createSharedAreaCapture };
