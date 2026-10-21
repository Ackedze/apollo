const test=require('node:test'),assert=require('node:assert/strict'),{contractRecord,validOverview,createContractDataBridge,createContractDataClient}=require("../src/contract-data");
const record=()=>contractRecord({component:{componentId:'sample',contractId:'sample',family:'Sample',library:'Synthetic',platform:'desktop'},metadata:{revision:1,updatedAt:'2026-10-15'}},'a'.repeat(64));
const connection=status=>({status,reason:'Synthetic data source'}),overview=()=>({schemaVersion:'apollo.contract-data.v1',rows:[Object.assign(record(),{checking:connection('connected'),figma:connection('dependency'),frontend:connection('not-connected')})],sources:{checking:connection('connected'),figma:connection('connected'),frontend:connection('connected')}});
function fixture(mode='proxy',fetcher=async()=>({ok:true,json:async()=>overview()})){
 let reads=0,requests=[],client;const bridge=createContractDataBridge({post:message=>queueMicrotask(()=>client.accept(message)),readState:()=>{reads++;return{mode,contracts:mode==='local'?[record()]:[]};}});
 client=createContractDataClient(message=>{requests.push(message);bridge.accept(message);},{fetcher,timeoutMs:30});return{client,bridge,requests,reads:()=>reads};
}
test('actual plugin mode controls checking membership; reopening refetches and main RPC is correlated',async()=>{
 let calls=0;const f=fixture('local',async(url,options)=>{assert.equal(url,'http://localhost:3001/v2/contracts/data-overview');assert.equal(options.cache,'no-store');calls++;return{ok:true,json:async()=>overview()};});
 let v=await f.client.read();assert.equal(v.rows[0].checking.status,'connected');assert.match(v.sources.checking.reason,/Локальный файл/);assert.equal(v.rows[0].figma.status,'dependency');assert.equal(validOverview(v),true);
 await f.client.read();assert.equal(calls,2);assert.equal(f.reads(),2);assert.notEqual(f.requests[0].requestId,f.requests[1].requestId);
 f.bridge.accept({type:'contract-data-request',requestId:'bad',root:'/private'});assert.equal(f.reads(),2);
});
test('proxy failure still shows actual local contracts with unavailable remote columns',async()=>{
 const f=fixture('local',async()=>{throw Error('offline');}),v=await f.client.read();assert.equal(v.rows.length,1);assert.equal(v.rows[0].checking.status,'connected');assert.equal(v.rows[0].figma.status,'unavailable');assert.equal(v.rows[0].frontend.status,'unavailable');assert.match(v.rows[0].figma.reason,/Proxy недоступен/);assert.equal(validOverview(v),true);
});
test('data timeout is reported separately from an offline Proxy',async()=>{
 const f=fixture('local',async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(Error('timed out'),{name:'AbortError'})),{once:true}))),value=await f.client.read();
 assert.equal(value.rows[0].checking.status,'connected');assert.equal(value.sources.figma.status,'unavailable');assert.match(value.sources.figma.reason,/время ожидания/i);assert.doesNotMatch(value.sources.figma.reason,/Proxy недоступен/);
});
test('HTTP error is identified without exposing the response body',async()=>{
 const f=fixture('proxy',async()=>({ok:false,status:503,json:async()=>({path:'/Users/private',error:'secret'})})),value=await f.client.read();
 assert.match(value.sources.checking.reason,/HTTP 503/);assert.doesNotMatch(JSON.stringify(value),/private|secret|Proxy недоступен/);
});
test('invalid DTO and missing actual main mode cannot masquerade as a current empty dataset',async()=>{
 const f=fixture('proxy',async()=>({ok:true,json:async()=>({rows:[],path:'/private'})}));await assert.rejects(f.client.read(),/CONTRACT_DATA_INVALID/);
 const client=createContractDataClient(()=>{},{fetcher:async()=>({ok:true,json:async()=>overview()}),timeoutMs:5});await assert.rejects(client.read(),/CONTRACT_DATA_MAIN_UNAVAILABLE/);
 const v=overview();v.rows.push(v.rows[0]);assert.equal(validOverview(v),false);v.rows.pop();v.rows[0].updatedAt='not-date';assert.equal(validOverview(v),false);
});
