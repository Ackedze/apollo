import { observeDeclaredNativeProperties, type DeclaredDiagnosticProperty } from "./properties";
import type { NativeDiagnosticObserver } from "./observer";
import { captureSceneTopology } from "../../../packages/component-contract-core/src/capture-topology";
import { captureInstanceSourceIdentities } from "../../../packages/component-contract-core/src/instance-source-identity";
import { createCompositionPlan, preflightPlan, validateScreenSpec } from "../../../packages/generation-core/src/planning";
import type { GenerationContext, Hash, ScreenSpec } from "../../../packages/generation-core/src/planning";
export type DiagnosticRecipe = {
 mappingId:string; componentId:string; platform:string;
 source:{revision:number;archiveSha256:string;manualSourceHash:string;compiledHash:string;factsHash:string;sourceStatus:string};
 representation:{componentKey:string;componentSetKey:string|null};
 definition:{selectedVariants:Array<{componentKey:string;properties:Record<string,string>}>};
 slot:{targetId:string;propertyIdentity:string;sourceNodeId:string|null}|null;
 actions:{occurrences:Array<{targetId:string;componentSetKey:string;sourceAddresses:Array<{variantKey:string;sourceNodeId:string;symbolId:null}>;properties:Array<{property:string;propertyType:string}>}>}|null;
};
export type DiagnosticInputs = {version:1;scope:string;producer:{currentRegistryDigest:string;currentInputsDigest:string;basisRegistryDigest:string;lockHash:string};recipes:DiagnosticRecipe[];probeSpec:ScreenSpec;runtimeSha256:string;recipeHash:string;buildRecipeSha256:string;typingsVersion:string;accepted:false};
type ReadApi = Pick<PluginAPI,'currentPage'> & Partial<Pick<PluginAPI,'fileKey'>>;
const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
function fail(code:string):never {throw new Error(code);}
function children(node:SceneNode,limit=128){
 try{const list='children' in node?Array.from(node.children):[];return{nodes:list.slice(0,limit),complete:list.length<=limit,total:list.length};}
 catch{return{nodes:[] as SceneNode[],complete:false,total:null};}
}
async function definition(node:SceneNode):Promise<ComponentNode|null>{
 if(node.removed)return null;
 return node.type==='COMPONENT'?node:node.type==='INSTANCE'?await node.getMainComponentAsync():null;
}
function slotRef(node:SceneNode):string|null{
 // Official guide documents this read; published declaration still omits it.
 const value:unknown=node.componentPropertyReferences;
 return record(value)&&typeof value.slotContentId==='string'&&value.slotContentId.length>0?value.slotContentId:null;
}
function presence(node:unknown,key:string):boolean|null {try{return record(node)?typeof node[key]==='function':null;}catch{return null;}}
function observedLimits(node:SlotNode):string[]|null {try{const limits:unknown=node.limitViolations;return Array.isArray(limits)&&limits.every(v=>['BELOW_MIN','ABOVE_MAX','HAS_NON_PREFERRED'].includes(v))?Array.from(limits):null;}catch{return null;}}
function effectiveVisible(node:SceneNode){let n:BaseNode|null=node;let depth=0;while(n&&depth++<128){if('visible' in n&&!n.visible)return false;n=n.parent;}return n===null?true:null;}

function rawSourceJson(value:unknown):unknown{
 try{
  const encoded=JSON.stringify(value,(_key,v)=>{if(v===undefined||typeof v==='function'||typeof v==='symbol'||typeof v==='bigint'||typeof v==='number'&&!Number.isFinite(v))fail('NATIVE_DIAGNOSTIC_SOURCE_RAW_UNAVAILABLE');return v;});
  if(typeof encoded!=='string'||encoded.length>65536)fail('NATIVE_DIAGNOSTIC_SOURCE_RAW_UNAVAILABLE');
  return JSON.parse(encoded);
 }catch{fail('NATIVE_DIAGNOSTIC_SOURCE_RAW_UNAVAILABLE');}
}
function componentPropertyOwner(component:ComponentNode){
 const parent=component.parent,owner=parent?.type==='COMPONENT_SET'?parent:component;
 if(owner.removed||owner.remote!==false)fail('NATIVE_DIAGNOSTIC_SOURCE_PROPERTY_OWNER_UNKNOWN');
 return owner;
}
function captureOriginalSlotSource(api:ReadApi,owner:ComponentNode,slot:SlotNode,property:string,sourceEpoch:number,revision:number){
 if(owner.remote!==false||owner.removed||slot.removed||slot.parent!==owner)fail('NATIVE_DIAGNOSTIC_SOURCE_OWNER_UNKNOWN');
 const direct=children(owner),content=children(slot),limits=observedLimits(slot);
 if(!direct.complete||!content.complete||limits===null||new Set(direct.nodes.map(n=>n.id)).size!==direct.nodes.length
  ||new Set(content.nodes.map(n=>n.id)).size!==content.nodes.length||direct.nodes.some(n=>n.parent!==owner||n.removed)
  ||content.nodes.some(n=>n.parent!==slot||n.removed))fail('NATIVE_DIAGNOSTIC_SOURCE_CONTENT_INCOMPLETE');
 const matches=direct.nodes.filter(n=>n.type==='SLOT'&&slotRef(n)===property);
 if(matches.length!==1||matches[0]!==slot)fail('NATIVE_DIAGNOSTIC_SOURCE_SLOT_AMBIGUOUS');
 const propertyOwner=componentPropertyOwner(owner),definition=propertyOwner.componentPropertyDefinitions[property];
 if(!definition||definition.type!=='SLOT')fail('NATIVE_DIAGNOSTIC_SOURCE_PROPERTY_UNKNOWN');
 const hasSettings=Object.prototype.hasOwnProperty.call(definition,'slotSettings');
 const refs:unknown=slot.componentPropertyReferences;
 if(!record(refs)||refs.slotContentId!==property)fail('NATIVE_DIAGNOSTIC_SOURCE_PROPERTY_UNKNOWN');
 const chain:Array<{id:string;type:string;parentId:string|null}>=[],seen=new Set<string>();
 let ancestor:BaseNode|null=owner,pageObserved=false;
 while(ancestor&&chain.length<128){if(ancestor.removed||seen.has(ancestor.id))fail('NATIVE_DIAGNOSTIC_SOURCE_CHAIN_INCOMPLETE');if(ancestor.type==='PAGE'){if(ancestor!==api.currentPage)fail('NATIVE_DIAGNOSTIC_SOURCE_PAGE_FOREIGN');pageObserved=true;}seen.add(ancestor.id);chain.push({id:ancestor.id,type:ancestor.type,parentId:ancestor.parent?.id||null});ancestor=ancestor.parent;}
 if(ancestor||!pageObserved||chain[chain.length-1]?.type!=='DOCUMENT')fail('NATIVE_DIAGNOSTIC_SOURCE_CHAIN_INCOMPLETE');
 let fileKey:string|null=null,fileRead:'observed'|'unknown'='unknown';
 try{const value=api.fileKey;if(typeof value==='string'&&value.length>0){fileKey=value;fileRead='observed';}}catch{ /* Current API may withhold fileKey; no config changes. */ }
 const expectedFileKey=owner.key==='a8d13cb6e1ae67a7296709f669238f41971c7197'&&property==='[D] Body#135096:3'?'NrzEFUSTXgzOUmsfYym0xD':null;
 if(expectedFileKey&&fileKey!==null&&fileKey!==expectedFileKey)fail('NATIVE_DIAGNOSTIC_SOURCE_FILE_FOREIGN');
 return {kind:'original-component-slot-readonly-observation',accepted:false,acceptedWriteOperations:[],mutationPerformed:false,methodsExecuted:false,
  sourceEpoch:{observerEpoch:sourceEpoch,diagnosticRevision:revision,pageId:api.currentPage.id,scope:'current-page observer and before/after raw snapshots'},
  fileContext:{fileKey,readStatus:fileRead,expectedFileKey,identityAcceptance:'unknown'},
  component:{id:owner.id,type:owner.type,key:owner.key,remote:owner.remote,parentId:owner.parent?.id||null},
  propertyOwner:{id:propertyOwner.id,type:propertyOwner.type,key:propertyOwner.key,remote:propertyOwner.remote,parentId:propertyOwner.parent?.id||null,componentId:owner.id,relation:propertyOwner===owner?'self':'parent-component-set',identityAcceptance:'unknown'},
  propertyIdentity:property,rawPropertyDefinition:rawSourceJson(definition),rawOwnerComponentPropertyReferences:rawSourceJson(owner.componentPropertyReferences),
  slotSettings:{readStatus:hasSettings?'observed':'absent',value:hasSettings?rawSourceJson(definition.slotSettings):null},
  ownerChain:chain,ownerChainComplete:true,directChildren:direct.nodes.map(n=>({id:n.id,type:n.type,parentId:n.parent?.id||null})),directChildrenComplete:true,
  slot:{nodeId:slot.id,type:slot.type,parentId:slot.parent.id,rawComponentPropertyReferences:rawSourceJson(refs),
   directContent:content.nodes.map(n=>({id:n.id,type:n.type,parentId:n.parent?.id||null})),directContentComplete:true,limitViolations:limits},
  canonicalSourceIdentity:null,importedDefinitionEquivalence:'unknown',writerAcceptance:'not-run',live:'not-run',Ready:false};
}

export function createNativeDiagnostic(options:{api:ReadApi;hash:Hash;inputs:DiagnosticInputs|null;buildInputsSha256:string;readContext(spec:ScreenSpec):Promise<GenerationContext>;epoch():number;observer?():NativeDiagnosticObserver}){
 let active=false,revision=0;
 function invalidate(){revision++;}
 async function run(spec:unknown=null){
  if(active)throw Error('NATIVE_DIAGNOSTIC_BUSY');active=true;
  const report:{[key:string]:unknown}={schemaVersion:'apollo.native-diagnostic-report.v2',status:'incomplete',provenance:'observed-not-accepted',read:'not-run',userNativeRead:'not-run',mutation:'not-run',runtimeCapability:'unknown',live:'not-run',acceptance:'not-run',acceptedBindings:'missing',primitivePolicy:'missing',observations:[],diagnostics:[],pins:null};
  const issues:string[]=[],start=revision,epoch=options.epoch();let subject:SceneNode|null=null,page:PageNode|null=null;
  const assertCurrent=()=>{if(start!==revision||epoch!==options.epoch()||!page||page.removed||options.api.currentPage.id!==page.id||!subject||subject.removed||options.api.currentPage.selection.length!==1||options.api.currentPage.selection[0]!==subject)fail('NATIVE_DIAGNOSTIC_STALE');};
  const observer=options.observer?.()||{status:'unknown',scope:'current-page-nodechange',pageId:null,coverage:'page-node-events-only',otherPages:'not-observed',styles:'not-observed',cleanup:'unknown'};
  if(observer.status!=='available')issues.push('NATIVE_DIAGNOSTIC_CHANGE_OBSERVER_UNAVAILABLE');
  report.changeObserver=observer;
  try{
   const inputs=options.inputs;if(!inputs||inputs.version!==1||inputs.accepted!==false||options.hash(inputs.recipes)!==inputs.recipeHash)fail('NATIVE_DIAGNOSTIC_INPUTS_UNAVAILABLE');
   page=options.api.currentPage;
   if(page.selection.length!==1)fail('NATIVE_DIAGNOSTIC_SELECT_ONE');subject=page.selection[0];assertCurrent();report.selection={pageId:page.id,nodeId:subject.id,type:subject.type};
   if(spec!==null&&validateScreenSpec(spec).length)fail('NATIVE_DIAGNOSTIC_SPEC_INVALID');
   const planSpec=spec===null?null:JSON.parse(JSON.stringify(spec));
   const fresh=async()=>{
    const context=await options.readContext(inputs.probeSpec);assertCurrent();
    const source=context.registry.source,pi=source?.producerInputs,o=context.producerObservation?.inputObservation;
    if(!source||!pi||!o||source.digest!==inputs.producer.currentRegistryDigest||source.lockHash!==inputs.producer.lockHash||pi.basisRegistryDigest!==inputs.producer.basisRegistryDigest||pi.currentInputsDigest!==inputs.producer.currentInputsDigest||options.hash(pi.currentInputs)!==inputs.producer.currentInputsDigest||o.currentInputsDigest!==inputs.producer.currentInputsDigest||o.currentRegistryDigest!==inputs.producer.currentRegistryDigest||o.proofScope!=='source-api-freshness-only'||o.acceptance!=='not-run'||context.view.lock.runtime.runtimeSha256!==inputs.runtimeSha256||context.view.lock.runtime.buildInputsSha256!==options.buildInputsSha256)fail('NATIVE_DIAGNOSTIC_INPUTS_STALE');
    const plan=createCompositionPlan(inputs.probeSpec,context,options.hash),preflight=preflightPlan(plan,context,options.hash);
    if(preflight.sourceReadiness!=='ready'||preflight.apiAvailability!=='confirmed')fail('NATIVE_DIAGNOSTIC_CONTEXT_UNCONFIRMED');
    return{context,planHash:options.hash(plan),targets:preflight.targets};
   };
   const first=await fresh();
   report.pins={producer:inputs.producer,recipeHash:inputs.recipeHash,runtime:first.context.view.lock.runtime,buildRecipeSha256:inputs.buildRecipeSha256,typingsVersion:inputs.typingsVersion,sourceFreshness:'confirmed-source-api-only',contextPlanHash:first.planHash,contextTargets:first.targets,productSpecHash:planSpec===null?null:options.hash(planSpec),productPlanAcceptance:'not-run'};
   const main=await definition(subject);assertCurrent();
   if(!main||main.removed)fail(subject.type==='COMPONENT_SET'?'NATIVE_DIAGNOSTIC_SELECT_VARIANT':'NATIVE_DIAGNOSTIC_MAIN_UNKNOWN');
   const setKey=main.parent?.type==='COMPONENT_SET'?main.parent.key:null;
   const matches=inputs.recipes.filter(r=>r.representation.componentKey===main.key||r.representation.componentSetKey&&r.representation.componentSetKey===setKey);
   if(matches.length!==1)fail('NATIVE_DIAGNOSTIC_IDENTITY_UNKNOWN');const recipe=matches[0];
   if(recipe.actions&&!recipe.definition.selectedVariants.some(v=>v.componentKey===main.key&&options.hash(v.properties)===options.hash(main.variantProperties)))fail('NATIVE_DIAGNOSTIC_VARIANT_UNKNOWN');
   const topology=captureSceneTopology(subject,128,(entry,index)=>index>0&&(entry.type==='SLOT'||entry.type==='INSTANCE'));
   if(!topology.complete)issues.push('NATIVE_DIAGNOSTIC_TOPOLOGY_PARTIAL');
   const correspondence=subject.type==='INSTANCE'&&topology.complete?captureInstanceSourceIdentities(topology.entries,new Map([[subject.id,main]]),new Map(),true):new Map();
   const observation:{[key:string]:unknown}={mappingId:recipe.mappingId,source:recipe.source,nodeId:subject.id,type:subject.type,mainComponent:{id:main.id,key:main.key,componentSetKey:setKey,remote:main.remote},bindingAcceptance:'not-run',sourceEquivalence:'unknown'};
   const selected=subject;let readOriginalSource:(()=>ReturnType<typeof captureOriginalSlotSource>)|null=null,originalSourceHash:string|null=null;
   const declaredProperties:DeclaredDiagnosticProperty[]=recipe.actions?recipe.actions.occurrences.reduce<DeclaredDiagnosticProperty[]>((all,o)=>all.concat(o.properties),[]):[];
   const propertyBaseline=(node:SceneNode)=>node.type!=='INSTANCE'?null:recipe.actions?observeDeclaredNativeProperties(node,declaredProperties):node.componentProperties;
   const base=children(selected),baseline=()=>options.hash({nodes:children(selected).nodes.map(n=>({id:n.id,type:n.type,visible:n.visible,ref:slotRef(n),props:propertyBaseline(n),children:n.type==='SLOT'?children(n).nodes.map(c=>({id:c.id,type:c.type})):null})),ownerProps:propertyBaseline(selected),ownerVisible:effectiveVisible(selected),ownerParent:selected.parent?.id||null,mainRemoved:main.removed,mainKey:main.key,mainSet:main.parent?.type==='COMPONENT_SET'?main.parent.key:null,mainChildren:children(main).nodes.map(n=>({id:n.id,type:n.type,ref:slotRef(n)})),variant:main.variantProperties});
   if(!base.complete)issues.push('NATIVE_DIAGNOSTIC_CHILDREN_OMITTED');const before=baseline();const mainIdentity=options.hash({id:main.id,key:main.key,set:setKey,variant:main.variantProperties,remote:main.remote});
   const ownedDefinitions:Array<{node:SceneNode;identity:string|null}>=[];
   const definitionHash=(node:ComponentNode|null)=>node&&!node.removed?options.hash({id:node.id,key:node.key,set:node.parent?.type==='COMPONENT_SET'?node.parent.key:null,remote:node.remote}):null;
   if(recipe.slot){
    const property=recipe.slot.propertyIdentity,candidates=base.nodes.filter(n=>n.type==='SLOT'&&slotRef(n)===property);
    const defined=children(main),references=defined.nodes.filter(n=>n.type==='SLOT'&&slotRef(n)===property);
    const propertyType=subject.type==='INSTANCE'?subject.componentProperties[property]?.type:componentPropertyOwner(main).componentPropertyDefinitions[property]?.type;
    if(!base.complete||!defined.complete||candidates.length!==1||references.length!==1||references[0].parent!==main||propertyType!=='SLOT')fail('NATIVE_DIAGNOSTIC_SLOT_IDENTITY_UNKNOWN');
    const slot=candidates[0];if(slot.type!=='SLOT'||slot.parent!==subject)fail('NATIVE_DIAGNOSTIC_SLOT_IDENTITY_UNKNOWN');
    const content=children(slot);if(!content.complete)issues.push('NATIVE_DIAGNOSTIC_SLOT_CONTENT_OMITTED');
    const ids=content.nodes.map(n=>n.id);const contentComplete=content.complete&&new Set(ids).size===ids.length;if(new Set(ids).size!==ids.length)issues.push('NATIVE_DIAGNOSTIC_SLOT_DUPLICATE');
    const limits=observedLimits(slot);if(limits===null)issues.push('NATIVE_DIAGNOSTIC_LIMITS_UNKNOWN');
    observation.slot={targetId:recipe.slot.targetId,propertyIdentity:property,nodeId:slot.id,observedDefinitionNodeId:references[0].id,declaredSourceNodeId:recipe.slot.sourceNodeId,canonicalSourceIdentity:correspondence.get(slot.id)||null,identityProvenance:'observed-not-accepted',content:{complete:contentComplete,omitted:!contentComplete,total:content.total,children:content.nodes.map(n=>({id:n.id,type:n.type,mapping:'unknown'})),emptyObserved:contentComplete?ids.length===0:null,order:'observed-only',planOrderMatch:'unknown'},methods:{appendChild:presence(slot,'appendChild'),insertChild:presence(slot,'insertChild'),resetSlot:presence(slot,'resetSlot'),executed:false},limitViolations:limits};
    if(subject.type==='COMPONENT'){
     const original=subject;
     readOriginalSource=()=>{if(observer.status!=='available'||observer.scope!=='current-page-nodechange'||observer.pageId!==options.api.currentPage.id||options.hash(options.observer?.()||null)!==options.hash(observer))fail('NATIVE_DIAGNOSTIC_SOURCE_OBSERVER_UNAVAILABLE');return captureOriginalSlotSource(options.api,original,slot,property,options.epoch(),revision);};
     const snapshot=readOriginalSource();originalSourceHash=options.hash(snapshot);observation.originalSource=snapshot;
     if(snapshot.fileContext.readStatus!=='observed')issues.push('NATIVE_DIAGNOSTIC_SOURCE_FILE_CONTEXT_UNKNOWN');
    }
    issues.push('NATIVE_DIAGNOSTIC_CANONICAL_SLOT_RECEIPT_MISSING');
    if(ids.length)issues.push('NATIVE_DIAGNOSTIC_PAYLOAD_MAPPING_UNKNOWN');
   }
   if(recipe.actions){
    const owned:Array<{targetId:string|null;[key:string]:unknown}>=[];for(const node of base.nodes.filter(n=>n.type==='INSTANCE')){
     const childMain=await definition(node);assertCurrent();
     ownedDefinitions.push({node,identity:definitionHash(childMain)});
     const identity=topology.complete&&subject.type==='COMPONENT'&&!main.remote?{sourceNodeId:node.id}:correspondence.get(node.id);
     const occurrence=identity?recipe.actions.occurrences.filter(o=>o.sourceAddresses.some(a=>a.variantKey===main.key&&a.sourceNodeId===identity.sourceNodeId)):[];
     const childSet=childMain?.parent?.type==='COMPONENT_SET'?childMain.parent.key:null;
     const matched=node.parent===subject&&occurrence.length===1&&childSet===occurrence[0].componentSetKey;
     const rawProperties=observeDeclaredNativeProperties(node,declaredProperties);
     const values=matched?occurrence[0].properties.map(p=>{const field=rawProperties.fields.find(f=>f.property===p.property);return{property:p.property,expectedType:p.propertyType,observed:field?.readStatus==='observed'&&field.valueStatus==='observed'?field.observed:null};}):[];
     if(!rawProperties.queryComplete||!rawProperties.valuesComplete||!rawProperties.typesMatch)issues.push('NATIVE_DIAGNOSTIC_OWNED_RAW_PROPERTIES_INCOMPLETE');
     if(!matched)issues.push('NATIVE_DIAGNOSTIC_OWNED_CORRESPONDENCE_UNKNOWN');
     if(values.some(p=>!p.observed||p.observed.type!==p.expectedType))issues.push('NATIVE_DIAGNOSTIC_OWNED_PROPERTY_UNKNOWN');
     owned.push({nodeId:node.id,targetId:matched?occurrence[0].targetId:null,sourceIdentity:identity||null,mainComponent:childMain?{id:childMain.id,key:childMain.key,componentSetKey:childSet}:null,symbolId:null,effectiveVisible:effectiveVisible(node),properties:values,rawProperties,methods:{setProperties:node.type==='INSTANCE'&&typeof node.setProperties==='function',executed:false},provenance:'observed-not-accepted'});
    }
    const unresolvedTargetIds=recipe.actions.occurrences.filter(o=>owned.filter(n=>n.targetId===o.targetId).length!==1).map(o=>o.targetId);
    if(unresolvedTargetIds.length||!base.complete||!topology.complete)issues.push('NATIVE_DIAGNOSTIC_OWNED_MEMBERSHIP_UNKNOWN');
    observation.owned={complete:base.complete,expectedOccurrencesComplete:base.complete&&topology.complete&&unresolvedTargetIds.length===0,unresolvedTargetIds,children:owned,order:'observed-source-order',canonicalProjection:'not-run',symbolProof:'unknown'};
    issues.push('NATIVE_DIAGNOSTIC_SYMBOL_RECIPE_RECEIPT_MISSING');
   }
   assertCurrent();if(before!==baseline())fail('NATIVE_DIAGNOSTIC_CAPTURE_CHANGED');
   const final=await fresh();if(options.hash(first)!==options.hash(final))fail('NATIVE_DIAGNOSTIC_INPUTS_STALE');
   const latest=await definition(selected);assertCurrent();if(!latest||latest.removed||options.hash({id:latest.id,key:latest.key,set:latest.parent?.type==='COMPONENT_SET'?latest.parent.key:null,variant:latest.variantProperties,remote:latest.remote})!==mainIdentity||before!==baseline())fail('NATIVE_DIAGNOSTIC_CAPTURE_CHANGED');
   for(const item of ownedDefinitions){const current=await definition(item.node);assertCurrent();if(item.node.removed||definitionHash(current)!==item.identity)fail('NATIVE_DIAGNOSTIC_CAPTURE_CHANGED');}
   assertCurrent();if(before!==baseline()||readOriginalSource&&options.hash(readOriginalSource())!==originalSourceHash)fail('NATIVE_DIAGNOSTIC_CAPTURE_CHANGED');
   assertCurrent();
   report.userNativeRead='observed';report.read='observed';report.observations=[observation];report.selection={pageId:page.id,nodeId:subject.id};
  }catch(error){issues.push(error instanceof Error&&/^NATIVE_DIAGNOSTIC_[A-Z_]+$/.test(error.message)?error.message:'NATIVE_DIAGNOSTIC_READ_UNAVAILABLE');report.observations=[];}
  finally{active=false;}
  report.diagnostics=Array.from(new Set(issues));report.status=issues.length?'incomplete':'observed';report.reportHash=options.hash(report);return report;
 }
 return{run,invalidate};
}
