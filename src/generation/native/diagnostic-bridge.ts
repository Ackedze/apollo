export function createNativeDiagnosticBridge(post:(message:unknown)=>void,reader:{run(spec?:unknown):Promise<unknown>;invalidate():void}){
 let active=false;
 async function handle(message:unknown){
  if(!message||typeof message!=='object')return false;
  const m=message as Record<string,unknown>;
  if(m.type!=='native-diagnostic-request')return false;
  if(typeof m.requestId!=='string'||!/^native-diagnostic:[1-9][0-9]{0,15}$/.test(m.requestId)||Object.keys(m).some(k=>!['type','requestId','spec'].includes(k)))return true;
  if(active){post({type:'native-diagnostic-result',requestId:m.requestId,error:'NATIVE_DIAGNOSTIC_BUSY'});return true;}
  active=true;
  try{const report=await reader.run(m.spec??null);post({type:'native-diagnostic-result',requestId:m.requestId,report});}
  catch{post({type:'native-diagnostic-result',requestId:m.requestId,error:'NATIVE_DIAGNOSTIC_READ_UNAVAILABLE'});}
  finally{active=false;}
  return true;
 }
 return{handle,invalidate:()=>reader.invalidate()};
}
