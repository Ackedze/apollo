const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,hash,bridge,request,settle}=require("./document-audit.test");
const {createDesignCheckController}=require("../src/design-check/controller"),{createDocumentAuditClient}=require("../src/design-check/document-audit-client");
const {ACTION_SCHEMA}=require("../src/document-audit/actions");
function scene(){const f=fixture(),n=f.node('invented-paint','RECTANGLE',f.page,{fillStyleId:'',fills:[{type:'SOLID',color:{r:1,g:0,b:0}}]});f.page.selection=[n];return{f,n};}
function candidates(observation,key){const bindings=new Map();for(const check of observation.checks)if(check.id==='customStyles')for(const finding of check.findings)bindings.set(finding.findingId,key?[{kind:'bind-variable',nodeId:finding.targets[0].nodeId,targetVariableKey:key,targetName:'Invented expected',targetLibrary:null,styleField:'fill'}]:[]);return{bindings,status:{state:'ready',message:''}};}
test('contract finishing later adds the explicit expected choice without rerunning native checks',async()=>{
 const {f}=scene();let expected=null;const b=bridge(f,{bindingAdapter:{resolve:async(o,c,g)=>{g();return candidates(o,expected);}}});b.accept(request(f,'run:native'));const first=await settle(f,'document-audit-result');assert.equal(first.actionData.items.length,0);
 const controller=createDesignCheckController(),sent=[],client=createDocumentAuditClient({send:m=>sent.push(m),controller});client.selection({pageId:f.page.id,id:'invented-paint'});client.start('run',controller.getState().settings);client.accept(first);expected='a'.repeat(40);
 await b.refreshBindings('run:native');const update=f.messages.find(m=>m.type==='document-binding-actions');assert.ok(update);client.accept(update);const sidecar=controller.getState().documentActions;assert.equal(sidecar.items[0].actions[0].binding.key,expected);assert.equal(f.messages.filter(m=>m.type==='document-audit-result').length,1);assert.equal(f.writes.length,0);
 const item=sidecar.items[0],action=item.actions[0];assert.equal(client.action(item.findingId,action.targetId,action.actionId),true);assert.equal(sent.at(-1).type,'document-action-request');assert.ok(!Object.hasOwn(sent.at(-1),'key'));assert.ok(!Object.hasOwn(sent.at(-1),'binding'));const req=sent.at(-1);client.accept({type:'document-action-result',schemaVersion:ACTION_SCHEMA,requestId:req.requestId,runId:req.runId,status:'cancelled',applied:false,verified:false,message:'Invented cancellation'});client.invalidate();controller.destroy();b.stop();
});
test('late candidate refresh cannot publish after the native run is invalidated',async()=>{
 const {f}=scene();let release,hold=false;const b=bridge(f,{bindingAdapter:{resolve:async(o,c,g)=>{if(hold)await new Promise(r=>release=r);g();return candidates(o,'a'.repeat(40));}}});b.accept(request(f));await settle(f,'document-audit-result');hold=true;const work=b.refreshBindings('run');await new Promise(r=>setImmediate(r));b.invalidate();release();await work;assert.equal(f.messages.some(m=>m.type==='document-binding-actions'),false);assert.equal(f.writes.length,0);b.stop();
});
test('UI rejects stale late registry and malformed selected-key metadata',async()=>{
 const {f}=scene(),b=bridge(f,{bindingAdapter:{resolve:async o=>candidates(o,'a'.repeat(40))}});b.accept(request(f,'run:native'));const first=await settle(f,'document-audit-result');
 const c=createDesignCheckController(),client=createDocumentAuditClient({send:()=>{},controller:c});client.selection({pageId:f.page.id,id:'invented-paint'});client.start('run',c.getState().settings);client.accept(first);const original=c.getState().documentActions;
 client.accept({type:'document-binding-actions',schemaVersion:ACTION_SCHEMA,runId:'previous',actionData:first.actionData});assert.equal(c.getState().documentActions,original);
 const forged=structuredClone(first.actionData);forged.items[0].actions[0].binding.key='untrusted';client.accept({type:'document-binding-actions',schemaVersion:ACTION_SCHEMA,runId:'run:native',actionData:forged});assert.equal(c.getState().documentActions,null);client.invalidate();c.destroy();b.stop();
});
