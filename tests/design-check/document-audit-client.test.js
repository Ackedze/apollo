const test=require('node:test'),assert=require('node:assert/strict');
const {createDocumentAuditClient}=require("../../src/design-check/document-audit-client");
const {SCHEMA}=require("../../src/document-audit/protocol");
function setup(){const messages=[],state={settings:{pickerLabel:'Desktop'},documentAudit:{status:'idle',result:null,error:''}};const controller={getState:()=>state,setDocumentAudit:value=>{state.documentAudit=value;}};const port=createDocumentAuditClient({send:m=>messages.push(m),controller,timeoutMs:30});port.selection({pageId:'page',id:'a',invalidated:false});return {port,state,messages};}
const result=id=>({runId:id,context:{pageId:'page',selectionSignature:'a',platform:'Desktop'},observedAt:1,coverage:'native-subsets-only',checks:['local','freshness','theme'].map(id=>({id,scope:'bounded-test-scope',status:'complete',findings:[],gaps:[],checked:0,categoryComplete:false}))});
const diagnostic=requestId=>({schemaVersion:'apollo.native-audit-failure.v1',errorId:'native:'+'a'.repeat(24),requestId,code:'NATIVE_FACTS_CHANGED',stage:'checkpoint-recheck',factKind:'styles',factId:'a',nodeId:'a',resourceId:null,reason:'value-mismatch',changedFields:['fills.0.boundVariables.color.id'],expectedHash:'b'.repeat(64),actualHash:'c'.repeat(64)});
test('native failure preserves only the correlated bounded diagnostic for export',()=>{
 const f=setup();f.port.start('run',f.state.settings);const d=diagnostic('run:native');f.port.accept({type:'document-audit-error',schemaVersion:SCHEMA,requestId:'run:native',message:'Failed native recheck',diagnostic:d});assert.deepEqual(f.state.documentAudit.diagnostic,d);assert.equal(f.state.documentAudit.status,'error');assert.equal(f.port.focus('finding','target'),false);
 f.port.start('next',f.state.settings);assert.equal(f.state.documentAudit.diagnostic,null);f.port.accept({type:'document-audit-error',schemaVersion:SCHEMA,requestId:'next:native',message:'Failed native recheck',diagnostic:Object.assign(diagnostic('next:native'),{snapshot:{characters:'PRIVATE'}})});assert.equal(f.state.documentAudit.diagnostic,null);f.port.invalidate('');
});
test('document client rejects late and context-mismatched replies independently of contract state',()=>{const f=setup();f.port.start('old',f.state.settings);f.port.start('new',f.state.settings);f.port.accept({type:'document-audit-result',schemaVersion:SCHEMA,requestId:'old:native',result:result('old:native')});assert.equal(f.state.documentAudit.status,'loading');const r=result('new:native');r.context.platform='iOS';f.port.accept({type:'document-audit-result',schemaVersion:SCHEMA,requestId:'new:native',result:r});assert.equal(f.state.documentAudit.status,'error');f.port.invalidate('');});
test('settings/context invalidation cancels only the current document request and discards its late data',()=>{const f=setup();f.port.start('run',f.state.settings);f.port.invalidate();assert.ok(f.messages.some(m=>m.type==='document-audit-cancel'&&m.requestId==='run:native'));f.port.accept({type:'document-audit-result',schemaVersion:SCHEMA,requestId:'run:native',result:result('run:native')});assert.equal(f.state.documentAudit.status,'idle');assert.equal(f.state.documentAudit.result,null);});
test('client rejects a forged result claiming complete whole-category coverage',()=>{const f=setup();f.port.start('run',f.state.settings);const r=result('run:native');r.checks[0].categoryComplete=true;f.port.accept({type:'document-audit-result',schemaVersion:SCHEMA,requestId:'run:native',result:r});assert.equal(f.state.documentAudit.status,'error');f.port.invalidate('');});
test('no focus request can be created for a target absent from accepted native evidence',()=>{const f=setup();f.port.start('run',f.state.settings);f.port.accept({type:'document-audit-result',schemaVersion:SCHEMA,requestId:'run:native',result:result('run:native')});assert.equal(f.port.focus('invented','node-id'),false);assert.equal(f.messages.some(m=>m.type==='document-audit-focus'),false);f.port.invalidate('');});
test('missing native reply times out and sends cancellation, without touching contract/generation state',async()=>{const f=setup();f.port.start('run',f.state.settings);await new Promise(r=>setTimeout(r,40));assert.equal(f.state.documentAudit.status,'cancelling');assert.ok(f.messages.some(m=>m.type==='document-audit-cancel'));f.port.accept({type:'document-audit-cancelled',schemaVersion:SCHEMA,requestId:'run:native'});assert.equal(f.state.documentAudit.status,'error');f.port.invalidate('');});

test('a cancelled read explains retained partial facts without claiming the whole audit failed',async()=>{
 const f=setup();f.port.start('run',f.state.settings);const partial=result('run:native');partial.checks[1].status='running';
 f.port.accept({type:'document-audit-progress',schemaVersion:SCHEMA,requestId:'run:native',result:partial});
 await new Promise(r=>setTimeout(r,40));f.port.accept({type:'document-audit-cancelled',schemaVersion:SCHEMA,requestId:'run:native'});
 assert.equal(f.state.documentAudit.result,partial);assert.equal(f.state.documentAudit.status,'stale');
 assert.match(f.state.documentAudit.error,/Доступные результаты сохранены/);assert.equal(f.port.focus('unknown','unknown'),false);f.port.invalidate('');
});

test('malformed foreign packets and cyclic native evidence cannot crash the UI client',()=>{const f=setup();assert.equal(f.port.accept({type:{}}),false);f.port.start('run',f.state.settings);const r=result('run:native');r.extra=r;assert.doesNotThrow(()=>f.port.accept({type:'document-audit-result',schemaVersion:SCHEMA,requestId:'run:native',result:r}));assert.equal(f.state.documentAudit.status,'error');f.port.invalidate('');});

const {createDesignCheckController}=require("../../src/design-check/controller");
test('aggregate branch busy blocks a second launch until contract terminal reply',async()=>{
 const calls=[],controller=createDesignCheckController({onAudit:()=>{},onDocumentAudit:request=>{calls.push(request);controller.setDocumentAudit({status:'loading',requestId:request.requestId,result:null,error:''});}});
 controller.setDocumentPageAvailable(true);controller.setAuditReady(true);controller.beginContractAudit('contract-pending');assert.equal(await controller.startDocumentAudit(),false);assert.equal(calls.length,0);
 const audit={auditId:'existing-contract-result',result:{engine:{evaluations:[]},coverage:{scope:'existing-contract',executionComplete:true}}};assert.equal(controller.acceptAuditResult('contract-pending',audit),true);
 assert.equal(await controller.startDocumentAudit(),true);assert.equal(calls.length,1);assert.equal(await controller.startDocumentAudit(),false);controller.destroy();
});

function acceptedSnapshot(){const f=setup();f.port.start('run',f.state.settings);const r=result('run:native');r.checks[0].findings=[{findingId:'finding',status:'local',name:'Local',message:'Local definition',componentKey:null,owner:null,occurrences:['a'],targets:[{id:'target',kind:'occurrence',nodeId:'focus-node',pageId:'page'}],evidence:{synthetic:true}}];f.port.accept({type:'document-audit-result',schemaVersion:SCHEMA,requestId:'run:native',result:r});return Object.assign(f,{result:r});}
for(const cause of ['main-invalidation','page','settings','focus-error','focus-timeout'])test('visible snapshot survives '+cause+' and stale actions stay blocked',async()=>{
 const f=acceptedSnapshot();assert.equal(f.state.documentAudit.status,'available');
 if(cause==='main-invalidation')f.port.accept({type:'document-audit-invalidated',schemaVersion:SCHEMA,runId:'run:native'});
 if(cause==='selection')f.port.selection({pageId:'page',id:'other',invalidated:true});
 if(cause==='page')f.port.selection({pageId:'other-page',id:'other',invalidated:false});
 if(cause==='settings')f.port.invalidate();
 if(cause==='focus-error'){f.port.focus('finding','target');f.port.accept({type:'document-audit-focus-result',schemaVersion:SCHEMA,requestId:f.messages.at(-1).requestId,runId:'run:native',success:false});}
 if(cause==='focus-timeout'){f.port.focus('finding','target');await new Promise(r=>setTimeout(r,40));}
 assert.equal(f.state.documentAudit.result,f.result);assert.equal(f.state.documentAudit.status,'stale');assert.equal(f.port.focus('finding','target'),false);
 f.port.accept({type:'document-audit-result',schemaVersion:SCHEMA,requestId:'run:native',result:f.result});assert.equal(f.state.documentAudit.status,'stale');f.port.invalidate('');
});
for(const order of ['selection-first','reply-first'])test('confirmed own focus keeps snapshot available and category context: '+order,()=>{
 const f=acceptedSnapshot();f.port.focus('finding','target');const response={type:'document-audit-focus-result',schemaVersion:SCHEMA,requestId:f.messages.at(-1).requestId,runId:'run:native',success:true};
 if(order==='reply-first')f.port.accept(response);f.port.selection({pageId:'page',id:'focus-node',invalidated:false});if(order==='selection-first')f.port.accept(response);
 assert.equal(f.state.documentAudit.status,'available');assert.equal(f.state.documentAudit.result,f.result);f.port.invalidate('');
});
test('rerun loading, timeout and invalid reply keep the old snapshot; only a correlated valid run replaces it',async()=>{
 const f=acceptedSnapshot();f.port.start('new',f.state.settings);assert.equal(f.state.documentAudit.result,f.result);assert.equal(f.state.documentAudit.status,'loading');await new Promise(r=>setTimeout(r,40));assert.equal(f.state.documentAudit.status,'cancelling');f.port.accept({type:'document-audit-cancelled',schemaVersion:SCHEMA,requestId:'new:native'});assert.equal(f.state.documentAudit.result,f.result);assert.equal(f.state.documentAudit.status,'stale');
 f.port.start('last',f.state.settings);const invalid=result('last:native');invalid.context.pageId='wrong';f.port.accept({type:'document-audit-result',schemaVersion:SCHEMA,requestId:'last:native',result:invalid});assert.equal(f.state.documentAudit.result,f.result);
 f.port.start('good',f.state.settings);const good=result('good:native');f.port.accept({type:'document-audit-result',schemaVersion:SCHEMA,requestId:'good:native',result:good});assert.equal(f.state.documentAudit.result,good);assert.equal(f.state.documentAudit.status,'available');f.port.invalidate('');
});

test('manual deselect and selection changes leave accepted and in-flight root contexts intact',()=>{
 const f=acceptedSnapshot();for(const id of ['', 'other']){f.port.selection({pageId:'page',id,invalidated:true});assert.equal(f.state.documentAudit.status,'available');assert.equal(f.state.documentAudit.result,f.result);}assert.equal(f.port.focus('finding','target'),true);f.port.invalidate('');
 const next=setup();next.port.start('running',next.state.settings);next.port.selection({pageId:'page',id:'',invalidated:true});assert.equal(next.state.documentAudit.status,'loading');assert.equal(next.messages.some(m=>m.type==='document-audit-cancel'),false);next.port.accept({type:'document-audit-result',schemaVersion:SCHEMA,requestId:'running:native',result:result('running:native')});assert.equal(next.state.documentAudit.status,'available');next.port.invalidate('');
});

 test('new native progress keeps old findings visible until a valid terminal replacement',()=>{
 const f=acceptedSnapshot();f.port.start('next',f.state.settings);const progress=result('next:native');progress.checks[0].status='running';
 f.port.accept({type:'document-audit-progress',schemaVersion:SCHEMA,requestId:'next:native',result:progress});
 assert.equal(f.state.documentAudit.result,f.result);assert.equal(f.state.documentAudit.status,'loading');assert.equal(f.port.focus('finding','target'),false);
 const completed=result('next:native');f.port.accept({type:'document-audit-result',schemaVersion:SCHEMA,requestId:'next:native',result:completed});
 assert.equal(f.state.documentAudit.result,completed);assert.equal(f.state.documentAudit.status,'available');f.port.invalidate('');
});
