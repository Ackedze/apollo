import type { CompiledContract, PreviewSnapshot } from "../packages/component-contract-core/src/types";
import { snapshotPaths } from "../packages/component-contract-core/src/snapshot-topology";
import { materializeVariantFacts, materializeVerifiedVariantTargets, variantAvailability } from "../packages/component-contract-core/src/variant-facts";
import { compareInstanceBoundaries, correspondingPath, withinBoundary } from "../packages/component-contract-core/src/instance-boundaries";
import { materializeInstanceContentReferences } from "../packages/component-contract-core/src/instance-content-reference";
import { prepareValidationSnapshot, evaluateCompiledContract } from "../packages/component-contract-core/src/runtime";
import { rawCatalogCorrespondence } from "../packages/component-contract-core/src/raw-catalog-reference";

export type OwnedAreaPart = {
  snapshotNodeId: string;
  ownerComponentId: string;
  ownerContractId: string;
  manualSourceHash: string;
  targetId: string;
  targetRole: string;
  referencePath: string;
  reason: 'component-owned-part';
  proofBasis?: 'pinned-raw-catalogue';
  ruleEvidence?: Array<{ruleId:string; targetId:string; subjectNodeId:string; classification:string; factPaths:string[]}>;
  coverage?: {state:'evaluated'|'partial'; uncertain:number};
};
const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const unknown = (node: Record<string, unknown>, fact: string) => ((node.unknownFacts || []) as string[])
  .some(path => path === fact || fact.startsWith(path + '.') || path.startsWith(fact + '.'));

/** Use only the transient enclosing baseline validated by auditContractSnapshot.
 * Captured matched annotations cannot resolve an unmatched capture warning. */
export function scopeOwnerBaselineCaptureWarnings(diagnostics: {
  warnings: string[]; baselineDiagnostics: Record<string, any>;
}, snapshot: PreviewSnapshot, ownerBaseline?: Parameters<typeof prepareValidationSnapshot>[3]) {
  if (!ownerBaseline) return diagnostics;
  const raw = diagnostics.baselineDiagnostics, marker = record(raw.producer), index = marker.warningIndex;
  const unmatched = raw.rawUnmatchedBaselineNodeIds, unresolved = raw.unresolvedBaselineNodeIds;
  if (!raw.markerAccepted || !Array.isArray(unmatched) || !unmatched.length
    || unmatched.some(id => typeof id !== 'string') || new Set(unmatched).size !== unmatched.length
    || !Array.isArray(unresolved) || !unresolved.length || new Set(unresolved).size !== unresolved.length
    || unresolved.some(id => !unmatched.includes(id)) || !Array.isArray(raw.rawWarnings)
    || Object.keys(marker).sort().join(',') !== 'kind,unmatchedNodeIds,warning,warningIndex'
    || marker.kind !== 'unmatched-baseline' || !Number.isSafeInteger(index) || index < 0
    || raw.rawWarnings[index] !== marker.warning || !Array.isArray(marker.unmatchedNodeIds)
    || marker.unmatchedNodeIds.length !== unmatched.length || marker.unmatchedNodeIds.some((id: string, i: number) => id !== unmatched[i])) return diagnostics;
  const expectedWarnings = raw.rawWarnings.slice();
  if (unresolved.length !== unmatched.length) expectedWarnings[index] = `${unresolved.length} узлов instance не сопоставлены с reference baseline.`;
  if (JSON.stringify(expectedWarnings) !== JSON.stringify(diagnostics.warnings)) return diagnostics;
  const nodes = new Map(snapshot.nodes.map(node => [String(node.id), node]));
  const matched = unresolved.filter(id => {
    const node = nodes.get(id), baseline = ownerBaseline[id];
    return node && (node.unknownFacts === undefined || Array.isArray(node.unknownFacts) && node.unknownFacts.every(fact => typeof fact === 'string'))
      && !['id', 'type', 'parentId', 'component.identity'].some(fact => unknown(node, fact))
      && baseline?.provenance.status === 'matched' && typeof baseline.provenance.referencePath === 'string'
      && Object.keys(record(baseline.effective)).length > 0;
  });
  if (!matched.length) return diagnostics;
  const remaining = unresolved.filter(id => !matched.includes(id)), warnings = diagnostics.warnings.slice();
  warnings.splice(index, 1, ...(remaining.length ? [`${remaining.length} узлов instance не сопоставлены с reference baseline.`] : []));
  return { warnings, baselineDiagnostics: Object.assign({}, raw, {
    unresolvedBaselineNodeIds: remaining, ownerBaselineMatchedNodeIds: matched,
  }) };
}

/** Coverage evidence only. A known hidden target is not a missing target;
 * assertions, including presence/visibility violations, remain untouched. */
export function hiddenContractTarget(snapshot: PreviewSnapshot, contract: CompiledContract, targetId: string,
  ownerBaseline?: Parameters<typeof prepareValidationSnapshot>[3]) {
  const paths = snapshotPaths(snapshot), reference = snapshot.variantReference;
  if (!paths || !reference?.complete || snapshot.selection.length !== 1 || snapshot.source?.truncated
    || snapshot.source?.captureTopology?.complete !== true || snapshot.source.captureTopology.limitReached
    || snapshot.source.captureTopology.issues?.length) return;
  const target = contract.facts.targets.find(t => t.id === targetId && t.resolution === 'resolved');
  if (!target) return;
  const available = variantAvailability(snapshot, contract), resolved = available.targets[target.semanticRole];
  if (available.status === 'unknown') return;
  const comparison = compareInstanceBoundaries(snapshot, reference);
  let targetPath = resolved?.state === 'present' ? resolved.path : undefined;
  let inheritedNodeId: string | undefined;
  // A typed BOOLEAN can identify an inactive part inside an enclosing variant.
  // Recompute that proof; serialized semantic roles are never authoritative.
  if (targetPath === undefined) {
    const proven = prepareValidationSnapshot(snapshot, contract, undefined, ownerBaseline);
    const root = proven.nodes.find(n => proven.selection.includes(String(n.id)));
    const presence = record(record(root?.variantAvailability).targets)[target.semanticRole];
    const candidates = proven.nodes.filter(n => record(n.semantic).role === target.semanticRole);
    if (presence?.present !== true || candidates.length !== 1) return;
    if (presence.evidence === 'native-slot-reference') targetPath = correspondingPath(comparison, paths.get(String(candidates[0].id))!);
    else if (presence.evidence === 'explicit-independent-host-variant-text') {
      const inherited = record(ownerBaseline?.[String(candidates[0].id)]?.provenance);
      if (inherited.status !== 'matched' || !inherited.enclosingReferencePath || typeof inherited.referencePath !== 'string') return;
      targetPath = inherited.referencePath;
      inheritedNodeId = String(candidates[0].id);
    } else return;
  }
  if (targetPath === undefined) return;
  const matches = snapshot.nodes.filter(n => inheritedNodeId ? String(n.id) === inheritedNodeId
    : correspondingPath(comparison, paths.get(String(n.id))!) === targetPath);
  if (matches.length !== 1 || snapshot.selection.includes(String(matches[0].id))) return;
  const node = matches[0], path = paths.get(String(node.id))!;
  const crossed = comparison.boundaries.filter(b => withinBoundary(path, b.actualPath));
  if (crossed.length) {
    const inherited = record(ownerBaseline?.[String(node.id)]?.provenance);
    const current = record(node.baselineProvenance);
    if (crossed.some(b => b.reason !== 'component-variant-changed') || inherited.status !== 'matched'
      || !inherited.enclosingReferencePath || inherited.referencePath !== targetPath
      || current.status !== 'matched' || current.referencePath !== inherited.referencePath
      || current.enclosingReferencePath !== inherited.enclosingReferencePath) return;
  }
  if (contract.runtimePolicy.declaredTargetIdentityVersion) {
    const identity = record(record(snapshot).declaredTargetIdentitiesV1).targets?.filter((t: Record<string, unknown>) => t.targetId === targetId);
    if (identity?.length !== 1 || identity[0].status !== 'resolved' || identity[0].present !== true
      || identity[0].nodeId !== node.id || identity[0].effectiveVisible !== false) return;
  }
  const byId = new Map(snapshot.nodes.map(n => [String(n.id), n]));
  let ancestor: typeof node | undefined = node, hidden = false;
  while (ancestor) {
    if (unknown(ancestor, 'visible') || unknown(ancestor, 'visibility.effective')
      || unknown(ancestor, 'parentId') || unknown(ancestor, 'type')
      || typeof ancestor.visible !== 'boolean') return;
    hidden ||= ancestor.visible === false;
    ancestor = ancestor.parentId === null ? undefined : byId.get(String(ancestor.parentId));
  }
  return hidden ? { targetId, nodeId: String(node.id), referencePath: targetPath,
    reason: 'exact independent target is effectively hidden', manualSourceHash: contract.package.manualSourceHash } : undefined;
}

/** A closed component-owned scope may contain no text at all. Prove that on
 * both sides; a missing, hidden or foreign owned text is not an empty scope. */
export function emptyOwnedTextScope(snapshot: PreviewSnapshot, contract: CompiledContract, policyId: string) {
  const policy = contract.customizationPolicy.find(p => p.id === policyId);
  if (!policy || policy.boundaryPolicy !== 'component-owned@1' || policy.targetScope !== 'self-and-descendants'
    || policy.capability !== 'text.typography' || !contract.facts.targets.some(t => t.id === policy.targetId && t.semanticRole === 'root')
    || snapshot.source?.truncated || snapshot.source?.captureTopology?.complete !== true
    || snapshot.source.captureTopology.limitReached || snapshot.source.captureTopology.issues?.length
    || !snapshot.variantReference?.complete) return;
  const proven = prepareValidationSnapshot(snapshot, contract), paths = snapshotPaths(proven);
  const comparison = compareInstanceBoundaries(proven, snapshot.variantReference);
  if (!paths || !comparison.complete || proven.nodes.some(n => typeof record(n.ruleScopeV1).local !== 'boolean'
    || unknown(n, 'type') || unknown(n, 'parentId'))) return;
  const boundaries = proven.nodes.filter(n => record(n.slotBoundaryV1).contentOwnership === 'external');
  const external = boundaries.map(n => paths.get(String(n.id))!);
  if (!external.length || comparison.boundaries.some(b => !external.some(p => withinBoundary(b.actualPath, p)))) return;
  if (proven.nodes.some(n => n.type === 'TEXT' && record(n.ruleScopeV1).local !== false)) return;
  const referenceBoundaries = external.map(p => correspondingPath(comparison, p));
  if (referenceBoundaries.some(p => p === undefined) || snapshot.variantReference.nodes.some(n => n.type === 'TEXT'
    && !referenceBoundaries.some(p => withinBoundary(n.path, p!)))) return;
  return { targetId: policy.targetId, reason: 'independent component-owned scope contains no TEXT',
    manualSourceHash: contract.package.manualSourceHash };
}

/** Attribution only. A declared semantic part needs independent correspondence;
 * this never executes rules, hides host gaps or grants a library baseline. */
export function collectContractOwnedParts(snapshot: PreviewSnapshot, contract: CompiledContract, evaluations?: any[]): OwnedAreaPart[] {
  if ((snapshot as any).rawCatalogueReference?.base?.source?.rawCatalogue) return collectRawOwnedParts(snapshot,contract,evaluations);
  const paths = snapshotPaths(snapshot), reference = snapshot.variantReference;
  if (!paths || !reference?.complete || snapshot.source?.propertyReferenceIdentityVersion !== 1) return [];
  const available = variantAvailability(snapshot, contract);
  if (available.status === 'unknown') return [];
  const comparison = compareInstanceBoundaries(snapshot, reference);
  const external: string[] = [];
  // External content stays independently routed even when it has a declared
  // semantic target or agrees with the initial component reference.
  for (const policy of contract.customizationPolicy.filter(policy => policy.status !== 'deprecated')) {
    for (const control of policy.controlPaths.filter(control => control.contentOwnership === 'external')) {
      const target = contract.facts.targets.find(target => target.id === control.target);
      const resolved = target && available.targets[target.semanticRole];
      if (!resolved || resolved.state === 'unknown') return [];
      if (resolved.state === 'present' && resolved.path !== undefined) external.push(resolved.path);
    }
  }
  const byId = new Map(snapshot.nodes.map(node => [String(node.id), node]));
  const ownsFixedSubtree = contract.customizationPolicy.some(policy => policy.status !== 'deprecated'
    && policy.permission === 'forbidden' && policy.capability === 'component.baseline'
    && policy.targetScope === 'self-and-descendants'
    && contract.facts.targets.some(target => target.id === policy.targetId && target.semanticRole === 'root'));
  const parts: OwnedAreaPart[] = [];
  let verified: PreviewSnapshot | undefined;
  for (const node of snapshot.nodes) {
    if (node.type !== 'INSTANCE') continue;
    const path = paths.get(String(node.id))!;
    if (!path) continue;
    const referencePath = correspondingPath(comparison, path);
    if (referencePath === undefined || external.some(boundary => withinBoundary(referencePath, boundary))) continue;
    const boundaries = comparison.boundaries.filter(boundary => withinBoundary(path, boundary.actualPath));
    let configuredVariant = false;
    let proven: Record<string, any> | undefined;
    if (boundaries.length) {
      const boundary = boundaries[0];
      if (boundaries.length !== 1 || boundary.nodeId !== node.id || boundary.reason !== 'component-variant-changed') continue;
      if (!verified) {
        // Revalidate the existing independent host evidence; cached roles or a
        // shared component set alone cannot turn a replacement into an owned part.
        verified = JSON.parse(JSON.stringify(snapshot)) as PreviewSnapshot;
        materializeVariantFacts(verified, contract);
        materializeInstanceContentReferences(verified);
        materializeVerifiedVariantTargets(verified, contract);
      }
      proven = verified.nodes.find(candidate => candidate.id === node.id);
      const provenance = record(proven?.baselineProvenance);
      const results = verified.instanceContentResults?.filter(result => result.boundaryNodeId === node.id) || [];
      configuredVariant = results.length === 1 && results[0].status === 'matched' && results[0].lineageProven === true
        && results[0].matchedNodeIds.includes(String(node.id)) && provenance.status === 'matched'
        && provenance.kind === 'independent-host-variant' && provenance.boundaryNodeId === node.id
        && provenance.componentKey === boundary.actualComponentKey && provenance.componentSetKey === boundary.componentSetKey;
      if (!configuredVariant || unknown(node, 'type') || unknown(node, 'parentId')) continue;
    }
    const targets = contract.facts.targets.filter(target => target.resolution === 'resolved'
      && (configuredVariant ? record(proven?.semantic).role === target.semanticRole
        && record(record(proven?.variantAvailability).targets)[target.semanticRole]?.present === true
        : available.targets[target.semanticRole]?.state === 'present' && available.targets[target.semanticRole]?.path === referencePath));
    if (targets.length !== 1) continue;
    // Caller content in native SLOTs and INSTANCE_SWAP ports is never an
    // implicit owned part. An unknown port/identity cannot prove ownership.
    let ancestor: Record<string, unknown> | undefined = node, blocked = false;
    while (ancestor) {
      const component = record(ancestor.component);
      if (ancestor.type === 'SLOT' || component.propertyReferenceBindings?.mainComponent !== undefined && !ownsFixedSubtree
        || unknown(ancestor, 'component.identity') || unknown(ancestor, 'component.propertyReferenceBindings')) { blocked = true; break; }
      ancestor = ancestor.parentId === null ? undefined : byId.get(String(ancestor.parentId));
    }
    if (blocked) continue;
    const identity = record(record(node.component).identity), expected = reference.nodeProperties[referencePath]?.identity;
    if (!expected?.componentKey || !identity.componentKey || !configuredVariant && identity.componentKey !== expected.componentKey
      || (identity.componentSetKey || '') !== (expected.componentSetKey || '')) continue;
    parts.push({ snapshotNodeId: String(node.id), ownerComponentId: contract.package.componentId,
      ownerContractId: contract.package.id, manualSourceHash: contract.package.manualSourceHash,
      targetId: targets[0].id, targetRole: targets[0].semanticRole, referencePath, reason: 'component-owned-part' });
  }
  return parts;
}

function collectRawOwnedParts(snapshot:PreviewSnapshot,contract:CompiledContract,evaluations?:any[]):OwnedAreaPart[] {
  if(snapshot.source?.propertyReferenceIdentityVersion!==1||!snapshotPaths(snapshot))return [];
  const base=(snapshot as any).rawCatalogueReference.base;
  const fresh=prepareValidationSnapshot(snapshot,contract), paths=snapshotPaths(fresh)!;
  const {matches}=rawCatalogCorrespondence(fresh,base,contract);
  if(!matches.size)return [];
  const ledger=(fresh as any).declaredTargetIdentitiesV1?.targets || [], external:string[]=[];
  for(const policy of contract.customizationPolicy.filter(p=>p.status!=='deprecated'))for(const control of policy.controlPaths)
    if(control.contentOwnership==='external') {
      const target=ledger.find((t:any)=>t.targetId===control.target);
      if(!target||target.status!=='resolved')return [];
      if(target.present!==false)external.push(target.referencePath);
    }
  const ran:any[]=evaluations || evaluateCompiledContract(snapshot,contract).evaluations as any[], parts:OwnedAreaPart[]=[];
  const byId=new Map(fresh.nodes.map(n=>[String(n.id),n]));
  const fixed=contract.customizationPolicy.some(p=>p.status!=='deprecated'&&p.permission==='forbidden'
    &&p.capability==='component.baseline'&&p.targetScope==='self-and-descendants'
    &&contract.facts.targets.some(t=>t.id===p.targetId&&t.semanticRole==='root'));
  for(const node of fresh.nodes) {
    const match=matches.get(String(node.id)), path=paths.get(String(node.id))!;
    if(node.type!=='INSTANCE'||!path||!match||external.some(p=>withinBoundary(match.referencePath,p)))continue;
    const targets=ledger.filter((t:any)=>t.status==='resolved'&&t.nodeId===node.id);
    if(targets.length!==1)continue;
    let ancestor:any=node,blocked=false;
    while(ancestor) {
      if(ancestor.type==='SLOT'||record(ancestor.component).propertyReferenceBindings?.mainComponent!==undefined&&!fixed
        ||['id','type','parentId','component.identity','component.propertyReferenceBindings'].some(f=>unknown(ancestor,f))) {blocked=true;break;}
      ancestor=ancestor.parentId===null?undefined:byId.get(String(ancestor.parentId));
    }
    if(blocked)continue;
    const target=targets[0],boundFacts=contract.facts.semanticApi.filter(p=>p.bindings.some(b=>b.targetId===target.targetId
      &&b.representationId===fresh.source?.representationId)).flatMap(p=>['semanticApi.'+p.id,'host.semanticApi.'+p.id]);
    const evidence=ran.filter(e=>e.subjectNodeId&&paths.has(e.subjectNodeId)
      &&(withinBoundary(paths.get(e.subjectNodeId)!,path)||e.trace?.factPaths?.some((f:string)=>boundFacts.includes(f)))&&e.classification!=='not-applicable'
      &&e.trace?.reason!=='rule authority is not active'&&contract.rules.some(r=>r.ruleId===e.ruleId));
    if(!evidence.some(e=>['compliant','violation','allowed'].includes(e.classification)))continue;
    const uncertain=evidence.filter(e=>!['compliant','violation','allowed'].includes(e.classification)).length;
    parts.push({snapshotNodeId:String(node.id),ownerComponentId:contract.package.componentId,ownerContractId:contract.package.id,
      manualSourceHash:contract.package.manualSourceHash,targetId:target.targetId,targetRole:target.semanticRole,
      referencePath:match.referencePath,reason:'component-owned-part',proofBasis:'pinned-raw-catalogue',
      ruleEvidence:evidence.map(e=>({ruleId:e.ruleId,targetId:target.targetId,subjectNodeId:e.subjectNodeId,classification:e.classification,
        factPaths:e.trace?.factPaths || []})),
      coverage:{state:uncertain?'partial':'evaluated',uncertain}});
  }
  return parts;
}

/** Permission covers the boundary only. Payloads still need their own contract
 * when one exists; missing payload contracts must not be called component-owned. */
export function collectPermittedExternalParts(snapshot: PreviewSnapshot, contract: CompiledContract) {
  if (!contract.customizationPolicy.some(policy => policy.controlPaths.some(control => control.contentOwnership === 'external'))) return [];
  if (!snapshotPaths(snapshot) || !snapshot.variantReference?.complete || snapshot.source?.propertyReferenceIdentityVersion !== 1) return [];
  const prepared = prepareValidationSnapshot(snapshot, contract), paths = snapshotPaths(prepared);
  if (!paths) return [];
  const result: Array<Record<string, unknown>> = [];
  for (const boundary of prepared.nodes) {
    const proof = record(boundary.slotBoundaryV1), path = paths.get(String(boundary.id));
    if (proof.contentOwnership !== 'external' || !path
      || !['native-slot-content-reference', 'native-instance-swap-reference'].includes(proof.evidence)) continue;
    const allowed = contract.customizationPolicy.some(policy => {
      const a = policy.applicability;
      return policy.status !== 'deprecated' && policy.permission === 'allowed' && a.scopeStatus === 'confirmed'
        && a.variants === 'all' && a.modes === 'all' && a.platforms.includes(snapshot.context.platform)
        && !a.activeDependency && !a.validationMode && !Object.keys(a.context || {}).length
        && !Object.keys(a.contextDomains || {}).length && !a.products?.length && !a.channels?.length
        && policy.controlPaths.some(control => control.kind === 'slot-api' && control.contentOwnership === 'external'
          && control.target === proof.targetId && control.property === proof.property);
    });
    if (!allowed) continue;
    for (const node of prepared.nodes) {
      const child = paths.get(String(node.id));
      if (node.type !== 'INSTANCE' || !child || !withinBoundary(child, path)
        || boundary.type === 'SLOT' && node === boundary) continue;
      result.push({snapshotNodeId: String(node.id), boundaryNodeId: String(boundary.id), targetId: proof.targetId,
        property: proof.property, parentContractId: contract.package.id, manualSourceHash: contract.package.manualSourceHash,
        reason: 'permitted-external-content', validationScope: 'boundary-only', payloadValidation: 'unverified'});
    }
  }
  return result;
}

/** Parent diagnostics only. External SLOT payload retains its raw missing
 * baseline evidence and remains eligible for its own independent checks. */
export function scopeContractCaptureWarnings(captured: {
  snapshot: PreviewSnapshot; warnings: string[]; unmatchedBaselineNodeIds: string[]; baselineDiagnostics?: unknown;
}, contract: CompiledContract) {
  const { snapshot } = captured, paths = snapshotPaths(snapshot), reference = snapshot.variantReference;
  const unmatched = captured.unmatchedBaselineNodeIds.slice(), external = new Set<string>();
  const byId = new Map(snapshot.nodes.map(node => [String(node.id), node]));
  if (paths && reference?.complete && new Set(unmatched).size === unmatched.length) {
    const available = variantAvailability(snapshot, contract), comparison = compareInstanceBoundaries(snapshot, reference);
    const refNodes = new Map(reference.nodes.map(node => [node.path, node]));
    const slots = new Set<string>();
    if (available.status !== 'unknown' && comparison.complete) for (const slot of snapshot.nodes.filter(node => node.type === 'SLOT')) {
      const path = paths.get(String(slot.id))!, referencePath = correspondingPath(comparison, path);
      const property = record(record(slot.component).propertyReferenceBindings).slotContentId;
      if (referencePath === undefined || typeof property !== 'string' || !property
        || refNodes.get(referencePath)?.type !== 'SLOT' || reference.nodeProperties[referencePath]?.propertyReferenceBindings?.slotContentId !== property
        || unknown(slot, 'component.propertyReferenceBindings') || unknown(slot, 'type') || unknown(slot, 'parentId')) continue;
      const targets = contract.facts.targets.filter(target => target.resolution === 'resolved'
        && available.targets[target.semanticRole]?.state === 'present' && available.targets[target.semanticRole]?.path === referencePath);
      if (targets.length !== 1) continue;
      const controls = contract.customizationPolicy.filter(policy => policy.status !== 'deprecated'
        && ['allowed', 'constrained'].includes(policy.permission)).flatMap(policy => policy.controlPaths.filter(control => control.kind === 'slot-api'
          && control.target === targets[0].id && control.property === property && control.contentOwnership === 'external'));
      if (!controls.length) continue;
      let owner = byId.get(String(slot.parentId));
      while (owner && owner.type !== 'INSTANCE' && !unknown(owner, 'parentId') && !unknown(owner, 'type')) owner = byId.get(String(owner.parentId));
      const ownerPath = owner && paths.get(String(owner.id)), expected = ownerPath !== undefined
        ? reference.nodeProperties[correspondingPath(comparison, ownerPath)!] : undefined;
      const identity = record(record(owner?.component).identity);
      if (!owner || owner.type !== 'INSTANCE' || !expected?.identity?.componentKey || identity.componentKey !== expected.identity.componentKey
        || (identity.componentSetKey || '') !== (expected.identity.componentSetKey || '') || unknown(owner, 'component.identity')
        || unknown(owner, 'type') || unknown(owner, 'parentId') || unknown(owner, `component.propertyTypes.${property}`)
        || record(record(owner.component).propertyTypes)[property] !== 'SLOT' || expected.propertyTypes[property] !== 'SLOT') continue;
      if (!controls.some(control => !control.ownerTargetId || (() => {
        const owners = contract.facts.targets.filter(target => target.id === control.ownerTargetId && target.resolution === 'resolved');
        const resolved = owners.length === 1 ? available.targets[owners[0].semanticRole] : undefined;
        return resolved?.state === 'present' && resolved.path === correspondingPath(comparison, ownerPath!);
      })())) continue;
      slots.add(String(slot.id));
    }
    for (const id of unmatched) {
      let node = byId.get(id);
      while (node && !unknown(node, 'parentId') && !unknown(node, 'type')) {
        node = byId.get(String(node.parentId));
        if (node && slots.has(String(node.id))) { external.add(id); break; }
      }
    }
  }
  const unresolved = unmatched.filter(id => !external.has(id));
  const marker = record(captured.baselineDiagnostics), baselineIndex = marker.warningIndex;
  const markerAccepted = Object.keys(marker).sort().join(',') === 'kind,unmatchedNodeIds,warning,warningIndex'
    && marker.kind === 'unmatched-baseline' && unmatched.length > 0 && Number.isSafeInteger(baselineIndex)
    && baselineIndex >= 0 && baselineIndex < captured.warnings.length && typeof marker.warning === 'string'
    && captured.warnings[baselineIndex] === marker.warning && Array.isArray(marker.unmatchedNodeIds)
    && marker.unmatchedNodeIds.length === unmatched.length && marker.unmatchedNodeIds.every((id: unknown, index: number) => id === unmatched[index]);
  const warnings = captured.warnings.slice();
  if (external.size && markerAccepted) warnings.splice(baselineIndex, 1,
    ...(unresolved.length ? [`${unresolved.length} узлов instance не сопоставлены с reference baseline.`] : []));
  return { warnings, baselineDiagnostics: { rawWarnings: captured.warnings.slice(), rawUnmatchedBaselineNodeIds: unmatched,
    unresolvedBaselineNodeIds: unresolved, externalSlotPayloadNodeIds: [...external], markerAccepted,
    producer: captured.baselineDiagnostics } };
}
