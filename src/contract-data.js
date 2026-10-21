const {createOpaqueId}=require("./design-check/opaque-id");
const SCHEMA='apollo.contract-data.v1',STATES=['connected','dependency','not-connected','unavailable','stale'];
const closed=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const text=v=>typeof v==='string'&&v.length>0&&v.length<=512&&!/^(?:\/|[A-Za-z]:[\\/]|file:)/.test(v);
const state=v=>closed(v,['status','reason'])&&STATES.includes(v.status)&&text(v.reason);
function contractRecord(manual,manualSourceHash){
 const c=manual.component,m=manual.metadata;
 return {componentId:c.componentId,contractId:c.contractId,name:c.family,library:c.library||'Не указана',platform:c.platform,
  revision:m.revision,manualSourceHash,updatedAt:typeof m.updatedAt==='string'&&/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(m.updatedAt)&&Number.isFinite(Date.parse(m.updatedAt))?m.updatedAt:null};
}
const recordKeys=['componentId','contractId','name','library','platform','revision','manualSourceHash','updatedAt'];
const validRecord=v=>closed(v,recordKeys)&&recordKeys.slice(0,5).every(k=>text(v[k]))&&Number.isSafeInteger(v.revision)&&v.revision>0&&/^[a-f0-9]{64}$/.test(v.manualSourceHash)&&(v.updatedAt===null||typeof v.updatedAt==='string'&&/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(v.updatedAt)&&Number.isFinite(Date.parse(v.updatedAt)));
const validRow=v=>closed(v,recordKeys.concat(['checking','figma','frontend']))&&validRecord(Object.fromEntries(recordKeys.map(k=>[k,v[k]])))&&['checking','figma','frontend'].every(k=>state(v[k]));
const validOverview=v=>closed(v,v&&Object.hasOwn(v,'dataId')?['schemaVersion','rows','sources','dataId']:['schemaVersion','rows','sources'])&&
 (!Object.hasOwn(v,'dataId')||typeof v.dataId==='string'&&/^[a-f0-9]{64}$/.test(v.dataId))&&
 v.schemaVersion===SCHEMA&&Array.isArray(v.rows)&&v.rows.length<=512&&v.rows.every(validRow)&&closed(v.sources,['checking','figma','frontend'])&&Object.values(v.sources).every(state)&&new Set(v.rows.map(key)).size===v.rows.length;
function key(row){return row.contractId+':'+row.manualSourceHash;}
function createContractDataBridge({post,readState}){return{accept(m){
 if(m?.type!=='contract-data-request')return false;
 if(!closed(m,['type','requestId'])||typeof m.requestId!=='string'||!/^contract-data:[a-zA-Z0-9-]{1,100}:[1-9][0-9]{0,8}$/.test(m.requestId))return true;
 const result=readState();post({type:'contract-data-result',requestId:m.requestId,result});return true;
}};}
function createContractDataClient(send,{fetcher=(...args)=>fetch(...args),timeoutMs=30000}={}){
 const tickets=new Map();let sequence=0;const identity=createOpaqueId();
 function local(){return new Promise((resolve,reject)=>{
  const requestId='contract-data:'+identity+':'+(++sequence),timer=setTimeout(()=>{tickets.delete(requestId);reject(Error('CONTRACT_DATA_MAIN_UNAVAILABLE'));},timeoutMs);
  tickets.set(requestId,{resolve,reject,timer});
  try{send({type:'contract-data-request',requestId});}catch{clearTimeout(timer);tickets.delete(requestId);reject(Error('CONTRACT_DATA_MAIN_UNAVAILABLE'));}
 });}
 return {accept(m){
  if(m?.type!=='contract-data-result')return false;const t=tickets.get(m.requestId);if(!t)return true;
  clearTimeout(t.timer);tickets.delete(m.requestId);
  if(!closed(m,['type','requestId','result'])||!closed(m.result,['mode','contracts'])||!['proxy','local'].includes(m.result.mode)||!Array.isArray(m.result.contracts)||m.result.contracts.length>512||!m.result.contracts.every(validRecord))t.reject(Error('CONTRACT_DATA_INVALID'));else t.resolve(m.result);
  return true;
 },async read(){
  const fallback=error=>{
   const reason=error.message==='CONTRACT_DATA_TIMEOUT'?'Истекло время ожидания данных от Proxy. Повтори загрузку.':error.message==='CONTRACT_DATA_PROXY_RESPONSE'?
    'Proxy ответил с ошибкой'+(Number.isInteger(error.status)&&error.status>=100&&error.status<=599?' (HTTP '+error.status+')':'')+'. Данные не получены.':'Proxy недоступен. Подключение данных не подтверждено.';
   return{schemaVersion:SCHEMA,rows:[],sources:Object.fromEntries(['checking','figma','frontend'].map(k=>[k,{status:'unavailable',reason}]))};
  };
  const remote=async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);try{
   const response=await fetcher('http://localhost:3001/v2/contracts/data-overview',{signal:controller.signal,cache:'no-store'});
   if(!response.ok)throw Object.assign(Error('CONTRACT_DATA_PROXY_RESPONSE'),{status:response.status});const value=await response.json();if(!validOverview(value))throw Error('CONTRACT_DATA_INVALID');return value;
  }catch(error){if(controller.signal.aborted)throw Error('CONTRACT_DATA_TIMEOUT');throw error;}finally{clearTimeout(timer);}};
  const [mode,result]=await Promise.all([local(),remote().catch(e=>{if(e.message==='CONTRACT_DATA_INVALID')throw e;return fallback(e);})]);
  if(mode.mode==='local'){
   const rows=new Map(result.rows.map(row=>[key(row),Object.assign({},row,{checking:{status:'not-connected',reason:'Для проверки в плагине выбран локальный файл.'}})]));
   const absent=target=>result.sources[target].status==='connected'?{status:'not-connected',reason:'Эта версия не подключена к текущему адаптеру.'}:result.sources[target];
   for(const value of mode.contracts){const existing=rows.get(key(value));rows.set(key(value),Object.assign({},value,{checking:{status:'connected',reason:'Локальный файл, загруженный в этот плагин.'},figma:existing?.figma||absent('figma'),frontend:existing?.frontend||absent('frontend')}));}
   result.rows=Array.from(rows.values());result.sources.checking={status:'connected',reason:'Локальный файл, загруженный в этот плагин.'};
  }
  if(!validOverview(result))throw Error('CONTRACT_DATA_INVALID');
  return result;
 }};
}
module.exports={SCHEMA,contractRecord,validRecord,validOverview,createContractDataBridge,createContractDataClient};
