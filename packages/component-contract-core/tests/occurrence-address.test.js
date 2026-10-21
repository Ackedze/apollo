const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../dist/core.cjs');

test('shared compiled evidence stores same-name siblings without equating normalized IDs to source IDs',()=>{
 const c={componentKey:'group',figma:{defaultVariantKey:'variant',variants:{variantKeys:[{key:'variant',properties:{}}]},
  structureSignature:[{nodeId:1,parentId:null,name:'Group',type:'COMPONENT'},
   {nodeId:2,parentId:1,name:'Button',type:'INSTANCE'},{nodeId:3,parentId:1,name:'Button',type:'INSTANCE'}]}};
 const evidence=core.extractVariantEvidence([c]);assert.equal(evidence.occurrenceAddressVersion,1);
 const v=evidence.variants[0];assert.deepEqual(evidence.structures[v.structureId],[{path:'',type:'ROOT'},
  {path:'@catalog:2',type:'INSTANCE'},{path:'@catalog:3',type:'INSTANCE'}]);
 assert.deepEqual(evidence.occurrences[0].namesByPath,{'':'Group','@catalog:2':'Button','@catalog:3':'Button'});
 c.figma.structureSignature[2].name='Other';const legacy=core.extractVariantEvidence([c]);
 assert.equal(legacy.occurrenceAddressVersion,undefined);assert.equal(legacy.occurrences,undefined);
 c.figma.structureSignature[2].nodeId=2;assert.equal(core.extractVariantEvidence([c]),undefined);
});

test('selected binding refuses ambiguity and borrowing from another library variant',()=>{
 const t={pathHint:'Group / @catalog:2',variantHints:[{representationId:'desktop',componentKey:'large',pathHint:'Group / @source:100%3A2'}]};
 assert.equal(core.selectedTargetPathHint(t,'desktop','large',true),'Group / @source:100%3A2');
 assert.equal(core.selectedTargetPathHint(t,'desktop','small',true),undefined);
 assert.equal(core.selectedTargetPathHint({...t,variantHints:t.variantHints.concat(t.variantHints)},'desktop','large',true),undefined);
});
