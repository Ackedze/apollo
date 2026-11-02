const test=require('node:test'),assert=require('node:assert/strict');
const {createDesignCheckController}=require('../../src/design-check/controller');
const {createDocumentAuditClient}=require('../../src/design-check/document-audit-client');
const {SCHEMA}=require('../../src/document-audit/protocol');
const result=id=>({runId:id,context:{pageId:'page',selectionSignature:'a',platform:'Desktop'},observedAt:1,coverage:'native-subsets-only',checks:['local','freshness','theme'].map(id=>({id,scope:'test',status:'complete',findings:[],gaps:[],checked:0,categoryComplete:false}))});
const audit=id=>({auditId:id,result:{engine:{evaluations:[]},coverage:{scope:'test',executionComplete:true}}});
function setup(){const messages=[];let requestId,client;const controller=createDesignCheckController({onDocumentAudit:m=>{requestId=m.requestId;client.start(requestId,m.uiPreferences);controller.beginContractAudit(requestId);},onStopAudit:()=>client.stop()});client=createDocumentAuditClient({send:m=>messages.push(m),controller,timeoutMs:5});client.selection({pageId:'page',id:'a'});controller.setDocumentPageAvailable(true);controller.setAuditReady(true);return{controller,client,messages,id:()=>requestId,deliverNative(){const r=result(requestId+':native');client.accept({type:'document-audit-result',schemaVersion:SCHEMA,requestId:r.runId,result:r});return r;}};}
for(const order of ['native-first','contract-first'])test('contract compile failure retains the correlated successful native result: '+order,async()=>{
 const f=setup();await f.controller.startDocumentAudit();let native;
 if(order==='native-first')native=f.deliverNative();
 f.controller.acceptAuditError(f.id(),'Manual и факты не воспроизводят закреплённую проекцию.');
 if(order==='contract-first')native=f.deliverNative();
 assert.equal(f.controller.getState().documentAudit.result,native);
 assert.equal(f.controller.getState().documentAudit.status,'available');
 assert.equal(f.controller.getState().auditBusy,false);
 assert.match(f.controller.getState().auditError,/не воспроизводят/);
 f.client.invalidate('');f.controller.destroy();
});
test('a failed or invalidated native candidate never replaces the previous result after a contract error',async()=>{
 const f=setup(),old=result('old:native');f.controller.setDocumentAudit({status:'available',requestId:old.runId,result:old,error:''});
 await f.controller.startDocumentAudit();const candidate=f.deliverNative();f.client.accept({type:'document-audit-invalidated',schemaVersion:SCHEMA,runId:candidate.runId,reason:'NATIVE_FACTS_CHANGED'});
 f.controller.acceptAuditError(f.id(),'INVALID_CONTRACT_RESPONSE');assert.notEqual(f.controller.getState().documentAudit.result,candidate);
 f.client.stop();f.client.accept({type:'document-audit-cancelled',schemaVersion:SCHEMA,requestId:candidate.runId});f.controller.destroy();
});
for(const order of ['native-first','contract-first'])test('whole run commits matching pair together: '+order,async()=>{
 const f=setup(),old=audit('old');f.controller.setAudit(old);await f.controller.startDocumentAudit();const fresh=audit('fresh');let native;
 if(order==='native-first')native=f.deliverNative();else f.controller.acceptAuditResult(f.id(),fresh);
 assert.equal(f.controller.getState().audit,old);assert.notEqual(f.controller.getState().documentAudit.status,'available');
 if(order==='native-first')f.controller.acceptAuditResult(f.id(),fresh);else native=f.deliverNative();
 assert.equal(f.controller.getState().audit,fresh);assert.equal(f.controller.getState().documentAudit.result,native);f.client.invalidate('');f.controller.destroy();
});
test('Stop after native completed but before contracts discards candidate and completes on both ACKs',async()=>{
 const f=setup();await f.controller.startDocumentAudit();f.deliverNative();assert.equal(f.controller.stopAudit(),true);assert.ok(f.messages.some(m=>m.type==='document-audit-cancel'));f.client.accept({type:'document-audit-cancelled',schemaVersion:SCHEMA,requestId:f.id()+':native'});f.controller.acceptAuditCancelled(f.id());assert.equal(f.controller.getState().auditStopping,false);assert.equal(f.controller.getState().auditBusy,false);assert.equal(f.controller.getState().documentAudit.status,'idle');assert.equal(f.controller.acceptAuditResult(f.id(),audit('late')),false);f.controller.destroy();
});
test('invalidated staged native candidate cannot be resurrected by a later contract reply',async()=>{
 const f=setup();await f.controller.startDocumentAudit();const stale=f.deliverNative();f.client.accept({type:'document-audit-invalidated',schemaVersion:SCHEMA,runId:stale.runId,reason:'NATIVE_FACTS_CHANGED'});f.controller.acceptAuditResult(f.id(),audit('fresh'));assert.notEqual(f.controller.getState().documentAudit.status,'available');assert.notEqual(f.controller.getState().documentAudit.result,stale);assert.equal(f.messages.filter(m=>m.type==='document-audit-request').length,2);f.client.stop();f.client.accept({type:'document-audit-cancelled',schemaVersion:SCHEMA,requestId:stale.runId});f.controller.destroy();
});
test('first diagnostic survives later success and more than twenty recoveries',async()=>{
 const f=setup();await f.controller.startDocumentAudit();let first;
 for(let i=0;i<25;i++){const d={schemaVersion:'apollo.native-audit-failure.v1',errorId:'native:'+i.toString(16).padStart(24,'0'),requestId:f.id()+':native',code:'NATIVE_READ_TIMEOUT',stage:'collect',factKind:'operation',factId:'collect',nodeId:null,resourceId:null,reason:'read-failed',changedFields:[],expectedHash:null,actualHash:null};first??=d;f.client.accept({type:'document-audit-progress',schemaVersion:SCHEMA,requestId:d.requestId,diagnostic:d,message:'retry'});}
 f.deliverNative();f.controller.acceptAuditResult(f.id(),audit('complete'));assert.equal(f.controller.getState().documentAudit.failures.length,20);assert.deepEqual(f.controller.getState().documentAudit.failures[0],first);assert.equal(f.controller.getState().documentAudit.error,'');f.client.invalidate('');f.controller.destroy();
});
test('accepted native stats identity remains available while the public pair is staged',async()=>{const f=setup();await f.controller.startDocumentAudit();const r=f.deliverNative();assert.equal(f.controller.getState().documentAudit.status,'loading');assert.equal(f.client.isAcceptedResult(r.runId,r),true);assert.equal(f.client.isAcceptedResult('foreign',r),false);f.controller.stopAudit();f.client.accept({type:'document-audit-cancelled',schemaVersion:SCHEMA,requestId:r.runId});f.controller.acceptAuditCancelled(f.id());f.controller.destroy();});
for(const order of ['native-first','contract-first'])test('contract final error settles waiting pair: '+order,async()=>{const f=setup();await f.controller.startDocumentAudit();if(order==='native-first')f.deliverNative();f.controller.acceptAuditError(f.id(),'INVALID_CONTRACT_RESPONSE');if(order==='contract-first')f.deliverNative();assert.equal(f.controller.getState().auditBusy,false);assert.notEqual(f.controller.getState().documentAudit.status,'loading');assert.equal(f.controller.getState().auditError,'INVALID_CONTRACT_RESPONSE');assert.equal(f.controller.getState().documentAudit.progress,'');f.controller.destroy();});
test('a contract candidate invalidated while native is pending must be recaptured before commit',async()=>{const f=setup();await f.controller.startDocumentAudit();const stale=audit('stale');f.controller.acceptAuditResult(f.id(),stale);f.controller.beginContractAudit(f.id());f.deliverNative();assert.notEqual(f.controller.getState().audit,stale);assert.equal(f.controller.getState().auditBusy,true);const fresh=audit('fresh');f.controller.acceptAuditResult(f.id(),fresh);assert.equal(f.controller.getState().audit,fresh);f.client.invalidate('');f.controller.destroy();});
test('a correlated error code is retained even when an older main omitted the diagnostic envelope',async()=>{const f=setup();await f.controller.startDocumentAudit();f.client.accept({type:'document-audit-error',schemaVersion:SCHEMA,requestId:f.id()+':native',code:'NATIVE_READ_TIMEOUT',message:'generic failure'});f.controller.acceptAuditResult(f.id(),audit('partial'));assert.equal(f.controller.getState().documentAudit.failures[0].code,'NATIVE_READ_TIMEOUT');f.controller.destroy();});
test('offline stops both branches with an explicit retained-results notice',async()=>{const f=setup();await f.controller.startDocumentAudit();assert.equal(f.controller.stopAudit('offline'),true);assert.match(f.controller.getState().auditNotice,/интернет/);f.client.accept({type:'document-audit-cancelled',schemaVersion:SCHEMA,requestId:f.id()+':native'});f.controller.acceptAuditCancelled(f.id());assert.equal(f.controller.getState().auditStopping,false);await f.controller.startDocumentAudit();assert.equal(f.controller.getState().auditNotice,'');f.controller.stopAudit();f.client.accept({type:'document-audit-cancelled',schemaVersion:SCHEMA,requestId:f.id()+':native'});f.controller.acceptAuditCancelled(f.id());f.controller.destroy();});

for(const retained of [false,true])test('Stop after native failure clears loading with retained result='+retained,async()=>{
 const f=setup(),old=retained?result('previous:native'):null;if(old)f.controller.setDocumentAudit({status:'available',requestId:old.runId,result:old,error:''});await f.controller.startDocumentAudit();
 f.client.accept({type:'document-audit-error',schemaVersion:SCHEMA,requestId:f.id()+':native',code:'NATIVE_READ_FAILED',message:'Fixture read failed'});
 assert.equal(f.controller.getState().documentAudit.status,retained?'stale':'loading');
 assert.equal(f.controller.stopAudit(),true);f.controller.acceptAuditCancelled(f.id());
 assert.equal(f.controller.getState().auditBusy,false);assert.equal(f.controller.getState().auditStopping,false);
 assert(!['loading','cancelling'].includes(f.controller.getState().documentAudit.status));
 assert.equal(f.controller.getState().documentAudit.result,old);
 assert.equal(await f.controller.startDocumentAudit(),true);f.controller.destroy();
});
