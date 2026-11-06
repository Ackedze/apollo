'use strict';
// Technical composition only. Component choices, values and keys come from read Hub sources.
const VERSION='native-layout-v1',SCHEMA='apollo.native-skeleton.v1';
const key=v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
const id=v=>typeof v==='string'&&/^[a-zA-Z][\w-]{0,79}$/.test(v);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const equal=(a,b)=>stable(a)===stable(b);
function stable(v){return Array.isArray(v)?'['+v.map(stable).join(',')+']':object(v)?'{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v)??'null';}
function fail(field,expected='valid native plan for the declared stage',value){const received=value===undefined?'missing':value!==null&&typeof value==='object'?'object keys: '+Object.keys(value).join(',').slice(0,180):(typeof value+': '+JSON.stringify(value)).slice(0,180);throw Object.assign(Error('LANDING_NATIVE_PLAN_INVALID'),{code:'LANDING_NATIVE_PLAN_INVALID',status:409,diagnostic:{field:field.slice(0,700),expected:expected.slice(0,300),received}});}
const fields={layoutMode:['VERTICAL','HORIZONTAL'],layoutSizingHorizontal:['FILL','HUG','FIXED'],layoutSizingVertical:['FILL','HUG','FIXED'],primaryAxisSizingMode:['AUTO','FIXED'],counterAxisSizingMode:['AUTO','FIXED'],primaryAxisAlignItems:['MIN','MAX','CENTER','SPACE_BETWEEN'],counterAxisAlignItems:['MIN','MAX','CENTER','BASELINE'],layoutWrap:['WRAP','NO_WRAP'],clipsContent:[true,false],width:'number',height:'number',minWidth:'number',maxWidth:'number',minHeight:'number',maxHeight:'number',itemSpacing:'number',counterAxisSpacing:'number',paddingTop:'number',paddingBottom:'number',paddingLeft:'number',paddingRight:'number'};
const sizeFields=new Set(['width','height','minWidth','maxWidth','minHeight','maxHeight','layoutSizingHorizontal','layoutSizingVertical']);
function settings(v,path,library=false){
 if(!object(v))fail(path,'settings object with fields, bindings and modes',v);
 const extra=Object.keys(v).find(k=>!['fields','bindings','modes'].includes(k));if(extra!==undefined)fail(path+'.'+extra,'only fields, bindings and modes; put layout properties inside '+path+'.fields',v[extra]);
 for(const [name,value]of Object.entries(v.fields||{})){
  const rule=fields[name];if(!rule||library&&!sizeFields.has(name)||(Array.isArray(rule)?!rule.includes(value):typeof value!=='number'||!Number.isFinite(value)||value<0||value>100000))fail(path+'.fields.'+name,library&&!sizeFields.has(name)?'only sizing fields on a library instance':Array.isArray(rule)?'one of: '+rule.join(', '):rule==='number'?'finite number between 0 and 100000':'declared native layout field',value);
 }
 if(!object(v.fields||{})||!object(v.bindings||{})||Object.entries(v.bindings||{}).some(([name,value])=>fields[name]!=='number'||library&&!sizeFields.has(name)||!key(value)))fail(path+'.bindings');
 if(!Array.isArray(v.modes||[])||(v.modes||[]).length>32||(v.modes||[]).some(m=>!object(m)||Object.keys(m).sort().join(',')!=='collection,mode'||typeof m.collection!=='string'||!m.collection||m.collection.length>400||typeof m.mode!=='string'||!m.mode||m.mode.length>128)||new Set((v.modes||[]).map(m=>m.collection)).size!==(v.modes||[]).length)fail(path+'.modes');
 return v;
}
function validate(plan,stage,decision){
 if(!object(plan)||Object.keys(plan).sort().join(',')!=='mountId,nodes,rootId,rootLayout,schemaVersion'||plan.schemaVersion!==SCHEMA||!id(plan.rootId)||plan.mountId!==null&&!id(plan.mountId)||!Array.isArray(plan.nodes)||!plan.nodes.length||plan.nodes.length>64)fail('nativePlan');
 settings(plan.rootLayout,'rootLayout');if(stage!=='foundation'&&Object.keys(plan.rootLayout).length)fail('rootLayout');
 const seen=new Map();
 for(const [index,n] of plan.nodes.entries()){
  if(!object(n)||Object.keys(n).some(k=>!['id','parent','kind','key','importType','selector','role','name','props','layout'].includes(k))||!id(n.id)||seen.has(n.id)||!['layout','instance','slot','configure'].includes(n.kind)||n.parent!==(stage==='foundation'?'$root':'$mount')&&!seen.has(n.parent))fail('nodes');
  if(n.parent===(stage==='foundation'?'$root':'$mount')&&n.id!==plan.rootId)fail('nodes.root');
  if(n.role!==undefined&&(typeof n.role!=='string'||!/^[a-z][a-z0-9-]{0,39}$/.test(n.role)))fail('nodes.role');
  if(n.name!==undefined&&(typeof n.name!=='string'||n.name.length>400))fail('nodes.name');
  if(!object(n.props||{})||Object.entries(n.props||{}).some(([k,v])=>!k||k.length>400||['__proto__','constructor','prototype'].includes(k)||!['string','boolean'].includes(typeof v)||typeof v==='string'&&v.length>512))fail('nodes.props');
  if(n.kind==='instance'){if(!key(n.key)||!['COMPONENT','COMPONENT_SET'].includes(n.importType)||n.selector?.length)fail('nodes.import');}
  else if(n.key!==undefined&&n.key!==null||n.importType!==undefined&&n.importType!==null)fail('nodes.key');
  if(['slot','configure'].includes(n.kind)){
   if(n.name!==undefined)fail('nodes['+index+'].name','absent for kind='+n.kind+'; select the existing name only through selector',n.name);
   if(!Array.isArray(n.selector)||!n.selector.length||n.selector.length>12||n.selector.some(s=>!object(s)||Object.keys(s).sort().join(',')!=='name,type'||!['FRAME','SLOT','INSTANCE'].includes(s.type)||typeof s.name!=='string'||!s.name||s.name.length>400)||n.selector.at(-1).type!==(n.kind==='slot'?'SLOT':'INSTANCE')||n.name!==undefined||n.kind==='slot'&&Object.keys(n.props||{}).length)fail('nodes['+index+'].selector','nonempty unique direct-child path of {type,name}, ending in '+(n.kind==='slot'?'SLOT':'INSTANCE')+'; slot props must be empty',n.selector);
  }else if(n.selector?.length)fail('nodes.selector');
  settings(n.layout||{},'nodes.layout',n.kind!=='layout');
  if(n.kind==='slot'&&Object.keys(n.layout||{}).length)fail('nodes.slot.layout');
  if(n.kind==='layout'&&!['VERTICAL','HORIZONTAL'].includes(n.layout?.fields?.layoutMode))fail('nodes.layout.layoutMode');
  const parent=seen.get(n.parent);if(parent&&['instance','configure'].includes(parent.kind)&&!['slot','configure'].includes(n.kind)||['slot','configure'].includes(n.kind)&&!['instance','configure'].includes(parent?.kind))fail('nodes.public-slot-required');
  seen.set(n.id,n);
 }
 const root=seen.get(plan.rootId);if(!root||!['layout','instance'].includes(root.kind)||root.parent!==(stage==='foundation'?'$root':'$mount'))fail('rootId');
 if(stage==='foundation'){
  const mount=seen.get(plan.mountId),type=n=>n?.kind==='layout'?'FRAME':n?.kind==='slot'?'SLOT':'INSTANCE';
  if(!mount||root.role!==decision.container.role||mount.role!==decision.mount.role||type(root)!==decision.container.type||(root.key||null)!==decision.container.componentKey||type(mount)!==decision.mount.type||mount.key&&mount.key!==decision.mount.componentKey)fail('foundation');
 }else if(plan.mountId!==null||decision.root.type!==(root.kind==='instance'?'INSTANCE':'FRAME')||decision.root.componentKey!==(root.key||null)||!equal(root.props||{},decision.props))fail('structure');
 return plan;
}
function keys(plan){return [...new Set(plan.nodes.flatMap(n=>[...(n.key?[n.key]:[]),...Object.values(n.props||{}).filter(key),...Object.values(n.layout?.bindings||{})]).concat(Object.values(plan.rootLayout.bindings||{})))];}
function bindProps(props,actual,definitions=false,swapKeys={}){
 const result={};
 for(const [name,value]of Object.entries(props||{})){
  const names=Object.hasOwn(actual,name)?[name]:Object.keys(actual).filter(k=>k.split('#')[0]===name),field=names.length===1?names[0]:null,p=actual[field];
  if(!field||!p||!['BOOLEAN','VARIANT','INSTANCE_SWAP'].includes(p.type)||Object.hasOwn(result,field))return null;
  let v=value;if(p.type==='VARIANT'&&typeof v==='boolean'){const choices=definitions?p.variantOptions:[p.value];const match=(choices||[]).filter(x=>typeof x==='string'&&x.toLowerCase()===String(v));if(match.length!==1)return null;v=match[0];}
  if(p.type==='BOOLEAN'&&typeof v!=='boolean'||p.type==='VARIANT'&&(typeof v!=='string'||definitions&&!p.variantOptions?.includes(v))||p.type==='INSTANCE_SWAP'&&!key(v))return null;
  if(!definitions&&(p.type==='INSTANCE_SWAP'?swapKeys[field]!==v:!equal(v,p.value)))return null;result[field]=v;
 }
 return result;
}
function confirm(plan,bindings,readback,stage,mountNodeId=null){
 if(!Array.isArray(bindings)||bindings.length!==plan.nodes.length||new Set(bindings.map(b=>b?.id)).size!==bindings.length)fail('bindings');
 const byId=new Map(readback.native.nodes.map(n=>[n.id,n])),mapped=new Map(bindings.map(b=>[b.id,byId.get(b.nodeId)]));
 const confirmSettings=(node,settings)=>{
  for(const [field,value]of Object.entries(settings.fields||{}))if(!equal(node[field],value))fail('bindings.layout.'+field);
  for(const [field,key]of Object.entries(settings.bindings||{})){const alias=node.boundVariables?.[field],variable=readback.native.variables?.[alias?.id];if(variable?.key!==key)fail('bindings.variable');}
  for(const mode of settings.modes||[]){const entries=Object.entries(readback.native.collections||{}).filter(([,c])=>c.name===mode.collection&&c.modes.some(m=>m.name===mode.mode&&m.modeId===node.explicitVariableModes?.[c.id]));if(entries.length!==1)fail('bindings.mode');}
 };
 confirmSettings(byId.get(readback.rootNodeId),plan.rootLayout);
 for(const n of plan.nodes){
  const node=mapped.get(n.id),parent=mapped.get(n.parent),kind=n.kind==='layout'?'FRAME':n.kind==='slot'?'SLOT':'INSTANCE';
  if(!node||node.type!==kind||node.nativeKey!==n.id||n.role&&node.role!==n.role||n.key&&node.componentKey!==n.key&&node.componentSetKey!==n.key||!bindProps(n.props,node.componentProperties||{},false,node.componentSwapKeys))fail('bindings.'+n.id);
  if(parent){let current=node;const seen=new Set();while(current&&current.id!==parent.id&&!seen.has(current.id)){seen.add(current.id);current=byId.get(current.parentId);}if(!current||!['slot','configure'].includes(n.kind)&&node.parentId!==parent.id)fail('bindings.parent');}
  else if(n.id!==plan.rootId||node.parentId!==(stage==='foundation'?readback.rootNodeId:mountNodeId))fail('bindings.parent');
  if(['slot','configure'].includes(n.kind)){
   let selected=parent;for(const segment of n.selector){const matches=readback.native.nodes.filter(v=>v.parentId===selected.id&&v.type===segment.type&&v.name===segment.name);if(matches.length!==1)fail('bindings.selector');selected=matches[0];}if(selected.id!==node.id)fail('bindings.selector');
  }
  confirmSettings(node,n.layout||{});
 }
 return bindings;
}
module.exports={VERSION,SCHEMA,fields,sizeFields,stable,equal,validate,keys,bindProps,confirm};
