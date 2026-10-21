// Public correlation only: source values, labels, prompts and stderr stay in private evidence.
const SCHEMA='apollo.generation-failure.v1';
const token=value=>typeof value==='string'&&/^[a-zA-Z0-9._:-]{1,120}$/.test(value)?value:null;
const integer=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const nativeNodeId=value=>typeof value==='string'&&value.length<=512&&/^[a-zA-Z0-9._:-]+(?:;[a-zA-Z0-9._:-]+)*$/.test(value)?value:null;
function failureDiagnostic(code,context={},errorId){
 const value={schemaVersion:SCHEMA,errorId:token(errorId),code:typeof code==='string'&&/^[A-Z][A-Z0-9_]{1,119}$/.test(code)?code:'AGENT_EXECUTION_FAILED'};
 for(const key of ['phase','stage','runId','requestId','callId','operation','rootNodeId','nodeId','handle','mappingId','port','traceId','specHash','sourceHash'])value[key]=['rootNodeId','nodeId'].includes(key)?nativeNodeId(context[key]):token(context[key]);
 for(const key of ['modelStep','nativeSequence','operationIndex','revision'])value[key]=integer(context[key]);
 value.nodeStatus=value.nodeId?'known':'unresolved';
 return value;
}
function readFailure(message){
 if(typeof message!=='string'||message.length>2048)return null;
 try{const value=JSON.parse(message.slice(message.indexOf('{')));if(value.schemaVersion!==SCHEMA||!token(value.errorId)||!token(value.code))return null;return failureDiagnostic(value.code,value,value.errorId);}catch{return null;}
}
function failureText(message){
 const v=readFailure(message);if(!v)return message;
 const parts=[v.code,'ID '+v.errorId];
 for(const [key,label]of [['phase','этап'],['stage','шаг'],['modelStep','шаг модели'],['callId','вызов'],['operationIndex','операция (с 0)'],['operation','действие'],['handle','handle'],['nodeId','узел'],['mappingId','mapping'],['port','порт'],['traceId','trace'],['runId','run']])if(v[key]!==null)parts.push(label+': '+v[key]);
 if(!v.nodeId)parts.push('Фактический узел не установлен');
 return parts.join(' · ');
}
module.exports={SCHEMA,failureDiagnostic,readFailure,failureText};
