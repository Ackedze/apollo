import {sha256Hex} from './utils/sha256';
const {identifyLegacyComponent}=require('./policies/liquidGlassComponentPolicy');
export type LiquidGlassData={registry:any|null;error:string|null};
const key=(value:any)=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
const resultScreenKey='dd134e78b30b144f5fa9471e40367f51d7a1128d';
const navigationBarKeys=new Set(['63ebc76450fc4eca2e3580eeec8951336937c046','77c445f317d8357563aa26774162e1d9a7468f17',
 'cb36704b6a173c7b5e427ecce10b93c4be43c911','8c8ae4e7db5243b1409559c3833f20ce71553100']);

export function excludeResultNavigationBars<T extends {id:string}>(entries:T[],families:Map<string,string>,nodes:Map<string,SceneNode>):T[]{
 const results=new Set(entries.filter(entry=>families.get(entry.id)===resultScreenKey).map(entry=>entry.id));
 return entries.filter(entry=>{
  if(!navigationBarKeys.has(families.get(entry.id)||''))return true;
  let parent=nodes.get(entry.id)?.parent;
  while(parent){if(results.has(parent.id))return false;parent=parent.parent;}
  return true;
 });
}

export async function readLiquidGlassRegistry(value:any,indexId:string,guard:()=>void):Promise<LiquidGlassData>{
 const fail=()=>{throw Error('AUDIT_LIQUID_GLASS_DATA_INVALID');};
 if(!value||JSON.stringify(value).length>1024*1024||value.schemaVersion!=='apollo.legacy-components.v1'||
    value.platform!=='iOS'||value.sourceIndexDataId!==indexId||!Array.isArray(value.families)||!value.families.length||value.families.length>256)fail();
 const seen=new Set<string>();
 for(const family of value.families){
  if(!key(family.key)||seen.has(family.key)||typeof family.name!=='string'||!Array.isArray(family.variantKeys)||family.variantKeys.some((k:any)=>!key(k)))fail();
  seen.add(family.key);
  const condition=family.variantCondition;
  if(condition!==null&&condition!==undefined){
   if(typeof condition!=='object'||typeof condition.property!=='string'||condition.equals!=='False'||!condition.variantValues||typeof condition.variantValues!=='object'||Array.isArray(condition.variantValues)||
      (condition.missingPropertyValue!==undefined&&condition.missingPropertyValue!=='False')||
      (condition.valueSource!==undefined&&(condition.valueSource!=='instance-properties'||condition.missingPropertyValue!=='False')))fail();
   for(const [k,v] of Object.entries(condition.variantValues))if(!key(k)||!['True','False'].includes(v as string))fail();
  }
 }
 const body=Object.assign({},value);delete body.registryId;delete body.policySource;delete body.policySha256;
 if(await sha256Hex(JSON.stringify(body),guard)!==value.registryId)fail();
 guard();return {registry:value,error:null};
}

export async function evaluateLiquidGlass(node:InstanceNode,main:ComponentNode|null,data:LiquidGlassData,platform:string){
 let variantProperties:Record<string,string>|undefined;
 try{variantProperties=node.variantProperties??undefined;}catch{}
 const assessment=identifyLegacyComponent(data.registry,{platform,mainComponentKey:main?.key,
  nodeType:node.type,name:node.name,mainComponentName:main?(main.parent?.type==='COMPONENT_SET'?main.parent.name:main.name):undefined,
  componentSetKey:main?.parent?.type==='COMPONENT_SET'?main.parent.key:undefined,variantProperties});
 const conditionUnknown=assessment.status==='unknown'&&assessment.reason.startsWith('variant-condition-');
 return assessment.status==='legacy'||conditionUnknown?{status:conditionUnknown?'unknown':'violation',assessment}:null;
}
