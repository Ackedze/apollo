import type { CompiledContract, PreviewSnapshot } from './types';

/** Structural order is independent of visibility. Never synthesize absent children. */
export function materializeStructuralOrder(snapshot: PreviewSnapshot, contract: CompiledContract): void {
  if (contract.runtimePolicy.structuralOrderFactsVersion !== 1) return;
  const nodes = snapshot.nodes as Array<any>;
  const byId = new Map(nodes.map(n => [n.id, n]));
  const byParent = new Map<string, any[]>();
  for (const node of nodes) if (node.parentId) byParent.set(node.parentId, [...(byParent.get(node.parentId) || []), node]);
  const unknown = (node: any, path: string) => (node.unknownFacts || []).some((p: string) => p === path || path.startsWith(p + '.'));
  const duplicateIds = byId.size !== nodes.length;
  for (const node of nodes) {
    delete node.structuralOrderV1;
    node.unknownFacts = (node.unknownFacts || []).filter((p: string) => p !== 'structuralOrderV1.directChildRoles');
    const ids = node.childIds;
    const children = Array.isArray(ids) ? ids.map(id => byId.get(id)) : [];
    const valid = !duplicateIds && snapshot.source?.truncated !== true && Array.isArray(ids) && !unknown(node, 'childIds')
      && new Set(ids).size === ids.length
      && children.every(child => child && child.parentId === node.id && !unknown(child, 'parentId') && !unknown(child, 'semantic.role') && typeof child.semantic?.role === 'string' && child.semantic.role.length > 0)
      && (byParent.get(node.id) || []).every(child => ids.includes(child.id));
    if (valid) node.structuralOrderV1 = { directChildRoles: children.map(child => child.semantic.role) };
    else node.unknownFacts.push('structuralOrderV1.directChildRoles');
  }
}
