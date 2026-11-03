import type { CaptureTopologyEntry } from './capture-topology';
import type { InstanceSourceIdentity } from './instance-source-identity';

export type PreparedSourceNode = {
  sourceNodeId: string;
  sourceParentId: string | null;
  sourceChildIds: string[];
  nodeType: string;
  componentKey?: string;
};
export type PreparedSourceTopology = {
  componentKey: string;
  rootNodeId: string;
  nodes: PreparedSourceNode[];
};
type MainIdentity = { id: string; key: string };
type TreeNode = { id: string; parentId: string | null; childIds: string[]; type: string };
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const inheritedPrefix = (id: string) => (id.startsWith('I') ? id : 'I' + id) + ';';

function treeIndex(nodes: TreeNode[], rootId: string) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  if (!nodes.length || byId.size !== nodes.length || !byId.has(rootId)) return;
  for (const node of nodes) {
    if (!text(node.id) || !text(node.type) || !Array.isArray(node.childIds)
      || node.childIds.some(id => !text(id)) || new Set(node.childIds).size !== node.childIds.length) return;
  }
  for (const node of nodes) {
    if (node.id === rootId) {
      // A master export may retain its external COMPONENT_SET parent.
      if (node.parentId !== null && (!text(node.parentId) || byId.has(node.parentId))) return;
    } else if (!text(node.parentId) || !byId.get(node.parentId)?.childIds.includes(node.id)) return;
    if (node.childIds.some(id => byId.get(id)?.parentId !== node.id)) return;
  }
  const seen = new Set<string>(), pending = [rootId];
  while (pending.length) {
    const id = pending.pop()!;
    if (seen.has(id)) return;
    seen.add(id); pending.push(...byId.get(id)!.childIds);
  }
  return seen.size === nodes.length ? byId : undefined;
}

/** Prove occurrence identity against an independently exported library master.
 * Names, order and source/consumer file-local main IDs are never identity evidence. */
export function capturePreparedSourceIdentities(entries: CaptureTopologyEntry[], mains: Map<string, MainIdentity>,
  source: PreparedSourceTopology, includeOwnedLayers = false): Map<string, InstanceSourceIdentity> {
  const result = new Map<string, InstanceSourceIdentity>();
  if (!text(source?.componentKey) || !text(source.rootNodeId) || !Array.isArray(source.nodes)
    || source.nodes.some(n => !n || typeof n !== 'object') || !Array.isArray(entries) || !entries.length
    || entries.some(n => !n || typeof n !== 'object')) return result;
  const sourceRows = source.nodes.map(n => ({ id: n.sourceNodeId, parentId: n.sourceParentId, childIds: n.sourceChildIds, type: n.nodeType }));
  const expected = treeIndex(sourceRows, source.rootNodeId), sourceNodes = new Map(source.nodes.map(n => [n.sourceNodeId, n]));
  if (!expected || expected.get(source.rootNodeId)!.type !== 'COMPONENT') return result;
  const sourceRoot = sourceNodes.get(source.rootNodeId)!;
  if (sourceRoot.componentKey !== undefined && sourceRoot.componentKey !== source.componentKey) return result;
  const roots = entries.filter(n => n.parentIndex === null);
  if (roots.length !== 1 || roots[0].type !== 'INSTANCE') return result;
  const actualRows: TreeNode[] = [];
  const indexValid = (index: unknown): index is number => Number.isInteger(index) && Number(index) >= 0 && Number(index) < entries.length;
  for (const entry of entries) {
    if (entry.parentIndex !== null && !indexValid(entry.parentIndex)
      || !Array.isArray(entry.childIndexes) || entry.childIndexes.some(i => !indexValid(i))) return result;
    actualRows.push({ id: entry.figmaNodeId, parentId: entry.parentIndex === null ? null : entries[entry.parentIndex].figmaNodeId,
      childIds: entry.childIndexes.map(i => entries[i].figmaNodeId), type: entry.type });
  }
  const root = roots[0], actual = treeIndex(actualRows, root.figmaNodeId), rootMain = mains.get(root.figmaNodeId);
  if (!actual || !rootMain || !text(rootMain.id) || rootMain.key !== source.componentKey) return result;
  type Proof = { source: PreparedSourceNode; ownerId: string; sourceNodeId: string };
  const proofs = new Map<string, Proof>();
  proofs.set(root.figmaNodeId, { source: sourceRoot, ownerId: root.figmaNodeId, sourceNodeId: '' });
  const visit = (id: string): Proof | undefined => {
    if (proofs.has(id)) return proofs.get(id);
    const node = actual.get(id)!;
    if (!node.parentId) return;
    const parent = visit(node.parentId), actualParent = actual.get(node.parentId)!;
    if (!parent || actualParent.type === 'SLOT') return;
    const ownerId = actualParent.type === 'INSTANCE' ? actualParent.id : parent.ownerId;
    const owner = proofs.get(ownerId), main = mains.get(ownerId);
    const ownerKey = ownerId === root.figmaNodeId ? source.componentKey : owner?.source.componentKey;
    if (!owner || !main || !text(main.id) || !text(ownerKey) || main.key !== ownerKey) return;
    const prefix = inheritedPrefix(ownerId);
    if (!id.startsWith(prefix)) return;
    const suffix = id.slice(prefix.length);
    const expectedId = ownerId === root.figmaNodeId ? suffix : inheritedPrefix(owner.source.sourceNodeId) + suffix;
    const candidate = sourceNodes.get(expectedId);
    if (!suffix || !candidate || candidate.nodeType !== node.type || candidate.sourceParentId !== parent.source.sourceNodeId
      || !parent.source.sourceChildIds.includes(expectedId)) return;
    const proof = { source: candidate, ownerId, sourceNodeId: suffix };
    proofs.set(id, proof); return proof;
  };
  for (const entry of entries) {
    if (entry === root) continue;
    const proof = visit(entry.figmaNodeId);
    if (!proof || !includeOwnedLayers && entry.type !== 'INSTANCE') continue;
    const main = mains.get(proof.ownerId)!;
    result.set(entry.figmaNodeId, { version: 1, ownerComponentKey: main.key, ownerMainComponentId: main.id, sourceNodeId: proof.sourceNodeId });
  }
  return result;
}
