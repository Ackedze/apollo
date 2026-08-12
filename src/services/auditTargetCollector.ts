import type { CheckState } from '../create-check-state';
import type { AuditItem, ThemeAuditEntry } from '../types/audit';
import type { AuditTraversalContext } from './auditTraversalContext';
import {
  classifyComponentNode,
  type ComponentClassifierDependencies,
} from './componentClassifier';
import { traverseAuditTree } from './auditTreeTraversal';
import {
  auditLocalComponentDependencies,
  classifyLocalComponentDependency,
  extractInstanceSublayerSourceNodeIds,
  resolveLocalComponentDefinition,
} from './localComponentDependencyAudit';
import {
  collectCustomStyles,
  collectDetachedEntry,
} from './auditViewBuilder';
import { collectDeprecatedStyleUsages } from './deprecatedStyleAudit';
import { getLibraryComponentFreshnessScope } from './libraryComponentFreshness';
import { buildCorporateThemizationEntry } from './themeAudit';
import {
  isWrongChannelComponent,
  type AuditChannel,
} from './channelAudit';
import { supportsThemizationForChannel } from '../policies/componentAuditPolicy';
import {
  getShellComponentAuditReason,
  isShellComponentAuditExcluded,
  isShellDetachedEntryExcluded,
} from '../policies/shellComponentAuditPolicy';
import { traceAudit } from '../utils/auditInstrumentation';
import { classifyDetachedContractV2Node } from './detachedContractV2Audit';

export interface AuditTargetCollectorOptions {
  shellAuditEnabled: boolean;
  experimentalContractV2Enabled: boolean;
  dependencyConcurrency: number;
}

export interface AuditTargetCollectorDependencies
  extends ComponentClassifierDependencies {
  getNodeById(nodeId: string): Promise<BaseNode | null>;
}

export interface AuditCategoryAggregationOptions {
  wrongChannel: boolean;
  themizationEntry: ThemeAuditEntry | null;
  preset: boolean;
}

export function aggregateAuditComponent(
  checkState: CheckState,
  item: AuditItem,
  options: AuditCategoryAggregationOptions,
): void {
  checkState.totalItems += 1;
  if (
    item.relevance &&
    !(options.wrongChannel && item.relevance === 'current')
  ) {
    checkState.relevanceBuckets[item.relevance].push(item);
  }
  if (item.forcedCategory) {
    return;
  }
  if (options.themizationEntry) {
    checkState.themizationEntries.push(options.themizationEntry);
  }
  if (item.reference && options.wrongChannel) {
    checkState.wrongChannelEntries.push(item);
  }
  if (options.preset) {
    checkState.presetItems.push(item);
  }
}

export async function collectAuditTargets(
  selection: readonly SceneNode[],
  checkState: CheckState,
  selectedChannel: AuditChannel,
  traversalContext: AuditTraversalContext,
  options: AuditTargetCollectorOptions,
  dependencies: AuditTargetCollectorDependencies,
): Promise<void> {
  const {
    dependencyConcurrency,
    experimentalContractV2Enabled,
    shellAuditEnabled,
  } = options;
  const {
    buildNodeSegments,
    debugDiffPipeline,
    getComponentKeyCached,
    getNodeById,
    getReferenceStructureCached,
    isInsideLocalComponentContext,
    isPaintToken,
    normalizeRelevanceStatus,
    reportMissingReference,
    resolveTokenLabel,
    resolveVariableCollectionMetadata,
    resolveVariableMetadata,
    throwIfCancelled,
  } = dependencies;
  const {
    componentKeyCache,
    customStyleOptions: customStyleReasonOptions,
    deprecatedStyleOptions,
    libraryComponentFreshnessChecker,
  } = traversalContext;
  const themizationEnabled = supportsThemizationForChannel(selectedChannel);
  const sourceComponentDefinitions = new Map<string, ComponentNode>();
  const sourceComponentFocusNodeIds = new Map<string, Set<string>>();
  const resolvedFlattenedSourceIds = new Set<string>();
  const rejectedFlattenedSourceIds = new Set<string>();
  const isNodeVisibleSafe = (candidate: SceneNode): boolean => {
    try {
      return 'visible' in candidate
        ? (candidate as SceneNode & { visible: boolean }).visible !== false
        : true;
    } catch (_error) {
      return false;
    }
  };

  await traverseAuditTree(selection, {
    throwIfCancelled,
    isVisible: isNodeVisibleSafe,
    getChildren: (node) =>
      'children' in node ? Array.from(node.children) as SceneNode[] : [],
    visit: async (node) => {
      traversalContext.sceneNodeById.set(node.id, node);
      const nodeIsComponent =
        node.type === 'INSTANCE' || node.type === 'COMPONENT';
      let subtreeForcedCategory: 'technical' | 'deprecated' | null = null;

      if (nodeIsComponent) {
        const freshnessScope = getLibraryComponentFreshnessScope(node);
        const localDefinition = await resolveLocalComponentDefinition<
          SceneNode,
          ComponentNode
        >(node, {
          getNodeType: (candidate) => candidate.type,
          getMainComponent: async (candidate) =>
            candidate.type === 'INSTANCE'
              ? await (candidate as InstanceNode).getMainComponentAsync()
              : null,
          isRemoteComponent: (component) => component.remote,
        });
        if (localDefinition) {
          registerComponentDefinition(
            sourceComponentDefinitions,
            sourceComponentFocusNodeIds,
            localDefinition,
            node.id,
          );
        }

        const item = await classifyComponentNode(
          node,
          localDefinition,
          traversalContext,
          {
            getComponentKeyCached,
            buildNodeSegments,
            getReferenceStructureCached,
            isInsideLocalComponentContext,
            resolveTokenLabel,
            isPaintToken,
            resolveVariableMetadata,
            resolveVariableCollectionMetadata:
              resolveVariableCollectionMetadata,
            normalizeRelevanceStatus,
            reportMissingReference,
            debugDiffPipeline,
            experimentalContractV2Enabled,
            throwIfCancelled,
          },
        );
        throwIfCancelled();

        if (item.isLocal) {
          checkState.localLibraryItems.push(item);
        }

        if (
          node.type === 'INSTANCE' &&
          freshnessScope === 'instance-sublayer'
        ) {
          await registerFlattenedLocalComponentDefinition(
            node,
            sourceComponentDefinitions,
            sourceComponentFocusNodeIds,
            resolvedFlattenedSourceIds,
            rejectedFlattenedSourceIds,
            getNodeById,
          );
        }

        if (!shellAuditEnabled && isShellComponentAuditExcluded(item)) {
          traceAudit('shell-subtree-skipped', {
            nodeId: node.id,
            nodeName: node.name,
            libraryName: item.librarySource ?? null,
            componentName:
              item.reference?.displayName ?? item.reference?.name ?? item.name,
            categoryDecision: 'skipped-check',
            matchedRule: 'shell-audit-disabled',
            property: null,
            expected: null,
            actual: null,
            reason: getShellComponentAuditReason(item),
          });
          return { skipChildren: true };
        }

        subtreeForcedCategory = item.forcedCategory ?? null;

        const wrongChannel =
          item.reference != null &&
          isWrongChannelComponent(item.reference, selectedChannel);
        const themizationEntry =
          !subtreeForcedCategory && item.reference && themizationEnabled
            ? buildCorporateThemizationEntry(node, item.reference)
            : null;
        aggregateAuditComponent(checkState, item, {
          wrongChannel,
          themizationEntry,
          preset: !subtreeForcedCategory && isPresetCandidate(item),
        });
        if (
          experimentalContractV2Enabled &&
          (
            item.name.includes('CardSwiperMobile') ||
            item.diffs.some((diff) =>
              diff.assessment?.ruleId?.includes('web-corp.card-image'),
            )
          )
        ) {
          console.log(`[Apollo][probe] contract-v2-lifecycle ${JSON.stringify({
            stage: 'audit-item-aggregated',
            itemNodeId: item.id,
            itemName: item.name,
            relevance: item.relevance,
            forcedCategory: item.forcedCategory ?? null,
            diffs: item.diffs.map((diff) => ({
              nodeId: diff.nodeId ?? null,
              nodePath: diff.nodePath,
              property: diff.details?.property ?? null,
              ruleId: diff.assessment?.ruleId ?? null,
              visible: diff.visible !== false,
            })),
            bucketSizes: {
              current: checkState.relevanceBuckets.current.length,
              update: checkState.relevanceBuckets.update.length,
              deprecated: checkState.relevanceBuckets.deprecated.length,
              technical: checkState.relevanceBuckets.technical.length,
              unknown: checkState.relevanceBuckets.unknown.length,
            },
          })}`);
        }

        if (subtreeForcedCategory) {
          traceAudit('category-subtree-skipped', {
            nodeId: node.id,
            nodeName: node.name,
            libraryName: item.librarySource ?? null,
            componentName:
              item.reference?.displayName ?? item.reference?.name ?? item.name,
            categoryDecision: subtreeForcedCategory,
            matchedRule: subtreeForcedCategory,
            property: null,
            expected: null,
            actual: null,
            reason:
              item.forcedCategoryReason ??
              'component subtree is excluded from deep audit by policy',
          });
          return { skipChildren: true };
        }
      }

      if (node.type === 'FRAME' || node.type === 'GROUP') {
        const item = collectDetachedEntry(node);

        if (item) {
          if (!shellAuditEnabled && isShellDetachedEntryExcluded(item)) {
            traceAudit('shell-detached-subtree-skipped', {
              nodeId: node.id,
              nodeName: node.name,
              libraryName: item.libraryName,
              componentName: item.componentName,
              componentKey: item.componentKey,
              categoryDecision: 'skipped-check',
              matchedRule: 'shell-audit-disabled',
              property: null,
              expected: null,
              actual: null,
              reason: `detached component ${item.componentName ?? item.componentKey} is excluded by Apollo shell settings`,
            });
            return { skipChildren: true };
          }

          checkState.detachedEntries.push(item);
          if (experimentalContractV2Enabled) {
            const contractItem = await classifyDetachedContractV2Node(node, {
              buildNodeSegments,
              resolveTokenLabel,
              throwIfCancelled,
            });
            if (contractItem) {
              checkState.contractCustomizationItems.push(contractItem);
            }
          }
        }
      }

      if (node.type !== 'SECTION') {
          const customStyleReasons = await collectCustomStyles(
            node,
            customStyleReasonOptions,
          );
          const deprecatedStyleEntries = await collectDeprecatedStyleUsages(
            node,
            deprecatedStyleOptions,
          );

          if (customStyleReasons.length) {
            checkState.customStyleEntries = [
              ...checkState.customStyleEntries,
              ...customStyleReasons,
            ];
          }

          if (deprecatedStyleEntries.length) {
            checkState.deprecatedStyleEntries = [
              ...checkState.deprecatedStyleEntries,
              ...deprecatedStyleEntries,
            ];
        }
      }

      return subtreeForcedCategory ? { skipChildren: true } : undefined;
    },
  });

  const localDependencyResult = await auditLocalComponentDependencies<
    SceneNode,
    ComponentNode
  >(
    Array.from(sourceComponentDefinitions.values()),
    checkState.relevanceBuckets.current,
    checkState.relevanceBuckets.update,
    {
      getNodeId: (node) => node.id,
      getNodeType: (node) => node.type,
      getChildren: (node) =>
        'children' in node
          ? Array.from(node.children) as SceneNode[]
          : [],
      getMainComponent: async (node) =>
        node.type === 'INSTANCE'
          ? await (node as InstanceNode).getMainComponentAsync()
          : null,
      isRemoteComponent: (component) => component.remote,
      isVisible: isNodeVisibleSafe,
      componentFocusNodeIds: sourceComponentFocusNodeIds,
      getComponentIdentity: getComponentDefinitionIdentity,
      classifyDependency: async (
        node,
        owner,
        focusNodeIds,
        observedComponentKeys,
      ) =>
        classifyLocalComponentDependency(
          node as InstanceNode,
          owner,
          {
            componentKeyCache,
            freshnessChecker: libraryComponentFreshnessChecker,
            observedComponentKeys,
            focusNodeIds,
            getComponentKeyCached,
            buildNodeSegments,
            throwIfCancelled,
          },
        ),
      shouldExclude: (item) =>
        !shellAuditEnabled && isShellComponentAuditExcluded(item),
      freshnessChecker: libraryComponentFreshnessChecker,
      dependencyConcurrency,
      throwIfCancelled,
    },
  );
  checkState.relevanceBuckets.current = localDependencyResult.currentItems;
  checkState.relevanceBuckets.update = localDependencyResult.updateItems;
}

function getComponentDefinitionIdentity(component: ComponentNode): string {
  const componentKey = component.key.trim();
  return componentKey ? `key:${componentKey}` : `id:${component.id}`;
}

function registerComponentDefinition(
  definitions: Map<string, ComponentNode>,
  focusNodeIds: Map<string, Set<string>>,
  component: ComponentNode,
  focusNodeId: string,
): void {
  const identity = getComponentDefinitionIdentity(component);
  definitions.set(identity, component);
  const occurrences = focusNodeIds.get(identity) ?? new Set<string>();
  occurrences.add(focusNodeId);
  focusNodeIds.set(identity, occurrences);
}

function findLocalComponentAncestor(node: BaseNode): ComponentNode | null {
  let current: BaseNode | null = node.parent;
  while (current) {
    if (current.type === 'COMPONENT') {
      return current.remote ? null : current;
    }
    current = current.parent;
  }
  return null;
}

async function registerFlattenedLocalComponentDefinition(
  renderedNode: InstanceNode,
  definitions: Map<string, ComponentNode>,
  focusNodeIds: Map<string, Set<string>>,
  resolvedSourceIds: Set<string>,
  rejectedSourceIds: Set<string>,
  getNodeById: AuditTargetCollectorDependencies['getNodeById'],
): Promise<void> {
  const sourceIds = extractInstanceSublayerSourceNodeIds(renderedNode.id);
  for (const sourceId of sourceIds) {
    if (resolvedSourceIds.has(sourceId)) return;
    if (rejectedSourceIds.has(sourceId)) continue;

    let sourceNode: BaseNode | null = null;
    try {
      sourceNode = await getNodeById(sourceId);
    } catch (_error) {
      rejectedSourceIds.add(sourceId);
      continue;
    }

    if (!sourceNode || !('parent' in sourceNode)) {
      rejectedSourceIds.add(sourceId);
      continue;
    }

    const owner = findLocalComponentAncestor(sourceNode);
    if (!owner) {
      rejectedSourceIds.add(sourceId);
      continue;
    }

    resolvedSourceIds.add(sourceId);
    registerComponentDefinition(
      definitions,
      focusNodeIds,
      owner,
      renderedNode.id,
    );
    traceAudit('flattened-local-component-source-resolved', {
      renderedNodeId: renderedNode.id,
      renderedNodeName: renderedNode.name,
      sourceNodeId: sourceId,
      sourceNodeName: 'name' in sourceNode ? sourceNode.name : null,
      ownerComponentId: owner.id,
      ownerComponentName: owner.name,
    });
    return;
  }
}

function isPresetCandidate(item: AuditItem): boolean {
  if (item.nodeType !== 'INSTANCE' || !item.reference) {
    return false;
  }
  if (item.reference.displayName?.includes('🔒')) {
    return true;
  }
  return (item.reference.names ?? []).some((name) => name.includes('🔒'));
}
