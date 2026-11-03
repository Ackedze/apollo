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
 function collect(roots){
  const nodes=[],handles=new Map(),excluded=[];
  function walk(n){if(handles.has(n.id))return;if(handles.size>=p.MAX_NODES)fail('AUDIT_SCOPE_BUDGET');if(n.removed)fail('AUDIT_STALE');handles.set(n.id,n);const row=inventory(n);nodes.push(row);if(n.visible===false){excluded.push({id:n.id,reason:'hidden subtree'});return;}if('children'in n)for(const c of n.children)walk(c);}
  for(const n of roots)walk(n);return bounded({nodes,handles,excluded});
 }
 function assertScope(){
  if(!session||session.pageId!==api.currentPage.id||session.roots.some(n=>n.removed))fail('AUDIT_STALE');
  const now=collect(session.roots);if(hash(now.nodes)!==session.inventoryHash)fail('AUDIT_STALE');
 }
 async function facts(n){
  if(n.removed)fail('AUDIT_STALE');const out=inventory(n),unavailable=[];
  for(const key of ['x','y','width','height','absoluteBoundingBox','layoutMode','layoutSizingHorizontal','layoutSizingVertical','primaryAxisSizingMode','counterAxisSizingMode','primaryAxisAlignItems','counterAxisAlignItems','layoutAlign','layoutGrow','itemSpacing','counterAxisSpacing','paddingLeft','paddingRight','paddingTop','paddingBottom','minWidth','maxWidth','minHeight','maxHeight','fills','strokes','strokeWeight','effects','opacity','cornerRadius','fillStyleId','strokeStyleId','effectStyleId','boundVariables','resolvedVariableModes','explicitVariableModes','componentProperties','componentPropertyReferences','overrides','characters','fontName','fontSize','fontWeight','lineHeight','letterSpacing','textStyleId','textAutoResize','textAlignHorizontal','textAlignVertical']){
   try{if(key in n)out[key]=serial(n[key]);}catch{unavailable.push(key);}
  }
  if(n.type==='TEXT'&&typeof n.getStyledTextSegments==='function'){
   try{out.textSegments=serial(n.getStyledTextSegments(['fontName','fontSize','fontWeight','fills','textStyleId','lineHeight','letterSpacing','boundVariables']));}catch{unavailable.push('textSegments');}
  }
  if(n.type==='INSTANCE'){
   try{const main=await n.getMainComponentAsync();out.main=main?{id:main.id,key:main.key,name:main.name,set:main.parent?.type==='COMPONENT_SET'?{id:main.parent.id,key:main.parent.key,name:main.parent.name}:null}:null;if(main)session.sources.set(main.id,main);}catch{unavailable.push('main');}
  }
  if(['COMPONENT','COMPONENT_SET'].includes(n.type))for(const k of ['key','componentPropertyDefinitions','variantProperties'])if(k in n)out[k]=serial(n[k]);
  const aliases=new Set();function scan(v){if(!v||typeof v!=='object')return;if(v.type==='VARIABLE_ALIAS'&&typeof v.id==='string')aliases.add(v.id);else for(const c of Object.values(v))scan(c);}scan(out);
  out.variables=[];
  for(const id of aliases){try{const v=await api.variables.getVariableByIdAsync(id);if(!v){out.variables.push({id,unavailable:'NOT_FOUND'});continue;}const c=await api.variables.getVariableCollectionByIdAsync(v.variableCollectionId);const resolved=v.resolveForConsumer(n);out.variables.push({id,key:v.key,name:v.name,resolvedType:v.resolvedType,collection:c?{id:c.id,key:c.key,name:c.name,defaultModeId:c.defaultModeId,modes:c.modes}:null,resolved:serial(resolved)});}catch{out.variables.push({id,unavailable:'READ_FAILED'});}}
  out.styles=[];const styles=new Set();function styleScan(v){if(!v||typeof v!=='object')return;for(const [k,val]of Object.entries(v)){if(/StyleId$/.test(k)&&typeof val==='string'&&val)styles.add(val);else if(val&&typeof val==='object')styleScan(val);}}styleScan(out);
  for(const id of styles){try{const s=await api.getStyleByIdAsync(id);out.styles.push(s?{id:s.id,key:s.key,name:s.name,type:s.type,remote:s.remote}:{id,unavailable:'NOT_FOUND'});}catch{out.styles.push({id,unavailable:'READ_FAILED'});}}
  out.unavailable=unavailable;return bounded(out);
 }
 async function read(ids){assertScope();if(!p.list(ids,p.MAX_READ)||!ids.length||!p.unique(ids))fail('AUDIT_READ_INVALID');const rows=[];for(const id of ids){const n=session.handles.get(id)||session.sources.get(id);if(!n)fail('AUDIT_SCOPE_ESCAPE');const row=await facts(n);rows.push(row);session.used.set(id,hash(row));}return bounded({nodes:rows});}
 async function source(id){assertScope();const n=session.sources.get(id);if(!n)fail('AUDIT_SOURCE_NOT_OBSERVED');const tree=collect([n]);for(const [key,node]of tree.handles)session.sources.set(key,node);const row=await facts(n);session.used.set(n.id,hash(row));return bounded({nodes:tree.nodes,root:row,excluded:tree.excluded});}
 async function verify(){assertScope();for(const [id,digest]of session.used){const n=session.handles.get(id)||session.sources.get(id);if(!n||hash(await facts(n))!==digest)fail('AUDIT_STALE');}assertScope();return {current:true,checked:session.used.size,snapshotId:session.snapshotId};}
 async function capture(){
  if(isBusy())fail('AUDIT_BUSY');const selected=Array.from(api.currentPage.selection||[]);if(!selected.length||selected.length>100||selected.some(n=>['DOCUMENT','PAGE'].includes(n.type)))fail('AUDIT_SELECTION_REQUIRED');
  const selectedIds=new Set(selected.map(n=>n.id)),roots=selected.filter(n=>{for(let a=n.parent;a;a=a.parent)if(selectedIds.has(a.id))return false;return true;});
  const tree=collect(roots),snapshotId='audit-'+Date.now()+'-'+(++sequence);session={snapshotId,pageId:api.currentPage.id,roots,handles:tree.handles,sources:new Map(),used:new Map(),inventoryHash:hash(tree.nodes)};
  return bounded({version:p.VERSION,snapshotId,pageId:session.pageId,rootIds:roots.map(n=>n.id),nodes:tree.nodes,excluded:tree.excluded,limitations:['Hidden subtrees excluded','Only observed properties; no interaction or alternate viewport simulation',api.skipInvisibleInstanceChildren?'Invisible instance children unavailable':''] .filter(Boolean)});
 }
 async function execute(message){
  if(message.operation==='capture')return capture();
  if(!session||message.snapshotId!==session.snapshotId)fail('AUDIT_STALE');
  if(message.operation==='read')return read(message.nodeIds);
  if(message.operation==='source')return source(message.nodeId);
  if(message.operation==='verify')return verify();
  if(message.operation==='focus'){await verify();const n=session.handles.get(message.nodeId);if(!n)fail('AUDIT_SCOPE_ESCAPE');api.currentPage.selection=[n];api.viewport.scrollAndZoomIntoView([n]);return {focused:true};}
  fail('AUDIT_OPERATION_FORBIDDEN');
 }
 return {busy:()=>working,execute,accept(message){if(message?.type!=='figma-audit-native')return false;if(working){post({type:'figma-audit-native-result',callId:message.callId,success:false,code:'AUDIT_BUSY'});return true;}working=true;Promise.resolve().then(()=>execute(message)).then(result=>post({type:'figma-audit-native-result',callId:message.callId,success:true,result}),error=>post({type:'figma-audit-native-result',callId:message.callId,success:false,code:error.code||'AUDIT_READ_FAILED'})).finally(()=>{working=false;});return true;}};
}
module.exports={createFigmaAuditBridge,serial};
