import {createCooperativeYield} from './utils/promisePool';
const {nodeEvidence}=require('../document-audit/notification-proof');
type Record={node:BaseNode;value:string|null;fields:Set<string>;identity:string|null};

/** Notifications are redundant only after their native facts and instance ancestry agree. */
export function createV3SourceObservation(){
 const nodes=new Map<string,Record>();let ready=false,diagnostic:any=null;const queued:NodeChangeEvent[]=[];
 function refuse(reason:string,nodeId?:string,fields:string[]=[]){if(!diagnostic)diagnostic={reason,nodeId:nodeId?.slice(0,200),fields:fields.slice(0,32).map(field=>String(field).slice(0,80))};return false;}
 function read(node:BaseNode){try{const value=nodeEvidence(node);return{value:JSON.stringify(value),fields:new Set<string>(Object.keys(value))};}catch{return{value:null,fields:new Set<string>()};}}
 function stable(record:Record){
  const current=read(record.node).value;
  if(record.value===null||current===null)return refuse('node-unreadable',record.node.id);
  if(current===record.value)return true;
  const before=JSON.parse(record.value),after=JSON.parse(current),fields=Array.from(new Set(Object.keys(before).concat(Object.keys(after)))).filter(field=>JSON.stringify(before[field])!==JSON.stringify(after[field]));
  return refuse('observed-facts-changed',record.node.id,fields);
 }
 async function identity(node:BaseNode):Promise<string|null>{
  if(node.type!=='INSTANCE')return null;
  try{
   const main=await node.getMainComponentAsync();
   if(!main||main.removed||!main.id||typeof main.key!=='string'||typeof main.remote!=='boolean')return null;
   const ancestry=[];let parent=main.parent;const seen=new Set<string>();
   while(parent&&!seen.has(parent.id)){seen.add(parent.id);ancestry.push({id:parent.id,type:parent.type,name:parent.name,key:'key'in parent?parent.key:null,remote:'remote'in parent?parent.remote:null});parent=parent.parent;}
   return JSON.stringify({id:main.id,key:main.key,name:main.name,type:main.type,remote:main.remote,ancestry});
  }catch{return null;}
 }
 function related(event:NodeChangeEvent):Record[]|null{
  if(!event||!Array.isArray(event.nodeChanges)||!event.nodeChanges.length){refuse('notification-unavailable');return null;}
  const records=new Set<Record>();
  for(const change of event.nodeChanges){
   const record=nodes.get(change.id);
   if(change.type!=='PROPERTY_CHANGE'){refuse('topology-notification',change.id);return null;}
   if(!record){refuse('outside-observation',change.id);return null;}
   if(!Array.isArray(change.properties)||!change.properties.length||!change.properties.every(field=>record.fields.has(field))){refuse('unobserved-property',change.id,Array.isArray(change.properties)?change.properties:[]);return null;}
   let node:BaseNode|null=record.node;const seen=new Set<string>();
   while(node&&!seen.has(node.id)){seen.add(node.id);const observed=nodes.get(node.id);if(!observed||!stable(observed))return null;records.add(observed);node=node.parent;}
  }
  return Array.from(records);
 }
 async function unchanged(event:NodeChangeEvent,allowAsyncIdentity=false):Promise<boolean>{
  if(!ready){queued.push(event);return true;}
  const records=related(event);if(!records)return false;
  for(const record of records)if(record.node.type==='INSTANCE'){
   // Outside an active capture there is no final identity barrier to rely on.
   if(!allowAsyncIdentity)return refuse('identity-unconfirmed',record.node.id);
   const current=await identity(record.node);
   if(record.identity===null||current===null)return refuse('identity-unavailable',record.node.id);
   if(current!==record.identity)return refuse('main-component-changed',record.node.id);
  }
  return records.every(stable);
 }
 async function verify(guard:()=>void){
  const checkpoint=createCooperativeYield(guard);
  for(const record of nodes.values()){
   await checkpoint();if(record.value!==null&&!stable(record))throw Error('AUDIT_SOURCE_CHANGED');
   if(record.node.type==='INSTANCE'&&record.identity!==null){const current=await identity(record.node);guard();if(current!==record.identity){refuse(current===null?'identity-unavailable':'main-component-changed',record.node.id);throw Error('AUDIT_SOURCE_CHANGED');}}
  }
  guard();
 }
 return{
  unchanged,verify,diagnostic:()=>diagnostic,
  async prepare(roots:SceneNode[],guard:()=>void){
   const checkpoint=createCooperativeYield(guard),stack=roots.map(node=>({node:node as BaseNode,descend:true})),expanded=new Set<string>();
   while(stack.length){
    await checkpoint();const {node,descend}=stack.pop()!;
    if(!nodes.has(node.id)){nodes.set(node.id,Object.assign({node,identity:null},read(node)));if(node.parent)stack.push({node:node.parent,descend:false});}
    if(descend&&!expanded.has(node.id)&&node.type!=='PAGE'&&node.type!=='DOCUMENT'&&'children'in node){expanded.add(node.id);try{for(const child of (node as unknown as ChildrenMixin).children)stack.push({node:child,descend:true});}catch{nodes.get(node.id)!.value=null;}}
   }
   for(const record of nodes.values())if(record.node.type==='INSTANCE'){await checkpoint();record.identity=await identity(record.node);guard();}
   await verify(guard);ready=true;
   for(const event of queued)if(!await unchanged(event,true))throw Error('AUDIT_SOURCE_CHANGED');
   queued.length=0;guard();
  },
 };
}
