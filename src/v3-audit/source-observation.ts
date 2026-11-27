import {createCooperativeYield,designTraversalBudget,forEachWithConcurrency} from './utils/promisePool';
import {getDetachedLibraryComponentKey} from './services/detachedComponentSource';
const {nodeEvidence}=require('../document-audit/notification-proof');
const {readFailureReason}=require('../document-audit/protocol');
const MAX_CAPTURE_NOTIFICATION_CHANGES=512;
type Observation={node:BaseNode;value:string|null;fields:Set<string>;identity:string|null;main:ComponentNode|null;mainCaptured?:boolean;mainReadIssue?:string;children?:readonly SceneNode[];childNames?:readonly string[];visible?:boolean;text?:string};
type Impact=Map<string,ReadonlySet<string>|null>;
const contextFields=['id','type','removed','parent','visible','explicitVariableModes','resolvedVariableModes','componentProperties','variantProperties','key','remote','detachedInfo','mainComponent'];
type ObservationChange={reason:string;nodeId:string;fields:string[]};
const explicitModeContext=contextFields.filter(field=>field!=='resolvedVariableModes');
const typographyFields=explicitModeContext.concat([
 'textStyleId','characters','fontName','fontSize','fontWeight','lineHeight','letterSpacing','openTypeFeatures',
 'textCase','textDecoration','textAlignHorizontal','textAlignVertical','textAutoResize','textTruncation','maxLines',
 'paragraphSpacing','paragraphIndent','listSpacing','hangingPunctuation','hangingList','typographyBindings',
 'componentPropertyReferences','typographySegments',
]);
// Known bindings that do not control text or its visibility.
const nonTypographyBindings=new Set([
 'fills','textRangeFills','strokes','effects','layoutGrids','opacity',
 'width','height','minWidth','minHeight','maxWidth','maxHeight','itemSpacing','counterAxisSpacing',
 'paddingTop','paddingRight','paddingBottom','paddingLeft','gridRowGap','gridColumnGap',
 'cornerRadius','topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius',
 'strokeWeight','strokeTopWeight','strokeRightWeight','strokeBottomWeight','strokeLeftWeight',
]);
function observedFieldName(field:string){
 if(field==='typographyBindings')return 'boundVariables';
 if(field==='typographySegments')return 'textSegments';
 return field;
}
function bindingEvidence(value:any,field:string):unknown{
 if(field==='typographyBindings'){
  const bindings=value.boundVariables;
  if(!bindings||typeof bindings!=='object'||Array.isArray(bindings))return bindings;
  return Object.fromEntries(Object.entries(bindings).filter(([name])=>!nonTypographyBindings.has(name)));
 }
 if(field!=='typographySegments'||!Array.isArray(value.textSegments))return value[observedFieldName(field)];
 const ranges:{start:number;end:number;format:string}[]=[];
 for(const segment of value.textSegments){
  if(!segment||!Number.isSafeInteger(segment.start)||!Number.isSafeInteger(segment.end))return value.textSegments;
  const format=JSON.stringify(Object.entries(segment).filter(([name])=>!['start','end','characters','fills'].includes(name)));
  const last=ranges[ranges.length-1];
  if(last&&last.end===segment.start&&last.format===format)last.end=segment.end;
  else ranges.push({start:segment.start,end:segment.end,format});
 }
 return ranges;
}
export function actionSourceChanged(change?:ObservationChange){
 const actionChange=change&&{
  reason:change.reason,nodeId:change.nodeId.slice(0,200),fields:change.fields.slice(0,32).map(field=>field.slice(0,80)),
 };
 return Object.assign(Error('AUDIT_ACTION_SOURCE_CHANGED'),{actionChange});
}
export type AuditSceneSnapshot={
 getChildren(node:SceneNode):readonly SceneNode[];
 getChildNames(node:SceneNode):readonly string[];
 isVisible(node:SceneNode):boolean;
 getText(node:TextNode):string;
 getMainComponent(node:InstanceNode,readMain?:(node:InstanceNode)=>Promise<ComponentNode|null>):Promise<ComponentNode|null>;
 getMainComponentReadIssue?(nodeId:string):string|undefined;
 shouldSkipShared?(node:SceneNode):Promise<boolean>;
 prepareNodes?(nodes:readonly SceneNode[]):Promise<void>;
};

/** Notifications are redundant only after their native facts and instance ancestry agree. */
export function createV3SourceObservation(kind:'components'|'texts'='components'){
 const textOnly=kind==='texts',textRoots=new Set<string>();
 const nodes=new Map<string,Observation>();let ready=false,diagnostic:any=null;const queued:NodeChangeEvent[]=[];
 const excluded=new Set<string>();
 const hidden=new Set<string>();
 const rootIds=new Set<string>();
 let traversalCapture=false;
 let queuedChangeCount=0,captureNotificationsOverflow=false;
 const ownPaintChanges=new Map<string,Set<string>>();
 function refuse(reason:string,nodeId?:string,fields:string[]=[]){if(!diagnostic)diagnostic={reason,nodeId:nodeId?.slice(0,200),fields:fields.slice(0,32).map(field=>String(field).slice(0,80))};return false;}
 function textEvidence(node:BaseNode):Record<string,unknown>{
  const value:Record<string,unknown>={id:node.id,type:node.type,name:node.name,removed:!!node.removed,parent:node.parent?.id??null};
  if(node.removed||node.type==='PAGE'||node.type==='DOCUMENT')return value;
  if('visible'in node)value.visible=node.visible;
  if('opacity'in node)value.opacity=node.opacity;
  if(textRoots.has(node.id)&&'width'in node)value.width=node.width;
  if('children'in node)value.children=Array.from(node.children,child=>child.id);
  if(node.type==='TEXT'){value.characters=node.characters;value.autoRename=node.autoRename;value.componentPropertyReferences=node.componentPropertyReferences;}
  if(node.type==='INSTANCE')value.componentProperties=Object.entries(node.componentProperties).sort(([a],[b])=>a.localeCompare(b)).map(([key,property])=>[key,String(property.value)]);
  if(node.type==='COMPONENT'){value.key=node.key;value.variantProperties=Object.entries(node.variantProperties??{}).sort(([a],[b])=>a.localeCompare(b));}
  return value;
 }
 function read(node:BaseNode,children?:readonly SceneNode[]){try{const value=textOnly?textEvidence(node):nodeEvidence(node,children);return{value:JSON.stringify(value),fields:new Set<string>(Object.keys(value)),visible:typeof value.visible==='boolean'?value.visible:undefined,text:typeof value.characters==='string'?value.characters:undefined};}catch{return{value:null,fields:new Set<string>()};}}
 function childNames(node:BaseNode):readonly string[]{
  if(node.type==='PAGE'||node.type==='DOCUMENT'||!('children' in node))return [];
  return node.children.map(child=>child.name);
 }
 function observationChange(record:Observation,fields:readonly string[]|null=null):ObservationChange|null{
  const nodeId=record.node.id,current=read(record.node).value;
  if(record.value===null||current===null)return {reason:'node-unreadable',nodeId,fields:[]};
  if(current!==record.value){
   const before=JSON.parse(record.value),after=JSON.parse(current);
   const keys=fields??Array.from(new Set(Object.keys(before).concat(Object.keys(after))));
   const changed=keys.filter(field=>JSON.stringify(bindingEvidence(before,field))!==JSON.stringify(bindingEvidence(after,field))).map(observedFieldName);
   if(!fields||changed.length)return {reason:'observed-facts-changed',nodeId,fields:changed};
  }
  if(fields||!record.childNames)return null;
  try{
   const names=childNames(record.node),captured=record.childNames;
   if(names.length===captured.length&&names.every((name,index)=>name===captured[index]))return null;
   return {reason:'observed-facts-changed',nodeId,fields:['childNames']};
  }catch{return {reason:'node-unreadable',nodeId,fields:['childNames']};}
 }
 function stable(record:Observation){
  const change=observationChange(record);
  return change?refuse(change.reason,change.nodeId,change.fields):true;
 }
 function inspectMainComponent(main:ComponentNode|null,requireKey=false):{instance:{main:ComponentNode;identity:string}|null;issue?:string}{
  try{
   if(!main)return {instance:null,issue:'Figma вернула пустой ответ при чтении основного компонента.'};
   if(main.removed)return {instance:null,issue:'Основной компонент помечен в Figma как удалённый.'};
   const key=main.key;
   if(typeof key!=='string'||(requireKey&&!key.trim()))return {instance:null,issue:'У основного компонента Figma отсутствует ключ.'};
   if(!main.id||typeof main.remote!=='boolean')return {instance:null,issue:'Figma вернула неполные сведения об основном компоненте.'};
   const ancestry=[];let parent=main.parent;const seen=new Set<string>();
   while(parent&&!seen.has(parent.id)){seen.add(parent.id);ancestry.push({id:parent.id,type:parent.type,name:parent.name,key:'key'in parent?parent.key:null,remote:'remote'in parent?parent.remote:null});parent=parent.parent;}
   return {instance:{main,identity:JSON.stringify({id:main.id,key,name:main.name,type:main.type,remote:main.remote,ancestry})}};
  }catch(error){
   return {instance:null,issue:`Не удалось прочитать свойства основного компонента Figma (${readFailureReason(error)}).`};
  }
 }
 async function readInstance(node:InstanceNode){
  try{return inspectMainComponent(await node.getMainComponentAsync()).instance;}catch{return null;}
 }
 function assertNodeCurrent(id:string){
  const record=nodes.get(id);
  if(!record||!stable(record))throw Error('AUDIT_SOURCE_CHANGED');
 }
 function overridesOutsidePaint(value:unknown,nodeId:string,paint:string,style:string){
  if(!Array.isArray(value))return null;
  const rows=new Map<string,string[]>();
  for(const row of value){
   if(!row||typeof row.id!=='string'||!row.id||Object.keys(row).length!==2||rows.has(row.id))return null;
   const fields=row.overriddenFields;
   if(!Array.isArray(fields)||!fields.length||fields.some(field=>typeof field!=='string'||!field)||new Set(fields).size!==fields.length)return null;
   const retained=row.id===nodeId
    ? fields.filter(field=>field!==paint&&field!==style&&field!=='boundVariables')
    : fields.slice();
   rows.set(row.id,retained.sort());
  }
  return JSON.stringify(Array.from(rows).filter(([,fields])=>fields.length).sort(([a],[b])=>a.localeCompare(b)));
 }
 function recordPaintChange(id:string,field:'fill'|'stroke',preimage:string|undefined,gradientStop:boolean,variableCollectionId:string){
  const record=nodes.get(id),current=record&&read(record.node);
  if(!record?.value||!current?.value)throw Error('AUDIT_SOURCE_CHANGED');
  const paint=field==='fill'?'fills':'strokes';
  const style=field==='fill'?'fillStyleId':'strokeStyleId';
  const fields=new Set([paint,style,'boundVariables']);
  if(field==='fill'&&record.node.type==='TEXT')fields.add('textSegments');
  const before=JSON.parse(preimage??record.value),after=JSON.parse(current.value);
  const hasCollection=typeof variableCollectionId==='string'&&variableCollectionId;
  const beforeModes=before.resolvedVariableModes,afterModes=after.resolvedVariableModes;
  // A binding can expose the effective mode of its newly used collection.
  if(hasCollection&&
   beforeModes&&typeof beforeModes==='object'&&!Array.isArray(beforeModes)&&
   afterModes&&typeof afterModes==='object'&&!Array.isArray(afterModes)&&
   !Object.prototype.hasOwnProperty.call(beforeModes,variableCollectionId)&&
   Object.prototype.hasOwnProperty.call(afterModes,variableCollectionId)&&
   typeof afterModes[variableCollectionId]==='string'&&afterModes[variableCollectionId]&&
   Object.keys(afterModes).length===Object.keys(beforeModes).length+1&&
   Object.keys(beforeModes).every(key=>typeof beforeModes[key]==='string'&&beforeModes[key]&&beforeModes[key]===afterModes[key])){
   fields.add('resolvedVariableModes');
  }
  if(preimage&&hasCollection&&record.node.type==='INSTANCE'&&JSON.stringify(before.overrides)!==JSON.stringify(after.overrides)){
   // Figma records the write in the instance's direct overrides.
   const remaining=overridesOutsidePaint(after.overrides,id,paint,style);
   if(remaining!==null&&remaining===overridesOutsidePaint(before.overrides,id,paint,style)&&
    remaining===overridesOutsidePaint(JSON.parse(record.value).overrides,id,paint,style)){
    fields.add('overrides');
   }
  }
  const paintBindingFields=new Set([paint]);
  if(gradientStop&&field==='fill'&&record.node.type==='TEXT')paintBindingFields.add('textRangeFills');
  const otherBindings=(value:Record<string,unknown>|null)=>Object.entries(value||{}).filter(([key])=>!paintBindingFields.has(key));
  const changed=Array.from(new Set(Object.keys(before).concat(Object.keys(after)))).filter(key=>
   !fields.has(key)&&JSON.stringify(before[key])!==JSON.stringify(after[key]));
  if(JSON.stringify(otherBindings(before.boundVariables))!==JSON.stringify(otherBindings(after.boundVariables)))changed.push('boundVariables');
  if(changed.length){
   refuse('observed-facts-changed',id,changed);
   throw Error('AUDIT_SOURCE_CHANGED');
  }
  if(preimage){
   // Advance the snapshot only for the property Apollo wrote.
   const previous=JSON.parse(record.value);
   for(const key of fields)if(key!=='boundVariables'){
    if(Object.prototype.hasOwnProperty.call(after,key))previous[key]=after[key];
    else delete previous[key];
   }
   if(after.boundVariables&&typeof after.boundVariables==='object'){
    previous.boundVariables=Object.assign({},previous.boundVariables);
    for(const key of paintBindingFields){
     if(Object.prototype.hasOwnProperty.call(after.boundVariables,key))previous.boundVariables[key]=after.boundVariables[key];
     else delete previous.boundVariables[key];
    }
   }
   record.value=JSON.stringify(previous);
  }else record.value=current.value;
  record.fields=current.fields;
  for(const key of ownPaintChanges.get(id)??[])fields.add(key);
  ownPaintChanges.set(id,fields);
 }
 function recordTextChanges(changes:readonly {nodeId:string;text:string}[]){
  if(!textOnly)throw Error('AUDIT_ACTION_UNAVAILABLE');
  const updates=new Map<Observation,Record<string,any>>();
  const expected=(record:Observation)=>{if(!record.value)throw Error('AUDIT_SOURCE_CHANGED');let value=updates.get(record);if(!value){value=JSON.parse(record.value);updates.set(record,value!);}return value!;};
  for(const change of changes){
   const record=nodes.get(change.nodeId);
   if(!record||record.node.type!=='TEXT'||record.node.removed||record.node.characters!==change.text)throw Error('AUDIT_SOURCE_CHANGED');
   const before=JSON.parse(record.value||'null');if(!before||typeof before.characters!=='string')throw Error('AUDIT_SOURCE_CHANGED');
   const value=expected(record);value.characters=change.text;
   if(before.autoRename===true&&record.node.autoRename){
    value.name=record.node.name;
    const parent=record.node.parent&&nodes.get(record.node.parent.id);
    if(parent?.childNames&&'children'in parent.node){
     const index=parent.node.children.findIndex(child=>child.id===record.node.id);
     if(index<0||parent.childNames[index]!==before.name)throw Error('AUDIT_SOURCE_CHANGED');
     const names=Array.from(parent.childNames);names[index]=record.node.name;parent.childNames=names;
    }
   }
   const reference=before.componentPropertyReferences?.characters;
   if(typeof reference==='string')for(let parent=record.node.parent;parent&&parent.type!=='PAGE'&&parent.type!=='DOCUMENT';parent=parent.parent){
    if(parent.type!=='INSTANCE'||!Object.prototype.hasOwnProperty.call(parent.componentProperties,reference))continue;
    const owner=nodes.get(parent.id);if(!owner)throw Error('AUDIT_SOURCE_CHANGED');
    const properties=expected(owner).componentProperties as [string,string][];
    const property=properties.find(([key])=>key===reference),current=parent.componentProperties[reference];
    // Only the actual bound TEXT property may advance with the completed target.
    if(current.type==='TEXT'&&property&&property[1]===before.characters&&String(current.value)===change.text)property[1]=change.text;
    break;
   }
  }
  for(const [record,value]of updates){record.value=JSON.stringify(value);if(record.node.type==='TEXT')record.text=value.characters;}
 }
 function related(event:NodeChangeEvent):Map<Observation,boolean>|null{
  if(!event||!Array.isArray(event.nodeChanges)||!event.nodeChanges.length){refuse('notification-unavailable');return null;}
  const records=new Map<Observation,boolean>();
  for(const change of event.nodeChanges){
   const record=nodes.get(change.id);
   if(change.type!=='PROPERTY_CHANGE'){refuse('topology-notification',change.id);return null;}
   if(!record){refuse('outside-observation',change.id);return null;}
   if(!Array.isArray(change.properties)||!change.properties.length||!textOnly&&!change.properties.every(field=>record.fields.has(field))){refuse('unobserved-property',change.id,Array.isArray(change.properties)?change.properties:[]);return null;}
   const ownFields=ownPaintChanges.get(change.id);
   const ownPaint=Boolean(ownFields&&change.properties.every(field=>ownFields.has(field)));
   let node:BaseNode|null=record.node;const seen=new Set<string>();
   while(node&&!seen.has(node.id)){
    seen.add(node.id);
    const observed=nodes.get(node.id);
    if(!observed||!stable(observed))return null;
    records.set(observed,ownPaint&&records.get(observed)!==false);
    node=node.parent;
   }
  }
  return records;
 }
 async function unchanged(event:NodeChangeEvent,allowAsyncIdentity=false):Promise<boolean>{
  if(!ready){queued.push(event);return true;}
  if(traversalCapture&&event?.nodeChanges?.length){
   const nodeChanges=event.nodeChanges.filter(change=>!knownOutside(change)&&
    !(hidden.has(change.id)&&change.type==='PROPERTY_CHANGE'&&change.node&&!change.node.removed&&change.node.visible===false));
   if(!nodeChanges.length)return true;
   event=Object.assign({},event,{nodeChanges});
  }
  const records=related(event);if(!records)return false;
  for(const [record,ownPaint] of records)if(record.node.type==='INSTANCE'&&(!textOnly||record.mainCaptured)){
   // Limit post-write identity reads to the modified layer and its ancestors.
   if(!allowAsyncIdentity&&!ownPaint)return refuse('identity-unconfirmed',record.node.id);
   const current=(await readInstance(record.node))?.identity??null;
   if(record.identity===null||current===null)return refuse('identity-unavailable',record.node.id);
   if(current!==record.identity)return refuse('main-component-changed',record.node.id);
  }
  return Array.from(records.keys()).every(stable);
 }
 function knownOutside(change:NodeChange):boolean{
  if(!change.node||change.node.removed||nodes.has(change.id)||hidden.has(change.id)||excluded.has(change.id))return false;
  let node:BaseNode=change.node;
  while(node.type!=='DOCUMENT'&&node.type!=='PAGE'){
   if(node.id!==change.id&&(hidden.has(node.id)||excluded.has(node.id)))return true;
   if(rootIds.has(node.id))return false;
   const parent:BaseNode|null=node.parent;
   if(!parent)return false;
   node=parent;
  }
  return true;
 }
 function queueCaptureChange(event:NodeChangeEvent){
  if(captureNotificationsOverflow)return;
  queuedChangeCount+=Math.max(1,event?.nodeChanges?.length??0);
  if(queuedChangeCount>MAX_CAPTURE_NOTIFICATION_CHANGES){captureNotificationsOverflow=true;queued.length=0;return;}
  queued.push(event);
 }
 function finishCapture(guard:()=>void):Impact|null{
  ready=true;
  const result:Impact=new Map(),checked=new Set<string>();
  const events=queued.splice(0);
  if(captureNotificationsOverflow){refuse('notification-overflow');return null;}
  for(const event of events){
   if(!event?.nodeChanges?.length){refuse('notification-unavailable');return null;}
   for(const change of event.nodeChanges){
    guard();
    if(knownOutside(change)||hidden.has(change.id)&&change.type==='PROPERTY_CHANGE'&&change.node&&!change.node.removed&&change.node.visible===false)continue;
    const record=nodes.get(change.id);
    if(change.type!=='PROPERTY_CHANGE'){refuse('topology-notification',change.id);return null;}
    if(!record){refuse('outside-observation',change.id);return null;}
    if(!change.properties?.length||!change.properties.every(field=>record.fields.has(field))){
     refuse('unobserved-property',change.id,change.properties??[]);return null;
    }
    for(let node:BaseNode|null=record.node;node&&!checked.has(node.id);node=node.parent){
     guard();checked.add(node.id);
     const observed=nodes.get(node.id);
     const fields=observed&&readChangedFields(observed,true);
     if(!fields){refuse('node-unreadable',node.id);return null;}
     if(!fields.size)continue;
     refuse('observed-facts-changed',node.id,Array.from(fields));
     if(fields.has('parent')||fields.has('removed')||fields.has('children'))return null;
     result.set(node.id,fields);
    }
   }
  }
  guard();return result;
 }
 function readChangedFields(record:Observation,includeChildNames=false):Set<string>|null{
  const latest=read(record.node).value;
  if(!latest||!record.value)return null;
  const fields=new Set<string>();
  if(latest!==record.value){
   const before=JSON.parse(record.value),after=JSON.parse(latest);
   for(const name of new Set(Object.keys(before).concat(Object.keys(after)))){
    if(JSON.stringify(before[name])!==JSON.stringify(after[name]))fields.add(name);
   }
   if(record.node.type==='TEXT'){
    for(const field of ['typographyBindings','typographySegments']){
     if(fields.has(observedFieldName(field))&&JSON.stringify(bindingEvidence(before,field))!==JSON.stringify(bindingEvidence(after,field)))fields.add(field);
    }
   }
  }
  const capturedNames=record.childNames;
  if(includeChildNames&&capturedNames)try{
   const names=childNames(record.node);
   if(names.length!==capturedNames.length||names.some((name,index)=>name!==capturedNames[index]))fields.add('childNames');
  }catch{return null;}
  return fields;
 }
 async function impacts(event:NodeChangeEvent):Promise<Impact|null>{
  if(!event?.nodeChanges?.length)return null;
  const result:Impact=new Map();
  for(const change of event.nodeChanges){
   if(knownOutside(change))continue;
   const record=nodes.get(change.id);
   if(!record){
    if(hidden.has(change.id)&&change.node&&!change.node.removed&&change.node.visible===false)continue;
    return null;
   }
   if(change.type!=='PROPERTY_CHANGE'||!record.value){result.set(change.id,null);continue;}
   const fields=readChangedFields(record);
   if(!fields){result.set(change.id,null);continue;}
   for(const field of change.properties||[])if(!record.fields.has(field))fields.add(field);
   if(record.node.type==='INSTANCE'&&record.mainCaptured&&record.identity!==(await readInstance(record.node))?.identity)fields.add('mainComponent');
   if(fields.size&&result.get(change.id)!==null){
    for(const field of result.get(change.id)||[])fields.add(field);
    result.set(change.id,fields);
   }
  }
  return result;
 }
 function dependencies(targets:readonly string[],bindingField?:'fill'|'stroke'|'text',page?:PageNode){
  const records=new Map<Observation,readonly string[]|null>();
  if(page){
   const record=nodes.get(page.id);
   if(!record)return null;
   records.set(record,['id','type','removed','explicitVariableModes']);
  }
  for(const id of targets){
   const target=nodes.get(id);
   if(!target)return null;
   const typography=bindingField==='text'&&target.node.type==='TEXT';
   const paint=bindingField==='fill'||bindingField==='stroke';
   const resolvedModes=paint&&target.value?JSON.parse(target.value).resolvedVariableModes:null;
   const hasResolvedModes=resolvedModes&&typeof resolvedModes==='object'&&!Array.isArray(resolvedModes)&&
    Object.entries(resolvedModes).every(([id,mode])=>id&&id!=='$state'&&typeof mode==='string'&&mode.length>0);
   // Figma reports inherited effective modes on the paint consumer. Ancestors
   // still provide explicit modes and context, including when setting a mode.
   const context=typography||paint&&hasResolvedModes?explicitModeContext:contextFields;
   const fields=typography?typographyFields:paint?
    contextFields.concat(bindingField==='fill'?['fills','fillStyleId','textSegments']:['strokes','strokeStyleId']):null;
   const seen=new Set<string>();
   for(let node:BaseNode|null=target.node;node&&!seen.has(node.id);node=node.parent){
    seen.add(node.id);
    const record=nodes.get(node.id);
    if(!record)return null;
    if(node===target.node)records.set(record,fields);
    else if(!records.has(record)||context===contextFields&&records.get(record)===explicitModeContext){
     records.set(record,context);
    }
   }
  }
   function assertCurrent(){
   for(const [record,fields] of records){
    const change=observationChange(record,fields);
    if(change)throw actionSourceChanged(change);
   }
  }
  return {
   assertCurrent,
   async verify(guard:()=>void){
    guard();assertCurrent();
    const instances=Array.from(records.keys()).filter(record=>record.node.type==='INSTANCE');
    await forEachWithConcurrency(instances,8,async record=>{
     guard();
     const current=await readInstance(record.node as InstanceNode);guard();
     if(!current||current.identity!==record.identity){
      throw actionSourceChanged({reason:current?'main-component-changed':'identity-unavailable',nodeId:record.node.id,fields:['mainComponent']});
     }
    });
    guard();assertCurrent();
   },
   affectedBy(changes:Impact):ObservationChange|null{
    for(const [record,fields] of records){
     const nodeId=record.node.id,impact=changes.get(nodeId);
     if(impact===null)return {reason:'node-unreadable',nodeId,fields:[]};
     if(!impact)continue;
     const changed=fields?fields.filter(field=>impact.has(field)):Array.from(impact);
     if(changed.length)return {reason:'observed-facts-changed',nodeId,fields:Array.from(new Set(changed.map(observedFieldName)))};
    }
    return null;
   },
  };
 }
 function assertTextCurrent(guard:()=>void){
  if(!textOnly)throw Error('AUDIT_ACTION_UNAVAILABLE');
  for(const record of nodes.values()){guard();if(!stable(record))throw Error('AUDIT_SOURCE_CHANGED');}
  guard();
 }
 async function verify(guard:()=>void){
  const checkpoint=createCooperativeYield(guard);
  if(textOnly){
   const instances:Observation[]=[];
   for(const record of nodes.values()){
    await checkpoint();if(!stable(record))throw Error('AUDIT_SOURCE_CHANGED');
    if(record.mainCaptured)instances.push(record);
   }
   await forEachWithConcurrency(instances,8,async record=>{
    guard();const current=(await readInstance(record.node as InstanceNode))?.identity??null;guard();
    if(current!==record.identity){refuse('main-component-changed',record.node.id);throw Error('AUDIT_SOURCE_CHANGED');}
   });
   // Text can change during a native lookup before Figma delivers nodechange.
   assertTextCurrent(guard);return;
  }
  for(const record of nodes.values()){
   await checkpoint();if(record.value!==null&&!stable(record))throw Error('AUDIT_SOURCE_CHANGED');
   if(record.node.type==='INSTANCE'&&record.identity!==null){const current=(await readInstance(record.node))?.identity??null;guard();if(current!==record.identity){refuse(current===null?'identity-unavailable':'main-component-changed',record.node.id);throw Error('AUDIT_SOURCE_CHANGED');}}
  }
  guard();
 }
 const snapshot:AuditSceneSnapshot={
  getChildren(node){
   if(excluded.has(node.id))return [];
   const children=nodes.get(node.id)?.children??('children'in node?node.children:[]);
   return excluded.size?children.filter(child=>!excluded.has(child.id)):children;
  },
  getChildNames(node){
   const record=nodes.get(node.id);
   if(!record)throw Error('AUDIT_SOURCE_CHANGED');
   record.childNames??=childNames(node);
   return record.childNames;
  },
  isVisible(node){return !hidden.has(node.id)&&!excluded.has(node.id)&&(nodes.get(node.id)?.visible??node.visible!==false);},
  getText(node){return nodes.get(node.id)?.text??node.characters;},
  async getMainComponent(node,readMain){const record=nodes.get(node.id);if(record?.mainCaptured)return record.main;return record?.main??(readMain?readMain(node):node.getMainComponentAsync());},
  getMainComponentReadIssue(nodeId){return nodes.get(nodeId)?.mainReadIssue;},
 };
 return{
  unchanged,verify,snapshot,assertTextCurrent,assertNodeCurrent,recordPaintChange,recordTextChanges,queueCaptureChange,finishCapture,impacts,dependencies,diagnostic:()=>diagnostic,
  observedNode(id:string){return nodes.get(id)?.node;},
  paintPreimage(id:string){const node=nodes.get(id)?.node;return node?read(node).value:null;},
  async beginTraversal(roots:SceneNode[],guard:()=>void,isSharedKey?:(key:string)=>boolean,readMain?:(node:InstanceNode)=>Promise<ComponentNode|null>){
   traversalCapture=true;
   const checkpoint=createCooperativeYield(guard,undefined,designTraversalBudget);
   const readNativeMain=readMain??((node:InstanceNode)=>node.getMainComponentAsync());
   async function captureMain(node:InstanceNode):Promise<ReturnType<typeof inspectMainComponent>>{
    guard();
    let component:ComponentNode|null;
    try{ component=await readNativeMain(node); }
    catch{
     await checkpoint();
     guard();
     try{ component=await readNativeMain(node); }
     catch(error){
      guard();
      return {instance:null,issue:`getMainComponentAsync завершился ошибкой после повтора (${readFailureReason(error)}).`};
     }
    }
    guard();
    return inspectMainComponent(component,true);
   }
   const mainReads=new Map<string,ReturnType<typeof captureMain>>();
   function main(node:InstanceNode){
    let pending=mainReads.get(node.id);
    if(!pending){pending=captureMain(node);mainReads.set(node.id,pending);}
    return pending;
   }
   snapshot.shouldSkipShared=async node=>{
    if(!isSharedKey)return false;
    if(excluded.has(node.id))return true;
    const key=node.type==='INSTANCE'?(await main(node)).instance?.main.key:
     node.type==='COMPONENT'||node.type==='COMPONENT_SET'?node.key:getDetachedLibraryComponentKey(node);
    guard();
    if(key&&isSharedKey(key))excluded.add(node.id);
    return excluded.has(node.id);
   };
   async function capture(node:BaseNode){
    if(nodes.has(node.id))return;
    const children=node.type!=='PAGE'&&node.type!=='DOCUMENT'&&'children'in node?Array.from(node.children):undefined;
    const record:Observation=Object.assign({node,children,identity:null,main:null},read(node,children));
    nodes.set(node.id,record);
    if(node.type==='INSTANCE'){
     const {instance,issue}=await main(node);guard();
     record.main=instance?.main??null;record.identity=instance?.identity??null;
     record.mainReadIssue=issue;record.mainCaptured=true;
    }
   }
   const included:SceneNode[]=[];
   for(const root of roots){
    const lineage:BaseNode[]=[];
    for(let node:BaseNode|null=root;node;node=node.parent){await checkpoint();lineage.unshift(node);}
    let skip=false;
    for(const node of lineage){
     if(node.type!=='DOCUMENT'&&node.type!=='PAGE'&&await snapshot.shouldSkipShared(node as SceneNode)){skip=true;break;}
    }
    if(skip)continue;
    rootIds.add(root.id);included.push(root);
    for(const ancestor of lineage.slice(0,-1))await capture(ancestor);
   }
   if(!included.length&&roots.length)throw Error('AUDIT_SHARED_SCOPE_EXCLUDED');
   snapshot.prepareNodes=async candidates=>{
    await forEachWithConcurrency(candidates,8,async node=>{
     await checkpoint();
    if(node.visible===false){hidden.add(node.id);return;}
     if(!await snapshot.shouldSkipShared!(node))await capture(node);
    });
    guard();
   };
   return included;
  },
  async prepare(roots:SceneNode[],guard:()=>void,verifyBeforeUse=true,isSharedKey?:(key:string)=>boolean){
   if(textOnly)for(const root of roots)textRoots.add(root.id);
   const checkpoint=createCooperativeYield(guard),expanded=new Set<string>();
   const instances=new Map<string,Awaited<ReturnType<typeof readInstance>>>();
   let included=roots;
   if(!textOnly&&isSharedKey){
    const checked=new Set<string>();
    snapshot.shouldSkipShared=async(node:SceneNode)=>{
     if(checked.has(node.id))return excluded.has(node.id);
     guard();
     let key:string|null;
     if(node.type==='INSTANCE'){
      const instance=await readInstance(node);guard();
      instances.set(node.id,instance);
      key=instance?.main.key??null;
     }else{
      key=node.type==='COMPONENT'||node.type==='COMPONENT_SET'?node.key:getDetachedLibraryComponentKey(node);
     }
     checked.add(node.id);
     if(key&&isSharedKey(key))excluded.add(node.id);
     return excluded.has(node.id);
    };
    included=[];
    for(const root of roots){
     const ancestry:SceneNode[]=[];
     let parent:BaseNode|null=root;
     while(parent&&parent.type!=='PAGE'&&parent.type!=='DOCUMENT'){
      await checkpoint();
      ancestry.push(parent);
      parent=parent.parent;
     }
     while(ancestry.length&&!await snapshot.shouldSkipShared(ancestry[ancestry.length-1]))ancestry.pop();
     if(!ancestry.length)included.push(root);
    }
    if(!included.length&&roots.length)throw Error('AUDIT_SHARED_SCOPE_EXCLUDED');
   }
   const stack=included.map(node=>({node:node as BaseNode,descend:true}));
   while(stack.length){
    await checkpoint();const {node,descend}=stack.pop()!;
    if(node.type!=='PAGE'&&node.type!=='DOCUMENT'&&snapshot.shouldSkipShared&&await snapshot.shouldSkipShared(node))continue;
    let record=nodes.get(node.id);
    if(!record){record=Object.assign({node,identity:null,main:null},read(node));nodes.set(node.id,record);if(node.parent)stack.push({node:node.parent,descend:false});}
    if(descend&&!expanded.has(node.id)&&node.type!=='PAGE'&&node.type!=='DOCUMENT'&&'children'in node){
     expanded.add(node.id);
     try{
      const children=(node as unknown as ChildrenMixin).children;
      if(!verifyBeforeUse)record.children=Array.from(children);
      for(const child of record.children??children)stack.push({node:child,descend:true});
     }catch{record.value=null;}
    }
   }
   if(textOnly){
    const instances=new Set<InstanceNode>();
    for(const root of roots)if(root.type==='INSTANCE')instances.add(root);
    for(const record of nodes.values())if(record.node.type==='TEXT'){
     await checkpoint();
     for(let parent=record.node.parent;parent&&parent.type!=='PAGE'&&parent.type!=='DOCUMENT';parent=parent.parent){
      if(parent.type==='INSTANCE')instances.add(parent);
     }
    }
    await forEachWithConcurrency(Array.from(instances),8,async node=>{
     guard();const record=nodes.get(node.id)!;const instance=await readInstance(node);guard();
     record.main=instance?.main??null;record.identity=instance?.identity??null;record.mainCaptured=true;
    });
   }else for(const record of nodes.values())if(record.node.type==='INSTANCE'){
    await checkpoint();
    const instance=instances.has(record.node.id)?instances.get(record.node.id):await readInstance(record.node);
    guard();
    if(!verifyBeforeUse)record.main=instance?.main??null;
    record.identity=instance?.identity??null;
   }
   if(verifyBeforeUse)await verify(guard);
   ready=true;
   for(const event of queued)if(!await unchanged(event,true))throw Error('AUDIT_SOURCE_CHANGED');
   queued.length=0;guard();return included;
  },
 };
}
