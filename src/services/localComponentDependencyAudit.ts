import { forEachWithConcurrency } from '../utils/promisePool';
import type { AuditItem } from '../types/audit';
import type {
  LibraryComponentFreshnessChecker,
  LibraryComponentFreshnessStats,
} from './libraryComponentFreshness';
import { reconcileLibraryUpdateResults } from './libraryUpdateResults';
import {
  getTimestamp,
  logAuditMetric,
  traceAudit,
} from '../utils/auditInstrumentation';
import {
  ensureReferenceCatalogsForKeys,
  findComponent,
  resolveVariantKeyForInstance,
} from '../reference/library';
import { getForcedAuditCategory } from '../policies/componentAuditPolicy';
import { buildNodePath, getPageName } from '../utils/nodeHelpers';

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

export interface AuditLocalComponentDependenciesOptions<
  TNode,
  TComponent extends TNode,
> extends Omit<
    LocalComponentDependencyWalkOptions<TNode, TComponent>,
    'onRemoteDependency' | 'dependencyConcurrency'
  > {
  componentFocusNodeIds: ReadonlyMap<string, ReadonlySet<string>>;
  getComponentIdentity(component: TComponent): string;
  classifyDependency(
    instance: TNode,
    owner: TComponent,
    focusNodeIds: string[],
    observedComponentKeys: Set<string>,
  ): Promise<AuditItem | null>;
  shouldExclude(item: AuditItem): boolean;
  freshnessChecker: LibraryComponentFreshnessChecker;
  dependencyConcurrency: number;
}

export interface AuditLocalComponentDependenciesResult {
  currentItems: AuditItem[];
  updateItems: AuditItem[];
  walkStats: LocalComponentDependencyWalkStats;
}

export interface ClassifyLocalComponentDependencyOptions {
  componentKeyCache: Map<string, string | null>;
  freshnessChecker: LibraryComponentFreshnessChecker;
  observedComponentKeys: Set<string>;
  focusNodeIds: string[];
  getComponentKeyCached(
    node: SceneNode,
    cache: Map<string, string | null>,
    options: { retryIfMissing: boolean },
  ): Promise<string | null>;
  buildNodeSegments(node: SceneNode): AuditItem['pathSegments'];
  throwIfCancelled(): void;
}

export async function classifyLocalComponentDependency(
  node: InstanceNode,
  owner: ComponentNode,
  options: ClassifyLocalComponentDependencyOptions,
): Promise<AuditItem | null> {
  options.throwIfCancelled();
  const componentKey = await options.getComponentKeyCached(
    node,
    options.componentKeyCache,
    { retryIfMissing: true },
  );
  if (!componentKey) return null;
  options.observedComponentKeys.add(componentKey);

  let reference = findComponent(componentKey);
  if (!reference) {
    await ensureReferenceCatalogsForKeys([componentKey]);
    reference = findComponent(componentKey);
  }
  if (!reference || getForcedAuditCategory(reference)) return null;

  const libraryFreshness = await options.freshnessChecker.check(
    node,
    'independent-instance',
  );
  options.throwIfCancelled();
  if (libraryFreshness.status !== 'update-available') return null;

  const nodeSegments = options.buildNodeSegments(node);
  const pathSegments =
    nodeSegments.length > 1
      ? nodeSegments.slice(1)
      : nodeSegments.length
        ? nodeSegments
        : [
            {
              id: node.id,
              label: node.name,
              nodeType: node.type,
              visible: true,
            },
          ];
  const resolvedReferenceVariantKey = resolveVariantKeyForInstance(
    reference,
    componentKey,
    node.variantProperties ?? null,
  );
  const resolvedReferenceVariantName =
    reference.variants?.find(
      (variant) => variant?.key === resolvedReferenceVariantKey,
    )?.name ?? null;

  const item: AuditItem = {
    id: node.id,
    name: node.name,
    nodeType: node.type,
    pageName: getPageName(node),
    pathSegments,
    fullPath: buildNodePath(node),
    relevance: 'update',
    librarySource: reference.source ?? null,
    librarySourceFile: reference.sourceFile ?? null,
    isLocal: false,
    reference,
    componentKey,
    diffs: [],
    comparisonIssues: [],
    updateReasons: ['library-update-available'],
    libraryFreshness,
    focusNodeId: options.focusNodeIds[0] ?? owner.id,
    sourceOwnerOccurrenceIds: options.focusNodeIds,
    localComponentOwner: {
      id: owner.id,
      name: owner.name,
      pageName: getPageName(owner),
      fullPath: buildNodePath(owner),
    },
    resolvedReferenceVariantKey,
    resolvedReferenceVariantName,
  };

  traceAudit('local-component-library-dependency', {
    nodeId: node.id,
    nodeName: node.name,
    componentKey,
    ownerComponentId: owner.id,
    ownerComponentName: owner.name,
    status: libraryFreshness.status,
    currentComponentId: libraryFreshness.currentComponentId,
    latestComponentId: libraryFreshness.latestComponentId,
    categoryDecision: 'update',
  });

  return item;
}

export async function auditLocalComponentDependencies<
  TNode,
  TComponent extends TNode,
>(
  initialComponents: readonly TComponent[],
  currentItems: readonly AuditItem[],
  updateItems: readonly AuditItem[],
  options: AuditLocalComponentDependenciesOptions<TNode, TComponent>,
): Promise<AuditLocalComponentDependenciesResult> {
  const startedAt = getTimestamp();
  const freshnessBefore = options.freshnessChecker.getStats();
  const dependencyResults: Array<AuditItem | null | undefined> = [];
  const observedComponentKeys = new Set<string>();

  const walkStats = await walkLocalComponentDependencies(
    initialComponents,
    {
      getNodeId: options.getNodeId,
      getNodeType: options.getNodeType,
      getChildren: options.getChildren,
      getMainComponent: options.getMainComponent,
      isRemoteComponent: options.isRemoteComponent,
      isVisible: options.isVisible,
      onRemoteDependency: async (node, owner, index) => {
        const identity = options.getComponentIdentity(owner);
        const focusNodeIds = Array.from(
          options.componentFocusNodeIds.get(identity) ?? [
            options.getNodeId(owner),
          ],
        );
        const dependency = await options.classifyDependency(
          node,
          owner,
          focusNodeIds,
          observedComponentKeys,
        );
        dependencyResults[index] =
          dependency && !options.shouldExclude(dependency) ? dependency : null;
      },
      dependencyConcurrency: options.dependencyConcurrency,
      throwIfCancelled: options.throwIfCancelled,
    },
  );

  const dependencies = dependencyResults.filter(
    (item): item is AuditItem => Boolean(item),
  );
  const reconciled = reconcileLibraryUpdateResults(
    currentItems,
    updateItems,
    dependencies,
  );
  const freshnessAfter = options.freshnessChecker.getStats();

  logLocalDependencyMetrics({
    startedAt,
    registeredDefinitions: initialComponents.length,
    walkStats,
    uniqueDependencyKeys: observedComponentKeys.size,
    updateFindings: dependencies.length,
    concurrency: options.dependencyConcurrency,
    freshnessBefore,
    freshnessAfter,
  });

  return {
    currentItems: reconciled.currentItems,
    updateItems: reconciled.updateItems,
    walkStats,
  };
}

function logLocalDependencyMetrics(input: {
  startedAt: number;
  registeredDefinitions: number;
  walkStats: LocalComponentDependencyWalkStats;
  uniqueDependencyKeys: number;
  updateFindings: number;
  concurrency: number;
  freshnessBefore: LibraryComponentFreshnessStats;
  freshnessAfter: LibraryComponentFreshnessStats;
}): void {
  logAuditMetric('local-component-dependency-audit', {
    totalMs: Number((getTimestamp() - input.startedAt).toFixed(1)),
    registeredDefinitions: input.registeredDefinitions,
    ownerDefinitions: input.walkStats.ownerDefinitions,
    visitedSourceNodes: input.walkStats.visitedSourceNodes,
    remoteDependencies: input.walkStats.remoteDependencies,
    uniqueDependencyKeys: input.uniqueDependencyKeys,
    updateFindings: input.updateFindings,
    concurrency: input.concurrency,
    freshnessChecks:
      input.freshnessAfter.checks - input.freshnessBefore.checks,
    importCacheHits:
      input.freshnessAfter.importCacheHits -
      input.freshnessBefore.importCacheHits,
    importCacheMisses:
      input.freshnessAfter.importCacheMisses -
      input.freshnessBefore.importCacheMisses,
  });
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
