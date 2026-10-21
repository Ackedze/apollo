const p=require("./protocol");
function createAgentNativeBroker({api,scope,hash,epoch,observer,post}){
 let revision=0,busy=false,used=new Set();
 const context=()=>{const unavailable=[],read=(name,get)=>{try{return get();}catch{unavailable.push(name);return null;}};const fileKey=read('fileKey',()=>api.fileKey),pageId=read('currentPage',()=>api.currentPage?.id);return{fileKey:typeof fileKey==='string'?fileKey:null,pageId:typeof pageId==='string'?pageId:null,epoch:read('epoch',()=>{const value=epoch();if(!Number.isSafeInteger(value)||value<0)throw Error('Epoch unavailable');return value;}),observer:read('observer',()=>{const value=observer();if(!value||typeof value!=='object')throw Error('Observer unavailable');return value;}),unavailable};};
 function capture(node){return{id:node.id,type:node.type,x:typeof node.x==='number'?node.x:null,y:typeof node.y==='number'?node.y:null,width:typeof node.width==='number'?node.width:null,height:typeof node.height==='number'?node.height:null};}
 function onPage(node){let current=node;for(let i=0;current&&i<32;i++){if(current===api.currentPage)return true;current=current.parent;}return false;}
 function boundedRead(id){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('NATIVE_READ_TIMEOUT')),5000);Promise.resolve().then(()=>api.getNodeByIdAsync(id)).then(resolve,reject).finally(()=>clearTimeout(timer));});}
 return{invalidate(){revision++;used.clear();},accept(message){if(message?.type==='agent-native-cancel'){revision++;used.clear();return true;}if(message?.type!=='agent-native-read')return false;
  const frozen=p.clone(message),current=revision,key=frozen.identity?.runId+':'+frozen.callId+':'+frozen.nonce;
  const reply=observation=>{observation.evidenceHash=hash(observation);post({type:'agent-native-result',identity:frozen.identity,callId:frozen.callId,sequence:frozen.sequence,nonce:frozen.nonce,observation});};
  const run=async()=>{
   const initial=context(),observation={schemaVersion:'apollo.agent-observation.v1',identity:frozen.identity,callId:frozen.callId,sequence:frozen.sequence,nonce:frozen.nonce,status:'unknown',document:{fileKey:initial.fileKey,pageId:initial.pageId},epoch:initial.epoch,beforeHash:hash(initial),afterHash:null,facts:[],gaps:[],writesPerformed:false};
   const gap=(code,message)=>observation.gaps.push({code,message});
   if(initial.unavailable.length){gap('NATIVE_CONTEXT_READ_UNAVAILABLE','Actual context getter unavailable: '+initial.unavailable.join(', '));reply(observation);return;}
   if(!p.closed(frozen,['type','identity','callId','sequence','nonce','operation','arguments'])||!p.validIdentity(frozen.identity)||frozen.identity.target!=='figma'||typeof frozen.callId!=='string'||!/^[a-zA-Z0-9._:-]{1,120}$/.test(frozen.callId)||!Number.isSafeInteger(frozen.sequence)||frozen.sequence<1||typeof frozen.nonce!=='string'||!/^[a-f0-9]{32,64}$/.test(frozen.nonce)||!p.CAPABILITIES.figma.includes(frozen.operation)||!p.closed(frozen.arguments,['nodeIds'])||!Array.isArray(frozen.arguments.nodeIds)||frozen.arguments.nodeIds.some(id=>typeof id!=='string')){gap('AGENT_NATIVE_REQUEST_INVALID','Readonly request is invalid.');reply(observation);return;}
   if(busy||used.has(key)){gap('AGENT_NATIVE_REPLAY_OR_BUSY','One readonly operation at a time; replay rejected.');reply(observation);return;}used.add(key);busy=true;
   try{
    if(!scope){gap('NATIVE_LABORATORY_UNASSIGNED','No admitted laboratory config.');reply(observation);return;}
    if(initial.fileKey!==scope.destination.expectedFileKey||initial.pageId!==scope.destination.expectedPageId){gap('NATIVE_CONTEXT_UNAVAILABLE','API file/page identity missing or does not match admitted laboratory.');reply(observation);return;}
    if(frozen.arguments.nodeIds.length>scope.limits.maxNodes||frozen.arguments.nodeIds.some(id=>!scope.destination.allowedNodeIds.includes(id))||frozen.operation==='read_document_context'&&frozen.arguments.nodeIds.length){gap('NATIVE_SCOPE_REJECTED','Requested read is outside finite laboratory scope.');reply(observation);return;}
    if(initial.observer?.status!=='available'||initial.observer.cleanup!=='confirmed'||initial.observer.scope!=='current-page-nodechange'||initial.observer.pageId!==initial.pageId){gap('NATIVE_OBSERVER_COVERAGE_UNKNOWN','Current-page freshness is not observed.');reply(observation);return;}
    for(const id of frozen.arguments.nodeIds){const node=await boundedRead(id);if(!node||!onPage(node)){gap('NATIVE_NODE_UNAVAILABLE','Configured node is unavailable on current page.');break;}const before=capture(node);await Promise.resolve();const after=capture(node);if(hash(before)!==hash(after)){gap('NATIVE_FACTS_CHANGED','Node identity/geometry changed.');break;}observation.facts.push(after);}
    const after=context();observation.afterHash=hash(after);if(current!==revision||hash(initial)!==hash(after))gap('NATIVE_READ_STALE','Native epoch/page/observer changed during read.');if(!observation.gaps.length)observation.status='passed';reply(observation);
   }catch{gap('NATIVE_READ_UNAVAILABLE','Actual PluginAPI read failed.');reply(observation);}finally{busy=false;}
  };void run();return true;
 }};
}
module.exports={createAgentNativeBroker};
