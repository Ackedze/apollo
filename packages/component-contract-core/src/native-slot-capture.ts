import type { CompiledContract, PreviewSnapshot } from './types';
import { matchesCaptureRepresentation } from './capture-representation';
import { snapshotPaths } from './snapshot-topology';

export type NativeSlotCaptureBoundary = { targetId:string; property:string; path:string; representationId:string };
export type NativeSlotCapturePlan = { version:1; manualSourceHash:string; boundaries:NativeSlotCaptureBoundary[] };
const record = (v:unknown):Record<string,any> => v && typeof v==='object' && !Array.isArray(v) ? v as Record<string,any> : {};
const unknown=(node:Record<string,unknown>|undefined,fact:string)=>((node?.unknownFacts||[])as string[]).some(f=>f===fact||f.startsWith(fact+'.')||fact.startsWith(f+'.'));

/** Conservative capture optimization, derived from the current compiled policy.
 * Only direct root native slots, unconditional reviewed declarations, self-local
 * property checks and no dependency/transition/content predicates are supported.
 * Everything else retains the full capture route. */
export function nativeSlotCapturePlan(contract:CompiledContract):NativeSlotCapturePlan | undefined {
  if (contract.runtimePolicy.nativeSlotTargetsVersion!==1 || contract.componentDependencies?.length
    || contract.facts.transitions?.length || contract.nonExecutableRules.length
    || contract.capabilities.operators.some(op=>!['all','any','equals','one-of','not','matches-effective-baseline','fact-present','binding-satisfies'].includes(op))
    || contract.capabilities.facts.some(f=> /^(relations|children|structuralOrder|host|semanticTargets|semanticApi|transitions|dependency)/.test(f))) return;
  const policies=contract.customizationPolicy.filter(p=>p.status!=='deprecated');
  if (policies.some(p=>(p.targetScope||'self')!=='self' || p.execution?.route==='context-only' || p.execution?.route==='delegated')) return;
  const boundaries:NativeSlotCaptureBoundary[]=[];
  for(const p of policies){
    if(p.status!=='reviewed' || p.permission!=='allowed' || p.capability!=='composition.content'
      || p.applicability.variants!=='all' || p.applicability.modes!=='all'
      || p.applicability.products?.length || p.applicability.channels?.length
      || Object.keys(p.applicability.context||{}).length || Object.keys(p.applicability.contextDomains||{}).length) continue;
    const target=contract.facts.targets.find(t=>t.id===p.targetId && t.resolution==='resolved');if(!target)continue;
    const controls=p.controlPaths.filter(c=>c.kind==='slot-api' && c.target===target.id && c.contentOwnership==='external' && c.property && !c.ownerTargetId);
    if(controls.length!==1 || policies.filter(other=>other.targetId===target.id).some(other=>other!==p && other.capability==='composition.content'))continue;
    for(const rep of contract.facts.representations.filter(r=>r.status!=='deprecated')){
      const hints=target.representationHints?.filter(h=>h.representationId===rep.id)||[];if(hints.length>1)continue;
      const path=(hints[0]?.pathHint||target.pathHint)?.split(' / ').slice(1).join(' / ');
      if(!path || path.includes(' / '))continue;
      if(policies.some(other=>{const t=contract.facts.targets.find(t=>t.id===other.targetId);const h=t?.representationHints?.find(h=>h.representationId===rep.id);
        const otherPath=(h?.pathHint||t?.pathHint)?.split(' / ').slice(1).join(' / ');return otherPath?.startsWith(path+' / ');}))continue;
      boundaries.push({targetId:target.id,property:controls[0].property!,path,representationId:rep.id});
    }
  }
  return boundaries.length?{version:1,manualSourceHash:contract.package.manualSourceHash,boundaries}:undefined;
}

/** The independent library capture must prove the root owner and unique SLOT. */
export function confirmedNativeSlotCaptureBoundaries(plan:NativeSlotCapturePlan|undefined,reference:NonNullable<PreviewSnapshot['variantReference']>,representationId:string,componentKey:string,componentSetKey:string):NativeSlotCaptureBoundary[]{
  if(plan?.version!==1 || !reference.complete || reference.componentKey!==componentKey || reference.componentSetKey!==componentSetKey)return [];
  return plan.boundaries.filter(b=>b.representationId===representationId && reference.nodeProperties['']?.propertyTypes[b.property]==='SLOT'
    && reference.nodes.filter(n=>n.type==='SLOT' && !n.path.includes(' / ') && reference.nodeProperties[n.path]?.propertyReferenceBindings?.slotContentId===b.property).length===1
    && reference.nodes.some(n=>n.path===b.path && n.type==='SLOT' && reference.nodeProperties[n.path]?.propertyReferenceBindings?.slotContentId===b.property));
}

/** Re-prove omissions from current policy + actual boundary + independent reference.
 * A stale/forged capture plan must not hide data required by new manual rules. */
export function validateNativeSlotCaptureScope(snapshot:PreviewSnapshot,contract:CompiledContract):void{
  const scope=snapshot.source?.nativeSlotCaptureScope;if(!scope)return;
  const plan=nativeSlotCapturePlan(contract),ref=snapshot.variantReference,paths=snapshotPaths(snapshot);
  const root=snapshot.nodes.find(n=>snapshot.selection.includes(String(n.id)));
  const identity=record(record(root?.component).identity);
  const reps=ref?contract.facts.representations.filter(r=>r.status!=='deprecated' && r.platform===snapshot.context.platform && matchesCaptureRepresentation(r,ref.componentKey,ref.componentSetKey)):[];
  let valid=scope.version===1 && plan?.manualSourceHash===scope.manualSourceHash && !!paths && reps.length===1 && !!ref
    && identity.componentKey===ref.componentKey && (identity.componentSetKey||'')===ref.componentSetKey && !unknown(root,'component.identity');
  const confirmed=ref&&reps.length===1?confirmedNativeSlotCaptureBoundaries(plan,ref,reps[0].id,identity.componentKey,identity.componentSetKey||''):[];
  const seen=new Set<string>();
  for(const omission of scope.omissions){
    const node=snapshot.nodes.find(n=>n.id===omission.nodeId),component=record(node?.component);
    const same=confirmed.filter(b=>b.targetId===omission.targetId && b.property===omission.property && b.path===paths?.get(omission.nodeId));
    const consumers=snapshot.nodes.filter(n=>n.type==='SLOT' && n.parentId===root?.id && record(record(n.component).propertyReferenceBindings).slotContentId===omission.property);
    if(seen.has(omission.nodeId)||same.length!==1||omission.path!==paths?.get(omission.nodeId)||node?.type!=='SLOT'||node.parentId!==root?.id
      ||component.propertyReferenceBindings?.slotContentId!==omission.property||record(record(root?.component).propertyTypes)[omission.property]!=='SLOT'
      ||unknown(root,`component.propertyTypes.${omission.property}`)
      ||consumers.length!==1||!Array.isArray(node.childIds)||node.childIds.length!==0
      ||((node.unknownFacts||[])as string[]).some(f=>f.startsWith('component.propertyReferenceBindings')||f==='type'||f==='parentId'))valid=false;
    seen.add(omission.nodeId);
  }
  if(!scope.omissions.length)valid=false;
  if(!valid && snapshot.source){snapshot.source.truncated=true;snapshot.source.captureTopology={version:1,complete:false,limitReached:false,issues:[{kind:'unconfirmed-scope',path:''}]};}
}
