const test = require('node:test'), assert = require('node:assert/strict');
const core = require(process.env.APOLLO_CONTRACT_CORE || '../dist/core.cjs');
const {fixture: base} = require('./helpers/declared-target.cjs');

function fixture(optIn = true) {
  const f = base(core), {manual: m, snapshot: s} = f;
  delete m.metadata.declaredTargetIdentityVersion;
  const root = s.nodes[0];
  Object.assign(root.component, {properties: {Capacity: '3'}, propertyTypes: {Capacity: 'VARIANT'}});
  const node = (id, type, selected) => ({id, parentId: root.id, name: id, type, order: 0,
    childIds: [], visible: true, unknownFacts: [], component: {propertyReferences: [],
      sourceIdentity: {version: 1, sourceNodeId: 'source-' + id, ownerComponentKey: 'synthetic-variant', ownerMainComponentId: 'synthetic-main'},
      ...(type === 'INSTANCE' ? {identity: {componentKey: 'member-' + id, componentSetKey: 'member-family', mainComponentId: 'main-' + id},
        properties: {Selected: selected}, propertyTypes: {Selected: 'VARIANT'}} : {}),
    }, semantic: {role: id, path: 'Card / ' + id}});
  s.nodes = [root, node('first', 'INSTANCE', 'True'), node('divider', 'FRAME'), node('second', 'INSTANCE', 'False')];
  root.childIds = ['first', 'divider', 'second'];
  s.variantReference = core.captureVariantReference(structuredClone(s), 'synthetic-variant', 'synthetic-set');
  const shape = s.variantReference.nodes, structureId = core.stableHash(shape);
  Object.assign(f.evidence, {occurrenceAddressVersion: 1, structures: {[structureId]: shape},
    occurrences: [{componentKey: 'synthetic-variant', componentSetKey: 'synthetic-set',
      namesByPath: Object.fromEntries(Object.entries(s.variantReference.nodeProperties).map(([p, n]) => [p, n.diagnosticName]))}],
    variants: [{componentKey: 'synthetic-variant', componentSetKey: 'synthetic-set', structureId, properties: {Capacity: '3'}}]});
  m.targets = ['root', 'first', 'second'].map(role => ({id: role, semanticRole: role, label: role, lineage: [], resolution: 'resolved',
    pathHint: role === 'root' ? 'Card' : 'Card / ' + role,
    variantHints: [{representationId: 'desktop', componentKey: 'synthetic-variant', pathHint: role === 'root' ? 'Card' : 'Card / ' + role}]}));
  const collection = {version: 1, ownerTargetRole: 'root', memberTargetRoles: ['first', 'second'], representationIds: ['desktop'],
    visibleOnly: true, filter: {property: 'Selected', propertyType: 'VARIANT', values: ['True']}, assertion: {kind: 'count', min: 1, max: 1}};
  if (optIn) collection.nonMemberReferenceTypes = ['FRAME'];
  m.rules = [Object.assign({}, m.rules[0], {id: 'synthetic.one-selected', capability: 'composition.members', permission: 'constrained',
    targetId: 'root', constraints: [{type: 'memberCollection', collection}], applicability: {
      variants: 'all', modes: 'all', platforms: ['desktop'], scopeStatus: 'confirmed', conditionSubject: 'component-root'},
    rationale: 'Exactly one synthetic member is selected.'})];
  return f;
}

function compile(f) {
  const result = f.compile();
  assert.equal(result.issues.filter(i => i.level === 'error').length, 0, JSON.stringify(result.issues));
  return result.contract;
}
function run(f) { return core.evaluateCompiledContract(f.snapshot, core.prepareAuthoringPreviewContract(compile(f))).evaluations[0]; }

test('explicit reference containers are excluded; legacy collections stay closed', () => {
  assert.equal(run(fixture()).classification, 'compliant');
  assert.equal(run(fixture(false)).classification, 'human-review');
});
test('both duplicate selection and no selection remain violations', () => {
  const f = fixture(); f.snapshot.nodes[3].component.properties.Selected = 'True';
  assert.equal(run(f).classification, 'violation');
  f.snapshot.nodes[1].component.properties.Selected = 'False'; f.snapshot.nodes[3].component.properties.Selected = 'False';
  assert.equal(run(f).classification, 'violation');
});
for (const [name, mutate] of [
  ['missing reference divider', s => { s.nodes = s.nodes.filter(n => n.id !== 'divider'); s.nodes[0].childIds = ['first', 'second']; }],
  ['divider changed type', s => { s.nodes[2].type = 'GROUP'; }],
  ['unproved divider source', s => { s.nodes[2].unknownFacts = ['component.sourceIdentity']; }],
  ['foreign segment family', s => { s.nodes[1].component.identity.componentSetKey = 'foreign'; }],
  ['unknown Selected', s => { delete s.nodes[1].component.properties.Selected; }],
  ['truncated capture', s => { s.source.truncated = true; }],
  ['foreign added frame', s => { const n = structuredClone(s.nodes[2]); n.id = 'foreign'; n.component.sourceIdentity.sourceNodeId = 'foreign'; s.nodes.push(n); s.nodes[0].childIds.push(n.id); }],
  ['duplicate divider source', s => { const n = structuredClone(s.nodes[2]); n.id = 'duplicate'; s.nodes.push(n); s.nodes[0].childIds.push(n.id); }],
]) test(name + ' cannot be accepted as compliant', () => {
  const f = fixture(); mutate(f.snapshot); assert.notEqual(run(f).classification, 'compliant');
});
for (const types of [[], ['INSTANCE'], ['FRAME', 'FRAME'], ['SLOT']])
  test('invalid reference sibling types rejected: ' + JSON.stringify(types), () => {
    const f = fixture(); f.manual.rules[0].constraints[0].collection.nonMemberReferenceTypes = types;
    assert(f.compile().issues.some(i => i.level === 'error'));
  });

if (process.env.APOLLO_TEST_RUNTIME) {
  const runtime = require(process.env.APOLLO_TEST_RUNTIME);
  test('proved inactive collections do not make execution incomplete', () => {
    const f = fixture(false); f.manual.rules[0].applicability.variants = {Capacity: ['2']};
    const result = runtime.auditContractSnapshot(f.snapshot, compile(f), {evaluationMode: 'authoring-preview'});
    assert.equal(result.engine.evaluations[0].classification, 'not-applicable');
    assert.equal(result.coverage.executionComplete, true);
  });
  test('active or unknown collections retain incomplete coverage', () => {
    for (const unknown of [false, true]) {
      const f = fixture(false); if (unknown) f.snapshot.nodes[0].unknownFacts = ['component.properties.Capacity'];
      const result = runtime.auditContractSnapshot(f.snapshot, compile(f), {evaluationMode: 'authoring-preview'});
      assert.equal(result.coverage.executionComplete, false);
    }
  });
}
