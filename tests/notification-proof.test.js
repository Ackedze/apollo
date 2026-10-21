// Built main and two observers; all scene/transport evidence is invented.
const test=require('node:test'),assert=require('node:assert/strict');
const {setup,request,wait}=require("./postaction-scoped.test");
const {createNotificationProof,observationNodes}=require("../src/document-audit/notification-proof");
const {fixture,hash}=require("./document-audit.test");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function heldRefresh(){const {f,native,contract}=await setup();const read=f.api.importComponentByKeyAsync;let release,count=0;f.api.importComponentByKeyAsync=key=>key==='host-key'&&++count===2?new Promise(r=>release=()=>r(f.latest)):read(key);f.messages.length=0;await f.api.ui.onmessage(request(native,'Составной компонент'));for(let i=0;i<200&&!release;i++)await sleep(5);assert.ok(release);return{f,native,contract,release:()=>release()};}
function unchanged(f){return{nodeChanges:[{id:f.actual.id,node:f.actual}]};}
function noSuccess(f){assert.equal(f.messages.some(m=>m.type==='document-recheck-result'),false);assert.equal(f.writes.filter(w=>w[0]==='swap').length,1);}
test('unchanged native/area notifications after original and refreshed results preserve both reports',async()=>{
 const {f,native}=await setup();try{f.messages.length=0;await f.mutate(unchanged(f));await sleep(20);assert.equal(f.messages.some(m=>['audit-invalidated','document-audit-invalidated'].includes(m.type)),false);await f.api.ui.onmessage(request(native,'Составной компонент'));await wait(f,'document-recheck-result');f.messages.length=0;await f.mutate(unchanged(f));await sleep(20);assert.equal(f.messages.some(m=>['audit-invalidated','document-audit-invalidated'].includes(m.type)),false);}finally{f.emit('close');}
});
test('own unchanged notification during synchronous native apply does not produce a second write or abort',async()=>{
 const {f,native}=await setup();try{const swap=f.actual.swapComponent;f.actual.swapComponent=next=>{swap(next);void f.mutate(unchanged(f));};f.messages.length=0;await f.api.ui.onmessage(request(native,'Составной компонент'));await wait(f,'document-recheck-result');assert.equal(f.messages.some(m=>m.type==='document-recheck-error'),false);assert.equal(f.writes.filter(w=>w[0]==='swap').length,1);}finally{f.emit('close');}
});
test('repeated unchanged notifications coalesce across both observer paths while verification awaits',async()=>{
 const {f,release}=await heldRefresh();try{const get=f.api.getNodeByIdAsync;let resume,count=0;f.api.getNodeByIdAsync=id=>id===f.actual.id?(count++,new Promise(r=>resume=()=>r(f.actual))):get(id);const pending=[];for(let i=0;i<8;i++)pending.push(f.mutate(unchanged(f)));for(let i=0;i<100&&!resume;i++)await sleep(1);assert.ok(resume);assert.equal(count,1);f.api.getNodeByIdAsync=get;resume();await Promise.all(pending);release();await wait(f,'document-recheck-result');assert.equal(f.messages.filter(m=>m.type==='document-recheck-result').length,1);assert.equal(f.writes.filter(w=>w[0]==='swap').length,1);}finally{f.emit('close');}
});
for(const changed of ['opacity','geometry','properties','topology','main-identity','collection'])test('real '+changed+' edit racing unchanged-notification verification aborts, without needing another notification',async()=>{
 const {f,release}=await heldRefresh();try{const get=f.api.getNodeByIdAsync;let resume;f.api.getNodeByIdAsync=id=>id===f.actual.id?new Promise(r=>resume=()=>r(f.actual)):get(id);const checking=f.mutate(unchanged(f));for(let i=0;i<100&&!resume;i++)await sleep(1);assert.ok(resume);
  if(changed==='opacity')f.actual.opacity=.16;
  if(changed==='geometry')f.actual.width+=1;
  if(changed==='properties')f.actual.componentProperties['Label#new'].value='External edit';
  if(changed==='topology')f.node('unexpected child','RECTANGLE',f.actual);
  if(changed==='main-identity')f.actual.main=f.component('external-main',true,'host-key');
  if(changed==='collection')f.collections.get('theme').name='External theme change';
  f.api.getNodeByIdAsync=get;resume();await checking;release();await wait(f,'document-recheck-error');await sleep(15);noSuccess(f);
 }finally{f.emit('close');}
});
for(const cause of ['cancel','settings','page','timeout'])test('pending notification verification cannot outlive '+cause,async()=>{
 const {f,contract,release}=await heldRefresh();try{const get=f.api.getNodeByIdAsync;let resume;f.api.getNodeByIdAsync=id=>id===f.actual.id?new Promise(r=>resume=()=>r(f.actual)):get(id);const checking=f.mutate(unchanged(f));for(let i=0;i<100&&!resume;i++)await sleep(1);assert.ok(resume);const ack=f.messages.find(m=>m.type==='document-action-result');
  if(cause==='cancel')await f.api.ui.onmessage({type:'document-recheck-cancel',schemaVersion:'apollo.document-audit.v1',requestId:ack.refreshId});
  if(cause==='settings')await f.api.ui.onmessage({type:'audit-context-invalidated',auditId:contract.audit.auditId});
  if(cause==='page'){f.api.currentPage=Object.assign({},f.page,{id:'new-page',selection:[],on(){},off(){}});f.emit('currentpagechange');}
  if(cause==='timeout')f.deadlines.at(-1)();
  f.api.getNodeByIdAsync=get;resume();await checking;release();await wait(f,'document-recheck-error');await sleep(15);noSuccess(f);
 }finally{f.emit('close');}
});
test('proof failure closes the observation; repeated notifications and late verification cannot reopen it',async()=>{
 const f=fixture(),n=f.node('node');let resume,calls=0,failed=0;const proof=createNotificationProof({nodes:observationNodes([n]),hash,verify:()=>{calls++;return new Promise(r=>resume=r);},onError:()=>failed++});const a=proof.notify(),b=proof.notify();assert.equal(calls,1);n.name='changed';await proof.notify();assert.equal(failed,1);resume();await Promise.all([a,b]);assert.throws(()=>proof.assertStable(),/NATIVE_FACTS_CHANGED|NATIVE_RESULT_STALE/);assert.equal(await proof.notify(),false);assert.equal(calls,1);
});
test('slot component properties snapshot native node identities without recursively reading caller content',async()=>{
 const f=fixture(),owner=f.node('owner','INSTANCE'),slot=f.node('slot','SLOT',owner),child=f.node('child','FRAME',slot);owner.componentProperties={Content:{type:'SLOT',value:[child]}};const proof=createNotificationProof({nodes:observationNodes([owner]),hash});await proof.notify();proof.assertStable();owner.componentProperties.Content.value=[];assert.throws(()=>proof.assertStable(),/NATIVE_FACTS_CHANGED/);proof.close();
});
