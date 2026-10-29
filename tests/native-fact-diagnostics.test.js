const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,hash,bridge,request,settle}=require('./document-audit.test'),{recheck}=require('../src/document-audit/engine');
test('native mismatch identifies exact fact and changed fields without layout values',async()=>{
 const f=fixture(),node=f.node('frame');f.page.selection=[node];const captured=await f.capture();node.name='PRIVATE LAYOUT TEXT';
 await assert.rejects(recheck(f.api,captured.facts,{hash,assertCurrent:()=>{}}),e=>{assert.equal(e.message,'NATIVE_FACTS_CHANGED');assert.equal(e.nativeFailure.factKind,'node');assert.equal(e.nativeFailure.nodeId,'frame');assert.deepEqual(e.nativeFailure.changedFields,['name']);assert.equal(JSON.stringify(e.nativeFailure).includes('PRIVATE'),false);return true;});
});
test('missing native node is distinguished from changed values without weakening refusal',async()=>{
 const f=fixture(),node=f.node('frame');f.page.selection=[node];const captured=await f.capture();f.nodes.delete(node.id);
 await assert.rejects(recheck(f.api,captured.facts,{hash,assertCurrent:()=>{}}),e=>{assert.equal(e.message,'NATIVE_FACTS_CHANGED');assert.equal(e.nativeFailure.reason,'node-unavailable');assert.equal(e.nativeFailure.nodeId,'frame');return true;});
});
test('paint mismatch identifies the styles fact and exact nested color field',async()=>{
 const f=fixture(),node=f.node('paint','RECTANGLE',f.page,{fills:[{type:'SOLID',color:{r:1,g:0,b:0}}],fillStyleId:''});f.page.selection=[node];const captured=await f.capture();node.fills[0].color.r=.25;
 await assert.rejects(recheck(f.api,captured.facts,{hash,assertCurrent:()=>{}}),e=>{assert.equal(e.nativeFailure.factKind,'styles');assert.equal(e.nativeFailure.nodeId,'paint');assert.equal(e.nativeFailure.resourceId,null);assert.deepEqual(e.nativeFailure.changedFields,['fills.0.color.r']);return true;});
});
test('linked style changes identify the resource separately from a scene node',async()=>{
 const f=fixture(),style={id:'style-id',key:'before',name:'PRIVATE STYLE NAME',type:'PAINT'};f.api.getStyleByIdAsync=async()=>style;f.page.selection=[f.node('paint','RECTANGLE',f.page,{fills:[{type:'SOLID',color:{r:1,g:0,b:0}}],fillStyleId:style.id})];const captured=await f.capture();style.key='after';
 await assert.rejects(recheck(f.api,captured.facts,{hash,assertCurrent:()=>{}}),e=>{assert.equal(e.nativeFailure.factKind,'style');assert.equal(e.nativeFailure.nodeId,null);assert.equal(e.nativeFailure.resourceId,style.id);assert.deepEqual(e.nativeFailure.changedFields,['key']);assert.equal(JSON.stringify(e.nativeFailure).includes('PRIVATE STYLE NAME'),false);return true;});
});
test('checkpoint failure reaches native error with correlated diagnostic and keeps actions unavailable',async()=>{
 const f=fixture(),node=f.node('frame');f.page.selection=[node];const read=f.api.getNodeByIdAsync;f.api.getNodeByIdAsync=async id=>{if(id===node.id)node.name='PRIVATE RENAMED';return read(id);};const b=bridge(f);
 try{b.accept(request(f,'native-diag'));const error=await settle(f,'document-audit-error','native-diag');assert.equal(error.diagnostic.requestId,'native-diag');assert.equal(error.diagnostic.stage,'checkpoint-recheck');assert.match(error.diagnostic.errorId,/^native:[a-f0-9]{24}$/);assert.equal(error.diagnostic.nodeId,node.id);assert.equal(JSON.stringify(error.diagnostic).includes('PRIVATE'),false);assert.equal(f.messages.some(m=>m.type==='document-audit-result'),false);assert.equal(f.writes.length,0);}finally{b.stop();}
});
