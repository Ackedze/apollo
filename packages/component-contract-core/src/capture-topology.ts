export type CaptureTopologyIssue = { kind: 'duplicate-id' | 'cycle' | 'identity-conflict' | 'unreadable-node' | 'identity-changed'; nodeId?: string; path: string };
export type CaptureSceneNode = { id: string; name: string; type: string; children?: readonly CaptureSceneNode[] };
export type CaptureTopologyEntry = {
  node: CaptureSceneNode; figmaNodeId: string; name: string; type: string;
  parentIndex: number | null; childIndexes: number[]; depth: number; path: string;
  observedChildren?: readonly CaptureSceneNode[];
};

/** Capture edges once. Never rebuild them from a map of potentially repeated API IDs. */
export function captureSceneTopology(root: CaptureSceneNode, limit = 500,
  omitChildren?: (entry: CaptureTopologyEntry, index: number, entries: CaptureTopologyEntry[]) => boolean) {
  const entries: CaptureTopologyEntry[] = [], issues: CaptureTopologyIssue[] = [];
  const seenIds = new Map<string, CaptureTopologyEntry>(), seenObjects = new Set<CaptureSceneNode>();
  let limitReached = false;
  const visit = (node: CaptureSceneNode, parentIndex: number | null, ancestors: Set<string>): number | undefined => {
    let id: string, name: string, type: string;
    try { id = node.id; name = node.name; type = node.type; }
    catch { issues.push({ kind: 'unreadable-node', path: parentIndex === null ? '' : entries[parentIndex].path }); return; }
    const path = parentIndex === null ? name : `${entries[parentIndex].path} / ${name}`;
    if (!id || typeof id !== 'string' || typeof name !== 'string' || !type) { issues.push({kind:'unreadable-node',path}); return; }
    const previous = seenIds.get(id);
    if (previous || seenObjects.has(node)) {
      const kind = previous && previous.type !== type ? 'identity-conflict' : ancestors.has(id) ? 'cycle' : 'duplicate-id';
      if (issues.length < 20) issues.push({kind,nodeId:id,path});
      return;
    }
    if (entries.length >= limit) { limitReached = true; return; }
    const entry: CaptureTopologyEntry = {node,figmaNodeId:id,name,type,parentIndex,childIndexes:[],depth:parentIndex===null?0:entries[parentIndex].depth+1,path};
    const index = entries.length; entries.push(entry); seenIds.set(id,entry); seenObjects.add(node);
    if (omitChildren?.(entry,index,entries)) return index;
    let children: readonly CaptureSceneNode[];
    try { children = 'children' in node ? Array.from(node.children || []) : []; }
    catch { issues.push({kind:'unreadable-node',nodeId:id,path}); return index; }
    entry.observedChildren=children;
    const next = new Set(ancestors); next.add(id);
    for (const child of children) { const childIndex = visit(child,index,next); if (childIndex !== undefined) entry.childIndexes.push(childIndex); }
    return index;
  };
  visit(root,null,new Set());
  return {entries,issues,limitReached,complete:!limitReached && !issues.length};
}
