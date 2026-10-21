const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {fixture,request,settle}=require("./document-audit.test");
function bundled(f){
 const original=f.api.ui.postMessage;
 f.api.ui.postMessage=m=>{original(m);if(m.type==='resolve-contracts')queueMicrotask(()=>f.api.ui.onmessage({type:'contracts-resolved',requestId:m.requestId,error:'Proxy offline'}));};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../dist/code.js"),'utf8'),{figma:f.api,__html__:'',TextEncoder,setTimeout,clearTimeout});return f;
}
test('actual main publishes document results despite a failing independent contract audit',async()=>{
 const f=fixture(),main=f.component('old',true,'key');f.component('latest-key',true,'key');f.theme('base');f.page.selection=[f.instance('instance',main)];bundled(f);
 const contract=f.api.ui.onmessage({type:'audit',requestId:'contract'});await f.api.ui.onmessage(request(f,'native'));await contract;
 const result=await settle(f,'document-audit-result','native');assert.equal(result.result.checks[1].findings[0].status,'update');assert.ok(f.messages.some(m=>m.type==='error'&&m.requestId==='contract'));assert.equal(f.writes.length,0);
 f.emit('close');
});
test('actual main validates current page for empty selection; page theme still has explicit scope',async()=>{
 const f=fixture();f.theme();bundled(f);await f.api.ui.onmessage({type:'ready'});assert.equal(f.messages.find(m=>m.type==='selection').pageId,'page');await f.api.ui.onmessage(request(f,'empty'));
 const result=await settle(f,'document-audit-result','empty');assert.equal(result.result.checks[0].status,'incomplete');assert.equal(result.result.checks[2].status,'complete');f.emit('close');
});

test('actual main uses PAGE explicit Theme aliases while checking an individual instance sublayer',async()=>{
 const f=fixture();f.theme('base','page-alias');f.theme(null,'scene-alias');for(const c of f.collections.values())c.key='invented-same-library-theme';const frame=f.node('frame'),instance=f.instance('instance',null,frame),nested=f.node('sublayer','TEXT',instance);nested.resolvedVariableModes={'scene-alias':'base'};f.page.selection=[nested];bundled(f);await f.api.ui.onmessage(request(f,'nested'));
 const result=await settle(f,'document-audit-result','nested');assert.equal(result.result.checks[2].status,'complete');assert.equal(result.result.checks[2].findings[0].status,'theme-mismatch');assert.equal(result.result.checks[2].findings[0].evidence.aliasCount,2);assert.equal(result.result.context.selectionSignature,'sublayer');f.emit('close');
});
