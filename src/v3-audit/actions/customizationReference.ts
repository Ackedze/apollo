import { getComponentKey,getReferenceStructure,resolveVariableMetadataForDiff } from '../entry';
import { ensureReferenceCatalogsForKeys,findComponent,getTokenCatalogs,resolveStructureForInstance } from '../reference/library';
import { snapshotTree } from '../structure/snapshot';
import { buildOccurrenceKeyMap } from '../structure/occurrenceKeys';
import { alignStructurePaths,expandReferenceWithInstanceComponents } from '../services/nestedReferencePreparation';
import { createCooperativeYield } from '../utils/promisePool';
import type { CustomizationResetReferenceResult } from './customizationResetAction';

/** Original V3 entry resolver, using the accepted raw catalog and actual node. */
export async function resolveCustomizationReference(rootNode:SceneNode,nodeId:string,guard:()=>void,options?:{preferSelectedComponentVariant?:boolean}):Promise<CustomizationResetReferenceResult>{
 const checkpoint=createCooperativeYield(guard);
 guard();const componentKey=await getComponentKey(rootNode);guard();
 await ensureReferenceCatalogsForKeys([componentKey]);guard();
 const reference=componentKey?findComponent(componentKey):null;
 const properties=rootNode.type==='INSTANCE'?rootNode.variantProperties??null:null;
 const referenceStructure=getReferenceStructure(reference,componentKey,properties);
 if(!referenceStructure?.length)return{ok:false,message:'Не удалось загрузить эталонную структуру компонента.'};
 const actual=await snapshotTree(rootNode,new Set<string>(),{throwIfCancelled:guard});guard();
 const aligned=alignStructurePaths(actual,referenceStructure),expanded=expandReferenceWithInstanceComponents(referenceStructure,aligned);
 await checkpoint();guard();
 const actualEntry=aligned.find(entry=>entry.nodeId===nodeId);
 if(!actualEntry)return{ok:false,message:'Не удалось сопоставить изменённый узел со структурой компонента.'};
 if(options?.preferSelectedComponentVariant&&actualEntry.type==='INSTANCE'&&actualEntry.componentInstance?.componentKey){
  const component=findComponent(actualEntry.componentInstance.componentKey),structure=resolveStructureForInstance(component,actualEntry.componentInstance);
  const selectedRoot=structure?.find(entry=>entry.parentId===null)??structure?.[0]??null;
  if(selectedRoot)return{ok:true,referenceNode:selectedRoot};
 }
 const actualKeys=buildOccurrenceKeyMap(aligned),referenceKeys=buildOccurrenceKeyMap(expanded),key=actualKeys.get(actualEntry)??actualEntry.path;
 const referenceNode=expanded.find(entry=>(referenceKeys.get(entry)??entry.path)===key);
 await checkpoint();guard();
 return referenceNode?{ok:true,referenceNode}:{ok:false,message:'Не удалось найти эталонные значения для этого узла.'};
}

// Same existing V3 numeric token selection; ambiguity is not guessed away.
export function resolveNumericVariableToken(collectionName:string,value:number):{key:string;name:string}|null{
 const name=collectionName.trim().toLowerCase(),candidates:Array<{key:string;name:string}>=[];
 for(const catalog of getTokenCatalogs())for(const collection of catalog.collections??[]){
  if(!collection||String(collection.name??'').trim().toLowerCase()!==name)continue;
  for(const variable of collection.variables??[]){
   if(!variable?.key||variable.resolvedType!=='FLOAT'||variable.hiddenFromPublishing===true||!containsValue(variable,value))continue;
   const parts=[];if(variable.groupName&&variable.groupName!=='Без группы')parts.push(variable.groupName);
   parts.push(variable.tokenName??variable.name??String(value));candidates.push({key:variable.key,name:parts.join('/')});
  }
 }
 const unique=Array.from(new Map(candidates.map(row=>[row.key,row])).values());
 if(unique.length===1)return unique[0];const exact=unique.filter(row=>Number(row.name.split('/').pop()??'')===value);
 return exact.length===1?exact[0]:null;
}
function containsValue(variable:any,expected:number){
 for(const values of Object.values(variable.actualValuesByMode??{}))if(Array.isArray(values)&&values.some(value=>typeof value==='number'&&Math.abs(value-expected)<0.0001))return true;
 return Object.values(variable.valuesByMode??{}).some(value=>typeof value==='number'&&Math.abs(value-expected)<0.0001);
}
export { resolveVariableMetadataForDiff };
