// Synthetic components only; no design-system policies or user reports.
const fixture = require("./fixtures");
const { contractHash } = require("../dist/runtime.cjs");
const clone = value => JSON.parse(JSON.stringify(value));

function componentContract(id, key) {
  const contract = fixture.contract();
  contract.package.id = id; contract.package.componentId = id; contract.package.manualRevision = 1;
  contract.facts.component.componentId = id; contract.facts.component.componentKey = key;
  contract.facts.representations[0].locator.componentKey = key;
  contract.customizationPolicy[0].id = id + '.opacity';
  contract.rules[0].ruleId = id + '.opacity.1'; contract.rules[0].source.anchor = id + '.opacity';
  return contract;
}
function reference(snapshot) {
  const nodeProperties = {};
  const nodes = snapshot.nodes.map(node => {
    const path = node.parentId === null ? '' : node.semantic.path.split(' / ').slice(1).join(' / ');
    nodeProperties[path] = { properties: clone(node.component.properties), propertyTypes: clone(node.component.propertyTypes),
      propertyReferences: [], identity: clone(node.component.identity) };
    return { path, type: path ? node.type : 'ROOT' };
  }).sort((a, b) => a.path.localeCompare(b.path) || a.type.localeCompare(b.type));
  const root = snapshot.nodes[0];
  return { componentKey: snapshot.source.componentKey, componentSetKey: snapshot.source.componentSetKey || '', complete: true,
    nodes, properties: clone(root.component.properties), propertyTypes: clone(root.component.propertyTypes), propertyReferences: [], nodeProperties };
}
function dependencyFixture() {
  const child = componentContract('test.child', 'child-key'), host = componentContract('test.host', 'host-key');
  host.package.snapshotProfile = 'dependency-facts-v5';
  host.runtimePolicy.dependencyCompletionVersion = 1;
  const snapshot = fixture.snapshot(); snapshot.source.componentKey = 'host-key'; snapshot.source.captureTopology = { complete: true, issues: [] };
  snapshot.nodes = [];
  function node(id, name, type, parentId, path, key, set = '') {
    const n = { id, name, type, parentId, childIds: [], order: 0, visible: true, semantic: { path }, resolvedModes: {},
      component: { properties: {}, propertyTypes: {}, propertyReferences: [], identity: key ? { componentKey: key, componentSetKey: set } : {} }, appearance: { opacity: 1 } };
    snapshot.nodes.push(n);
    if (parentId) snapshot.nodes.find(entry => entry.id === parentId).childIds.push(id);
    return n;
  }
  node('root', 'Test', 'INSTANCE', null, 'Test', 'host-key');
  const bindings = [];
  for (const side of ['left', 'right']) {
    const name = side === 'left' ? 'Left' : 'Right';
    node(side, name, 'FRAME', 'root', `Test / ${name}`);
    const owner = node(side + '-owner', 'Owner', 'INSTANCE', side, `Test / ${name} / Owner`, 'owner-key', 'owner-set');
    owner.component.properties.Type = 'Child'; owner.component.propertyTypes.Type = 'VARIANT';
    node(side + '-child', 'Child', 'INSTANCE', side + '-owner', `Test / ${name} / Owner / Child`, 'child-key');
    host.facts.targets.push({ id: side, semanticRole: side, pathHint: `Test / ${name}`, resolution: 'resolved' });
    bindings.push({ id: side, targetRole: side, relativePath: 'Owner', childPath: 'Child', ownerComponentSetKeys: ['owner-set'], activeVariant: { property: 'Type', values: ['Child'] } });
  }
  snapshot.variantReference = reference(snapshot);
  const shape = snapshot.variantReference.nodes, structureId = contractHash(shape);
  host.facts.variantEvidence = { schemaVersion: 'apollo.variant-anatomy.v1', sourceHash: 'c'.repeat(64), structures: { [structureId]: shape },
    variants: [{ componentKey: 'host-key', componentSetKey: 'host-key', structureId, properties: {} }] };
  host.componentDependencies = [{ id: 'child', componentId: child.package.componentId, revision: 1, manualSourceHash: child.package.manualSourceHash,
    compiledHash: contractHash(child), contract: child, bindings }];
  snapshot.componentDependencyCaptures = [];
  for (const side of ['left', 'right']) {
    const actual = clone(snapshot.nodes.find(n => n.id === side + '-child'));
    actual.id = 'local'; actual.name = 'Test'; actual.parentId = null; actual.semantic = { path: 'Test', role: 'root' };
    const captured = fixture.snapshot(); captured.source.componentKey = 'child-key'; captured.nodes = [actual]; captured.selection = ['local']; captured.source.rootNodeId = 'local';
    captured.variantReference = reference(captured);
    snapshot.componentDependencyCaptures.push({ nodeId: side + '-child', nodeMap: { local: side + '-child' }, snapshot: captured });
  }
  return { host, child, snapshot };
}
function syncCapture(snapshot, side) {
  const host = snapshot.nodes.find(n => n.id === side + '-child');
  const captured = snapshot.componentDependencyCaptures.find(c => c.nodeId === host.id).snapshot.nodes[0];
  captured.component = clone(host.component); captured.appearance = clone(host.appearance);
}
module.exports = { dependencyFixture, componentContract, reference, syncCapture };
