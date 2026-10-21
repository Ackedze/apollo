import { representationEvidenceErrors, representationFeatureFlags, contractRepresentationShape } from './representation-evidence';
import type { CompiledContract, CompiledComponentDependency, ComponentDependency, ComponentDependencyBinding, DirectChildBinding, ManualSource, PreviewSnapshot, ValidationIssue } from './types';
import { stableHash } from './stable';
import { snapshotPaths } from './snapshot-topology';
import { compareInstanceBoundaries, correspondingPath, withinBoundary } from './instance-boundaries';
import { captureVariantReference } from './variant-facts';
import { effectiveFacts, materializeEffectiveBaseline } from './instance-validation';
import { materializeInstanceContentReferences } from './instance-content-reference';
import { selectedTargetPathHint } from './occurrence-address';
import { matchesCaptureRepresentation } from './capture-representation';

const record = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};
export const COMPONENT_DEPENDENCY_CAPTURE_LIMIT = 8;
export const DIRECT_CHILD_DEPENDENCY_CAPTURE_LIMIT = 16;
export const COMPONENT_DEPENDENCY_DEPTH_LIMIT = 4;
const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const pathValid = (v: unknown) => typeof v === 'string' && !v.split(' / ').some(p => p === '..' || p === '.' || p.includes('*') || (!p && v !== ''));

export function validateComponentDependencies(manual: Pick<ManualSource,'component'|'targets'|'representations'|'componentDependencies'>): ValidationIssue[] {
  const issues: ValidationIssue[] = [], ids = new Set<string>();
  const fail = (index: number, message: string) => issues.push({level:'error',code:'COMPONENT_DEPENDENCY',path:`/componentDependencies/${index}`,message});
  if (manual.componentDependencies === undefined) return issues;
  if (!Array.isArray(manual.componentDependencies)) return [{level:'error',code:'COMPONENT_DEPENDENCY',path:'/componentDependencies',message:'Expected dependency pins and fixed nested bindings.'}];
  for (const [i, d] of manual.componentDependencies.entries()) {
    if (!d || !/^[a-z][a-z0-9-]*$/.test(d.id) || ids.has(d.id)) { fail(i, 'Dependency id must be unique and path-safe.'); continue; }
    ids.add(d.id);
    if (!/^[a-z][a-z0-9.-]*$/.test(d.componentId || '') || d.componentId === manual.component.componentId || !Number.isInteger(d.revision) || d.revision < 1
      || !hash(d.manualSourceHash) || !hash(d.compiledHash)) fail(i,'Pin another component by componentId, revision and both SHA-256 hashes.');
    if (!Array.isArray(d.bindings) || !d.bindings.length) { fail(i,'Declare at least one fixed nested binding.'); continue; }
    const bindings = new Set<string>(), subjects = new Set<string>();
    for (const b of d.bindings) {
      if (!b || !/^[a-z][a-z0-9-]*$/.test(b.id) || bindings.has(b.id)) { fail(i,'Binding id must be unique and path-safe.'); continue; }
      bindings.add(b.id);
      const subject = JSON.stringify([b.targetRole,b.relativePath,...((b.kind==='direct-child'||b.kind==='fixed-nested-scoped') && Array.isArray(b.representationIds)?b.representationIds.slice().sort():[])]);
      if (subjects.has(subject)) fail(i,'Duplicate nested subject.');
      subjects.add(subject);
      if (manual.targets.filter(t=>t.semanticRole===b.targetRole && t.resolution==='resolved').length!==1) fail(i,`Unresolved target: ${b.targetRole}.`);
      if(b.kind==='direct-child'){
        if(d.bindings.some(other=>other!==b && other.kind==='direct-child' && other.targetRole===b.targetRole
          && Array.isArray(other.representationIds) && Array.isArray(b.representationIds) && other.representationIds.some(id=>b.representationIds.includes(id))))fail(i,'Direct member bindings may not overlap in the same representation.');
        if(b.relativePath!=='' || b.ownerTargetRole===b.targetRole
          || manual.targets.filter(t=>t.semanticRole===b.ownerTargetRole && t.resolution==='resolved').length!==1)fail(i,'Direct child requires distinct resolved member/owner targets and an empty relativePath.');
        if(!Array.isArray(b.ownerComponentKeys) || !b.ownerComponentKeys.length || b.ownerComponentKeys.some(k=>typeof k!=='string'||!k))fail(i,'Direct owner component keys are required.');
        if(!Array.isArray(b.representationIds) || !b.representationIds.length || new Set(b.representationIds).size!==b.representationIds.length
          || b.representationIds.some(id=>!manual.representations.some(r=>r.kind==='figma'&&r.id===id&&r.status!=='deprecated')))fail(i,'Direct binding requires explicit unique Figma representations.');
        if(['childPath','activeVariant','ownerComponentSetKeys'].some(k=>Object.prototype.hasOwnProperty.call(b,k)))fail(i,'Direct binding cannot contain legacy fixed-nested fields.');
        continue;
      }
      if(b.kind!==undefined && b.kind!=='fixed-nested' && b.kind!=='fixed-nested-scoped'){fail(i,'Unknown dependency binding kind.');continue;}
      if(b.kind==='fixed-nested-scoped'){
        if(!Array.isArray(b.representationIds)||!b.representationIds.length||new Set(b.representationIds).size!==b.representationIds.length
          || b.representationIds.some(id=>!manual.representations.some(r=>r.kind==='figma'&&r.id===id&&r.status!=='deprecated')))fail(i,'Scoped fixed binding requires explicit unique active Figma representations.');
      }else if(Object.prototype.hasOwnProperty.call(b,'representationIds'))fail(i,'Representation scope requires fixed-nested-scoped.');
      if(d.bindings.some(other=>other!==b&&other.kind!=='direct-child'&&other.targetRole===b.targetRole&&other.relativePath===b.relativePath
        && (b.kind==='fixed-nested-scoped'||other.kind==='fixed-nested-scoped')
        && (b.kind!=='fixed-nested-scoped'||other.kind!=='fixed-nested-scoped'
          || Array.isArray(b.representationIds)&&Array.isArray(other.representationIds)&&b.representationIds.some(id=>other.representationIds!.includes(id)))))fail(i,'Fixed nested bindings may not overlap in the same representation.');
      if (!pathValid(b.relativePath) || !pathValid(b.childPath) || !b.childPath) fail(i,'Use exact relative owner/child paths.');
      if (!Array.isArray(b.ownerComponentSetKeys) || !b.ownerComponentSetKeys.length || b.ownerComponentSetKeys.some(k=>!k)) fail(i,'Owner component set keys are required.');
      if (!b.activeVariant?.property || !Array.isArray(b.activeVariant.values) || !b.activeVariant.values.length || b.activeVariant.values.some(v=>typeof v!=='string'||!v)) fail(i,'Declare the typed owner VARIANT activation.');
    }
  }
  return issues;
}

export function dependencyPinIssue(pin: ComponentDependency, contract?: CompiledContract): string | undefined {
  if (!contract) return 'dependency-contract-missing';
  if (contract.documentType !== 'component-contract' || contract.schemaVersion !== 'apollo.component-contract.v2.1-experimental') return 'dependency-schema-unsupported';
  if (contract.package?.componentId !== pin.componentId) return 'dependency-component-mismatch';
  if (!Array.isArray(contract.rules) || !Array.isArray(contract.facts?.representations)
    || !Array.isArray(contract.nonExecutableRules) || !Array.isArray(contract.customizationPolicy)) return 'dependency-contract-malformed';
  const revisions = [...new Set(contract.rules.map(r=>r.revision))];
  const revision = contract.package.manualRevision ?? (revisions.length === 1 ? revisions[0] : undefined);
  if (revision !== pin.revision || contract.package.manualSourceHash !== pin.manualSourceHash || stableHash(contract) !== pin.compiledHash) return 'dependency-pin-mismatch';
  if (contract.runtimePolicy?.engine !== 'apollo-predicate-engine' || contract.runtimePolicy?.unknownPolicy !== 'fail-closed') return 'dependency-runtime-unsupported';
  for(const field of ['occurrenceAddressVersion','directChildDependenciesVersion','memberCollectionsVersion','dependencySubjectConditionsVersion','rootTargetAliasesVersion','assetIdentityLockVersion','instanceMainComponentAliasesVersion','representationEvidenceVersion'] as const)
    if(contract.runtimePolicy[field]!==undefined && contract.runtimePolicy[field]!==1)return 'dependency-runtime-unsupported';
  if(contract.runtimePolicy.crossRepresentationBindingsVersion!==undefined&&!([1,2] as number[]).includes(contract.runtimePolicy.crossRepresentationBindingsVersion))return 'dependency-runtime-unsupported';
  const shape=contractRepresentationShape(contract),flags=representationFeatureFlags(shape);
  if(representationEvidenceErrors(shape).length || flags.evidence!==(contract.runtimePolicy.representationEvidenceVersion===1) || contract.runtimePolicy.crossRepresentationBindingsVersion!==flags.bindingVersion
    || flags.scopedDependencies&&validateComponentDependencies({component:contract.facts.component,targets:contract.facts.targets,representations:contract.facts.representations,componentDependencies:contract.componentDependencies}).length)return 'dependency-representation-unsupported';
  return undefined;
}

export function linkComponentDependencies(manual: ManualSource, inputs: CompiledContract[]): CompiledComponentDependency[] {
  const visit = (d: CompiledComponentDependency, ancestors: string[], depth: number): string | undefined => {
    if (ancestors.includes(d.componentId)) return 'dependency-cycle';
    if (depth > COMPONENT_DEPENDENCY_DEPTH_LIMIT) return 'dependency-depth-limit';
    const issue = dependencyPinIssue(d,d.contract);
    if (issue) return issue;
    for (const child of d.contract!.componentDependencies || []) {
      const nested = visit(child,[...ancestors,d.componentId],depth+1);
      if (nested) return nested;
    }
    return undefined;
  };
  const pins = Array.isArray(manual.componentDependencies) ? manual.componentDependencies : [];
  return pins.filter(d=>d && Array.isArray(d.bindings)).map(pin=>{
    const candidates = inputs.filter(c=>c?.package?.componentId === pin.componentId);
    const contract = candidates.length === 1 ? candidates[0] : undefined;
    const d = {...pin,...(contract?{contract}:{} )};
    const issue = candidates.length > 1 ? 'dependency-version-conflict' : visit(d,[manual.component.componentId],1);
    return {...d,...(issue?{issue}:{})};
  });
}

export function componentDependencyKeys(contract: CompiledContract): string[] {
  const keys = new Set<string>();
  const visit = (c: CompiledContract, depth: number) => {
    if (depth > COMPONENT_DEPENDENCY_DEPTH_LIMIT) return;
    for (const d of c.componentDependencies || []) if (!d.issue && d.contract && !dependencyPinIssue(d,d.contract)) {
      d.contract.facts.representations.filter(r=>r.kind==='figma' && r.status!=='deprecated')
        .forEach(r=>[r.locator.componentKey,r.locator.componentSetKey].forEach(k=>{if(typeof k==='string'&&k)keys.add(k);}));
      visit(d.contract,depth+1);
    }
  };
  visit(contract,0);
  return [...keys].sort();
}

export type FixedNestedResolution = { status:'active'|'inactive'|'unknown'; reason:string; node?:Record<string,unknown>; nodeId?:string; identityValid?:boolean; ownerActive?:true };

/** Prove a fixed child through the selected library owner variant, never by name alone. */
export function resolveFixedNestedBinding(snapshot: PreviewSnapshot, d: CompiledComponentDependency, b: ComponentDependencyBinding, strictCompositionEvidence = false, hostContract?:CompiledContract): FixedNestedResolution {
  if(b.kind==='direct-child')return resolveDirectChildBinding(snapshot,d,b,hostContract);
  const unknown = (reason:string):FixedNestedResolution=>({status:'unknown',reason});
  const root = snapshot.nodes.filter(n=>snapshot.selection.includes(String(n.id)));
  const paths = snapshotPaths(snapshot), ref = snapshot.variantReference;
  const comparison = ref && compareInstanceBoundaries(snapshot,ref);
  if (root.length!==1 || !paths || snapshot.source?.truncated || !ref?.complete || !comparison?.complete) return unknown('dependency-topology-unavailable');
  if(b.kind==='fixed-nested-scoped'){
    if(hostContract?.runtimePolicy.crossRepresentationBindingsVersion!==2)return unknown('scoped-dependency-version-unavailable');
    if(!Array.isArray(b.representationIds)||!b.representationIds.length||new Set(b.representationIds).size!==b.representationIds.length
      || b.representationIds.some(id=>!hostContract.facts.representations.some(r=>r.id===id&&r.kind==='figma'&&r.status!=='deprecated')))return unknown('dependency-binding-scope-unavailable');
    const identity=record(record(root[0].component).identity),original=ref.nodeProperties['']?.identity;
    if(root[0].type!=='INSTANCE'||!original||!identity.componentKey||!identity.mainComponentId
      || identity.componentKey!==original.componentKey||identity.componentSetKey!==original.componentSetKey||identity.mainComponentId!==original.mainComponentId
      || ref.componentKey!==identity.componentKey||(ref.componentSetKey||'')!==(identity.componentSetKey||'')
      || snapshot.source?.componentKey!==identity.componentKey||(snapshot.source?.componentSetKey||'')!==(identity.componentSetKey||'')
      || ((root[0].unknownFacts||[]) as string[]).some(p=>p==='component'||p==='component.identity'||p.startsWith('component.identity.')))
      return unknown('dependency-host-identity-unproven');
    const reps=hostContract.facts.representations.filter(r=>matchesCaptureRepresentation(r,identity.componentKey,identity.componentSetKey||''));
    if(reps.length!==1||!['universal',snapshot.context.platform].includes(reps[0].platform)
      || snapshot.context.unknownFacts?.some(p=>['platform','context.platform','environment.platform'].includes(p)))return unknown('dependency-representation-unresolved');
    if(!b.representationIds.includes(reps[0].id))return {status:'inactive',reason:'binding-outside-representation'};
  }
  const availability = record(record(root[0].variantAvailability).targets)[b.targetRole];
  if (availability?.present === false) return {status:'inactive',reason:'target-absent-in-variant'};
  const targets = snapshot.nodes.filter(n=>record(n.semantic).role===b.targetRole);
  if (availability?.present!==true || targets.length!==1) return unknown('dependency-target-unresolved');
  if (record(targets[0].visibility).effective===false) return {status:'inactive',reason:'target-hidden'};
  if (record(targets[0].visibility).effective!==true) return unknown('dependency-visibility-unavailable');
  const ownerPath = [correspondingPath(comparison,paths.get(String(targets[0].id))!),b.relativePath].filter(Boolean).join(' / ');
  const owners = snapshot.nodes.filter(n=>correspondingPath(comparison,paths.get(String(n.id))!)===ownerPath && n.type==='INSTANCE');
  if (owners.length!==1) return unknown('dependency-owner-unresolved');
  const owner=owners[0], component=record(owner.component), identity=record(component.identity);
  if (strictCompositionEvidence && ((owner.unknownFacts || []) as string[]).some(p =>
    ['component.identity','component.properties.'+b.activeVariant.property,'component.propertyTypes.'+b.activeVariant.property]
      .some(input=>input===p || input.startsWith(p+'.') || (input==='component.identity' && p.startsWith(input+'.'))))) return unknown('dependency-owner-evidence-unknown');
  if (!b.ownerComponentSetKeys.includes(identity.componentSetKey)) return unknown('dependency-owner-identity-mismatch');
  let selectedReference=ref;
  const boundary = comparison.boundaries.find(x=>withinBoundary(paths.get(String(owner.id))!,x.actualPath));
  if (boundary) {
    const result = snapshot.instanceContentResults?.find(r=>r.boundaryNodeId===boundary.nodeId && r.lineageProven);
    const attempts = snapshot.instanceContentReferences?.attempts.filter(a=>a.boundaryNodeId===boundary.nodeId) || [];
    if (boundary.nodeId!==owner.id || boundary.reason!=='component-variant-changed' || !result || attempts.length!==1 || attempts[0].failure || !attempts[0].reference) return unknown('dependency-owner-lineage-unproven');
    const s=attempts[0].reference;
    selectedReference=captureVariantReference(s,s.source?.componentKey||'',s.source?.componentSetKey||'');
  }
  const originalOwner=selectedReference.nodeProperties[ownerPath];
  const prop=b.activeVariant.property, value=component.properties?.[prop];
  if (!originalOwner || originalOwner.identity?.componentKey!==identity.componentKey || originalOwner.identity?.componentSetKey!==identity.componentSetKey
    || component.propertyTypes?.[prop]!=='VARIANT' || originalOwner.propertyTypes[prop]!=='VARIANT' || originalOwner.properties[prop]!==value
    || ((owner.unknownFacts || []) as string[]).some(p=>`component.properties.${prop}`===p||`component.properties.${prop}`.startsWith(p+'.'))) return unknown('dependency-owner-variant-unproven');
  if (!b.activeVariant.values.includes(value)) return {status:'inactive',reason:'owner-variant-inactive'};
  const childPath=[ownerPath,b.childPath].filter(Boolean).join(' / '), original=selectedReference.nodeProperties[childPath];
  const childContract=d.contract;
  const childKeys=childContract?.facts.representations.filter(r=>r.kind==='figma'&&r.status!=='deprecated').flatMap(r=>[r.locator.componentKey,r.locator.componentSetKey]).filter((key): key is string=>typeof key==='string'&&Boolean(key)) || [];
  if (!original?.identity || !childKeys.includes(original.identity.componentSetKey || original.identity.componentKey)) return {...unknown('dependency-child-lineage-unproven'),ownerActive:true};
  const selectedComparison = snapshot.source?.instanceIdentityVersion === 1 ? compareInstanceBoundaries(snapshot,selectedReference,true) : undefined;
  if (selectedComparison && !selectedComparison.complete) return {...unknown('dependency-child-lineage-unproven'),ownerActive:true};
  const children=snapshot.nodes.filter(n=>correspondingPath(selectedComparison,paths.get(String(n.id))!)===childPath);
  if (children.length!==1 || children[0].type!=='INSTANCE') return {...unknown('dependency-child-missing-or-ambiguous'),ownerActive:true};
  const node=children[0], childIdentity=record(record(node.component).identity);
  return {status:'active',reason:'fixed-child-proven',node,nodeId:String(node.id),identityValid:childKeys.includes(childIdentity.componentSetKey || childIdentity.componentKey),ownerActive:true};
}

/** Prove membership before inspecting visibility. A hidden foreign/lost child is
 * never made inactive simply because its visible flag is false. */
export function resolveDirectChildBinding(snapshot:PreviewSnapshot,d:CompiledComponentDependency,b:DirectChildBinding,hostContract?:CompiledContract):FixedNestedResolution{
  const unavailable=(reason:string):FixedNestedResolution=>({status:'unknown',reason});
  if(hostContract?.runtimePolicy.directChildDependenciesVersion!==1)return unavailable('direct-dependency-version-unavailable');
  const root=snapshot.nodes.find(n=>snapshot.selection.includes(String(n.id))),ref=snapshot.variantReference,paths=snapshotPaths(snapshot);
  if(!root || !ref?.complete || !paths || snapshot.source?.occurrenceAddressVersion!==1 || ref.occurrenceAddressVersion!==1
    || !['verified','partial'].includes(record(root.variantAvailability).status))return unavailable('dependency-topology-unavailable');
  const reps=hostContract.facts.representations.filter(r=>r.kind==='figma'&&r.status!=='deprecated'&&r.platform===snapshot.context.platform
    && matchesCaptureRepresentation(r,ref.componentKey,ref.componentSetKey));
  if(reps.length!==1)return unavailable('dependency-representation-unresolved');
  if(!b.representationIds.includes(reps[0].id))return {status:'inactive',reason:'binding-outside-representation'};
  const targets=hostContract.facts.targets.filter(t=>t.semanticRole===b.targetRole && t.resolution==='resolved');
  const owners=hostContract.facts.targets.filter(t=>t.semanticRole===b.ownerTargetRole && t.resolution==='resolved');
  if(targets.length!==1 || owners.length!==1)return unavailable('dependency-target-unresolved');
  const memberPath=selectedTargetPathHint(targets[0],reps[0].id,ref.componentKey,true)?.split(' / ').slice(1).join(' / ');
  const ownerPath=selectedTargetPathHint(owners[0],reps[0].id,ref.componentKey,true)?.split(' / ').slice(1).join(' / ');
  if(memberPath===undefined || !memberPath || ownerPath===undefined || memberPath.split(' / ').slice(0,-1).join(' / ')!==ownerPath)
    return unavailable('dependency-direct-binding-unresolved');
  const comparison=compareInstanceBoundaries(snapshot,ref,true);
  const actualOwners=snapshot.nodes.filter(n=>n.type==='INSTANCE' && correspondingPath(comparison,paths.get(String(n.id))!)===ownerPath);
  const members=snapshot.nodes.filter(n=>n.type==='INSTANCE' && correspondingPath(comparison,paths.get(String(n.id))!)===memberPath);
  if(actualOwners.length!==1 || members.length!==1 || members[0].parentId!==actualOwners[0].id)return unavailable('dependency-direct-lineage-unproven');
  const owner=actualOwners[0],node=members[0],identity=record(record(node.component).identity),ownerIdentity=record(record(owner.component).identity);
  if(((owner.unknownFacts||[]) as string[]).some(p=>p==='component'||p==='component.identity'||p.startsWith('component.identity.')))return unavailable('dependency-owner-evidence-unknown');
  const original=ref.nodeProperties[memberPath],expectedOwner=ref.nodeProperties[ownerPath]?.identity;
  const source=record(record(node.component).sourceIdentity),expectedSource=original?.sourceIdentity;
  if(!expectedOwner || expectedOwner.componentKey!==ownerIdentity.componentKey || expectedOwner.mainComponentId!==ownerIdentity.mainComponentId
    || !b.ownerComponentKeys.some(k=>k===ownerIdentity.componentKey||k===ownerIdentity.componentSetKey)
    || !expectedSource || source.version!==1 || source.sourceNodeId!==expectedSource.sourceNodeId
    || source.ownerComponentKey!==ownerIdentity.componentKey || source.ownerMainComponentId!==ownerIdentity.mainComponentId
    || ((node.unknownFacts||[])as string[]).some(p=>p==='component'||p==='component.sourceIdentity'||p.startsWith('component.sourceIdentity.')))
    return unavailable('dependency-direct-lineage-unproven');
  const selected=d.contract?.facts.representations.filter(r=>r.kind==='figma'&&r.status!=='deprecated'
    && matchesCaptureRepresentation(r,identity.componentKey||'',identity.componentSetKey||'')) || [];
  const sameFamily=Boolean(identity.componentKey && original.identity?.componentKey && (identity.componentSetKey
    ? identity.componentSetKey===original.identity.componentSetKey : !original.identity.componentSetKey && identity.componentKey===original.identity.componentKey));
  const identityKnown=!((node.unknownFacts||[])as string[]).some(p=>p==='component'||p==='component.identity'||p.startsWith('component.identity.'));
  if(!sameFamily || !identityKnown || selected.length!==1 || !['universal',snapshot.context.platform].includes(selected[0].platform))
    return {status:'active',reason:'dependency-child-identity-mismatch',node,nodeId:String(node.id),identityValid:false,ownerActive:true};
  const visibility=record(node.visibility).effective;
  if(((node.unknownFacts||[])as string[]).some(p=>['visible','visibility','visibility.effective'].includes(p)) || typeof visibility!=='boolean')return unavailable('dependency-visibility-unavailable');
  if(visibility===false)return {status:'inactive',reason:'target-hidden',node,nodeId:String(node.id),identityValid:true};
  return {status:'active',reason:'direct-child-proven',node,nodeId:String(node.id),identityValid:true,ownerActive:true};
}

/** The separately captured child actual must be the very same host subtree. */
function dependencyActualFacts(node: Record<string, unknown>): Record<string, unknown> | undefined {
  const facts = effectiveFacts(node, true), variable = record(facts.variable);
  if (variable.modeCatalog !== undefined) {
    const catalog = record(variable.modeCatalog), relevant: Record<string, unknown> = {};
    for (const key of Object.keys(record(variable.modes))) {
      if (!Object.prototype.hasOwnProperty.call(catalog, key)) return;
      relevant[key] = catalog[key];
    }
    // Capture-wide catalog inventory varies with siblings. Actual modes and
    // bindings, plus the complete catalog of each resolved mode, remain exact.
    facts.variable = {...variable};
    if (Object.keys(relevant).length) record(facts.variable).modeCatalog = relevant;
    else delete record(facts.variable).modeCatalog;
  } else if (Object.keys(record(variable.modes)).length) return;
  return facts;
}

/** Transient reader result only; never captured or authored in a contract. */
export type DependencyOwnerBaseline = Record<string, {effective: Record<string, unknown>; provenance: Record<string, unknown>; unknownFacts?:string[]}>;
function dependencyOwnerBaseline(snapshot: PreviewSnapshot, nodeMap: Record<string,string>, childRoot: string, contract:CompiledContract): {baseline?:DependencyOwnerBaseline;reason?:string} {
  if (!contract.capabilities.facts.some(f=>f==='baseline.effective'||f.startsWith('baseline.effective.'))) return {};
  if (snapshot.instanceContentReferences===undefined && snapshot.instanceContentResults===undefined) return {};
  const root=snapshot.nodes.find(n=>snapshot.selection.includes(String(n.id)));
  // Historical non-occurrence captures keep their original standalone semantics.
  if (snapshot.source?.occurrenceAddressVersion!==1 || root?.type!=='INSTANCE') return {};
  const evidence=snapshot.instanceContentReferences, base=evidence?.base, original=snapshot.variantReference;
  const identity=record(record(root.component).identity), baseRef=base && captureVariantReference(base,base.source?.componentKey||'',base.source?.componentSetKey||'',original?.definedProperties);
  if (!base || !original?.complete || !baseRef?.complete || !base.source?.rootNodeId
    || base.source.rootNodeId===snapshot.source.rootNodeId || stableHash(baseRef)!==stableHash(original)
    || base.context.platform!==snapshot.context.platform || stableHash(base.context.modes)!==stableHash(snapshot.context.modes)
    || [snapshot.context,base.context].some(c=>c.unknownFacts?.some(f=>['platform','context.platform','modes','context.modes'].includes(f)))
    || (root.unknownFacts as string[]||[]).some(f=>f==='component'||f==='component.identity'||f.startsWith('component.identity.'))
    || identity.componentKey!==original.componentKey || (identity.componentSetKey||'')!==original.componentSetKey
    || snapshot.source.componentKey!==original.componentKey || (snapshot.source.componentSetKey||'')!==original.componentSetKey)
    return {reason:'dependency-owner-baseline-unavailable'};
  // Rebuild from independent references. Imported baseline/matched annotations are not evidence.
  const fresh=materializeEffectiveBaseline(snapshot,base,true).snapshot;
  materializeInstanceContentReferences(fresh);
  const inverse=new Map(Object.entries(nodeMap).map(([local,host])=>[host,local])), baseline:DependencyOwnerBaseline={};
  for (const [local,host] of Object.entries(nodeMap)) {
    const node=fresh.nodes.find(n=>n.id===host), proof=record(node?.baselineProvenance), effective=record(record(node?.baseline).effective);
    if (proof.status!=='matched' || !Object.keys(effective).length) continue;
    const attempts=typeof proof.boundaryNodeId==='string'?evidence!.attempts.filter(a=>a.boundaryNodeId===proof.boundaryNodeId):[];
    const reference=proof.kind==='independent-host-variant'||proof.kind==='independent-host-swap'
      ? attempts.length===1?attempts[0].reference:undefined : base;
    const paths=reference && snapshotPaths(reference), expected=reference?.nodes.filter(n=>paths?.get(String(n.id))===proof.referencePath)||[];
    if (expected.length!==1) return {reason:'dependency-owner-baseline-unavailable'};
    const unknownFacts=(expected[0].unknownFacts as string[]||[]).filter(f=>Object.prototype.hasOwnProperty.call(effective,f.split('.')[0])).map(f=>'baseline.effective.'+f);
    const provenance=Object.assign({},proof);
    if (typeof provenance.boundaryNodeId==='string') {
      const localBoundary=inverse.get(provenance.boundaryNodeId);
      if (localBoundary) provenance.boundaryNodeId=localBoundary;
      else delete provenance.boundaryNodeId;
    }
    baseline[local]={effective:JSON.parse(JSON.stringify(effective)),provenance,unknownFacts};
  }
  return baseline[childRoot]?{baseline}:{reason:'dependency-owner-baseline-unavailable'};
}

/** Project only copied snapshot evidence, after preserving its captured channel checks. */
function projectDependencyEvidencePlatform(snapshot: PreviewSnapshot, capturedPlatform: string, platform: string): boolean {
  const pending = [snapshot], seen = new Set<PreviewSnapshot>();
  while (pending.length) {
    const current = pending.pop()!;
    if (seen.has(current)) continue;
    if (!current?.context || current.context.platform !== capturedPlatform
      || current.context.unknownFacts?.some(f => f === 'platform' || f === 'context.platform')) return false;
    seen.add(current);
    current.context = Object.assign({}, current.context, {platform});
    const evidence = current.instanceContentReferences;
    if (evidence) {
      pending.push(evidence.base);
      for (const attempt of evidence.attempts) if (attempt.reference) pending.push(attempt.reference);
    }
  }
  return true;
}

export function validatedDependencyCapture(snapshot: PreviewSnapshot, nodeId: string, childContract: CompiledContract): {snapshot?:PreviewSnapshot;nodeMap?:Record<string,string>;ownerBaseline?:DependencyOwnerBaseline;reason?:string} {
  const captures=snapshot.componentDependencyCaptures?.filter(c=>c.nodeId===nodeId)||[];
  if (captures.length!==1 || !captures[0].snapshot || !captures[0].nodeMap || captures[0].failure) return {reason:captures[0]?.failure || 'dependency-reference-not-captured'};
  const capture=captures[0], child=JSON.parse(JSON.stringify(capture.snapshot)) as PreviewSnapshot, nodeMap=capture.nodeMap!;
  if (child.source?.truncated || !child.variantReference?.complete || child.selection.length!==1 || nodeMap[child.selection[0]]!==nodeId
    || !snapshot.nodes.find(n=>n.id===nodeId)?.resolvedModes
    || stableHash(child.context.modes)!==stableHash(snapshot.nodes.find(n=>n.id===nodeId)!.resolvedModes)) return {reason:'dependency-capture-incomplete'};
  const paths=snapshotPaths(snapshot), prefix=paths?.get(nodeId);
  if (prefix===undefined) return {reason:'dependency-capture-topology-mismatch'};
  const expected=snapshot.nodes.filter(n=>withinBoundary(paths!.get(String(n.id))||'',prefix));
  const mapped=Object.values(nodeMap);
  if (expected.length!==child.nodes.length || mapped.length!==child.nodes.length || new Set(mapped).size!==mapped.length || expected.some(n=>!mapped.includes(String(n.id)))) return {reason:'dependency-capture-topology-mismatch'};
  for (const n of child.nodes) {
    const host=snapshot.nodes.find(h=>h.id===nodeMap[String(n.id)]);
    const actual=dependencyActualFacts(n),expected=host && dependencyActualFacts(host);
    if (!actual || !expected) return {reason:'dependency-capture-actual-mismatch'};
    // At the child root sourceIdentity belongs to the enclosing host, which is
    // outside the child capture. Compare intrinsic component facts, not this
    // outer-owner metadata. The binding independently proves that membership.
    if(expected && String(n.id)===child.selection[0] && snapshot.source?.occurrenceAddressVersion===1 && child.source?.occurrenceAddressVersion===1){
      actual.component={...record(actual.component)};expected.component={...record(expected.component)};
      delete record(actual.component).sourceIdentity;delete record(expected.component).sourceIdentity;
    }
    if (!host || n.type!==host.type || stableHash(actual)!==stableHash(expected)
      || (String(n.id)!==child.selection[0] && nodeMap[String(n.parentId)]!==host.parentId)) return {reason:'dependency-capture-actual-mismatch'};
  }
  const root=child.nodes.find(n=>child.selection.includes(String(n.id)))!;
  const identity=record(record(root.component).identity);
  if (!identity.componentKey || identity.componentKey!==child.source?.componentKey || (identity.componentSetKey || '')!==(child.source?.componentSetKey || '')) return {reason:'dependency-capture-identity-mismatch'};
  const key=identity.componentSetKey || identity.componentKey;
  const reps=childContract.facts.representations.filter(r=>r.kind==='figma'&&r.status!=='deprecated'&&[r.locator.componentKey,r.locator.componentSetKey].filter(Boolean).includes(key));
  if (reps.length!==1) return {reason:'dependency-representation-unresolved'};
  const capturedPlatform = child.context.platform, platform = reps[0].platform;
  const contextual=child.source?.occurrenceAddressVersion===1;
  if (contextual && (typeof capturedPlatform !== 'string' || !capturedPlatform.trim()
    || child.context.unknownFacts?.some(f => f === 'platform' || f === 'context.platform'))) return {reason:'dependency-reference-context-mismatch'};
  // Nested captures retain their own captured channel and local coordinates. Rebase host IDs only.
  const inverse=new Map(Object.entries(nodeMap).map(([local,host])=>[host,local]));
  child.componentDependencyCaptures=(snapshot.componentDependencyCaptures||[]).filter(c=>c.nodeId!==nodeId && inverse.has(c.nodeId)).map(c=>({
    ...c,nodeId:inverse.get(c.nodeId)!,nodeMap:c.nodeMap?Object.fromEntries(Object.entries(c.nodeMap).map(([local,host])=>[local,inverse.get(host)!])):undefined,
    snapshot:c.snapshot?JSON.parse(JSON.stringify(c.snapshot)):undefined,
  }));
  const parentChannelKnown = !snapshot.context.unknownFacts?.some(f => f === 'platform' || f === 'context.platform');
  const sameCapturedChannel = capturedPlatform === snapshot.context.platform
    || (snapshot.context.platform === 'universal' && parentChannelKnown);
  if (contextual && capturedPlatform !== platform && (platform !== 'universal' || !sameCapturedChannel
    || !projectDependencyEvidencePlatform(child, capturedPlatform, platform))) return {reason:'dependency-reference-context-mismatch'};
  child.context=Object.assign({},snapshot.context,{platform,modes:child.context.modes});
  const owner=contextual?dependencyOwnerBaseline(snapshot,nodeMap,child.selection[0],childContract):{};
  if (owner.reason) return {reason:owner.reason};
  return {snapshot:child,nodeMap,ownerBaseline:owner.baseline};
}
