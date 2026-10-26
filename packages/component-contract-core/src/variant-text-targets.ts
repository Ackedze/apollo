import type { CompiledContract, PreviewSnapshot, SemanticTarget } from './types';
import { snapshotPaths } from './snapshot-topology';
import { matchesCaptureRepresentation } from './capture-representation';
import { relativeTargetPath, variantAvailability } from './variant-facts';
import { selectedTargetPathHint } from './occurrence-address';

const record = (v: any): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const unknown = (n: any, path: string) => (n.unknownFacts || []).some((p: string) => p === path || path.startsWith(p + '.'));

/** Explicit semantic continuity, not name inference or permission. Independent
 * variant references have already been revalidated by the content materializer.
 * Actual colors/typography are never replaced by that reference. */
export function materializeVariantTextTargets(snapshot: PreviewSnapshot, contract: CompiledContract): void {
  if (contract.runtimePolicy.variantTextTargetsVersion !== 1) return;
  // Discard cached roles when this run could not establish normal variant availability.
  for (const target of contract.facts.targets.filter(t => t.variantContinuity)) for (const node of snapshot.nodes) {
    if (record(node.semantic).role === target.semanticRole && record(record(node.variantAvailability).targets)[target.semanticRole]?.present !== true) {
      delete record(node.semantic).role;
    }
  }
  if (snapshot.instanceContentReferences?.schemaVersion !== 'apollo.instance-content-references.v4') return;
  const ref = snapshot.variantReference, paths = snapshotPaths(snapshot);
  if (!ref || !paths || variantAvailability(snapshot, contract).status !== 'partial') return;
  const reps = contract.facts.representations.filter(r => r.status !== 'deprecated' && r.platform === snapshot.context.platform
    && matchesCaptureRepresentation(r, ref.componentKey, ref.componentSetKey));
  if (reps.length !== 1) return;
  const targetPath = (t: SemanticTarget) => {
    const p=selectedTargetPathHint(t,reps[0].id,ref.componentKey,contract.facts.variantEvidence?.occurrenceAddressVersion===1);
    return p ? relativeTargetPath(p) : undefined;
  };
  const candidates: Array<{ role: string; node: PreviewSnapshot['nodes'][number] }> = [];
  for (const target of contract.facts.targets) {
    const c = target.variantContinuity;
    if (!c || c.kind !== 'same-family-text' || target.resolution !== 'resolved') continue;
    const anchors = contract.facts.targets.filter(t => t.id === c.anchorTargetId && t.resolution === 'resolved' && !t.variantContinuity);
    if (anchors.length !== 1) continue;
    const path = targetPath(target), anchorPath = targetPath(anchors[0]);
    if (!path || !anchorPath || !path.startsWith(anchorPath + ' / ')) continue;
    const anchorsInSnapshot = snapshot.nodes.filter(n => record(n.semantic).role === anchors[0].semanticRole && n.type === 'INSTANCE');
    if (anchorsInSnapshot.length !== 1) continue;
    const anchor = anchorsInSnapshot[0], ap = record(anchor.baselineProvenance);
    if (ap.status !== 'matched' || ap.kind !== 'independent-host-variant' || ap.boundaryNodeId !== anchor.id
      || ap.referencePath !== anchorPath || !ap.componentSetKey || unknown(anchor, 'component.identity')) continue;
    const identity = record(record(anchor.component).identity);
    if (identity.componentKey !== ap.componentKey || identity.componentSetKey !== ap.componentSetKey) continue;
    const result = snapshot.instanceContentResults?.filter(r => r.boundaryNodeId === anchor.id) || [];
    if (result.length !== 1 || result[0].status !== 'matched' || !result[0].lineageProven) continue;
    const attempts = snapshot.instanceContentReferences.attempts.filter(a => a.boundaryNodeId === anchor.id);
    if (attempts.length !== 1 || attempts[0].strategy !== 'pristine-host-variant-properties' || !attempts[0].reference) continue;
    const reference = attempts[0].reference, referencePaths = snapshotPaths(reference);
    const refs = reference.nodes.filter(n => referencePaths?.get(String(n.id)) === path && n.type === 'TEXT');
    if (refs.length !== 1) continue;
    const nodes = snapshot.nodes.filter(n => {
      const p = record(n.baselineProvenance);
      return n.type === 'TEXT' && p.status === 'matched' && p.kind === 'independent-host-variant'
        && p.boundaryNodeId === anchor.id && p.componentKey === ap.componentKey && p.referencePath === path
        && result[0].matchedNodeIds.includes(String(n.id));
    });
    if (nodes.length !== 1) continue;
    const node = nodes[0], byId = new Map(snapshot.nodes.map(n => [String(n.id), n]));
    // Do not cross another component/swap boundary, even if a same-named TEXT exists.
    let parent = byId.get(String(node.parentId));
    while (parent && parent.type !== 'INSTANCE') parent = byId.get(String(parent.parentId));
    if (parent !== anchor || unknown(node, 'type') || unknown(node, 'parentId')) continue;
    candidates.push({ role: target.semanticRole, node });
  }
  for (const { role, node } of candidates) {
    if (contract.facts.targets.filter(t => t.semanticRole === role).length !== 1
      || candidates.filter(c => c.node.id === node.id).length !== 1
      || snapshot.nodes.some(n => n !== node && record(n.semantic).role === role)) continue;
    node.semantic = { ...record(node.semantic), role };
    node.unknownFacts = ((node.unknownFacts || []) as string[]).filter(p => p !== 'semantic.role');
    for (const entry of snapshot.nodes) {
      const facts = record(entry.variantAvailability);
      facts.targets = { ...record(facts.targets), [role]: { present: true, referenceState: 'present', evidence: 'explicit-independent-host-variant-text' } };
      entry.variantAvailability = facts;
      entry.unknownFacts = ((entry.unknownFacts || []) as string[]).filter(p => p !== `variantAvailability.targets.${role}.present`);
    }
  }
}
