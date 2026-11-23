'use strict';
const p=require('./protocol');
const fail=code=>{throw Object.assign(Error(code),{code});};
function serial(value,depth=0){
 if(typeof value==='symbol')return {unavailable:'MIXED'};
 if(value===undefined)return {unavailable:'UNDEFINED'};
 if(depth>18)fail('AUDIT_FACT_DEPTH');
 if(Array.isArray(value))return value.map(v=>serial(v,depth+1));
 if(value&&typeof value==='object'){const out={};for(const key of Object.keys(value))out[key]=serial(value[key],depth+1);return out;}
 return value;
}
function bounded(value){if(p.byteLength(JSON.stringify(value))>p.MAX_BYTES)fail('AUDIT_READ_BUDGET');return value;}
function createFigmaAuditBridge({api,hash,post,isBusy=()=>false}){
 let session=null,sequence=0,working=false;
 const inventory=node=>({id:node.id,parentId:node.parent?.id||null,name:node.name,type:node.type,visible:node.visible!==false,children:'children'in node?node.children.map(n=>n.id):[]});
 const parentRow=(node,ids)=>({id:node.id,name:node.name,type:node.type,visible:node.visible!==false,scope:'parent-context',forRootIds:ids.slice(),children:ids.slice()});
 function onCurrentPage(node){for(let n=node,depth=0;n;n=n.parent){if(++depth>100||n.removed)return false;if(n.type==='PAGE')return n.id===api.currentPage.id;}return false;}
 function collect(roots){
  const nodes=[],handles=new Map(),excluded=[];
  function walk(n){if(handles.has(n.id))return;if(handles.size>=p.MAX_NODES)fail('AUDIT_SCOPE_BUDGET');if(n.removed)fail('AUDIT_STALE');handles.set(n.id,n);const row=inventory(n);nodes.push(row);if(n.visible===false){excluded.push({id:n.id,reason:'hidden subtree'});return;}if('children'in n)for(const c of n.children)walk(c);}
  for(const n of roots)walk(n);return bounded({nodes,handles,excluded});
 }
 function assertScope(){
  if(!session||session.pageId!==api.currentPage.id||session.roots.some(n=>!onCurrentPage(n)))fail('AUDIT_STALE');
  const now=collect(session.roots);if(hash(now.nodes)!==session.inventoryHash)fail('AUDIT_STALE');
 }
 async function usageContext(node){
  const seen=new Set([node.id]);
  try{for(let n=node.parent,visited=0;n;n=n.parent){
   if(++visited%32===0)await new Promise(resolve=>setTimeout(resolve,0));
   if(n.removed||seen.has(n.id))return {state:'unknown',reason:'unavailable-or-cycle'};seen.add(n.id);
   if(n.type==='PAGE')return n.id===session.pageId?{state:'standalone',pageId:n.id,owner:null}:{state:'unknown',reason:'foreign-page'};
   if(['INSTANCE','COMPONENT'].includes(n.type))return {state:'nested',owner:{id:n.id,type:n.type}};
  }}catch{return {state:'unknown',reason:'ancestry-unavailable'};}
  return {state:'unknown',reason:'ancestry-incomplete'};
 }
 async function facts(n){
  if(n.removed)fail('AUDIT_STALE');const context=session.parents.has(n.id)&&!session.handles.has(n.id)&&!session.sourceInventory.has(n.id),out=context?parentRow(n,session.parentRoots.get(n.id)):inventory(n),unavailable=[];
  const fields=['x','y','width','height','absoluteBoundingBox','layoutMode','layoutSizingHorizontal','layoutSizingVertical','primaryAxisSizingMode','counterAxisSizingMode','primaryAxisAlignItems','counterAxisAlignItems','layoutAlign','layoutGrow','itemSpacing','counterAxisSpacing','paddingLeft','paddingRight','paddingTop','paddingBottom','minWidth','maxWidth','minHeight','maxHeight','fills','strokes','strokeWeight','effects','opacity','cornerRadius','fillStyleId','strokeStyleId','effectStyleId','boundVariables','resolvedVariableModes','explicitVariableModes'];
  if(context)fields.push('key');else fields.push('componentProperties','componentPropertyReferences','overrides','characters','fontName','fontSize','fontWeight','lineHeight','letterSpacing','textStyleId','textAutoResize','textAlignHorizontal','textAlignVertical');
  for(const key of fields){
   try{if(key in n)out[key]=serial(n[key]);}catch{unavailable.push(key);}
  }
  if(!context&&n.type==='TEXT'&&typeof n.getStyledTextSegments==='function'){
   try{out.textSegments=serial(n.getStyledTextSegments(['fontName','fontSize','fontWeight','fills','textStyleId','lineHeight','letterSpacing','boundVariables']));}catch{unavailable.push('textSegments');}
  }
  if(!context&&n.type==='INSTANCE'&&session.handles.has(n.id))out.usageContext=await usageContext(n);
  if(n.type==='INSTANCE'){
   try{const main=await n.getMainComponentAsync();if(context)out.componentIdentity=main?{key:main.key,name:main.name,setKey:main.parent?.type==='COMPONENT_SET'?main.parent.key:null}:null;else{out.main=main?{id:main.id,key:main.key,name:main.name,set:main.parent?.type==='COMPONENT_SET'?{id:main.parent.id,key:main.parent.key,name:main.parent.name}:null}:null;if(main)session.sources.set(main.id,main);}}catch{unavailable.push('main');}
  }
  if(!context&&['COMPONENT','COMPONENT_SET'].includes(n.type))for(const k of ['key','componentPropertyDefinitions','variantProperties']){
   try{if(k in n){if(k==='componentPropertyDefinitions'&&n.type==='COMPONENT'&&n.parent?.type==='COMPONENT_SET'){unavailable.push(k);continue;}out[k]=serial(n[k]);}}catch{unavailable.push(k);}
  }
  const aliases=new Set();function scan(v){if(!v||typeof v!=='object')return;if(v.type==='VARIABLE_ALIAS'&&typeof v.id==='string')aliases.add(v.id);else for(const c of Object.values(v))scan(c);}scan(out);
  out.variables=[];
  for(const id of aliases){try{const v=await api.variables.getVariableByIdAsync(id);if(!v){out.variables.push({id,unavailable:'NOT_FOUND'});continue;}const c=await api.variables.getVariableCollectionByIdAsync(v.variableCollectionId);const resolved=v.resolveForConsumer(n);out.variables.push({id,key:v.key,name:v.name,resolvedType:v.resolvedType,collection:c?{id:c.id,key:c.key,name:c.name,defaultModeId:c.defaultModeId,modes:c.modes}:null,resolved:serial(resolved)});}catch{out.variables.push({id,unavailable:'READ_FAILED'});}}
  out.styles=[];const styles=new Set();function styleScan(v){if(!v||typeof v!=='object')return;for(const [k,val]of Object.entries(v)){if(/StyleId$/.test(k)&&typeof val==='string'&&val)styles.add(val);else if(val&&typeof val==='object')styleScan(val);}}styleScan(out);
  for(const id of styles){try{const s=await api.getStyleByIdAsync(id);out.styles.push(s?{id:s.id,key:s.key,name:s.name,type:s.type,remote:s.remote}:{id,unavailable:'NOT_FOUND'});}catch{out.styles.push({id,unavailable:'READ_FAILED'});}}
  out.unavailable=unavailable;return bounded(out);
 }
 async function read(ids){assertScope();if(!p.list(ids,p.MAX_READ)||!ids.length||!p.unique(ids))fail('AUDIT_READ_INVALID');const rows=[];for(const id of ids){const n=session.handles.get(id)||session.parents.get(id)||session.sources.get(id);if(!n)fail('AUDIT_SCOPE_ESCAPE');if(n.removed&&!session.used.has(id)){rows.push({id,availability:'UNAVAILABLE',unavailable:['node']});continue;}const row=await facts(n);rows.push(row);session.used.set(id,hash(row));}return bounded({nodes:rows});}
 async function source(id){assertScope();const n=session.sources.get(id);if(!n)fail('AUDIT_SOURCE_NOT_OBSERVED');if(n.removed&&!session.used.has(id))return {nodes:[],root:{id,availability:'UNAVAILABLE',unavailable:['node']},excluded:[]};const tree=collect([n]);for(const [key,node]of tree.handles){session.sources.set(key,node);session.sourceInventory.add(key);}const row=await facts(n);session.used.set(n.id,hash(row));return bounded({nodes:tree.nodes,root:row,excluded:tree.excluded});}
 async function compare(message){
  assertScope();const ids=message.nodeIds,targets=message.instanceIds,references=message.references;
  if(!p.list(ids)||!ids.length||!p.unique(ids)||!p.list(targets,100)||!targets.length||!p.unique(targets)||!Array.isArray(references)||p.byteLength(JSON.stringify(references))>p.MAX_BYTES)fail('AUDIT_COMPARISON_INVALID');
  if(ids.some(id=>!session.handles.has(id))||targets.some(id=>!ids.includes(id)||session.handles.get(id)?.type!=='INSTANCE'))fail('AUDIT_SCOPE_ESCAPE');
  const rows=[];
  for(const id of ids){const row=await facts(session.handles.get(id));rows.push(row);session.used.set(id,hash(row));}
  const result=await require('./customization').compareCustomizations({targets:targets.map(id=>session.handles.get(id)),references,observations:rows,scopeIds:ids,hash,assertCurrent:assertScope});
  for(const id of ids)if(hash(await facts(session.handles.get(id)))!==session.used.get(id))fail('AUDIT_STALE');
  assertScope();return bounded({nodes:rows,customizationFacts:result});
 }
 async function verify(){assertScope();for(const [id,digest]of session.used){const n=session.handles.get(id)||session.parents.get(id)||session.sources.get(id);if(!n||hash(await facts(n))!==digest)fail('AUDIT_STALE');}assertScope();return {current:true,checked:session.used.size,snapshotId:session.snapshotId};}
 async function capture(){
  if(isBusy())fail('AUDIT_BUSY');const selected=Array.from(api.currentPage.selection||[]);if(!selected.length||selected.length>100||selected.some(n=>['DOCUMENT','PAGE'].includes(n.type)))fail('AUDIT_SELECTION_REQUIRED');
  const selectedIds=new Set(selected.map(n=>n.id)),roots=selected.filter(n=>{for(let a=n.parent;a;a=a.parent)if(selectedIds.has(a.id))return false;return true;});
  if(roots.some(n=>!onCurrentPage(n)))fail('AUDIT_STALE');const parents=new Map(),parentRoots=new Map();for(const root of roots){const n=root.parent;if(n&&!['PAGE','DOCUMENT'].includes(n.type)){parents.set(n.id,n);parentRoots.set(n.id,(parentRoots.get(n.id)||[]).concat(root.id));}}
  const tree=collect(roots),snapshotId='audit-'+Date.now()+'-'+(++sequence);session={snapshotId,pageId:api.currentPage.id,roots,handles:tree.handles,parents,parentRoots,sources:new Map(),sourceInventory:new Set(),used:new Map(),inventoryHash:hash(tree.nodes)};
  return bounded({version:p.VERSION,snapshotId,pageId:session.pageId,rootIds:roots.map(n=>n.id),nodes:tree.nodes,contextParents:Array.from(parents.values()).map(n=>parentRow(n,parentRoots.get(n.id))),excluded:tree.excluded,limitations:['Hidden subtrees excluded','Nearest parents are context only; no siblings, ancestors or audit-target grants','Only observed properties; no interaction or alternate viewport simulation',api.skipInvisibleInstanceChildren?'Invisible instance children unavailable':''] .filter(Boolean)});
 }
 async function execute(message){
  if(message.operation==='capture')return capture();
  if(!session||message.snapshotId!==session.snapshotId)fail('AUDIT_STALE');
  if(message.operation==='read')return read(message.nodeIds);
  if(message.operation==='source')return source(message.nodeId);
  if(message.operation==='compare')return compare(message);
  if(message.operation==='verify')return verify();
  if(message.operation==='focus'){await verify();const n=session.handles.get(message.nodeId);if(!n)fail('AUDIT_SCOPE_ESCAPE');api.currentPage.selection=[n];api.viewport.scrollAndZoomIntoView([n]);return {focused:true};}
  fail('AUDIT_OPERATION_FORBIDDEN');
 }
 return {busy:()=>working,execute,accept(message){if(message?.type!=='figma-audit-native')return false;if(working){post({type:'figma-audit-native-result',callId:message.callId,success:false,code:'AUDIT_BUSY'});return true;}working=true;Promise.resolve().then(()=>execute(message)).then(result=>post({type:'figma-audit-native-result',callId:message.callId,success:true,result}),error=>post({type:'figma-audit-native-result',callId:message.callId,success:false,code:error?.code||'AUDIT_READ_FAILED',diagnostic:{name:String(error?.name||'Error').slice(0,80),message:String(error?.message||error?.code||'Native read failed').slice(0,1000)}})).finally(()=>{working=false;});return true;}};
}
module.exports={createFigmaAuditBridge,serial};
