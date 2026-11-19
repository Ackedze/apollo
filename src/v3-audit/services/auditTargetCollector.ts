import type { CheckState } from '../create-check-state';
import type { AuditItem, ThemeAuditEntry, WrongChannelTypographyEntry } from '../types/audit';
import type { AuditTraversalContext } from './auditTraversalContext';
import type { AuditSceneSnapshot } from '../source-observation';
import { untimed, type createComponentTimings } from '../component-timings';
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
import { getDetachedLibraryComponentKey } from './detachedComponentSource';

export interface AuditTargetCollectorOptions {
  shellAuditEnabled: boolean;
  dependencyConcurrency: number;
}

type IndexedAudit = {
  snapshot?:AuditSceneSnapshot;
  timings?:ReturnType<typeof createComponentTimings>;
  getMainComponent(node:InstanceNode):Promise<ComponentNode|null>;
  isSharedShellKey?(key:string):boolean;
  classifyComponent(node:SceneNode, definition:ComponentNode|null):Promise<AuditItem>;
  wrongChannel(item:AuditItem):boolean;
  wrongChannelTypography?(node:TextNode):Promise<WrongChannelTypographyEntry[]>;
  themization(node:SceneNode,item:AuditItem):ThemeAuditEntry|null;
  referenceByKey: typeof import('../reference/library').findComponent;
};
type AuditTargetCollectorDependencies = Pick<ComponentClassifierDependencies,'getComponentKeyCached'|'buildNodeSegments'|'throwIfCancelled'> & {
  getNodeById(nodeId: string): Promise<BaseNode | null>;
} & ({indexed:IndexedAudit}|(ComponentClassifierDependencies & {indexed?:undefined}));

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
    shellAuditEnabled,
  } = options;
  const {buildNodeSegments,getComponentKeyCached,getNodeById,throwIfCancelled,indexed} = dependencies;
  const auditTypography = indexed?.wrongChannelTypography;
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
  const snapshot=indexed?.snapshot;
  const measure=indexed?.timings?.measure??untimed;
  const measureSync=indexed?.timings?.measureSync??untimed;
  const classify = dependencies.indexed
    ? dependencies.indexed.classifyComponent
    : (node:SceneNode,definition:ComponentNode|null)=>classifyComponentNode(node,definition,traversalContext,dependencies);
  const isNodeVisibleSafe = (candidate: SceneNode): boolean => {
    try {
      if(snapshot)return snapshot.isVisible(candidate);
      return 'visible' in candidate
        ? (candidate as SceneNode & { visible: boolean }).visible !== false
        : true;
    } catch (_error) {
      return false;
    }
  };
  const getChildren=(node:SceneNode)=>snapshot?.getChildren(node)??('children'in node?Array.from(node.children):[]);
  const getMainComponent=async(node:SceneNode)=>node.type==='INSTANCE'
    ? await (indexed?indexed.getMainComponent(node):node.getMainComponentAsync())
    : null;
  const isSharedKey=indexed?.isSharedShellKey;
  const skipLegacyShell=!indexed&&!shellAuditEnabled;
  const directSharedKey=(node:SceneNode)=>node.type==='COMPONENT'||node.type==='COMPONENT_SET'
    ? node.key : getDetachedLibraryComponentKey(node);

  await measure('renderedTree',()=>traverseAuditTree(selection, {
    throwIfCancelled,
    timings: indexed?.timings,
    prepareNodes:snapshot?.prepareNodes,
    isVisible: isNodeVisibleSafe,
    getChildren,
    visit: async (node) => {
      if(isSharedKey&&!snapshot?.shouldSkipShared){
        const key=node.type==='INSTANCE'?(await getMainComponent(node))?.key:directSharedKey(node);
        if(key&&isSharedKey(key))return {skipChildren:true};
      }
      const nodeIsComponent = measureSync('visitNodeRegistration', () => {
        traversalContext.sceneNodeById.set(node.id, node);
        return node.type === 'INSTANCE' || node.type === 'COMPONENT';
      });

      if (nodeIsComponent) {
        const freshnessScope = measureSync('visitFreshnessScope', () => getLibraryComponentFreshnessScope(node));
        const localDefinition = await measure('resolveLocalDefinition',()=>resolveLocalComponentDefinition<
          SceneNode,
          ComponentNode
        >(node, {
          getNodeType: (candidate) => candidate.type,
          getMainComponent,
          isRemoteComponent: (component) => component.remote,
        }));
        if (localDefinition) {
          measureSync('visitLocalDefinitionRegistration', () => registerComponentDefinition(
            sourceComponentDefinitions,
            sourceComponentFocusNodeIds,
            localDefinition,
            node.id,
          ));
        }

        const item = await measure('classifyComponent',()=>classify(node,localDefinition));
        measureSync('visitGuard', throwIfCancelled);

        if (item.isLocal) {
          checkState.localLibraryItems.push(item);
        }

        if (
          node.type === 'INSTANCE' &&
          freshnessScope === 'instance-sublayer'
        ) {
          await measure('resolveFlattenedSource',()=>registerFlattenedLocalComponentDefinition(
            node,
            sourceComponentDefinitions,
            sourceComponentFocusNodeIds,
            resolvedFlattenedSourceIds,
            rejectedFlattenedSourceIds,
            getNodeById,
          ));
        }

        const skipChildren = measureSync('visitComponentGrouping', () => {
          if (skipLegacyShell && isShellComponentAuditExcluded(item)) {
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
            return true;
          }

          const subtreeForcedCategory = item.forcedCategory ?? null;

          const wrongChannel =
            item.reference != null && (indexed ? indexed.wrongChannel(item) : isWrongChannelComponent(item.reference, selectedChannel));
          const themizationEntry =
            !subtreeForcedCategory && item.reference && themizationEnabled
              ? indexed ? indexed.themization(node,item) : buildCorporateThemizationEntry(node, item.reference)
              : null;
          aggregateAuditComponent(checkState, item, {
            wrongChannel,
            themizationEntry,
            preset: !subtreeForcedCategory && isPresetCandidate(item),
          });

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
          }
          return Boolean(subtreeForcedCategory);
        });
        if (skipChildren) return { skipChildren: true };
      }

      const skipDetachedChildren = measureSync('visitDetached', () => {
        if (node.type !== 'FRAME' && node.type !== 'GROUP') return false;
        const item = collectDetachedEntry(node,indexed?.referenceByKey);

        if (item) {
          if (skipLegacyShell && isShellDetachedEntryExcluded(item)) {
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
            return true;
          }

          checkState.detachedEntries.push(item);
        }
        return false;
      });
      if (skipDetachedChildren) return { skipChildren: true };

      if (node.type !== 'SECTION') {
        if (node.type === 'TEXT' && auditTypography) {
          const findings = await auditTypography(node);
          checkState.wrongChannelTypographyEntries.push(...findings);
        }
        const customStyleReasons = await measure('customStyles',()=>collectCustomStyles(
          node,
          customStyleReasonOptions,
        ));
        const deprecatedStyleEntries = await measure('deprecatedStyles',()=>collectDeprecatedStyleUsages(
          node,
          deprecatedStyleOptions,
        ));

        measureSync('visitStyleGrouping', () => {
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
        });
      }
    },
  }));

  const localDependencyResult = await measure('localDependencies',()=>auditLocalComponentDependencies<
    SceneNode,
    ComponentNode
  >(
    Array.from(sourceComponentDefinitions.values()),
    checkState.relevanceBuckets.current,
    checkState.relevanceBuckets.update,
    {
      getNodeId: (node) => node.id,
      getNodeType: (node) => node.type,
      getChildren:node=>{
        const key=isSharedKey&&directSharedKey(node);
        return key&&isSharedKey?.(key)?[]:getChildren(node);
      },
      getMainComponent:async node=>{
        const main=await getMainComponent(node);
        return main&&isSharedKey?.(main.key)?null:main;
      },
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
            referenceByKey:indexed?.referenceByKey,
            freshnessChecker: libraryComponentFreshnessChecker,
            observedComponentKeys,
            focusNodeIds,
            getComponentKeyCached,
            buildNodeSegments,
            throwIfCancelled,
          },
        ),
      shouldExclude: (item) =>
        skipLegacyShell && isShellComponentAuditExcluded(item),
      freshnessChecker: libraryComponentFreshnessChecker,
      dependencyConcurrency,
      throwIfCancelled,
    },
  ));
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
