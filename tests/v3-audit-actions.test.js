const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const esbuild=require('esbuild');
function load(file){const built=esbuild.buildSync({entryPoints:[path.join(__dirname,'../src/v3-audit',file)],bundle:true,write:false,metafile:true,platform:'node',format:'cjs',logLevel:'silent'});assert(!Object.keys(built.metafile.inputs).some(p=>/component-contract-core|experimentalContractV2|predicate\/index/.test(p)));const m={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,m,m.exports);return m.exports;}
const paint=red=>({type:'SOLID',color:{r:red,g:0,b:0},opacity:1,visible:true});
function fixture(t){
 const node={id:'node',type:'RECTANGLE',name:'Color',removed:false,fillStyleId:'',fills:[paint(1)]};let writes=0;
 const control={assertCurrent(){if(node.removed)throw Error('AUDIT_ACTION_SOURCE_CHANGED');},beforeWrite(){writes++;control.assertCurrent();}};
 globalThis.figma={mixed:Symbol('mixed'),getNodeByIdAsync:async()=>node,variables:{setBoundVariableForPaint:(p,field,v)=>Object.assign({},p,{boundVariables:{[field]:{type:'VARIABLE_ALIAS',id:v.id}}})}};
 t.after(()=>{delete globalThis.figma;});
 const fingerprint=load('services/styleMetadata.ts').getNodePaintFingerprint(node,'fill');
 return{node,control,fingerprint,writes:()=>writes};
}
test('token binding rechecks the live value after import, even without a delivered node event',async t=>{
 const f=fixture(t),{applyVariableBindingAction}=load('actions/variableBindingAction.ts');let release;
 figma.variables.importVariableByKeyAsync=()=>new Promise(resolve=>{release=resolve;});
 const action={kind:'bind-variable',nodeId:f.node.id,expectedStyleId:null,targetVariableKey:'a'.repeat(40),targetName:'Red',styleField:'fill',expectedFingerprint:f.fingerprint};
 const running=applyVariableBindingAction(action,null,f.control);await new Promise(setImmediate);f.node.fills=[paint(0.2)];release({id:'variable',resolvedType:'COLOR'});
 const result=await running;assert.equal(result.ok,false);assert.equal(f.writes(),0);assert.equal(f.node.fills[0].color.r,0.2);assert.equal(f.node.fills[0].boundVariables,undefined);
});
test('valid token binding uses the held identity and preserves the alpha binding behavior',async t=>{
 const f=fixture(t),{applyVariableBindingAction}=load('actions/variableBindingAction.ts');figma.variables.importVariableByKeyAsync=async()=>({id:'variable',resolvedType:'COLOR'});
 const result=await applyVariableBindingAction({kind:'bind-variable',nodeId:f.node.id,expectedStyleId:null,targetVariableKey:'a'.repeat(40),targetName:'Red',styleField:'fill',expectedFingerprint:f.fingerprint},null,f.control);
 assert.equal(result.ok,true);assert.equal(f.writes(),1);assert.equal(f.node.fills[0].boundVariables.color.id,'variable');assert.equal(f.node.fills[0].opacity,1);
});
test('style binding refuses a changed value after import before calling a native setter',async t=>{
 const f=fixture(t),{applyStyleBindingAction}=load('actions/styleBindingAction.ts');let release,setters=0;
 figma.importStyleByKeyAsync=()=>new Promise(resolve=>{release=resolve;});f.node.setFillStyleIdAsync=async()=>{setters++;};
 const running=applyStyleBindingAction({kind:'bind-style',nodeId:f.node.id,expectedStyleId:null,targetStyleKey:'a'.repeat(40),targetName:'Red',styleField:'fill',reason:'exact-style-match',expectedFingerprint:f.fingerprint},null,f.control);
 await new Promise(setImmediate);f.node.fills=[paint(0.2)];release({id:'style',type:'PAINT',paints:[paint(1)]});
 await assert.rejects(running,/AUDIT_ACTION_SOURCE_CHANGED/);assert.equal(setters,0);assert.equal(f.writes(),0);
});
test('valid style binding invokes its guarded native setter once',async t=>{
 const f=fixture(t),{applyStyleBindingAction}=load('actions/styleBindingAction.ts');let setters=0;
 figma.importStyleByKeyAsync=async()=>({id:'style',type:'PAINT',paints:[paint(1)]});f.node.setFillStyleIdAsync=async id=>{setters++;f.node.fillStyleId=id;};
 const result=await applyStyleBindingAction({kind:'bind-style',nodeId:f.node.id,expectedStyleId:null,targetStyleKey:'a'.repeat(40),targetName:'Red',styleField:'fill',reason:'exact-style-match',expectedFingerprint:f.fingerprint},null,f.control);
 assert.equal(result.ok,true);assert.equal(setters,1);assert.equal(f.writes(),1);assert.equal(f.node.fillStyleId,'style');
});
test('reset choices retain V3 allowed/unknown, variant alternatives, atomic paint and spacing semantics',()=>{
 const {resetChoices}=load('remediation/session.ts');
 const atom={nodeId:'child',details:{property:'fill',reference:{value:'#fff'},actual:{value:'#000'}},assessment:{verdict:'allowed'}};
 assert.deepEqual(resetChoices('root',atom),[]);assert.equal(resetChoices('root',atom,true).length,1);
 atom.assessment={verdict:'unknown',evidence:{resetSurface:'layer'}};assert.equal(resetChoices('root',atom)[0].payload.details[0].resetSurface,'paint');
 const variant={nodeId:'child',details:{property:'variant.View',reference:{value:'Primary'}},assessment:{verdict:'violation',evidence:{expected:['Secondary','Accent','Secondary']}}};
 const choices=resetChoices('root',variant);assert.equal(choices.length,2);assert.deepEqual(choices.map(choice=>choice.payload.remediations[0].properties.View),['Secondary','Accent']);
 assert.deepEqual(resetChoices('root',{nodeId:'child',details:{property:'composition.count',reference:{value:0}},assessment:{verdict:'violation'}}),[]);
 const spacing=resetChoices('root',{nodeId:'child',details:{property:'layout.padding.left',actual:{value:24}},assessment:{verdict:'violation',evidence:{requiredTokenSource:{collection:'Spacing'}}}});
 assert.deepEqual(spacing[0].payload.remediations,[{kind:'bind-layout-variable',nodeId:'child',property:'layout.padding.left',collectionName:'Spacing',value:24}]);
 const atomic=resetChoices('root',{nodeId:'child',details:{atomicChanges:[{property:'text.fontSize',reference:{value:20}},{property:'text.lineHeight',reference:{value:24}}]},assessment:{verdict:'violation'}});
 assert.equal(atomic[0].payload.details.length,2);
});
test('pending native mutation retains exclusivity through Stop and rechecks the original roots',async t=>{
 const p=require('../src/v3-audit/transport'),crypto=require('node:crypto');
 const main=path.join(__dirname,'../src/v3-audit/native-port.ts');
 const stub=`export async function runV3Audit(options){return globalThis.__v3FixtureRun(options)};export const captureV3Texts=runV3Audit;export const getComponentKey=async()=>null;export const getReferenceStructure=async()=>null;export const resolveVariableMetadataForDiff=()=>null;`;
 const built=await esbuild.build({entryPoints:[main],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'owned-capture-only',setup(build){build.onLoad({filter:/v3-audit\/entry\.ts$/},()=>({contents:stub,loader:'ts'}));}}]});
 const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,module,module.exports);
 const page={id:'page',type:'PAGE',selection:[],children:[],explicitVariableModes:{}},node={id:'node',name:'Layer',visible:true,type:'RECTANGLE',parent:page,removed:false,fillStyleId:'',fills:[paint(1)]};page.selection=[node];page.children=[node];
 let release,started=false,hostBusy=false,revision=1,port;const messages=[],capturedRoots=[];
 globalThis.figma={currentPage:page,mixed:Symbol('mixed'),getNodeByIdAsync:async id=>id===node.id?node:null,viewport:{scrollAndZoomIntoView(){}},importStyleByKeyAsync:async()=>({id:'style',type:'PAINT',paints:[paint(1)]})};
 node.setFillStyleIdAsync=async id=>{started=true;await new Promise(resolve=>{release=resolve;});node.fillStyleId=id;};
 globalThis.__v3FixtureRun=async options=>{
  capturedRoots.push(options.selection.map(node=>node.id));
  const fingerprint=load('services/styleMetadata.ts').getNodePaintFingerprint(node,'fill');
  const action=options.findingActions.register({kind:'bind-style',nodeId:node.id,expectedStyleId:node.fillStyleId||null,targetStyleKey:'a'.repeat(40),targetName:'Red',styleField:'fill',reason:'exact-style-match',expectedFingerprint:fingerprint},'Применить','layer');
  return{runId:options.runId,dataId:'a'.repeat(64),views:{visibleViews:{customStyles:[{id:node.id,name:node.name,actions:[action]}],relevance:{current:[]}}},textReport:{facts:{texts:[]}}};
 };
 const protocol=require('../src/v3-audit/protocol'),url='https://ackedze.github.io/design-system_ab/JSONS/referenceSourcesMVP.json',hash=text=>crypto.createHash('sha256').update(text).digest('hex');
 const file={id:hash(url),sha256:hash('{}'),bytes:2,urls:[url]},body={schemaVersion:protocol.SCHEMA,entryUrl:url,policyFileId:file.id,files:[file]},manifest=Object.assign({},body,{dataId:hash(protocol.canonical(body))});
 port=module.exports.createV3NativePort({post:message=>{messages.push(message);if(message.type==='v3-audit-data-request')queueMicrotask(()=>port.accept({type:'v3-audit-data-response',schemaVersion:p.VERSION,requestId:message.requestId,ownerRequestId:message.ownerRequestId,result:manifest}));},readRevision:()=>revision,isUnavailable:()=>hostBusy,canMutate:()=>true,onBusy:value=>{hostBusy=value;},onMutation:()=>{revision++;port.invalidate();},pluginVersion:'test'});
 t.after(()=>{port.close();delete globalThis.figma;delete globalThis.__v3FixtureRun;});
 async function until(check){const deadline=Date.now()+3000;while(!check()){if(Date.now()>deadline)throw Error('OWNED_NATIVE_WAIT:'+JSON.stringify(messages));await new Promise(setImmediate);}}
 const command=(type,requestId,extra={})=>port.accept(Object.assign({type,schemaVersion:p.BRIDGE,requestId},extra));
 const run=requestId=>command('v3-audit-run',requestId,{kind:'components',channel:'Desktop',pageType:null,shellAuditEnabled:false});
 run('initial');await until(()=>messages.some(message=>message.type==='v3-audit-result'));
 const result=messages.find(message=>message.type==='v3-audit-result'),actionId=result.result.visibleViews.customStyles[0].actions[0].id;
 command('v3-audit-action','write',{runId:'initial',actionId:'invented'});await until(()=>messages.some(message=>message.requestId==='write'&&message.type==='v3-audit-operation-error'));assert.equal(started,false);
 command('v3-audit-action','apply',{runId:'initial',actionId});await until(()=>started);assert(port.busy());
 command('v3-audit-cancel','apply');run('must-wait');assert(port.busy());assert(messages.some(message=>message.requestId==='must-wait'&&message.code==='AUDIT_BUSY'));
 page.selection=[];release();await until(()=>messages.some(message=>message.type==='v3-audit-result'&&message.requestId!=='initial'));
 assert.deepEqual(capturedRoots,[['node'],['node']]);assert.equal(node.fillStyleId,'style');assert.equal(port.busy(),false);assert.equal(messages.filter(message=>message.requestId==='apply'&&message.type==='v3-audit-operation-cancelled').length,1);
 const before=messages.length;command('v3-audit-run','forged',{kind:'components',channel:'Desktop',pageType:null,shellAuditEnabled:false,rootIds:['arbitrary']});await new Promise(setImmediate);assert.equal(messages.length,before,'closed run ignores caller-supplied roots');
});
test('reset refuses a changed mixed text range after an asynchronous reference read',async t=>{
 const fs=require('node:fs'),ts=require('typescript');
 const build=await esbuild.build({entryPoints:[path.join(__dirname,'../src/v3-audit/remediation/session.ts')],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'owned-reference-delay',setup(build){build.onLoad({filter:/v3-audit\/reference\/library\.ts$/},args=>{let source=fs.readFileSync(args.path,'utf8');const parsed=ts.createSourceFile(args.path,source,ts.ScriptTarget.Latest,true);const declaration=parsed.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='ensureReferenceCatalogsLoaded');assert(declaration?.body);source=source.slice(0,declaration.body.pos)+' {await globalThis.__v3ReferenceDelay();}'+source.slice(declaration.body.end);return{contents:source,loader:'ts'};});}}]});
 const module={exports:{}};new Function('require','module','exports',build.outputFiles[0].text)(require,module,module.exports);
 const page={id:'page',type:'PAGE',explicitVariableModes:{}},mixed=Symbol('mixed');let release,rangeSize=14,writes=0;
 const node={id:'text',name:'Text',type:'TEXT',parent:page,removed:false,visible:true,textAlignHorizontal:'RIGHT',fontName:mixed,fontSize:mixed,characters:'Example',getStyledTextSegments:()=>[{start:0,end:7,characters:'Example',fontName:{family:'Example',style:'Regular'},fontSize:rangeSize}]};
 globalThis.figma={currentPage:page,mixed,getNodeByIdAsync:async()=>node,loadFontAsync:async()=>{}};globalThis.__v3ReferenceDelay=()=>new Promise(resolve=>{release=resolve;});
 t.after(()=>{delete globalThis.figma;delete globalThis.__v3ReferenceDelay;});
 const diff={nodeId:'text',details:{property:'text.align.horizontal',reference:{value:'LEFT'},actual:{value:'RIGHT'}},assessment:{verdict:'violation'}};
 const item={id:'text',name:'Text',diffs:[diff]},result={views:{visibleViews:{changes:[item]}},textReport:{facts:{texts:[]}}};
 const session=await module.exports.createAuditSession(result,{get:()=>null},page.id,()=>{}),actionId=diff.actions[0].id;
 const running=session.execute(actionId,{assertCurrent(){},beforeWrite(){writes++;}});await new Promise(setImmediate);assert(release);rangeSize=20;release();
 await assert.rejects(running,/AUDIT_ACTION_SOURCE_CHANGED/);assert.equal(writes,0);assert.equal(node.textAlignHorizontal,'RIGHT');
 diff.actions=[];const fresh=await module.exports.createAuditSession(result,{get:()=>null},page.id,()=>{});release=null;const positive=fresh.execute(diff.actions[0].id,{assertCurrent(){},beforeWrite(){writes++;}});await new Promise(setImmediate);release();await positive;assert(writes>0);assert.equal(node.textAlignHorizontal,'LEFT');
});
test('text whole/range fallback checks Stop inside the actuator and preserves normal compatibility',async t=>{
 const {applyStyleBindingAction}=load('actions/styleBindingAction.ts');let stopped=false,release,rangeWrites=0;
 const node={id:'text',type:'TEXT',removed:false,characters:'Example',textStyleId:'old',fontName:{family:'Example',style:'Regular'},textCase:'ORIGINAL',textDecoration:'NONE',
  getStyledTextSegments:()=>[{start:0,end:7,textCase:'ORIGINAL',textDecoration:'NONE'}],getRangeAllFontNames(){return[this.fontName];},getRangeTextStyleId(){return this.textStyleId;},
  setTextStyleIdAsync:()=>new Promise((_,reject)=>{release=()=>reject(Error('OWNED_WHOLE_SETTER_REJECT'));}),setRangeTextStyleIdAsync:async(_a,_b,id)=>{rangeWrites++;node.textStyleId=id;}};
 globalThis.figma={getNodeByIdAsync:async()=>node,importStyleByKeyAsync:async()=>({id:'target',type:'TEXT',fontName:node.fontName,textCase:'ORIGINAL',textDecoration:'NONE'}),loadFontAsync:async()=>{}};t.after(()=>delete globalThis.figma);
 const control={assertCurrent(){if(stopped)throw Error('AUDIT_CANCELLED');},beforeWrite(){control.assertCurrent();}},action={kind:'bind-style',nodeId:'text',expectedStyleId:'old',targetStyleKey:'a'.repeat(40),targetName:'Target',styleField:'text',reason:'deprecated-style'};
 for(const cancel of [true,false]){
  node.textStyleId='old';stopped=false;rangeWrites=0;release=null;
  const work=applyStyleBindingAction(action,null,control);await new Promise(setImmediate);assert(release);stopped=cancel;release();const result=await work;
  assert.equal(result.ok,!cancel);assert.equal(rangeWrites,cancel?0:1);assert.equal(node.textStyleId,cancel?'old':'target');
 }
});
test('identity reset holds native actions: delayed import Stop/source negatives and swap/reset positives',async t=>{
 const fs=require('node:fs'),ts=require('typescript'),crypto=require('node:crypto'),protocol=require('../src/v3-audit/protocol'),p=require('../src/v3-audit/transport');
 const stub=`export async function runV3Audit(options){return globalThis.__identityCapture(options)};export const captureV3Texts=runV3Audit;export const getComponentKey=async()=>null;export const getReferenceStructure=async()=>null;export const resolveVariableMetadataForDiff=()=>null;`;
 const built=await esbuild.build({entryPoints:[path.join(__dirname,'../src/v3-audit/native-port.ts')],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'owned-preloaded-capture',setup(build){
  build.onLoad({filter:/v3-audit\/entry\.ts$/},()=>({contents:stub,loader:'ts'}));
  build.onLoad({filter:/v3-audit\/reference\/library\.ts$/},args=>{let source=fs.readFileSync(args.path,'utf8');const parsed=ts.createSourceFile(args.path,source,ts.ScriptTarget.Latest,true),fn=parsed.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='ensureReferenceCatalogsLoaded');assert(fn?.body);return{contents:source.slice(0,fn.body.pos)+' {}'+source.slice(fn.body.end),loader:'ts'};});
 }}]});const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,module,module.exports);
 const hash=value=>crypto.createHash('sha256').update(value).digest('hex'),url='https://ackedze.github.io/design-system_ab/JSONS/referenceSourcesMVP.json',file={id:hash(url),sha256:hash('{}'),bytes:2,urls:[url]},body={schemaVersion:protocol.SCHEMA,entryUrl:url,policyFileId:file.id,files:[file]},manifest=Object.assign({},body,{dataId:hash(protocol.canonical(body))});
 t.after(()=>{delete globalThis.figma;delete globalThis.__identityCapture;});
 for(const mode of ['stop','source','swap','overrides','wrong-target']){
  const key='a'.repeat(40),page={id:'page',type:'PAGE',selection:[],children:[],explicitVariableModes:{}};let currentMain={key:'b'.repeat(40)},release,swaps=0,resets=0,revision=1,hostBusy=false,port;
  const node={id:'node',name:'Example',type:'INSTANCE',visible:true,removed:false,parent:page,width:24,height:24,componentProperties:{},variantProperties:{},getMainComponentAsync:async()=>currentMain,swapComponent(component){swaps++;currentMain=component;},resetOverrides(){resets++;}};page.selection=[node];page.children=[node];
  globalThis.figma={currentPage:page,mixed:Symbol('mixed'),getNodeByIdAsync:async id=>id===node.id?node:null,importComponentByKeyAsync:()=>new Promise(resolve=>{release=()=>resolve({type:'COMPONENT',key:mode==='wrong-target'?'c'.repeat(40):key,removed:false});}),viewport:{scrollAndZoomIntoView(){}}};
  const roots=[],messages=[];globalThis.__identityCapture=async options=>{roots.push(options.selection.map(node=>node.id));const diff={nodeId:node.id,details:{property:'component.identity',reference:{resourceType:'component',resourceId:mode==='overrides'?null:key}},assessment:{verdict:'violation'}};return{runId:options.runId,dataId:manifest.dataId,views:{visibleViews:{changes:[{id:node.id,name:node.name,diffs:[diff]}],relevance:{current:[]}}},textReport:{facts:{texts:[]}}};};
  port=module.exports.createV3NativePort({post:message=>{messages.push(message);if(message.type==='v3-audit-data-request')queueMicrotask(()=>port.accept({type:'v3-audit-data-response',schemaVersion:p.VERSION,requestId:message.requestId,ownerRequestId:message.ownerRequestId,result:manifest}));},readRevision:()=>revision,isUnavailable:()=>hostBusy,canMutate:()=>true,onBusy:value=>{hostBusy=value;},onMutation:()=>{revision++;port.invalidate();},pluginVersion:'test'});
  try{
   const cmd=(type,requestId,extra={})=>port.accept(Object.assign({type,schemaVersion:p.BRIDGE,requestId},extra));
   async function until(check){const end=Date.now()+3000;while(!check()){if(Date.now()>end)throw Error('IDENTITY_WAIT:'+mode+JSON.stringify(messages));await new Promise(setImmediate);}}
   cmd('v3-audit-run','initial',{kind:'components',channel:'Desktop',pageType:null,shellAuditEnabled:false});await until(()=>messages.some(m=>m.type==='v3-audit-result'));
   const actionId=messages.find(m=>m.type==='v3-audit-result').result.visibleViews.changes[0].diffs[0].actions[0].id;cmd('v3-audit-action','apply',{runId:'initial',actionId});
   if(mode!=='overrides'){
    await until(()=>release);
    if(mode==='stop'){cmd('v3-audit-cancel','apply');await until(()=>messages.some(m=>m.requestId==='apply'&&m.type==='v3-audit-operation-cancelled'));}
    if(mode==='source'){revision++;node.width=25;port.invalidate();await until(()=>messages.some(m=>m.requestId==='apply'&&m.type==='v3-audit-operation-error'));}
    if(['stop','source'].includes(mode)){
     assert.equal(port.busy(),false);release();await new Promise(setImmediate);await new Promise(setImmediate);assert.equal(swaps,0);assert.equal(resets,0);assert.equal(messages.filter(m=>m.type==='v3-audit-result').length,1);continue;
    }
    release();
   }
   await until(()=>messages.some(m=>m.requestId==='apply'&&m.type.startsWith('v3-audit-operation-')));
   const terminal=messages.find(m=>m.requestId==='apply'&&m.type.startsWith('v3-audit-operation-'));
   if(mode==='wrong-target'){assert.equal(terminal.type,'v3-audit-operation-error');assert.equal(terminal.mutationStarted,false);assert.equal(swaps,0);continue;}
   await until(()=>messages.filter(m=>m.type==='v3-audit-result').length===2);assert.equal(terminal.mutationStarted,true);assert(terminal.recheckRequestId);assert.deepEqual(roots,[['node'],['node']]);assert.equal(swaps,mode==='swap'?1:0);assert.equal(resets,mode==='overrides'?1:0);assert.equal(port.busy(),false);
  }finally{port.close();}
 }
});
