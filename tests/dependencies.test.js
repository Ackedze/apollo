const test = require('node:test');
const assert = require('node:assert/strict');
const runtime = require("../dist/runtime.cjs");
const { dependencyFixture, syncCapture, componentContract } = require("./dependency-fixtures");

test('capture failure diagnostics remain optional read-only metadata and cannot complete Apollo coverage',()=>{
 const semanticAudit=value=>{const result=JSON.parse(JSON.stringify(value));delete result.engine.snapshotHash;result.engine.evaluations.forEach(e=>delete e.evaluationId);return result;};
 const f=dependencyFixture(),capture=f.snapshot.componentDependencyCaptures[0];
 delete capture.snapshot;delete capture.nodeMap;capture.failure='dependency-reference-capture-failed';
 const original=runtime.auditContractSnapshot(f.snapshot,f.host);
 capture.failureDetails={version:1,stage:'create-reference-instance',errorName:'TypeError',message:'synthetic native failure'};
 const before=JSON.stringify(f),diagnosed=runtime.auditContractSnapshot(f.snapshot,f.host);
 assert.deepEqual(semanticAudit(diagnosed),semanticAudit(original));assert.notEqual(diagnosed.engine.snapshotHash,original.engine.snapshotHash);assert.equal(JSON.stringify(f),before);
 assert.equal(diagnosed.coverage.executionComplete,false);assert.equal(diagnosed.coverage.incompleteDependencies,1);
 assert.equal(diagnosed.engine.dependencyRuns[0].reason,'dependency-reference-capture-failed');
 assert.equal(diagnosed.engine.dependencyRuns[1].status,'executed');
 capture.failureDetails={version:2,stage:'invented-proof',message:'passed'};
 assert.deepEqual(semanticAudit(runtime.auditContractSnapshot(f.snapshot,f.host)),semanticAudit(original));
});

test('Apollo dependency capture ignores unused inventory but preserves resolved catalog/mode and actual style guards',()=>{
 const key='a'.repeat(40),unused='b'.repeat(40),entry={collectionId:'collection:used',collectionName:'Used',defaultModeId:'1',modes:[{modeId:'1',name:'One'}]};
 function fixture(){const f=dependencyFixture();for(const c of f.snapshot.componentDependencyCaptures){
  const host=f.snapshot.nodes.find(n=>n.id===c.nodeId),child=c.snapshot.nodes[0];
  host.variable={modes:{[key]:'1'},modeCatalog:{[key]:entry,[unused]:{collectionId:'unused'}},bindings:{}};
  child.variable=JSON.parse(JSON.stringify(host.variable));delete child.variable.modeCatalog[unused];
 }return f;}
 const f=fixture();assert.ok(runtime.auditContractSnapshot(f.snapshot,f.host).engine.dependencyRuns.every(r=>r.status==='executed'));
 for(const mutate of [n=>delete n.variable.modeCatalog[key],n=>n.variable.modes[key]='2',n=>n.appearance.opacity=.4]){
  const g=fixture();mutate(g.snapshot.componentDependencyCaptures[0].snapshot.nodes[0]);assert.equal(runtime.auditContractSnapshot(g.snapshot,g.host).engine.dependencyRuns[0].status,'not-executed');
 }
});

test('both child occurrences execute their own rules, retain provenance and focus host nodes', () => {
  const { host, snapshot } = dependencyFixture();
  snapshot.nodes.find(n => n.id === 'left-child').appearance.opacity = .4; syncCapture(snapshot, 'left');
  const before = JSON.stringify({ host, snapshot });
  const result = runtime.auditContractSnapshot(snapshot, host);
  assert.deepEqual(result.engine.dependencyRuns.map(r => r.status), ['executed', 'executed']);
  assert.equal(result.coverage.executionComplete, true);
  const children = result.engine.evaluations.filter(e => e.dependency);
  assert.equal(children.length, 2); assert.equal(new Set(children.map(e => e.evaluationId)).size, 2);
  assert.deepEqual(children.map(e => e.classification), ['violation', 'compliant']);
  assert.deepEqual(children.map(e => e.subjectNodeId), ['left-child', 'right-child']);
  assert.deepEqual(children.map(e => e.focusNodeId), ['left-child', 'right-child']);
  assert.ok(children.every(e => e.ruleId === 'test.child.opacity.1' && e.dependency.compiledHash === host.componentDependencies[0].compiledHash));
  assert.equal(JSON.stringify({ host, snapshot }), before);
  assert.deepEqual(runtime.componentDependencyKeys(host), ['child-key']);
  assert.ok(!runtime.collectContractKeys(host).has('child-key'));
  assert.ok(runtime.collectContractRules(host).some(r => r.ruleId === 'test.child.opacity.1' && r.componentId === 'test.child'));
});

for (const [label, mutate] of [
  ['missing child contract', f => { delete f.host.componentDependencies[0].contract; }],
  ['wrong compiled hash', f => { f.host.componentDependencies[0].compiledHash = 'b'.repeat(64); }],
  ['wrong revision', f => { f.host.componentDependencies[0].revision = 2; }],
  ['wrong source hash', f => { f.host.componentDependencies[0].manualSourceHash = 'b'.repeat(64); }],
  ['draft child', f => { f.child.status = 'draft'; }],
  ['child with unsupported feature', f => { f.child.runtimePolicy.futureVersion = 1; }],
  ['unresolved target binding', f => { f.host.componentDependencies[0].bindings[0].targetRole = 'missing'; }],
  ['cyclic contract', f => { f.child.componentDependencies = [Object.assign({}, f.host.componentDependencies[0], { componentId: 'test.host', contract: f.host })]; }],
  ['conflicting child versions', f => {
    const pin = f.host.componentDependencies[0], other = JSON.parse(JSON.stringify(pin)); other.id = 'other';
    other.contract.rules[0].presentation.title = 'Different accepted version'; other.compiledHash = runtime.contractHash(other.contract);
    f.host.componentDependencies.push(other);
  }],
]) test(`${label} fails before execution`, () => {
  const f = dependencyFixture(); mutate(f);
  assert.throws(() => runtime.loadRuntimeContract(f.host), { code: 'APOLLO_V4_CONTRACT_INCOMPATIBLE' });
});

for (const [label, mutate, reason] of [
  ['missing child reference', s => { s.componentDependencyCaptures.shift(); }, 'dependency-reference-not-captured'],
  ['duplicate child reference', s => { s.componentDependencyCaptures.push(s.componentDependencyCaptures[0]); }, 'dependency-reference-not-captured'],
  ['stale child facts', s => { s.componentDependencyCaptures[0].snapshot.nodes[0].appearance.opacity = .2; }, 'dependency-capture-actual-mismatch'],
  ['wrong child modes', s => { s.componentDependencyCaptures[0].snapshot.context.modes = { mode: 'wrong' }; }, 'dependency-capture-incomplete'],
  ['foreign owner identity', s => { s.nodes.find(n => n.id === 'left-owner').component.identity.componentSetKey = 'foreign'; }, null],
  ['foreign child identity', s => { s.nodes.find(n => n.id === 'left-child').component.identity.componentKey = 'foreign'; }, null],
]) test(`${label} leaves dependency coverage incomplete`, () => {
  const f = dependencyFixture(); mutate(f.snapshot);
  const result = runtime.auditContractSnapshot(f.snapshot, f.host);
  assert.equal(result.coverage.executionComplete, false);
  assert.equal(result.engine.dependencyRuns[0].status, 'not-executed');
  if (reason) assert.equal(result.engine.dependencyRuns[0].reason, reason);
});

test('hidden target and proven inactive owner remain not applicable', () => {
  for (const hidden of [true, false]) {
    const f = dependencyFixture();
    if (hidden) f.snapshot.nodes.find(n => n.id === 'left').visible = false;
    else {
      f.snapshot.nodes.find(n => n.id === 'left-owner').component.properties.Type = 'None';
      f.snapshot.variantReference.nodeProperties['Left / Owner'].properties.Type = 'None';
    }
    const result = runtime.auditContractSnapshot(f.snapshot, f.host);
    assert.equal(result.engine.dependencyRuns[0].status, 'not-applicable');
    assert.equal(result.engine.dependencyRuns[1].status, 'executed');
    assert.equal(result.coverage.executionComplete, true);
  }
});

test('pending child routes remain incomplete and oversized captures are rejected', () => {
  const f = dependencyFixture();
  f.child.customizationPolicy.push({ id: 'test.child.context', status: 'reviewed', permission: 'constrained', capability: '', controlPaths: [], execution: { route: 'delegated' } });
  f.child.coverage.sourceRules++; f.child.coverage.policyRules++;
  f.host.componentDependencies[0].compiledHash = runtime.contractHash(f.child);
  const result = runtime.auditContractSnapshot(f.snapshot, f.host);
  assert.equal(result.coverage.executionComplete, false);
  assert.ok(result.engine.dependencyRuns.every(r => r.status === 'incomplete'));
  f.snapshot.componentDependencyCaptures = Array.from({ length: 9 }, () => ({ failure: 'missing' }));
  assert.throws(() => runtime.auditContractSnapshot(f.snapshot, f.host), /capture limit/);
});

test('dependency depth cannot exceed the common capture profile', () => {
  const f = dependencyFixture(); let current = f.child;
  for (let i = 0; i < 4; i++) {
    const child = componentContract(`test.nested${i}`, `nested-${i}`);
    current.facts.targets.push({ id: 'target', semanticRole: 'target', resolution: 'resolved' });
    current.componentDependencies = [Object.assign({}, f.host.componentDependencies[0], { componentId: child.package.componentId, contract: child,
      bindings: [Object.assign({}, f.host.componentDependencies[0].bindings[0], { targetRole: 'target' })] })];
    current = child;
  }
  assert.throws(() => runtime.loadRuntimeContract(f.host), /depth limit/);
});
