const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),esbuild=require('esbuild');
const p=require('../src/v3-audit/transport'),{createV3UiClient}=require('../src/v3-audit/ui-client');
function load(file){const r=esbuild.buildSync({entryPoints:[path.join(__dirname,'../src/v3-audit',file)],bundle:true,write:false,platform:'node',format:'cjs'}),m={exports:{}};new Function('require','module','exports',r.outputFiles[0].text)(require,m,m.exports);return m.exports;}
const tick=()=>new Promise(setImmediate);
async function until(fn){const end=Date.now()+3000;while(!fn()){if(Date.now()>end)throw Error('BATCH2_WAIT');await tick();}}
function scene(){const page={id:'page',type:'PAGE',explicitVariableModes:{font:'sf'},children:[],selection:[]},root={id:'root',type:'FRAME',width:100,visible:true,parent:page,children:[]},node={id:'held-node',type:'RECTANGLE',width:24,visible:true,parent:root};root.children=[node];page.children=[root];page.selection=[root];return{page,root,node};}
const font=()=>({id:'font',status:'complete',classification:'violation',focusNodeId:'held-node',evidence:{property:'Font',collectionId:'font',collectionKey:'font-key',collectionIdentity:'published:font-key',expectedModeId:'alfa'}});
test('verified Font action uses the held collection/mode; late identity, mode, page-mode and Stop changes cannot write',async()=>{
 const {createAuditSession}=load('remediation/session.ts');
 for(const change of ['none','key','mode','page-mode','cancel','missing']){
  const f=scene(),item=font(),collection={id:'font',key:'font-key',remote:true,name:'Font',modes:[{modeId:'alfa',name:'AlfaSans'},{modeId:'sf',name:'System (SF)'}]};let release,stopped=false,writes=0;
  globalThis.figma={currentPage:f.page,variables:{getVariableCollectionByIdAsync:()=>new Promise(resolve=>{release=resolve;})}};
  f.page.setExplicitVariableModeForCollection=(c,id)=>{assert.equal(c,collection);writes++;f.page.explicitVariableModes[c.id]=id;};
  try{
   const session=await createAuditSession({baseChecks:[item]}, {get:()=>null},'page',()=>{});assert.equal(item.actions[0].label,'Выбрать Alfa Sans');
   const guard=()=>{if(stopped)throw Error('AUDIT_CANCELLED');};const result=session.execute(item.actions[0].id,{assertCurrent:guard,beforeWrite:guard});await until(()=>release);
   if(change==='key')collection.key='foreign';if(change==='mode')collection.modes[0].name='Other';if(change==='page-mode')f.page.explicitVariableModes.user='owner-edit';if(change==='cancel')stopped=true;
   release(change==='missing'?null:collection);
   if(change==='none'){await result;assert.equal(writes,1);assert.equal(f.page.explicitVariableModes.font,'alfa');}else{await assert.rejects(result,/AUDIT_ACTION_SOURCE_CHANGED|AUDIT_CANCELLED/);assert.equal(writes,0);}
  }finally{delete globalThis.figma;}
 }
});
test('incomplete or unverified Font does not acquire an executable mode action',async()=>{
 const {createAuditSession}=load('remediation/session.ts');globalThis.figma={currentPage:scene().page};
 try{for(const patch of [{status:'incomplete'},{evidence:{collectionIdentity:'local',collectionKey:'font-key'}},{evidence:{collectionIdentity:'published:font-key',collectionKey:'font-key',collectionId:'font',expectedModeId:null}}]){const item=Object.assign(font(),patch);await createAuditSession({baseChecks:[item]},{get:()=>null},'page',()=>{});assert.equal(item.actions,undefined);}}finally{delete globalThis.figma;}
});
test('stale component report retains opaque-ID readonly focus; mutation stays blocked and cause is exported',async()=>{
 const sent=[],client=createV3UiClient({send:m=>sent.push(m)});
 const result={runId:'saved',dataId:'a'.repeat(64),mutationAvailable:true,visibleViews:{},textReport:{facts:{texts:[]}}};
 client.start({requestId:'saved',uiPreferences:{pickerLabel:'Desktop'}});client.accept({type:'v3-audit-result',schemaVersion:p.BRIDGE,requestId:'saved',kind:'components',result});
 client.accept({type:'v3-audit-invalidated',schemaVersion:p.BRIDGE,runId:'saved',sourceChange:{reason:'identity-unconfirmed',stage:'retained',nodeId:'held-node',fields:[]}});
 assert.equal(await client.action('action'),false);const focus=client.focus('saved','opaque');const command=sent.at(-1);assert.equal(command.type,'v3-audit-focus');assert.equal(command.focusActionId,'opaque');
 client.accept({type:'v3-audit-operation-result',schemaVersion:p.BRIDGE,requestId:command.requestId,runId:'saved'});assert.equal(await focus,true);assert.equal(client.getState().stale,true);assert.equal(client.snapshot().sourceChange.reason,'identity-unconfirmed');assert.equal(await client.focus('foreign','opaque'),false);client.close();
});
test('actual native readonly focus stays on held page/file/target after selection or invalidation, without reading data',async()=>{
 const r=await esbuild.build({entryPoints:[path.join(__dirname,'../src/v3-audit/native-port.ts')],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'batch2-capture',setup(b){b.onLoad({filter:/v3-audit\/entry\.ts$/},()=>({contents:'export const runV3Audit=async options=>globalThis.__batch2Run(options);export const captureV3Texts=runV3Audit;export const getComponentKey=async()=>null;export const getReferenceStructure=async()=>null;export const resolveVariableMetadataForDiff=()=>null;',loader:'ts'}));}}]});const m={exports:{}};new Function('require','module','exports',r.outputFiles[0].text)(require,m,m.exports);
 const f=scene(),messages=[],viewports=[];globalThis.figma={fileKey:'original',currentPage:f.page,mixed:Symbol(),getNodeByIdAsync:async id=>id===f.node.id?f.node:id===f.root.id?f.root:null,viewport:{scrollAndZoomIntoView:nodes=>viewports.push(nodes.map(n=>n.id))}};
 globalThis.__batch2Run=()=>({runId:'saved',dataId:'a'.repeat(64),views:{visibleViews:{customStyles:[{id:f.node.id,name:'Held'}]}},textReport:{facts:{texts:[]}}});
 let revision=0;const port=m.exports.createV3NativePort({post:v=>messages.push(v),readRevision:()=>revision,isUnavailable:()=>false,canMutate:()=>true,onBusy(){},onMutation(){},pluginVersion:'test'});
 const command=(type,requestId,extra={})=>port.accept(Object.assign({type,schemaVersion:p.BRIDGE,requestId},extra));
 async function focus(id,opaque){command('v3-audit-focus',id,{runId:'saved',focusActionId:opaque});await until(()=>messages.some(m=>m.requestId===id&&m.type.startsWith('v3-audit-operation-')));return messages.find(m=>m.requestId===id&&m.type.startsWith('v3-audit-operation-'));}
 try{
  command('v3-audit-run','saved',{kind:'components',channel:'Desktop',pageType:null,shellAuditEnabled:false});await until(()=>messages.some(m=>m.type==='v3-audit-result'));const opaque=messages.find(m=>m.type==='v3-audit-result').result.visibleViews.customStyles[0].focusActionId;
  const initialTrace=messages.find(m=>m.type==='v3-audit-result').trace;assert.equal(initialTrace.requestId,'saved');assert.equal(initialTrace.firstFailure,null);assert.equal(initialTrace.events.at(-1).event,'capture-terminal');assert.ok(initialTrace.events.some(e=>e.event==='publish-ready'));
  f.page.selection=[f.root];port.invalidate();assert.equal((await focus('navigate',opaque)).type,'v3-audit-operation-result');assert.deepEqual(viewports,[['held-node']]);assert.equal(messages.some(m=>m.type==='v3-audit-data-request'),false);
  assert.equal((await focus('forged','arbitrary-node-id')).code,'AUDIT_FOCUS_UNAVAILABLE');f.node.removed=true;assert.equal((await focus('removed',opaque)).code,'AUDIT_SCOPE_UNAVAILABLE');f.node.removed=false;
  figma.fileKey='foreign';const fileReply=await focus('file',opaque);assert.equal(fileReply.code,'AUDIT_SOURCE_CHANGED');assert.equal(fileReply.trace.requestId,'file');assert.equal(fileReply.trace.runId,'saved');assert.equal(fileReply.trace.firstFailure.reason,'file-changed');figma.fileKey='original';figma.currentPage={id:'other-page'};const pageReply=await focus('page',opaque);assert.equal(pageReply.code,'AUDIT_SOURCE_CHANGED');assert.equal(pageReply.trace.firstFailure.reason,'page-changed');assert.equal(viewports.length,1);
  figma.currentPage=f.page;const get=figma.getNodeByIdAsync;let release;
  figma.getNodeByIdAsync=id=>id===f.node.id?new Promise(resolve=>{release=resolve;}):get(id);
  command('v3-audit-focus','stop-focus',{runId:'saved',focusActionId:opaque});await until(()=>release);command('v3-audit-cancel','stop-focus');await until(()=>messages.some(m=>m.requestId==='stop-focus'&&m.type==='v3-audit-operation-cancelled'));
  release(f.node);await tick();assert.equal(viewports.length,1);assert.equal(port.busy(),false);figma.getNodeByIdAsync=get;
  const stoppedFocus=messages.find(m=>m.requestId==='stop-focus'&&m.type==='v3-audit-operation-cancelled');assert.equal(stoppedFocus.trace.requestId,'stop-focus');assert.equal(stoppedFocus.trace.events.at(-1).event,'operation-terminal');
  figma.currentPage=f.page;f.page.selection=[f.root];f.node.width=24;const original=globalThis.__batch2Run;
  globalThis.__batch2Run=async()=>{f.node.width=30;port.observeChange({nodeChanges:[{type:'PROPERTY_CHANGE',id:f.node.id,properties:['width']}]});await tick();return Object.assign(original(),{runId:'changed'});};
  command('v3-audit-run','changed',{kind:'components',channel:'Desktop',pageType:null,shellAuditEnabled:false});await until(()=>messages.some(m=>m.type==='v3-audit-error'&&m.requestId==='changed'));
  const failed=messages.find(m=>m.type==='v3-audit-error'&&m.requestId==='changed');assert.equal(failed.sourceChange.stage,'capture');assert.equal(failed.sourceChange.reason,'observed-facts-changed');assert.ok(failed.sourceChange.fields.includes('width'));
  assert.equal(failed.trace.firstFailure.reason,'observed-facts-changed');assert.ok(failed.trace.events.some(e=>e.event==='notification'&&e.changes[0].fields.includes('width')));assert.equal(failed.trace.events.at(-1).code,'AUDIT_SOURCE_CHANGED');
  globalThis.__batch2Run=async()=>{revision++;return Object.assign(original(),{runId:'revision'});};
  command('v3-audit-run','revision',{kind:'components',channel:'Desktop',pageType:null,shellAuditEnabled:false});await until(()=>messages.some(m=>m.type==='v3-audit-error'&&m.requestId==='revision'));
  const revised=messages.find(m=>m.type==='v3-audit-error'&&m.requestId==='revision');assert.equal(revised.trace.events.at(-1).revisionChanged,true);
  globalThis.__batch2Run=options=>options.data.open(options.assertCurrent);
  command('v3-audit-run','data-failed',{kind:'components',channel:'Desktop',pageType:null,shellAuditEnabled:false});await until(()=>messages.some(m=>m.type==='v3-audit-data-request'));
  const request=messages.find(m=>m.type==='v3-audit-data-request');port.accept({type:'v3-audit-data-response',schemaVersion:p.VERSION,requestId:request.requestId,ownerRequestId:request.ownerRequestId,error:'AUDIT_DATA_UNAVAILABLE'});
  await until(()=>messages.some(m=>m.type==='v3-audit-error'&&m.requestId==='data-failed'));const dataFailure=messages.find(m=>m.type==='v3-audit-error'&&m.requestId==='data-failed');assert.equal(dataFailure.trace.firstFailure.event,'data-response');assert.equal(dataFailure.trace.firstFailure.code,'AUDIT_DATA_UNAVAILABLE');
  let releaseCapture;globalThis.__batch2Run=()=>new Promise(resolve=>{releaseCapture=resolve;});
  command('v3-audit-run','stopped',{kind:'components',channel:'Desktop',pageType:null,shellAuditEnabled:false});await until(()=>releaseCapture);command('v3-audit-cancel','stopped');await until(()=>messages.some(m=>m.type==='v3-audit-cancelled'&&m.requestId==='stopped'));
  releaseCapture(Object.assign(original(),{runId:'stopped'}));await tick();const stopped=messages.find(m=>m.type==='v3-audit-cancelled'&&m.requestId==='stopped');assert.ok(stopped.trace.events.some(e=>e.event==='cancel-request'));assert.equal(stopped.trace.events.at(-1).outcome,'cancelled');assert.equal(messages.some(m=>m.type==='v3-audit-result'&&m.requestId==='stopped'),false);
 }finally{port.close();delete globalThis.figma;delete globalThis.__batch2Run;}
});
test('trace bounds keep the first refusal and latest event; snapshots redact values and do not expose mutable buffers',()=>{
 const {createRunTrace,readTrace,MAX_EVENTS}=require('../src/v3-audit/run-trace');let clock=100;
 const trace=createRunTrace({requestId:'bounded',runId:'bounded',kind:'components',side:'native',pluginVersion:'0.4.11'},()=>clock);
 trace.add('source-invalidated',{reason:'observed-facts-changed',fields:['width'],text:'PRIVATE_TRACE_VALUE',before:'PRIVATE_TRACE_VALUE'},true);clock=105;
 for(let i=0;i<100;i++)trace.add('notification',{serial:i,changes:[{id:'held',type:'PROPERTY_CHANGE',properties:['width'],after:'PRIVATE_TRACE_VALUE'}]});
 clock=103;trace.add('capture-terminal',{outcome:'error',code:'AUDIT_SOURCE_CHANGED'});const snapshot=trace.snapshot();assert.equal(snapshot.events.length,MAX_EVENTS);assert.equal(snapshot.dropped,102-MAX_EVENTS);assert.equal(snapshot.firstFailure.sequence,1);assert.equal(snapshot.events.at(-1).event,'capture-terminal');assert.equal(snapshot.events.at(-1).elapsedMs,5);assert.equal(JSON.stringify(snapshot).includes('PRIVATE_TRACE_VALUE'),false);
 snapshot.events[0].event='foreign';snapshot.firstFailure.fields.push('foreign');assert.equal(trace.snapshot().events[0].event,'notification');assert.deepEqual(trace.snapshot().firstFailure.fields,['width']);
 assert.equal(readTrace(Object.assign({},snapshot,{requestId:'invalid ID'})),null);const bad=readTrace(Object.assign({},snapshot,{events:[{event:'notification',sequence:NaN,elapsedMs:Infinity,text:'PRIVATE_TRACE_VALUE'}],raw:'PRIVATE_TRACE_VALUE'}));assert.deepEqual(bad.events,[]);assert.equal(JSON.stringify(bad).includes('PRIVATE_TRACE_VALUE'),false);
});
test('native tracing distinguishes the expected mutation invalidation from a refusal and preserves the automatic recheck',async()=>{
 const stubs={
  'entry.ts':"export const runV3Audit=async o=>({runId:o.runId,dataId:'a'.repeat(64),views:{visibleViews:{}},textReport:{facts:{texts:[]}}});export const captureV3Texts=runV3Audit;",
  'data-client.ts':'export const createAuditDataClient=()=>({open:async()=>({})});',
  'session.ts':'export const createAuditSession=async()=>({execute:async(id,c)=>{c.assertCurrent();c.beforeWrite();globalThis.__traceMutation();return{};}});',
 };
 const built=await esbuild.build({entryPoints:[path.join(__dirname,'../src/v3-audit/native-port.ts')],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'trace-actuator-control',setup(b){b.onLoad({filter:/v3-audit\/(entry\.ts|data-client\.ts|remediation\/session\.ts)$/},args=>({contents:stubs[path.basename(args.path)],loader:'ts'}));}}]});const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,mod,mod.exports);
 const f=scene(),messages=[];let revision=0,writes=0;globalThis.figma={fileKey:'held',currentPage:f.page,mixed:Symbol(),getNodeByIdAsync:async()=>f.root};globalThis.__traceMutation=()=>{writes++;f.node.width++;};
 const port=mod.exports.createV3NativePort({post:m=>messages.push(m),readRevision:()=>revision,isUnavailable:()=>false,canMutate:()=>true,onBusy(){},onMutation(){revision++;port.invalidate();},pluginVersion:'test'});
 try{
  port.accept({type:'v3-audit-run',schemaVersion:p.BRIDGE,requestId:'mutation-run',kind:'components',channel:'Desktop',pageType:null,shellAuditEnabled:false});await until(()=>messages.some(m=>m.type==='v3-audit-result'));
  port.accept({type:'v3-audit-action',schemaVersion:p.BRIDGE,requestId:'mutation-action',runId:'mutation-run',actionId:'held-action'});await until(()=>messages.some(m=>m.type==='v3-audit-operation-result'));
  const reply=messages.find(m=>m.type==='v3-audit-operation-result');assert.equal(reply.mutationStarted,true);assert.equal(reply.trace.firstFailure,null);assert.ok(reply.trace.events.some(e=>e.event==='context-invalidated'&&e.outcome==='refresh-required'&&e.mutationStarted));assert.equal(reply.trace.events.at(-1).outcome,'success');assert.equal(writes,1);
  await until(()=>messages.some(m=>m.type==='v3-audit-result'&&m.requestId===reply.recheckRequestId));assert.equal(messages.find(m=>m.type==='v3-audit-result'&&m.requestId===reply.recheckRequestId).trace.firstFailure,null);
 }finally{port.close();delete globalThis.figma;delete globalThis.__traceMutation;}
});
test('failed attempts and actions export correlated UI/native traces beside the unchanged retained result; stale replies and other kinds cannot contaminate them',async()=>{
 const {createRunTrace,MAX_SESSIONS}=require('../src/v3-audit/run-trace'),sent=[],client=createV3UiClient({send:m=>sent.push(m)}),result={runId:'saved',dataId:'a'.repeat(64),mutationAvailable:true,visibleViews:{},textReport:{facts:{texts:[]}}};
 const native=(id,kind='components',runId=id)=>createRunTrace({requestId:id,runId,kind,side:'native'});
 client.start({requestId:'saved',uiPreferences:{pickerLabel:'Desktop'}});const good=native('saved');good.add('capture-terminal',{outcome:'success'});client.accept({type:'v3-audit-result',schemaVersion:p.BRIDGE,requestId:'saved',kind:'components',result,trace:good.snapshot()});
 const action=client.action('opaque'),command=sent.at(-1),op=native(command.requestId,'components','saved');op.add('guard-refused',{code:'AUDIT_SOURCE_CHANGED',reason:'unobserved-property',fields:['width']},true);
 client.accept({type:'v3-audit-operation-error',schemaVersion:p.BRIDGE,requestId:command.requestId,runId:'saved',code:'AUDIT_SOURCE_CHANGED',mutationStarted:false,trace:op.snapshot()});assert.equal(await action,false);
 let snapshot=client.snapshot();assert.deepEqual(snapshot.originalPayload,result);const operated=snapshot.trace.sessions.find(v=>v.requestId===command.requestId);assert.equal(operated.native.firstFailure.reason,'unobserved-property');assert.equal(operated.ui.firstFailure.code,'AUDIT_SOURCE_CHANGED');
 client.start({requestId:'failed',uiPreferences:{pickerLabel:'Desktop'}});const failed=native('failed');failed.add('source-invalidated',{reason:'observed-facts-changed',fields:['width']},true);failed.add('capture-terminal',{code:'AUDIT_SOURCE_CHANGED',outcome:'error'});
 client.accept({type:'v3-audit-error',schemaVersion:p.BRIDGE,requestId:'saved',code:'AUDIT_SOURCE_CHANGED',trace:good.snapshot()});assert.equal(client.getState().busy,true);
 client.accept({type:'v3-audit-error',schemaVersion:p.BRIDGE,requestId:'failed',code:'AUDIT_SOURCE_CHANGED',trace:failed.snapshot()});snapshot=client.snapshot();assert.deepEqual(snapshot.originalPayload,result);assert.equal(snapshot.lastAttempt.requestId,'failed');assert.equal(snapshot.trace.sessions.at(-1).native.firstFailure.reason,'observed-facts-changed');assert.equal(snapshot.trace.sessions.at(-1).ui.events.at(-1).outcome,'error');
 const componentTraces=JSON.stringify(snapshot.trace);client.start({requestId:'text-failed',kind:'texts',uiPreferences:{pickerLabel:'Desktop'}});client.accept({type:'v3-audit-error',schemaVersion:p.BRIDGE,requestId:'text-failed',code:'AUDIT_FAILED',trace:native('text-failed','texts').snapshot()});assert.equal(JSON.stringify(client.snapshot().trace),componentTraces);assert.equal(client.snapshot('texts').trace.sessions[0].requestId,'text-failed');
 for(let i=0;i<6;i++){const id='bounded-'+i;client.start({requestId:id,uiPreferences:{pickerLabel:'Desktop'}});client.accept({type:'v3-audit-error',schemaVersion:p.BRIDGE,requestId:id,code:'AUDIT_FAILED',trace:native('foreign').snapshot()});}
 snapshot=client.snapshot();assert.equal(snapshot.trace.sessions.length,MAX_SESSIONS);assert.equal(snapshot.trace.droppedSessions,5);assert.equal(snapshot.trace.sessions.at(-1).native,null);assert.deepEqual(snapshot.originalPayload,result);client.close();
});
test('failed capture keeps bounded source cause in exported diagnostic and distinguishes missing proof from a real edit',()=>{
 for(const reason of ['unobserved-property','observed-facts-changed']){
  const client=createV3UiClient({send(){}});client.start({requestId:'failed',uiPreferences:{pickerLabel:'Desktop'}});
  client.accept({type:'v3-audit-error',schemaVersion:p.BRIDGE,requestId:'failed',code:'AUDIT_SOURCE_CHANGED',sourceChange:{reason,stage:'capture',nodeId:'held',fields:['width']}});
  const snapshot=client.snapshot();assert.equal(snapshot.lastAttempt.error,'AUDIT_SOURCE_CHANGED');assert.equal(snapshot.sourceChange.reason,reason);assert.equal(snapshot.sourceChange.stage,'capture');assert.match(snapshot.error,reason==='unobserved-property'?/Не удалось подтвердить/:/Макет изменился/);client.close();
 }
});
test('UI Stop preserves cancelled native trace, ignores the late result and keeps later run traces independent',()=>{
 const {createRunTrace}=require('../src/v3-audit/run-trace'),client=createV3UiClient({send(){}});client.start({requestId:'cancelled',uiPreferences:{pickerLabel:'Desktop'}});client.stop();const trace=createRunTrace({requestId:'cancelled',runId:'cancelled',kind:'components',side:'native'});trace.add('capture-terminal',{code:'AUDIT_CANCELLED',outcome:'cancelled'},true);
 client.accept({type:'v3-audit-cancelled',schemaVersion:p.BRIDGE,requestId:'cancelled',code:'AUDIT_CANCELLED',trace:trace.snapshot()});const cancelled=client.snapshot();assert.equal(cancelled.lastAttempt.cancelled,true);assert.ok(cancelled.trace.sessions[0].ui.events.some(e=>e.event==='cancel-request'));assert.equal(cancelled.trace.sessions[0].native.firstFailure.code,'AUDIT_CANCELLED');
 client.start({requestId:'next-run',uiPreferences:{pickerLabel:'Desktop'}});client.accept({type:'v3-audit-result',schemaVersion:p.BRIDGE,requestId:'cancelled',kind:'components',trace:trace.snapshot(),result:{runId:'cancelled'}});const current=client.snapshot();assert.equal(current.pending.requestId,'next-run');assert.equal(current.trace.sessions.at(-1).native,null);assert.deepEqual(current.trace.sessions[0],cancelled.trace.sessions[0]);client.close();
});
test('source observation distinguishes a real field change from missing observation without relaxing either refusal',async()=>{
 const {createV3SourceObservation}=load('source-observation.ts');
 for(const kind of ['field','unobserved','outside']){const f=scene(),observation=createV3SourceObservation();await observation.prepare([f.root],()=>{});if(kind==='field')f.node.width=30;
  assert.equal(await observation.unchanged({nodeChanges:[{type:'PROPERTY_CHANGE',id:kind==='outside'?'outside':f.node.id,properties:kind==='unobserved'?['unobservedField']:['width']}]}),false);
  const d=observation.diagnostic();assert.equal(d.reason,kind==='field'?'observed-facts-changed':kind==='outside'?'outside-observation':'unobserved-property');if(kind==='field')assert.ok(d.fields.includes('width'));
 }
});
