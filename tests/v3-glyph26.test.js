'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {buildSync}=require('esbuild');
const {createGlyph26Evaluator,RULE_IDS}=require('../src/v3-audit/policies/glyph26Policy');
const {currencyArtwork}=require('../src/skills/reglyph/icon-detection');
const {buildV3Groups,nativeMetrics}=require('../src/v3-audit/ui-model');
const key=n=>String(n).repeat(40);
function fixture(){
 const a=key(1),manual=key(2),target=key(3),native=key(4),logo=key(5),unused=key(6),protectedSet=key(7),currency=key(8),serviceSet=key(9);
 const base={oldIcons:[{key:a,name:'Old'},{key:manual,name:'Manual'}],newIcons:[{key:target}],mappings:[{oldKey:a,newKey:target}],
  observedIcons:[{key:native,category:'native'},{key:logo,category:'logo'},{key:unused,name:'Unused',category:'unused'}],legacyCurrencies:{sourceKeys:[currency],rows:[]}};
 const detection={containers:[],iconViewSets:[],protectedComponentSets:[{key:protectedSet}],protectedComponents:[],protectedFixedIconRules:[],protectedSourceIconSlots:[],serviceHeaderSets:[{key:serviceSet}]};
 const data={catalogs:{default:base,services:{newIcons:[],observedIcons:[]}},detection};
 const page={type:'PAGE',id:'page',children:[]};
 function node(id,componentKey,parent=page,setKey){const main={key:componentKey,type:'COMPONENT',parent:setKey?{type:'COMPONENT_SET',key:setKey}:null};return {id,name:'Renamed',type:'INSTANCE',visible:true,opacity:1,parent,children:[],main};}
 const readMain=async n=>n.main;
 return {a,manual,target,native,logo,unused,protectedSet,currency,serviceSet,data,node,readMain,page};
}
test('automatic and manual mappings reuse ReGlyph while native, logo, current and hidden icons have no finding',async()=>{
 const f=fixture(),evaluate=createGlyph26Evaluator(f.data,{readMain:f.readMain});
 assert.equal((await evaluate(f.node('auto',f.a))).status,'violation');
 assert.equal((await evaluate(f.node('manual',f.manual))).status,'warning');
 assert.equal((await evaluate(f.node('unused',f.unused))).status,'warning');
 for(const k of [f.target,f.native,f.logo])assert.equal((await evaluate(f.node('skip',k))).status,'not-applicable');
 const hidden=f.node('hidden',f.a);hidden.visible=false;assert.equal((await evaluate(hidden)).status,'not-applicable');
 const transparent=f.node('zero',f.a);transparent.opacity=0;assert.equal((await evaluate(transparent)).status,'not-applicable');
 assert.equal((await evaluate(f.node('unknown',key('a')))).status,'out-of-scope');
 const protectedOwner=f.node('owner',key('b'),f.page,f.protectedSet);
 assert.equal((await evaluate(f.node('nested',f.a,protectedOwner))).status,'not-applicable');
 const currentOwner=f.node('current-parent',f.target);
 assert.equal((await evaluate(f.node('nested-old',f.a,currentOwner))).status,'violation');
});
test('fixed content is excluded while a designer-configurable swap remains eligible',async()=>{
 const f=fixture(),ownerSet=key('b');
 f.data.detection.protectedFixedIconRules=[{componentSetKey:ownerSet,iconSetKeys:[],iconComponentKeys:[f.a],containerDepth:1,variantProperties:{Adapter:['fixed']}}];
 const owner=f.node('owner',key('c'),f.page,ownerSet);owner.main.variantProperties={Adapter:'fixed'};
 const frame={type:'FRAME',id:'frame',visible:true,parent:owner};const icon=f.node('fixed',f.a,frame);
 const evaluate=createGlyph26Evaluator(f.data,{readMain:f.readMain});
 assert.equal((await evaluate(icon)).status,'not-applicable');
 icon.componentPropertyReferences={mainComponent:'Icon#1'};
 assert.equal((await evaluate(icon)).status,'violation');
});
test('currency matching uses artwork rather than its name and preserves protected context',async()=>{
 const f=fixture(),node=f.node('currency',f.currency);node.fills=[];node.strokes=[];
 node.children=[{type:'VECTOR',visible:true,width:24,height:24,effects:[],strokes:[],vectorPaths:[{windingRule:'NONZERO',data:'M 0 0 L 1 1'}]}];
 f.data.catalogs.default.legacyCurrencies.rows=[{currency:'Currency',targetKey:f.target,artwork:currencyArtwork(node)}];
 const evaluate=createGlyph26Evaluator(f.data,{readMain:f.readMain});assert.equal((await evaluate(node)).status,'violation');
 node.name='Another currency';assert.equal((await evaluate(node)).status,'violation');
 node.children[0].vectorPaths[0].data='M 0 0 L 2 2';assert.equal((await evaluate(node)).status,'unknown');
 node.parent=f.node('protected',key('a'),f.page,f.protectedSet);assert.equal((await evaluate(node)).status,'not-applicable');
});
test('service pattern gates, read failures and cancellation preserve uncertainty',async()=>{
 const f=fixture(),header=f.node('header',key('a'),f.page,f.serviceSet);header.findAllWithCriteria=()=>[{name:'_title',type:'TEXT',characters:'Сервисы',visible:true,parent:header}];
 const evaluate=createGlyph26Evaluator(f.data,{readMain:f.readMain});assert.equal((await evaluate(header)).status,'service-pattern-required');
 header.findAllWithCriteria=()=>{throw Error('unreadable');};assert.equal((await evaluate(header)).status,'unknown');
 const unread=createGlyph26Evaluator(f.data,{readMain:async()=>{throw Error('unreadable');}});assert.equal((await unread(f.node('x',f.a))).status,'unknown');
 const cancelled=createGlyph26Evaluator(f.data,{readMain:f.readMain,guard(){throw Error('AUDIT_CANCELLED');}});
 await assert.rejects(cancelled(f.node('x',f.a)),/AUDIT_CANCELLED/);
});
test('all declared mapping and exclusion data are shared, with no second catalog or data API',async()=>{
 const base=require('../src/skills/reglyph/default.json'),services=require('../src/skills/reglyph/services.json'),detection=require('../src/skills/reglyph/detection.json');
 const evaluate=createGlyph26Evaluator({catalogs:{default:base,services},detection},{readMain:async n=>n.main});
 const mapped=new Set(base.mappings.map(m=>m.oldKey));let automatic=0,manual=0;
 for(const row of base.oldIcons){
  const result=await evaluate({id:'icon',type:'INSTANCE',visible:true,name:'Renamed',parent:{type:'PAGE'},main:{type:'COMPONENT',key:row.key,parent:null}});
  assert.equal(result.status,mapped.has(row.key)?'violation':'warning',row.key);
  result.status==='violation'?automatic++:manual++;
 }
 assert.equal(automatic,1499);assert.equal(manual,625);
 const built=buildSync({entryPoints:[path.join(__dirname,'../src/v3-audit/glyph26.ts')],bundle:true,write:false,metafile:true,platform:'node',format:'cjs'});
 const jsonInputs=Object.keys(built.metafile.inputs).filter(p=>p.endsWith('.json'));
 assert.deepEqual(jsonInputs.map(p=>path.basename(p)).sort(),['default.json','detection.json','services.json']);
 assert(!built.outputFiles[0].text.includes('glyph26-policy'));
});
test('only mobile platforms replace Patterns with Icons; findings keep existing red and warning meanings',()=>{
 const items=[{id:'auto',name:'Old',glyph26Status:'violation',focusActionId:'focus-a'},{id:'manual',name:'Manual',glyph26Status:'warning',focusActionId:'focus-b'}];
 for(const pickerLabel of ['iOS','Android']){
  const result={visibleViews:{glyph26:items},glyph26:{status:'complete'}};
  const summary=buildV3Groups(result,{pickerLabel}),group=summary.groups.find(g=>g.id==='icons');
  assert(group);assert.equal(group.title,'Иконки');assert.equal(group.description,'Устаревшие иконки, которые необходимо заменить\nна Glyph-26');assert.equal(group.count,2);
  assert(!summary.groups.some(g=>g.id==='patterns'));assert.deepEqual(group.categories[0].entries.map(r=>r.classification),['violation','warning']);
  assert.deepEqual(group.categories[0].entries.map(r=>r.title),['Устаревшая иконка, есть в Glyph-26','Устаревшая иконка, может не быть в Glyph-26']);
  assert.deepEqual(group.categories[0].entries.map(r=>r.informationMessage),[
   'Устаревшая иконка: можно заменить автоматически, используй навык «Перевести на Glyph-26».',
   'Устаревшая иконка: при автоматической замене может потребовать вмешательство, используй навык «Перевести на Glyph-26».',
  ]);
  assert.equal(nativeMetrics(result,{pickerLabel}).checks.find(c=>c.id==='v3:glyph26').findings.length,2);
 }
 for(const pickerLabel of ['Desktop','MobileWeb']){
  const summary=buildV3Groups({visibleViews:{glyph26:items}},{pickerLabel});assert(summary.groups.some(g=>g.id==='patterns'));assert(!summary.groups.some(g=>g.id==='icons'));
 }
 assert.equal(RULE_IDS.automatic,'apollo.glyph26.automatic');
});

test('native audit includes local icon findings, focus and export, while service layouts require designer decisions',async t=>{
 const code=buildSync({stdin:{contents:'module.exports=Object.assign({},require("./src/v3-audit/entry"),require("./src/v3-audit/embedded-data"),require("./src/v3-audit/remediation/session"))',resolveDir:path.join(__dirname,'..')},bundle:true,write:false,platform:'node',format:'cjs',supported:{'object-rest-spread':false}}).outputFiles[0].text;
 const runtime={exports:{}};new Function('module','exports','require',code)(runtime,runtime.exports,require);
 const {runV3Audit,createOfflineAuditIndex,createAuditSession}=runtime.exports;
 const base=require('../src/skills/reglyph/default.json'),detection=require('../src/skills/reglyph/detection.json');
 const {data}=require('./fixtures/v3-audit-compact-index.cjs');
 const mapped=base.mappings[0].oldKey,mappedKeys=new Set(base.mappings.map(m=>m.oldKey)),manual=base.oldIcons.find(i=>!mappedKeys.has(i.key)).key;
 const native=base.observedIcons.find(i=>i.category==='native').key,target=base.newIcons[0].key;
 const page={id:'page',type:'PAGE',name:'Fixture',parent:null,explicitVariableModes:{},children:[]};const all=[],mains=new Map();let focused;
 function node(id,k,setKey){
  const main={id:'main-'+id,type:'COMPONENT',key:k,name:'Library',remote:true,parent:setKey?{id:'set-'+id,type:'COMPONENT_SET',key:setKey,name:'Set',parent:null}:null,children:[]};mains.set(k,main);
  const n={id,type:'INSTANCE',name:'Renamed '+id,visible:true,opacity:1,parent:page,children:[],overrides:[],componentProperties:{},variantProperties:{},getMainComponentAsync:async()=>main,
   swapComponent(){throw Error('Read-only audit must never swap');}};all.push(n);return n;
 }
 const auto=node('auto',mapped),choice=node('manual',manual),ignored=node('native',native),current=node('current',target),nested=node('nested',mapped);
 nested.parent=current;current.children=[nested];
 const owner=node('protected-owner',key('c'),detection.protectedComponentSets[0].key),protectedIcon=node('protected-icon',mapped);protectedIcon.parent=owner;owner.children=[protectedIcon];
 page.children=[auto,choice,ignored,current,owner];
 globalThis.figma={currentPage:page,currentUser:null,fileKey:'fixture',root:{name:'Fixture'},editorType:'figma',mixed:Symbol('mixed'),variables:{getVariableCollectionByIdAsync:async()=>null},
  getNodeByIdAsync:async id=>all.find(n=>n.id===id)||null,importComponentByKeyAsync:async k=>mains.get(k),viewport:{scrollAndZoomIntoView(nodes){focused=nodes[0].id;}}};t.after(()=>delete globalThis.figma);
 const run=channel=>runV3Audit({runId:'glyph-'+channel,channel,offlineIndex:createOfflineAuditIndex(data.payload,data.dataId),selection:page.children,pageType:null,shellAuditEnabled:true,pluginVersion:'test',assertCurrent(){},onProgress(){}});
 const result=await run('iOS'),findings=result.views.visibleViews.glyph26;
 assert.deepEqual(findings.map(n=>[n.id,n.glyph26Status]).sort(),[['auto','violation'],['manual','warning'],['nested','violation']]);
 assert.equal(result.report.glyph26.findings.length,3);assert.equal(result.report.glyph26.source,'reglyph-bundled');
 const session=await createAuditSession(result,{get:()=>null,values:()=>[]},page.id,()=>{});
 await session.focus(findings.find(n=>n.id==='nested').focusActionId,()=>{});assert.equal(focused,'nested');
 const android=await run('Android');assert.equal(android.views.visibleViews.glyph26.length,3);
 const web=await run('Desktop');assert.equal(web.views.visibleViews.glyph26.length,0);assert.equal(web.report.glyph26.status,'not-applicable');
 const header=node('service-header',key('d'),detection.serviceHeaderSets[0].key);
 const title={id:'title',type:'TEXT',name:'_title',characters:'Сервисы',visible:true,parent:header,textStyleId:'',fills:[],boundVariables:{},getStyledTextSegments:()=>[]};header.children=[title];header.findAllWithCriteria=()=>[title];page.children.push(header);
 const services=await run('iOS');assert(services.views.visibleViews.glyph26.every(n=>n.glyph26Status==='warning'));assert(services.report.glyph26.findings.every(n=>n.classification==='warning'));
});

test('successful ReGlyph IDs remove only matching icon findings and update export without accepting other stale checks',()=>{
 const {createV3UiClient}=require('../src/v3-audit/ui-client'),{BRIDGE}=require('../src/v3-audit/transport');
 const client=createV3UiClient({send(){}}),items=[{id:'one',glyph26Status:'violation'},{id:'two',glyph26Status:'warning'}];
 client.start({requestId:'review',uiPreferences:{pickerLabel:'iOS'}});
 client.accept({type:'v3-audit-result',schemaVersion:BRIDGE,requestId:'review',kind:'components',result:{runId:'review',dataId:'a'.repeat(64),visibleViews:{glyph26:items,relevance:{current:[]}},glyph26:{status:'complete',findings:items.map(item=>({nodeId:item.id}))},report:{},textReport:{facts:{texts:[]}}}});
 const before=client.getState().result;
 client.removeReplacedGlyph26(['one','outside-review']);
 const after=client.getState().result;
 assert.deepEqual(after.visibleViews.glyph26.map(item=>item.id),['two']);
 assert.deepEqual(after.glyph26.findings,[{nodeId:'two'}]);
 assert.deepEqual(after.report.glyph26.resolvedNodeIds,['one']);
 assert.equal(after.visibleViews.relevance,before.visibleViews.relevance);
 assert.equal(before.visibleViews.glyph26.length,2);assert.equal(client.getState().stale,true);
 assert.equal(buildV3Groups(after,{pickerLabel:'iOS'}).groups.find(group=>group.id==='icons').count,1);
 client.removeReplacedGlyph26(['one']);assert.equal(client.getState().result,after);
 const sync=(sequence,updates,runId='review')=>client.accept({type:'v3-audit-glyph26-sync',schemaVersion:BRIDGE,runId,sequence,updates});
 sync(1,[{id:'one',status:'current'}]);assert.equal(client.getState().result.visibleViews.glyph26.length,1);
 const restored={id:'one',status:'legacy',classification:'violation',reason:'automatic-mapping',ruleId:RULE_IDS.automatic,sourceKey:'a'.repeat(40),targetKey:'b'.repeat(40)};
 sync(2,[restored]);assert.deepEqual(client.getState().result.visibleViews.glyph26.map(item=>item.id),['one','two']);
 assert.deepEqual(client.getState().result.glyph26.resolvedNodeIds,[]);
 assert.equal(buildV3Groups(client.getState().result,{pickerLabel:'iOS'}).groups.find(group=>group.id==='icons').count,2);
 const current=client.getState().result;sync(1,[{id:'one',status:'current'}]);sync(3,[{id:'one',status:'current'}],'older-review');assert.equal(client.getState().result,current);
 sync(3,[{id:'one',status:'current'}]);assert.deepEqual(client.getState().result.visibleViews.glyph26.map(item=>item.id),['two']);
 sync(4,[{id:'one',status:'unknown'}]);assert.equal(client.getState().result.glyph26.status,'incomplete');assert.equal(client.getState().result.visibleViews.glyph26.length,1);
 sync(5,[restored]);assert.equal(client.getState().result.glyph26.status,'complete');
 client.close();
});

test('native handoff is bound to an accepted mobile run, original roots and current file/page',async t=>{
 const esbuild=require('esbuild'),payload=require('./fixtures/v3-audit-compact-index.cjs').data;
 const code=esbuild.buildSync({stdin:{contents:'Object.assign(exports, require("./src/v3-audit/native-port"), require("./src/v3-audit/embedded-data"))',resolveDir:path.join(__dirname,'..')},bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text;
 const mod={exports:{}};new Function('module','exports','require',code)(mod,mod.exports,require);
 const base=require('../src/skills/reglyph/default.json'),source=base.mappings[0].oldKey;
 const page={id:'page',type:'PAGE',name:'Fixture',parent:null,explicitVariableModes:{},children:[],selection:[]};
 const main={id:'main',type:'COMPONENT',name:'Main',key:source,remote:true,parent:null,children:[]};
 const node={id:'icon',type:'INSTANCE',name:'Icon',parent:page,visible:true,opacity:1,width:24,height:24,children:[],overrides:[],componentProperties:{},variantProperties:{},getMainComponentAsync:async()=>main};page.children=[node];page.selection=[node];
 globalThis.figma={currentPage:page,currentUser:null,fileKey:'file',root:{name:'Fixture'},editorType:'figma',mixed:Symbol(),variables:{getVariableCollectionByIdAsync:async()=>null},getNodeByIdAsync:async id=>id==='icon'?node:null,importComponentByKeyAsync:async()=>main};t.after(()=>delete globalThis.figma);
 const messages=[],port=mod.exports.createV3NativePort({post:message=>messages.push(message),offlineIndex:()=>mod.exports.createOfflineAuditIndex(payload.payload,payload.dataId),readRevision:()=>0,isUnavailable:()=>false,canMutate:()=>false,onBusy(){},onMutation(){},pluginVersion:'test'});t.after(()=>port.close());
 await assert.rejects(port.glyph26Review('missing','iOS'),/недоступен/);
 port.accept({type:'v3-audit-run',schemaVersion:'apollo.v3-audit-bridge.v1',requestId:'accepted',kind:'components',channel:'iOS',pageType:null,shellAuditEnabled:true});
 const deadline=Date.now()+5000;while(!messages.some(m=>['v3-audit-result','v3-audit-error'].includes(m.type))){if(Date.now()>deadline)throw Error('Capture timeout');await new Promise(resolve=>setImmediate(resolve));}
 const result=messages.find(m=>m.type==='v3-audit-result');assert(result,JSON.stringify(messages.at(-1)));
 page.selection=[];const handoff=await port.glyph26Review('accepted','iOS');
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const updates=()=>messages.filter(message=>message.type==='v3-audit-glyph26-sync');
 const until=async predicate=>{const end=Date.now()+3000;while(!predicate()){if(Date.now()>end)throw Error('Sync timeout');await delay(10);}};
 const target=Object.assign({},main,{key:base.mappings[0].newKey});
 let current=target;node.getMainComponentAsync=async()=>current;
 port.recordGlyph26Replacements(['icon','outside-review']);await until(()=>updates().length===1);
 assert.deepEqual(updates()[0].updates,[{id:'icon',status:'current'}]);
 port.observeChange({nodeChanges:[{id:'unrelated-text',type:'PROPERTY_CHANGE',properties:['characters']}]});await delay(130);assert.equal(updates().length,1);
 port.observeChange({nodeChanges:[{id:'icon',type:'PROPERTY_CHANGE',properties:['x']}]});await delay(130);assert.equal(updates().length,1);
 current=main;port.observeChange({nodeChanges:[{id:'icon',type:'PROPERTY_CHANGE',properties:['mainComponent']}]});await until(()=>updates().length===2);
 assert.equal(updates()[1].updates[0].status,'legacy');assert.equal(updates()[1].updates[0].sourceKey,source);
 current=target;port.observeChange({nodeChanges:[{id:'icon',type:'PROPERTY_CHANGE',properties:['mainComponent']}]});await until(()=>updates().length===3);
 assert.equal(updates()[2].updates[0].status,'current');
 let release;node.getMainComponentAsync=()=>new Promise(resolve=>{release=()=>resolve(main);});
 port.observeChange({nodeChanges:[{id:'icon',type:'PROPERTY_CHANGE',properties:['mainComponent']}]});await until(()=>release);
 node.getMainComponentAsync=async()=>target;port.observeChange({nodeChanges:[{id:'icon',type:'PROPERTY_CHANGE',properties:['mainComponent']}]});release();
 await delay(180);assert.equal(updates().length,3);
 node.getMainComponentAsync=async()=>main;

 assert.deepEqual(handoff.roots,[node]);assert.deepEqual(handoff.candidates,[{id:'icon',key:source}]);
 await assert.rejects(port.glyph26Review('accepted','Android'),/недоступен/);
 figma.fileKey='other';await assert.rejects(port.glyph26Review('accepted','iOS'),/другой макет/);figma.fileKey='file';
 node.removed=true;await assert.rejects(port.glyph26Review('accepted','iOS'),/область недоступна/);
});

test('all Android AlertViewV2 presets suppress nested old icons in audit, while the base component stays configurable',async()=>{
 const f=fixture(),detection=require('../src/skills/reglyph/detection.json');
 const evaluate=createGlyph26Evaluator({catalogs:f.data.catalogs,detection},{readMain:f.readMain});
 const sets=detection.protectedComponentSets.filter(row=>row.name.startsWith('AlertViewV2 '));
 const singles=detection.protectedComponents.filter(row=>row.name.startsWith('AlertViewV2 '));
 assert.equal(sets.length,7);assert.equal(singles.length,4);
 for(const row of sets)for(const view of ['Compact','Fullscreen']){
  const owner=f.node('owner-'+row.nodeId+'-'+view,key('a'),f.page,row.key);
  const icon=f.node('nested-'+view,f.a,owner);
  assert.equal((await evaluate(icon)).status,'not-applicable',row.name+' '+view);
 }
 for(const row of singles){
  const owner=f.node('owner-'+row.nodeId,row.key);
  assert.equal((await evaluate(f.node('nested',f.a,owner))).status,'not-applicable',row.name);
 }
 const base=f.node('base',key('a'),f.page,'7b0b3cc8a8e00b2730781100de3257ade7a95ce2');
 assert.equal((await evaluate(f.node('configurable',f.a,base))).status,'violation');
 assert.equal((await evaluate(f.node('standalone',f.a))).status,'violation');
});
