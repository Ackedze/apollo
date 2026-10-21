import type { PreviewSnapshot } from './types';
import { occurrenceSegment } from './occurrence-address';

/** Exact parent/child paths; no semantic-role or positional fallback. */
export function snapshotPaths(snapshot: PreviewSnapshot): Map<string, string> | undefined {
  if (snapshot.selection.length !== 1 || snapshot.source?.truncated !== false || snapshot.source.captureTopology?.complete===false) return undefined;
  const byId = new Map(snapshot.nodes.map(n => [String(n.id), n]));
  if (byId.size !== snapshot.nodes.length) return undefined;
  const root = byId.get(snapshot.selection[0]);
  if (!root || root.parentId !== null) return undefined;
  const paths = new Map<string, string>(), memo = new Map<string, string>();
  const usedPaths = new Set<string>(), siblingCounts = new Map<string, Map<string, number>>();
  for (const node of snapshot.nodes) {
    const parent = String(node.parentId), name = String(node.name);
    if (!siblingCounts.has(parent)) siblingCounts.set(parent,new Map());
    const counts = siblingCounts.get(parent)!; counts.set(name,(counts.get(name)||0)+1);
  }
  const pathFor = (node: Record<string, unknown>, visited = new Set<string>()): string | undefined => {
    const id = String(node.id);
    if (visited.has(id)) return undefined;
    if (memo.has(id)) return memo.get(id);
    visited.add(id);
    if (node === root) return '';
    const parent = byId.get(String(node.parentId));
    if (!parent || !Array.isArray(parent.childIds) || !parent.childIds.includes(id)) return undefined;
    const parentPath = pathFor(parent, visited);
    if (parentPath === undefined || typeof node.name !== 'string') return undefined;
    let segment = node.name;
    if (snapshot.source?.occurrenceAddressVersion === 1) {
      const siblings = siblingCounts.get(String(node.parentId))?.get(node.name) || 0;
      const source = (node.component as any)?.sourceIdentity;
      segment = siblings > 1
        ? occurrenceSegment(node.name, typeof source?.sourceNodeId === 'string' && source.sourceNodeId ? source.sourceNodeId : undefined,
          typeof source?.sourceNodeId === 'string' && source.sourceNodeId ? undefined : id)
        : occurrenceSegment(node.name);
    }
    const path = [parentPath,segment].filter(Boolean).join(' / ');
    memo.set(id,path); return path;
  };
  for (const node of snapshot.nodes) {
    const path = pathFor(node);
    if (path === undefined || usedPaths.has(path)) return undefined;
    paths.set(String(node.id), path); usedPaths.add(path);
    if (!Array.isArray(node.childIds) || new Set(node.childIds).size !== node.childIds.length
      || node.childIds.some(id => !byId.has(String(id)) || byId.get(String(id))?.parentId !== node.id)) return undefined;
  }
  return paths;
}

export function snapshotShape(snapshot: PreviewSnapshot): Array<{ path: string; type: string }> | undefined {
  const paths = snapshotPaths(snapshot);
  return paths && snapshot.nodes.map(n => ({path: paths.get(String(n.id))!, type: paths.get(String(n.id)) === '' ? 'ROOT' : String(n.type)}))
    .sort((a,b) => a.path.localeCompare(b.path) || a.type.localeCompare(b.type));
}
