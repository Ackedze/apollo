import { FindingActionRegistry } from './findingActionRegistry';
import { executeFindingAction,type MutationControl } from '../actions/findingAction';
import { applyComponentFindingReplacement } from '../actions/corporateComponentAction';
import { createCustomizationResetAction,type CustomizationResetPayload } from '../actions/customizationResetAction';
import { createCustomizationResetMutations } from '../actions/customizationResetMutations';
import { resolveCustomizationReference,resolveNumericVariableToken,resolveVariableMetadataForDiff } from '../actions/customizationReference';
import { ensureReferenceCatalogsLoaded } from '../reference/library';
import { resolveSceneNodeById } from '../actions/sceneNodeResolver';
import { createCooperativeYield } from '../utils/promisePool';

type Descriptor={kind:'registry';id:string}|{kind:'reset';payload:CustomizationResetPayload}|{kind:'theme';evidence:any}|{kind:'font';evidence:any}|{kind:'component';nodeId:string;expectedComponentKey:string;targetComponentKey:string};
function pageOf(node:BaseNode):PageNode|null{let n:BaseNode|null=node;const seen=new Set<string>();while(n&&!seen.has(n.id)){if(n.type==='PAGE')return n;seen.add(n.id);n=n.parent;}return null;}

/** Only IDs/descriptors produced by the accepted native run cross this boundary. */
export async function createAuditSession(result:any,registry:FindingActionRegistry,pageId:string,guard:()=>void){
 const checkpoint=createCooperativeYield(guard),focus=new Map<string,string>(),focusByNode=new Map<string,string>(),actions=new Map<string,Descriptor>(),seen=new Set<any>();
 const explicitModes=JSON.stringify(figma.currentPage.explicitVariableModes||{});
 function target(id:unknown){
  if(typeof id!=='string'||!id)return null;let key=focusByNode.get(id);
  if(!key){key='v3-focus-'+focus.size;focus.set(key,id);focusByNode.set(id,key);}return key;
 }
 function action(item:any,descriptor:Descriptor,label:string,kind:string){const id='v3-action-'+actions.size;actions.set(id,descriptor);item.actions=(item.actions||[]).concat({id,kind,label});}
 const views=result.views?.visibleViews||{};
 // Raw baseline controls must never become controls on the interpreted allowed row.
 if(views.changesWip)views.changesWip=views.changesWip.map((item:any)=>Object.assign({},item,{diffs:(item.diffs||[]).map((diff:any)=>Object.assign({},diff,{actions:[]}))}));
 const items=Object.values(views).flatMap((value:any)=>Array.isArray(value)?value:Object.values(value||{}).flat()).concat(result.baseChecks||[]);
 const rawDiffs=new Set((views.changesWip||[]).flatMap((item:any)=>item.diffs||[]));
 const byNode=new Map<string,any>();
 for(const item of items){if(item&&typeof item.id==='string'&&item.componentKey)byNode.set(item.id,item);}
 for(const item of items){
  await checkpoint();if(!item||seen.has(item))continue;seen.add(item);
  item.focusActionId=target(item.focusNodeId||item.nodeId||item.id);
  for(const summary of item.actions||[])if(registry.get(summary.id))actions.set(summary.id,{kind:'registry',id:summary.id});
  for(const diff of item.diffs||[]){
   await checkpoint();diff.focusActionId=target(diff.nodeId||item.focusNodeId||item.id);
   if(seen.has(diff))continue;seen.add(diff);
   for(const choice of resetChoices(item.id,diff,rawDiffs.has(diff)))action(diff,{kind:'reset',payload:choice.payload},choice.label,'reset');
  }
  if(item.kind==='corporateComponent'&&item.nodeId&&item.replacementComponentKey&&byNode.get(item.nodeId)?.componentKey){
   action(item,{kind:'component',nodeId:item.nodeId,expectedComponentKey:byNode.get(item.nodeId).componentKey,targetComponentKey:item.replacementComponentKey},'Заменить','swap-component');
  }
  if(item.id==='theme'&&item.classification==='violation'&&item.status==='complete'&&item.evidence?.collectionRemote===true&&item.evidence.collectionKey&&item.evidence.collectionId&&item.evidence.expectedModeId){
   action(item,{kind:'theme',evidence:JSON.parse(JSON.stringify(item.evidence))},'Выбрать Corp','theme');
  }
  if(item.id==='font'&&item.classification==='violation'&&item.status==='complete'&&item.evidence?.collectionIdentity==='published:'+item.evidence?.collectionKey&&item.evidence.collectionKey&&item.evidence.collectionId&&item.evidence.expectedModeId){
   action(item,{kind:'font',evidence:JSON.parse(JSON.stringify(item.evidence))},'Выбрать Alfa Sans','font');
  }
 }
 // Hold the reset target's actual state from this accepted capture. Imports and
 // font reads must not overwrite a later user edit even before nodechange arrives.
 const resetStates=new Map<string,{node:SceneNode;state:string}>();
 for(const descriptor of actions.values())if(descriptor.kind==='reset'){
  const ids=[descriptor.payload.nodeId,...(descriptor.payload.remediations||[]).map(item=>item.nodeId)].filter((id):id is string=>!!id);
  for(const id of ids){await checkpoint();if(resetStates.has(id))continue;const node=await resolveSceneNodeById(id);guard();if(node&&!node.removed&&pageOf(node)?.id===pageId)resetStates.set(id,{node,state:resetState(node)});}
 }
 const textTargets=[];
 for(const fact of result.textReport?.facts?.texts||[]){await checkpoint();const id=target(fact.node?.id);if(id)textTargets.push({nodeId:fact.node.id,focusActionId:id});}
 result.textTargets=textTargets;guard();
 async function scene(id:string,operationGuard:()=>void){operationGuard();const node=await resolveSceneNodeById(id);operationGuard();if(!node||node.removed||pageOf(node)?.id!==pageId)throw Error('AUDIT_SCOPE_UNAVAILABLE');return node;}
 return{
  hasFocus:(id:string)=>focus.has(id),hasAction:(id:string)=>actions.has(id),
  async focus(id:string,operationGuard:()=>void){const nodeId=focus.get(id);if(!nodeId)throw Error('AUDIT_FOCUS_UNAVAILABLE');const node=await scene(nodeId,operationGuard);operationGuard();figma.currentPage.selection=[node];figma.viewport.scrollAndZoomIntoView([node]);},
  async execute(id:string,mutation:MutationControl){
   mutation.assertCurrent();const descriptor=actions.get(id);if(!descriptor)throw Error('AUDIT_ACTION_UNAVAILABLE');let message='';
   const notify=(text:string)=>{message=text;};
   if(descriptor.kind==='registry')await executeFindingAction(descriptor.id,{registry,mutation,notify,rerunAudit:async()=>{}});
   else if(descriptor.kind==='component'){
    const applied=await applyComponentFindingReplacement(Object.assign({},descriptor,{mutation}));if(!applied.ok)throw Error(applied.message);message='Компонент заменён.';
   }else if(descriptor.kind==='theme'||descriptor.kind==='font'){
    const expectedName=descriptor.kind==='font'?'AlfaSans':'Corp';
    const evidence=descriptor.evidence,collection=await figma.variables.getVariableCollectionByIdAsync(evidence.collectionId);mutation.assertCurrent();
    if(!collection)throw Error('AUDIT_ACTION_SOURCE_CHANGED');
    const verify=()=>{mutation.assertCurrent();if(collection.id!==evidence.collectionId||collection.key!==evidence.collectionKey||collection.remote!==true||collection.name!==evidence.property||collection.modes.filter(mode=>mode.modeId===evidence.expectedModeId).length!==1||!collection.modes.some(mode=>mode.modeId===evidence.expectedModeId&&mode.name===expectedName)||JSON.stringify(figma.currentPage.explicitVariableModes||{})!==explicitModes)throw Error('AUDIT_ACTION_SOURCE_CHANGED');};
    verify();
    mutation.beforeWrite();figma.currentPage.setExplicitVariableModeForCollection(collection,evidence.expectedModeId);
    if(figma.currentPage.explicitVariableModes?.[collection.id]!==evidence.expectedModeId)throw Error('AUDIT_ACTION_UNCONFIRMED');message=`На странице выбран ${expectedName}.`;
   }else{
    let wrote=false,refused:unknown=null;
    const targets=[descriptor.payload.nodeId,...(descriptor.payload.remediations||[]).map(item=>item.nodeId)].filter((id):id is string=>!!id);
    const control:MutationControl={assertCurrent(){if(refused)throw refused;mutation.assertCurrent();},beforeWrite(){
     try{control.assertCurrent();if(!wrote)for(const id of targets){const expected=resetStates.get(id);if(!expected||expected.node.removed||resetState(expected.node)!==expected.state)throw Error('AUDIT_ACTION_SOURCE_CHANGED');}
     mutation.beforeWrite();wrote=true;}catch(error){refused=error;throw error;}
    }};
    const getNode=async(nodeId:string)=>scene(nodeId,control.assertCurrent);
    const reset=createCustomizationResetAction({mutation:control,ensureReferencesLoaded:async()=>{await ensureReferenceCatalogsLoaded();mutation.assertCurrent();},getSceneNodeById:getNode,
     resolveReferenceNode:(root,id,options)=>resolveCustomizationReference(root,id,mutation.assertCurrent,options),resolveNumericVariableToken,
     mutations:createCustomizationResetMutations({mutation:control,resolveVariableMetadata:resolveVariableMetadataForDiff,getSceneNodeById:getNode}),notify,log:()=>{},rerunAudit:async()=>{}});
    await reset(descriptor.payload);control.assertCurrent();if(!wrote&&message==='Изменения сброшены.')throw Error('AUDIT_ACTION_UNCONFIRMED');
   }
   mutation.assertCurrent();return{message};
  },
 };
}

/** The existing V3 UI's reset selection, retained natively as opaque actions. */
export function resetChoices(rootId:string,diff:any,raw=false):Array<{label:string;payload:CustomizationResetPayload}>{
 const verdict=diff.assessment?.verdict,details=diff.details,nodeId=diff.nodeId||rootId;
 if(!raw&&['allowed','expected'].includes(verdict))return[];
 let remediation=diff.assessment?.remediation;
 if(!remediation&&verdict==='violation'&&/^layout\.padding\.(top|right|bottom|left)$/.test(details?.property)&&typeof details.actual?.value==='number'&&details.actual.resourceType!=='token'&&!details.actual.bindingId&&!details.actual.binding){
  const source=diff.assessment?.evidence?.requiredTokenSource||(diff.componentRules||[]).find((rule:any)=>rule.severity==='error'&&rule.requiredTokenSource?.collection)?.requiredTokenSource;
  if(typeof source?.collection==='string'&&source.collection.trim())remediation={kind:'bind-layout-variable',nodeId,property:details.property,collectionName:source.collection.trim(),value:details.actual.value};
 }
 if(details?.property?.startsWith('composition.')&&!remediation)return[];
 if(remediation)return[{label:'Сбросить',payload:{rootId,nodeId,remediations:[JSON.parse(JSON.stringify(remediation))]}}];
 if(details?.property?.startsWith('variant.')){
  const property=details.property.slice(8),expected=diff.assessment?.evidence?.expected;
  const choices=Array.from(new Set<string>((Array.isArray(expected)?expected:[]).filter((value:any)=>typeof value==='string'&&value.length)));
  if(!choices.length&&typeof details.reference?.value==='string'&&details.reference.value.length)choices.push(details.reference.value);
  return choices.map(value=>({label:choices.length===1?'Сбросить':'Выбрать '+value,payload:{rootId,nodeId,remediations:[{kind:'set-variant-properties',nodeId,properties:{[property]:value}}]}}));
 }
 const atoms=Array.isArray(details?.atomicChanges)&&details.atomicChanges.length?details.atomicChanges:[details];
 const resets=atoms.filter((detail:any)=>detail?.reference&&typeof detail.property==='string'&&!detail.property.startsWith('composition.')).map((detail:any)=>({property:detail.property,reference:JSON.parse(JSON.stringify(detail.reference)),message:diff.message,resetSurface:diff.assessment?.evidence?.resetSurface==='layer'&&['fill','stroke'].includes(detail.property)?'paint' as const:undefined}));
 if(resets.length)return[{label:'Сбросить',payload:{rootId,nodeId,details:resets}}];
 return typeof diff.message==='string'&&diff.message.trim()?[{label:'Сбросить',payload:{rootId,nodeId,messages:[diff.message]}}]:[];
}

function resetState(node:SceneNode):string{
 const fields=['visible','width','height','layoutSizingHorizontal','layoutSizingVertical','layoutAlign','layoutGrow','layoutMode','primaryAxisSizingMode','counterAxisSizingMode','primaryAxisAlignItems','counterAxisAlignItems','paddingTop','paddingRight','paddingBottom','paddingLeft','itemSpacing','counterAxisSpacing','fills','strokes','fillStyleId','strokeStyleId','strokeWeight','strokeAlign','effects','effectStyleId','opacity','cornerRadius','topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius','characters','textStyleId','fontName','fontSize','fontWeight','letterSpacing','lineHeight','textAlignHorizontal','openTypeFeatures','boundVariables','variantProperties','componentProperties'];
 const state:Record<string,unknown>={id:node.id,type:node.type,parentId:node.parent?.id};
 for(const field of fields)if(field in node)state[field]=(node as any)[field];
 if(node.type==='TEXT'&&fields.some(field=>field in node&&(node as any)[field]===figma.mixed))state.textSegments=node.getStyledTextSegments(['fontName','fontSize','lineHeight','letterSpacing','textStyleId','fills','fillStyleId','openTypeFeatures']);
 return JSON.stringify(state,(_key,value)=>typeof value==='symbol'?'figma.mixed':value);
}
