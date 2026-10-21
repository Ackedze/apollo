import type { PreviewSnapshot } from './types';
import { snapshotPaths, snapshotShape } from './snapshot-topology';
import { stableHash } from './stable';
import { compareInstanceCorrespondence } from './instance-correspondence';

const record = (value: unknown): Record<string, any> => value && typeof value === 'object' ? value as Record<string, any> : {};
const parentPath = (path: string) => path.split(' / ').slice(0,-1).join(' / ');
export const withinBoundary = (path: string, boundary: string) => path === boundary || path.startsWith(`${boundary} / `);

export type InstanceBoundary = {
  nodeId: string; actualPath: string; referencePath: string;
  reason: 'instance-swap' | 'component-variant-changed' | 'component-identity-changed' | 'instance-identity-unavailable';
  actualComponentKey?: string; referenceComponentKey?: string;
  componentSetKey?: string;
  ownerPath?: string; property?: string;
};

export type InstanceComparison = { complete: boolean; boundaries: InstanceBoundary[]; referencePaths?: Record<string, string> };
export const correspondingPath = (comparison: InstanceComparison | undefined, actualPath: string): string | undefined =>
  comparison?.referencePaths ? comparison.referencePaths[actualPath] : actualPath;

/** Structural facts only: observing a swap port is not permission to use its value. */
export function compareInstanceBoundaries(snapshot: PreviewSnapshot, reference: NonNullable<PreviewSnapshot['variantReference']>,
  nestedVariants = ['apollo.instance-content-references.v2','apollo.instance-content-references.v3','apollo.instance-content-references.v4'].includes(snapshot.instanceContentReferences?.schemaVersion || '')): InstanceComparison {
  if (!reference.nodeProperties || typeof reference.nodeProperties !== 'object' || Array.isArray(reference.nodeProperties)) {
    return {complete:false,boundaries:[],referencePaths:{}};
  }
  if (snapshot.source?.instanceIdentityVersion === 1) return compareInstanceCorrespondence(snapshot, reference, nestedVariants);
  const paths = snapshotPaths(snapshot), shape = snapshotShape(snapshot);
  const boundaries: InstanceBoundary[] = [];
  const invalid = () => ({ complete: false, boundaries });
  if (!paths || !shape || !reference.complete) return invalid();
  if (!snapshot.source?.componentKey || reference.componentKey !== snapshot.source.componentKey
    || reference.componentSetKey !== (snapshot.source.componentSetKey || '')) return invalid();
  const actualByPath = new Map(snapshot.nodes.map(n => [paths.get(String(n.id))!, n]));
  const refByPath = new Map(reference.nodes.map(n => [n.path, n]));
  if (refByPath.size !== reference.nodes.length) return invalid();
  const ownerFor = (path: string, nodes: Map<string, {type?: unknown}>) => {
    let parent = parentPath(path);
    while (parent) { if (nodes.get(parent)?.type === 'INSTANCE') return parent; parent = parentPath(parent); }
    return '';
  };
  const actualPort = (path: string) => {
    const node = actualByPath.get(path), component = record(node?.component);
    const property = record(component.propertyReferenceBindings).mainComponent;
    const ownerPath = ownerFor(path, actualByPath), owner = record(actualByPath.get(ownerPath)?.component);
    if (typeof property !== 'string' || record(owner.propertyTypes)[property] !== 'INSTANCE_SWAP'
      || typeof record(component.identity).mainComponentId !== 'string'
      || record(owner.properties)[property] !== record(component.identity).mainComponentId) return undefined;
    return { ownerPath, property };
  };
  const referencePort = (path: string) => {
    const data = reference.nodeProperties[path], property = data?.propertyReferenceBindings?.mainComponent;
    const ownerPath = ownerFor(path, refByPath), owner = reference.nodeProperties[ownerPath];
    if (!property || owner?.propertyTypes[property] !== 'INSTANCE_SWAP' || !data?.identity?.mainComponentId
      || owner.properties[property] !== data.identity.mainComponentId) return undefined;
    return { ownerPath, property };
  };
  const instances = [...actualByPath].filter(([path,n]) => path && n.type === 'INSTANCE')
    .sort(([a],[b]) => a.split(' / ').length - b.split(' / ').length);
  for (const [path,node] of instances) {
    if (boundaries.some(b => withinBoundary(path,b.actualPath))) continue;
    const identity = record(record(node.component).identity), port = actualPort(path);
    let refPath = refByPath.get(path)?.type === 'INSTANCE' ? path : undefined;
    if (port) {
      const consumers = instances.filter(([p]) => {
        const other = actualPort(p);return other?.ownerPath === port.ownerPath && other.property === port.property;
      });
      const candidates = reference.nodes.filter(n => {
        if (n.type !== 'INSTANCE') return false;
        const other = referencePort(n.path);return other?.ownerPath === port.ownerPath && other.property === port.property;
      });
      if (consumers.length !== 1 || candidates.length !== 1 || parentPath(candidates[0].path) !== parentPath(path)) return invalid();
      refPath = candidates[0].path;
    }
    if (refPath === undefined) return invalid();
    const expected = reference.nodeProperties[refPath]?.identity;
    const keysKnown = typeof identity.componentKey === 'string' && Boolean(identity.componentKey) && Boolean(expected?.componentKey);
    if (keysKnown && identity.componentKey === expected!.componentKey && path === refPath) continue;
    // Same set proves identity, not permission. Explicit swap ports keep their provenance.
    const sameSet = nestedVariants && keysKnown && !port && path === refPath
      && typeof identity.componentSetKey === 'string' && Boolean(identity.componentSetKey)
      && identity.componentSetKey === expected?.componentSetKey;
    boundaries.push({ nodeId: String(node.id), actualPath:path,referencePath:refPath,
      reason: !keysKnown ? 'instance-identity-unavailable' : port ? 'instance-swap' : sameSet ? 'component-variant-changed' : 'component-identity-changed',
      ...(sameSet ? {componentSetKey: identity.componentSetKey} : {}),
      ...(identity.componentKey ? {actualComponentKey:identity.componentKey} : {}),
      ...(expected?.componentKey ? {referenceComponentKey:expected.componentKey} : {}), ...(port || {}) });
  }
  const prune = (nodes: Array<{path:string;type:string}>, actual: boolean) => nodes.flatMap(n => {
    const boundary = boundaries.find(b => withinBoundary(n.path,actual?b.actualPath:b.referencePath));
    if (!boundary) return [n];
    if (n.path !== (actual?boundary.actualPath:boundary.referencePath)) return [];
    return [{path:boundary.referencePath,type:'INSTANCE'}];
  }).sort((a,b) => a.path.localeCompare(b.path) || a.type.localeCompare(b.type));
  return {complete:stableHash(prune(shape,true)) === stableHash(prune(reference.nodes,false)),boundaries};
}

/** Remove every stale inherited baseline in an unverified instance subtree. */
export function isolateInstanceBoundaries(snapshot: PreviewSnapshot, boundaries: InstanceBoundary[]): void {
  const paths = snapshotPaths(snapshot);
  if (!paths) return;
  snapshot.instanceBoundaries = boundaries;
  for (const node of snapshot.nodes) {
    const path = paths.get(String(node.id))!;
    const boundary = boundaries.find(b => withinBoundary(path,b.actualPath));
    if (!boundary) continue;
    node.baseline = {effective:{}};
    node.baselineProvenance = {status:'unresolved',reason:boundary.reason,boundaryNodeId:boundary.nodeId};
    // Do not reuse name-derived roles from a different component's anatomy.
    if (node.semantic && typeof node.semantic === 'object') delete (node.semantic as Record<string,unknown>).role;
  }
}
