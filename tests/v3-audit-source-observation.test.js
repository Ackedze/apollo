const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),esbuild=require('esbuild');
function load(file,plugins=[]){const built=esbuild.buildSync({entryPoints:[path.join(__dirname,'../src/v3-audit',file)],bundle:true,write:false,platform:'node',format:'cjs',logLevel:'silent'});const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,module,module.exports);return module.exports;}
function scene(){const page={id:'page',type:'PAGE',explicitVariableModes:{},children:[]},root={id:'root',type:'FRAME',name:'Root',visible:true,width:100,children:[],parent:page},child={id:'child',type:'RECTANGLE',visible:true,width:24,parent:root,removed:false,fills:[]};root.children=[child];page.children=[root];return{page,root,child};}
const event=(node,properties=['width'])=>({nodeChanges:[{type:'PROPERTY_CHANGE',id:node.id,node,origin:'LOCAL',properties}]});
test('same-value native property notifications are redundant; actual fields, topology and unknown events still refuse',async()=>{
 const {createV3SourceObservation}=load('source-observation.ts'),f=scene(),proof=createV3SourceObservation();await proof.prepare([f.root],()=>{});
 assert.equal(await proof.unchanged(event(f.child)),true);f.child.width=32;assert.equal(await proof.unchanged(event(f.child)),false);await assert.rejects(proof.verify(()=>{}),/AUDIT_SOURCE_CHANGED/);f.child.width=24;
 assert.equal(await proof.unchanged(event(f.child,['mainComponent'])),false);assert.equal(await proof.unchanged(event({id:'untracked'})),false);assert.equal(await proof.unchanged({nodeChanges:[{type:'CREATE',id:'child',node:f.child}]}),false);assert.equal(await proof.unchanged({nodeChanges:[{type:'DELETE',id:'child',node:f.child}]}),false);assert.equal(await proof.unchanged({nodeChanges:[]}),false);
 f.child.parent=f.page;assert.equal(await proof.unchanged(event(f.child)),false);f.child.parent=f.root;f.root.children=[];assert.equal(await proof.unchanged(event(f.root,['children'])),false);
});
test('queued same-value notifications are verified before audit reads; selected descendants do not enumerate siblings',async()=>{
 const {createV3SourceObservation}=load('source-observation.ts'),f=scene();let siblingReads=0;const sibling={id:'sibling',get type(){siblingReads++;return'FRAME';},parent:f.page};f.page.children.push(sibling);
 const proof=createV3SourceObservation();assert.equal(await proof.unchanged(event(f.child)),true);await proof.prepare([f.root],()=>{});assert.equal(await proof.unchanged(event(f.child)),true);assert.equal(siblingReads,0);
 const unknown=createV3SourceObservation();unknown.unchanged(event(f.child,['mainComponent']));await assert.rejects(unknown.prepare([f.root],()=>{}),/AUDIT_SOURCE_CHANGED/);
});
test('observation setup yields for Stop and keeps complete large-scope verification without a new validity cap',async()=>{
 const {createV3SourceObservation}=load('source-observation.ts'),f=scene();f.root.children=Array.from({length:12000},(_,i)=>({id:'node-'+i,type:'RECTANGLE',width:24,visible:true,parent:f.root}));
 const proof=createV3SourceObservation();let stopped=false;const timer=setTimeout(()=>{stopped=true;},0);
 await assert.rejects(proof.prepare([f.root],()=>{if(stopped)throw Error('AUDIT_CANCELLED');}),/AUDIT_CANCELLED/);clearTimeout(timer);
 const complete=createV3SourceObservation();await complete.prepare([f.root],()=>{});assert.equal(await complete.unchanged(event(f.root.children.at(-1))),true);f.root.children.at(-1).width=25;await assert.rejects(complete.verify(()=>{}),/AUDIT_SOURCE_CHANGED/);
});

test('a main or instance-ancestor swap cannot hide behind a width-only notification with unchanged style/props',async()=>{
 const {createV3SourceObservation}=load('source-observation.ts'),f=scene();let main={id:'main-a',key:'a'.repeat(40),type:'COMPONENT',remote:true,parent:f.page};
 f.root.type='INSTANCE';f.root.componentProperties={};f.root.getMainComponentAsync=async()=>main;
 const proof=createV3SourceObservation();await proof.prepare([f.root],()=>{});assert.equal(await proof.unchanged(event(f.child)),false,'accepted instance ancestry remains conservative');assert.equal(await proof.unchanged(event(f.child),true),true);
 main={id:'main-b',key:'b'.repeat(40),type:'COMPONENT',remote:true,parent:f.page};assert.equal(await proof.unchanged(event(f.child),true),false);assert.equal(await proof.unchanged(event(f.root),true),false);await assert.rejects(proof.verify(()=>{}),/AUDIT_SOURCE_CHANGED/);
 f.root.getMainComponentAsync=async()=>{throw Error('unavailable');};assert.equal(await proof.unchanged(event(f.child)),false);
 const broken=scene(),unreadable=createV3SourceObservation();await unreadable.prepare([broken.root],()=>{});Object.defineProperty(broken.child,'width',{get(){throw Error('unreadable');}});assert.equal(await unreadable.unchanged(event(broken.child)),false);
});
test('a queued mutation during setup is not mistaken for the newly collected baseline',async()=>{
 const {createV3SourceObservation}=load('source-observation.ts'),f=scene(),proof=createV3SourceObservation();let width=24,scheduled=false;
 Object.defineProperty(f.child,'width',{get(){const before=width;if(!scheduled){scheduled=true;queueMicrotask(()=>{width=33;void proof.unchanged(event(f.child));});}return before;}});
 await assert.rejects(proof.prepare([f.root],()=>{}),/AUDIT_SOURCE_CHANGED/);
});
test('actual native action/recheck accepts delayed unchanged notifications and still rejects a real edit',async t=>{
 const p=require('../src/v3-audit/transport'),protocol=require('../src/v3-audit/protocol'),crypto=require('node:crypto');
 const stub=`export async function runV3Audit(options){return globalThis.__notificationRun(options)};export const captureV3Texts=runV3Audit;export const getComponentKey=async()=>null;export const getReferenceStructure=async()=>null;export const resolveVariableMetadataForDiff=()=>null;`;
 const built=await esbuild.build({entryPoints:[path.join(__dirname,'../src/v3-audit/native-port.ts')],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'owned-capture-only',setup(build){build.onLoad({filter:/v3-audit\/entry\.ts$/},()=>({contents:stub,loader:'ts'}));}}]});const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,module,module.exports);
 const hash=text=>crypto.createHash('sha256').update(text).digest('hex'),url='https://ackedze.github.io/design-system_ab/JSONS/referenceSourcesMVP.json',file={id:hash(url),sha256:hash('{}'),bytes:2,urls:[url]},body={schemaVersion:protocol.SCHEMA,entryUrl:url,policyFileId:file.id,files:[file]},manifest=Object.assign({},body,{dataId:hash(protocol.canonical(body))});
 for(const mode of ['same','value','identity','late-identity']){
  const actualEdit=mode!=='same';
  const f=scene(),node=f.child;let busy=false,revision=1,port,setters=0;const messages=[],roots=[];let main={id:'main-a',key:'a'.repeat(40),type:'COMPONENT',remote:true,parent:f.page},releaseIdentity=null,delayIdentity=false;f.root.type='INSTANCE';f.root.componentProperties={};f.root.getMainComponentAsync=()=>{if(delayIdentity){delayIdentity=false;const previous=main;return new Promise(resolve=>{releaseIdentity=()=>resolve(previous);});}return Promise.resolve(main);};f.page.selection=[f.root];node.fillStyleId='';node.fills=[{type:'SOLID',color:{r:1,g:0,b:0},opacity:1,visible:true}];
  globalThis.figma={currentPage:f.page,mixed:Symbol('mixed'),getNodeByIdAsync:async id=>id===f.root.id?f.root:id===node.id?node:null,viewport:{scrollAndZoomIntoView(){}},importStyleByKeyAsync:async()=>({id:'style',type:'PAINT',paints:node.fills})};
  node.setFillStyleIdAsync=async id=>{setters++;node.fillStyleId=id;};
  globalThis.__notificationRun=async options=>{
   roots.push(options.selection.map(node=>node.id));
   await new Promise(resolve=>setImmediate(()=>{if(options.runId.startsWith('v3-recheck-')){if(mode==='value')node.width=33;if(mode==='identity')main={id:'main-b',key:'b'.repeat(40),type:'COMPONENT',remote:true,parent:f.page};}if(mode==='late-identity'&&options.runId.startsWith('v3-recheck-'))delayIdentity=true;port.observeChange(event(node,['width','fillStyleId']));if(delayIdentity===false&&releaseIdentity){main={id:'main-b',key:'b'.repeat(40),type:'COMPONENT',remote:true,parent:f.page};releaseIdentity();releaseIdentity=null;}resolve();}));options.assertCurrent();
   const fingerprint=load('services/styleMetadata.ts').getNodePaintFingerprint(node,'fill'),action=options.findingActions.register({kind:'bind-style',nodeId:node.id,expectedStyleId:node.fillStyleId||null,targetStyleKey:'a'.repeat(40),targetName:'Red',styleField:'fill',reason:'exact-style-match',expectedFingerprint:fingerprint},'Привязать','customStyles');
   return{runId:options.runId,dataId:manifest.dataId,views:{visibleViews:{customStyles:[{id:node.id,name:'Color',actions:[action]}],relevance:{current:[]}}},textReport:{facts:{texts:[]}}};
  };
  port=module.exports.createV3NativePort({post:message=>{messages.push(message);if(message.type==='v3-audit-data-request')queueMicrotask(()=>port.accept({type:'v3-audit-data-response',schemaVersion:p.VERSION,requestId:message.requestId,ownerRequestId:message.ownerRequestId,result:manifest}));},readRevision:()=>revision,isUnavailable:()=>busy,canMutate:()=>true,onBusy:value=>{busy=value;},onMutation:()=>{revision++;port.invalidate();},pluginVersion:'test'});
  const command=(type,requestId,extra={})=>port.accept(Object.assign({type,schemaVersion:p.BRIDGE,requestId},extra));
  async function until(check){const deadline=Date.now()+3000;while(!check()){if(Date.now()>deadline)throw Error('NOTIFICATION_WAIT:'+JSON.stringify(messages));await new Promise(setImmediate);}}
  try{
   command('v3-audit-run','initial',{kind:'components',channel:'Desktop',pageType:null,shellAuditEnabled:false});await until(()=>messages.some(m=>m.type==='v3-audit-result'));
   const first=messages.find(m=>m.type==='v3-audit-result'),actionId=first.result.visibleViews.customStyles[0].actions[0].id;
   command('v3-audit-action','apply',{runId:'initial',actionId});await until(()=>messages.some(m=>m.requestId.startsWith('v3-recheck-')&&['v3-audit-result','v3-audit-error'].includes(m.type)));
   const recheck=messages.find(m=>m.requestId.startsWith('v3-recheck-')&&['v3-audit-result','v3-audit-error'].includes(m.type));assert.equal(setters,1);assert.deepEqual(roots,[['root'],['root']]);assert.equal(port.busy(),false);
   assert.equal(recheck.type,actualEdit?'v3-audit-error':'v3-audit-result');if(actualEdit)assert.equal(recheck.code,'AUDIT_SOURCE_CHANGED');else assert.equal(node.fillStyleId,'style');
  }finally{port.close();delete globalThis.figma;delete globalThis.__notificationRun;}
 }
});
test('final identity overlap rechecks only the observation: unchanged passes, main swap refuses and repeated events remain stoppable',async()=>{
 const stub='export async function runV3Audit(options){return globalThis.__finalIdentityRun(options)};export const captureV3Texts=runV3Audit;export const getComponentKey=async()=>null;export const getReferenceStructure=async()=>null;export const resolveVariableMetadataForDiff=()=>null;';
 const built=await esbuild.build({entryPoints:[path.join(__dirname,'../src/v3-audit/native-port.ts')],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'final-identity-fixture',setup(build){build.onLoad({filter:/v3-audit\/entry\.ts$/},()=>({contents:stub,loader:'ts'}));}}]});
 const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,module,module.exports);
 for(const mode of ['quiet','overlap','changed','cancel']){
  const f=scene(),a={id:'a',type:'INSTANCE',name:'A',width:24,visible:true,parent:f.root,componentProperties:{}},b=Object.assign({},a,{id:'b',name:'B'});
  const mainA={id:'main-a',type:'COMPONENT',name:'A',key:'a'.repeat(40),remote:true,parent:f.page},initialB=Object.assign({},mainA,{id:'main-b',name:'B',key:'b'.repeat(40)});
  let mainB=initialB,armed=false,bReads=0,aReads=0,runs=0,releaseB=null,timer,port;const messages=[];f.root.children=[a,b];f.page.selection=[f.root];
  b.getMainComponentAsync=()=>{if(!armed)return Promise.resolve(mainB);if(++bReads===2&&mode!=='cancel'){const before=mainB;return new Promise(resolve=>{releaseB=()=>resolve(before);});}return Promise.resolve(mainB);};
  a.getMainComponentAsync=()=>{
   if(!armed)return Promise.resolve(mainA);aReads++;
   if(mode==='cancel'){queueMicrotask(()=>port.observeChange(event(b)));return Promise.resolve(mainA);}
   if(aReads!==1)return Promise.resolve(mainA);
   return new Promise(resolve=>setImmediate(()=>{
    if(mode!=='quiet')port.observeChange(event(b));
    if(mode==='changed')mainB=Object.assign({},initialB,{id:'foreign-main',key:'c'.repeat(40)});
    if(releaseB)releaseB();resolve(mainA);
   }));
  };
  globalThis.figma={currentPage:f.page,mixed:Symbol('mixed'),getNodeByIdAsync:async id=>[f.root,a,b].find(node=>node.id===id)||null};
  globalThis.__finalIdentityRun=async()=>{runs++;armed=true;if(mode==='cancel')timer=setTimeout(()=>port.accept({type:'v3-audit-cancel',schemaVersion:'apollo.v3-audit-bridge.v1',requestId:'final'}),0);return{runId:'final',dataId:'test',views:{visibleViews:{customStyles:[],relevance:{current:[]}}},textReport:{facts:{texts:[]}}};};
  port=module.exports.createV3NativePort({post:message=>messages.push(message),readRevision:()=>0,isUnavailable:()=>false,canMutate:()=>true,onBusy(){},onMutation(){},pluginVersion:'test'});
  try{
   port.accept({type:'v3-audit-run',schemaVersion:'apollo.v3-audit-bridge.v1',requestId:'final',kind:'components',channel:'Desktop',pageType:null,shellAuditEnabled:false});
   const deadline=Date.now()+3000;while(!messages.some(message=>['v3-audit-result','v3-audit-error','v3-audit-cancelled'].includes(message.type))){if(Date.now()>deadline)throw Error('FINAL_IDENTITY_WAIT');await new Promise(setImmediate);}
   const terminal=messages.find(message=>['v3-audit-result','v3-audit-error','v3-audit-cancelled'].includes(message.type));
   assert.equal(terminal.type,mode==='changed'?'v3-audit-error':mode==='cancel'?'v3-audit-cancelled':'v3-audit-result',mode);if(mode==='changed')assert.equal(terminal.code,'AUDIT_SOURCE_CHANGED');
   if(mode==='overlap'||mode==='cancel')assert.ok(aReads>1,'overlapping observation is revisited');
   assert.equal(runs,1,'the audit itself is not restarted');assert.equal(mainB.id,mode==='changed'?'foreign-main':'main-b');assert.equal(port.busy(),false);
   if(mode==='cancel'){await new Promise(setImmediate);assert.equal(messages.some(message=>message.type==='v3-audit-result'),false);}
  }finally{armed=false;clearTimeout(timer);port.close();delete globalThis.figma;delete globalThis.__finalIdentityRun;}
 }
});
