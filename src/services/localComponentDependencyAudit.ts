import { forEachWithConcurrency } from '../utils/promisePool';

export interface LocalComponentDependencyWalkOptions<
  TNode,
  TComponent extends TNode,
> {
  getNodeId(node: TNode): string;
  getNodeType(node: TNode): string;
  getChildren(node: TNode): readonly TNode[];
  getMainComponent(instance: TNode): Promise<TComponent | null>;
  isRemoteComponent(component: TComponent): boolean;
  isVisible(node: TNode): boolean;
  onRemoteDependency(
    instance: TNode,
    owner: TComponent,
    index: number,
  ): Promise<void> | void;
  dependencyConcurrency?: number;
  throwIfCancelled(): void;
}

export interface LocalComponentDependencyWalkStats {
  ownerDefinitions: number;
  visitedSourceNodes: number;
  remoteDependencies: number;
}

/**
 * Figma encodes the source-node chain of an instance sublayer after the first
 * semicolon, for example `I10:20;30:40;50:60`. These ids can be resolved back
 * to nodes in the current file when Slot content hides its local owner from
 * the rendered scene tree.
 */
export function extractInstanceSublayerSourceNodeIds(nodeId: string): string[] {
  if (!nodeId.startsWith('I') || !nodeId.includes(';')) return [];

  const sourceIds: string[] = [];
  const seen = new Set<string>();
  const segments = nodeId.split(';').slice(1);
  for (const segment of segments) {
    const sourceId = segment.trim();
    if (!/^\d+:\d+$/.test(sourceId) || seen.has(sourceId)) continue;
    seen.add(sourceId);
    sourceIds.push(sourceId);
  }
  return sourceIds;
}

export interface LocalComponentDefinitionOptions<TNode, TComponent extends TNode> {
  getNodeType(node: TNode): string;
  getMainComponent(instance: TNode): Promise<TComponent | null>;
  isRemoteComponent(component: TComponent): boolean;
  includeRemoteDefinition?: boolean;
}

/**
 * Resolves local ownership from Figma's native component relationship. Catalog
 * classification is intentionally not involved: a local component may have a
 * stable key or match a reference index and still remains a local definition.
 */
export async function resolveLocalComponentDefinition<
  TNode,
  TComponent extends TNode,
>(
  node: TNode,
  options: LocalComponentDefinitionOptions<TNode, TComponent>,
): Promise<TComponent | null> {
  const nodeType = options.getNodeType(node);
  if (nodeType === 'COMPONENT') {
    const component = node as TComponent;
    return options.includeRemoteDefinition || !options.isRemoteComponent(component)
      ? component
      : null;
  }
  if (nodeType !== 'INSTANCE') return null;

  try {
    const component = await options.getMainComponent(node);
    return component &&
      (options.includeRemoteDefinition || !options.isRemoteComponent(component))
      ? component
      : null;
  } catch (_error) {
    return null;
  }
}

/**
 * Audits the source definitions behind local component instances. Remote
 * instances are dependency boundaries: their internal sublayers belong to the
 * library component and must not be reported as independently updateable.
 */
export async function walkLocalComponentDependencies<
  TNode,
  TComponent extends TNode,
>(
  initialComponents: readonly TComponent[],
  options: LocalComponentDependencyWalkOptions<TNode, TComponent>,
): Promise<LocalComponentDependencyWalkStats> {
  const queue = initialComponents.slice();
  const queuedComponentIds = new Set(
    queue.map((component) => options.getNodeId(component)),
  );
  const visitedComponentIds = new Set<string>();
  const visitedSourceNodeIds = new Set<string>();
  const remoteDependencies: Array<{ node: TNode; owner: TComponent }> = [];

  const enqueue = (component: TComponent): void => {
    const componentId = options.getNodeId(component);
    if (queuedComponentIds.has(componentId) || visitedComponentIds.has(componentId)) {
      return;
    }
    queuedComponentIds.add(componentId);
    queue.push(component);
  };

  const visit = async (node: TNode, owner: TComponent): Promise<void> => {
    options.throwIfCancelled();
    if (!options.isVisible(node)) return;

    const nodeId = options.getNodeId(node);
    if (visitedSourceNodeIds.has(nodeId)) return;
    visitedSourceNodeIds.add(nodeId);

    if (options.getNodeType(node) === 'INSTANCE') {
      let mainComponent: TComponent | null = null;
      try {
        mainComponent = await options.getMainComponent(node);
      } catch (_error) {
        return;
      }
      if (!mainComponent) return;

      if (options.isRemoteComponent(mainComponent)) {
        remoteDependencies.push({ node, owner });
      } else {
        enqueue(mainComponent);
      }
      return;
    }

    for (const child of options.getChildren(node)) {
      await visit(child, owner);
    }
  };

  while (queue.length) {
    options.throwIfCancelled();
    const component = queue.shift() as TComponent;
    const componentId = options.getNodeId(component);
    queuedComponentIds.delete(componentId);
    if (visitedComponentIds.has(componentId)) continue;
    visitedComponentIds.add(componentId);

    for (const child of options.getChildren(component)) {
      await visit(child, component);
    }
  }

  await forEachWithConcurrency(
    remoteDependencies,
    options.dependencyConcurrency ?? 1,
    async (dependency, index) => {
      options.throwIfCancelled();
      await options.onRemoteDependency(
        dependency.node,
        dependency.owner,
        index,
      );
    },
  );

  return {
    ownerDefinitions: visitedComponentIds.size,
    visitedSourceNodes: visitedSourceNodeIds.size,
    remoteDependencies: remoteDependencies.length,
  };
}
