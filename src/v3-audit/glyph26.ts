const {createGlyph26Evaluator,RULE_IDS}=require('./policies/glyph26Policy');
const catalogs={default:require('../skills/reglyph/default.json'),services:require('../skills/reglyph/services.json')};
const detection=require('../skills/reglyph/detection.json');
export const glyph26RuleIds=RULE_IDS;
export function glyph26Evaluator(readMain:(node:InstanceNode)=>Promise<ComponentNode|null>,guard:()=>void){
 return createGlyph26Evaluator({catalogs,detection},{readMain,guard});
}

/** Read only instances previously replaced by ReGlyph, including restored Undo handles. */
export async function readTrackedGlyph26(ids:string[],rootIds:string[],pageId:string,guard:()=>void,servicePattern:boolean){
 const roots=new Set(rootIds),mains=new Map<string,Promise<ComponentNode|null>>();
 const check=glyph26Evaluator(node=>{if(!mains.has(node.id))mains.set(node.id,node.getMainComponentAsync());return mains.get(node.id)!;},guard);
 const updates:any[]=[];
 for(const id of ids){
  guard();
  try{
   const node=await figma.getNodeByIdAsync(id);guard();
   let parent:BaseNode|null=node,inside=false;
   while(parent&&parent.type!=='PAGE'){if(roots.has(parent.id))inside=true;parent=parent.parent;}
   if(!node||node.removed||node.type!=='INSTANCE'||!inside||parent?.id!==pageId){updates.push({id,status:'current'});continue;}
   const result=await check(node);guard();
   if(['violation','warning'].includes(result.status))updates.push({id,status:'legacy',classification:servicePattern?'warning':result.status,
    reason:servicePattern?'service-pattern-required':result.reason,ruleId:servicePattern?RULE_IDS.manual:result.ruleId,sourceKey:result.sourceKey,targetKey:result.targetKey});
   else updates.push({id,status:result.status==='unknown'?'unknown':'current'});
  }catch{guard();updates.push({id,status:'unknown'});}
 }
 guard();return updates;
}
