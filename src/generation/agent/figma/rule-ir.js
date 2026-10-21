const runtime=require("../../../runtime");
const {collectNodes}=require("../../../../packages/component-contract-core/src/figma-capture");
function createReadOnlyRuleIR({contracts}){
 return async function evaluateRuleIR(instance,componentId,guard){
  const contract=contracts[componentId];if(!contract)throw Error('FIGMA_RULE_IR_CONTRACT_UNAVAILABLE');
  guard();const captured=await collectNodes(instance,'desktop',Object.assign({},instance.resolvedVariableModes));guard();
  const main=await instance.getMainComponentAsync();guard();if(!main)throw Error('FIGMA_MAIN_COMPONENT_UNKNOWN');
  captured.snapshot.source=Object.assign({},captured.snapshot.source,{componentKey:main.key,componentSetKey:main.parent?.type==='COMPONENT_SET'?main.parent.key:null});
  // No reference pages/instances are created in the generation actor. Core
  // reference/dependency predicates without accepted evidence remain unknown.
  const options=contract.status==='draft'?{evaluationMode:'authoring-preview'}:{};
  const result=runtime.auditContractSnapshot(captured.snapshot,contract,options);guard();return result;
 };
}
module.exports={createReadOnlyRuleIR};
