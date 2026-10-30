const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),ts=require('typescript');

// Exercise current producer source, independently of the last shared build.
function producer(api){
 const cache=new Map(),context=vm.createContext({figma:api,Date,Math,JSON,Set,Map,Promise,Symbol,console,setTimeout,clearTimeout});
 const load=file=>{
  if(cache.has(file))return cache.get(file).exports;
  const module={exports:{}};cache.set(file,module);const nativeRequire=createRequire(file);
  const require=id=>{const target=path.resolve(path.dirname(file),id);return id.startsWith('.')&&fs.existsSync(target+'.ts')?load(target+'.ts'):nativeRequire(id);};
  const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},fileName:file}).outputText;
  vm.runInContext('(function(require,module,exports){'+source+'\n})',context,{filename:file})(require,module,module.exports);
  return module.exports;
 };
 return{capture:load(path.resolve(__dirname,'../packages/component-contract-core/src/figma-capture.ts')),empty:load(path.resolve(__dirname,'../packages/component-contract-core/src/empty-text-capture.ts'))};
}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
function cancellation(){
 let stopped=false,reject;const signal=new Promise((_,r)=>reject=r);signal.catch(()=>{});
 const guard=()=>{if(stopped)throw Error('AUDIT_CANCELLED');};
 return{guard,read:async work=>{guard();const value=await Promise.race([Promise.resolve().then(()=>{guard();return work();}),signal]);guard();return value;},cancel:()=>{stopped=true;reject(Error('AUDIT_CANCELLED'));}};
}
const tick=()=>new Promise(r=>setImmediate(r));
async function until(check){for(let n=0;n<100&&!check();n++)await tick();assert.ok(check(),'producer reached expected pending read');}
const options=readControl=>({componentKey:'a'.repeat(40),acceptedComponentKeys:[],allowedComponentProperties:[],platform:'desktop',manualSourceHash:'b'.repeat(64),includePreview:false,readControl});

test('Stop during initial main-component read prevents all late scratch writes',async()=>{
 const pending=deferred(),control=cancellation();let pages=0,instances=0;
 const main={key:'a'.repeat(40),parent:null,createInstance(){instances++;throw Error('late create');}};
 const {capture}=producer({mixed:Symbol('mixed'),createPage(){pages++;throw Error('late page');}});
 const task=capture.captureInstanceAudit({id:'selected',getMainComponentAsync:()=>pending.promise},options(control));
 control.cancel();await assert.rejects(task,/AUDIT_CANCELLED/);pending.resolve(main);await tick();
 assert.equal(pages,0);assert.equal(instances,0);
});

test('Stop during mode read removes scratch reference/page and prevents late mode writes or next RPC',async()=>{
 const pending=deferred(),control=cancellation(),calls=[];let modeWrites=0,referenceRemoved=0,pageRemoved=0;
 const reference={id:'reference',componentProperties:{},remove(){referenceRemoved++;},setExplicitVariableModeForCollection(){modeWrites++;}};
 const page={appendChild(){},remove(){pageRemoved++;}};
 const main={key:'a'.repeat(40),parent:null,createInstance:()=>reference};
 const {capture}=producer({mixed:Symbol('mixed'),createPage:()=>page,variables:{getVariableCollectionByIdAsync:id=>{calls.push(id);return pending.promise;}}});
 const task=capture.captureInstanceAudit({id:'selected',componentProperties:{},children:[],resolvedVariableModes:{first:'mode',second:'mode'},getMainComponentAsync:async()=>main},options(control));
 await until(()=>calls.length===1);control.cancel();await assert.rejects(task,/AUDIT_CANCELLED/);
 assert.equal(referenceRemoved,1);assert.equal(pageRemoved,1);pending.resolve({id:'first'});await tick();
 assert.equal(modeWrites,0);assert.deepEqual(calls,['first']);
});

test('scratch page cleanup still runs if reference removal itself throws',async()=>{
 const control=cancellation(),pending=deferred();let reading=false,pageRemoved=0;
 const reference={componentProperties:{},remove(){throw Error('reference-remove-failed');}};
 const main={key:'a'.repeat(40),parent:null,createInstance:()=>reference};
 const {capture}=producer({mixed:Symbol('mixed'),createPage:()=>({appendChild(){},remove(){pageRemoved++;}}),variables:{getVariableCollectionByIdAsync:()=>{reading=true;return pending.promise;}}});
 const task=capture.captureInstanceAudit({id:'selected',componentProperties:{},children:[],resolvedVariableModes:{first:'mode'},getMainComponentAsync:async()=>main},options(control));
 await until(()=>reading);control.cancel();await assert.rejects(task,/reference-remove-failed/);assert.equal(pageRemoved,1);pending.resolve(null);await tick();
});

test('Stop propagates through empty-text variable resolver and prevents reading the next binding',async()=>{
 const pending=deferred(),control=cancellation(),calls=[],mixed=Symbol('mixed');
 const {empty}=producer({mixed,variables:{getVariableByIdAsync:id=>{calls.push(id);return pending.promise;}}});
 const node={characters:'',boundVariables:{fontFamily:{type:'VARIABLE_ALIAS',id:'font'},letterSpacing:{type:'VARIABLE_ALIAS',id:'spacing'}},fontName:{family:'Before',style:'Regular'},letterSpacing:{unit:'PIXELS',value:1}};
 const task=empty.captureResolvedEmptyText(node,mixed,control);await until(()=>calls.length===1);control.cancel();await assert.rejects(task,/AUDIT_CANCELLED/);
 pending.resolve({resolveForConsumer:()=>({resolvedType:'STRING',value:'Late family'})});await tick();assert.deepEqual(calls,['font']);
});

test('Stop during dependency mode read removes its scratch instance and prevents further capture',async()=>{
 const pending=deferred(),control=cancellation();let referenceRemoved=0,modeWrites=0;const calls=[];
 const reference={remove(){referenceRemoved++;},setExplicitVariableModeForCollection(){modeWrites++;}};
 const instance={type:'INSTANCE',resolvedVariableModes:{first:'mode',second:'mode'},getMainComponentAsync:async()=>({createInstance:()=>reference})};
 const {capture}=producer({getNodeByIdAsync:async()=>instance,variables:{getVariableCollectionByIdAsync:id=>{calls.push(id);return pending.promise;}}});
 const snapshot={selection:['root'],nodes:[{id:'child',type:'INSTANCE',component:{identity:{componentKey:'accepted'}}}],context:{platform:'desktop'}};
 const task=capture.captureComponentDependencies([{id:'child',figmaNodeId:'native-child'}],snapshot,{appendChild(){}},['accepted'],undefined,undefined,control);
 await until(()=>calls.length===1);control.cancel();await assert.rejects(task,/AUDIT_CANCELLED/);assert.equal(referenceRemoved,1);
 pending.resolve({id:'first'});await tick();assert.equal(modeWrites,0);assert.deepEqual(calls,['first']);
});

test('Stop during pristine-source identity read cleans its temporary instance',async()=>{
 const pending=deferred(),control=cancellation();let created=0,removed=0;
 const main={id:'main',key:'a'.repeat(40),remote:true,parent:null,createInstance(){created++;return{id:'pristine',getMainComponentAsync:()=>pending.promise,remove(){removed++;}};}};
 const child={id:'child',name:'Child',type:'FRAME',children:[],visible:true,resolvedVariableModes:{}};
 const root={id:'root',name:'Root',type:'INSTANCE',children:[child],visible:true,resolvedVariableModes:{},getMainComponentAsync:async()=>main};
 const {capture}=producer({mixed:Symbol('mixed')});const task=capture.collectAnatomy(root,'desktop',{},undefined,control);
 await until(()=>created===1);control.cancel();await assert.rejects(task,/AUDIT_CANCELLED/);assert.equal(removed,1);
 pending.resolve(main);await tick();assert.equal(created,1);assert.equal(removed,1);
});

test('controlled capture drains all sibling scratch cleanup before rejecting Stop',async()=>{
 const base=cancellation(),pending=deferred(),created=[],removed=[];let reads=0;
 const control={guard:base.guard,read:async work=>{const order=++reads;try{return await base.read(work);}catch(error){await new Promise(r=>setTimeout(r,order*2));throw error;}}};
 const children=Array.from({length:6},(_,n)=>{
  const main={id:'main'+n,key:String(n).repeat(40),remote:true,parent:null,createInstance(){created.push(n);return{id:'pristine'+n,getMainComponentAsync:()=>pending.promise,remove(){removed.push(n);}};}};
  return{id:'instance'+n,name:'Instance'+n,type:'INSTANCE',visible:true,resolvedVariableModes:{},getMainComponentAsync:async()=>main,children:[{id:'leaf'+n,name:'Leaf',type:'RECTANGLE',visible:true,children:[],resolvedVariableModes:{}}]};
 });
 const root={id:'root',name:'Root',type:'FRAME',children,visible:true,resolvedVariableModes:{}};
 const {capture}=producer({mixed:Symbol('mixed')});const task=capture.collectAnatomy(root,'desktop',{},undefined,control);
 await until(()=>created.length===6);base.cancel();await assert.rejects(task,/AUDIT_CANCELLED/);assert.equal(removed.length,6);
 pending.resolve(null);await tick();assert.equal(created.length,6);assert.equal(removed.length,6);
});

test('Stop in parallel swap identity reads prevents starting remaining RPCs or returning partial keys',async()=>{
 const pending=deferred(),control=cancellation(),calls=[];
 const nodeProperties=Object.fromEntries(Array.from({length:9},(_,n)=>['node'+n,{propertyTypes:{Swap:'INSTANCE_SWAP'},properties:{Swap:'component'+n}}]));
 const {capture}=producer({});const task=capture.captureSwapComponentKeys({nodeProperties},id=>{calls.push(id);return pending.promise;},control);
 await until(()=>calls.length===6);control.cancel();await assert.rejects(task,/AUDIT_CANCELLED/);
 pending.resolve({type:'COMPONENT',id:'component0',key:'a'.repeat(40)});await tick();assert.equal(calls.length,6);
});

test('Stop during preview export prevents late encoding or delivery',async()=>{
 const pending=deferred(),control=cancellation();let encoded=0;
 const {capture}=producer({base64Encode(){encoded++;return'late';}});
 const task=capture.exportPreview({width:100,height:50,exportAsync:()=>pending.promise},control);control.cancel();await assert.rejects(task,/AUDIT_CANCELLED/);
 pending.resolve(new Uint8Array([1,2,3]));await tick();assert.equal(encoded,0);
});

test('uncontrolled mode and empty-text failures preserve their previous uncertainty behavior',async()=>{
 const mixed=Symbol('mixed'),api={mixed,variables:{getVariableCollectionByIdAsync:async()=>{throw Error('denied');},getVariableByIdAsync:async()=>{throw Error('denied');}}};
 const {capture,empty}=producer(api);const warnings=await capture.applyModes({},{first:'mode'});assert.equal(warnings.length,1);
 const result=await empty.captureResolvedEmptyText({characters:'',boundVariables:{fontFamily:{type:'VARIABLE_ALIAS',id:'font'}}},mixed);
 assert.deepEqual(Array.from(result.unknownFacts),['text.fontName']);
});

test('active read control preserves successful capture facts apart from capture timestamp',async()=>{
 const {capture}=producer({mixed:Symbol('mixed'),root:{name:'Fixture'},currentPage:{id:'page'},fileKey:'fixture'});
 const root={id:'root',name:'Root',type:'FRAME',children:[],visible:true,resolvedVariableModes:{},componentPropertyReferences:{},x:0,y:0,width:100,height:50,absoluteBoundingBox:{x:0,y:0,width:100,height:50},fills:[],strokes:[],effects:[],boundVariables:{},layoutGrids:[]};
 const prior=await capture.collectNodes(root,'desktop',{}),controlled=await capture.collectNodes(root,'desktop',{},undefined,cancellation());
 prior.snapshot.generatedAt=controlled.snapshot.generatedAt;
 assert.deepEqual(JSON.parse(JSON.stringify(controlled)),JSON.parse(JSON.stringify(prior)));
});
