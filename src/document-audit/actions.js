const {contextValid}=require("./protocol");
const ACTION_SCHEMA='apollo.document-actions.v1';
const closed=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const id=v=>typeof v==='string'&&v.length>0&&v.length<=150;
function actionRequestValid(m){return closed(m,['type','schemaVersion','requestId','runId','findingId','targetId','actionId','context'])&&m.type==='document-action-request'&&m.schemaVersion===ACTION_SCHEMA&&[m.requestId,m.runId,m.findingId,m.targetId,m.actionId].every(id)&&contextValid(m.context);}
function buildActionData(observation,runId,context,hash,bindings=new Map()){
 const registry=new Map(),items=[],bindingStatus=bindings.status;bindings=bindings.bindings||bindings;
 for(const check of observation.checks)for(const f of check.findings){
  const descriptors=[];
  for(const target of f.targets){
   const n=observation.nodes.get(target.nodeId);let action=null;
   if(check.id==='freshness'&&f.status==='update'&&['independent-instance','projected-slot-root'].includes(f.evidence.scope)&&f.occurrences.includes(target.nodeId)&&n?.type==='INSTANCE'&&typeof n.swapComponent==='function'&&f.componentKey&&f.evidence.currentComponentId&&f.evidence.latestComponentId){
    action={kind:'update',nodeId:n.id,expectedKey:f.componentKey,currentId:f.evidence.currentComponentId,latestId:f.evidence.latestComponentId,label:'Обновить',description:'Обновить только этот экземпляр до проверенной опубликованной версии.'};
   }
   if(check.id==='theme'&&f.status==='theme-mismatch'&&f.evidence.collectionKey&&f.evidence.collectionRemote===true&&f.evidence.collectionId&&f.evidence.expectedModeId&&target.kind==='page-anchor'&&typeof observation.nodes.get(context.pageId)?.setExplicitVariableModeForCollection==='function'){
    action={kind:'theme',nodeId:target.nodeId,collectionId:f.evidence.collectionId,collectionKey:f.evidence.collectionKey,modeId:f.evidence.expectedModeId,label:'Сменить',description:'Сменить Theme текущей страницы на Corp.'};
   }
   const candidates=check.id==='customStyles'&&f.status==='custom-style'&&f.occurrences.includes(target.nodeId)?bindings.get(f.findingId)||[]:[];
   for(const binding of candidates){
    if(binding.nodeId!==target.nodeId||!['bind-variable','bind-style'].includes(binding.kind))continue;
    const key=binding.targetVariableKey||binding.targetStyleKey,actionId=hash([runId,f.findingId,target.id,binding.kind,key]);
    registry.set(actionId,Object.assign({},binding,{findingId:f.findingId,targetId:target.id}));
    descriptors.push({actionId,targetId:target.id,kind:binding.kind,label:'Привязать',description:binding.targetName+(binding.targetLibrary?' · '+binding.targetLibrary:'')+(binding.targetModes?.length?' · Режимы совпадения: '+binding.targetModes.join(', '):''),binding:{key,library:binding.targetLibrary||null,modes:binding.targetModes||[]}});
   }
   if(!action)continue;
   const actionId=hash([runId,f.findingId,target.id,action.kind]);registry.set(actionId,Object.assign({},action,{findingId:f.findingId,targetId:target.id}));
   descriptors.push({actionId,targetId:target.id,kind:action.kind,label:action.label,description:action.description});
  }
  if(descriptors.length)items.push({findingId:f.findingId,actions:descriptors});
 }
 const sidecar={schemaVersion:ACTION_SCHEMA,runId,context,items};if(bindingStatus)sidecar.bindingStatus=bindingStatus;return{registry,sidecar};
}
function instanceState(node){
 const props={};for(const [key,p] of Object.entries(node.componentProperties||{}))props[key]={type:p.type,value:p.value};
 const state={properties:props,overrides:node.overrides||[]};
 for(const key of ['x','y','width','height','opacity','scaleFactor'])state[key]=typeof node[key]==='number'?node[key]:null;
 return state;
}
// v3 compatible-property restoration, with an ambiguity guard on canonical names.
function restoreProperties(node,source){
 const updates={},target=Object.entries(node.componentProperties||{}),canonical=k=>k.replace(/#.+$/,'').trim();let matched=0,unmatched=0;
 for(const [key,p] of Object.entries(source.properties)){
  const exact=target.filter(([k,t])=>k===key&&t.type===p.type),fallback=target.filter(([k,t])=>canonical(k)===canonical(key)&&t.type===p.type),matches=exact.length?exact:fallback;
  const compatible=p.type==='BOOLEAN'?typeof p.value==='boolean':['TEXT','INSTANCE_SWAP','VARIANT'].includes(p.type)&&typeof p.value==='string';
  if(!compatible||matches.length!==1){unmatched++;continue;}
  updates[matches[0][0]]=p.value;matched++;
 }
 if(Object.keys(updates).length){if(typeof node.setProperties!=='function')throw Error('ACTION_PROPERTIES_UNAVAILABLE');node.setProperties(updates);}
 for(const [key,value] of Object.entries(updates))if(node.componentProperties[key]?.value!==value)throw Error('ACTION_PROPERTIES_NOT_CONFIRMED');
 return{matched,unmatched};
}
async function performAction(api,action,node,{read,guard,hash,beforeWrite,onWritten,applyBinding}){
 if(['bind-variable','bind-style'].includes(action.kind)){if(typeof applyBinding!=='function')throw Error('ACTION_BIND_UNAVAILABLE');return applyBinding(action,node,{guard,beforeWrite,onWritten});}
 if(action.kind==='theme'){
  const c=await read(()=>api.variables.getVariableCollectionByIdAsync(action.collectionId));guard();
  if(!c||c.id!==action.collectionId||c.remote!==true||c.key!==action.collectionKey||c.modes.filter(m=>m.modeId===action.modeId&&m.name==='Corp').length!==1)throw Error('ACTION_THEME_IDENTITY_CHANGED');
  if(typeof api.currentPage.setExplicitVariableModeForCollection!=='function')throw Error('ACTION_THEME_OPERATION_UNAVAILABLE');
  await beforeWrite();guard();api.currentPage.setExplicitVariableModeForCollection(c,action.modeId);onWritten();
  if(api.currentPage.explicitVariableModes?.[c.id]!==action.modeId)throw Error('ACTION_THEME_NOT_CONFIRMED');
  return{verified:true,message:'Theme страницы переключена на Corp.'};
 }
 if(action.kind!=='update'||node.type!=='INSTANCE'||typeof node.swapComponent!=='function')throw Error('ACTION_UPDATE_OPERATION_UNAVAILABLE');
 const source=instanceState(node),fingerprint=hash(source);
 const current=await read(()=>node.getMainComponentAsync());guard();
 if(!current||current.remote!==true||current.key!==action.expectedKey||current.id!==action.currentId)throw Error('ACTION_COMPONENT_IDENTITY_CHANGED');
 const latest=await read(()=>api.importComponentByKeyAsync(action.expectedKey));guard();
 if(!latest||latest.type!=='COMPONENT'||latest.remote!==true||latest.key!==action.expectedKey||latest.id!==action.latestId)throw Error('ACTION_PUBLISHED_IDENTITY_CHANGED');
 await beforeWrite();guard();if(hash(instanceState(node))!==fingerprint)throw Error('ACTION_INSTANCE_CHANGED');
 node.swapComponent(latest);onWritten();
 const restored=restoreProperties(node,source);
 const applied=await read(()=>node.getMainComponentAsync());guard();
 if(!applied||applied.id!==latest.id||applied.key!==latest.key||applied.remote!==true)throw Error('ACTION_UPDATE_NOT_CONFIRMED');
 return{verified:true,message:'Экземпляр обновлён. '+(restored.unmatched?'Часть прежних свойств несовместима с новой версией. ':''),restored};
}
module.exports={ACTION_SCHEMA,actionRequestValid,buildActionData,performAction,instanceState,restoreProperties};
