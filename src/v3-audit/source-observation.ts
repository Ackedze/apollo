import {createCooperativeYield,forEachWithConcurrency} from './utils/promisePool';
import {getDetachedLibraryComponentKey} from './services/detachedComponentSource';
const {nodeEvidence}=require('../document-audit/notification-proof');
type Observation={node:BaseNode;value:string|null;fields:Set<string>;identity:string|null;main:ComponentNode|null;mainCaptured?:boolean;children?:readonly SceneNode[];childNames?:readonly string[];visible?:boolean;text?:string};
export type AuditSceneSnapshot={
 getChildren(node:SceneNode):readonly SceneNode[];
 getChildNames(node:SceneNode):readonly string[];
 isVisible(node:SceneNode):boolean;
 getText(node:TextNode):string;
 getMainComponent(node:InstanceNode,readMain?:(node:InstanceNode)=>Promise<ComponentNode|null>):Promise<ComponentNode|null>;
 shouldSkipShared?(node:SceneNode):Promise<boolean>;
};

/** Notifications are redundant only after their native facts and instance ancestry agree. */
export function createV3SourceObservation(kind:'components'|'texts'='components'){
 const textOnly=kind==='texts',textRoots=new Set<string>();
 const nodes=new Map<string,Observation>();let ready=false,diagnostic:any=null;const queued:NodeChangeEvent[]=[];
 const excluded=new Set<string>();
 function refuse(reason:string,nodeId?:string,fields:string[]=[]){if(!diagnostic)diagnostic={reason,nodeId:nodeId?.slice(0,200),fields:fields.slice(0,32).map(field=>String(field).slice(0,80))};return false;}
 function textEvidence(node:BaseNode):Record<string,unknown>{
  const value:Record<string,unknown>={id:node.id,type:node.type,name:node.name,removed:!!node.removed,parent:node.parent?.id??null};
  if(node.removed||node.type==='PAGE'||node.type==='DOCUMENT')return value;
  if('visible'in node)value.visible=node.visible;
  if('opacity'in node)value.opacity=node.opacity;
  if(textRoots.has(node.id)&&'width'in node)value.width=node.width;
  if('children'in node)value.children=Array.from(node.children,child=>child.id);
  if(node.type==='TEXT')value.characters=node.characters;
  if(node.type==='INSTANCE')value.componentProperties=Object.entries(node.componentProperties).sort(([a],[b])=>a.localeCompare(b)).map(([key,property])=>[key,String(property.value)]);
  if(node.type==='COMPONENT'){value.key=node.key;value.variantProperties=Object.entries(node.variantProperties??{}).sort(([a],[b])=>a.localeCompare(b));}
  return value;
 }
 function read(node:BaseNode){try{const value=textOnly?textEvidence(node):nodeEvidence(node);return{value:JSON.stringify(value),fields:new Set<string>(Object.keys(value)),visible:typeof value.visible==='boolean'?value.visible:undefined,text:typeof value.characters==='string'?value.characters:undefined};}catch{return{value:null,fields:new Set<string>()};}}
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
 async function readInstance(node:InstanceNode){
  try{
   const main=await node.getMainComponentAsync();
   if(!main||main.removed||!main.id||typeof main.key!=='string'||typeof main.remote!=='boolean')return null;
   const ancestry=[];let parent=main.parent;const seen=new Set<string>();
   while(parent&&!seen.has(parent.id)){seen.add(parent.id);ancestry.push({id:parent.id,type:parent.type,name:parent.name,key:'key'in parent?parent.key:null,remote:'remote'in parent?parent.remote:null});parent=parent.parent;}
   return {main,identity:JSON.stringify({id:main.id,key:main.key,name:main.name,type:main.type,remote:main.remote,ancestry})};
  }catch{return null;}
 }
 function related(event:NodeChangeEvent):Observation[]|null{
  if(!event||!Array.isArray(event.nodeChanges)||!event.nodeChanges.length){refuse('notification-unavailable');return null;}
  const records=new Set<Observation>();
  for(const change of event.nodeChanges){
   const record=nodes.get(change.id);
   if(change.type!=='PROPERTY_CHANGE'){refuse('topology-notification',change.id);return null;}
   if(!record){refuse('outside-observation',change.id);return null;}
   if(!Array.isArray(change.properties)||!change.properties.length||!textOnly&&!change.properties.every(field=>record.fields.has(field))){refuse('unobserved-property',change.id,Array.isArray(change.properties)?change.properties:[]);return null;}
   let node:BaseNode|null=record.node;const seen=new Set<string>();
   while(node&&!seen.has(node.id)){seen.add(node.id);const observed=nodes.get(node.id);if(!observed||!stable(observed))return null;records.add(observed);node=node.parent;}
  }
  return Array.from(records);
 }
 async function unchanged(event:NodeChangeEvent,allowAsyncIdentity=false):Promise<boolean>{
  if(!ready){queued.push(event);return true;}
  const records=related(event);if(!records)return false;
  for(const record of records)if(record.node.type==='INSTANCE'&&(!textOnly||record.mainCaptured)){
   // An accepted report is invalidated conservatively rather than re-reading instance identities.
   if(!allowAsyncIdentity)return refuse('identity-unconfirmed',record.node.id);
   const current=(await readInstance(record.node))?.identity??null;
   if(record.identity===null||current===null)return refuse('identity-unavailable',record.node.id);
   if(current!==record.identity)return refuse('main-component-changed',record.node.id);
  }
  return records.every(stable);
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
   for(const record of nodes.values()){
    guard();if(!stable(record))throw Error('AUDIT_SOURCE_CHANGED');
   }
   guard();return;
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
  isVisible(node){return nodes.get(node.id)?.visible??node.visible!==false;},
  getText(node){return nodes.get(node.id)?.text??node.characters;},
  async getMainComponent(node,readMain){const record=nodes.get(node.id);if(record?.mainCaptured)return record.main;return record?.main??(readMain?readMain(node):node.getMainComponentAsync());},
 };
 return{
  unchanged,verify,snapshot,diagnostic:()=>diagnostic,
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
