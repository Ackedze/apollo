// Finite native realization supported by the reviewed source provider.
// Authoring manuals remain normative. Never infer away explicit ScreenSpec props.
const source=require("./source.json");
const MCP_NAMESPACE='apollomcp';
const fail=code=>{throw Error(code);};
function createFigmaTargets(source){
const generic=source.genericMapping?require("./mapping").createMappingAdapter(source.genericMapping):null;
function componentTarget(node,platform=source.capabilityPlatform){
 if(generic){try{const selected=generic.select(node,platform);if(selected)return{choice:selected.choice.id,properties:selected.choice.properties,issues:[]};}catch(e){return{choice:null,properties:{},issues:[e.message]};}}
 if(platform!=='desktop')return{choice:null,properties:{},issues:['FIGMA_PLATFORM_UNSUPPORTED']};
 const props=node.props||{},issues=[],own=k=>Object.prototype.hasOwnProperty.call(props,k);
 if(node.mappingId==='arui-private.corporate-content.desktop'){
  if(Object.keys(props).length)issues.push('FIGMA_TARGET_PROP_UNSUPPORTED');
  if(Object.keys(node.slots||{}).some(k=>k!=='body')||node.actions)issues.push('FIGMA_TARGET_SLOT_UNSUPPORTED');
  return{choice:'cc.desktop',properties:{},issues};
 }
 if(node.mappingId!=='arui-private.buttons-group.desktop')return{choice:null,properties:{},issues:['FIGMA_TARGET_MAPPING_UNAVAILABLE']};
 if(Object.keys(props).some(k=>!['size','overflow'].includes(k)))issues.push('FIGMA_TARGET_PROP_UNSUPPORTED');
 if(own('size')&&props.size!=='56'||own('overflow')&&!['false','true'].includes(props.overflow))issues.push('FIGMA_TARGET_VALUE_UNSUPPORTED');
 if(Object.keys(node.slots||{}).length)issues.push('FIGMA_TARGET_SLOT_UNSUPPORTED');
 const count=node.actions?.items.length||0,overflow=own('overflow')?props.overflow==='true':count>4;
 if(node.actions&&(node.actions.port!=='button-label'||count>5))issues.push('FIGMA_TARGET_ACTIONS_UNSUPPORTED');
 if(node.actions&&overflow!==(count>4))issues.push('FIGMA_OVERFLOW_ACTIONS_CONFLICT');
 return{choice:'bg.size56.overflow.'+String(overflow),properties:{Size:'56',Overflow:String(overflow)},issues};
}
function matchingProperties(properties,target){return target.issues.length===0&&Object.entries(target.properties).every(([name,value])=>{const actual=Array.isArray(properties)?properties.find(p=>p.name===name):properties?.[name];return actual?.type==='VARIANT'&&actual.value===value;});}
function supportsActionPlacement(choice,actions){
 return !!choice?.buttonSetKey&&Array.isArray(choice.buttonSourceIds)&&choice.properties?.Overflow==='false'&&actions.items.length<=choice.buttonSourceIds.length;
}
function assertMcpComposition(spec){
 const choices=new Map(source.choices.map(choice=>[choice.id,choice]));
 for(const node of spec.nodes){const target=componentTarget(node,spec.platform),choice=choices.get(target.choice);if(node.actions&&(target.issues.length||!supportsActionPlacement(choice,node.actions)))fail('AGENT_MCP_ACTION_PLACEMENT_UNSUPPORTED');const knownDefault=choice?.defaultSourceId||Array.isArray(choice?.defaultSourceIds)&&choice.defaultSourceIds.length===0;if(Object.keys(node.slots||{}).some(port=>port!==(choice?.bodyPort||'body')||!choice?.bodyProperty||!choice.slotSourceId||!knownDefault))fail('AGENT_MCP_SLOT_PLACEMENT_UNSUPPORTED');}
}
 return{componentTarget,matchingProperties,supportsActionPlacement,assertMcpComposition};
}
module.exports=Object.assign({MCP_NAMESPACE,createFigmaTargets},createFigmaTargets(source));
