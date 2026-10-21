import { captureSceneTopology, type CaptureSceneNode, type CaptureTopologyEntry } from './capture-topology';

/** Capture-only identity of a component-owned layer, scoped to its nearest
 * instance owner. It identifies an occurrence, never authorizes its values. */
export type InstanceSourceIdentity = {
  version: 1;
  ownerComponentKey: string;
  ownerMainComponentId: string;
  sourceNodeId: string;
};

type SourceComponent = CaptureSceneNode & { key: string; remote?: boolean };
export type PristineInstanceSource = {
  mainComponentId: string;
  componentKey: string;
  topology: ReturnType<typeof captureSceneTopology>;
};

/** An inherited ID is only a candidate. Prove the complete relative ancestor
 * chain against the owner's main component, with no names or sibling indexes.
 * Stop at nested instances and SLOTs; caller payload is never traversed. */
export function captureInstanceSourceIdentities(entries: CaptureTopologyEntry[], mains: Map<string, SourceComponent>,
  pristineSources = new Map<string, PristineInstanceSource>(), includeOwnedLayers = false): Map<string, InstanceSourceIdentity> {
  const result = new Map<string, InstanceSourceIdentity>();
  type SourceTree = {entries:Array<Pick<CaptureTopologyEntry,'figmaNodeId'|'type'|'parentIndex'>>;complete:boolean};
  const sources = new Map<SourceComponent, SourceTree>();
  const sourceIndexes = new Map<SourceTree, Map<string, number>>();
  for (const entry of entries) {
    if ((!includeOwnedLayers && entry.type !== 'INSTANCE') || entry.parentIndex === null) continue;
    let ownerIndex: number | null = entry.parentIndex;
    while (ownerIndex !== null && entries[ownerIndex].type !== 'INSTANCE') ownerIndex = entries[ownerIndex].parentIndex;
    if (ownerIndex === null) continue;
    const owner = entries[ownerIndex], main = mains.get(owner.figmaNodeId);
    if (!main || main.type !== 'COMPONENT' || !main.key || !main.id) continue;
    try {
      let source: SourceTree;
      if (main.remote) {
        // Imported main sublayers have local IDs, unlike inherited instance IDs.
        // Only a separately created, identity-verified pristine instance can
        // prove that namespace. Never borrow the actual owner as its own source.
        const pristine = pristineSources.get(main.id), root = pristine?.topology.entries[0];
        if (!pristine?.topology.complete || !root || root.type !== 'INSTANCE' || root.parentIndex !== null
          || pristine.mainComponentId !== main.id || pristine.componentKey !== main.key || root.figmaNodeId === owner.figmaNodeId) continue;
        if (!sources.has(main)) {
          const sourcePrefix = (root.figmaNodeId.startsWith('I') ? root.figmaNodeId : 'I' + root.figmaNodeId) + ';';
          const normalized = pristine.topology.entries.map((n,index) => ({
            figmaNodeId:index===0?main.id:n.figmaNodeId.startsWith(sourcePrefix)?n.figmaNodeId.slice(sourcePrefix.length):'',
            type:index===0?'COMPONENT':n.type,parentIndex:n.parentIndex,
          }));
          if (normalized.some(n=>!n.figmaNodeId) || new Set(normalized.map(n=>n.figmaNodeId)).size !== normalized.length) continue;
          sources.set(main, {entries:normalized,complete:true});
        }
        source = sources.get(main)!;
      } else {
        if (!sources.has(main)) sources.set(main, captureSceneTopology(main, 500,
          (node, index) => index > 0 && (node.type === 'INSTANCE' || node.type === 'SLOT')));
        source = sources.get(main)!;
        if (!source.complete) continue;
      }
      if (!sourceIndexes.has(source)) {
        const index = new Map<string, number>();
        source.entries.forEach((n,i) => {
          const key = JSON.stringify([n.figmaNodeId,n.type,n.parentIndex]);
          if (!index.has(key)) index.set(key, i);
        });
        sourceIndexes.set(source, index);
      }
      const prefix = (owner.figmaNodeId.startsWith('I') ? owner.figmaNodeId : 'I' + owner.figmaNodeId) + ';';
      const chain: CaptureTopologyEntry[] = [];
      let current: CaptureTopologyEntry | undefined = entry;
      while (current && current !== owner) {
        chain.unshift(current);
        current = current.parentIndex === null ? undefined : entries[current.parentIndex];
      }
      if (current !== owner) continue;
      let sourceParentIndex = 0, sourceNodeId = '', valid = true;
      for (const inherited of chain) {
        if (!inherited.figmaNodeId.startsWith(prefix)) { valid = false; break; }
        const id = inherited.figmaNodeId.slice(prefix.length);
        const index = sourceIndexes.get(source)!.get(JSON.stringify([id,inherited.type,sourceParentIndex])) ?? -1;
        if (!id || index < 1) { valid = false; break; }
        sourceParentIndex = index; sourceNodeId = id;
      }
      if (valid) result.set(entry.figmaNodeId, {version:1, ownerComponentKey:main.key, ownerMainComponentId:main.id, sourceNodeId});
    } catch { /* Missing/unreadable source stays unavailable; never guess. */ }
  }
  return result;
}
