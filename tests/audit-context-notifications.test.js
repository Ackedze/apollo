const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {actionScene}=require('./focus-actions.fixture.cjs'),authored=require('./authoring-fixtures');
const code=fs.readFileSync(require('node:path').join(__dirname,'../dist/code.js'),'utf8');
for(const repeat of [false,true])for(const change of ['unchanged','property','topology'])test(`capture notification ${change}; previous report ${repeat}`,async()=>{
 const f=actionScene();vm.runInNewContext(code,{figma:f.api,__html__:'',TextEncoder,setTimeout,clearTimeout});
 try{
  await f.api.ui.onmessage({type:'load-contract',source:authored.nested().source});
  if(repeat){await f.api.ui.onmessage({type:'audit',requestId:'initial'});assert.ok(f.messages.some(m=>m.type==='audit-result'&&m.requestId==='initial'));}
  const get=f.actual.getMainComponentAsync;let notified=false;
  f.actual.getMainComponentAsync=async()=>{
   if(!notified){notified=true;if(change==='property')f.actual.opacity=.2;if(change==='topology')f.node('added-child','FRAME',f.area);
    await f.mutate({nodeChanges:[{id:change==='property'?f.actual.id:f.area.id,node:change==='property'?f.actual:f.area,type:'PROPERTY_CHANGE'}]});}
   return get();
  };
  await f.api.ui.onmessage({type:'audit',requestId:'notification'});assert.equal(notified,true);
  const reply=f.messages.find(m=>m.requestId==='notification'&&['audit-result','error'].includes(m.type));assert.ok(reply);
  assert.equal(reply.type,'audit-result');
  if(change!=='unchanged'){assert.ok(f.messages.some(m=>m.type==='audit-recovery'&&m.requestId==='notification'));assert.ok(reply.audit.recoveryDiagnostics.some(d=>d.code==='AUDIT_CONTEXT_CHANGED'));const full=[];const post=f.api.ui.postMessage;f.api.ui.postMessage=m=>full.push(m);await f.api.ui.onmessage({type:'audit-report-request',requestId:'fresh-report',auditId:reply.audit.auditId,componentAuditId:null,operation:'full'});f.api.ui.postMessage=post;const fresh=full.find(m=>m.type==='audit-report-result').data;assert.ok(fresh);if(change==='property')assert.ok(fresh.components.some(c=>c.snapshot.nodes.some(n=>n.appearance?.opacity===.2)));if(change==='topology')assert.equal(fresh.selection.scannedNodes,(function count(n){return 1+(n.children||[]).reduce((sum,c)=>sum+count(c),0);})(f.area));}
 }finally{f.emit('close');}
});
