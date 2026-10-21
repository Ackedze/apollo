import type { PreviewSnapshot } from './types';
import { compareInstanceBoundaries, withinBoundary, type InstanceBoundary } from './instance-boundaries';
import { captureVariantReference, propertyAvailabilityKey } from './variant-facts';
import { effectiveFacts } from './instance-validation';
import { snapshotPaths } from './snapshot-topology';
import { stableHash } from './stable';
import { materializeNestedInstanceContentReferences } from './nested-instance-content-reference';

const record = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
export { INSTANCE_CONTENT_REFERENCE_LIMIT } from './nested-instance-content-reference';

export type InstanceContentReferences = {
  schemaVersion: 'apollo.instance-content-references.v1' | 'apollo.instance-content-references.v2' | 'apollo.instance-content-references.v3' | 'apollo.instance-content-references.v4';
  /** Fresh captures opt in; unmarked historical v4 reports keep exact equality. */
  hostContextVariableModesVersion?: 1;
  /** Pristine library host, before any replacement; not a clone of the tested instance. */
  base: PreviewSnapshot;
  attempts: Array<{ boundaryNodeId: string; parentBoundaryNodeId?: string; reference?: PreviewSnapshot; failure?: string;
    strategy?: 'pristine-host-variant-properties' }>;
};
export type InstanceContentResult = {
  boundaryNodeId: string;
  status: 'matched' | 'partial' | 'unresolved';
  /** Proven host identity/port lineage can survive a child visual-coverage gap. */
  lineageProven?: true;
  reason: string;
  matchedNodeIds: string[];
};

/** A capture plan proves identity/port lineage, never permission to use the replacement. */
export function planInstanceContentReferences(snapshot: PreviewSnapshot): InstanceBoundary[] {
  if (!snapshot.variantReference) return [];
  const comparison = compareInstanceBoundaries(snapshot, snapshot.variantReference);
  return comparison.complete ? comparison.boundaries : [];
}

function byPath(snapshot: PreviewSnapshot): Map<string, Record<string, unknown>> | undefined {
  const paths = snapshotPaths(snapshot);
  return paths && new Map(snapshot.nodes.map(n => [paths.get(String(n.id))!, n]));
}

function subtree(nodes: Map<string, Record<string, unknown>>, root: string) {
  return new Map([...nodes].filter(([p]) => withinBoundary(p, root))
    .map(([p, n]) => [p === root ? '' : p.slice(root.length + 3), n]));
}

/** Validate independent evidence again on replay. No Figma APIs, rules, keys or Button special cases. */
export function materializeInstanceContentReferences(snapshot: PreviewSnapshot): void {
  const evidence = snapshot.instanceContentReferences;
  if (!evidence) return; // Preserve exact historical report semantics.
  if (evidence.schemaVersion === 'apollo.instance-content-references.v4') {
    materializeNestedInstanceContentReferences(snapshot); return;
  }
  const boundaries = planInstanceContentReferences(snapshot);
  const results: InstanceContentResult[] = [];
  snapshot.instanceContentResults = results;
  const original = snapshot.variantReference;
  const actualNodes = byPath(snapshot);
  const base = evidence.base;
  const baseNodes = base && byPath(base);
  const baseReference = base && captureVariantReference(base, base.source?.componentKey || '',
    base.source?.componentSetKey || '', original?.definedProperties);
  const nestedVariants = ['apollo.instance-content-references.v2','apollo.instance-content-references.v3'].includes(evidence.schemaVersion);
  const baseValid = (evidence.schemaVersion === 'apollo.instance-content-references.v1' || nestedVariants)
    && actualNodes && baseNodes && original?.complete && baseReference?.complete
    && base.source?.rootNodeId && base.source.rootNodeId !== snapshot.source?.rootNodeId
    && stableHash(baseReference) === stableHash(original)
    && stableHash(base.context.modes) === stableHash(snapshot.context.modes)
    && base.context.platform === snapshot.context.platform;
  for (const boundary of boundaries) {
    const result: InstanceContentResult = { boundaryNodeId: boundary.nodeId, status: 'unresolved', reason: 'reference-not-captured', matchedNodeIds: [] };
    results.push(result);
    // Clear stale baselines even when called without the variant materializer.
    if (actualNodes) for (const node of subtree(actualNodes, boundary.actualPath).values()) {
      node.baseline = { effective: {} };
      node.baselineProvenance = { status: 'unresolved', reason: boundary.reason, boundaryNodeId: boundary.nodeId };
      if (node.semantic && typeof node.semantic === 'object') delete record(node.semantic).role;
    }
    if (!baseValid) { result.reason = 'original-host-evidence-invalid'; continue; }
    const variant = nestedVariants && boundary.reason === 'component-variant-changed' && Boolean(boundary.componentSetKey);
    if (!boundary.actualComponentKey || (!variant && (boundary.reason !== 'instance-swap' || !boundary.property || boundary.ownerPath === undefined))) {
      result.reason = 'explicit-swap-port-required'; continue;
    }
    const attempts = evidence.attempts.filter(a => a.boundaryNodeId === boundary.nodeId);
    if (attempts.length !== 1) { result.reason = attempts.length ? 'ambiguous-reference' : 'reference-not-captured'; continue; }
    const attempt = attempts[0], reference = attempt.reference;
    if (attempt.failure || !reference) { result.reason = attempt.failure || 'reference-not-captured'; continue; }
    if (variant && evidence.schemaVersion === 'apollo.instance-content-references.v3'
      && attempt.strategy !== 'pristine-host-variant-properties') { result.reason = 'variant-capture-strategy-unproven'; continue; }
    const refNodes = byPath(reference);
    const independent = reference.source?.rootNodeId && reference.source.rootNodeId !== snapshot.source?.rootNodeId
      && reference.source.rootNodeId !== base.source?.rootNodeId;
    if (!independent || !refNodes || stableHash(reference.context.modes) !== stableHash(snapshot.context.modes)
      || reference.context.platform !== snapshot.context.platform) { result.reason = 'replacement-reference-incomplete'; continue; }
    const comparison = compareInstanceBoundaries(reference, original!, nestedVariants);
    const refBoundary = comparison.boundaries[0];
    if (!comparison.complete || comparison.boundaries.length !== 1 || refBoundary.reason !== boundary.reason
      || refBoundary.referencePath !== boundary.referencePath || refBoundary.ownerPath !== boundary.ownerPath
      || refBoundary.property !== boundary.property || refBoundary.actualComponentKey !== boundary.actualComponentKey
      || refBoundary.componentSetKey !== boundary.componentSetKey) {
      result.reason = 'replacement-identity-or-port-mismatch'; continue;
    }
    // The surrounding host (including PaintMe) must be exactly the pristine host.
    // Only the proven owner's INSTANCE_SWAP value may change; no observed styles are copied.
    let hostIntact = true;
    for (const [path, node] of baseNodes!) {
      if (withinBoundary(path, boundary.referencePath)) continue;
      const other = refNodes.get(path);
      if (!other) { hostIntact = false; break; }
      const expected = clone(effectiveFacts(node)), observed = clone(effectiveFacts(other));
      if (!variant && path === boundary.ownerPath && boundary.property) {
        delete record(record(expected.component).properties)[boundary.property];
        delete record(record(observed.component).properties)[boundary.property];
      }
      if (stableHash(expected) !== stableHash(observed)) { hostIntact = false; break; }
    }
    if (!hostIntact) { result.reason = 'host-context-changed'; continue; }
    const actual = subtree(actualNodes!, boundary.actualPath), expected = subtree(refNodes, refBoundary.actualPath);
    const shape = (nodes: typeof actual) => [...nodes].map(([p,n]) => [p,n.type]).sort((a,b) => String(a[0]).localeCompare(String(b[0])));
    if (stableHash(shape(actual)) !== stableHash(shape(expected))) { result.reason = 'replacement-structure-needs-remap'; continue; }
    const identityKnown = [...actual].every(([path, node]) => {
      if (node.type !== 'INSTANCE') return true;
      const a = record(record(node.component).identity), b = record(record(expected.get(path)?.component).identity);
      return Boolean(a.componentKey && b.componentKey && a.componentKey === b.componentKey
        && (a.componentSetKey || '') === (b.componentSetKey || ''));
    });
    if (!identityKnown) { result.reason = 'replacement-nested-identity-unresolved'; continue; }
    if (variant) {
      const variantProperties = (node: Record<string, unknown> | undefined) => {
        const component = record(node?.component);
        return Object.fromEntries(Object.entries(record(component.propertyTypes))
          .filter(([,type]) => type === 'VARIANT').map(([name]) => [name, record(component.properties)[name]]));
      };
      const expectedProperties = variantProperties(expected.get(''));
      if (!Object.keys(expectedProperties).length || stableHash(variantProperties(actual.get(''))) !== stableHash(expectedProperties)) {
        result.reason = 'variant-properties-mismatch'; continue;
      }
    }
    for (const [path, node] of actual) {
      node.baseline = { effective: clone(effectiveFacts(expected.get(path)!,
        snapshot.source?.geometryCaptureVersion === 1 && reference.source?.geometryCaptureVersion === 1)) };
      if (variant && path === '') {
        // Rebase visual content, NOT the control delta. This does not approve Type.
        const originalComponent = record(baseNodes!.get(boundary.referencePath)?.component);
        const current = record(node.component), baseline = record(record(record(node.baseline).effective).component);
        const available = record(record(node.variantAvailability).componentProperties);
        for (const [name, type] of Object.entries(record(current.propertyTypes))) {
          if (type !== 'VARIANT' || record(originalComponent.propertyTypes)[name] !== 'VARIANT'
            || !Object.prototype.hasOwnProperty.call(record(originalComponent.properties), name)) continue;
          record(baseline.properties)[name] = originalComponent.properties[name];
          available[propertyAvailabilityKey(name)] = true;
          node.unknownFacts = ((node.unknownFacts || []) as string[])
            .filter(p => p !== `variantAvailability.componentProperties.${propertyAvailabilityKey(name)}`);
        }
        if (node.variantAvailability) record(node.variantAvailability).componentProperties = available;
      }
      node.baselineProvenance = { status: 'matched', kind: variant ? 'independent-host-variant' : 'independent-host-swap', boundaryNodeId: boundary.nodeId,
        componentKey: boundary.actualComponentKey, ownerPath: boundary.ownerPath, property: boundary.property,
        ...(variant ? {componentSetKey: boundary.componentSetKey} : {}),
        referencePath: [refBoundary.actualPath, path].filter(Boolean).join(' / ') };
      result.matchedNodeIds.push(String(node.id));
    }
    result.status = 'matched'; result.reason = variant ? 'independent-host-variant-reference' : 'independent-host-swap-reference';
  }
}
