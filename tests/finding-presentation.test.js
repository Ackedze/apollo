const test=require('node:test'),assert=require('node:assert/strict');
const {findingPresentation,compactFindingDetails}=require("../src/finding-presentation");
const {auditDelivery}=require("../src/audit-report");
function fixture(property='View',expected='Secondary',actual='Accent',reason='member-property-domain') {
 const node={id:'member',semantic:{role:'button'},component:{properties:{[property]:actual},propertyTypes:{[property]:'VARIANT'}},baseline:{effective:{component:{properties:{[property]:expected},propertyTypes:{[property]:'VARIANT'}}}},baselineProvenance:{status:'matched',kind:'independent-host-variant'}};
 const evaluation={evaluationId:'e',ruleId:'r',componentScopeId:'s',classification:'violation',collection:{id:'c',memberNodeIds:['member'],violations:[{reason,nodeId:'member',memberRole:'button',...(reason==='member-position'?{}:{property,actual})}]},trace:{predicate:'count-between',actual:1,expected:{lower:0,upper:0},factPaths:['memberCollectionsV1.c'],truth:false}};
 const rule={ruleId:'r',componentScopeId:'s',displayContext:{collectionId:'c',collection:{memberTargetRoles:['button'],filter:{property}}}};
 const report={components:[{scopeId:'s',snapshot:{nodes:[node]}}],result:{engine:{evaluations:[evaluation]}}};
 return {node,evaluation,rule,report};
}
test('typed comparisons use independent baseline and preserve canonical trace and compact transport',()=>{
 for(const [property,before,after,reason,label] of [['View','Secondary','Accent','member-property-domain','Вью'],['Size','56','40','member-host-mapping','Размер'],['View','Secondary','Primary','member-position','Вью'],['SingleIcon','False','True','member-position','SingleIcon']]) {
  const {node,evaluation,rule,report}=fixture(property,before,after,reason);node.component.properties.Label='New text';
  const original=JSON.stringify(report),details=findingPresentation(report,[rule]);
  assert.equal(details.e.length,1);assert.equal(details.e[0].property,label);assert.equal(details.e[0].expected,before);assert.equal(details.e[0].actual,after);
  const delivered=auditDelivery({audit:report,rules:[rule]});assert.deepEqual(delivered.audit.findingPresentation,details);assert.deepEqual(delivered.audit.result.engine.evaluations,[evaluation]);
  assert.equal(delivered.audit.components[0].snapshot.nodes,undefined);assert.equal(JSON.stringify(report),original);
  assert.deepEqual(auditDelivery(delivered).audit.findingPresentation,details);
 }
});
test('missing, ambiguous, unknown and same values never fabricate transitions; human-review unchanged',()=>{
 for(const mutate of [f=>delete f.node.baseline,f=>delete f.node.baselineProvenance,f=>f.node.baselineProvenance.kind='independent-host-swap',f=>f.node.unknownFacts=['component.properties'],f=>f.node.baseline.effective.unknownFacts=['component.properties.View'],f=>f.node.component.propertyTypes.View='TEXT',f=>f.node.baseline.effective.component.properties.View='Accent',f=>f.report.components[0].snapshot.nodes.push(f.node),f=>delete f.rule.displayContext.collection]) {
  const f=fixture();mutate(f);assert.deepEqual(findingPresentation(f.report,[f.rule]).e,[]);
 }
 const f=fixture();assert.deepEqual(compactFindingDetails(f.evaluation,f.rule),[]);
 f.evaluation.classification='human-review';assert.ok(compactFindingDetails(f.evaluation,f.rule).length);
});
function iconFixture() {
 const b={nodeId:'icon',ownerPath:'@source:host / addon',property:'Icon-24#1:0',reason:'instance-swap',actualComponentKey:'new',referenceComponentKey:'old',referencePath:'old-path'};
 const node={id:'icon',name:'dots-bracket',component:{identity:{componentKey:'new'},propertyReferenceBindings:{mainComponent:b.property}}};
 const snapshot={source:{truncated:false},nodes:[node],variantReference:{complete:true,nodeProperties:{'old-path':{identity:{componentKey:'old'},diagnosticName:'dots-three-horizontal',propertyReferenceBindings:{mainComponent:b.property}}}},instanceBoundaries:[b],instanceContentResults:[{boundaryNodeId:'icon',lineageProven:true,status:'matched'}]};
 const evaluation={evaluationId:'e',ruleId:'r',componentScopeId:'s',classification:'violation',trace:{predicate:'one-of',actual:true,expected:[false],factPaths:['dependencies.d.changed'],truth:false}};
 const rule={ruleId:'r',componentScopeId:'s',displayContext:{identityBinding:{id:'d',ownerPath:b.ownerPath,portNames:['Icon-24']}}};
 return {snapshot,b,node,evaluation,rule,report:{components:[{scopeId:'s',snapshot}],result:{engine:{evaluations:[evaluation]}}}};
}
test('asset names label exact captured port identities; unknown and unrelated swaps hide the technical row',()=>{
 const f=iconFixture(),original=JSON.stringify(f.report),rows=findingPresentation(f.report,[f.rule]).e;
 assert.equal(rows[0].property,'Иконка');assert.equal(rows[0].expected,'dots-three-horizontal');assert.equal(rows[0].actual,'dots-bracket');assert.equal(JSON.stringify(f.report),original);
 for(const mutate of [f=>f.b.ownerPath='other',f=>f.b.property='Unrelated',f=>f.node.component.identity.componentKey='wrong',f=>f.snapshot.variantReference.nodeProperties['old-path'].identity.componentKey='wrong',f=>f.snapshot.instanceBoundaries.push(f.b),f=>f.snapshot.instanceContentResults[0].lineageProven=false,f=>delete f.snapshot.variantReference.nodeProperties['old-path'].diagnosticName,f=>f.node.unknownFacts=['component.identity']]) {
  const f=iconFixture();mutate(f);assert.deepEqual(findingPresentation(f.report,[f.rule]).e,[]);
 }
 assert.deepEqual(compactFindingDetails(f.evaluation,f.rule),[]);
});
