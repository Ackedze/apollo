import type { DSStructureNode } from '../types/structures';

export function buildOccurrenceIndexMap(
  nodes: DSStructureNode[],
): Map<DSStructureNode, number> {
  const visibleCounts = new Map<string, number>();
  const hiddenCounts = new Map<string, number>();
  const result = new Map<DSStructureNode, number>();

  for (const node of nodes) {
    if (node.visible === false) {
      const nextHidden = (hiddenCounts.get(node.path) ?? 0) + 1;
      hiddenCounts.set(node.path, nextHidden);
      result.set(node, -nextHidden);
      continue;
    }

    const nextVisible = (visibleCounts.get(node.path) ?? 0) + 1;
    visibleCounts.set(node.path, nextVisible);
    result.set(node, nextVisible);
  }

  return result;
}

export function makeOccurrenceKey(path: string, occurrence: number): string {
  if (occurrence < 1) {
    return `${path}@@hidden${Math.abs(occurrence)}`;
  }
  return occurrence > 1 ? `${path}@@${occurrence}` : path;
}

export function buildOccurrenceKeyMap(
  nodes: DSStructureNode[],
): Map<DSStructureNode, string> {
  const occurrenceIndexMap = buildOccurrenceIndexMap(nodes);
  const result = new Map<DSStructureNode, string>();

  for (const node of nodes) {
    result.set(node, makeOccurrenceKey(node.path, occurrenceIndexMap.get(node) ?? 1));
  }

  return result;
}
