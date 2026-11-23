'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {patternGroups}=require('../src/skills/pattern-audit/model');
const {createPatternAuditClient}=require('../src/skills/pattern-audit/client');
const {createFigmaAuditClient}=require('../src/figma-audit/client');
const p=require('../src/figma-audit/protocol');
test('pattern UI separates violations, recommendations and unfinished checks without counting PASS as a finding',()=>{
 const rows=[{status:'FAIL',severity:'error',id:'a'},{status:'FAIL',severity:'warning',id:'b'},{status:'UNKNOWN',id:'c'},{status:'NOT_CHECKED',id:'d'},{status:'PASS',id:'e'},{status:'NOT_APPLICABLE',id:'f'}],groups=patternGroups(rows);
 assert.deepEqual(groups.errors.map(x=>x.id),['a']);assert.deepEqual(groups.warnings.map(x=>x.id),['b']);assert.deepEqual(groups.unchecked.map(x=>x.id),['c','d']);
});
test('shared audit client does not consume another client RPC response',()=>{
 const first=createFigmaAuditClient({send:()=>{}}),second=createPatternAuditClient({send:()=>{}});
 const foreign={type:'figma-audit-native-result',callId:'not-owned',success:true,result:{}};
 assert.equal(first.accept(foreign),false);assert.equal(second.accept(foreign),false);
});
test('pattern tool explains an unsupported old Proxy without invoking native capture',async()=>{
 let reads=0;const client=createPatternAuditClient({send:()=>reads++,request:async()=>({status:404,ok:false,json:async()=>({})})});
 await client.start();assert.equal(reads,0);assert.match(client.getState().error,/версии Proxy нет проверки паттернов/);
});
test('pattern deselection retains pinned run while default Hub client still cancels',async()=>{
 const snapshot={version:p.VERSION,snapshotId:'s',pageId:'page',rootIds:['root'],nodes:[{id:'root',parentId:'page',name:'Scope',type:'FRAME',children:[]}],contextParents:[],excluded:[],limitations:[]};
 for(const pattern of [false,true]){
  let client,requestId,started=false,complete;let cancels=0;
  const ready=new Promise(resolve=>{complete=resolve;});
  const run=status=>({version:p.VERSION,requestId,runId:'run',snapshotId:'s',status,step:0});
  const make=pattern?createPatternAuditClient:createFigmaAuditClient;
  client=make({send:message=>queueMicrotask(()=>client.accept({type:'figma-audit-native-result',callId:message.callId,success:true,result:message.operation==='capture'?snapshot:{current:true,snapshotId:'s'}})),request:async(url,options={})=>{
   if(url.endsWith('/status'))return {ok:true,status:200,json:async()=>({success:true,wireVersion:p.VERSION,requestControl:'request-id-v1',factEvidence:'native-fields-v1'})};
   if(url.endsWith('/runs')){requestId=JSON.parse(options.body).requestId;started=true;return {ok:true,status:200,json:async()=>({success:true,run:run('running')})};}
   if(url.endsWith('/cancel')){cancels++;complete();return {ok:true,status:200,json:async()=>({success:true,requestId,stopping:false,run:run('cancelled')})};}
   await ready;return {ok:true,status:200,json:async()=>({success:true,run:run('cancelled')})};
  }});
  client.selection({id:'root',pageId:'page',valid:true});const task=client.start();while(!started)await new Promise(resolve=>setImmediate(resolve));
  client.selection({id:'',pageId:'page',valid:false});await new Promise(resolve=>setTimeout(resolve,10));
  if(pattern){assert.equal(cancels,0);await client.cancel();}else assert(cancels>0);
  complete();await task;assert.equal(client.busy(),false);
 }
});
