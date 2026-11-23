'use strict';
const planApi=require('./native-plan');
const {forApi}=require('./native-recipes');
const {cooperativeRead}=require('../document-audit/reads');
const NS='apollolanding';
const fail=(code,diagnostic={})=>{throw Object.assign(Error(code),{code,diagnostic});};
const data=(node,key)=>node.getSharedPluginData(NS,key);
const all=root=>{const result=[],pending=[root];while(pending.length){const n=pending.pop();result.push(n);if(result.length>5000)fail('LANDING_READBACK_TOO_LARGE');if('children'in n)pending.push(...Array.from(n.children).reverse());}return result;};
function pin(readback){const value=Object.assign({},readback);delete value.leaseNonce;return value;}
// Same native-v2 import rule as the retained Proxy reader; geometry is still strict here.
function unchanged(before,after){
 const a=pin(before),b=pin(after),old=a.native,next=b.native;delete a.native;delete b.native;
 if(!planApi.equal(a,b)||!old||!next||old.nodes.length!==next.nodes.length||Object.entries(old.modeDefaults||{}).some(([k,v])=>next.modeDefaults?.[k]!==v))return false;
 return old.nodes.every((row,i)=>{
  const n=next.nodes[i];if(!n)return false;const left=Object.assign({},row),right=Object.assign({},n);
  if(!planApi.equal(left.resolvedVariableModes,right.resolvedVariableModes)){
   if(!left.resolvedVariableModes||!right.resolvedVariableModes||Object.entries(left.resolvedVariableModes).some(([k,v])=>right.resolvedVariableModes[k]!==v)||Object.entries(right.resolvedVariableModes).some(([k,v])=>!Object.hasOwn(left.resolvedVariableModes,k)&&next.modeDefaults?.[k]!==v))return false;
   right.resolvedVariableModes=left.resolvedVariableModes;
  }return planApi.equal(left,right);
 });
}
function createNativeExecutor({api,hash,guard,capture,root}){
 const recipes=forApi(api),read=fn=>cooperativeRead(fn,1000,guard);
 const select=(parent,path)=>path.reduce((node,segment)=>{const children=Array.from(node.children||[]),matches=children.filter(n=>n.type===segment.type&&n.name===segment.name);if(matches.length!==1)fail('LANDING_NATIVE_API_BINDING_REQUIRED',{selector:path,reason:'Expected one typed public destination',matches:matches.length,available:children.slice(0,16).map(n=>({type:n.type,name:n.name.slice(0,200)})),truncated:children.length>16});return matches[0];},parent);
 async function publicComponent(node,props){
  let component=node.type==='INSTANCE'?await read(()=>node.getMainComponentAsync()):node;
  if(!component)fail('LANDING_NATIVE_API_BINDING_REQUIRED',{reason:'Main component unavailable'});
  const owner=component.type==='COMPONENT_SET'?component:component.parent?.type==='COMPONENT_SET'?component.parent:component,definitions=owner.componentPropertyDefinitions||{},bound=planApi.bindProps(props,definitions,true);
  if(!bound)fail('LANDING_NATIVE_API_BINDING_REQUIRED',{requested:props,definitions:Object.entries(definitions).slice(0,64).map(([name,p])=>({name,type:p.type,variantOptions:p.variantOptions||null}))});
  if(owner.type==='COMPONENT_SET'){
   const selected=Object.entries(bound).filter(([name])=>definitions[name].type==='VARIANT'),variants=Array.from(owner.children).filter(c=>c.type==='COMPONENT'&&selected.every(([name,value])=>c.variantProperties?.[name]===value));
   if(selected.length&&variants.length!==1)fail('LANDING_NATIVE_API_BINDING_REQUIRED',{requested:props,reason:'Variant selection is ambiguous',matches:variants.length});
   component=selected.length?variants[0]:component.type==='COMPONENT_SET'?component.defaultVariant:component;
  }
  if(component?.type!=='COMPONENT')fail('LANDING_NATIVE_API_BINDING_REQUIRED',{reason:'Expected a published variant'});
  return {component,bound};
 }
 async function loadFonts(component){
  const fonts=new Map();
  for(const n of component.findAllWithCriteria({types:['TEXT']}))for(const segment of n.getStyledTextSegments(['fontName'])){
   fonts.set(JSON.stringify(segment.fontName),segment.fontName);
   const bindings=n.boundVariables?.fontFamily||[];
   for(const alias of Array.isArray(bindings)?bindings:[bindings]){
    const v=await read(()=>api.variables.getVariableByIdAsync(alias.id));if(!v)fail('LANDING_NATIVE_FONT_UNKNOWN');
    for(const family of Object.values(v.valuesByMode)){if(typeof family!=='string')fail('LANDING_NATIVE_FONT_UNKNOWN');const font={family,style:segment.fontName.style};fonts.set(JSON.stringify(font),font);}
   }
  }
  if(fonts.size>32)fail('LANDING_NATIVE_FONT_UNKNOWN');for(const font of fonts.values())await read(()=>api.loadFontAsync(font));
 }
 async function sourceApi(imports){
  const rows=[],pending=Array.from(imports.values(),value=>({node:value.type==='COMPONENT_SET'?value.defaultVariant:value,path:[],key:value.key}));let truncated=false;
  while(pending.length&&rows.length<32){
   const item=pending.shift(),n=item.node,main=n.type==='INSTANCE'?await read(()=>n.getMainComponentAsync()):n,owner=main?.parent?.type==='COMPONENT_SET'?main.parent:main;
   const row={key:item.key,path:item.path,type:n.type,name:n.name};if(['INSTANCE','COMPONENT'].includes(n.type))row.definitions=Object.entries(owner?.componentPropertyDefinitions||{}).slice(0,24).map(([name,p])=>({name,type:p.type,variantOptions:p.variantOptions?.slice(0,12)||null}));
   rows.push(row);if(n.type==='SLOT'||item.path.length>=8)continue;
   for(const child of n.children||[])if(['FRAME','INSTANCE','SLOT'].includes(child.type))pending.push({node:child,path:item.path.concat({type:child.type,name:child.name}),key:item.key});
  }
  const bytes=v=>encodeURIComponent(JSON.stringify(v)).replace(/%[0-9A-F]{2}/g,'x').length;truncated=pending.length>0;while(rows.length&&bytes(rows)>7000){rows.pop();truncated=true;}return {scope:'bounded-source-api-navigation',rows,truncated};
 }
 async function execute(request){
  const {plan,stage,sectionId}=request;planApi.validate(plan,stage,request.decision);
  if(hash(plan)!==request.planHash)fail('LANDING_NATIVE_PLAN_STALE');
  const before=await capture();
  const ledgerKey='native-'+(sectionId||'foundation'),previous=data(root,ledgerKey);let ledger=null;
  try{ledger=previous?JSON.parse(previous):null;}catch{fail('LANDING_NATIVE_PLAN_STALE');}
  if(ledger?.operationId===request.operationId){
   if(ledger.planHash!==request.planHash)fail('LANDING_NATIVE_PLAN_STALE');
   if(ledger.complete){if(hash(pin(before))!==ledger.afterHash)fail('LANDING_STRUCTURE_CHANGED');return {operationId:request.operationId,bindings:ledger.bindings,readback:before,issue:null};}
  }
  if(hash(pin(before))!==request.beforeHash)fail('LANDING_NATIVE_PLAN_STALE');
  const nodes=all(root),mount=stage==='foundation'?root:nodes.find(n=>n.id===request.mountNodeId);
  if(!mount||stage==='structure'&&mount.type!=='SLOT'&&mount.type!=='FRAME')fail('LANDING_NATIVE_PLAN_STALE');
  const sources=new Map(),prepared=new Map(),variables=new Map(),collections=new Map(),imports=new Map();
  try{
   for(const n of plan.nodes){
    if(n.kind==='instance'){
     const address=n.importType+':'+n.key;if(!imports.has(address))imports.set(address,await read(()=>n.importType==='COMPONENT'?api.importComponentByKeyAsync(n.key):api.importComponentSetByKeyAsync(n.key)));const imported=imports.get(address);
     if(imported.type!==n.importType||imported.key!==n.key)fail('LANDING_NATIVE_API_BINDING_REQUIRED',{reason:'Published key/type mismatch',key:n.key});
     const selected=await publicComponent(imported,n.props);if(n.importType==='COMPONENT'&&selected.component.key!==n.key)fail('LANDING_NATIVE_API_BINDING_REQUIRED',{reason:'Use the component-set key or exact selected variant key',key:n.key});
     prepared.set(n.id,selected);sources.set(n.id,selected.component);
     await loadFonts(selected.component);
     for(const id of Object.keys(selected.component.resolvedVariableModes||{})){const c=await read(()=>api.variables.getVariableCollectionByIdAsync(id));if(c)collections.set(c.id,c);}
    }else if(['slot','configure'].includes(n.kind)){
     const source=select(sources.get(n.parent),n.selector);
     if(n.kind==='configure'){const selected=await publicComponent(source,n.props);prepared.set(n.id,selected);sources.set(n.id,selected.component);await loadFonts(selected.component);}
     else sources.set(n.id,source);
    }
   }
   for(const selected of prepared.values())for(const [name,value]of Object.entries(selected.bound)){
    const owner=selected.component.parent?.type==='COMPONENT_SET'?selected.component.parent:selected.component;
    if(owner.componentPropertyDefinitions[name]?.type==='INSTANCE_SWAP'){
     const swap=await read(()=>api.importComponentByKeyAsync(value));if(swap.type!=='COMPONENT'||swap.key!==value)fail('LANDING_NATIVE_API_BINDING_REQUIRED',{key:value,reason:'Instance swap requires an imported Component'});await loadFonts(swap);selected.bound[name]=swap.id;
    }
   }
   for(const key of planApi.keys(plan).filter(k=>plan.nodes.every(n=>n.key!==k)&&!plan.nodes.some(n=>Object.values(n.props||{}).includes(k)))){
    const v=await read(()=>api.variables.importVariableByKeyAsync(key));if(v.key!==key||v.resolvedType!=='FLOAT')fail('LANDING_NATIVE_API_BINDING_REQUIRED',{key,reason:'Expected a FLOAT variable with the selected key'});variables.set(key,v);const c=await read(()=>api.variables.getVariableCollectionByIdAsync(v.variableCollectionId));if(c)collections.set(c.id,c);
   }
   for(const settings of [plan.rootLayout,...plan.nodes.map(n=>n.layout||{})])for(const m of settings.modes||[]){
    const matches=Array.from(collections.values()).filter(c=>c.name===m.collection&&c.modes.filter(v=>v.name===m.mode).length===1);
    if(matches.length!==1)fail('LANDING_NATIVE_API_BINDING_REQUIRED',{mode:m,available:Array.from(collections.values()).slice(0,32).map(c=>({name:c.name,modes:c.modes.map(v=>v.name)}))});
   }
  }catch(error){
   if(error.code!=='LANDING_NATIVE_API_BINDING_REQUIRED')throw error;
   const diagnostic=Object.assign({},error.diagnostic,{sourceApi:await sourceApi(imports)}),bytes=v=>encodeURIComponent(JSON.stringify(v)).replace(/%[0-9A-F]{2}/g,'x').length;
   while(diagnostic.definitions?.length&&bytes(diagnostic)>12000)diagnostic.definitions.pop();if(bytes(diagnostic)>12000){delete diagnostic.requested;diagnostic.truncated=true;}
   const readback=await capture();if(!unchanged(before,readback))fail('LANDING_PREPARATION_CANVAS_CHANGED');
   return {operationId:request.operationId,bindings:[],readback,issue:{code:error.code,diagnostic}};
  }
  const fresh=await capture();if(!unchanged(before,fresh))fail('LANDING_PREPARATION_CANVAS_CHANGED');
  guard();const mapped=new Map(),bindings=[],created=[],mutated=[];
  const apply=(node,settings)=>{
   guard();const fields=settings.fields||{};
   if(Object.hasOwn(fields,'width')||Object.hasOwn(fields,'height'))node.resize(fields.width??node.width,fields.height??node.height);
   for(const [name,value]of Object.entries(fields))if(!['width','height'].includes(name))node[name]=value;
   for(const [field,key]of Object.entries(settings.bindings||{}))node.setBoundVariable(field,variables.get(key));
   for(const m of settings.modes||[]){const c=Array.from(collections.values()).find(c=>c.name===m.collection&&c.modes.some(v=>v.name===m.mode));node.setExplicitVariableModeForCollection(c,c.modes.find(v=>v.name===m.mode).modeId);}
  };
  const tagged=sectionId?nodes.filter(n=>data(n,'section')===sectionId):nodes.filter(n=>data(n,'native-unit')==='foundation'&&data(n,'native-key')===plan.rootId),partial=sectionId?nodes.filter(n=>n.parent===mount&&!data(n,'section')&&data(n,'native-unit')===sectionId&&data(n,'native-key')===plan.rootId&&data(n,'native-plan')===request.planHash):[];
  if(tagged.length>1||partial.length>1||tagged.length&&partial.length&&!request.expectedSection)fail('LANDING_NATIVE_PLAN_STALE');
  if(request.expectedSection&&(!before.sections.some(s=>s.id===request.expectedSection.id&&s.fingerprint===request.expectedSection.fingerprint)))fail('LANDING_STRUCTURE_CHANGED');
  const existingRoot=partial[0]||tagged[0],rootSpec=plan.nodes.find(n=>n.id===plan.rootId);
  let replace=existingRoot&&((rootSpec.kind==='layout')!==(existingRoot.type==='FRAME')||data(existingRoot,'native-plan')!==request.planHash);
  if(existingRoot&&rootSpec.kind==='instance'){
   const c=await read(()=>existingRoot.getMainComponentAsync());replace=replace||c?.key!==rootSpec.key&&c?.parent?.key!==rootSpec.key;
  }
  if(replace&&!request.expectedSection)fail('LANDING_STRUCTURE_CHANGED');
  const oldRoot=partial.length&&tagged.length?tagged[0]:replace?existingRoot:null,kept=replace?[]:existingRoot?all(existingRoot):[];
  root.setSharedPluginData(NS,ledgerKey,JSON.stringify({operationId:request.operationId,planHash:request.planHash,complete:false}));
  apply(root,plan.rootLayout);
  for(const n of plan.nodes){
   guard();const parent=mapped.get(n.parent)||mount;let node;
   if(['slot','configure'].includes(n.kind))node=select(parent,n.selector);
   else{
    const matches=kept.filter(v=>data(v,'native-key')===n.id);if(matches.length>1)fail('LANDING_NATIVE_PLAN_STALE');node=matches[0];
    if(node&&node.type!==(n.kind==='layout'?'FRAME':'INSTANCE'))fail('LANDING_NATIVE_PLAN_STALE');
    if(!node){
     if(n.kind==='layout'){node=api.createFrame();created.push(node.id);guard();node.fills=[];node.clipsContent=false;parent.appendChild(node);}
     else{const source=prepared.get(n.id).component;node=await recipes.createMcpInstance(source,source.key,parent,created,mutated,guard);}
    }else if(node.parent!==parent){guard();parent.appendChild(node);}
   }
   guard();node.setSharedPluginData(NS,'native-key',n.id);node.setSharedPluginData(NS,'native-unit',sectionId||'foundation');
   if(n.id===plan.rootId)node.setSharedPluginData(NS,'native-plan',request.planHash);
   if(n.role)node.setSharedPluginData(NS,'role',n.role);if(n.name!==undefined)node.name=n.name;
   if(n.kind==='instance'||n.kind==='configure')node.setProperties(prepared.get(n.id).bound);
   apply(node,n.layout||{});mapped.set(n.id,node);bindings.push({id:n.id,nodeId:node.id});
   await new Promise(resolve=>setTimeout(resolve,0));guard();
  }
  const assembled=mapped.get(plan.rootId);
  if(sectionId){
   // The old verified skeleton is kept until the complete replacement is present.
   if(oldRoot){guard();oldRoot.remove();}
   assembled.setSharedPluginData(NS,'section',sectionId);
   const order=request.order||[],other=Array.from(mount.children).filter(n=>n!==assembled&&data(n,'section')),next=other.find(n=>order.indexOf(data(n,'section'))>order.indexOf(sectionId));
   if(next){guard();mount.insertChild(mount.children.indexOf(next),assembled);}
  }
  if(request.replacement&&!request.replacement.consumed){
   const binding=request.replacement,container=all(root).find(n=>n.id===binding.containerId);
   if(binding.mountId!==mount.id||!container||data(container,'role')!==request.containerRole)fail('LANDING_SLOT_REPLACEMENT_UNCONFIRMED');
   const source=await read(()=>container.getMainComponentAsync()),sourceSlot=all(source).filter(n=>n.type==='SLOT'&&n.name===mount.name);
   if(sourceSlot.length!==1)fail('LANDING_SLOT_REPLACEMENT_UNCONFIRMED');
   const actual=Array.from(mount.children).filter(n=>n!==assembled),original=Array.from(sourceSlot[0].children);
   if(actual.length!==original.length||actual.some(n=>!binding.nodes.some(v=>v.id===n.id)))fail('LANDING_SLOT_REPLACEMENT_UNCONFIRMED');
   for(let i=0;i<actual.length;i++){
    const proof=await recipes.compareMcpDefaults(original[i],actual[i]);guard();
    if(!proof.equal)fail('LANDING_SLOT_REPLACEMENT_UNCONFIRMED',{proof});
   }
   guard();for(const n of actual)n.remove();
  }
  for(const row of request.removeSections||[]){
   if((request.order||[]).includes(row.sectionId)||!before.sections.some(s=>s.id===row.id&&s.sectionId===row.sectionId&&s.fingerprint===row.fingerprint))fail('LANDING_STRUCTURE_CHANGED');
   const node=all(root).find(n=>n.id===row.id);if(!node||data(node,'section')!==row.sectionId||data(node,'native-unit')!==row.sectionId)fail('LANDING_STRUCTURE_CHANGED');guard();node.remove();
  }
  guard();const readback=await capture();root.setSharedPluginData(NS,ledgerKey,JSON.stringify({operationId:request.operationId,planHash:request.planHash,complete:true,bindings,afterHash:hash(pin(readback))}));
  return {operationId:request.operationId,bindings,readback,issue:null};
 }
 return {execute};
}
module.exports={createNativeExecutor,pin,unchanged};
