import type {
  ApolloLayoutRelation,
  ApolloLayoutRelationNode,
} from './types';
import { createCooperativeYield } from '../utils/promisePool';

type ResolveNodePath = (node: SceneNode) => string;

export async function collectApolloLayoutRelations(
  roots: readonly SceneNode[],
  resolveNodePath: ResolveNodePath,
  guard:()=>void=()=>{},
): Promise<ApolloLayoutRelation[]> {
  const relations: ApolloLayoutRelation[] = [];
  const rootIds = new Set(roots.map((root) => root.id));
  const titleViews: InstanceNode[] = [];

  const checkpoint=createCooperativeYield(guard),queue=Array.from(roots).reverse();
  while(queue.length){
    await checkpoint();const node=queue.pop()!;
    if(node.visible===false)continue;
    if (isMainTitleView(node)) titleViews.push(node);
    if ('children' in node) {
      for(let i=node.children.length-1;i>=0;i--)queue.push(node.children[i]);
    }
  }

  for (const titleView of titleViews) {
    await checkpoint();
    const preceding = findPrecedingVisibleSibling(titleView, rootIds);
    if (preceding && isTopMarginSpacer(preceding.node)) {
      const height = preceding.node.absoluteBoundingBox?.height ?? null;
      if (height !== null) {
        relations.push({
          id: makeRelationId(preceding.node.id, titleView.id, 'page-top-margin'),
          axis: 'vertical',
          relationKind: 'page-top-margin',
          from: toRelationNode(preceding.node, resolveNodePath),
          to: toRelationNode(titleView, resolveNodePath),
          container: toContainerNode(preceding.parent, resolveNodePath),
          measurement: {
            actualPx: roundMeasurement(height),
            source: 'spacer-height',
          },
          semantic: { fromRole: 'header', toRole: 'title-view' },
          contextComplete: true,
        });
      }
    }

    const following = findFollowingVisibleSibling(titleView, rootIds);
    if (!following) continue;
    const gap = measureVerticalGap(titleView, following.node);
    if (gap === null) continue;
    relations.push({
      id: makeRelationId(titleView.id, following.node.id, 'next-content-gap'),
      axis: 'vertical',
      relationKind: 'next-content-gap',
      from: toRelationNode(titleView, resolveNodePath),
      to: toRelationNode(following.node, resolveNodePath),
      container: toContainerNode(following.parent, resolveNodePath),
      measurement: {
        actualPx: roundMeasurement(gap),
        source: 'bounding-box-gap',
      },
      semantic: {
        fromRole: 'title-view',
        toRole: inferFollowingRole(following.node),
      },
      contextComplete: true,
    });
  }

  return relations.sort((left, right) => left.id.localeCompare(right.id));
}

function isMainTitleView(node: SceneNode): node is InstanceNode {
  if (node.type !== 'INSTANCE') return false;
  if (!normalizeName(node.name).includes('titleview')) return false;
  const view = Object.entries(node.componentProperties).find(([name]) => (
    normalizePropertyName(name) === 'view'
  ))?.[1]?.value;
  return String(view ?? '').toLocaleLowerCase('en-US') === 'xlarge';
}

function findPrecedingVisibleSibling(
  node: SceneNode,
  rootIds: Set<string>,
): { node: SceneNode; parent: SceneNode | null } | null {
  let cursor: SceneNode = node;
  while (true) {
    const parent = asSceneParent(cursor.parent);
    if (!parent || !('children' in parent)) return null;
    const index = parent.children.findIndex((child) => child.id === cursor.id);
    for (let candidateIndex = index - 1; candidateIndex >= 0; candidateIndex -= 1) {
      const candidate = parent.children[candidateIndex];
      if (candidate.visible !== false) return { node: candidate, parent };
    }
    if (rootIds.has(parent.id)) return null;
    cursor = parent;
  }
}

function findFollowingVisibleSibling(
  node: SceneNode,
  rootIds: Set<string>,
): { node: SceneNode; parent: SceneNode | null } | null {
  let cursor: SceneNode = node;
  while (true) {
    const parent = asSceneParent(cursor.parent);
    if (!parent || !('children' in parent)) return null;
    const index = parent.children.findIndex((child) => child.id === cursor.id);
    for (let candidateIndex = index + 1; candidateIndex < parent.children.length; candidateIndex += 1) {
      const candidate = parent.children[candidateIndex];
      if (candidate.visible !== false) return { node: candidate, parent };
    }
    if (rootIds.has(parent.id)) return null;
    cursor = parent;
  }
}

function isTopMarginSpacer(node: SceneNode): boolean {
  const normalized = normalizeName(node.name);
  return normalized.includes('topmargin') || normalized.includes('spacingvertical');
}

function inferFollowingRole(
  node: SceneNode,
): ApolloLayoutRelation['semantic']['toRole'] {
  const normalized = normalizeName(node.name);
  if (normalized.includes('topbar')) return 'top-bar';
  if (normalized.includes('tabsview') || normalized.includes('tabs')) return 'tabs-view';
  if (normalized.includes('filtersblock') || normalized.includes('filter')) return 'filters-block';
  if (normalized.includes('plate')) return 'plate';
  return 'content';
}

function measureVerticalGap(from: SceneNode, to: SceneNode): number | null {
  const fromBounds = from.absoluteBoundingBox;
  const toBounds = to.absoluteBoundingBox;
  if (!fromBounds || !toBounds) return null;
  return Math.max(0, toBounds.y - (fromBounds.y + fromBounds.height));
}

function toRelationNode(
  node: SceneNode,
  resolveNodePath: ResolveNodePath,
): ApolloLayoutRelationNode {
  return {
    nodeId: node.id,
    name: node.name,
    type: node.type,
    path: resolveNodePath(node),
  };
}

function toContainerNode(
  node: SceneNode | null,
  resolveNodePath: ResolveNodePath,
): ApolloLayoutRelation['container'] {
  if (!node) return null;
  const relationNode = toRelationNode(node, resolveNodePath);
  return {
    nodeId: relationNode.nodeId,
    name: relationNode.name,
    type: relationNode.type,
    path: relationNode.path,
    layoutMode: 'layoutMode' in node ? String(node.layoutMode) : null,
    itemSpacing:
      'itemSpacing' in node && typeof node.itemSpacing === 'number'
        ? node.itemSpacing
        : null,
  };
}

function asSceneParent(node: BaseNode | null): SceneNode | null {
  return node && node.type !== 'PAGE' && node.type !== 'DOCUMENT'
    ? node
    : null;
}

function normalizeName(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-zа-яё0-9]+/giu, '');
}

function normalizePropertyName(value: string): string {
  return value.split('#')[0].trim().toLocaleLowerCase('en-US');
}

function makeRelationId(fromId: string, toId: string, kind: string): string {
  return `${fromId}>${toId}:${kind}`;
}

function roundMeasurement(value: number): number {
  return Math.round(value * 100) / 100;
}
