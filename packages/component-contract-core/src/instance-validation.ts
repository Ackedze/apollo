import type { CompiledContract, PreviewSnapshot } from './types';
import { snapshotPaths } from './snapshot-topology';
import { captureVariantReference } from './variant-facts';
import { compareInstanceBoundaries, correspondingPath, withinBoundary } from './instance-boundaries';

const EFFECTIVE_FACT_KEYS = [
  'layout',
  'appearance',
  'variable',
  'component',
  'text',
  'visible',
] as const;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function semanticRole(node: Record<string, unknown>): string {
  const semantic = record(node.semantic);
  return typeof semantic.role === 'string' ? semantic.role : '';
}

/** Intrinsic dimensions only: temporary-page positions are not component invariants. */
export function intrinsicBounds(value: unknown): Record<string, number> {
  const bounds = record(value), result: Record<string, number> = {};
  for (const key of ['width', 'height']) {
    const size = bounds[key];
    if (typeof size === 'number' && Number.isFinite(size) && size >= 0) result[key] = size;
  }
  return result;
}

export function effectiveFacts(node: Record<string, unknown>, includeDimensions = false): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  EFFECTIVE_FACT_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(node, key)) result[key] = node[key];
  });
  // Old persisted snapshots retain exact replay. New captures opt in explicitly.
  if (includeDimensions) {
    const bounds = intrinsicBounds(node.bounds);
    if (Object.keys(bounds).length) result.bounds = bounds;
    // Reference-only evidence must not alter host-context equality for legal swaps.
    if (node.propertyActivityV1) result.propertyActivityV1 = node.propertyActivityV1;
  }
  return result;
}

function cloneSnapshot(snapshot: PreviewSnapshot): PreviewSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as PreviewSnapshot;
}

export type BaselineMaterialization = {
  snapshot: PreviewSnapshot;
  matchedNodes: number;
  unmatchedNodeIds: string[];
};

/**
 * Adds an effective baseline from an independently rendered reference instance.
 * The tested snapshot remains the source of actual facts; reference facts are
 * used only below baseline.effective.
 */
export function materializeEffectiveBaseline(
  actual: PreviewSnapshot,
  reference: PreviewSnapshot,
  strictInstanceBoundaries = true,
): BaselineMaterialization {
  const result = cloneSnapshot(actual);
  if (strictInstanceBoundaries) {
    const actualPaths = snapshotPaths(actual), referencePaths = snapshotPaths(reference);
    const ref = captureVariantReference(reference,reference.source?.componentKey || '',reference.source?.componentSetKey || '');
    const comparison = compareInstanceBoundaries(actual,ref);
    const byPath = new Map(reference.nodes.map(node=>[referencePaths?.get(String(node.id)),node]));
    const unmatchedNodeIds: string[] = [];
    let matchedNodes = 0;
    result.nodes = result.nodes.map(node=>{
      const path = actualPaths?.get(String(node.id));
      const isolated = path !== undefined && comparison.boundaries.find(b=>withinBoundary(path,b.actualPath));
      const referencePath = path !== undefined ? correspondingPath(comparison, path) : undefined;
      const expected = referencePath !== undefined && comparison.complete && !isolated ? byPath.get(referencePath) : undefined;
      if (!expected || expected.type !== node.type) {
        unmatchedNodeIds.push(String(node.id));
        return {...node,baseline:{effective:{}},baselineProvenance:{status:'unresolved',reason:isolated ? isolated.reason : 'structural-identity-unresolved'}};
      }
      matchedNodes++;
      return {...node,baseline:{effective:effectiveFacts(expected, true)},baselineProvenance:{status:'matched',referencePath:referencePath}};
    });
    return {snapshot:result,matchedNodes,unmatchedNodeIds};
  }
  const referenceByRole = new Map<string, Record<string, unknown>>();
  reference.nodes.forEach((candidate) => {
    const node = record(candidate);
    const role = semanticRole(node);
    if (role && !referenceByRole.has(role)) referenceByRole.set(role, node);
  });

  let matchedNodes = 0;
  const unmatchedNodeIds: string[] = [];
  result.nodes = result.nodes.map((candidate, index) => {
    const node = record(candidate);
    const role = semanticRole(node);
    const referenceNode = referenceByRole.get(role)
      || (index === 0 ? record(reference.nodes[0]) : undefined);
    if (!referenceNode || referenceNode.type !== node.type) {
      unmatchedNodeIds.push(String(node.id || `node:${index}`));
      return { ...node, baseline: { effective: {} } };
    }
    matchedNodes += 1;
    return {
      ...node,
      baseline: { effective: effectiveFacts(referenceNode, true) },
    };
  });

  return { snapshot: result, matchedNodes, unmatchedNodeIds };
}

export function allowedComponentPropertyNames(contract: CompiledContract): string[] {
  const names = new Set<string>();
  contract.customizationPolicy.forEach((policy) => {
    if (policy.permission === 'forbidden') return;
    const prefixes = ['component.properties.', 'component-property.'];
    const prefix = prefixes.find((candidate) => policy.capability.startsWith(candidate));
    if (prefix) names.add(policy.capability.slice(prefix.length));
    policy.controlPaths.forEach((path) => {
      if ((path.kind === 'host-property' || path.kind === 'nested-property') && path.property) {
        names.add(path.property);
      }
    });
  });
  return Array.from(names).sort((left, right) => left.localeCompare(right));
}

export function matchesComponentIdentity(
  mainComponentKey: string,
  componentSetKey: string,
  acceptedKeys: string[],
): boolean {
  const accepted = new Set(acceptedKeys.filter(Boolean));
  return accepted.has(mainComponentKey) || Boolean(componentSetKey && accepted.has(componentSetKey));
}
