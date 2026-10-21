import type { CompiledContract, PreviewSnapshot, SemanticApiBinding } from './types';
import { prepareValidationSnapshot } from './runtime';
import { resolveDirectChildBinding, dependencyPinIssue } from './component-dependencies';
import { resolveComponentProperty } from './component-property-identity';
import { representationEvidenceErrors, contractRepresentationShape, representationFeatureFlags } from './representation-evidence';
import { stableHash } from './stable';
const rec=(v:unknown):Record<string,any>=>v&&typeof v==='object'?v as Record<string,any>:{};
function fail(reason:string):never{throw new Error('OWNED_CODE_COLLECTION_UNPROVEN: '+reason);}
/** Project fields only after the canonical capture proves ownership and identity.
 * The native owner child order determines the visible collection index. Business
 * events remain separate scenario inputs; labels never select handlers. */
export function projectOwnedCodeCollection(contract:CompiledContract,input:PreviewSnapshot,representationId:string){
  const shape=contractRepresentationShape(contract),flags=representationFeatureFlags(shape);
  if(!flags.bindings||contract.runtimePolicy.crossRepresentationBindingsVersion!==flags.bindingVersion||representationEvidenceErrors(shape).length)fail('schema');
  const declarations=contract.facts.semanticApi.flatMap(api=>api.bindings.filter(b=>b.representationId===representationId&&b.ownedOccurrence).map(binding=>({api,binding})));
  if(!declarations.length)fail('missing declarations');
  const snapshot=prepareValidationSnapshot(input,contract),items=new Map<string,{node:Record<string,any>;bindings:SemanticApiBinding[]}>();
  let ownerId:string|undefined;
  for(const {binding} of declarations){
    const o=binding.ownedOccurrence!,dependency=contract.componentDependencies?.find(d=>d.id===o.dependencyId),direct=dependency?.bindings.find(b=>b.id===o.dependencyBindingId);
    if(!dependency||dependencyPinIssue(dependency,dependency.contract)||direct?.kind!=='direct-child')fail('exact dependency');
    const r=resolveDirectChildBinding(snapshot,dependency,direct,contract);
    if(!r.identityValid||!r.node||(r.status!=='active'&&!(r.status==='inactive'&&r.reason==='target-hidden')))fail(r.reason);
    const node=rec(r.node),id=String(node.id);
    if(ownerId!==undefined&&node.parentId!==ownerId)fail('multiple owners');ownerId=String(node.parentId);
    const item=items.get(id)||{node,bindings:[]};item.bindings.push(binding);items.set(id,item);
  }
  const owner=snapshot.nodes.find(n=>n.id===ownerId),children=rec(owner).childIds;
  if(!Array.isArray(children)||new Set(children).size!==children.length||Array.from(items.keys()).some(id=>!children.includes(id)))fail('native order');
  if(snapshot.nodes.some(n=>n.parentId===ownerId&&n.type==='INSTANCE'&&!items.has(String(n.id))))fail('unmapped native child');
  const visible=children.filter(id=>items.has(id)&&rec(items.get(id)!.node.visibility).effective===true);
  const elements:Array<{targetId:string;instanceId:string;sourceNodeId:string;children:string;disabled?:boolean}>=[];
  let primaryFirst:boolean|undefined;
  for(const [index,id] of visible.entries()){
    const {node,bindings}=items.get(id)!;
    const element:{targetId:string;instanceId:string;sourceNodeId:string;children:string;disabled?:boolean}={targetId:bindings[0].targetId!,instanceId:id,sourceNodeId:rec(rec(node.component).sourceIdentity).sourceNodeId,children:''};
    let labelCount=0;
    for(const binding of bindings){
      const o=binding.ownedOccurrence!,source=o.sourceProperty,c=rec(node.component),resolved=resolveComponentProperty(source.property,c,[source.propertyType]);
      if(!('name' in resolved)||((node.unknownFacts||[]) as string[]).some(p=>p==='component'||p==='component.properties'||p==='component.propertyTypes'||p==='component.properties.'+resolved.name||p==='component.propertyTypes.'+resolved.name))fail('typed property capture');
      const value=rec(c.properties)[resolved.name];
      if(o.transformId==='owned-button-label.v1'){if(typeof value!=='string')fail('label');element.children=value;labelCount++;}
      if(o.transformId==='owned-button-disabled.v1'){if(!['False','True'].includes(value))fail('disabled');element.disabled=value==='True';}
      if(o.transformId==='owned-button-primary-first.v1'){if(!['Primary','Secondary'].includes(value)||index>0&&value!=='Secondary')fail('view profile');if(index===0)primaryFirst=value==='Primary';}
    }
    if(labelCount!==1)fail('one label binding per visible occurrence');elements.push(element);
  }
  return {elements,primaryFirst,evidenceHash:stableHash({contract:stableHash(contract),snapshot,representationId})};
}
