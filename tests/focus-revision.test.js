// Regression from General's independent built-main race. Native scene is invented.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {actionScene}=require("./focus-actions.fixture.cjs"),authored=require("./authoring-fixtures");
const code=fs.readFileSync(path.join(__dirname,"../dist/code.js"),'utf8'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn){for(let i=0;i<300;i++){const v=fn();if(v)return v;await sleep(1);}throw Error('bounded wait expired');}
async function pendingFocus(id){
 const f=actionScene(),timeouts=new Map();
 vm.runInNewContext(code,{figma:f.api,__html__:'',TextEncoder,setTimeout:(fn,ms)=>{const timer=setTimeout(fn,ms);if(ms===15000)timeouts.set(timer,fn);return timer;},clearTimeout:timer=>{timeouts.delete(timer);clearTimeout(timer);}});
 await f.api.ui.onmessage({type:'load-contract',source:authored.nested().source});await f.api.ui.onmessage({type:'audit',requestId:'initial'});
 const result=await wait(()=>f.messages.find(m=>m.type==='audit-result')),row=result.focusTargets.findings.find(r=>r.targets.some(t=>t.nodeId===f.child.id)),target=row.targets.find(t=>t.nodeId===f.child.id);
 const get=f.api.getNodeByIdAsync;let release;f.api.getNodeByIdAsync=nodeId=>nodeId===f.child.id?new Promise(r=>release=()=>r(null)):get(nodeId);
 const req={type:'audit-focus',requestId:id,auditId:result.audit.auditId,evaluationId:row.findingId,targetId:target.id},start=f.messages.length,writes=f.writes.length;
 await f.api.ui.onmessage(req);await wait(()=>release);
 return Object.assign(f,{req,result,start,writesAtStart:writes,release:()=>release(),restoreRead:()=>{f.api.getNodeByIdAsync=get;},timeout:()=>Array.from(timeouts.values()).at(-1)()});
}
for(const cause of ['source','settings/context','cancel','page','timeout','new-run'])test('built focus rejects '+cause+' invalidation while final compound-ID read is pending',async()=>{
 const f=await pendingFocus('race-'+cause.replace(/\W/g,''));
 try{
  if(cause==='source'){f.child.opacity=.2;await f.mutate({nodeChanges:[{id:f.child.id,node:f.child}]});assert.ok(f.messages.slice(f.start).some(m=>m.type==='audit-invalidated'));}
  if(cause==='settings/context')await f.api.ui.onmessage({type:'audit-context-invalidated',auditId:f.result.audit.auditId});
  if(cause==='cancel')await f.api.ui.onmessage({type:'audit-focus-cancel',requestId:f.req.requestId});
  if(cause==='page'){f.api.currentPage=Object.assign({},f.page,{id:'another-page',selection:[],on(){},off(){}});f.emit('currentpagechange');}
  if(cause==='timeout')f.timeout();
  if(cause==='new-run'){f.restoreRead();await f.api.ui.onmessage({type:'audit',requestId:'replacement'});assert.ok(f.messages.some(m=>m.type==='audit-result'&&m.requestId==='replacement'));}
  f.release();const reply=await wait(()=>f.messages.find(m=>['audit-focus-result','audit-focus-cancelled'].includes(m.type)&&m.requestId===f.req.requestId));
  assert.equal(reply.type==='audit-focus-cancelled'||reply.success===false,true);await sleep(5);
  assert.equal(f.writes.slice(f.writesAtStart).filter(w=>w[0]==='focus').length,0);assert.equal(f.messages.some(m=>m.type==='audit-focus-result'&&m.requestId===f.req.requestId&&m.success),false);
 }finally{f.emit('close');}
});
test('built focus permits simple selection change during final exact-ID read',async()=>{
 const f=await pendingFocus('selection-remains-input');try{f.page.selection=[f.local];f.emit('selectionchange');f.release();const reply=await wait(()=>f.messages.find(m=>m.type==='audit-focus-result'&&m.requestId===f.req.requestId));assert.equal(reply.success,true);assert.equal(f.page.selection[0],f.child);assert.equal(f.writes.slice(f.writesAtStart).filter(w=>w[0]==='focus').length,1);}finally{f.emit('close');}
});
