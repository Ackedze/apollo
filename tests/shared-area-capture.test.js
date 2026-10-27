const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createSharedAreaCapture}=require('../src/shared-area-capture');
const {createProgressBarCapture}=require('../src/design-check/progressbar-capture');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Invented native observations, not catalog evidence or a real Figma document.
function fixture(){
 const counts={text:0,variants:0,identity:0,exports:0,proofs:0},page={id:'0:1',type:'PAGE',parent:null,selection:[]};
 const main={key:'a'.repeat(40),name:'State=First',parent:{type:'COMPONENT_SET',key:'b'.repeat(40),name:'Observed component'}};
 const root={id:'1:1',type:'FRAME',name:'Area',visible:true,width:640,height:400,parent:page,children:[],exportAsync:async()=>{counts.exports++;return Buffer.alloc(64,1);}};
 const instance={id:'1:2',type:'INSTANCE',name:'Renamed layer',visible:true,parent:root,children:[],getMainComponentAsync:async()=>{counts.identity++;return main;}};
 let variant='First',characters='Observed content',current=true;
 Object.defineProperty(instance,'variantProperties',{get(){counts.variants++;return{State:variant};}});
 const text={id:'1:3',type:'TEXT',name:'Label',visible:true,parent:instance};
 Object.defineProperty(text,'characters',{get(){counts.text++;return characters;}});
 const context={id:'1:4',type:'TEXT',name:'Context',visible:true,parent:root,characters:'Outside contract'};
 const hidden={id:'1:5',type:'TEXT',name:'Hidden',visible:false,parent:root,characters:'Never collect'};
 root.children=[instance,context,hidden];instance.children=[text];page.selection=[root];
 const native=[root,instance,text,context],scan={selection:{complete:true,components:[{nodeId:instance.id,componentKey:main.key,componentSetKey:main.parent.key,componentName:main.parent.name}]},nodes:new Map(native.map(n=>[n.id,n])),topology:native.map(n=>[n.id,n.parent.id,n.type,n.name,0,0,100,24])};
 const anatomy=[{figmaNodeId:instance.id,properties:{component:{identity:{componentKey:main.key,componentSetKey:main.parent.key},propertyTypes:{State:'VARIANT',Label:'TEXT'},properties:{State:'First',Label:'not a variant'}}}},{figmaNodeId:text.id,properties:{text:{characters:'Observed content'}}}];
 const captures=[{captured:{anatomy,snapshot:{source:{},nodes:[{figmaNodeId:text.id,properties:{text:{characters:'EXPECTED VALUE MUST NOT LEAK'}}}]}}}];
 const verify=async()=>{counts.proofs++;if(!current)throw Error('SHARED_AREA_STALE');};
 const create=()=>createSharedAreaCapture({scan,captures,roots:[root],auditId:'audit:shared',pageId:page.id,hash,verify});
 const posts=[],api={currentPage:page,fileKey:'invented-file',base64Encode:b=>b.toString('base64')};
 return{counts,page,root,instance,text,context,scan,captures,anatomy,create,api,posts,setText:v=>characters=v,setVariant:v=>variant=v,invalidate:()=>current=false};
}
test('projection reuses actual text, variants and source names; expected baseline cannot supply observed values',()=>{
 const f=fixture(),shared=f.create();assert.equal(shared.complete,true);assert.deepEqual(f.counts,{text:0,variants:0,identity:0,exports:0,proofs:0});
 assert.equal(shared.nodes[2].text,'Observed content');assert.equal(shared.nodes[3].text,'Outside contract');
 assert.equal(shared.nodes[1].component.name,'Observed component');assert.equal(shared.nodes[1].name,'Renamed layer');assert.deepEqual(shared.nodes[1].component.variants,{State:'First'});
 assert.deepEqual(shared.metrics,{reusedTextReads:1,reusedVariantReads:1,additionalTextReads:1,additionalVariantReads:0,pngExports:0});
 assert.equal(shared.excludedHidden,1);assert.equal(shared.nodes.some(n=>n.id==='1:5'),false);assert.ok(shared.observedIds.has('1:5'));
 f.anatomy[1].properties.text.characters='Later mutation';f.anatomy[0].properties.component.properties.State='Second';assert.equal(shared.nodes[2].text,'Observed content');assert.equal(shared.nodes[1].component.variants.State,'First');assert.ok(Object.isFrozen(shared.nodes[1].component.variants));
});
test('PNG is lazy and shared across consumers/concurrent requests, with freshness checks before and after reuse',async()=>{
 const f=fixture(),s=f.create();assert.equal(f.counts.exports,0);const images=await Promise.all([s.image(),s.image()]);assert.equal(images[0],images[1]);assert.equal(f.counts.exports,1);assert.equal(s.metrics.pngExports,1);
 await s.image();assert.equal(f.counts.exports,1);f.invalidate();await assert.rejects(s.image(),/STALE/);assert.equal(f.counts.exports,1);
});
test('an edit during lazy PNG export is rejected; a failed export is retryable without a cached failure',async()=>{
 const f=fixture();f.root.exportAsync=async()=>{f.invalidate();return Buffer.alloc(64);};await assert.rejects(f.create().image(),/STALE/);
 const g=fixture();let attempts=0;g.root.exportAsync=async()=>{if(!attempts++)throw Error('export unavailable');return Buffer.alloc(64);};const s=g.create();await assert.rejects(s.image(),/export unavailable/);assert.equal((await s.image()).length,64);assert.equal(attempts,2);
});
test('missing surrounding facts are read once; overlapping actual observations must agree',()=>{
 const f=fixture();f.captures=[];const s=createSharedAreaCapture({scan:f.scan,captures:[],roots:[f.root],auditId:'a',pageId:f.page.id,hash,verify:async()=>{}});assert.equal(s.complete,true);assert.equal(f.counts.text,1);assert.equal(f.counts.variants,1);
 const g=fixture();g.captures.push({captured:{snapshot:{source:{}},anatomy:[{figmaNodeId:g.text.id,properties:{text:{characters:'Conflicting'}}}]}});assert.ok(g.create().gaps.includes('conflicting-actual-observations'));
 const h=fixture();const copy=JSON.parse(JSON.stringify(h.captures[0]));copy.captured.anatomy[0].properties.component.sourceIdentity={readAt:'different metadata'};h.captures.push(copy);assert.equal(h.create().complete,true);
});
test('incomplete/opaque/missing identity inputs remain explicit gaps and cannot export a pattern image',async()=>{
 for(const alter of [f=>f.scan.selection.complete=false,f=>f.captures[0].captured.snapshot.source.truncated=true,f=>f.captures[0].captured.snapshot.source.nativeSlotCaptureScope={omissions:[{nodeId:'opaque'}]},f=>f.scan.selection.components[0].componentKey='',f=>delete f.scan.selection.components[0].componentName,f=>f.scan.selection.components[0].componentKey='c'.repeat(40)]){
  const f=fixture();alter(f);const s=f.create();assert.equal(s.complete,false);assert.ok(s.gaps.length);await assert.rejects(s.image(),/INCOMPLETE/);assert.equal(f.counts.exports,0);
 }
 const f=fixture();Object.defineProperty(f.context,'characters',{get(){throw Error('unreadable');}});assert.ok(f.create().gaps.includes('text-unavailable'));
 const g=fixture();g.context.characters='x'.repeat(4001);assert.ok(g.create().gaps.includes('pattern-context-limit'));
 assert.equal(createSharedAreaCapture({roots:[]}),null);
});
test('shared native capture keeps the audit ID, does not recollect facts, and exports once across explicit pattern rechecks',async()=>{
 const f=fixture(),shared=f.create(),bridge=createProgressBarCapture({api:f.api,hash,post:m=>f.posts.push(m),readShared:()=>shared});
 const a=await bridge.capture('pattern:1'),b=await bridge.capture('pattern:2');assert.equal(a.captureId,'audit:shared');assert.equal(b.captureId,a.captureId);assert.equal(f.counts.identity,0);assert.equal(f.counts.variants,0);assert.equal(f.counts.text,0);assert.equal(f.counts.exports,1);
 assert.equal((await bridge.verify(b.captureId)).capture,b);assert.equal(f.counts.identity,1);assert.equal(f.counts.variants,1);assert.equal(f.counts.text,1);
 f.setText('Edited actual');await assert.rejects(bridge.verify(b.captureId),/STALE/);
});
test('shared source invalidation, selection changes and incomplete shared captures refuse before PNG',async()=>{
 for(const cause of ['source','selection','incomplete']){const f=fixture(),s=f.create();if(cause==='source')f.invalidate();if(cause==='selection')f.page.selection=[];if(cause==='incomplete')s.complete=false;
  const bridge=createProgressBarCapture({api:f.api,hash,post:()=>{},readShared:()=>s});await assert.rejects(bridge.capture('pattern:bad'));assert.equal(f.counts.exports,0);
 }
});
test('area scan preserves real main/set names in its existing identity read',async()=>{
 const ts=require('typescript'),box={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/area-scan.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:box,exports:box.exports,require:()=>require('../src/document-audit/reads'),Date,setTimeout,clearTimeout});
 const f=fixture(),scan=await box.exports.scanArea([f.root],()=>{});assert.equal(f.counts.identity,1);assert.equal(scan.selection.components[0].componentName,'Observed component');
});
test('private actual main routes contract audit into shared native pattern capture; no HTTP or model call', {skip:!process.env.APOLLO_SHARED_CAPTURE_BUNDLE},async()=>{
 const {postactionScene}=require('./postaction-scoped.fixture.cjs'),f=postactionScene(),key='a'.repeat(40);let exports=0,identities=0;
 f.source=JSON.parse(JSON.stringify(f.source).replaceAll('host-key',key));f.actual.main.key=key;f.latest.key=key;f.actual.variantProperties={};f.page.selection=[f.actual];
 f.actual.exportAsync=async()=>{exports++;return Buffer.alloc(64,1);};const read=f.actual.getMainComponentAsync;f.actual.getMainComponentAsync=async()=>{identities++;return read();};
 vm.runInNewContext(fs.readFileSync(process.env.APOLLO_SHARED_CAPTURE_BUNDLE,'utf8'),{figma:f.api,__html__:'',TextEncoder,setTimeout,clearTimeout});
 const wait=async(id,type)=>{for(let i=0;i<600;i++){const m=f.messages.find(m=>m.type===type&&m.requestId===id);if(m)return m;await new Promise(r=>setTimeout(r,5));}throw Error(JSON.stringify(f.messages.filter(m=>m.type==='error')));};
 const request=(id,operation,captureId=null)=>f.api.ui.onmessage({type:'progressbar-native-request',requestId:id,operation,captureId,nodeId:null});
 try{
  await f.api.ui.onmessage({type:'load-contract',source:f.source});await f.api.ui.onmessage({type:'audit',requestId:'shared-main-audit'});const result=await wait('shared-main-audit','audit-result');assert.ok(result.audit.auditId);assert.equal(exports,0);
  const before=identities;await request('pattern:main','capture');const first=await wait('pattern:main','progressbar-native-result');assert.equal(first.error,undefined);assert.equal(first.result.captureId,result.audit.auditId);assert.equal(identities,before);assert.equal(exports,1);assert.equal(first.result.nodes[0].component.key,key);assert.equal(first.result.nodes[0].component.name,f.actual.main.name);
  await request('pattern:again','capture');const second=await wait('pattern:again','progressbar-native-result');assert.equal(second.result.captureId,result.audit.auditId);assert.equal(exports,1);assert.equal(identities,before);
  await request('pattern:verify','verify',result.audit.auditId);assert.equal((await wait('pattern:verify','progressbar-native-result')).result,true);assert.ok(identities>before,'freshness still reads actual native identity');
  f.actual.opacity=.1;await request('pattern:stale','capture');assert.ok((await wait('pattern:stale','progressbar-native-result')).error);assert.equal(exports,1);
 }finally{f.emit('close');}
});
