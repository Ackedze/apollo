const { boundedRead } = require('../document-audit/reads');
const { CAPTURE_SCHEMA } = require('./progressbar-protocol');

// This pilot observes only the visible selected subtree. It never imports or edits components.
function createProgressBarCapture({ api, hash, post, isBusy = () => false, now = Date.now, readShared = () => null }) {
  let revision = 0, sequence = 0, active = null, current = null, page = null, expectedFocusId = null, observation = null;
  const error = code => Object.assign(Error(code), { code });
  function invalidate() {
    revision++; active = null;
    if (current) post({ type: 'progressbar-invalidated', captureId: current.capture.captureId });
    current = null; observation = null;
  }
  function affectsObservation(change) {
    if (!change || !['CREATE','DELETE','PROPERTY_CHANGE'].includes(change.type) || typeof change.id !== 'string'
      || change.node?.id !== change.id || (change.type === 'PROPERTY_CHANGE' && (!Array.isArray(change.properties)
        || !change.properties.length || change.properties.some(p => typeof p !== 'string')))) return true;
    if (observation.ids.has(change.id)) return true;
    if (observation.ancestors.has(change.id)) return change.type !== 'PROPERTY_CHANGE'
      || change.properties.some(p => !['name','locked','pluginData'].includes(p));
    // A finished capture has its subtree IDs; in-flight removals have no parent proof.
    if (change.node.removed) return change.type !== 'DELETE' || !current;
    const seen = new Set(); let node = change.node;
    while (node && !seen.has(node.id) && seen.size < 100) {
      if (node.id === observation.root.id) return true;
      if (node.type === 'PAGE') return node.id !== api.currentPage.id;
      seen.add(node.id); node = node.parent;
    }
    return true;
  }
  function observe(event) {
    if (!observation) return;
    try {
      if (!Array.isArray(event?.nodeChanges) || !event.nodeChanges.length || event.nodeChanges.some(affectsObservation)) invalidate();
    } catch { invalidate(); }
  }
  function selectionChanged() {
    if (expectedFocusId && api.currentPage.selection.length === 1 && api.currentPage.selection[0].id === expectedFocusId) { expectedFocusId = null; return; }
    expectedFocusId = null; invalidate();
  }
  function bind() {
    page?.off?.('nodechange', observe); page = api.currentPage; page?.on?.('nodechange', observe); invalidate();
  }
  async function facts(root, guard, deadline = now() + 15000) {
    const nodes = [], refs = new Map(); let textChars = 0, hidden = 0, instances = 0;
    async function walk(node, parentId, depth) {
      guard();
      if (depth > 24 || nodes.length >= 300 || node.removed) throw error('PROGRESSBAR_CAPTURE_INCOMPLETE');
      if (observation?.root === root) observation.ids.add(node.id);
      if (node.visible === false) { hidden++; return; }
      const item = { id: node.id, parentId, type: node.type, name: node.name, visible: true };
      if (typeof item.id !== 'string' || typeof item.name !== 'string' || item.name.length > 1000) throw error('PROGRESSBAR_CAPTURE_INCOMPLETE');
      if (node.type === 'TEXT') {
        item.text = node.characters; textChars += typeof item.text === 'string' ? item.text.length : 30001;
        if (typeof item.text !== 'string' || item.text.length > 4000 || textChars > 24000) throw error('PROGRESSBAR_CAPTURE_INCOMPLETE');
      }
      if (node.type === 'INSTANCE') {
        if (++instances > 32) throw error('PROGRESSBAR_CAPTURE_INCOMPLETE');
        const main = await boundedRead(() => node.getMainComponentAsync(), Math.min(12000, deadline - now()), guard);
        if (!main || !/^[a-f0-9]{40}$/i.test(main.key)) throw error('PROGRESSBAR_IDENTITY_UNAVAILABLE');
        const set = main.parent?.type === 'COMPONENT_SET' ? main.parent : null;
        item.component = { key: main.key, setKey: set?.key || null, name: set?.name || main.name, variants: {} };
        const variants = node.variantProperties || {};
        if (Object.keys(variants).length > 32) throw error('PROGRESSBAR_CAPTURE_INCOMPLETE');
        for (const key of Object.keys(variants)) {
          if (key.length > 100 || typeof variants[key] !== 'string' || variants[key].length > 200) throw error('PROGRESSBAR_CAPTURE_INCOMPLETE');
          item.component.variants[key] = variants[key];
        }
      }
      nodes.push(item); refs.set(item.id, node);
      if ('children' in node) for (const child of node.children) await walk(child, node.id, depth + 1);
    }
    await walk(root, null, 0); guard();
    return { nodes, refs, hidden };
  }
  async function verify(captureId, requireSelection = true) {
    const entry = current, deadline = now() + 15000;
    const guard = () => {
      if (!entry || current !== entry || entry.revision !== revision || api.currentPage.id !== entry.capture.pageId || entry.root.removed
        || isBusy() || now() >= deadline || (requireSelection && (api.currentPage.selection.length !== 1 || api.currentPage.selection[0].id !== entry.root.id))) throw error('PROGRESSBAR_CAPTURE_STALE');
    };
    guard(); if (captureId !== entry.capture.captureId) throw error('PROGRESSBAR_CAPTURE_STALE');
    if (entry.shared) { await boundedRead(() => entry.shared.verify(), Math.max(1, deadline - now()), guard); guard(); }
    const actual = await facts(entry.root, guard, deadline); guard();
    if (hash(actual.nodes) !== hash(entry.capture.nodes) || actual.hidden !== entry.capture.excludedHidden) { invalidate(); throw error('PROGRESSBAR_CAPTURE_STALE'); }
    return entry;
  }
  async function capture(requestId) {
    invalidate();
    if (isBusy() || api.currentPage.selection.length !== 1) throw error('PROGRESSBAR_SELECT_ONE_AREA');
    const root = api.currentPage.selection[0], pageId = api.currentPage.id, expected = revision, ticket = ++sequence;
    observation = { root, ids: new Set([root.id]), ancestors: new Set() };
    let ancestor = root.parent;
    while (ancestor) {
      if (observation.ancestors.has(ancestor.id) || observation.ancestors.size >= 100) throw error('PROGRESSBAR_CAPTURE_INCOMPLETE');
      observation.ancestors.add(ancestor.id);
      if (ancestor.type === 'PAGE' || ancestor.type === 'DOCUMENT') break;
      ancestor = ancestor.parent;
    }
    active = ticket; const deadline = now() + 25000;
    const guard = () => {
      if (active !== ticket || revision !== expected || api.currentPage.id !== pageId || api.currentPage.selection.length !== 1
        || api.currentPage.selection[0].id !== root.id || isBusy() || now() >= deadline) throw error('PROGRESSBAR_CAPTURE_STALE');
    };
    guard(); const shared = readShared(root); guard();
    let before;
    if (shared) {
      if (!shared.complete || shared.root !== root || shared.pageId !== pageId || shared.nodes.length > 300) throw error('PROGRESSBAR_CAPTURE_INCOMPLETE');
      await boundedRead(() => shared.verify(), Math.max(1, deadline - now()), guard); guard();
      before = { nodes: shared.nodes, refs: shared.refs, hidden: shared.excludedHidden };
      for (const id of shared.observedIds) observation.ids.add(id);
    } else before = await facts(root, guard, deadline);
    if (!Number.isFinite(root.width) || !Number.isFinite(root.height) || root.width <= 0 || root.height <= 0) throw error('PROGRESSBAR_IMAGE_UNAVAILABLE');
    const bytes = await boundedRead(() => shared ? shared.image() : root.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: Math.min(1, 1600 / root.width, 1600 / root.height) } }), Math.max(1, deadline - now()), guard);
    if (!bytes || bytes.length < 24 || bytes.length > 3 * 1024 * 1024) throw error('PROGRESSBAR_IMAGE_UNAVAILABLE');
    if (shared) { await boundedRead(() => shared.verify(), Math.max(1, deadline - now()), guard); guard(); }
    const after = shared ? before : await facts(root, guard, deadline); guard();
    if (hash(before.nodes) !== hash(after.nodes) || before.hidden !== after.hidden) throw error('PROGRESSBAR_CAPTURE_STALE');
    const value = { schemaVersion: CAPTURE_SCHEMA, captureId: shared ? shared.id : requestId, capturedAt: new Date(now()).toISOString(), pageId,
      rootId: root.id, fileKey: api.fileKey || null, complete: true, excludedHidden: before.hidden, nodes: before.nodes,
      screenshot: { nodeId: root.id, mimeType: 'image/png', dataBase64: api.base64Encode(bytes) } };
    value.fingerprint = hash(value); current = { capture: value, refs: before.refs, root, revision: expected, shared }; active = null;
    return value;
  }
  async function handle(message) {
    const reply = value => post(Object.assign({ type: 'progressbar-native-result', requestId: message.requestId, operation: message.operation }, value));
    try {
      if (Object.keys(message).sort().join(',') !== 'captureId,nodeId,operation,requestId,type' || typeof message.requestId !== 'string' || !message.requestId || message.requestId.length > 160
        || !['capture', 'verify', 'focus', 'cancel'].includes(message.operation) || (message.captureId !== null && typeof message.captureId !== 'string')
        || (message.nodeId !== null && typeof message.nodeId !== 'string')) throw error('PROGRESSBAR_REQUEST_INVALID');
      if (message.operation === 'cancel') { invalidate(); reply({ result: true }); return; }
      if (message.operation === 'capture') { reply({ result: await capture(message.requestId) }); return; }
      const entry = await verify(message.captureId, message.operation !== 'focus');
      if (message.operation === 'focus') {
        const node = entry.refs.get(message.nodeId); if (!node || node.removed) throw error('PROGRESSBAR_TARGET_UNAVAILABLE');
        expectedFocusId = node.id; api.currentPage.selection = [node]; api.viewport.scrollAndZoomIntoView([node]);
      }
      reply({ result: true });
    } catch (cause) { reply({ error: cause.code || 'PROGRESSBAR_CAPTURE_INCOMPLETE' }); }
  }
  return { start() { bind(); api.on('selectionchange', selectionChanged); api.on('currentpagechange', bind); },
    close() { page?.off?.('nodechange', observe); api.off?.('selectionchange', selectionChanged); api.off?.('currentpagechange', bind); invalidate(); },
    accept(message) { if (message?.type !== 'progressbar-native-request') return false; void handle(message); return true; }, capture, verify, invalidate };
}
module.exports = { createProgressBarCapture };
