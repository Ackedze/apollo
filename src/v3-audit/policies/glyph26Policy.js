'use strict';
const {currencyArtwork,iconContext,createProtectedIconReader,visibleInLayout}=require('../../skills/reglyph/icon-detection');
const RULE_IDS={automatic:'apollo.glyph26.automatic',manual:'apollo.glyph26.manual',ignore:'apollo.glyph26.ignore'};

function createGlyph26Evaluator({catalogs,detection},{readMain,guard=()=>{}}){
 const base=catalogs.default,services=catalogs.services;
 const legacy=new Map(base.oldIcons.map(row=>[row.key,row]));
 for(const row of base.observedIcons)if(row.category==='unused')legacy.set(row.key,row);
 const targets=new Set(base.newIcons.map(row=>row.key)),mappings=new Map(base.mappings.map(row=>[row.oldKey,row.newKey]));
 const ignored=new Set(services.newIcons.map(row=>row.key));
 for(const catalog of [base,services])for(const row of catalog.observedIcons)if(['native','logo'].includes(row.category))ignored.add(row.key);
 for(const key of targets)ignored.add(key);
 for(const key of legacy.keys())ignored.delete(key);
 const currencies=new Set(base.legacyCurrencies.sourceKeys),protectedCache=new Map();
 const serviceHeaders=new Set(detection.serviceHeaderSets.map(row=>row.key));
 const containers=new Map(detection.containers.map(row=>[row.key,row]));
 const views=new Map(detection.iconViewSets.map(row=>[row.key,row]));
 const protectedIcon=createProtectedIconReader(detection);
 const mainOf=async node=>{guard();const main=await readMain(node);guard();return main;};
 return async node=>{
  guard();
  if(!visibleInLayout(node))return {status:'not-applicable',ruleId:RULE_IDS.ignore};
  let main;
  try{main=await mainOf(node);}catch{guard();return {status:'unknown',reason:'identity-unreadable'};}
  if(!main?.key)return {status:'unknown',reason:'identity-unavailable'};
  if(main.parent?.type==='COMPONENT_SET'&&serviceHeaders.has(main.parent.key)&&node.findAllWithCriteria){
   try{
    for(const text of node.findAllWithCriteria({types:['TEXT']}))if(text.name==='_title'&&visibleInLayout(text)&&/(^|[^\p{L}\p{N}_])сервисы(?=$|[^\p{L}\p{N}_])/iu.test(text.characters))return {status:'service-pattern-required'};
   }catch{guard();return {status:'unknown',reason:'service-context-unreadable'};}
  }
  const source=legacy.get(main.key),currency=currencies.has(main.key);
  if(targets.has(main.key)||ignored.has(main.key))return {status:'not-applicable',ruleId:RULE_IDS.ignore};
  if(!source&&!currency)return {status:'out-of-scope'};
  try{
   if(await protectedIcon(node,mainOf,protectedCache)){guard();return {status:'not-applicable',ruleId:RULE_IDS.ignore};}
   guard();
   let targetKey=mappings.get(main.key)||null;
   if(currency){
    const artwork=currencyArtwork(node);
    const matches=artwork?base.legacyCurrencies.rows.filter(row=>row.artwork===artwork):[];
    if(matches.length===1)targetKey=matches[0].targetKey;
    else if(!await iconContext(node,mainOf,containers,views)){guard();return {status:'unknown',reason:'currency-artwork-unconfirmed'};}
   }
   guard();
   return {status:targetKey?'violation':'warning',ruleId:targetKey?RULE_IDS.automatic:RULE_IDS.manual,
    reason:targetKey?'automatic-mapping':'designer-choice-required',sourceKey:main.key,targetKey,name:source?.baseName||source?.name||'Currency'};
  }catch{guard();return {status:'unknown',reason:'icon-context-unreadable'};}
 };
}
module.exports={createGlyph26Evaluator,RULE_IDS};
