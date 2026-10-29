const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'apollo-native-slot-'));
require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../src/native-slot-diagnostics.ts')],outfile:path.join(temporary,'native.cjs'),bundle:true,platform:'node',format:'cjs',logLevel:'silent'});
const {scopeNativeSlotCaptureWarnings: scope} = require(path.join(temporary,'native.cjs'));
test.after(() => fs.rmSync(temporary,{recursive:true,force:true}));
const core = require('../packages/component-contract-core/dist/core.cjs');
const {appendUnmatchedBaselineWarning} = require('../packages/component-contract-core/dist/capture.cjs');

function fixture(type='FRAME') {
  const root={id:'root',name:'Host',type:'INSTANCE',parentId:null,childIds:['slot','sibling'],order:0,visible:true,unknownFacts:[],component:{identity:{componentKey:'host-key',componentSetKey:'host-set',mainComponentId:'master'},properties:{},propertyTypes:{Body:'SLOT'},propertyReferences:[],propertyReferenceBindings:{}}};
  const slot={id:'slot',name:'Body',type:'SLOT',parentId:'root',childIds:[],order:0,visible:true,unknownFacts:[],component:{propertyReferences:['Body'],propertyReferenceBindings:{slotContentId:'Body'}}};
  const sibling={id:'sibling',name:'Sibling',type:'FRAME',parentId:'root',childIds:[],order:1,visible:true,unknownFacts:[],component:{propertyReferences:[]}};
  const snapshot={schemaVersion:'apollo.predicate-snapshot.v2',source:{truncated:false,rootNodeId:'root',componentKey:'host-key',componentSetKey:'host-set',propertyReferenceIdentityVersion:1,instanceIdentityVersion:1,captureTopology:{complete:true,issues:[]}},selection:['root'],context:{platform:'universal'},nodes:[root,slot,sibling]};
  snapshot.variantReference=core.captureVariantReference(snapshot,'host-key','host-set',[]);
  const payload={id:'payload',name:'Caller content',type,parentId:'slot',childIds:[],order:0,visible:true,unknownFacts:[],component:{propertyReferences:[]}};
  slot.childIds.push(payload.id);snapshot.nodes.push(payload);
  const warnings=['Unrelated diagnostic'],unmatchedBaselineNodeIds=['payload'];
  return {snapshot,warnings,unmatchedBaselineNodeIds,baselineDiagnostics:appendUnmatchedBaselineWarning(warnings,unmatchedBaselineNodeIds)};
}
for(const type of ['RECTANGLE','FRAME','TEXT','INSTANCE']) test('arbitrary '+type+' in a proved native Slot has no parent baseline warning',()=>{
  const f=fixture(type),before=JSON.stringify(f),result=scope(f);
  assert.deepEqual(result.warnings,['Unrelated diagnostic']);assert.deepEqual(result.baselineDiagnostics.externalSlotPayloadNodeIds,['payload']);
  assert.deepEqual(result.baselineDiagnostics.rawWarnings,f.warnings);assert.deepEqual(result.baselineDiagnostics.rawUnmatchedBaselineNodeIds,['payload']);assert.equal(JSON.stringify(f),before);
});
test('a nested component Slot uses its own typed owner and the current independent root',()=>{
  const f=fixture(),root=f.snapshot.nodes[0],slot=f.snapshot.nodes[1],payload=f.snapshot.nodes.pop();
  const owner={id:'owner',name:'Nested owner',type:'INSTANCE',parentId:'root',childIds:['slot'],order:0,visible:true,unknownFacts:[],component:{identity:{componentKey:'nested-key',componentSetKey:'nested-set'},properties:{},propertyTypes:{Body:'SLOT'},propertyReferences:[],propertyReferenceBindings:{}}};
  root.childIds=['owner','sibling'];delete root.component.propertyTypes.Body;slot.parentId='owner';slot.childIds=[];f.snapshot.nodes.push(owner);
  f.snapshot.variantReference=core.captureVariantReference(f.snapshot,'host-key','host-set',[]);
  slot.childIds=['payload'];f.snapshot.nodes.push(payload);
  assert.deepEqual(scope(f).warnings,['Unrelated diagnostic']);
  root.component.identity.componentKey='foreign-root';
  assert.deepEqual(scope(f).warnings,f.warnings);
});
test('the native Slot, parent, siblings and unrelated warnings remain visible',()=>{
  const f=fixture();f.unmatchedBaselineNodeIds.push('slot','root','sibling');f.warnings=['Other'];f.baselineDiagnostics=appendUnmatchedBaselineWarning(f.warnings,f.unmatchedBaselineNodeIds);
  assert.deepEqual(scope(f).warnings,['Other','3 узлов instance не сопоставлены с reference baseline.']);
  assert.deepEqual(scope(f).baselineDiagnostics.unresolvedBaselineNodeIds,['slot','root','sibling']);
});
for(const[name,edit]of[
  ['same-name FRAME',f=>{f.snapshot.nodes[1].type='FRAME';}],
  ['foreign binding',f=>{f.snapshot.nodes[1].component.propertyReferenceBindings.slotContentId='Other';}],
  ['unknown binding',f=>{f.snapshot.nodes[1].unknownFacts.push('component.propertyReferenceBindings');}],
  ['untyped owner',f=>{delete f.snapshot.nodes[0].component.propertyTypes.Body;}],
  ['foreign owner',f=>{f.snapshot.nodes[0].component.identity.componentKey='foreign';}],
  ['unknown owner',f=>{f.snapshot.nodes[0].unknownFacts.push('component.identity');}],
  ['missing reference',f=>{delete f.snapshot.variantReference;}],
  ['incomplete reference',f=>{f.snapshot.variantReference.complete=false;}],
  ['foreign root reference',f=>{f.snapshot.variantReference.componentKey='foreign';}],
  ['incomplete topology',f=>{f.snapshot.source.captureTopology.complete=false;}],
  ['unknown ancestry',f=>{f.snapshot.nodes.at(-1).unknownFacts.push('parentId');}],
  ['malformed unknown facts',f=>{f.snapshot.nodes[1].unknownFacts={};}],
  ['missing identity capture',f=>{delete f.snapshot.source.instanceIdentityVersion;}],
  ['duplicated unmatched IDs',f=>{f.unmatchedBaselineNodeIds.push('payload');}],
  ['outside Slot',f=>{f.snapshot.nodes[1].childIds=[];f.snapshot.nodes[0].childIds.push('payload');f.snapshot.nodes.at(-1).parentId='root';}],
  ['missing marker',f=>{delete f.baselineDiagnostics;}],
  ['tampered marker',f=>{f.baselineDiagnostics.unmatchedNodeIds=['root'];}],
  ['foreign warning index',f=>{f.baselineDiagnostics.warningIndex=0;}],
]) test(name+' preserves the warning',()=>{const f=fixture();edit(f);assert.deepEqual(scope(f).warnings,f.warnings);});
test('main uses the native-only scoper without exporting it in the portable runtime',()=>{
  const main=fs.readFileSync(path.join(__dirname,'../src/code.ts'),'utf8');
  assert.match(main,/const diagnostics = scopeNativeSlotCaptureWarnings\(captured\)/);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../src/runtime.js'),'utf8'),/native-slot-diagnostics/);
});
