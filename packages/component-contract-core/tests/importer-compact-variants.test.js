const test=require('node:test'),assert=require('node:assert/strict'),core=require('../dist/core.cjs');
const {fixture,clone}=require('./helpers/declared-target.cjs');
test('multi-variant compiled-only package restores the initial variant tree without assigning native identity',()=>{
 const f=fixture(core),shape=[{path:'',type:'ROOT'},{path:'Other',type:'TEXT'}],id=core.stableHash(shape);
 f.evidence.structures[id]=shape;f.evidence.variants.push({componentKey:'synthetic-other',componentSetKey:'synthetic-set',structureId:id,properties:{}});
 const c=f.compile().contract,files=[{name:'contract.manual.json',text:JSON.stringify(f.manual)},{name:'compiled/component-contract.v2.json',text:JSON.stringify(c)}];
 const w=core.importWorkspace(files);assert(w.anatomy.length);assert(w.anatomy.some(n=>n.name==='value'));assert(!w.anatomy.some(n=>n.name==='Other'));
 assert.equal(w.variants[0].componentKey,'synthetic-variant');assert(w.anatomy.every(n=>n.unknownFacts.includes('compact-structure-only')));
 assert.deepEqual(w.manual,f.manual);assert.deepEqual(JSON.parse(JSON.stringify(core.compileManualSource(w.manual,w.variantEvidence).contract)),JSON.parse(JSON.stringify(c)));
 const absent=clone(f.snapshot);delete absent.variantReference;assert.equal(core.evaluateCompiledContract(absent,c).evaluations[0].classification,'human-review');
});
test('invalid initial compact structure remains unavailable instead of displaying a later variant',()=>{
 const f=fixture(core);const c=f.compile().contract;const v=c.facts.variantEvidence.variants[0];c.facts.variantEvidence.structures[v.structureId][1].type='changed';
 const w=core.importWorkspace([{name:'contract.manual.json',text:JSON.stringify(f.manual)},{name:'compiled/component-contract.v2.json',text:JSON.stringify(c)}]);
 assert.equal(w.anatomy.length,0);assert(w.warnings.some(s=>s.startsWith('No structure signature')));
});
