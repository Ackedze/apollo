import type { PreviewSnapshot } from './types';
import type { InstanceContentResult } from './instance-content-reference';
import { compareInstanceBoundaries, correspondingPath, withinBoundary, type InstanceBoundary } from './instance-boundaries';
import { captureVariantReference, propertyAvailabilityKey } from './variant-facts';
import { effectiveFacts } from './instance-validation';
import { snapshotPaths } from './snapshot-topology';
import { stableHash } from './stable';
import { hostContextFacts } from './host-context-variable-modes';

export const INSTANCE_CONTENT_REFERENCE_LIMIT = 8;

const record = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const referenceFor = (s: PreviewSnapshot) => captureVariantReference(s, s.source?.componentKey || '', s.source?.componentSetKey || '');
const nodesByPath = (s: PreviewSnapshot) => {
  const paths = snapshotPaths(s);
  return paths && new Map(s.nodes.map(n => [paths.get(String(n.id))!, n]));
};

/** Next stage is relative to an independent host, never relative to actual styles. */
export function planNestedInstanceContentReferences(snapshot: PreviewSnapshot, reference: PreviewSnapshot, parent: InstanceBoundary): InstanceBoundary[] {
  const comparison = compareInstanceBoundaries(snapshot, referenceFor(reference), true);
  return comparison.complete ? comparison.boundaries.filter(b => b.actualPath !== parent.actualPath
    && withinBoundary(b.actualPath, parent.actualPath)) : [];
}

/** v4 is a bounded, independently verified chain: host variant -> child swap -> … .
 * Older report versions deliberately retain their original interpretation. */
export function materializeNestedInstanceContentReferences(snapshot: PreviewSnapshot): void {
  const evidence = snapshot.instanceContentReferences!;
  const actual = nodesByPath(snapshot), original = snapshot.variantReference;
  const results: InstanceContentResult[] = [];
  snapshot.instanceContentResults = results;
  const comparison = original && compareInstanceBoundaries(snapshot, original, true);
  const roots = comparison?.complete ? comparison.boundaries : [];
  snapshot.instanceBoundaries = [...roots];
  const base = evidence.base;
  const baseRef = base && captureVariantReference(base, base.source?.componentKey || '', base.source?.componentSetKey || '', original?.definedProperties);
  const baseValid = actual && original?.complete && baseRef?.complete
    && base.source?.rootNodeId && base.source.rootNodeId !== snapshot.source?.rootNodeId
    && stableHash(baseRef) === stableHash(original)
    && base.context.platform === snapshot.context.platform && stableHash(base.context.modes) === stableHash(snapshot.context.modes);
  let visited = 0;
  const visit = (boundary: InstanceBoundary, context: PreviewSnapshot, parentId?: string): InstanceContentResult => {
    const result: InstanceContentResult = {boundaryNodeId:boundary.nodeId,status:'unresolved',reason:'reference-not-captured',matchedNodeIds:[]};
    results.push(result);
    if (actual) for (const [path,node] of actual) if (withinBoundary(path,boundary.actualPath)) {
      node.baseline = {effective:{}};
      node.baselineProvenance = {status:'unresolved',reason:boundary.reason,boundaryNodeId:boundary.nodeId};
      if (node.semantic) delete record(node.semantic).role;
    }
    const fail = (reason: string) => {result.reason=reason; return result;};
    if (++visited > INSTANCE_CONTENT_REFERENCE_LIMIT) return fail('reference-capture-limit');
    if (!baseValid) return fail('original-host-evidence-invalid');
    if (evidence.hostContextVariableModesVersion !== undefined && evidence.hostContextVariableModesVersion !== 1) return fail('host-context-mode-version-unsupported');
    const variant = boundary.reason === 'component-variant-changed' && Boolean(boundary.componentSetKey);
    if (!boundary.actualComponentKey || (!variant && (boundary.reason!=='instance-swap'||!boundary.property||boundary.ownerPath===undefined))) return fail('explicit-swap-port-required');
    const attempts = evidence.attempts.filter(a => a.boundaryNodeId === boundary.nodeId);
    if (attempts.length!==1) return fail(attempts.length?'ambiguous-reference':'reference-not-captured');
    const attempt=attempts[0], reference=attempt.reference;
    if (attempt.parentBoundaryNodeId!==parentId) return fail('reference-parent-mismatch');
    if (attempt.failure || !reference) return fail(attempt.failure||'reference-not-captured');
    if (variant && attempt.strategy!=='pristine-host-variant-properties') return fail('variant-capture-strategy-unproven');
    const expected=nodesByPath(reference), contextNodes=nodesByPath(context);
    const refId=reference.source?.rootNodeId;
    if (!expected||!contextNodes||!refId||refId===snapshot.source?.rootNodeId||refId===base.source?.rootNodeId||refId===context.source?.rootNodeId
      || reference.context.platform!==snapshot.context.platform||stableHash(reference.context.modes)!==stableHash(snapshot.context.modes)) return fail('replacement-reference-incomplete');
    const change=compareInstanceBoundaries(reference,referenceFor(context),true), refBoundary=change.boundaries[0];
    if (!change.complete||change.boundaries.length!==1||refBoundary.reason!==boundary.reason
      ||refBoundary.referencePath!==boundary.referencePath||refBoundary.ownerPath!==boundary.ownerPath||refBoundary.property!==boundary.property
      ||refBoundary.actualComponentKey!==boundary.actualComponentKey||refBoundary.componentSetKey!==boundary.componentSetKey) return fail('replacement-identity-or-port-mismatch');
    // Every stage preserves its parent's library context. Only the proven owner
    // swap value changes; user paint/opacity/layout never enter a reference.
    for (const [path,node] of contextNodes) {
      if (withinBoundary(path,boundary.referencePath)) continue;
      const other=expected.get(path); if (!other) return fail('host-context-changed');
      const before=evidence.hostContextVariableModesVersion===1 ? hostContextFacts(node) : clone(effectiveFacts(node));
      const after=evidence.hostContextVariableModesVersion===1 ? hostContextFacts(other) : clone(effectiveFacts(other));
      if (!before || !after) return fail('host-context-variable-evidence-incomplete');
      if (!variant&&path===boundary.ownerPath&&boundary.property) {
        delete record(record(before.component).properties)[boundary.property];
        delete record(record(after.component).properties)[boundary.property];
      }
      if (stableHash(before)!==stableHash(after)) return fail('host-context-changed');
    }
    const remainder=compareInstanceBoundaries(snapshot,referenceFor(reference),true);
    if (!remainder.complete) return fail('replacement-structure-needs-remap');
    const children=remainder.boundaries.filter(b=>withinBoundary(b.actualPath,boundary.actualPath));
    if (children.some(b=>b.actualPath===boundary.actualPath)) return fail('replacement-nested-identity-unresolved');
    const pairs: Array<[string,Record<string,unknown>,Record<string,unknown>]> = [];
    for (const [path,node] of actual!) {
      if (!withinBoundary(path,boundary.actualPath)||children.some(b=>withinBoundary(path,b.actualPath))) continue;
      const relative=path.slice(boundary.actualPath.length);
      const referencePath=remainder.referencePaths ? correspondingPath(remainder,path) : refBoundary.actualPath+relative;
      const other=referencePath !== undefined ? expected.get(referencePath) : undefined;
      if (!other||other.type!==node.type) return fail('replacement-structure-needs-remap');
      if (node.type==='INSTANCE') {
        const a=record(record(node.component).identity), b=record(record(other.component).identity);
        if (!a.componentKey||a.componentKey!==b.componentKey||(a.componentSetKey||'')!==(b.componentSetKey||'')) return fail('replacement-nested-identity-unresolved');
      }
      pairs.push([path,node,other]);
    }
    if (variant) {
      const props=(n: Record<string,unknown>|undefined)=> {
        const c=record(n?.component);
        return Object.fromEntries(Object.entries(record(c.propertyTypes)).filter(([,t])=>t==='VARIANT').map(([p])=>[p,record(c.properties)[p]]));
      };
      const expectedProperties=props(expected.get(refBoundary.actualPath));
      if (!Object.keys(expectedProperties).length||stableHash(props(actual!.get(boundary.actualPath)))!==stableHash(expectedProperties)) return fail('variant-properties-mismatch');
    }
    result.lineageProven=true;
    for (const [path,node,other] of pairs) {
      node.baseline={effective:clone(effectiveFacts(other,
        snapshot.source?.geometryCaptureVersion===1 && reference.source?.geometryCaptureVersion===1))};
      if (variant&&path===boundary.actualPath) {
        const originalComponent=record(contextNodes.get(boundary.referencePath)?.component), current=record(node.component);
        const baseline=record(record(record(node.baseline).effective).component), available=record(record(node.variantAvailability).componentProperties);
        for (const [name,type] of Object.entries(record(current.propertyTypes))) {
          if(type!=='VARIANT'||record(originalComponent.propertyTypes)[name]!=='VARIANT'||!Object.prototype.hasOwnProperty.call(record(originalComponent.properties),name)) continue;
          record(baseline.properties)[name]=originalComponent.properties[name];available[propertyAvailabilityKey(name)]=true;
          node.unknownFacts=((node.unknownFacts||[]) as string[]).filter(p=>p!==`variantAvailability.componentProperties.${propertyAvailabilityKey(name)}`);
        }
        if(node.variantAvailability) record(node.variantAvailability).componentProperties=available;
      }
      node.baselineProvenance={status:'matched',kind:variant?'independent-host-variant':'independent-host-swap',boundaryNodeId:boundary.nodeId,
        componentKey:boundary.actualComponentKey,ownerPath:boundary.ownerPath,property:boundary.property,
        ...(variant?{componentSetKey:boundary.componentSetKey}:{}),referencePath:remainder.referencePaths ? correspondingPath(remainder,path) : refBoundary.actualPath+path.slice(boundary.actualPath.length)};
      result.matchedNodeIds.push(String(node.id));
    }
    let complete=true;
    for (const child of children) {
      snapshot.instanceBoundaries!.push(child);
      const childResult=visit(child,reference,boundary.nodeId);
      complete=complete&&childResult.status==='matched';
      result.matchedNodeIds.push(...childResult.matchedNodeIds);
    }
    result.status=complete?'matched':'partial';
    result.reason=complete?(variant?'independent-host-variant-reference':'independent-host-swap-reference'):'nested-content-reference-unresolved';
    return result;
  };
  for (const boundary of roots) visit(boundary,base);
}
