const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),esbuild=require('esbuild');
function load(entry){const code=esbuild.buildSync({entryPoints:[path.join(__dirname,'../src/v3-audit',entry)],bundle:true,write:false,platform:'node',format:'cjs',supported:{'object-rest-spread':false}}).outputFiles[0].text;const mod={exports:{}};new Function('require','module','exports',code)(require,mod,mod.exports);return mod.exports;}
const {replaceCapturedTexts,planTextEdits}=load('actions/textReplacement.ts');
const mixed=Symbol('mixed'),font={family:'Alfa',style:'Regular'},bold={family:'Alfa',style:'Bold'};
function node(id,text){return{id,type:'TEXT',characters:text,parent:{id:'parent'},removed:false,fontName:font,fontSize:14,width:100,height:20,hasMissingFont:false,
 styles:Array.from({length:text.length},(_,i)=>i<3?'bold':'regular'),
 getRangeAllFontNames(){return[font,bold];},getStyledTextSegments(){return this.styles.map((style,index)=>({start:index,end:index+1,fontName:style==='bold'?bold:font}));},
 insertCharacters(start,value,inherit){const style=this.styles[inherit==='BEFORE'?start-1:start]||'regular';this.characters=this.characters.slice(0,start)+value+this.characters.slice(start);this.styles.splice(start,0,...Array(value.length).fill(style));},
 deleteCharacters(start,end){this.characters=this.characters.slice(0,start)+this.characters.slice(end);this.styles.splice(start,end-start);}};}
function harness(t,nodes,extra={}){
 const fonts=[],writes=[];let cancelled=false;
 globalThis.figma={mixed,loadFontAsync:async value=>fonts.push(value),...extra};t.after(()=>delete globalThis.figma);
 const targets=new Map(nodes.map((n,i)=>['v3-focus-'+i,{nodeId:n.id,text:n.characters}]));
 const changes=nodes.map((n,i)=>({focusActionId:'v3-focus-'+i,before:n.characters,after:n.characters+'!'}));
 const mutation={assertCurrent(){if(cancelled)throw Error('AUDIT_CANCELLED');},beforeWrite(){writes.push('write');}};
 return{targets,changes,mutation,fonts,writes,cancel(){cancelled=true;},run:changes=>replaceCapturedTexts(changes,targets,async id=>nodes.find(n=>n.id===id),mutation)};
}
test('range replacement keeps mixed formatting, exact spaces and astral text in one multi-target operation',async t=>{
 const first=node('a','Для кого 🧑'),second=node('b','50 - 60'),h=harness(t,[first,second]);
 h.changes[0].after='Для\u00a0кого 🧑';h.changes[1].after='50\u202f–\u202f60';
 const result=await h.run(h.changes);assert.deepEqual(result.textReplacements.map(n=>n.text),['Для\u00a0кого 🧑','50\u202f–\u202f60']);assert.equal(h.writes.length,2);assert.equal(h.fonts.length,2);
 assert.deepEqual(first.styles.slice(0,3),['bold','bold','bold']);assert.deepEqual(first.styles.slice(-2),['regular','regular']);
});
test('range boundaries never split a surrogate pair, including replacement of only the emoji low half',async t=>{
 const first=node('a','A😀Z'),h=harness(t,[first]);h.changes[0].after='A😁Z';await h.run(h.changes);assert.equal(first.characters,'A😁Z');assert.equal(first.styles.length,4);
});
test('eligible empty suggestion deletes the text while keeping the existing text node',async t=>{
 const first=node('a','Text'),h=harness(t,[first]);h.changes[0].after='';await h.run(h.changes);assert.equal(first.characters,'');assert.equal(first.id,'a');
});
test('changed text, unknown native targets, and unsafe values cannot write',async t=>{
 const first=node('a','Text'),h=harness(t,[first]);
 await assert.rejects(h.run([{...h.changes[0],focusActionId:'v3-focus-99'}]),/SOURCE_CHANGED/);
 await assert.rejects(h.run([{...h.changes[0],after:'bad\ud800'}]),/VALUE_INVALID/);
 first.characters='New edit';await assert.rejects(h.run(h.changes),/SOURCE_CHANGED/);assert.equal(h.writes.length,0);
 await assert.rejects(replaceCapturedTexts(h.changes,h.targets,async()=>first,null),/OBSERVER_UNAVAILABLE/);
});
test('batch preflights all targets and missing fonts before changing any node',async t=>{
 const first=node('a','One'),second=node('b','Two'),h=harness(t,[first,second]);second.hasMissingFont=true;
 await assert.rejects(h.run(h.changes),/FONT_UNAVAILABLE/);assert.equal(first.characters,'One');assert.equal(h.writes.length,0);
});
for(const field of ['characters','fontSize','styles'])test('font loading rechecks '+field+' before any write',async t=>{
 const first=node('a','One'),second=node('b','Two');let changed=false;
 const h=harness(t,[first,second],{loadFontAsync:async()=>{if(!changed){changed=true;if(field==='styles')first.styles[0]='regular';else first[field]=field==='characters'?'User edit':22;}}});
 await assert.rejects(h.run(h.changes),/SOURCE_CHANGED/);assert.equal(second.characters,'Two');assert.equal(h.writes.length,0);
});
test('font failure and cancellation do not alter text',async t=>{
 const first=node('a','Text'),h=harness(t,[first],{loadFontAsync:async()=>{throw Error('unavailable');}});
 await assert.rejects(h.run(h.changes),/FONT_UNAVAILABLE/);h.cancel();await assert.rejects(h.run(h.changes),/CANCELLED/);assert.equal(h.writes.length,0);
});
test('partial batch reports completed targets and preserves a later unrelated edit',async t=>{
 const first=node('a','One'),second=node('b','Two'),h=harness(t,[first,second]);
 const insert=first.insertCharacters;first.insertCharacters=function(...args){insert.apply(this,args);second.characters='User edit';};
 await assert.rejects(h.run(h.changes),error=>{assert.equal(error.message,'AUDIT_ACTION_SOURCE_CHANGED');assert.equal(error.textReplacements.length,1);assert.equal(error.failedTextNodeId,'b');return true;});
 assert.equal(first.characters,'One!');assert.equal(second.characters,'User edit');assert.equal(h.writes.length,1);
});
const {BRIDGE,VERSION}=require('../src/v3-audit/transport');
const protocol=require('../src/v3-audit/protocol'),crypto=require('node:crypto');
const {createV3NativePort}=load('native-port.ts');
async function nativeHarness(t,{canMutate=true,partial=false,instance=false,bound=false,unrelatedInstances=0}={}){
 const page={id:'page',type:'PAGE',name:'Page'},root={id:'root',type:'FRAME',name:'Card',width:320,visible:true,parent:page};
 const nodes=[node('text;deep:1','Для кого'),node('second','Next')];for(const n of nodes)Object.assign(n,{parent:root,name:'Label',visible:true,opacity:1});root.children=nodes;page.children=[root];page.selection=[root];
 const main={id:'main',type:'COMPONENT',name:'Card',key:'main-key',remote:true,parent:page};
 if(instance||bound)Object.assign(root,{type:'INSTANCE',componentProperties:{Title:{type:'TEXT',value:nodes[0].characters}},getMainComponentAsync:async()=>main});
 if(bound){Object.assign(nodes[0],{name:nodes[0].characters,autoRename:true,componentPropertyReferences:{characters:'Title'}});for(const key of ['insertCharacters','deleteCharacters']){const original=nodes[0][key];nodes[0][key]=function(...args){original.apply(this,args);this.name=this.characters;root.componentProperties.Title.value=this.characters;};}}
 const extraNodes=[],metrics={mainReads:0,otherTextReads:0};
 if(unrelatedInstances){
  root.children=nodes.slice();
  const readMain=root.getMainComponentAsync;if(readMain)root.getMainComponentAsync=async()=>{metrics.mainReads++;return readMain();};
  for(let index=0;index<unrelatedInstances;index++){
   const owner={id:'extra-instance-'+index,type:'INSTANCE',name:'Extra '+index,parent:root,visible:true,componentProperties:{},getMainComponentAsync:async()=>{metrics.mainReads++;return main;}};
   const text=Object.assign(node('extra-text-'+index,'Unrelated'),{name:'Extra text',parent:owner,visible:true,opacity:1});owner.children=[text];root.children.push(owner);extraNodes.push(owner,text);
  }
  let value=nodes[1].characters;Object.defineProperty(nodes[1],'characters',{configurable:true,get(){metrics.otherTextReads++;return value;},set(next){value=next;}});
 }
 let revision=0,port;const messages=[];
 globalThis.figma={fileKey:'fixture',editorType:'figma',root:{name:'Fixture'},currentPage:page,mixed,loadFontAsync:async()=>{},getNodeByIdAsync:async id=>[page,root,...nodes,...extraNodes].find(n=>n.id===id),viewport:{scrollAndZoomIntoView(){}}};
 t.after(()=>delete globalThis.figma);
 if(partial)nodes[1].insertCharacters=()=>{throw Error('native refusal');};
 const fileId='a'.repeat(64),url='https://ackedze.github.io/design-system_ab/policy.json';
 const body={schemaVersion:protocol.SCHEMA,entryUrl:url,policyFileId:fileId,files:[{id:fileId,sha256:'b'.repeat(64),bytes:10,urls:[url]}]};
 const manifest={...body,dataId:crypto.createHash('sha256').update(protocol.canonical(body)).digest('hex')};
 port=createV3NativePort({pluginVersion:'0.4.17',readRevision:()=>revision,isUnavailable:()=>false,canMutate:()=>canMutate,onBusy(){},onMutation(){revision++;port.invalidate('owned-text-write');},post(message){messages.push(message);if(message.type==='v3-audit-data-request')queueMicrotask(()=>port.accept({type:'v3-audit-data-response',schemaVersion:VERSION,requestId:message.requestId,ownerRequestId:message.ownerRequestId,...(message.operation==='manifest'?{result:manifest}:{error:'AUDIT_DATA_UNAVAILABLE'})}));}});
 t.after(()=>port.close());
 const send=(type,requestId,extra)=>port.accept({type,schemaVersion:BRIDGE,requestId,...extra});
 async function until(predicate){const deadline=Date.now()+3000;while(!messages.some(predicate)){assert(Date.now()<deadline,JSON.stringify(messages.map(m=>({type:m.type,code:m.code}))));await new Promise(setImmediate);}return messages.find(predicate);}
 send('v3-audit-run','run',{kind:'texts',channel:'Desktop',pageType:null,shellAuditEnabled:false});
 const captured=await until(m=>m.type==='v3-audit-result'||m.type==='v3-audit-error');assert.equal(captured.type,'v3-audit-result',captured.code);
 return{nodes,page,root,main,port,messages,send,until,captured,metrics};
}
test('native text batch keeps the retained scope usable without an automatic agent recheck',async t=>{
 const h=await nativeHarness(t),replacements=h.captured.result.textTargets.map((target,i)=>({focusActionId:target.focusActionId,before:h.nodes[i].characters,after:i?'Next – done':'Для\u00a0кого'}));
 h.send('v3-audit-text-replace','apply',{runId:'run',replacements});const reply=await h.until(m=>m.requestId==='apply');
 assert.equal(reply.type,'v3-audit-operation-result',reply.code);assert.equal(reply.textReplacements.length,2);assert.equal(reply.stale,false);assert.equal(reply.recheckRequestId,null);assert.equal(h.nodes[0].characters,'Для\u00a0кого');assert.equal(h.nodes[1].characters,'Next – done');
 h.send('v3-audit-text-replace','old',{runId:'run',replacements});assert.equal((await h.until(m=>m.requestId==='old')).code,'AUDIT_ACTION_SOURCE_CHANGED');
 assert.equal(h.messages.filter(m=>m.type==='v3-audit-result').length,1);
});
test('native partial error includes completed count and invalidates the result',async t=>{
 const h=await nativeHarness(t,{partial:true});h.send('v3-audit-text-replace','apply',{runId:'run',replacements:h.captured.result.textTargets.map((target,i)=>({focusActionId:target.focusActionId,before:h.nodes[i].characters,after:h.nodes[i].characters+'!'}))});
 const reply=await h.until(m=>m.requestId==='apply');assert.equal(reply.type,'v3-audit-operation-error');assert.equal(reply.stale,true);assert.equal(reply.mutationStarted,true);assert.equal(reply.textReplacements.length,1);assert.equal(reply.recheckRequestId,null);assert.equal(h.nodes[1].characters,'Next');
});
for(const cause of ['observer','page','source','unknown-run','unknown-target'])test('native text replacement refuses '+cause+' without writing',async t=>{
 const h=await nativeHarness(t,{canMutate:cause!=='observer'});if(cause==='page')figma.currentPage={id:'other'};if(cause==='source')h.nodes[0].characters='New edit';
 h.send('v3-audit-text-replace','apply',{runId:cause==='unknown-run'?'old':'run',replacements:[{focusActionId:cause==='unknown-target'?'v3-focus-999':h.captured.result.textTargets[0].focusActionId,before:'Для кого',after:'Для\u00a0кого'}]});
 const reply=await h.until(m=>m.requestId==='apply');assert.equal(reply.type,'v3-audit-operation-error');assert(!reply.mutationStarted);assert.equal(h.nodes[0].characters,cause==='source'?'New edit':'Для кого');
});

test('native range writes require an exact text readback',async t=>{
 const first=node('a','Text'),h=harness(t,[first]);first.insertCharacters=()=>{};
 await assert.rejects(h.run(h.changes),error=>{assert.equal(error.message,'AUDIT_TEXT_UNCONFIRMED');assert.equal(error.textReplacements.length,0);return true;});
 assert.equal(first.characters,'Text');
});

for(const [before,after] of [
 ['A a Bold b Z','A\u00a0a Bold\u00a0b Z'],
 ['45 % Bold 50 %','45% Bold 50%'],
 ['A😀 Bold 😀Z','A😁 Bold 😁Z'],
])test('separated edits preserve unchanged interior formatting: '+JSON.stringify(before),async t=>{
 const first=node('a',before),h=harness(t,[first]);first.fontName=mixed;
 first.styles=Array.from({length:before.length},(_,i)=>i>=before.indexOf('Bold')&&i<before.indexOf('Bold')+4?'bold':'regular');
 h.changes[0].after=after;await h.run(h.changes);
 const start=first.characters.indexOf('Bold');assert.equal(first.characters,after);assert.deepEqual(first.styles.slice(start,start+4),Array(4).fill('bold'));
 assert.equal(h.writes.length,1);
});
test('Unicode diff reconstructs small insertion/deletion combinations without splitting surrogate pairs',()=>{
 const values=[''];for(let length=1;length<=4;length++){const previous=values.filter(v=>Array.from(v).length===length-1);for(const v of previous)for(const c of ['a','😀'])values.push(v+c);}
 for(const before of values)for(const after of values){let output=before;for(const edit of planTextEdits(before,after).reverse()){
  assert(!/[\udc00-\udfff]/.test(before[edit.start]||''));assert(!/[\udc00-\udfff]/.test(before[edit.end]||''));
  output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
 }assert.equal(output,after);}
});
test('diff budget refusal happens before any target in a batch is written',async t=>{
 const first=node('a','First'),second=node('b','a'.repeat(1000)),h=harness(t,[first,second]);h.changes[1].after='b'.repeat(1000);
 await assert.rejects(h.run(h.changes),/AUDIT_TEXT_DIFF_TOO_COMPLEX/);assert.equal(h.writes.length,0);assert.equal(first.characters,'First');
});

test('cancellation between separated edits stops the remaining range and reports an incomplete target',async t=>{
 const before='A a Bold b Z',first=node('a',before),h=harness(t,[first]);h.changes[0].after='A\u00a0a Bold\u00a0b Z';
 const insert=first.insertCharacters;first.insertCharacters=function(...args){insert.apply(this,args);h.cancel();};
 await assert.rejects(h.run(h.changes),error=>{assert.equal(error.message,'AUDIT_CANCELLED');assert.equal(error.textReplacements.length,0);return true;});
 assert.equal(first.characters,'A a Bold\u00a0 b Z');assert.equal(h.writes.length,1);
});

test('two sequential native replacements retain the same run and accept delayed own notifications',async t=>{
 const h=await nativeHarness(t);
 for(let index=0;index<2;index++){
  const target=h.captured.result.textTargets[index],before=h.nodes[index].characters,after=before+'!';
  h.send('v3-audit-text-replace','sequential-'+index,{runId:'run',replacements:[{focusActionId:target.focusActionId,before,after}]});
  const reply=await h.until(m=>m.requestId==='sequential-'+index);assert.equal(reply.type,'v3-audit-operation-result',reply.code);assert.equal(reply.stale,false);
  h.port.observeChange({nodeChanges:[{id:h.nodes[index].id,node:h.nodes[index],type:'PROPERTY_CHANGE',properties:['characters','height'],origin:'LOCAL'}]});await new Promise(setImmediate);
 }
 assert.equal(h.messages.filter(m=>m.type==='v3-audit-result').length,1);assert(!h.messages.some(m=>m.type==='v3-audit-invalidated'));
});
test('external sibling edit during font loading is refused before any text write',async t=>{
 const h=await nativeHarness(t);figma.loadFontAsync=async()=>{h.nodes[1].characters='User edit';};
 h.send('v3-audit-text-replace','font-edit',{runId:'run',replacements:[{focusActionId:h.captured.result.textTargets[0].focusActionId,before:'Для кого',after:'Для\u00a0кого'}]});
 const reply=await h.until(m=>m.requestId==='font-edit');assert.equal(reply.type,'v3-audit-operation-error');assert.equal(h.nodes[0].characters,'Для кого');assert(!reply.mutationStarted);
});
test('post-write scope refusal preserves completed proof and does not allow another write',async t=>{
 const h=await nativeHarness(t),insert=h.nodes[0].insertCharacters;
 h.nodes[0].insertCharacters=function(...args){insert.apply(this,args);h.nodes[1].characters='User edit';};
 h.send('v3-audit-text-replace','late-edit',{runId:'run',replacements:[{focusActionId:h.captured.result.textTargets[0].focusActionId,before:'Для кого',after:'Для\u00a0кого'}]});
 const reply=await h.until(m=>m.requestId==='late-edit');assert.equal(reply.type,'v3-audit-operation-error');assert.equal(reply.stale,true);assert.deepEqual(reply.textReplacements,[{nodeId:h.nodes[0].id,text:'Для\u00a0кого'}]);assert.equal(h.nodes[1].characters,'User edit');
});
test('external context invalidation during an own write is not accepted as a retained own change',async t=>{
 const h=await nativeHarness(t),insert=h.nodes[0].insertCharacters;
 h.nodes[0].insertCharacters=function(...args){insert.apply(this,args);h.port.invalidate('external-context');};
 h.send('v3-audit-text-replace','interrupted',{runId:'run',replacements:[{focusActionId:h.captured.result.textTargets[0].focusActionId,before:'Для кого',after:'Для\u00a0кого'}]});
 const reply=await h.until(m=>m.requestId==='interrupted');assert.equal(reply.type,'v3-audit-operation-error');assert.equal(reply.stale,true);assert.equal(reply.textReplacements.length,0);
});

test('bound TEXT property and native auto-name side effects keep the next target usable',async t=>{
 const h=await nativeHarness(t,{bound:true});
 for(let index=0;index<2;index++){
  h.send('v3-audit-text-replace','bound-'+index,{runId:'run',replacements:[{focusActionId:h.captured.result.textTargets[index].focusActionId,before:h.nodes[index].characters,after:h.nodes[index].characters+'!'}]});
  const reply=await h.until(m=>m.requestId==='bound-'+index);assert.equal(reply.type,'v3-audit-operation-result',reply.code);assert.equal(reply.stale,false);
  h.port.observeChange({nodeChanges:[{id:h.root.id,node:h.root,type:'PROPERTY_CHANGE',properties:['componentProperties'],origin:'LOCAL'}]});await new Promise(setImmediate);
 }
 assert.equal(h.nodes[0].name,'Для кого!');assert.equal(h.root.componentProperties.Title.value,'Для кого!');
});
for(const change of ['identity','page','style'])test('native text rejects late '+change+' during font loading before a write',async t=>{
 const h=await nativeHarness(t,{instance:true});figma.loadFontAsync=async()=>{if(change==='identity')h.root.getMainComponentAsync=async()=>({...h.main,key:'changed'});if(change==='page')figma.currentPage={id:'other'};if(change==='style')h.nodes[0].styles[0]='changed';};
 h.send('v3-audit-text-replace','late-'+change,{runId:'run',replacements:[{focusActionId:h.captured.result.textTargets[0].focusActionId,before:'Для кого',after:'Для\u00a0кого'}]});
 const reply=await h.until(m=>m.requestId==='late-'+change);assert.equal(reply.type,'v3-audit-operation-error');assert(!reply.mutationStarted);assert.equal(h.nodes[0].characters,'Для кого');
});
test('a target edited again during queued identity verification is not claimed completed',async t=>{
 const h=await nativeHarness(t,{instance:true}),insert=h.nodes[0].insertCharacters;let written=false;
 h.nodes[0].insertCharacters=function(...args){insert.apply(this,args);written=true;h.port.observeChange({nodeChanges:[{id:this.id,node:this,type:'PROPERTY_CHANGE',properties:['characters'],origin:'LOCAL'}]});};
 h.root.getMainComponentAsync=async()=>{if(written)h.nodes[0].characters='User changed completed target';return h.main;};
 h.send('v3-audit-text-replace','changed-completion',{runId:'run',replacements:[{focusActionId:h.captured.result.textTargets[0].focusActionId,before:'Для кого',after:'Для\u00a0кого'}]});
 const reply=await h.until(m=>m.requestId==='changed-completion');assert.equal(reply.type,'v3-audit-operation-error');assert.equal(reply.stale,true);assert.deepEqual(reply.textReplacements,[]);
});
test('native cancellation during a range edit does not confirm the incomplete target',async t=>{
 const h=await nativeHarness(t),insert=h.nodes[0].insertCharacters;
 h.nodes[0].insertCharacters=function(...args){insert.apply(this,args);h.send('v3-audit-cancel','cancelled');};
 h.send('v3-audit-text-replace','cancelled',{runId:'run',replacements:[{focusActionId:h.captured.result.textTargets[0].focusActionId,before:'Для кого',after:'Для\u00a0кого'}]});
 const reply=await h.until(m=>m.requestId==='cancelled'&&m.type==='v3-audit-operation-cancelled');assert.equal(reply.stale,true);assert.deepEqual(reply.textReplacements,[]);assert.equal(h.nodes[1].characters,'Next');
});

for(const queued of [false,true])test('one text replacement reads each instance once plus queued dependencies: '+queued,async t=>{
 const h=await nativeHarness(t,{instance:true,unrelatedInstances:20});h.metrics.mainReads=0;h.metrics.otherTextReads=0;
 if(queued){const insert=h.nodes[0].insertCharacters;h.nodes[0].insertCharacters=function(...args){insert.apply(this,args);h.port.observeChange({nodeChanges:[{id:this.id,node:this,type:'PROPERTY_CHANGE',properties:['characters'],origin:'LOCAL'}]});};}
 h.send('v3-audit-text-replace','measure',{runId:'run',replacements:[{focusActionId:h.captured.result.textTargets[0].focusActionId,before:'Для кого',after:'Для\u00a0кого'}]});
 const reply=await h.until(m=>m.requestId==='measure');assert.equal(reply.type,'v3-audit-operation-result',reply.code);
 console.log('TEXT_REPLACE_WORK '+JSON.stringify({queued,instances:21,mainReads:h.metrics.mainReads,otherTextReads:h.metrics.otherTextReads}));
 assert.equal(h.metrics.mainReads,queued?22:21);assert.equal(h.metrics.otherTextReads,queued?4:3);
});
test('queued async identity validation still rejects a late silent sibling edit',async t=>{
 const h=await nativeHarness(t,{instance:true}),insert=h.nodes[0].insertCharacters;let written=false;
 h.nodes[0].insertCharacters=function(...args){insert.apply(this,args);written=true;h.port.observeChange({nodeChanges:[{id:this.id,node:this,type:'PROPERTY_CHANGE',properties:['characters'],origin:'LOCAL'}]});};
 h.root.getMainComponentAsync=async()=>{if(written)h.nodes[1].characters='Late sibling edit';return h.main;};
 h.send('v3-audit-text-replace','queued-sibling',{runId:'run',replacements:[{focusActionId:h.captured.result.textTargets[0].focusActionId,before:'Для кого',after:'Для\u00a0кого'}]});
 const reply=await h.until(m=>m.requestId==='queued-sibling');assert.equal(reply.type,'v3-audit-operation-error');assert.equal(reply.stale,true);assert.deepEqual(reply.textReplacements,[{nodeId:h.nodes[0].id,text:'Для\u00a0кого'}]);assert.equal(h.nodes[1].characters,'Late sibling edit');
});
test('text replacement exports closed preparation, source, write and confirmation timings',async t=>{
 const h=await nativeHarness(t);h.send('v3-audit-text-replace','phases',{runId:'run',replacements:[{focusActionId:h.captured.result.textTargets[0].focusActionId,before:'Для кого',after:'Для\u00a0кого'}]});
 const reply=await h.until(m=>m.requestId==='phases');assert.equal(reply.type,'v3-audit-operation-result',reply.code);
 const ends=reply.trace.events.filter(row=>row.event==='operation-phase-end');assert.deepEqual(ends.map(row=>row.stage),['text-preparation','source-verification','text-write','text-confirmation']);assert(ends.every(row=>Number.isFinite(row.durationMs)&&row.durationMs>=0));
});

test('without notifications no asynchronous main-component lookup is introduced after text write',async t=>{
 const h=await nativeHarness(t,{instance:true}),insert=h.nodes[0].insertCharacters;let written=false,lateReads=0;
 h.nodes[0].insertCharacters=function(...args){insert.apply(this,args);written=true;};
 h.root.getMainComponentAsync=async()=>{if(written){lateReads++;throw Error('Unexpected post-write asynchronous lookup');}return h.main;};
 h.send('v3-audit-text-replace','no-late-await',{runId:'run',replacements:[{focusActionId:h.captured.result.textTargets[0].focusActionId,before:'Для кого',after:'Для\u00a0кого'}]});
 const reply=await h.until(m=>m.requestId==='no-late-await');assert.equal(reply.type,'v3-audit-operation-result',reply.code);assert.equal(reply.stale,false);assert.equal(lateReads,0);
});
for(const cause of ['font','source','cancel','confirmation'])test('text operation timing phases close on '+cause+' failure',async t=>{
 const h=await nativeHarness(t),insert=h.nodes[0].insertCharacters;
 if(cause==='font')figma.loadFontAsync=async()=>{throw Error('Font missing');};
 if(cause==='source')figma.loadFontAsync=async()=>{h.nodes[1].characters='External';};
 if(cause==='cancel'||cause==='confirmation')h.nodes[0].insertCharacters=function(...args){insert.apply(this,args);if(cause==='cancel')h.send('v3-audit-cancel','phase-failure');else h.nodes[1].characters='External';};
 h.send('v3-audit-text-replace','phase-failure',{runId:'run',replacements:[{focusActionId:h.captured.result.textTargets[0].focusActionId,before:'Для кого',after:'Для\u00a0кого'}]});
 const reply=await h.until(m=>m.requestId==='phase-failure'&&m.type.startsWith('v3-audit-operation-'));assert.notEqual(reply.type,'v3-audit-operation-result');
 const events=reply.trace.events,starts=events.filter(row=>row.event==='operation-phase-start'),ends=events.filter(row=>row.event==='operation-phase-end');
 assert(starts.length);assert.deepEqual(starts.map(row=>row.stage).sort(),ends.map(row=>row.stage).sort());assert(ends.some(row=>row.outcome==='error'));assert(ends.every(row=>Number.isFinite(row.durationMs)));
});

for(const stage of ['fonts','identity'])test('cancellation closes an outstanding '+stage+' phase before replying',async t=>{
 const h=await nativeHarness(t,{instance:stage==='identity'});let started=false,release;const pending=new Promise(resolve=>{release=resolve;});
 if(stage==='fonts')figma.loadFontAsync=async()=>{started=true;await pending;};
 else h.root.getMainComponentAsync=async()=>{started=true;await pending;return h.main;};
 h.send('v3-audit-text-replace','waiting-cancel',{runId:'run',replacements:[{focusActionId:h.captured.result.textTargets[0].focusActionId,before:'Для кого',after:'Для\u00a0кого'}]});
 while(!started)await new Promise(setImmediate);h.send('v3-audit-cancel','waiting-cancel');
 const reply=await h.until(m=>m.requestId==='waiting-cancel'&&m.type==='v3-audit-operation-cancelled'),events=reply.trace.events;
 assert.deepEqual(events.filter(row=>row.event==='operation-phase-start').map(row=>row.stage).sort(),events.filter(row=>row.event==='operation-phase-end').map(row=>row.stage).sort());
 assert(events.some(row=>row.event==='operation-phase-end'&&row.outcome==='error'));release();await new Promise(setImmediate);assert.equal(h.nodes[0].characters,'Для кого');assert(!reply.mutationStarted);
});
