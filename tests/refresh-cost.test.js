// Invented scene only. Native getter counts measure work; wall time is not a PASS gate.
const test=require('node:test'),assert=require('node:assert/strict');
const {setup,request,wait}=require("./postaction-scoped.test");
const {fixture,bridge,request:run,settle,hash}=require("./document-audit.test");
const {postactionScene}=require("./postaction-scoped.fixture.cjs");
const {createNotificationProof}=require("../src/document-audit/notification-proof");
test('large original area refresh has bounded native reads and clears Update and Theme automatically',async()=>{
 let reads=0;const {f,native}=await setup(f=>{for(let i=0;i<140;i++){const n=f.node('invented-cost-'+i,'RECTANGLE',f.area,{visible:true,explicitVariableModes:{},resolvedVariableModes:{},fills:[],strokes:[],effects:[]});Object.defineProperty(n,'opacity',{get(){reads++;return 1;}});}});
 try{reads=0;f.messages.length=0;await f.api.ui.onmessage(request(native,'Составной компонент'));const updated=await wait(f,'document-recheck-result');assert.ok(reads<3000,'whole footprint was repeatedly read inside per-fact guards: '+reads);assert.equal(updated.result.checks[1].findings.some(x=>x.name==='Составной компонент'&&x.status==='update'),false);assert.ok(updated.result.checks[1].findings.some(x=>x.name==='Второй экземпляр'&&x.status==='update'));assert.equal(f.writes.filter(x=>x[0]==='swap').length,1);
  reads=0;f.messages.length=0;await f.api.ui.onmessage(request(updated,'Страница: Страница','theme'));const themed=await wait(f,'document-recheck-result');assert.ok(reads<3000,'Theme guard repeatedly traversed original area: '+reads);assert.equal(themed.result.checks[2].findings[0].status,'theme-current');assert.equal(themed.result.checks[2].findings.filter(x=>x.status==='theme-mismatch').length,0);assert.equal(f.writes.filter(x=>x[0]==='theme').length,1);
 }finally{f.emit('close');}
});
test('edit without a second notification during awaited refresh is rejected before publication',async()=>{
 const {f,native}=await setup();try{let release,count=0;const imported=f.api.importComponentByKeyAsync;f.api.importComponentByKeyAsync=key=>key==='host-key'&&++count===2?new Promise(r=>release=()=>r(f.latest)):imported(key);f.messages.length=0;await f.api.ui.onmessage(request(native,'Составной компонент'));for(let i=0;i<200&&!release;i++)await new Promise(r=>setTimeout(r,1));assert.ok(release);f.peer.opacity=.19;release();await wait(f,'document-recheck-error');assert.equal(f.messages.some(m=>m.type==='document-recheck-result'),false);assert.equal(f.writes.filter(x=>x[0]==='swap').length,1);}finally{f.emit('close');}
});
test('cheap context guards retain final footprint validation during notification verification',async()=>{
 const f=fixture(),n=f.node('observed');let reads=0,release;Object.defineProperty(n,'opacity',{get(){reads++;return n.testOpacity||1;}});const proof=createNotificationProof({nodes:[n],hash,verify:async guard=>{for(let i=0;i<1000;i++)guard();await new Promise(r=>release=r);guard();}});reads=0;const pending=proof.notify();assert.ok(reads<5);n.testOpacity=.2;release();assert.equal(await pending,false);assert.throws(()=>proof.assertCurrent(),/NATIVE_FACTS_CHANGED|NATIVE_RESULT_STALE/);
});
test('expired scoped refresh reports timeout while page and platform remain unchanged',async()=>{
 const f=postactionScene();let clock=0;const b=bridge(f,{now:()=>clock,refreshTimeoutMs:15000,onRecheckStart:()=>({guard(){},run:async guard=>{clock=16000;guard();},fail(){}})});try{b.accept(run(f));const native=await settle(f,'document-audit-result');f.messages.length=0;b.accept(request(native,'Составной компонент'));const error=await settle(f,'document-recheck-error');assert.match(error.message,/Чтение заняло слишком много времени/);assert.doesNotMatch(error.message,/Страница или платформа/);assert.equal(f.api.currentPage.id,native.result.context.pageId);assert.equal(f.writes.filter(x=>x[0]==='swap').length,1);}finally{b.stop();}
});
