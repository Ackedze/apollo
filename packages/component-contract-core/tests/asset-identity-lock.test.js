const test = require('node:test'), assert = require('node:assert/strict');
const core = require('../dist/core.cjs'), { fixture, sizePortFixture, clone } = require('./helpers/asset-identity-lock.cjs');
const run = f => { const c = f.compile(); assert.deepEqual(c.issues, []); return { c, engine: core.evaluateCompiledContract(f.snapshot, c.contract) }; };
const verdicts = result => result.engine.evaluations.filter(e => e.ruleId.startsWith('synthetic.single-icon-icon-is-fixed')).map(e => e.classification);

test('exact original SingleIcon passes without catalog membership; ordinary buttons remain excluded', () => {
  const f = fixture(core), before = JSON.stringify(f.snapshot), r = run(f);
  assert.deepEqual(verdicts(r), ['not-applicable', 'not-applicable', 'not-applicable', 'compliant']);
  assert.equal(r.c.contract.runtimePolicy.assetIdentityLockVersion, 1);
  assert.equal(r.c.contract.package.sourceExportVersion, 'component-contract-editor@0.2.90');
  assert(r.c.contract.facts.dependencyBindings.every(b => b.identityLock === true));
  assert.equal(JSON.stringify(f.snapshot), before);
  assert.deepEqual(core.evaluateCompiledContract(f.snapshot, r.c.contract), r.engine);
});

test('all-size applicability preserves each independent original across the full selected port domain', () => {
  for (const size of ['32', '40', '48', '56', '64', '72']) for (const port of ['Icon-16', 'Icon-20', 'Icon-24']) {
    const f = sizePortFixture(core, size, port), r = run(f), message = 'Size=' + size + ', port=' + port;
    assert.equal(f.manual.rules[0].applicability.variants, 'all');
    assert.equal(verdicts(r).at(-1), 'compliant', message);
    const original = clone(f.snapshot), icon = f.snapshot.nodes.find(n => n.id === 'icon-4');
    Object.assign(icon.component.identity, { componentKey: 'replacement-icon', mainComponentId: 'replacement-main' });
    f.snapshot.nodes.find(n => n.id === 'addon-4').component.properties[port + '#1:1'] = 'replacement-main';
    assert.equal(verdicts(run(f)).at(-1), 'violation', message);
    f.snapshot = original;
    assert.equal(verdicts(run(f)).at(-1), 'compliant', message + ' reset');
    delete f.snapshot.variantReference;
    assert.equal(verdicts(run(f)).at(-1), 'human-review', message + ' missing reference');
  }
});

for (const [name, key, set] of [['another icon', 'replacement-icon', 'other-icon-set'], ['another variant in the same family', 'alternate-icon-variant', 'icon-set']]) {
  test(name + ' violates the identity lock even with a renamed asset', () => {
    const f = fixture(core), icon = f.snapshot.nodes.find(n => n.id === 'icon-4');
    Object.assign(icon.component.identity, { componentKey: key, componentSetKey: set, mainComponentId: key + '-main' });
    icon.name = 'Unrelated display name';
    f.snapshot.nodes.find(n => n.id === 'addon-4').component.properties['Icon-24#1:1'] = key + '-main';
    assert.equal(verdicts(run(f)).at(-1), 'violation');
  });
}

test('changing an ordinary Button icon and hiding SingleIcon do not activate its rule', () => {
  const f = fixture(core); f.snapshot.nodes.find(n => n.id === 'icon-1').component.identity.componentKey = 'ordinary-replacement';
  assert.equal(verdicts(run(f))[0], 'not-applicable');
  f.snapshot.nodes.find(n => n.id === 'button-4').visible = false;
  assert.equal(verdicts(run(f)).at(-1), 'not-applicable');
});

test('SingleIcon moved to another Button uses its independently proven variant port, not the group default or swapped asset', () => {
  for(const replacement of [false,true]){
    const f=fixture(core),host=clone(f.librarySnapshot);
    const target=f.manual.targets.find(t=>t.semanticRole==='button-2');
    target.pathHint='Group / Offline catalog address';target.variantHints=[{representationId:'desktop',componentKey:'group-variant',pathHint:'Group / Button2'}];
    host.source.rootNodeId='independent-single-icon-host';
    const activate=s=>{
      const button=s.nodes.find(n=>n.id==='button-2');button.component.properties.SingleIcon='True';
      Object.assign(button.component.identity,{componentKey:'button-single-variant',mainComponentId:'button-single-main'});
      const addon=s.nodes.find(n=>n.id==='addon-2');addon.component.properties['Icon-24#1:1']='single-icon-main';
      const icon=s.nodes.find(n=>n.id==='icon-2');Object.assign(icon.component.identity,{componentKey:'single-icon',mainComponentId:'single-icon-main'});
    };
    activate(host);activate(f.snapshot);
    f.snapshot.instanceContentReferences={schemaVersion:'apollo.instance-content-references.v4',base:clone(f.librarySnapshot),
      attempts:[{boundaryNodeId:'button-2',strategy:'pristine-host-variant-properties',reference:host}]};
    if(replacement){const icon=f.snapshot.nodes.find(n=>n.id==='icon-2');Object.assign(icon.component.identity,{componentKey:'alternate-single-icon',mainComponentId:'alternate-single-icon-main'});
      f.snapshot.nodes.find(n=>n.id==='addon-2').component.properties['Icon-24#1:1']='alternate-single-icon-main';}
    const r=run(f);assert.equal(verdicts(r)[1],replacement?'violation':'compliant');
    const prepared=core.prepareValidationSnapshot(f.snapshot,r.c.contract);
    assert(prepared.instanceContentResults.find(r=>r.boundaryNodeId==='button-2').lineageProven);
    const binding=r.c.contract.facts.dependencyBindings.find(b=>b.targetRole==='button-2');
    assert.equal(prepared.nodes[0].dependencies[binding.id].referenceComponentKey,'single-icon');
    const missing=clone(f.snapshot);missing.instanceContentReferences.attempts=[];
    assert.equal(core.evaluateCompiledContract(missing,r.c.contract).evaluations.filter(e=>e.ruleId.startsWith('synthetic.single-icon-icon-is-fixed'))[1].classification,'human-review');
    const foreign=clone(f.snapshot);foreign.nodes.find(n=>n.id==='button-2').component.identity.componentSetKey='foreign-button-set';
    assert.equal(core.evaluateCompiledContract(foreign,r.c.contract).evaluations.filter(e=>e.ruleId.startsWith('synthetic.single-icon-icon-is-fixed'))[1].classification,'human-review');
  }
});

test('missing reference, identity, binding or typed condition never silently passes the lock', () => {
  for (const mutate of [
    f => { delete f.snapshot.variantReference; },
    f => { delete f.snapshot.nodes.find(n => n.id === 'icon-4').component.identity.componentKey; },
    f => { f.snapshot.nodes.find(n => n.id === 'addon-4').component.properties['Icon-24#1:1'] = 'foreign-main'; },
    f => { delete f.snapshot.nodes.find(n => n.id === 'button-4').component.properties.SingleIcon; },
    f => { f.snapshot.nodes.find(n => n.id === 'icon-4').unknownFacts.push('component.identity'); },
    f => { f.snapshot.nodes.find(n => n.id === 'addon-4').unknownFacts.push('component.properties.Icon-24#1:1'); },
    f => { f.snapshot.nodes.find(n => n.id === 'icon-4').component.identity.componentSetKey='contradictory-set'; },
    f => { f.snapshot.nodes.find(n => n.id === 'icon-4').component.identity.componentKey=123; },
  ]) { const f = fixture(core); mutate(f); assert.equal(verdicts(run(f)).at(-1), 'human-review'); }
  const f = fixture(core), c = f.compile().contract; delete c.runtimePolicy.assetIdentityLockVersion;
  const r = core.evaluateCompiledContract(f.snapshot, c);
  assert(r.evaluations.filter(e => e.ruleId.startsWith('synthetic.single-icon-icon-is-fixed')).every(e => e.classification === 'human-review'));
  const missingMarker=f.compile().contract;delete missingMarker.facts.dependencyBindings.find(b=>b.targetRole==='button-4').identityLock;
  assert.equal(core.evaluateCompiledContract(f.snapshot,missingMarker).evaluations.at(-1).classification,'human-review');
});

test('standalone port owners use exact component identity without requiring an invented component set',()=>{
  const f=fixture(core);for(const s of [f.snapshot,f.librarySnapshot])delete s.nodes.find(n=>n.id==='addon-4').component.identity.componentSetKey;
  f.snapshot.variantReference=core.captureVariantReference(f.librarySnapshot,'group-variant','group-set');
  assert.equal(verdicts(run(f)).at(-1),'compliant');
  f.snapshot.nodes.find(n=>n.id==='icon-4').component.identity.componentKey='different-key';
  assert.equal(verdicts(run(f)).at(-1),'violation');
});

test('occurrence-aware identity proof preserves exact asset lock through renaming and independent replay',()=>{
  const f=fixture(core);
  for(const s of [f.snapshot,f.librarySnapshot]){
    Object.assign(s.source,{occurrenceAddressVersion:1,instanceIdentityVersion:1,instanceSourceIdentityVersion:1});
    for(const n of s.nodes)if(n.parentId){const parent=s.nodes.find(p=>p.id===n.parentId);n.component.sourceIdentity={version:1,
      ownerComponentKey:parent.component.identity.componentKey,ownerMainComponentId:parent.component.identity.mainComponentId,sourceNodeId:'synthetic-source:'+n.id};}
  }
  f.snapshot.variantReference=core.captureVariantReference(f.librarySnapshot,'group-variant','group-set');
  const structureId=core.stableHash(f.snapshot.variantReference.nodes);
  f.evidence.structures={[structureId]:f.snapshot.variantReference.nodes};f.evidence.variants[0].structureId=structureId;
  f.evidence.occurrenceAddressVersion=1;f.evidence.occurrences=[{componentKey:'group-variant',componentSetKey:'group-set',
    namesByPath:Object.fromEntries(Object.entries(f.snapshot.variantReference.nodeProperties).map(([p,n])=>[p,n.diagnosticName]))}];
  for(const t of f.manual.targets)t.variantHints=[{representationId:'desktop',componentKey:'group-variant',pathHint:t.pathHint}];
  assert.equal(verdicts(run(f)).at(-1),'compliant');
  const icon=f.snapshot.nodes.find(n=>n.id==='icon-4');icon.name='New asset name';
  Object.assign(icon.component.identity,{componentKey:'other-variant',mainComponentId:'other-main'});
  f.snapshot.nodes.find(n=>n.id==='addon-4').component.properties['Icon-24#1:1']='other-main';
  assert.equal(verdicts(run(f)).at(-1),'violation');
});

test('source validation forbids exemptions, inferred keys, mappings and incorrect value types', () => {
  for (const mutate of [
    c => { c.values = ['false']; }, c => { c.values = [true]; }, c => { c.values = []; },
    c => { c.dependency.baselinePolicy = 'allow-unchanged'; }, c => { c.dependency.portNames = []; },
    c => { c.dependency.contractDependencyId = 'invented-child'; }, c => { c.dependency.catalogs = ['invented']; },
    c => { c.dependency.cases = [{ when: ['56'], values: [false] }]; },
  ]) { const f = fixture(core); mutate(f.manual.rules[0].constraints[0]); assert(f.compile().issues.some(i => i.level === 'error')); }
});

test('manual and new binding marker roundtrip; existing rules keep historical producer and binding shape', () => {
  const f = fixture(core), bundle = core.buildExportBundle(f.manual, f.evidence);
  const w = core.importWorkspace([{ name: 'contract.manual.json', text: JSON.stringify(f.manual) }, { name: 'compiled/component-contract.v2.json', text: JSON.stringify(bundle.compiled) }]);
  assert.deepEqual(w.manual, f.manual);
  assert.deepEqual(core.compileManualSource(w.manual, w.variantEvidence).contract, bundle.compiled);
  const old = clone(f.manual); old.rules[0].constraints[0].dependency.field = 'catalog'; old.rules[0].constraints[0].values = ['Synthetic catalog'];
  const c = core.compileManualSource(old, f.evidence).contract;
  assert.equal(c.runtimePolicy.assetIdentityLockVersion, undefined);
  assert(!c.facts.dependencyBindings.some(b => 'identityLock' in b));
  assert.equal(c.package.sourceExportVersion, 'component-contract-editor@0.2.77');
});

test('retired identity rule preserves the source format minimum without activating an empty runtime feature',()=>{
  const f=fixture(core);f.manual.rules[0].status='deprecated';const c=f.compile();assert.deepEqual(c.issues,[]);
  assert.equal(c.contract.status,'ready');assert.equal(c.contract.runtimePolicy.assetIdentityLockVersion,undefined);
  assert.equal(c.contract.facts.dependencyBindings,undefined);assert.equal(c.contract.package.sourceExportVersion,'component-contract-editor@0.2.88');
});
