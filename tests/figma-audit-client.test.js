'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createFigmaAuditClient}=require('../src/figma-audit/client');
const p=require('../src/figma-audit/protocol');
const snapshot={version:p.VERSION,snapshotId:'s',pageId:'p',rootIds:['r'],nodes:[{id:'r',type:'FRAME',name:'Screen'}]};
const report={version:p.VERSION,snapshotId:'s',checks:[{id:'rule:r',sourceId:'hub/file.md',targets:['r'],status:'UNKNOWN'}],freshness:'NATIVE_RECHECKED'};
test('client relays only typed native reads and rechecks before displaying completed report',async()=>{
 let client,stage=0;const operations=[],requests=[];
 const run=()=>({version:p.VERSION,requestId:'request',runId:'run',snapshotId:'s',status:stage===2?'completed':'awaiting-native',pending:{callId:'call-'+stage,operation:stage===0?'read':'verify',nodeIds:stage===0?['r']:[]},report:stage===2?report:null});
 client=createFigmaAuditClient({send:message=>{operations.push(message.operation);queueMicrotask(()=>client.accept({type:'figma-audit-native-result',callId:message.callId,success:true,result:message.operation==='capture'?snapshot:message.operation==='read'?{nodes:[{id:'r',fills:[]}]}:{current:true,snapshotId:'s'}}));},request:async(url,options)=>{requests.push(url);let body={};if(options?.body)body=JSON.parse(options.body);if(url.endsWith('/status'))return {ok:true,json:async()=>({success:true})};if(url.endsWith('/runs')){const r=run();r.requestId=body.requestId;report.requestId=body.requestId;run.requestId=body.requestId;return {ok:true,json:async()=>({success:true,run:r})};}stage++;const r=run();r.requestId=run.requestId;return {ok:true,json:async()=>({success:true,run:r})};}});
 await client.start();assert.equal(client.getState().status,'done');assert.deepEqual(operations,['capture','read','verify','verify']);assert.equal(client.getState().report,report);
 client.accept({type:'native-diagnostic-invalidated'});assert.equal(client.getState().stale,true);await client.focus('r');assert.equal(operations.length,4);
});
test('client never dispatches a Proxy-proposed write operation',async()=>{
 const operations=[];let client;
 client=createFigmaAuditClient({send:m=>{operations.push(m.operation);queueMicrotask(()=>client.accept({type:'figma-audit-native-result',callId:m.callId,success:true,result:snapshot}));},request:async(url,opts)=>({ok:true,json:async()=>url.endsWith('/status')?{success:true}:{success:true,run:{version:p.VERSION,requestId:JSON.parse(opts.body).requestId,runId:'run',snapshotId:'s',status:'awaiting-native',pending:{callId:'x',operation:'apply',nodeIds:['r']}}}})});
 await client.start();assert.equal(client.getState().status,'error');assert.match(client.getState().error,/операция/);assert.deepEqual(operations,['capture']);
});
test('wire budgets measure UTF-8 bytes, including Cyrillic and astral characters',()=>{assert.equal(p.byteLength('Ая 😀'),Buffer.byteLength('Ая 😀'));});
