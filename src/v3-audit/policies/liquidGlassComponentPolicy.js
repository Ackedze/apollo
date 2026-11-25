'use strict';
const hasOwn=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);

function identifyLegacyComponent(registry,{platform,mainComponentKey,componentSetKey,variantProperties}){
 if(platform!==registry.platform)return {status:'not-applicable'};
 const matches=registry.families.filter(family=>family.key===mainComponentKey||family.key===componentSetKey||family.variantKeys.includes(mainComponentKey)||
  family.variantCondition&&hasOwn(family.variantCondition.variantValues,mainComponentKey));
 if(matches.length>1)return {status:'unknown',reason:'identity-conflict'};
 if(!matches.length)return {status:'unknown',reason:'outside-scope-or-unavailable-identity'};
 const condition=matches[0].variantCondition;
 if(condition){
  const observed=variantProperties&&hasOwn(variantProperties,condition.property)?variantProperties[condition.property]:undefined;
  const recorded=hasOwn(condition.variantValues,mainComponentKey)?condition.variantValues[mainComponentKey]:undefined;
  if((observed!==undefined&&!['False','True'].includes(observed))||(observed!==undefined&&recorded!==undefined&&observed!==recorded)){
   return {status:'unknown',reason:'variant-condition-conflict'};
  }
  const confirmedMissing=variantProperties!==null&&typeof variantProperties==='object'&&!Array.isArray(variantProperties)&&!hasOwn(variantProperties,condition.property);
  const value=observed??(confirmedMissing&&condition.missingPropertyValue!==undefined?condition.missingPropertyValue:recorded);
  if(value===undefined)return {status:'unknown',reason:'variant-condition-unavailable'};
  if(value!==condition.equals)return {status:'not-applicable',familyKey:matches[0].key};
 }
 return {status:'legacy',familyKey:matches[0].key,source:matches[0].source,
  matchBasis:matches[0].key===mainComponentKey?'main-component-key':matches[0].variantKeys.includes(mainComponentKey)||condition&&hasOwn(condition.variantValues,mainComponentKey)?'variant-key':'component-set-key'};
}

module.exports={identifyLegacyComponent};
