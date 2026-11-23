'use strict';
// Transport validation only. Design-system rules are supplied by DS AI HUB.
const VERSION='apollo.figma-audit.v3',CUSTOMIZATION_FACTS='component-customizations-v1';
const MAX_NODES=1000,MAX_BYTES=400000,MAX_READ=12;
const STATUSES=['PASS','FAIL','UNKNOWN','NOT_CHECKED','NOT_APPLICABLE'];
const string=(v,max=2048)=>typeof v==='string'&&v.length>0&&v.length<=max;
const list=(v,max=MAX_NODES)=>Array.isArray(v)&&v.length<=max;
const unique=v=>new Set(v).size===v.length;
function byteLength(text){let size=0;for(const c of text){const n=c.codePointAt(0);size+=n<128?1:n<2048?2:n<65536?3:4;}return size;}
function snapshotValid(v){
 if(!(v?.version===VERSION&&string(v.snapshotId,120)&&string(v.pageId,120)&&list(v.rootIds,100)&&v.rootIds.length>0&&unique(v.rootIds)&&v.rootIds.every(id=>string(id,120))&&list(v.nodes)&&v.nodes.length>0&&unique(v.nodes.map(n=>n.id))&&v.nodes.every(n=>string(n.id,120)&&string(n.name)&&string(n.type,64))&&v.rootIds.every(id=>v.nodes.some(n=>n.id===id))))return false;
 return list(v.contextParents,100)&&unique(v.contextParents.map(n=>n?.id))&&v.contextParents.every(n=>string(n?.id,120)&&string(n.name)&&string(n.type,64)&&!['PAGE','DOCUMENT'].includes(n.type)&&n.scope==='parent-context'&&!v.nodes.some(row=>row.id===n.id)&&list(n.forRootIds,100)&&n.forRootIds.length>0&&unique(n.forRootIds)&&n.forRootIds.every(id=>v.rootIds.includes(id)&&v.nodes.some(root=>root.id===id&&root.parentId===n.id))&&list(n.children,100)&&n.children.length===n.forRootIds.length&&n.forRootIds.every(id=>n.children.includes(id)));
}
function coverage(checks){const counts=Object.fromEntries(STATUSES.map(s=>[s,0]));for(const c of checks)counts[c.status]++;const applicable=checks.length-counts.NOT_APPLICABLE,decisive=counts.PASS+counts.FAIL;return {counts,applicable,decisive,percent:applicable?Math.round(1000*decisive/applicable)/10:null,basis:'declared-rule-targets; not all Hub knowledge'};}
function reportValid(report,snapshot){return report?.version===VERSION&&report.snapshotId===snapshot.snapshotId&&list(report.checks,2000)&&report.checks.every(c=>STATUSES.includes(c.status)&&string(c.id,120)&&string(c.sourceId)&&list(c.targets)&&c.targets.length>0&&c.targets.every(id=>snapshot.nodes.some(n=>n.id===id)))&&unique(report.checks.map(c=>c.id));}
function comparisonValue(node,field,kind){
 if(!node||node.availability==='UNAVAILABLE'||node.unavailable?.includes(field))return undefined;
 const native=kind==='native',key=value=>typeof value==='string'?value.replace(/^S:/,'').split(',')[0]:undefined;
 const clean=value=>{if(value===undefined||value===null||typeof value==='symbol'||typeof value==='number'&&!Number.isFinite(value)||value&&typeof value==='object'&&Object.hasOwn(value,'unavailable'))return undefined;return value;};
 if(['textStyleId','fillStyleId','strokeStyleId'].includes(field)){
  if(!native)return key(node.styles?.[field==='textStyleId'?'text':field==='fillStyleId'?'fill':'stroke']?.styleKey);
  if(node[field]==='')return '';const style=Array.isArray(node.styles)?node.styles.find(s=>s.id===node[field]&&!s.unavailable):null;return style?.key;
 }
 if(['characters','fontSize','fontName','lineHeight','letterSpacing'].includes(field)){
  let value=native?node[field]:node.text?.[field];if(native&&field==='fontName'&&value&&typeof value==='object')value=[value.family,value.style].filter(Boolean).join(' ');
  if(native&&['lineHeight','letterSpacing'].includes(field)&&value&&typeof value==='object')value=value.unit==='PIXELS'?value.value:value.unit==='AUTO'?'AUTO':undefined;
  return clean(value);
 }
 if(field==='fills'||field==='strokes'){
  const paints=node[field];if(!Array.isArray(paints))return undefined;if(!paints.length)return {paints:[]};
  const visible=paints.filter(v=>v&&v.visible!==false);if(!visible.length)return {paints:[]};if(visible.length!==1||visible[0].type!=='SOLID')return undefined;
  const paint=visible[0],color=paint.color;if(!color||![color.r,color.g,color.b].every(Number.isFinite))return undefined;
  const alias=paint.boundVariables?.color,raw=node[field==='fills'?'fillToken':'strokeToken']||paint.tokenKey||paint.token||alias?.id;
  let binding=null;if(raw){const variable=native&&Array.isArray(node.variables)?node.variables.find(v=>v.id===raw&&!v.unavailable):null;binding=native?variable?.key:/VariableID:([a-f0-9]{40})\//i.exec(raw)?.[1];if(!binding)return undefined;}
  const scale=native?255:1,alpha=typeof color.a==='number'?color.a:typeof paint.opacity==='number'?paint.opacity:1;
  return {paints:[{type:'SOLID',color:[Math.round(color.r*scale),Math.round(color.g*scale),Math.round(color.b*scale),Math.round(alpha*100)/100],binding}]};
 }
 if(['width','height','minWidth','maxWidth','minHeight','maxHeight','itemSpacing'].includes(field))return clean(native?node[field]:node.layout?.[field]);
 if(['paddingLeft','paddingRight','paddingTop','paddingBottom'].includes(field))return clean(native?node[field]:node.layout?.padding?.[field.slice(7).toLowerCase()]);
 if(field==='layoutSizingHorizontal'||field==='layoutSizingVertical')return clean(native?node[field]:node.layout?.sizing?.[field==='layoutSizingHorizontal'?'horizontal':'vertical']??node[field]??node.layout?.[field]);
 if(field==='componentProperties'){
  if(!native)return clean(node.componentInstance?.variantProperties);
  if(!node.componentProperties||typeof node.componentProperties!=='object')return undefined;
  return Object.fromEntries(Object.entries(node.componentProperties).filter(([,v])=>v?.type==='VARIANT').map(([k,v])=>[k,v.value]));
 }
 if(field==='cornerRadius')return clean(native?node.cornerRadius:node.radius);
 if(['visible','opacity'].includes(field))return clean(node[field]);
 return undefined;
}
function catalogueFactField(field){const aliases={textStyleId:'textStyleKey',fillStyleId:'styles',strokeStyleId:'styles',componentProperties:'componentInstance',cornerRadius:'radius'};return 'catalogue.'+(aliases[field]||field);}
module.exports={VERSION,CUSTOMIZATION_FACTS,MAX_NODES,MAX_BYTES,MAX_READ,STATUSES,string,list,unique,byteLength,snapshotValid,coverage,reportValid,comparisonValue,catalogueFactField};
