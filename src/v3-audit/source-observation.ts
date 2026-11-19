import {createCooperativeYield,forEachWithConcurrency} from './utils/promisePool';
import {getDetachedLibraryComponentKey} from './services/detachedComponentSource';
const {nodeEvidence}=require('../document-audit/notification-proof');
type Observation={node:BaseNode;value:string|null;fields:Set<string>;identity:string|null;main:ComponentNode|null;mainCaptured?:boolean;children?:readonly SceneNode[];childNames?:readonly string[];visible?:boolean;text?:string};
type Impact=Map<string,ReadonlySet<string>|null>;
const contextFields=['id','type','removed','parent','visible','explicitVariableModes','resolvedVariableModes','componentProperties','variantProperties','key','remote','detachedInfo','mainComponent'];
export type AuditSceneSnapshot={
 getChildren(node:SceneNode):readonly SceneNode[];
 getChildNames(node:SceneNode):readonly string[];
 isVisible(node:SceneNode):boolean;
 getText(node:TextNode):string;
 getMainComponent(node:InstanceNode,readMain?:(node:InstanceNode)=>Promise<ComponentNode|null>):Promise<ComponentNode|null>;
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
 function stable(record:Observation){
  const current=read(record.node).value;
  if(record.value===null||current===null)return refuse('node-unreadable',record.node.id);
  if(current===record.value){
   const captured=record.childNames;
   if(!captured)return true;
   try{
    const names=childNames(record.node);
    if(names.length===captured.length&&names.every((name,index)=>name===captured[index]))return true;
    return refuse('observed-facts-changed',record.node.id,['childNames']);
   }catch{return refuse('node-unreadable',record.node.id,['childNames']);}
  }
  const before=JSON.parse(record.value),after=JSON.parse(current),fields=Array.from(new Set(Object.keys(before).concat(Object.keys(after)))).filter(field=>JSON.stringify(before[field])!==JSON.stringify(after[field]));
  return refuse('observed-facts-changed',record.node.id,fields);
 }
 async function readInstance(node:InstanceNode,readMain=(node:InstanceNode)=>node.getMainComponentAsync()){
  try{
   const main=await readMain(node);
   if(!main||main.removed||!main.id||typeof main.key!=='string'||typeof main.remote!=='boolean')return null;
   const ancestry=[];let parent=main.parent;const seen=new Set<string>();
   while(parent&&!seen.has(parent.id)){seen.add(parent.id);ancestry.push({id:parent.id,type:parent.type,name:parent.name,key:'key'in parent?parent.key:null,remote:'remote'in parent?parent.remote:null});parent=parent.parent;}
   return {main,identity:JSON.stringify({id:main.id,key:main.key,name:main.name,type:main.type,remote:main.remote,ancestry})};
  }catch{return null;}
 }
 function assertNodeCurrent(id:string){
  const record=nodes.get(id);
  if(!record||!stable(record))throw Error('AUDIT_SOURCE_CHANGED');
 }
 function recordPaintChange(id:string,field:'fill'|'stroke',preimage?:string){
  const record=nodes.get(id),current=record&&read(record.node);
  if(!record?.value||!current?.value)throw Error('AUDIT_SOURCE_CHANGED');
  const paint=field==='fill'?'fills':'strokes';
  const style=field==='fill'?'fillStyleId':'strokeStyleId';
  const fields=new Set([paint,style,'boundVariables']);
  if(field==='fill'&&record.node.type==='TEXT')fields.add('textSegments');
  const before=JSON.parse(preimage??record.value),after=JSON.parse(current.value);
  const otherBindings=(value:Record<string,unknown>|null)=>Object.entries(value||{}).filter(([key])=>key!==paint);
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
    if(Object.prototype.hasOwnProperty.call(after.boundVariables,paint))previous.boundVariables[paint]=after.boundVariables[paint];
    else delete previous.boundVariables[paint];
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
 async function finishCapture(guard:()=>void){
  ready=true;
  for(const event of queued){
   guard();
   if(!await unchanged(event,true))throw Error('AUDIT_SOURCE_CHANGED');
  }
  queued.length=0;
  guard();
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
   const latest=read(record.node).value;
   if(!latest){result.set(change.id,null);continue;}
   const before=JSON.parse(record.value),after=JSON.parse(latest);
   const fields=new Set(Array.from(new Set(Object.keys(before).concat(Object.keys(after))))
    .filter(name=>JSON.stringify(before[name])!==JSON.stringify(after[name])));
   for(const field of change.properties||[])if(!record.fields.has(field))fields.add(field);
   if(record.node.type==='INSTANCE'&&record.mainCaptured&&record.identity!==(await readInstance(record.node))?.identity)fields.add('mainComponent');
   if(fields.size&&result.get(change.id)!==null){
    for(const field of result.get(change.id)||[])fields.add(field);
    result.set(change.id,fields);
   }
  }
  return result;
 }
 function dependencies(targets:readonly string[],paintField?:'fill'|'stroke',page?:PageNode){
  const records=new Map<Observation,readonly string[]|null>();
  if(page){
   const record=nodes.get(page.id);
   if(!record)return null;
   records.set(record,['id','type','removed','explicitVariableModes']);
  }
  for(const id of targets){
   const target=nodes.get(id);
   if(!target)return null;
   const fields=paintField?contextFields.concat(paintField==='fill'?['fills','fillStyleId','textSegments']:['strokes','strokeStyleId']):null;
   const seen=new Set<string>();
   for(let node:BaseNode|null=target.node;node&&!seen.has(node.id);node=node.parent){
    seen.add(node.id);
    const record=nodes.get(node.id);
    if(!record)return null;
    if(node===target.node||!records.has(record))records.set(record,node===target.node?fields:contextFields);
   }
  }
  function assertCurrent(){
   for(const [record,fields] of records){
    const latest=read(record.node).value;
    if(!latest||!record.value)throw Error('AUDIT_ACTION_SOURCE_CHANGED');
    if(!fields){if(!stable(record))throw Error('AUDIT_ACTION_SOURCE_CHANGED');continue;}
    const before=JSON.parse(record.value),after=JSON.parse(latest);
    if(fields.some(field=>JSON.stringify(before[field])!==JSON.stringify(after[field])))throw Error('AUDIT_ACTION_SOURCE_CHANGED');
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
      refuse(current?'main-component-changed':'identity-unavailable',record.node.id);
      throw Error('AUDIT_ACTION_SOURCE_CHANGED');
     }
    });
    guard();assertCurrent();
   },
   affected(changes:Impact){
    for(const [record,fields] of records){
     const impact=changes.get(record.node.id);
     if(impact===null||impact&&(!fields||fields.some(field=>impact.has(field))))return true;
    }
    return false;
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
 };
 return{
  unchanged,verify,snapshot,assertTextCurrent,assertNodeCurrent,recordPaintChange,recordTextChanges,finishCapture,impacts,dependencies,diagnostic:()=>diagnostic,
  observedNode(id:string){return nodes.get(id)?.node;},
  paintPreimage(id:string){const node=nodes.get(id)?.node;return node?read(node).value:null;},
  async beginTraversal(roots:SceneNode[],guard:()=>void,isSharedKey?:(key:string)=>boolean,readMain?:(node:InstanceNode)=>Promise<ComponentNode|null>){
   traversalCapture=true;
   const checkpoint=createCooperativeYield(guard);
   const mainReads=new Map<string,ReturnType<typeof readInstance>>();
   function main(node:InstanceNode){
    let pending=mainReads.get(node.id);
    if(!pending){pending=readInstance(node,readMain);mainReads.set(node.id,pending);}
    return pending;
   }
   snapshot.shouldSkipShared=async node=>{
    if(!isSharedKey)return false;
    if(excluded.has(node.id))return true;
    const key=node.type==='INSTANCE'?(await main(node))?.main.key:
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
     const identity=await main(node);guard();
     record.main=identity?.main??null;record.identity=identity?.identity??null;record.mainCaptured=true;
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
