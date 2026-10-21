const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {postactionScene}=require("./postaction-scoped.fixture.cjs");
const {SCHEMA}=require("../src/document-audit/protocol");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(f,type){for(let i=0;i<600;i++){const m=f.messages.find(m=>m.type===type);if(m)return m;await sleep(5);}throw Error('No '+type+': '+JSON.stringify(f.messages.filter(m=>['error','document-recheck-error'].includes(m.type))));}
async function setup(configure=()=>{}){const f=postactionScene();f.deadlines=[];configure(f);vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../dist/code.js"),'utf8'),{figma:f.api,__html__:'',TextEncoder,setTimeout:(fn,ms,...args)=>{if(ms===15000||ms===60000)f.deadlines.push(fn);return setTimeout(fn,ms,...args);},clearTimeout});await f.api.ui.onmessage({type:'load-contract',source:f.source});await f.api.ui.onmessage({type:'audit',requestId:'original'});await f.api.ui.onmessage({type:'document-audit-request',schemaVersion:SCHEMA,requestId:'native',context:f.context()});const native=await wait(f,'document-audit-result'),contract=await wait(f,'audit-result');return{f,native,contract};}
function request(native,name,kind='update'){const finding=native.result.checks.flatMap(c=>c.findings).find(f=>f.name===name),entry=native.actionData.items.find(i=>i.findingId===finding.findingId),a=entry.actions.find(a=>a.kind===kind);return{type:'document-action-request',schemaVersion:native.actionData.schemaVersion,requestId:'action',runId:native.result.runId,context:native.result.context,findingId:finding.findingId,targetId:a.targetId,actionId:a.actionId};}
if(require.main===module)test('built main automatically rechecks all categories on the original object, keeps peer and fresh remaining actions',async()=>{
 const {f,native,contract}=await setup();try{
  assert.ok(contract.audit.result.engine.evaluations.some(e=>e.componentScopeId==='actual'&&e.classification==='violation'&&e.ruleId.includes('fill')));
  const peer=JSON.stringify(contract.audit.components.find(c=>c.scopeId==='peer')),req=request(native,'Составной компонент');f.page.selection=[];f.emit('selectionchange');f.messages.length=0;await f.api.ui.onmessage(req);
  const result=await wait(f,'document-recheck-result');assert.deepEqual(result.result.checks.map(c=>c.id),['local','freshness','theme','detached','customStyles','font']);assert.equal(f.actual.main.id,f.latest.id);assert.notEqual(f.peer.main.id,f.latest.id);
  assert.equal(result.result.context.selectionSignature,native.result.context.selectionSignature);assert.ok(!result.result.checks[1].findings.some(x=>x.name==='Составной компонент'&&x.status==='update'));
  assert.ok(result.result.checks[1].findings.some(x=>x.name==='Второй экземпляр'&&x.status==='update'));
  assert.equal(JSON.stringify(result.contract.audit.components.find(c=>c.scopeId==='peer')),peer);
  assert.equal(result.contract.audit.result.engine.evaluations.some(e=>e.componentScopeId==='actual'&&e.classification==='violation'&&e.ruleId.includes('fill')),false);
  assert.ok(result.contract.audit.result.engine.evaluations.some(e=>e.componentScopeId==='actual'&&e.classification==='violation'));
  assert.ok(result.actionData.items.some(i=>result.result.checks[1].findings.some(x=>x.name==='Второй экземпляр'&&x.findingId===i.findingId)));
  assert.notEqual(result.actionData.runId,native.actionData.runId);assert.ok(result.actionData.items.every(i=>i.actions.every(a=>!native.actionData.items.some(j=>j.actions.some(b=>b.actionId===a.actionId)))));
  assert.equal(f.messages.filter(m=>m.type==='document-recheck-start').length,1);assert.equal(f.messages.filter(m=>m.type==='document-recheck-result').length,1);
  await f.api.ui.onmessage(Object.assign({},req,{requestId:'old-action'}));assert.equal(f.messages.find(m=>m.type==='document-action-result'&&m.requestId==='old-action').applied,false);
 }finally{f.emit('close');}
});
module.exports={setup,request,wait};
if(require.main===module){
 test('Theme affects only proven original PAGE inheritors, preserves a child override and avoids PAGE scan',async()=>{
  const {f,native,contract}=await setup(f=>{
   Object.defineProperty(f.actual,'resolvedVariableModes',{get:()=>({theme:f.page.explicitVariableModes.theme})});f.peer.resolvedVariableModes={theme:'base'};f.peer.explicitVariableModes={theme:'base'};
   const create=f.actual.main.createInstance;f.actual.main.createInstance=()=>{const n=create();n.setExplicitVariableModeForCollection=(c,mode)=>{n.resolvedVariableModes=Object.assign({},n.resolvedVariableModes,{[c.id]:mode});};return n;};
   const set=f.page.setExplicitVariableModeForCollection;f.page.setExplicitVariableModeForCollection=(c,mode)=>{set(c,mode);f.actual.fills=[{type:'SOLID',color:{r:0,g:0,b:1},opacity:1,visible:true}];};
  });try{
   const peer=JSON.stringify(contract.audit.components.find(c=>c.scopeId==='peer'));f.messages.length=0;
   // A later walk of PAGE children is a hard failure; the affected region remains available.
   f.page.children=new Proxy(f.page.children,{get(target,key){if(key===Symbol.iterator)throw Error('unexpected PAGE scan');return Reflect.get(target,key);}});
   await f.api.ui.onmessage(request(native,'Страница: Страница','theme'));const r=await wait(f,'document-recheck-result');
   assert.equal(r.impactUnknown,false);assert.equal(f.peer.explicitVariableModes.theme,'base');assert.equal(f.peer.resolvedVariableModes.theme,'base');assert.equal(JSON.stringify(r.contract.audit.components.find(c=>c.scopeId==='peer')),peer);
   assert.equal(r.result.checks[2].findings[0].status,'theme-current');assert.equal(r.result.checks[2].checked,1);
   assert.ok(!r.actionData.items.some(i=>i.actions.some(a=>a.kind==='theme')));assert.ok(r.actionData.items.some(i=>i.actions.some(a=>a.kind==='update')));
   assert.ok(!r.contract.audit.result.engine.evaluations.some(e=>e.componentScopeId==='actual'&&e.ruleId.includes('fill')&&e.classification==='violation'));
  }finally{f.emit('close');}
 });
 test('unknown Theme impact is explicit and bounded to the original observed region',async()=>{
  const {f,native}=await setup(f=>{delete f.actual.explicitVariableModes;});try{f.messages.length=0;await f.api.ui.onmessage(request(native,'Страница: Страница','theme'));const r=await wait(f,'document-recheck-result');assert.equal(r.impactUnknown,true);assert.ok(r.contract.audit.warnings.some(w=>w.includes('Влияние Theme')));assert.equal(r.result.checks[2].checked,1);}finally{f.emit('close');}
 });
 test('partial style read keeps the old violation stale while restoring a peer action',async()=>{
  const {f,native}=await setup();try{f.api.getStyleByIdAsync=async()=>null;f.messages.length=0;await f.api.ui.onmessage(request(native,'Составной компонент'));const r=await wait(f,'document-recheck-result');const old=native.result.checks[4].findings.find(x=>x.name==='Составной компонент');assert.ok(r.staleFindingIds.includes(old.findingId));assert.ok(r.result.checks[4].findings.some(x=>x.findingId===old.findingId));assert.ok(r.actionData.items.some(i=>r.result.checks[1].findings.some(x=>x.name==='Второй экземпляр'&&x.findingId===i.findingId)));}finally{f.emit('close');}
 });
 for(const cause of ['cancel','page','settings','source','timeout'])test('late recheck cannot publish success after '+cause,async()=>{
  const {f,native,contract}=await setup();try{let release,count=0;const read=f.api.importComponentByKeyAsync;f.api.importComponentByKeyAsync=key=>key==='host-key'&&++count>1?new Promise(r=>release=()=>r(f.latest)):read(key);f.messages.length=0;await f.api.ui.onmessage(request(native,'Составной компонент'));for(let i=0;i<200&&!release;i++)await sleep(5);assert.ok(release);const ack=f.messages.find(m=>m.type==='document-action-result');assert.ok(ack.refreshId);
   if(cause==='cancel')await f.api.ui.onmessage({type:'document-recheck-cancel',schemaVersion:SCHEMA,requestId:ack.refreshId});
   if(cause==='page'){f.api.currentPage=Object.assign({},f.page,{id:'new-page',selection:[]});f.emit('currentpagechange');}
   if(cause==='settings')await f.api.ui.onmessage({type:'audit-context-invalidated',auditId:contract.audit.auditId});
   if(cause==='source'){f.peer.opacity=.15;await f.mutate({nodeChanges:[{id:f.peer.id,node:f.peer}]});}
   if(cause==='timeout')f.deadlines.at(-1)();
   release();await wait(f,'document-recheck-error');await sleep(30);assert.equal(f.messages.some(m=>m.type==='document-recheck-result'),false);assert.equal(f.writes.filter(w=>w[0]==='swap').length,1);
  }finally{f.emit('close');}
 });
}
if(require.main===module)test('failed independent contract reference retains old violations and disables only that scope registry',async()=>{
 const {f,native,contract}=await setup();try{const old=contract.audit.result.engine.evaluations.filter(e=>e.componentScopeId==='actual'&&e.classification==='violation');f.latest.createInstance=()=>{throw Error('invented unavailable reference');};f.messages.length=0;await f.api.ui.onmessage(request(native,'Составной компонент'));const r=await wait(f,'document-recheck-result');assert.deepEqual(r.contract.staleScopeIds,['actual']);for(const entry of old)assert.ok(r.contract.audit.result.engine.evaluations.some(e=>e.evaluationId===entry.evaluationId&&e.classification==='violation'));assert.equal(r.contract.audit.result.coverage.executionComplete,false);assert.ok(r.contract.focusTargets.findings.every(row=>!old.some(e=>e.evaluationId===row.findingId)));assert.ok(r.contract.focusTargets.findings.some(row=>contract.audit.result.engine.evaluations.some(e=>e.componentScopeId==='peer'&&e.evaluationId===row.findingId)));}finally{f.emit('close');}
});
if(require.main===module)test('native partial progress retains the original mode dependency graph and checked units',async()=>{
 const {fixture,bridge,request,settle}=require("./document-audit.test");const f=fixture();const area=f.node('area'),main=f.component('old',true,'invented'),n=f.instance('instance',main,area);n.explicitVariableModes={};area.explicitVariableModes={};n.resolvedVariableModes={theme:'base'};f.theme('base');f.page.selection=[area];f.api.importComponentByKeyAsync=()=>new Promise(()=>{});const b=bridge(f,{timeoutMs:10});try{const progress=[];const {collect}=require("../src/document-audit/engine");await collect(f.api,f.context(),{hash:require("./document-audit.test").hash,assertCurrent:()=>{},roots:[area],limits:{readMs:3},onProgress:o=>progress.push(o)});assert.ok(progress.some(o=>o.modeGraph.has(n.id)));assert.ok(progress.some(o=>o.units.get('customStyles').has(n.id)));b.accept(request(f));const result=await settle(f,'document-audit-result');assert.equal(result.result.checks[1].status,'incomplete');}finally{b.stop();}
});
if(require.main===module)test('cancelled verification after a write acknowledges mutation and rechecks without a late second write',async()=>{
 const {f,native}=await setup();try{const get=f.actual.getMainComponentAsync;let release,held=false;f.actual.getMainComponentAsync=()=>f.actual.main===f.latest&&!held?(held=true,new Promise(r=>release=()=>r(f.latest))):get();f.messages.length=0;await f.api.ui.onmessage(request(native,'Составной компонент'));for(let i=0;i<200&&!release;i++)await sleep(5);assert.ok(release);await f.api.ui.onmessage({type:'document-action-cancel',schemaVersion:native.actionData.schemaVersion,requestId:'action'});const ack=await wait(f,'document-action-result');assert.equal(ack.status,'cancelled');assert.equal(ack.applied,true);assert.ok(ack.refreshId);await wait(f,'document-recheck-result');release();await sleep(30);assert.equal(f.writes.filter(w=>w[0]==='swap').length,1);assert.equal(f.messages.filter(m=>m.type==='document-action-result').length,1);assert.equal(f.messages.filter(m=>m.type==='document-recheck-result').length,1);}finally{f.emit('close');}
});
