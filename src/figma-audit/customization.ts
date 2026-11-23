import {snapshotTree} from '../v3-audit/structure/snapshot';
import {diffStructures} from '../v3-audit/structure/diff';
import {resolveStructure} from '../v3-audit/reference/library';
import {buildOccurrenceKeyMap} from '../v3-audit/structure/occurrenceKeys';

const p=require('./protocol');
const fail=(code:string):never=>{throw Object.assign(Error(code),{code});};
const copy=(v:any)=>JSON.parse(JSON.stringify(v));
const keys=['id','parentId','path','type','name','visible','styles','layout','text','fills','strokes','fillToken','strokeToken','strokeWeight','strokeAlign','radius','opacity','effects','componentInstance','typographyToken','layoutSizingHorizontal','layoutSizingVertical'];
function technicalNode(node:any){const out:any={};for(const k of keys)if(Object.hasOwn(node,k))out[k]=copy(node[k]);return out;}
function normalizePaints(node:any){
 const color=(paints:any)=>{const paint=Array.isArray(paints)?paints.find((v:any)=>v&&v.visible!==false&&(!v.type||v.type==='SOLID')):null,c=paint?.color;if(typeof c==='string')return c;if(!c||![c.r,c.g,c.b].every(Number.isFinite))return undefined;return `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${typeof c.a==='number'?Math.round(c.a*100)/100:1})`;};
 const token=(paints:any)=>Array.isArray(paints)?paints.find((v:any)=>v?.tokenKey||v?.token||v?.boundVariables?.color?.id):null;
 for(const [name,plural,key]of [['fill','fills','fillToken'],['stroke','strokes','strokeToken']]){
  const paint=token(node[plural]),binding=node[key]||paint?.tokenKey||paint?.token||paint?.boundVariables?.color?.id,value=color(node[plural]);
  if(binding||value){node[name]=node[name]||{};if(binding&&!node[name].token)node[name].token=binding;if(value&&!node[name].color)node[name].color=value;}
 }
 if(node.stroke&&typeof node.strokeWeight==='number'&&node.stroke.weight==null)node.stroke.weight=node.strokeWeight;
 if(node.layoutSizingHorizontal||node.layoutSizingVertical){node.layout=node.layout||{};node.layout.sizing=node.layout.sizing||{};if(node.layoutSizingHorizontal)node.layout.sizing.horizontal=node.layoutSizingHorizontal;if(node.layoutSizingVertical)node.layout.sizing.vertical=node.layoutSizingVertical;}
 return node;
}
const selectors:Record<string,(n:any)=>any>={
 characters:n=>n.text?.characters,fontSize:n=>n.text?.fontSize,fontName:n=>n.text?.fontName,lineHeight:n=>n.text?.lineHeight,letterSpacing:n=>n.text?.letterSpacing,
 textStyleId:n=>n.styles?.text?.styleKey,fills:n=>n.fill,fillStyleId:n=>n.styles?.fill?.styleKey,strokes:n=>n.stroke,strokeStyleId:n=>n.styles?.stroke?.styleKey,
 width:n=>n.layout?.width,height:n=>n.layout?.height,minWidth:n=>n.layout?.minWidth,maxWidth:n=>n.layout?.maxWidth,minHeight:n=>n.layout?.minHeight,maxHeight:n=>n.layout?.maxHeight,
 itemSpacing:n=>n.layout?.itemSpacing,paddingLeft:n=>n.layout?.padding?.left,paddingRight:n=>n.layout?.padding?.right,paddingTop:n=>n.layout?.padding?.top,paddingBottom:n=>n.layout?.padding?.bottom,
 layoutSizingHorizontal:n=>n.layout?.sizing?.horizontal,layoutSizingVertical:n=>n.layout?.sizing?.vertical,opacity:n=>n.opacity,cornerRadius:n=>n.radius,effects:n=>n.effects,visible:n=>n.visible,
 componentProperties:n=>n.componentInstance?.variantProperties,
};
function known(v:any):boolean{return v!==undefined&&v!==null&&(typeof v!=='number'||Number.isFinite(v));}

/** Facts only. No V3 classifier, policy evaluator or shared catalogue state. */
export async function compareCustomizations({targets,references,observations,scopeIds,hash,assertCurrent}:any){
 if(!Array.isArray(targets)||!Array.isArray(references)||!Array.isArray(observations)||targets.length>100||references.length>100)fail('AUDIT_COMPARISON_INVALID');
 const allowed=new Set(scopeIds),byNode=new Map(observations.map((n:any)=>[n.id,n])),actualCache=new Map<string,any[]>(),resolved=new Map<string,any[]>(),comparisons:any[]=[],gaps:any[]=[];
 for(const ref of references){
  if(!p.string(ref.id,120)||!Array.isArray(ref.targetIds)||!ref.targetIds.every((id:string)=>allowed.has(id))||ref.component?.key!==ref.componentKey||!ref.component?.variants?.some((v:any)=>v.key===ref.variantKey)||ref.variantKey!==ref.component.defaultVariant&&!Array.isArray(ref.component.variantStructures?.[ref.variantKey]))fail('AUDIT_COMPARISON_REFERENCE_INVALID');
  const rows=resolveStructure(ref.component,ref.variantKey);
  if(!rows?.length||hash(rows.map(technicalNode))!==ref.structureHash)fail('AUDIT_COMPARISON_REFERENCE_INVALID');
  resolved.set(ref.id,rows.map(n=>normalizePaints(copy(n))));
 }
 for(const target of targets.slice().sort((a:any,b:any)=>scopeIds.indexOf(a.id)-scopeIds.indexOf(b.id))){
  assertCurrent();if(!allowed.has(target.id)||target.type!=='INSTANCE')fail('AUDIT_SCOPE_ESCAPE');
  const matched=references.filter((r:any)=>r.targetIds.includes(target.id));
  if(matched.length!==1){gaps.push({nodeId:target.id,code:'REFERENCE_UNAVAILABLE'});continue;}
  const ref=matched[0],identity:any=byNode.get(target.id);
  if(identity?.main?.key!==ref.variantKey||identity.main?.set?.key&&identity.main.set.key!==ref.componentKey)fail('AUDIT_STALE');
  let tree:any[]|undefined;
  for(const cached of actualCache.values()){
   const root=cached.find(n=>n.nodeId===target.id);if(!root)continue;const included=new Set([root.id]);tree=[];
   for(const n of cached)if(n.id===root.id||included.has(n.parentId)){included.add(n.id);tree.push(n.id===root.id?Object.assign({},n,{parentId:null}):n);}break;
  }
  if(!tree)tree=await snapshotTree(target,new Set<string>(),{includeHidden:false,throwIfCancelled:assertCurrent});assertCurrent();
  if(tree.some(n=>!n.nodeId||!allowed.has(n.nodeId)))fail('AUDIT_SCOPE_ESCAPE');
  actualCache.set(target.id,tree);
  const reference=resolved.get(ref.id)!,prefix=tree[0]?.path,referencePrefix=reference.find(n=>!n.path.includes(' / '))?.path||reference[0].path;
  const aligned=tree.map(n=>Object.assign({},n,{path:n.path===prefix?referencePrefix:n.path.startsWith(prefix+' /')?referencePrefix+n.path.slice(prefix.length):n.path}));
  const actualKeys=buildOccurrenceKeyMap(aligned),referenceKeys=buildOccurrenceKeyMap(reference),referenceMap=new Map(Array.from(referenceKeys,([n,key])=>[key,n]));
  const raw=diffStructures(aligned,reference,{strict:true});
  for(const node of aligned){
   const found=referenceMap.get(actualKeys.get(node)!);
   if(!found){gaps.push({nodeId:node.nodeId,ownerId:target.id,code:'NODE_CORRESPONDENCE_UNAVAILABLE'});continue;}
   if(node.type!==found.type&&!(node.nodeId===target.id&&node.type==='INSTANCE'&&found.type==='COMPONENT')){gaps.push({nodeId:node.nodeId,ownerId:target.id,code:'NODE_TYPE_CORRESPONDENCE_UNAVAILABLE'});continue;}
   const native:any=byNode.get(node.nodeId!);
   const fields=new Set<string>();
   for(const owner of observations)for(const override of owner.overrides||[])if(override.id===node.nodeId)for(const f of override.overriddenFields||[])if(typeof f==='string')fields.add(f);
   for(const field of fields){
    const get=selectors[field];
    if(!get){gaps.push({nodeId:node.nodeId,field,ownerId:target.id,referenceId:ref.id,referenceNodeId:found.id,code:'FIELD_COMPARISON_UNSUPPORTED'});continue;}
    const actual=p.comparisonValue(native,field,'native'),expected=p.comparisonValue(found,field,'catalogue');
    if(native?.unavailable?.includes(field)||!known(actual)||!known(expected)){gaps.push({nodeId:node.nodeId,field,ownerId:target.id,referenceId:ref.id,referenceNodeId:found.id,code:'FIELD_COMPARISON_UNAVAILABLE'});continue;}
    comparisons.push({nodeId:node.nodeId,field,ownerId:target.id,referenceId:ref.id,referenceNodeId:found.id,actual,reference:expected,equal:hash(actual)===hash(expected),technicalDiffs:raw.diffs.filter(d=>d.nodeId===node.nodeId).map(d=>({kind:d.diffKind||'other',property:d.details?.property,actual:d.details?.actual,reference:d.details?.reference}))});
   }
  }
 }
 // Prefer the direct selected component baseline over its containing template.
 const selected=new Map<string,any>();
 for(const c of comparisons){const key=JSON.stringify([c.nodeId,c.field]),old=selected.get(key);if(!old||(actualCache.get(c.ownerId)?.length||Infinity)<(actualCache.get(old.ownerId)?.length||Infinity))selected.set(key,c);}
 return {version:p.CUSTOMIZATION_FACTS,comparisons:Array.from(selected.values()),gaps:gaps.filter(g=>!g.field||!selected.has(JSON.stringify([g.nodeId,g.field])))};
}
