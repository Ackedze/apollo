'use strict';
const hasOwn=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const withdrawnFamilies=new Set(['9b7cba716d4642a097e04b5d7bab3a95a172260c','6177e70b6bc7799c924da243126bb59a57368bc4','9fc632a82c356e4c1ccfbafd9a023ec148e62c95']);

function identifyLegacyComponent(registry,{platform,mainComponentKey,componentSetKey,variantProperties,nodeType,name,mainComponentName}){
 const sourceName=typeof mainComponentName==='string'?mainComponentName:name;
 if(platform==='iOS'&&nodeType==='INSTANCE'&&name!=='.❌Switch'&&typeof sourceName==='string'&&/^❌\s*Switch$/.test(sourceName.trim())){
  return {status:'legacy',source:'local-rule',reason:'deleted-switch-name',matchBasis:typeof mainComponentName==='string'?'main-component-name':'instance-name'};
 }
 if(!registry||platform!==registry.platform)return {status:'not-applicable'};
 const matches=registry.families.filter(family=>family.key===mainComponentKey||family.key===componentSetKey||family.variantKeys.includes(mainComponentKey)||
  family.variantCondition&&hasOwn(family.variantCondition.variantValues,mainComponentKey));
 if(matches.length>1)return {status:'unknown',reason:'identity-conflict'};
 if(!matches.length)return {status:'unknown',reason:'outside-scope-or-unavailable-identity'};
 if(withdrawnFamilies.has(matches[0].key))return {status:'not-applicable',reason:'owner-withdrawn-family'};
 const condition=matches[0].variantCondition;
 let reason;
 if(condition){
  const instanceState=condition.valueSource==='instance-properties';
  const readable=variantProperties!==null&&typeof variantProperties==='object'&&!Array.isArray(variantProperties);
  if(instanceState&&!readable)return {status:'unknown',reason:'variant-condition-unavailable'};
  const observed=variantProperties&&hasOwn(variantProperties,condition.property)?variantProperties[condition.property]:undefined;
  const recorded=hasOwn(condition.variantValues,mainComponentKey)?condition.variantValues[mainComponentKey]:undefined;
  const confirmedMissing=readable&&!hasOwn(variantProperties,condition.property);
  const instanceValue=observed??(confirmedMissing?condition.missingPropertyValue:undefined);
  if((observed!==undefined&&!['False','True'].includes(observed))||
     (!instanceState&&instanceValue!==undefined&&recorded!==undefined&&instanceValue!==recorded)){
   return {status:'unknown',reason:'variant-condition-conflict'};
  }
  const value=instanceValue??(instanceState?undefined:recorded);
  if(value===undefined)return {status:'unknown',reason:'variant-condition-unavailable'};
  if(value!==condition.equals)return {status:'not-applicable',familyKey:matches[0].key};
  if(instanceState)reason=confirmedMissing?'variant-property-missing':'variant-property-disabled';
 }
 const result={status:'legacy',familyKey:matches[0].key,source:matches[0].source,
  matchBasis:matches[0].key===mainComponentKey?'main-component-key':matches[0].variantKeys.includes(mainComponentKey)||condition&&hasOwn(condition.variantValues,mainComponentKey)?'variant-key':'component-set-key'};
 if(reason)result.reason=reason;
 return result;
}

module.exports={identifyLegacyComponent};
