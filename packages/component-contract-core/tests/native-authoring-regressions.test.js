const test = require('node:test'), assert = require('node:assert/strict');
const core = require(process.env.APOLLO_CONTRACT_CORE || '../dist/core.cjs');
const {fixture:base} = require('./helpers/declared-target.cjs');
function fixture(core) { const f=base(core);delete f.manual.metadata.declaredTargetIdentityVersion;for(const t of f.manual.targets) delete t.identityBindingsV1;return f; }

function widthFixture() {
  const f = fixture(core); delete f.manual.metadata.declaredTargetIdentityVersion;
  f.manual.rules[0].targetId = 'root'; f.manual.rules[0].capability = 'geometry.width';
  f.manual.rules[0].constraints = [{type:'layoutConstraint', fact:'bounds.width', min:64}];
  f.snapshot.nodes[0].bounds = {width:64}; return f;
}
const run = f => core.evaluateCompiledContract(f.snapshot, core.prepareAuthoringPreviewContract(f.compile().contract));
test('captured bounds enforce the minimum; absent dimensions remain UNKNOWN', () => {
  const f = widthFixture(); assert.equal(run(f).evaluations[0].classification, 'compliant');
  f.snapshot.nodes[0].bounds.width = 63; assert.equal(run(f).evaluations[0].classification, 'violation');
  delete f.snapshot.nodes[0].bounds.width; assert.equal(run(f).evaluations[0].classification, 'human-review');
});
test('targeted property guards enable the semantic reader and discard colliding diagnostic roles', () => {
  const f = fixture(core); delete f.manual.metadata.declaredTargetIdentityVersion;
  f.manual.rules[0].targetId = 'title.target'; f.manual.rules[0].capability = 'text.fontSize';
  f.manual.rules[0].constraints = [{type:'propertyForbidden',fact:'text.fontSize',targetRoles:['title']}];
  f.snapshot.nodes[2].text = {fontSize:16}; f.snapshot.nodes[2].baseline = {effective:{text:{fontSize:16}}};
  const contract = f.compile().contract; assert.equal(contract.runtimePolicy.semanticTargetVisibilityVersion, 1);
  const prepared = core.prepareValidationSnapshot(f.snapshot, contract);
  assert.deepEqual(prepared.nodes.filter(n=>n.semantic.role==='title').map(n=>n.id), ['text']);
});
test('configuration profiles retain the source rule condition', () => {
  const f = widthFixture();
  f.manual.rules[0].capability='layout.sizing';f.manual.rules[0].permission='constrained';f.manual.rules[0].execution.route='predicate';
  f.manual.semanticApi=[{id:'mode',kind:'variant',valueType:'enum',domain:['label','control'],bindings:[{representationId:'desktop',path:'component.properties.Mode',transform:'identity'}]}];
  f.manual.rules[0].applicability.conditionSubject='component-root';
  f.manual.rules[0].applicability.contextDomains = {'semanticApi.mode':['label']};
  f.manual.rules[0].constraints = [{type:'configurationDomain',configuration:{activeRoles:['root'],profiles:[{id:'hug',requirements:[{targetRole:'root',fact:'layout.sizingHorizontal',value:'HUG'}]}]}}];
  const compiled=f.compile();assert.equal(compiled.issues.filter(i=>i.level==='error').length,0,JSON.stringify(compiled.issues));
  const ir = compiled.contract.rules[0];
  assert(ir.when.args.some(p=>p.actual?.fact==='host.semanticApi.mode'));
  const root=f.snapshot.nodes[0];root.layout={sizingHorizontal:'HUG'};
  root.component.propertyTypes.Mode='VARIANT';
  const configure=value=>{
    root.component.properties.Mode=value;
    f.snapshot.variantReference=core.captureVariantReference(structuredClone(f.snapshot),'synthetic-variant','synthetic-set');
  };
  configure('control');assert.equal(run(f).evaluations[0].classification,'not-applicable');
  configure('label');assert.equal(run(f).evaluations[0].classification,'compliant');
  root.layout.sizingHorizontal='FIXED';assert.equal(run(f).evaluations[0].classification,'violation');
});
test('standalone representation surface requires exact source and actual identity', () => {
  const f = widthFixture(), root = f.snapshot.nodes[0];
  delete root.component.identity.componentSetKey; delete f.snapshot.source.componentSetKey;
  f.manual.representations[0].locator = {componentKey:'synthetic-variant'};
  f.manual.representations[0].surface = 'base';
  f.manual.semanticApi = [{id:'surface',kind:'variant',valueType:'enum',domain:['base'],bindings:[{representationId:'desktop',path:'representation.surface',transform:'identity'}]}];
  const contract = f.compile().contract;
  assert.equal(core.prepareValidationSnapshot(f.snapshot,contract).nodes[0].semanticApi.surface,'base');
  root.component.identity.componentKey = 'foreign';
  assert.equal(core.prepareValidationSnapshot(f.snapshot,contract).nodes[0].semanticApi.surface,undefined);
  root.component.identity.componentKey = 'synthetic-variant'; root.unknownFacts=['component.identity.componentKey'];
  assert.equal(core.prepareValidationSnapshot(f.snapshot,contract).nodes[0].semanticApi.surface,undefined);
});
test('captured height baseline detects resize; missing height remains UNKNOWN',()=>{
 const f=widthFixture(),root=f.snapshot.nodes[0];f.manual.rules[0].capability='geometry.height';f.manual.rules[0].constraints=[{type:'propertyForbidden',fact:'bounds.height'}];root.bounds.height=32;root.baseline={effective:{bounds:{height:32}}};
 assert.equal(run(f).evaluations[0].classification,'compliant');root.bounds.height=33;assert.equal(run(f).evaluations[0].classification,'violation');delete root.bounds.height;assert.equal(run(f).evaluations[0].classification,'human-review');
});
