/// <reference types="@figma/plugin-typings" />

import {
  areReferenceCatalogsReady,
  ensureReferenceCatalogsForKeys,
  ensureReferenceCatalogsLoaded,
  findComponent,
  getCorporateCounterpart,
  getTokenCatalogs,
  isNestedComponentLayoutPathHostControlled,
  isNestedComponentPaintPathHostControlled,
  isNestedComponentTextPathHostControlled,
  reportMissingReference,
  resolveStructure,
  resolveStructureForInstance,
  resolveVariantKeyForInstance,
} from './reference/library';
import {
  applyMaterializedHostVariantBaselines,
  applyMaterializedHostVariantBaselineToNode,
  getMaterializedInstanceReferenceDecision,
  mergeMaterializedInstanceReferenceNode,
} from './reference/nestedReferenceMerge';
import { LibraryComponent } from './reference/libraryTypes';
import { snapshotTree } from './structure/snapshot';
import { diffExplicitNestedVariantStates, diffStructures } from './structure/diff';
import {
  buildOccurrenceIndexMap,
  buildOccurrenceKeyMap,
  makeOccurrenceKey,
} from './structure/occurrenceKeys';
import type { DSStructureNode } from './types/structures';
import type { AuditItem, PathSegment, RelevanceStatus } from './types/audit';
import { LEFT_SECTION_ORDER, tabDefinitions } from './config/tabs';
import { buildNodePath, clampColorComponent, extractAliasKey, getPageName } from './utils/nodeHelpers';
import {
  collectCustomStyles,
  collectDetachedEntry,
  computeChangesResults,
  type CustomStyleCollectionOptions,
} from './services/auditViewBuilder';
import {
  collectDeprecatedStyleUsages,
  type DeprecatedStyleCollectionOptions,
} from './services/deprecatedStyleAudit';
import {
  ensureStyleMetadataLoaded,
  extractStyleKey,
  getStyleMetadataFromKnownKey,
  isKnownStyleId,
  normalizeStyleId,
  resolveStyleLabelForDiff,
  resolveStyleMetadata,
} from './services/styleMetadata';
import { CheckState, createCheckState } from './create-check-state';
import { applyAllowedCustomizationRules } from './filters/allowedCustomizationRules';
import { applyCustomizationFilters } from './filters/customizationFilters';
import { filterIgnoredLocalLibraryItems } from './filters/ignoredComponentFilters';
import { markSuppressedDiff, createRuntimeSuppressionDependencies } from './filters/suppressionPolicy';
import {
  getForcedAuditCategory,
  getForcedAuditCategoryReason,
  getHiddenTabsForChannel,
  supportsThemizationForChannel,
} from './policies/componentAuditPolicy';
import {
  buildCorporateThemizationEntry,
  buildPageThemizationEntry,
  getContainingPage,
} from './services/themeAudit';
import {
  isWrongChannelComponent,
  parseAuditChannel,
  type AuditChannel,
} from './services/channelAudit';
import {
  getTimestamp,
  isAuditTraceEnabled,
  logAuditMetric,
  setAuditTraceEnabled,
  traceAudit,
} from './utils/auditInstrumentation';
import { resolveCachedComponentKey } from './utils/componentKeyCache';
import {
  countVariantPropertyMatches,
  parseVariantName,
  variantMatchesSourceWithDefaultExtras,
  variantPropertiesEqual,
} from './utils/variantProperties';
import { buildApolloStatsReport } from './stats/report';
import { submitApolloStatsReport } from './stats/collector';
import type { StatsResource } from './stats/types';
import {
  applyAssessmentPresentation,
  assessCustomizationDiffs,
  collapseVisualDiffsUnderVariantChanges,
  collapsePatternViolationDiffs,
  collapseConfiguredSemanticVariantDiffs,
  collapseSemanticVariantDiffs,
  createNestedContextEvidence,
  createPatternContextResolver,
} from './assessment/customizationAssessment';

declare const __APOLLO_VERSION__: string;

const APOLLO_VERSION = __APOLLO_VERSION__;

figma.showUI(__html__, { width: 800, height: 860 });
console.log('[Apollo] plugin version', { version: APOLLO_VERSION });
const EXPANDED_UI_SIZE = { width: 800, height: 860 };
const COMPACT_UI_SIZE = { width: 263, height: 860 };
// Передаём UI конфигурацию табов из централизованного источника.
figma.ui.postMessage({
  type: 'tab-config',
  payload: {
    definitions: tabDefinitions,
    leftSectionOrder: LEFT_SECTION_ORDER,
  },
});

startCatalogPreload();

figma.ui.onmessage = (msg) => {
  if (msg.type === 'ping') {
    figma.ui.postMessage({ type: 'pong' });
    return;
  }

  if (msg.type === 'scan-selection') {
    void runAudit(undefined, parseAuditChannel(msg.payload?.pickerLabel));
    return;
  }

  if (msg.type === 'cancel-scan') {
    if (scanInProgress) {
      cancelRequested = true;
    }
    return;
  }

  if (msg.type === 'set-ui-compact') {
    const compact = msg.payload?.compact === true;
    const targetSize = compact ? COMPACT_UI_SIZE : EXPANDED_UI_SIZE;
    figma.ui.resize(targetSize.width, targetSize.height);
    return;
  }

  if (msg.type === 'focus-node') {
    focusNode(msg.payload?.id).catch((error) => {
      console.error('Failed to focus node', error);
      figma.notify('Не удалось перейти к слою.');
    });
    return;
  }

  if (msg.type === 'reset-customization-group') {
    void resetCustomizationGroup(msg.payload).catch((error) => {
      console.error('Failed to reset customization group', error);
      figma.notify('Не удалось сбросить изменения.');
    });
    return;
  }

  if (msg.type === 'apply-themization-action') {
    void applyThemizationAction(msg.payload).catch((error) => {
      console.error('Failed to apply themization action', error);
      figma.notify('Не удалось применить изменения темизации.');
    });
    return;
  }

  if (msg.type === 'set-debug-audit') {
    setAuditTraceEnabled(msg.payload?.enabled === true);
    figma.ui.postMessage({
      type: 'debug-audit-state',
      payload: { enabled: isAuditTraceEnabled() },
    });
    return;
  }

  if (msg.type === 'get-debug-audit') {
    figma.ui.postMessage({
      type: 'debug-audit-state',
      payload: { enabled: isAuditTraceEnabled() },
    });
    return;
  }
};

let scanInProgress = false;
let cancelRequested = false;
let catalogPreloadStarted = false;
let lastAuditSelectionIds: string[] = [];
let lastAuditChannel: AuditChannel = 'Desktop';
const STRICT_COMPARISON = true;
// Compare nested instances against their own component references to avoid placeholder diffs.
const COMPARE_NESTED_INSTANCES_BY_COMPONENT = true;

class AuditCancelledError extends Error {
  constructor() {
    super('AUDIT_CANCELLED');
    this.name = 'AuditCancelledError';
  }
}

type TokenLabelEntry = {
  label: string;
  library?: string;
  sourceFile?: string;
  resolvedType?: string;
};

let tokenLabelMap: Map<string, TokenLabelEntry> | null = null;
let tokenLabelLoadPromise: Promise<void> | null = null;

const runtimeSuppressionDependencies = createRuntimeSuppressionDependencies(
  isNestedComponentPaintPathHostControlled,
  isNestedComponentTextPathHostControlled,
  isNestedComponentLayoutPathHostControlled,
);

/**
 * Запускает полный аудит текущего выделения: проверяет готовность справочников,
 * снимает snapshоты, классифицирует узлы и формирует структуры для табов UI.
 */
async function runAudit(
  selectionOverride?: readonly SceneNode[],
  selectedChannel: AuditChannel = 'Desktop',
) {
  if (scanInProgress) {
    figma.notify('Проверка уже выполняется.');
    return;
  }
  scanInProgress = true;
  cancelRequested = false;

  figma.ui.postMessage({ type: 'scan-started' });

  let finished = false;

  const auditStart = getTimestamp();
  const auditStartedAt = new Date();

  const finalize = (status: 'finished' | 'cancelled') => {
    if (finished) return;

    finished = true;

    if (status === 'cancelled') {
      figma.ui.postMessage({ type: 'scan-cancelled' });
    } else {
      figma.ui.postMessage({ type: 'scan-finished' });
    }

    scanInProgress = false;

    cancelRequested = false;

    console.log(
      `[Apollo] audit total: ${(getTimestamp() - auditStart).toFixed(
        1,
      )} ms (${status})`,
    );
  };

  const throwIfCancelled = () => {
    if (cancelRequested) {
      throw new AuditCancelledError();
    }
  };

  try {
    if (!areReferenceCatalogsReady()) {
      figma.notify('Подключаемся к библиотекам Apollo…');
    }

    const preloadStartedAt = getTimestamp();
    await ensureReferenceCatalogsLoaded();
    await ensureTokenLabelMapLoaded();
    await ensureStyleMetadataLoaded();
    logAuditMetric('audit-reference-ready', {
      totalMs: Number((getTimestamp() - preloadStartedAt).toFixed(1)),
    });
    throwIfCancelled();

  } catch (error) {
    if (error instanceof AuditCancelledError) {
      finalize('cancelled');
      return;
    }

    console.error('Failed to load reference catalogs', error);

    const message =
      'Не удалось загрузить данные библиотеки. Проверьте интернет-соединение и попробуйте ещё раз.';

    figma.notify(message);

    figma.ui.postMessage({ type: 'scan-error', payload: { message } });

    finalize('finished');

    return;
  }

  try {
    throwIfCancelled();

    const selection = selectionOverride ?? figma.currentPage.selection;

    if (selection.length === 0) {
      const message = 'Выделите область или слой, чтобы проверить компоненты.';

      figma.notify(message);

      figma.ui.postMessage({ type: 'scan-error', payload: { message } });

      finalize('finished');

      return;
    }

    lastAuditSelectionIds = selection.map((node) => node.id);
    lastAuditChannel = selectedChannel;

    const componentKeyCache = new Map<string, string | null>();
    const keyCollectStartedAt = getTimestamp();
    const selectionComponentKeys = await collectComponentKeys(
      selection,
      componentKeyCache,
      throwIfCancelled,
    );
    await ensureReferenceCatalogsForKeys(selectionComponentKeys);
    logAuditMetric('audit-component-reference-ready', {
      totalMs: Number((getTimestamp() - keyCollectStartedAt).toFixed(1)),
      componentKeyCount: selectionComponentKeys.size,
    });
    throwIfCancelled();

    const checkState = createCheckState()

    if (supportsThemizationForChannel(selectedChannel)) {
      const pageThemizationEntry = await buildPageThemizationEntry(selection);
      if (pageThemizationEntry) {
        checkState.themizationEntries.push(pageThemizationEntry);
      }
    } else {
      traceAudit('themization-skipped', {
        selectedChannel,
        categoryDecision: 'skipped-check',
        reason: 'themization is disabled for the selected channel',
      });
    }

    const referenceStructureCache = new Map<string, DSStructureNode[] | null>();
    const localComponentContextCache = new Map<string, boolean>();
    const checkedComponentNodesList = new Set<string>();

    const customStyleReasonOptions: CustomStyleCollectionOptions = {
      tokenLabelMap: tokenLabelMap ?? new Map(),
      isKnownStyleId,
      resolveStyleMetadata,
    };
    const deprecatedStyleOptions: DeprecatedStyleCollectionOptions = {
      resolveStyleMetadata,
    };

    const collectStartedAt = getTimestamp();
    await collectTargets(
      selection,
      checkState,
      selectedChannel,
      referenceStructureCache,
      componentKeyCache,
      localComponentContextCache,
      customStyleReasonOptions,
      deprecatedStyleOptions,
      checkedComponentNodesList,
      throwIfCancelled,
    );
    logAuditMetric('audit-diff-phase', {
      totalMs: Number((getTimestamp() - collectStartedAt).toFixed(1)),
      totalItems: checkState.totalItems,
    });
    
    if (checkState.totalItems === 0) {
      const message = 'Компоненты или инстансы в выделении не найдены.';

      figma.notify(message);
      
      figma.ui.postMessage({ type: 'scan-error', payload: { message } });
    }

    throwIfCancelled();

    const changesResults = computeChangesResults(checkState.relevanceBuckets.current);
    const visibleLocalItems = filterIgnoredLocalLibraryItems(
      checkState.localLibraryItems,
    );

    const visibleViews = {
      relevance: checkState.relevanceBuckets,
      themization: checkState.themizationEntries,
      wrongChannel: checkState.wrongChannelEntries,
      local: visibleLocalItems,
      deprecatedStyles: checkState.deprecatedStyleEntries,
      customStyles: checkState.customStyleEntries,
      detached: checkState.detachedEntries,
      presets: checkState.presetItems,
      changes: changesResults,
    };

    figma.ui.postMessage({
      type: 'scan-result',
      payload: {
        summary: {
          totalTargets: checkState.totalItems,
        },
        ui: {
          hiddenTabIds: getHiddenTabsForChannel(selectedChannel),
        },
        visibleViews,
      },
    });

    try {
      const currentUser = figma.currentUser;
      const selectionStats = await Promise.all(
        selection.map(async (node) => ({
          nodeId: node.id,
          name: node.name,
          nodeType: node.type,
          path: buildNodePath(node),
          componentKey:
            node.type === 'INSTANCE' || node.type === 'COMPONENT'
              ? await getComponentKeyCached(node, componentKeyCache)
              : null,
        })),
      );
      const report = buildApolloStatsReport({
        pluginVersion: APOLLO_VERSION,
        user: {
          id: currentUser?.id ?? null,
          name: currentUser?.name ?? 'Unknown User',
        },
        figma: {
          fileKey: figma.fileKey ?? null,
          fileName: figma.root.name ?? null,
          editorType: figma.editorType,
        },
        scan: {
          channel: selectedChannel,
          startedAt: auditStartedAt,
          finishedAt: new Date(),
          selection: selectionStats,
          scannedComponents: checkState.totalItems,
        },
        views: {
          deprecatedComponents: checkState.relevanceBuckets.deprecated,
          deprecatedStyles: checkState.deprecatedStyleEntries,
          customStyles: checkState.customStyleEntries,
          updates: checkState.relevanceBuckets.update,
          customizations: changesResults,
          localComponents: visibleLocalItems,
          detachedComponents: checkState.detachedEntries,
          presets: checkState.presetItems,
          technicalComponents: checkState.relevanceBuckets.technical,
          currentComponents: checkState.relevanceBuckets.current,
          wrongChannel: checkState.wrongChannelEntries,
          themization: checkState.themizationEntries,
        },
        resolveStyleResource: resolveStyleStatsResource,
        resolveTokenResource: resolveTokenStatsResource,
      });
      void submitApolloStatsReport(report);
    } catch (error) {
      console.warn('[Apollo] failed to prepare stats report', error);
    }

    finalize('finished');
  } catch (error) {
    if (error instanceof AuditCancelledError) {
      finalize('cancelled');
      return;
    }

    console.error('Unhandled error during audit', error);

    const message = 'Не удалось завершить проверку. Подробности в консоли.';

    figma.notify(message);

    figma.ui.postMessage({ type: 'scan-error', payload: { message } });

    finalize('finished');
  }
}

/**
 * Preload запускается один раз и подготавливает UI, пока каталоги подгружаются в фоне.
 */
function startCatalogPreload() {
  if (catalogPreloadStarted) return;
  catalogPreloadStarted = true;
  figma.ui.postMessage({ type: 'catalog-loading' });
  ensureReferenceCatalogsLoaded()
    .then(() => {
      figma.ui.postMessage({ type: 'catalog-ready' });
    })
    .catch((error) => {
      console.error('Catalog preload failed', error);
      const message =
        'Не удалось загрузить библиотеки. Проверьте подключение и попробуйте снова.';
      figma.ui.postMessage({ type: 'catalog-error', payload: { message } });
    });
}

async function collectComponentKeys(
  selection: readonly SceneNode[],
  componentKeyCache: Map<string, string | null>,
  throwIfCancelled: () => void,
): Promise<Set<string>> {
  const keys = new Set<string>();

  const isNodeVisibleSafe = (candidate: SceneNode): boolean => {
    try {
      return 'visible' in candidate
        ? (candidate as SceneNode & { visible: boolean }).visible !== false
        : true;
    } catch (_error) {
      return false;
    }
  };

  const visit = async (node: SceneNode): Promise<void> => {
    throwIfCancelled();

    if (!isNodeVisibleSafe(node)) {
      return;
    }

    if (node.type === 'INSTANCE' || node.type === 'COMPONENT') {
      const key = await getComponentKeyCached(node, componentKeyCache);
      if (key) {
        keys.add(key);
      }
    }

    if ('children' in node && node.children.length > 0) {
      for (const child of node.children) {
        await visit(child as SceneNode);
      }
    }
  };

  for (const node of selection) {
    await visit(node);
  }

  return keys;
}

async function collectTargets(
  selection: readonly SceneNode[], 
  checkState: CheckState, 
  selectedChannel: AuditChannel,
  referenceStructureCache: Map<string, DSStructureNode[] | null>,
  componentKeyCache: Map<string, string | null>,
  localComponentContextCache: Map<string, boolean>,
  customStyleReasonOptions: CustomStyleCollectionOptions,
  deprecatedStyleOptions: DeprecatedStyleCollectionOptions,
  checkedComponentNodesList: Set<string>,
  throwIfCancelled: () => void,
) {
  const themizationEnabled = supportsThemizationForChannel(selectedChannel);
  const isNodeVisibleSafe = (candidate: SceneNode): boolean => {
    try {
      return 'visible' in candidate ? (candidate as SceneNode & { visible: boolean }).visible !== false : true;
    } catch (_error) {
      return false;
    }
  };

  const visit = async (
    node: SceneNode,
    inheritedForcedCategory: 'technical' | 'deprecated' | null = null,
  ): Promise<void> => {
      throwIfCancelled();

      if (!isNodeVisibleSafe(node)) {
        return;
      }

      if (inheritedForcedCategory) {
        return;
      }

      const nodeIsComponent = node.type === 'INSTANCE' || node.type === 'COMPONENT'
      let subtreeForcedCategory: 'technical' | 'deprecated' | null = null;

      if (nodeIsComponent) {
        const item = await classifyNode(
          node,
          referenceStructureCache,
          componentKeyCache,
          localComponentContextCache,
          checkedComponentNodesList,
          throwIfCancelled,
        );
        throwIfCancelled();

        checkState.totalItems++;
        subtreeForcedCategory = item.forcedCategory ?? null;

        const wrongChannel =
          item.reference != null &&
          isWrongChannelComponent(item.reference, selectedChannel);

        if (item.relevance && !(wrongChannel && item.relevance === 'current')) {
          checkState.relevanceBuckets[item.relevance].push(item);
        }

        if (!subtreeForcedCategory && item.reference && themizationEnabled) {
          const themizationEntry = buildCorporateThemizationEntry(
            node,
            item.reference,
          );
          if (themizationEntry) {
            checkState.themizationEntries.push(themizationEntry);
          }

        }

        if (!subtreeForcedCategory && item.reference && wrongChannel) {
          checkState.wrongChannelEntries.push(item);
        }

        if (!subtreeForcedCategory && item.isLocal) {
          checkState.localLibraryItems.push(item);
        }

        if (!subtreeForcedCategory && isPresetCandidate(item)) {
          checkState.presetItems.push(item);
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
          return;
        }
      }

      if (node.type === 'FRAME' ||  node.type === 'GROUP') { 
        const item = collectDetachedEntry(node);

        if (item) {
          checkState.detachedEntries.push(item);
        }
      }

      if (node.type !== 'SECTION') {
          const customStyleReasons = await collectCustomStyles(node, customStyleReasonOptions);
          const deprecatedStyleEntries = await collectDeprecatedStyleUsages(
            node,
            deprecatedStyleOptions,
          );

          if (customStyleReasons.length) {
            checkState.customStyleEntries = [
              ...checkState.customStyleEntries, 
              ...customStyleReasons
            ];
          }

          if (deprecatedStyleEntries.length) {
            checkState.deprecatedStyleEntries = [
              ...checkState.deprecatedStyleEntries,
              ...deprecatedStyleEntries,
            ];
          }
      }

      if ('children' in node && node.children.length > 0) {
        for (const child of node.children) {
          throwIfCancelled();
          await visit(child as SceneNode, subtreeForcedCategory);
        }
      }
  };

  for (const node of selection) {
    throwIfCancelled();
    await visit(node as SceneNode);
  }
}

/**
 * Приводит SceneNode к `AuditItem`: ищет компонент в каталогах, делает снапшот,
 * сравнивает структуру и собирает diff-последствия, статус темы и причины кастомизации.
 */
async function classifyNode(
  node: SceneNode,
  referenceStructureCache: Map<string, DSStructureNode[] | null>,
  componentKeyCache: Map<string, string | null>,
  localComponentContextCache: Map<string, boolean>,
  checkedComponentNodesList: Set<string>,
  throwIfCancelled: () => void,
): Promise<AuditItem> {
  throwIfCancelled();
  const nodeSegments = buildNodeSegments(node);

  const pathSegments =
    nodeSegments.length > 1
      ? nodeSegments.slice(1)
      : nodeSegments.length
        ? nodeSegments
        : [{ id: node.id, label: node.name, nodeType: node.type, visible: true }];

  const pageName = getPageName(node);
  const fullPath = buildNodePath(node);
  const componentKey = await getComponentKeyCached(node, componentKeyCache, {
    retryIfMissing: true,
  });
  throwIfCancelled();
  let ref = componentKey ? findComponent(componentKey) : null;

  if (componentKey && !ref) {
    await ensureReferenceCatalogsForKeys([componentKey]);
    ref = findComponent(componentKey);
  }

  if (!componentKey || !ref) {
    reportMissingReference(node.name, componentKey);
    const isRemoteLibraryNode = await getIsRemoteLibraryNode(node);

    return {
      id: node.id,
      name: node.name,
      nodeType: node.type,
      relevance: 'unknown',
      isLocal: !isRemoteLibraryNode,
      pageName,
      pathSegments,
      fullPath,
      librarySource: null,
      librarySourceFile: null,
      componentKey,
      comparisonIssues: [],
      diffs: []
    }
  }

  const comparisonIssues: string[] = [];
  const instanceVariantProperties =
    node.type === 'INSTANCE' ? ((node as InstanceNode).variantProperties ?? null) : null;
  const resolvedReferenceVariantKey =
    node.type === 'INSTANCE'
      ? resolveVariantKeyForInstance(ref, componentKey, instanceVariantProperties)
      : componentKey;
  const resolvedReferenceVariantName =
    ref.variants?.find((item) => item?.key === resolvedReferenceVariantKey)?.name ?? null;
  const forcedCategory = getForcedAuditCategory(ref);
  const forcedCategoryReason =
    forcedCategory ? getForcedAuditCategoryReason(forcedCategory, ref) : null;

  let referenceStructure = getReferenceStructureCached(
    ref,
    componentKey,
    instanceVariantProperties,
    referenceStructureCache,
  );

  if (ref && componentKey && Array.isArray(ref.variants) && ref.variants.length) {
    const variant = ref.variants.find((item) => item?.key === resolvedReferenceVariantKey);
    if (!variant) {
      comparisonIssues.push(
        `Вариант ${resolvedReferenceVariantKey ?? componentKey} не найден в каталоге для «${ref.name ?? node.name}»`,
      );
      referenceStructure = null;
    } else if (!ref.variantStructures || !ref.variantStructures[variant.key]) {
      comparisonIssues.push(
        `Нет variantStructures для «${variant.name ?? resolvedReferenceVariantKey ?? componentKey}» (${ref.name ?? node.name})`,
      );
      referenceStructure = null;
    }
  }
  const needsDiff = Boolean(referenceStructure) && !checkedComponentNodesList.has(node.id);
  const instanceHasOverrides =
    node.type === 'INSTANCE' && hasInstanceOverrides(node as InstanceNode);
  const isInheritedFromLocalComponentContext =
    node.type === 'INSTANCE' &&
    (await isInsideLocalComponentContext(node, componentKeyCache, localComponentContextCache));
  const shouldDiff =
    !forcedCategory &&
    needsDiff &&
    (ref?.status !== 'current' ||
      instanceHasOverrides ||
      isInheritedFromLocalComponentContext);
  const actualStructure =
    shouldDiff && referenceStructure ? await snapshotTree(node, checkedComponentNodesList) : null;
  throwIfCancelled();
  const alignedActualStructure =
    referenceStructure && actualStructure
      ? alignStructurePaths(actualStructure, referenceStructure)
      : actualStructure;
  const expandedReferenceStructure =
    shouldDiff &&
    referenceStructure &&
    alignedActualStructure &&
    COMPARE_NESTED_INSTANCES_BY_COMPONENT
      ? expandReferenceWithInstanceComponents(referenceStructure, alignedActualStructure)
      : referenceStructure;

  const diffStartedAt = getTimestamp();
  const diffResult =
    shouldDiff && expandedReferenceStructure && alignedActualStructure
      ? diffStructures(alignedActualStructure, expandedReferenceStructure, {
          strict: STRICT_COMPARISON,
          resolveTokenLabel: resolveTokenLabelForDiff,
          resolveStyleLabel: resolveStyleLabelForDiff,
          isPaintToken: isColorTokenForPaintDiff,
        })
      : { diffs: [], issues: [] };
  if (diffResult.issues.length) {
    comparisonIssues.push(...diffResult.issues);
  }

  const markedDiffs = diffResult.diffs.map((diff) =>
    markSuppressedDiff(diff, runtimeSuppressionDependencies),
  );
  const explicitVariantStateDiffs =
    shouldDiff && referenceStructure && alignedActualStructure
      ? diffExplicitNestedVariantStates(
          alignedActualStructure,
          referenceStructure,
          markedDiffs,
        ).map((diff) => markSuppressedDiff(diff, runtimeSuppressionDependencies))
      : [];
  const diffsForAssessment = markedDiffs.concat(explicitVariantStateDiffs);
  const hostDiffs =
    shouldDiff && referenceStructure && alignedActualStructure
      ? diffStructures(alignedActualStructure, referenceStructure, {
          strict: STRICT_COMPARISON,
          resolveTokenLabel: resolveTokenLabelForDiff,
          resolveStyleLabel: resolveStyleLabelForDiff,
          isPaintToken: isColorTokenForPaintDiff,
        }).diffs
      : [];
  const assessedDiffs = assessCustomizationDiffs(diffsForAssessment, {
    hostDiffs,
    hostReference: referenceStructure ?? [],
    nestedContextEvidence: alignedActualStructure
      ? createNestedContextEvidence(
          alignedActualStructure,
          (instance) => {
            const nestedReference = findComponent(
              instance.componentInstance?.componentKey ?? '',
            );
            return resolveStructureForInstance(
              nestedReference,
              instance.componentInstance ?? null,
            );
          },
          diffsForAssessment,
          (nestedComponentKey) =>
            findComponent(nestedComponentKey)?.key ?? nestedComponentKey,
          {
            resolveTokenLabel: resolveTokenLabelForDiff,
            resolveStyleLabel: resolveStyleLabelForDiff,
            isPaintToken: isColorTokenForPaintDiff,
          },
        )
      : undefined,
    resolvePatternContext:
      alignedActualStructure && referenceStructure
        ? createPatternContextResolver({
            actualStructure: alignedActualStructure,
            hostReference: referenceStructure,
            hostComponentKey: ref?.key ?? componentKey ?? null,
            hostComponentName:
              ref?.displayName ?? ref?.name ?? ref?.names?.[0] ?? node.name,
            resolveComponent: findComponent,
          })
        : undefined,
  });
  const semanticDiffs = collapsePatternViolationDiffs(
    collapseVisualDiffsUnderVariantChanges(
      applyAssessmentPresentation(
        collapseSemanticVariantDiffs(
          collapseConfiguredSemanticVariantDiffs(assessedDiffs, {
            actualStructure: alignedActualStructure ?? [],
            hostReference: referenceStructure ?? [],
            hostComponentKey: ref?.key ?? componentKey ?? null,
            resolveFamilyKey: (nestedComponentKey) =>
              findComponent(nestedComponentKey)?.key ?? nestedComponentKey,
          }),
          alignedActualStructure ?? [],
        ),
      ),
      alignedActualStructure ?? [],
    ),
    alignedActualStructure ?? [],
  );
  const allowlistedDiffs = applyAllowedCustomizationRules(semanticDiffs, {
    libraryName: ref?.source ?? null,
    componentName: node.name,
    referenceComponentName: ref?.displayName ?? ref?.name ?? ref?.names?.[0] ?? null,
  });
  const diffs = applyCustomizationFilters(allowlistedDiffs, {
    libraryName: ref?.source ?? null,
    componentName: ref?.displayName ?? ref?.name ?? node.name,
  });
  debugPaintMeDiffPipeline({
    componentName: ref?.displayName ?? ref?.name ?? node.name,
    alignedActualStructure,
    expandedReferenceStructure,
    rawDiffs: diffResult.diffs,
    markedDiffs: assessedDiffs,
    allowlistedDiffs,
    finalDiffs: diffs,
  });

  traceAudit('reference-resolution', {
    nodeId: node.id,
    nodeName: node.name,
    componentKey,
    actualVariantProperties:
      node.type === 'INSTANCE' ? (node as InstanceNode).variantProperties ?? null : null,
    referenceKey: ref.key ?? null,
    referenceStatus: ref.status,
    referenceVariantKey: resolvedReferenceVariantKey,
    referenceVariantName: resolvedReferenceVariantName,
    categoryDecision: forcedCategory ?? 'default',
    shouldDiff,
    referenceNodes: expandedReferenceStructure?.length ?? 0,
    actualNodes: alignedActualStructure?.length ?? 0,
    rawDiffs: diffResult.diffs.length,
    allowlistedDiffs: diffsForAssessment.length - allowlistedDiffs.length,
    filteredDiffs: diffs.length,
    diffDurationMs: Number((getTimestamp() - diffStartedAt).toFixed(1)),
  });

  if (forcedCategory) {
    traceAudit('category-decision', {
      nodeId: node.id,
      nodeName: node.name,
      libraryName: ref?.source ?? null,
      componentName: ref?.displayName ?? ref?.name ?? node.name,
      categoryDecision: forcedCategory,
      matchedRule: forcedCategory,
      property: null,
      expected: null,
      actual: null,
      reason: forcedCategoryReason,
    });
  }

  if (comparisonIssues.length) {
    console.warn('[Apollo] comparison issues', {
      nodeId: node.id,
      name: node.name,
      issues: comparisonIssues.slice(0, 8),
      issuesText: comparisonIssues.slice(0, 8).join(' | '),
      total: comparisonIssues.length,
    });
  }

  const relevance = forcedCategory ?? normalizeRelevanceStatus(ref.status);

  return {
    id: node.id,
    name: node.name,
    nodeType: node.type,
    pageName,
    pathSegments,
    fullPath,
    relevance,
    librarySource: ref?.source ?? null,
    librarySourceFile: ref?.sourceFile ?? null,
    isLocal: false,
    reference: ref,
    componentKey,
    diffs,
    comparisonIssues,
    forcedCategory,
    forcedCategoryReason,
    resolvedReferenceVariantKey,
    resolvedReferenceVariantName,
  };
}

async function getComponentKey(node: SceneNode): Promise<string | null> {
  if (node.type === 'INSTANCE') {
    const mainComponent = await node.getMainComponentAsync();
    return mainComponent ? mainComponent.key : null;
  }

  if (node.type === 'COMPONENT') {
    return node.key ?? null;
  }

  return null;
}

async function getIsRemoteLibraryNode(node: SceneNode): Promise<boolean> {
  try {
    if (node.type === 'INSTANCE') {
      const mainComponent = await node.getMainComponentAsync();
      return mainComponent?.remote === true;
    }

    if (node.type === 'COMPONENT') {
      return node.remote === true;
    }
  } catch (_error) {
    return false;
  }

  return false;
}

async function getComponentKeyCached(
  node: SceneNode,
  cache: Map<string, string | null>,
  options?: {
    retryIfMissing?: boolean;
  },
): Promise<string | null> {
  return resolveCachedComponentKey(
    node.id,
    cache,
    () => getComponentKey(node),
    options,
  );
}

async function isInsideLocalComponentContext(
  node: SceneNode,
  componentKeyCache: Map<string, string | null>,
  localComponentContextCache: Map<string, boolean>,
): Promise<boolean> {
  let current = node.parent as BaseNode | null;

  while (current) {
    const currentId = current.id;
    if (localComponentContextCache.has(currentId)) {
      return localComponentContextCache.get(currentId) === true;
    }

    let isLocalContext = false;

    if (current.type === 'INSTANCE' || current.type === 'COMPONENT') {
      const currentKey = await getComponentKeyCached(
        current as SceneNode,
        componentKeyCache,
        { retryIfMissing: true },
      );
      isLocalContext = Boolean(currentKey && !findComponent(currentKey));
    }

    if (isLocalContext) {
      localComponentContextCache.set(currentId, true);
      return true;
    }

    if (current.type === 'PAGE' || current.type === 'DOCUMENT') {
      localComponentContextCache.set(currentId, false);
      return false;
    }

    current = current.parent as BaseNode | null;
  }

  return false;
}

/**
 * Проверяет, содержит ли инстанс конкретные переопределения, чтобы
 * не делать diff для чистых текущих компонентов при strict-видимости.
 */
function hasInstanceOverrides(instance: InstanceNode): boolean {
  const overrides = instance.overrides;
  return Array.isArray(overrides) && overrides.length > 0;
}

async function focusNode(nodeId: string | undefined) {
  if (!nodeId) return;
  const node = await figma.getNodeByIdAsync(nodeId);

  if (!node || node.type === 'DOCUMENT') {
    figma.notify('Не удалось найти слой для перехода');
    return;
  }

  let page: PageNode | null = null;
  let current: BaseNode | null = node;

  while (current) {
    if (current.type === 'PAGE') {

      page = current as PageNode;
      break;
    }
    current = current.parent as BaseNode | null;
  }

  if (!page) {
    figma.notify('Не удалось определить страницу для этого слоя');
    return;
  }

  try {
    await figma.setCurrentPageAsync(page)
  } catch (error) {
    console.error('Failed to switch page asynchronously', error);
    figma.notify('Не удалось перейти на страницу слоя');
    return;
  }

  try {
    figma.currentPage.selection = [node as SceneNode];
    figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
  } catch (error) {
    console.error('Failed to focus node on page', error);
    figma.notify('Не удалось перейти к слою на этой странице');
  }
}

async function resetCustomizationGroup(payload: {
  rootId?: string;
  nodeId?: string;
  messages?: string[];
  details?: Array<{
    property?: string;
    reference?: {
      value?: string | number | null;
      resourceType?: 'style' | 'token' | 'color';
      resourceId?: string | null;
      displayName?: string | null;
    };
    message?: string;
  }>;
  remediations?: Array<{
    kind?: string;
    nodeId?: string;
    properties?: Record<string, string>;
  }>;
}) {
  const rootId = typeof payload?.rootId === 'string' ? payload.rootId : '';
  const nodeId = typeof payload?.nodeId === 'string' ? payload.nodeId : '';
  const messages = Array.isArray(payload?.messages)
    ? payload.messages.filter(
        (message): message is string =>
          typeof message === 'string' && message.trim().length > 0,
      )
    : [];
  const details = Array.isArray(payload?.details)
    ? payload.details.filter(
        (detail) =>
          detail &&
          typeof detail.property === 'string' &&
          detail.property.length > 0 &&
          detail.reference &&
          typeof detail.reference === 'object',
      )
    : [];
  const remediations = Array.isArray(payload?.remediations)
    ? payload.remediations.filter(
        (item) =>
          item?.kind === 'set-variant-properties' &&
          typeof item.nodeId === 'string' &&
          item.nodeId.length > 0 &&
          item.properties &&
          typeof item.properties === 'object',
      )
    : [];

  if (!rootId || !nodeId || (!messages.length && !details.length && !remediations.length)) {
    figma.notify('Недостаточно данных для сброса изменений.');
    return;
  }

  await ensureReferenceCatalogsLoaded();

  const rootNode = await getSceneNodeById(rootId);
  const targetNode = await getSceneNodeById(nodeId);

  if (!rootNode || !targetNode) {
    figma.notify('Не удалось найти узел для сброса изменений.');
    return;
  }

  if (remediations.length) {
    for (const remediation of remediations) {
      const variantNode = await getSceneNodeById(remediation.nodeId!);
      if (variantNode?.type !== 'INSTANCE') {
        figma.notify('Не удалось найти вложенный компонент для смены варианта.');
        return;
      }
      variantNode.setProperties(remediation.properties!);
    }

    if (!messages.length && !details.length) {
      figma.notify('Параметры компонента восстановлены.');
      await rerunLastAuditWithFallback([rootNode]);
      return;
    }
  }

  const componentKey = await getComponentKey(rootNode);
  await ensureReferenceCatalogsForKeys([componentKey]);
  const ref = componentKey ? findComponent(componentKey) : null;
  const instanceVariantProperties =
    rootNode.type === 'INSTANCE' ? (rootNode.variantProperties ?? null) : null;
  const referenceStructure = getReferenceStructure(
    ref,
    componentKey,
    instanceVariantProperties,
  );

  if (!referenceStructure?.length) {
    figma.notify('Не удалось загрузить эталонную структуру компонента.');
    return;
  }

  const checkedComponentNodesList = new Set<string>();
  const actualStructure = await snapshotTree(rootNode, checkedComponentNodesList);
  const alignedActualStructure = alignStructurePaths(actualStructure, referenceStructure);
  const expandedReferenceStructure =
    COMPARE_NESTED_INSTANCES_BY_COMPONENT
      ? expandReferenceWithInstanceComponents(referenceStructure, alignedActualStructure)
      : referenceStructure;

  const actualEntry = alignedActualStructure.find((entry) => entry.nodeId === nodeId);
  if (!actualEntry) {
    figma.notify('Не удалось сопоставить изменённый узел со структурой компонента.');
    return;
  }

  const actualOccurrenceKeys = buildOccurrenceKeyMap(alignedActualStructure);
  const expandedReferenceOccurrenceKeys = buildOccurrenceKeyMap(expandedReferenceStructure);
  const actualOccurrenceKey = actualOccurrenceKeys.get(actualEntry) ?? actualEntry.path;

  const referenceNode = expandedReferenceStructure.find(
    (entry) =>
      (expandedReferenceOccurrenceKeys.get(entry) ?? entry.path) === actualOccurrenceKey,
  );
  if (!referenceNode) {
    figma.notify('Не удалось найти эталонные значения для этого узла.');
    return;
  }

  if (details.length) {
    await applyReferenceResetByDetails(targetNode, details);
  }
  if (messages.length) {
    await applyReferenceResetByMessages(targetNode, referenceNode, messages);
  }

  figma.notify('Изменения сброшены.');

  const rerunSelection = await resolveSceneNodesByIds(lastAuditSelectionIds);
  if (rerunSelection.length) {
    void runAudit(rerunSelection, lastAuditChannel);
  } else {
    void runAudit([rootNode], lastAuditChannel);
  }
}

async function getSceneNodeById(nodeId: string): Promise<SceneNode | null> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || node.type === 'DOCUMENT') {
    return null;
  }
  return node as SceneNode;
}

async function resolveSceneNodesByIds(nodeIds: string[]): Promise<SceneNode[]> {
  const resolved = await Promise.all(nodeIds.map((nodeId) => getSceneNodeById(nodeId)));
  return resolved.filter((node): node is SceneNode => Boolean(node));
}

async function rerunLastAuditWithFallback(fallbackSelection: SceneNode[]) {
  const rerunSelection = await resolveSceneNodesByIds(lastAuditSelectionIds);
  if (rerunSelection.length) {
    void runAudit(rerunSelection, lastAuditChannel);
  } else if (fallbackSelection.length) {
    void runAudit(fallbackSelection, lastAuditChannel);
  }
}

async function applyThemizationAction(payload: {
  kind?: string;
  nodeId?: string;
  themeCollectionId?: string;
  targetModeId?: string;
  replacementComponentKey?: string;
}) {
  const kind = typeof payload?.kind === 'string' ? payload.kind : '';
  const nodeId = typeof payload?.nodeId === 'string' ? payload.nodeId : '';
  const themeCollectionId =
    typeof payload?.themeCollectionId === 'string' ? payload.themeCollectionId : '';
  const targetModeId = typeof payload?.targetModeId === 'string' ? payload.targetModeId : '';
  const replacementComponentKey =
    typeof payload?.replacementComponentKey === 'string'
      ? payload.replacementComponentKey
      : '';

  if (!kind || !nodeId) {
    figma.notify('Недостаточно данных для изменения темизации.');
    return;
  }

  await ensureReferenceCatalogsLoaded();

  if (kind === 'corporateComponent') {
    const node = await getSceneNodeById(nodeId);
    if (!node || node.type !== 'INSTANCE') {
      figma.notify('Не удалось найти инстанс для замены.');
      return;
    }

    const replaced = await replaceCorporateInstance(
      node,
      replacementComponentKey || null,
    );
    if (!replaced) {
      figma.notify('Не удалось заменить компонент на базовую версию.');
      return;
    }

    figma.notify('Компонент заменён.');
    await rerunLastAuditWithFallback([node]);
    return;
  }

  const focusNode = await getSceneNodeById(nodeId);
  if (!focusNode) {
    figma.notify('Не удалось найти узел для смены темизации.');
    return;
  }

  const page = getContainingPage(focusNode);
  if (!page) {
    figma.notify('Не удалось определить страницу для смены темизации.');
    return;
  }

  if (!themeCollectionId || !targetModeId) {
    figma.notify('Недостаточно данных для смены mode Theme.');
    return;
  }

  const collection = await figma.variables.getVariableCollectionByIdAsync(themeCollectionId);
  if (!collection) {
    figma.notify('Не удалось получить collection Theme для страницы.');
    return;
  }

  if (!collection.modes.some((mode) => mode.modeId === targetModeId)) {
    figma.notify('Mode Corp не найден в коллекции Theme.');
    return;
  }

  page.setExplicitVariableModeForCollection(collection, targetModeId);
  figma.notify('Темизация переключена на Corp.');
  await rerunLastAuditWithFallback([focusNode]);
}

async function replaceCorporateInstance(
  instance: InstanceNode,
  replacementComponentKey?: string | null,
): Promise<boolean> {
  const sourceProperties = snapshotInstanceComponentProperties(instance);
  const componentKey = await getComponentKey(instance);
  await ensureReferenceCatalogsForKeys([componentKey, replacementComponentKey]);
  const ref = componentKey ? findComponent(componentKey) : null;
  if (!ref) {
    return false;
  }

  const replacementRef =
    replacementComponentKey ? findComponent(replacementComponentKey) : null;
  const pair = replacementRef ? null : getCorporateCounterpart(ref);
  const baseComponent = replacementRef ?? pair?.base ?? null;
  if (!baseComponent) {
    return false;
  }

  const currentVariantName =
    ref.variants?.find((variant) => variant.key === componentKey)?.name ?? null;
  const candidateVariantKey =
    currentVariantName && baseComponent.variants?.length
      ? findBestCatalogVariantKey(baseComponent, currentVariantName)
      : null;

  if (candidateVariantKey) {
    try {
      const targetVariant = await figma.importComponentByKeyAsync(candidateVariantKey);
      instance.swapComponent(targetVariant);
      restoreCompatibleInstanceProperties(instance, sourceProperties);
      return true;
    } catch (error) {
      console.warn('[Apollo] failed to import base variant directly, trying component set fallback', {
        nodeId: instance.id,
        candidateVariantKey,
        error,
      });
    }
  }

  const baseComponentKey = baseComponent.key ?? null;
  if (!baseComponentKey) {
    return false;
  }

  if (baseComponent.variants?.length) {
    try {
      const componentSet = await figma.importComponentSetByKeyAsync(baseComponentKey);
      const targetVariant = findMatchingVariantInSet(componentSet, instance, currentVariantName);

      if (!targetVariant) {
        console.error('[Apollo] failed to find matching base variant in component set', {
          nodeId: instance.id,
          baseComponentKey,
          currentVariantName,
          instanceVariantProperties: instance.variantProperties,
        });
        return false;
      }

      instance.swapComponent(targetVariant);
      restoreCompatibleInstanceProperties(instance, sourceProperties);
      return true;
    } catch (fallbackError) {
      console.error('[Apollo] failed to swap corporate component', {
        nodeId: instance.id,
        baseComponentKey,
        error:
          fallbackError && typeof fallbackError === 'object' && 'message' in fallbackError
            ? String((fallbackError as { message?: string }).message)
            : String(fallbackError ?? 'Unknown error'),
      });
    }
  }

  try {
    const targetComponent = await figma.importComponentByKeyAsync(baseComponentKey);
    instance.swapComponent(targetComponent);
    restoreCompatibleInstanceProperties(instance, sourceProperties);
    return true;
  } catch (error) {
    console.error('[Apollo] failed to import replacement component', {
      nodeId: instance.id,
      baseComponentKey,
      error:
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: string }).message)
          : String(error ?? 'Unknown error'),
    });
    return false;
  }
}

function findMatchingVariantInSet(
  componentSet: ComponentSetNode,
  instance: InstanceNode,
  currentVariantName: string | null,
): ComponentNode | null {
  const instanceVariantProperties = instance.variantProperties ?? {};
  const defaultVariantProperties = getDefaultVariantProperties(componentSet);
  const variants = componentSet.children.filter(
    (child): child is ComponentNode => child.type === 'COMPONENT',
  );

  const exactByName =
    currentVariantName
      ? variants.find((variant) => variant.name === currentVariantName) ?? null
      : null;
  if (exactByName) {
    return exactByName;
  }

  const byCurrentVariantName = currentVariantName
    ? chooseBestVariantByName(
        variants,
        currentVariantName,
        defaultVariantProperties,
      )
    : null;
  if (byCurrentVariantName) {
    return byCurrentVariantName;
  }

  const exactByProperties = variants.find((variant) =>
    variantPropertiesEqual(variant.variantProperties ?? {}, instanceVariantProperties),
  );
  if (exactByProperties) {
    return exactByProperties;
  }

  const defaultCompatible = variants.find((variant) =>
    variantMatchesSourceWithDefaultExtras(
      variant.variantProperties ?? {},
      instanceVariantProperties,
      defaultVariantProperties,
    ),
  );
  if (defaultCompatible) {
    return defaultCompatible;
  }

  const bestByOverlap = variants
    .map((variant) => ({
      variant,
      score: countVariantPropertyMatches(variant.variantProperties ?? {}, instanceVariantProperties),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)[0]?.variant;
  if (bestByOverlap) {
    return bestByOverlap;
  }

  return variants[0] ?? null;
}

function findBestCatalogVariantKey(
  component: LibraryComponent,
  sourceVariantName: string,
): string | null {
  const variants = component.variants ?? [];
  if (!variants.length) {
    return null;
  }

  const exactMatch = variants.find((variant) => variant.name === sourceVariantName);
  if (exactMatch?.key) {
    return exactMatch.key;
  }

  const defaultVariantKey =
    typeof (component as { defaultVariant?: unknown }).defaultVariant === 'string'
      ? ((component as { defaultVariant?: string }).defaultVariant ?? null)
      : null;
  const defaultVariantName =
    variants.find((variant) => variant.key === defaultVariantKey)?.name ??
    variants[0]?.name ??
    '';
  const defaultVariantProperties = parseVariantName(defaultVariantName);
  const compatibleVariant = chooseBestVariantByName(
    variants,
    sourceVariantName,
    defaultVariantProperties,
  );

  return compatibleVariant?.key ?? null;
}

function chooseBestVariantByName<T extends { name?: string | null }>(
  variants: T[],
  sourceVariantName: string,
  defaultVariantProperties: Record<string, string>,
): T | null {
  const sourceVariantProperties = parseVariantName(sourceVariantName);
  const sourceEntries = Object.entries(sourceVariantProperties);

  if (!sourceEntries.length) {
    return null;
  }

  const compatible = variants
    .map((variant) => {
      const targetProperties = parseVariantName(variant.name ?? '');
      const targetEntries = Object.entries(targetProperties);

      if (!targetEntries.length) {
        return null;
      }

      for (const [key, value] of sourceEntries) {
        if (targetProperties[key] !== value) {
          return null;
        }
      }

      let nonDefaultExtraCount = 0;
      let extraCount = 0;
      for (const [key, value] of targetEntries) {
        if (key in sourceVariantProperties) {
          continue;
        }

        extraCount += 1;
        if (defaultVariantProperties[key] !== value) {
          nonDefaultExtraCount += 1;
        }
      }

      return {
        variant,
        nonDefaultExtraCount,
        extraCount,
        name: String(variant.name ?? ''),
      };
    })
    .filter((entry): entry is {
      variant: T;
      nonDefaultExtraCount: number;
      extraCount: number;
      name: string;
    } => Boolean(entry))
    .sort((left, right) => {
      if (left.nonDefaultExtraCount !== right.nonDefaultExtraCount) {
        return left.nonDefaultExtraCount - right.nonDefaultExtraCount;
      }

      if (left.extraCount !== right.extraCount) {
        return left.extraCount - right.extraCount;
      }

      return left.name.localeCompare(right.name);
    });

  return compatible[0]?.variant ?? null;
}

function getDefaultVariantProperties(
  componentSet: ComponentSetNode,
): Record<string, string> {
  const defaults: Record<string, string> = {};

  for (const [propertyName, definition] of Object.entries(
    componentSet.componentPropertyDefinitions ?? {},
  )) {
    if (definition.type !== 'VARIANT') {
      continue;
    }

    if (typeof definition.defaultValue === 'string') {
      defaults[propertyName] = definition.defaultValue;
    }
  }

  return defaults;
}

type InstanceComponentPropertySnapshot = {
  sourceKey: string;
  canonicalName: string;
  type: ComponentPropertyType;
  value: string | boolean | VariableAlias;
};

type InstanceComponentPropertyDefinition = ComponentProperties[string];

function snapshotInstanceComponentProperties(
  instance: InstanceNode,
): InstanceComponentPropertySnapshot[] {
  return Object.entries(instance.componentProperties ?? {})
    .map(([key, definition]): InstanceComponentPropertySnapshot | null => {
      const value = definition?.value;
      if (value === undefined) {
        return null;
      }

      return {
        sourceKey: key,
        canonicalName: canonicalComponentPropertyName(key),
        type: definition.type,
        value,
      } satisfies InstanceComponentPropertySnapshot;
    })
    .filter((entry): entry is InstanceComponentPropertySnapshot => Boolean(entry));
}

function restoreCompatibleInstanceProperties(
  instance: InstanceNode,
  sourceProperties: InstanceComponentPropertySnapshot[],
): void {
  if (!sourceProperties.length) {
    return;
  }

  const updates: Record<string, string | boolean | VariableAlias> = {};
  const targetProperties = Object.entries(instance.componentProperties ?? {});

  for (const [targetKey, targetDefinition] of targetProperties) {
    const targetCanonicalName = canonicalComponentPropertyName(targetKey);
    const source =
      sourceProperties.find(
        (entry) => entry.sourceKey === targetKey && entry.type === targetDefinition.type,
      ) ??
      sourceProperties.find(
        (entry) =>
          entry.canonicalName === targetCanonicalName && entry.type === targetDefinition.type,
      );

    if (!source) {
      continue;
    }

    if (!isCompatibleComponentPropertyValue(source.value, targetDefinition)) {
      continue;
    }

    updates[targetKey] = source.value;
  }

  if (!Object.keys(updates).length) {
    return;
  }

  instance.setProperties(updates);
}

function canonicalComponentPropertyName(propertyName: string): string {
  return propertyName.replace(/#.+$/, '').trim();
}

function isCompatibleComponentPropertyValue(
  value: string | boolean | VariableAlias,
  definition: InstanceComponentPropertyDefinition,
): boolean {
  switch (definition.type) {
    case 'BOOLEAN':
      return typeof value === 'boolean';
    case 'TEXT':
      return typeof value === 'string';
    case 'INSTANCE_SWAP':
      return typeof value === 'string';
    case 'VARIANT':
      return typeof value === 'string';
    default:
      return false;
  }
}

async function applyReferenceResetByMessages(
  node: SceneNode,
  referenceNode: DSStructureNode,
  messages: string[],
) {
  const uniqueMessages = Array.from(new Set(messages));

  for (const message of uniqueMessages) {
    const trimmed = message.trim();
    const paddingMatch = trimmed.match(/^(?:Token )?padding (top|right|bottom|left):/i);

    if (trimmed.startsWith('Паддинг ') || paddingMatch) {
      const side = extractPaddingSide(trimmed);
      if (side) {
        await resetPaddingSide(node, referenceNode, side);
      }
      continue;
    }

    if (
      trimmed.startsWith('Отступ между элементами') ||
      trimmed.startsWith('Token itemSpacing:')
    ) {
      await resetItemSpacing(node, referenceNode);
      continue;
    }

    if (trimmed.startsWith('Стиль заливка:')) {
      await resetStyle(node, referenceNode, 'fill');
      continue;
    }

    if (trimmed.startsWith('Стиль обводка:')) {
      await resetStyle(node, referenceNode, 'stroke');
      continue;
    }

    if (trimmed.startsWith('Стиль текст:')) {
      await resetStyle(node, referenceNode, 'text');
      continue;
    }

    if (trimmed.startsWith('заливка:')) {
      await resetPaint(node, referenceNode, 'fill');
      continue;
    }

    if (trimmed.startsWith('обводка:')) {
      await resetPaint(node, referenceNode, 'stroke');
      continue;
    }

    if (trimmed.startsWith('Толщина обводки:')) {
      resetStrokeWeight(node, referenceNode);
      continue;
    }

    if (trimmed.startsWith('Token radius:') || trimmed.startsWith('Скругления')) {
      await resetRadius(node, referenceNode);
      continue;
    }

    if (
      trimmed.startsWith('Token opacity:') ||
      trimmed.startsWith('Прозрачность')
    ) {
      await resetOpacity(node, referenceNode);
    }
  }
}

async function applyReferenceResetByDetails(
  node: SceneNode,
  details: Array<{
    property?: string;
    reference?: {
      value?: string | number | null;
      resourceType?: 'style' | 'token' | 'color';
      resourceId?: string | null;
      displayName?: string | null;
    };
  }>,
) {
  for (const detail of details) {
    const property = detail.property;
    const reference = detail.reference;
    if (!property || !reference) {
      continue;
    }

    if (property === 'fill' || property === 'stroke') {
      await resetPaintByDiffReference(node, property, reference);
      continue;
    }

    if (property === 'styles.fill') {
      await resetStyleById(node, 'fill', reference.resourceId ?? null);
      continue;
    }

    if (property === 'styles.stroke') {
      await resetStyleById(node, 'stroke', reference.resourceId ?? null);
      continue;
    }

    if (property === 'styles.text') {
      await resetStyleById(node, 'text', reference.resourceId ?? null);
      continue;
    }

    const paddingSide = property.match(/^layout\.padding\.(top|right|bottom|left)$/)?.[1] as
      | 'top'
      | 'right'
      | 'bottom'
      | 'left'
      | undefined;
    if (paddingSide && typeof reference.value === 'number') {
      setLayoutPaddingSide(node, paddingSide, reference.value);
      continue;
    }

    if (property === 'layout.itemSpacing' && typeof reference.value === 'number') {
      setLayoutItemSpacing(node, reference.value);
      continue;
    }

    if (property === 'radius') {
      await setRadiusFromValue(node, reference.value);
      continue;
    }

    if (property === 'opacity' && typeof reference.value === 'number' && 'opacity' in node) {
      (node as SceneNode & { opacity: number }).opacity = reference.value;
    }
  }
}

function extractPaddingSide(message: string): 'top' | 'right' | 'bottom' | 'left' | null {
  const match = message.match(/(top|right|bottom|left)/i);
  if (!match) return null;
  const side = match[1].toLowerCase();
  if (
    side === 'top' ||
    side === 'right' ||
    side === 'bottom' ||
    side === 'left'
  ) {
    return side;
  }
  return null;
}

async function resetPaddingSide(
  node: SceneNode,
  referenceNode: DSStructureNode,
  side: 'top' | 'right' | 'bottom' | 'left',
) {
  if (!('layoutMode' in node) || (node as AutoLayoutMixin).layoutMode === 'NONE') {
    return;
  }

  const layout = referenceNode.layout;
  const padding = layout?.padding;
  if (!padding) {
    return;
  }

  const fieldMap = {
    top: 'paddingTop',
    right: 'paddingRight',
    bottom: 'paddingBottom',
    left: 'paddingLeft',
  } as const;
  const field = fieldMap[side];
  const value = padding[side] ?? 0;
  (node as any)[field] = value;

  await bindNodeVariable(node, field, layout?.paddingTokens?.[side] ?? null);
}

async function resetItemSpacing(node: SceneNode, referenceNode: DSStructureNode) {
  if (!('layoutMode' in node) || (node as AutoLayoutMixin).layoutMode === 'NONE') {
    return;
  }
  const value = referenceNode.layout?.itemSpacing ?? 0;
  (node as any).itemSpacing = value;
  await bindNodeVariable(
    node,
    'itemSpacing',
    referenceNode.layout?.itemSpacingToken ?? null,
  );
}

function setLayoutPaddingSide(
  node: SceneNode,
  side: 'top' | 'right' | 'bottom' | 'left',
  value: number,
) {
  if (!('layoutMode' in node) || (node as AutoLayoutMixin).layoutMode === 'NONE') {
    return;
  }
  const fieldMap = {
    top: 'paddingTop',
    right: 'paddingRight',
    bottom: 'paddingBottom',
    left: 'paddingLeft',
  } as const;
  (node as any)[fieldMap[side]] = value;
}

function setLayoutItemSpacing(node: SceneNode, value: number) {
  if (!('layoutMode' in node) || (node as AutoLayoutMixin).layoutMode === 'NONE') {
    return;
  }
  (node as any).itemSpacing = value;
}

async function resetStyleById(
  node: SceneNode,
  target: 'fill' | 'stroke' | 'text',
  styleKey: string | null,
) {
  if (target === 'text') {
    if (node.type !== 'TEXT') return;
    const style = styleKey ? await importStyleById(styleKey) : null;
    await (node as TextNode).setTextStyleIdAsync(style?.id ?? '');
    return;
  }

  const mutableNode = node as any;
  const style = styleKey ? await importStyleById(styleKey) : null;
  const styleId = style?.id ?? '';

  if (target === 'fill') {
    if (typeof mutableNode.setFillStyleIdAsync === 'function') {
      await mutableNode.setFillStyleIdAsync(styleId);
    }
    return;
  }

  if (typeof mutableNode.setStrokeStyleIdAsync === 'function') {
    await mutableNode.setStrokeStyleIdAsync(styleId);
  }
}

async function resetStyle(
  node: SceneNode,
  referenceNode: DSStructureNode,
  target: 'fill' | 'stroke' | 'text',
) {
  const styleKey =
    target === 'text'
      ? referenceNode.styles?.text?.styleKey
      : target === 'fill'
        ? referenceNode.styles?.fill?.styleKey
        : referenceNode.styles?.stroke?.styleKey;

  await resetStyleById(node, target, styleKey ?? null);
}

async function resetPaintByDiffReference(
  node: SceneNode,
  target: 'fill' | 'stroke',
  reference: {
    value?: string | number | null;
    resourceType?: 'style' | 'token' | 'color';
    resourceId?: string | null;
  },
) {
  const resourceId =
    typeof reference.resourceId === 'string' && reference.resourceId.length
      ? reference.resourceId
      : null;

  if (reference.resourceType === 'style') {
    await resetStyleById(node, target, resourceId);
    return;
  }

  const prop = target === 'fill' ? 'fills' : 'strokes';
  if (!(prop in (node as any))) {
    return;
  }

  const mutableNode = node as any;
  if (target === 'fill' && typeof mutableNode.setFillStyleIdAsync === 'function') {
    await mutableNode.setFillStyleIdAsync('');
  } else if (
    target === 'stroke' &&
    typeof mutableNode.setStrokeStyleIdAsync === 'function'
  ) {
    await mutableNode.setStrokeStyleIdAsync('');
  }

  const token =
    reference.resourceType === 'token'
      ? resourceId ?? (typeof reference.value === 'string' ? reference.value : null)
      : null;
  const color =
    reference.resourceType === 'color' && typeof reference.value === 'string'
      ? reference.value
      : null;
  const paint = await buildSolidPaintFromReference({ token, color });

  if (!paint) {
    return;
  }

  mutableNode[prop] = [paint];

  if (target === 'stroke') {
    const weight =
      typeof (mutableNode as { strokeWeight?: unknown }).strokeWeight === 'number'
        ? (mutableNode as { strokeWeight: number }).strokeWeight
        : 1;
    mutableNode.strokeWeight = weight;
  }
}

async function resetPaint(
  node: SceneNode,
  referenceNode: DSStructureNode,
  target: 'fill' | 'stroke',
) {
  const styleKey =
    target === 'fill'
      ? referenceNode.styles?.fill?.styleKey
      : referenceNode.styles?.stroke?.styleKey;
  if (styleKey) {
    await resetStyle(node, referenceNode, target);
    if (target === 'stroke') {
      resetStrokeWeight(node, referenceNode);
    }
    return;
  }

  const prop = target === 'fill' ? 'fills' : 'strokes';
  if (!(prop in (node as any))) {
    return;
  }

  const mutableNode = node as any;
  if (target === 'fill' && typeof mutableNode.setFillStyleIdAsync === 'function') {
    await mutableNode.setFillStyleIdAsync('');
  } else if (
    target === 'stroke' &&
    typeof mutableNode.setStrokeStyleIdAsync === 'function'
  ) {
    await mutableNode.setStrokeStyleIdAsync('');
  }

  const referencePaint = target === 'fill' ? referenceNode.fill : referenceNode.stroke;

  if (!referencePaint) {
    mutableNode[prop] = [];
    if (target === 'stroke' && 'strokeWeight' in mutableNode) {
      mutableNode.strokeWeight = 0;
    }
    return;
  }

  const paint = await buildSolidPaintFromReference(referencePaint);
  if (!paint) {
    return;
  }

  mutableNode[prop] = [paint];

  if (target === 'stroke') {
    resetStrokeWeight(node, referenceNode);
  }
}

function resetStrokeWeight(node: SceneNode, referenceNode: DSStructureNode) {
  if (!('strokeWeight' in (node as any))) {
    return;
  }
  const weight = referenceNode.stroke?.weight;
  (node as any).strokeWeight = typeof weight === 'number' ? weight : 0;
}

async function resetRadius(node: SceneNode, referenceNode: DSStructureNode) {
  await bindNodeVariable(node, 'cornerRadius', referenceNode.radiusToken ?? null);

  const radius = referenceNode.radius;
  if (radius === null || !('cornerRadius' in (node as any))) {
    return;
  }

  if (typeof radius === 'number') {
    (node as any).cornerRadius = radius;
    return;
  }

  const mutableNode = node as any;
  if (
    'topLeftRadius' in mutableNode &&
    'topRightRadius' in mutableNode &&
    'bottomRightRadius' in mutableNode &&
    'bottomLeftRadius' in mutableNode
  ) {
    mutableNode.topLeftRadius = radius.topLeft;
    mutableNode.topRightRadius = radius.topRight;
    mutableNode.bottomRightRadius = radius.bottomRight;
    mutableNode.bottomLeftRadius = radius.bottomLeft;
  }
}

async function setRadiusFromValue(
  node: SceneNode,
  value: string | number | null | undefined,
) {
  if (!('cornerRadius' in (node as any))) {
    return;
  }
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseFloat(value)
        : Number.NaN;
  if (!Number.isFinite(numericValue)) {
    return;
  }
  await bindNodeVariable(node, 'cornerRadius', null);
  (node as any).cornerRadius = numericValue;
}

async function resetOpacity(node: SceneNode, referenceNode: DSStructureNode) {
  if (!('opacity' in (node as any))) {
    return;
  }

  const opacity =
    typeof referenceNode.opacity === 'number' ? referenceNode.opacity : 1;
  (node as any).opacity = opacity;
  await bindNodeVariable(node, 'opacity', referenceNode.opacityToken ?? null);
}

async function bindNodeVariable(
  node: SceneNode,
  field: string,
  tokenId: string | null,
) {
  const bindingNode = await resolveBindableNode(node);
  if (!bindingNode) {
    console.warn('[Apollo] skip variable binding for missing node', {
      nodeId: node.id,
      field,
      tokenId,
    });
    return;
  }

  const mutableNode = bindingNode as any;
  if (typeof mutableNode.setBoundVariable !== 'function') {
    return;
  }
  const variable = tokenId ? await importVariableByToken(tokenId) : null;
  try {
    mutableNode.setBoundVariable(field, variable);
  } catch (error) {
    if (isMissingNodeMutationError(error)) {
      console.warn('[Apollo] skip variable binding for stale node', {
        nodeId: bindingNode.id,
        field,
        tokenId,
        error,
      });
      return;
    }
    throw error;
  }
}

async function resolveBindableNode(node: SceneNode): Promise<SceneNode | null> {
  if (isRemovedNode(node)) {
    return null;
  }

  try {
    const freshNode = await getSceneNodeById(node.id);
    return freshNode && !isRemovedNode(freshNode) ? freshNode : null;
  } catch (error) {
    console.warn('[Apollo] failed to refresh node before variable binding', {
      nodeId: node.id,
      error,
    });
    return null;
  }
}

function isRemovedNode(node: SceneNode): boolean {
  return (node as any).removed === true;
}

function isMissingNodeMutationError(error: unknown): boolean {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: string }).message)
      : String(error ?? '');
  return /does not exist|not found|removed/i.test(message);
}

async function importVariableByToken(tokenId: string): Promise<Variable | null> {
  const key = extractAliasKey(tokenId);
  if (!key) {
    return null;
  }

  try {
    return await figma.variables.importVariableByKeyAsync(key);
  } catch (error) {
    console.warn('[Apollo] failed to import variable by key', { tokenId, key, error });
    return null;
  }
}

async function importStyleById(styleId: string): Promise<BaseStyle | null> {
  const normalized = normalizeStyleId(styleId);
  if (!normalized) {
    return null;
  }

  const directKey = extractStyleKey(normalized) ?? normalized;
  try {
    return await figma.importStyleByKeyAsync(directKey);
  } catch (error) {
    console.warn('[Apollo] failed to import style by key', {
      styleId: normalized,
      key: directKey,
      error,
    });
    return null;
  }
}

async function buildSolidPaintFromReference(
  referencePaint: { color?: string | null; token?: string | null },
): Promise<SolidPaint | null> {
  const color = referencePaint.color
    ? parseRgbaToColor(referencePaint.color)
    : null;
  const variable = referencePaint.token
    ? await importVariableByToken(referencePaint.token)
    : null;

  const basePaint: SolidPaint = {
    type: 'SOLID',
    visible: true,
    opacity: color?.opacity ?? 1,
    color: color?.rgb ?? colorFromVariable(variable) ?? { r: 0, g: 0, b: 0 },
  };

  if (!variable) {
    return basePaint;
  }

  try {
    return figma.variables.setBoundVariableForPaint(basePaint, 'color', variable);
  } catch (error) {
    console.warn('[Apollo] failed to bind variable for paint', {
      token: referencePaint.token,
      error,
    });
    return basePaint;
  }
}

function parseRgbaToColor(
  value: string,
): { rgb: RGB; opacity: number } | null {
  const compact = value.replace(/\s+/g, '');
  const match = compact.match(
    /^rgba\(([-+]?\d*\.?\d+),([-+]?\d*\.?\d+),([-+]?\d*\.?\d+),([-+]?\d*\.?\d+)\)$/i,
  );
  if (!match) {
    return null;
  }

  const [, rawR, rawG, rawB, rawA] = match;
  const r = Number.parseFloat(rawR) / 255;
  const g = Number.parseFloat(rawG) / 255;
  const b = Number.parseFloat(rawB) / 255;
  const opacity = Number.parseFloat(rawA);

  if (
    !Number.isFinite(r) ||
    !Number.isFinite(g) ||
    !Number.isFinite(b) ||
    !Number.isFinite(opacity)
  ) {
    return null;
  }

  return {
    rgb: {
      r: Math.max(0, Math.min(1, r)),
      g: Math.max(0, Math.min(1, g)),
      b: Math.max(0, Math.min(1, b)),
    },
    opacity: Math.max(0, Math.min(1, opacity)),
  };
}

function colorFromVariable(variable: Variable | null): RGB | null {
  if (!variable || variable.resolvedType !== 'COLOR') {
    return null;
  }

  const values = Object.values(variable.valuesByMode ?? {});
  const firstValue = values[0];
  if (!firstValue || typeof firstValue !== 'object') {
    return null;
  }

  const color = firstValue as RGBA;
  if (
    typeof color.r !== 'number' ||
    typeof color.g !== 'number' ||
    typeof color.b !== 'number'
  ) {
    return null;
  }

  return { r: color.r, g: color.g, b: color.b };
}

function getReferenceStructure(
  ref: LibraryComponent | null | undefined,
  variantKey: string | null,
  variantProperties?: Record<string, string> | null,
) {
  if (!ref) return null;
  const structure =
    variantProperties && Object.keys(variantProperties).length
      ? resolveStructureForInstance(ref, {
          componentKey: variantKey ?? '',
          variantProperties,
        })
      : resolveStructure(ref, variantKey);
  if (structure && structure.length > 0) {
    return structure;
  }
  return null;
}

function getReferenceStructureCached(
  ref: LibraryComponent | null | undefined,
  variantKey: string | null,
  variantProperties: Record<string, string> | null | undefined,
  cache: Map<string, DSStructureNode[] | null>,
): DSStructureNode[] | null {
  if (!ref) return null;
  const normalizedVariantProperties = variantProperties
    ? Object.entries(variantProperties)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}=${value}`)
        .join('|')
    : '';
  const cacheKey = `${ref.key ?? ref.displayName ?? 'unknown'}:${variantKey ?? 'default'}:${normalizedVariantProperties}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) ?? null;
  }
  const structure = getReferenceStructure(ref, variantKey, variantProperties ?? null);
  cache.set(cacheKey, structure);
  return structure;
}

function buildNodeSegments(node: SceneNode): PathSegment[] {
  const segments: PathSegment[] = [];

  let current: BaseNode | null = node;

  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    const nodeType = current.type;
    let isVisible = true;
    try {
      const hasVisibleFlag = 'visible' in current;
      isVisible = hasVisibleFlag
        ? (current as SceneNode & { visible: boolean }).visible !== false
        : true;
    } catch (_error) {
      isVisible = false;
    }
    segments.push({
      id: current.id,
      label: current.name,
      nodeType,
      visible: isVisible,
    });
    current = current.parent as BaseNode | null;
  }
  return segments.reverse();
}

function normalizeRelevanceStatus(
  status: LibraryComponent['status'] | undefined,
): RelevanceStatus {
  switch (status) {
    case 'deprecated':
      return 'deprecated';
    case 'update':
    case 'changed':
      return 'update';
    case 'current':
      return 'current';
    default:
      return 'unknown';
  }
}

function alignStructurePaths(
  actual: DSStructureNode[],
  reference: DSStructureNode[],
): DSStructureNode[] {
  if (actual.length === 0 || reference.length === 0) return actual;
  const actualRoot = actual[0].path;
  const referenceRoot =
    reference.find((node) => !node.path.includes(' / '))?.path ??
    reference[0].path;
  if (!actualRoot || !referenceRoot || actualRoot === referenceRoot) {
    return actual;
  }

  const prefix = actualRoot;
  const newPrefix = referenceRoot;
  return actual.map((node) => {
    const cloned = Object.assign({}, node);
    cloned.path = replacePathPrefix(node.path, prefix, newPrefix);
    return cloned;
  });
}

function expandReferenceWithInstanceComponents(
  reference: DSStructureNode[],
  actual: DSStructureNode[],
): DSStructureNode[] {
  if (!reference.length || !actual.length) return reference;

  const referenceEntries: DSStructureNode[] = reference.map((node) =>
    Object.assign({}, node, {
      referenceOrigin: node.referenceOrigin ?? 'host',
    }),
  );
  let nextSyntheticReferenceId =
    referenceEntries.reduce(
      (maxId, entry) => (typeof entry.id === 'number' ? Math.max(maxId, entry.id) : maxId),
      0,
    ) + 1;
  const referenceOccurrenceKeys = buildOccurrenceKeyMap(referenceEntries);
  const referenceKeyToIndex = new Map<string, number>();
  const hostReferenceByOccurrenceKey = new Map<string, DSStructureNode>();
  for (let index = 0; index < referenceEntries.length; index += 1) {
    const entry = referenceEntries[index];
    const occurrenceKey = referenceOccurrenceKeys.get(entry) ?? entry.path;
    referenceKeyToIndex.set(occurrenceKey, index);
    hostReferenceByOccurrenceKey.set(occurrenceKey, entry);
  }
  const actualOccurrenceIndexMap = buildOccurrenceIndexMap(actual);
  const actualRootPath = actual[0]?.path ?? '';
  const visited = new Set<string>();

  for (const node of actual) {
    if (node.type !== 'INSTANCE') continue;
    if (!node.componentInstance?.componentKey) continue;
    if (node.path === actualRootPath) continue;

    const componentKey = node.componentInstance.componentKey;
    const visitKey = `${node.path}::${componentKey}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);

    const componentRef = findComponent(componentKey);
    const resolvedVariantProperties = node.componentInstance?.variantProperties ?? null;
    const instanceStructure = resolveStructureForInstance(
      componentRef,
      node.componentInstance ?? null,
    );
    if (!instanceStructure || instanceStructure.length === 0) continue;
    const ownerRole = componentRef?.role ?? null;
    const actualOccurrenceIndex = actualOccurrenceIndexMap.get(node) ?? 1;

    traceAudit('nested-reference-resolution', {
      nodePath: node.path,
      nestedComponentKey: componentKey,
      variantProperties: resolvedVariantProperties,
      resolvedReferenceRoot: instanceStructure[0]?.path ?? null,
      referenceOrigin: 'nested-component',
    });

    const instanceRoot =
      instanceStructure.find((item) => !item.path.includes(' / '))?.path ??
      instanceStructure[0].path;

    const aligned =
      instanceRoot && instanceRoot !== node.path
        ? instanceStructure.map((refNode) => {
            const cloned = Object.assign({}, refNode);
            cloned.path = replacePathPrefix(refNode.path, instanceRoot, node.path);
            cloned.referenceOrigin = 'nested-component';
            cloned.referenceOwnerComponentKey = componentKey;
            cloned.referenceOwnerRole = ownerRole;
            cloned.referenceOwnerPath = node.path;
            cloned.referenceOwnerRelativePath = getRelativeReferenceOwnerPath(
              node.path,
              cloned.path,
            );
            return cloned;
          })
        : instanceStructure.map((refNode) =>
            Object.assign({}, refNode, {
              referenceOrigin: 'nested-component',
              referenceOwnerComponentKey: componentKey,
              referenceOwnerRole: ownerRole,
              referenceOwnerPath: node.path,
              referenceOwnerRelativePath: getRelativeReferenceOwnerPath(
                node.path,
                refNode.path,
              ),
            }),
          );
    const rebasedAligned = rebaseReferenceSubtreeIds(
      aligned,
      nextSyntheticReferenceId,
    );
    nextSyntheticReferenceId += rebasedAligned.length;

    for (const rawRefNode of rebasedAligned) {
      const occurrenceKey = makeOccurrenceKey(rawRefNode.path, actualOccurrenceIndex);
      const existingIndex = referenceKeyToIndex.get(occurrenceKey);
      const existingNode =
        typeof existingIndex === 'number' ? referenceEntries[existingIndex] : null;
      const hostBaselineNode =
        hostReferenceByOccurrenceKey.get(occurrenceKey) ?? existingNode;
      const refNode =
        rawRefNode.path === node.path
          ? applyMaterializedHostVariantBaselineToNode(rawRefNode, hostBaselineNode)
          : rawRefNode;
      const mergeDecision =
        existingNode && typeof existingIndex === 'number'
          ? getMaterializedInstanceReferenceDecision(
              existingNode,
              refNode,
              node.path,
              (ownerComponentKey, relativePath) =>
                isNestedComponentPaintPathHostControlled(ownerComponentKey, relativePath) ||
                isNestedComponentTextPathHostControlled(ownerComponentKey, relativePath) ||
                isNestedComponentLayoutPathHostControlled(ownerComponentKey, relativePath),
            )
          : null;

      if (mergeDecision && shouldTraceNestedReferenceMerge(node.path, refNode.path, refNode.name)) {
        console.log('[Apollo][debug] nested-reference-merge-decision', {
          materializedRootPath: node.path,
          targetPath: refNode.path,
          targetName: refNode.name,
          existingNodeOrigin: existingNode?.referenceOrigin ?? 'host',
          existingNodeName: existingNode?.name ?? null,
          existingOwnerComponentKey: existingNode?.referenceOwnerComponentKey ?? null,
          existingOwnerRelativePath: existingNode?.referenceOwnerRelativePath ?? null,
          candidateOwnerComponentKey: refNode.referenceOwnerComponentKey ?? null,
          candidateOwnerRelativePath: refNode.referenceOwnerRelativePath ?? null,
          decision: mergeDecision,
        });
        console.log(
          '[Apollo][debug-json] nested-reference-merge-decision',
          JSON.stringify({
            materializedRootPath: node.path,
            targetPath: refNode.path,
            targetName: refNode.name,
            existingNodeOrigin: existingNode?.referenceOrigin ?? 'host',
            existingNodeName: existingNode?.name ?? null,
            existingOwnerComponentKey: existingNode?.referenceOwnerComponentKey ?? null,
            existingOwnerRelativePath: existingNode?.referenceOwnerRelativePath ?? null,
            candidateOwnerComponentKey: refNode.referenceOwnerComponentKey ?? null,
            candidateOwnerRelativePath: refNode.referenceOwnerRelativePath ?? null,
            decision: mergeDecision,
          }),
        );
        traceAudit('nested-reference-merge-decision', {
          materializedRootPath: node.path,
          targetPath: refNode.path,
          targetName: refNode.name,
          existingNodeOrigin: existingNode?.referenceOrigin ?? 'host',
          existingNodeName: existingNode?.name ?? null,
          existingOwnerComponentKey: existingNode?.referenceOwnerComponentKey ?? null,
          existingOwnerRelativePath: existingNode?.referenceOwnerRelativePath ?? null,
          candidateOwnerComponentKey: refNode.referenceOwnerComponentKey ?? null,
          candidateOwnerRelativePath: refNode.referenceOwnerRelativePath ?? null,
          decision: mergeDecision,
        });
      }

      if (
        existingNode &&
        typeof existingIndex === 'number' &&
        mergeDecision?.preferCandidate === true
      ) {
        referenceEntries[existingIndex] = mergeMaterializedInstanceReferenceNode(
          hostBaselineNode ?? existingNode,
          refNode,
          mergeDecision,
        );
        continue;
      }

      if (existingNode) {
        continue;
      }
      referenceKeyToIndex.set(occurrenceKey, referenceEntries.length);
      referenceEntries.push(refNode);
    }
  }

  return applyMaterializedHostVariantBaselines(referenceEntries, reference);
}

function rebaseReferenceSubtreeIds(
  nodes: DSStructureNode[],
  startId: number,
): DSStructureNode[] {
  if (!nodes.length) {
    return nodes;
  }

  const idMap = new Map<number, number>();
  let nextId = startId;

  for (const node of nodes) {
    idMap.set(node.id, nextId);
    nextId += 1;
  }

  return nodes.map((node) =>
    Object.assign({}, node, {
      id: idMap.get(node.id) ?? node.id,
      parentId:
        typeof node.parentId === 'number'
          ? (idMap.get(node.parentId) ?? null)
          : null,
    }),
  );
}

function getRelativeReferenceOwnerPath(
  ownerPath: string,
  fullPath: string,
): string | null {
  if (fullPath === ownerPath) {
    return '';
  }

  const prefix = `${ownerPath} / `;
  if (!fullPath.startsWith(prefix)) {
    return null;
  }

  return fullPath.slice(prefix.length);
}

function isPresetCandidate(item: AuditItem): boolean {
  if (item.nodeType !== 'INSTANCE') return false;
  if (!item.reference) return false;
  return hasLockSymbol(item.reference);
}

function hasLockSymbol(component: LibraryComponent): boolean {
  if (!component) return false;
  if (component.displayName?.includes('🔒')) {
    return true;
  }
  for (const name of component.names ?? []) {
    if (name.includes('🔒')) {
      return true;
    }
  }
  return false;
}

function replacePathPrefix(path: string, from: string, to: string): string {
  if (path === from) return to;
  const needle = `${from} / `;
  if (path.startsWith(needle)) {
    return `${to} / ${path.slice(needle.length)}`;
  }
  return path;
}

function debugPaintMeDiffPipeline(payload: {
  componentName: string | null | undefined;
  alignedActualStructure: DSStructureNode[] | null;
  expandedReferenceStructure: DSStructureNode[] | null;
  rawDiffs: ReturnType<typeof diffStructures>['diffs'];
  markedDiffs: ReturnType<typeof diffStructures>['diffs'];
  allowlistedDiffs: ReturnType<typeof diffStructures>['diffs'];
  finalDiffs: ReturnType<typeof diffStructures>['diffs'];
}) {
  const componentName = payload.componentName ?? '';
  if (!componentName.includes('[D] Button')) {
    return;
  }

  const actual = payload.alignedActualStructure ?? [];
  const reference = payload.expandedReferenceStructure ?? [];
  if (!actual.length || !reference.length) {
    return;
  }

  const actualKeyMap = buildOccurrenceKeyMap(actual);
  const referenceKeyMap = buildOccurrenceKeyMap(reference);
  const referenceByOccurrence = new Map(
    reference.map((node) => [referenceKeyMap.get(node) ?? node.path, node]),
  );

  for (const actualNode of actual) {
    if (actualNode.name !== 'PaintMe' || !actualNode.path.includes('Addon')) {
      continue;
    }

    const occurrenceKey = actualKeyMap.get(actualNode) ?? actualNode.path;
    const referenceNode = referenceByOccurrence.get(occurrenceKey) ?? null;
    const rawDiffs = getDiffsForPath(payload.rawDiffs, actualNode.path);
    const markedDiffs = getDiffsForPath(payload.markedDiffs, actualNode.path);
    const allowlistedDiffs = getDiffsForPath(payload.allowlistedDiffs, actualNode.path);
    const finalDiffs = getDiffsForPath(payload.finalDiffs, actualNode.path);

    console.log(
      '[Apollo][debug-json] paintme-diff-pipeline',
      JSON.stringify({
        componentName,
        path: actualNode.path,
        occurrenceKey,
        actual: describeDebugPaintNode(actualNode),
        reference: referenceNode ? describeDebugPaintNode(referenceNode) : null,
        rawDiffs: rawDiffs.map(describeDebugDiff),
        markedDiffs: markedDiffs.map(describeDebugDiff),
        allowlistedDiffs: allowlistedDiffs.map(describeDebugDiff),
        finalDiffs: finalDiffs.map(describeDebugDiff),
      }),
    );
  }
}

function getDiffsForPath(
  diffs: ReturnType<typeof diffStructures>['diffs'],
  path: string,
) {
  return diffs.filter((diff) => diff.nodePath === path);
}

function describeDebugPaintNode(node: DSStructureNode) {
  return {
    name: node.name,
    type: node.type,
    referenceOrigin: node.referenceOrigin ?? 'host',
    fill: node.fill ?? null,
    stroke: node.stroke ?? null,
    styles: node.styles ?? null,
    ownerComponentKey: node.referenceOwnerComponentKey ?? null,
    ownerRelativePath: node.referenceOwnerRelativePath ?? null,
  };
}

function describeDebugDiff(diff: ReturnType<typeof diffStructures>['diffs'][number]) {
  return {
    message: diff.message,
    diffKind: diff.diffKind ?? null,
    referenceOrigin: diff.context.referenceOrigin,
    nestedOwnerComponentKey: diff.context.nestedOwnerComponentKey,
    nestedOwnerRelativePath: diff.context.nestedOwnerRelativePath,
    suppressed: diff.suppressAsHostControlledNestedProperty === true,
    suppressionReason: diff.suppressionReason ?? null,
  };
}

function shouldTraceNestedReferenceMerge(
  materializedRootPath: string,
  targetPath: string,
  targetName: string | null | undefined,
): boolean {
  const haystack = `${materializedRootPath} ${targetPath} ${targetName ?? ''}`.toLowerCase();
  return (
    haystack.includes('iconview') ||
    haystack.includes('button') ||
    haystack.includes('addon') ||
    haystack.includes('paintme') ||
    haystack.includes('bgcolor')
  );
}

/**
 * Строит ассоциативные карты для токенов и цветов по всем загруженным токен-каталогам
 * и сохраняет их в память, чтобы позже подставлять читаемые названия и библиотеку.
 */
async function ensureTokenLabelMapLoaded(): Promise<void> {
  if (tokenLabelMap) return;
  if (tokenLabelLoadPromise) {
    return tokenLabelLoadPromise;
  }
  tokenLabelLoadPromise = (async () => {
    try {
      await ensureReferenceCatalogsLoaded();
      const catalogs = getTokenCatalogs();
      const map = new Map<string, TokenLabelEntry>();
      for (const catalog of catalogs) {
        const catalogLibrary =
          catalog.meta?.library ?? catalog.meta?.fileName ?? '';
        const collections = catalog.collections ?? [];
        for (const collection of collections) {
          if (!collection) continue;
          const collectionName =
            collection.name ?? catalogLibrary ?? catalog.meta?.fileName ?? '';
          const variables = collection.variables ?? [];
          for (const variable of variables) {
            if (!variable || (!variable.key && !variable.id)) continue;
            const label = buildTokenLabel(
              variable.groupName ?? 'Без группы',
              variable.tokenName ?? variable.name ?? '',
            );
            const entry: TokenLabelEntry = {
              label,
              library: collectionName || catalogLibrary,
              sourceFile: catalog.meta?.fileName ?? undefined,
              resolvedType:
                typeof variable.resolvedType === 'string'
                  ? variable.resolvedType
                  : undefined,
            };
            registerTokenLabelKey(map, variable.key, entry);
            registerTokenLabelKey(map, variable.id, entry);
          }
        }
      }
      tokenLabelMap = map;
    } catch (error) {
      console.warn('[Apollo] failed to load token catalogs', error);
      tokenLabelMap = new Map();
    } finally {
      tokenLabelLoadPromise = null;
    }
  })();
  return tokenLabelLoadPromise;
}

function buildTokenLabel(
  groupName: string,
  tokenName: string,
): string {
  const segments: string[] = [];
  if (groupName && groupName !== 'Без группы') {
    segments.push(groupName);
  }
  if (tokenName) {
    segments.push(tokenName);
  }
  return segments.join('/');
}

function registerTokenLabelKey(
  map: Map<string, TokenLabelEntry>,
  rawKey: string | null | undefined,
  entry: TokenLabelEntry,
) {
  if (!rawKey) return;
  map.set(rawKey, entry);
  const aliasKey = extractAliasKey(rawKey);
  if (aliasKey) {
    map.set(aliasKey, entry);
  }
}

function resolveTokenLabelForDiff(token: string): string | null {
  const directLabel = tokenLabelMap?.get(token);
  if (directLabel) return directLabel.label;
  const aliasKey = extractAliasKey(token);
  if (!aliasKey) return token;
  const label = tokenLabelMap?.get(aliasKey);
  return label?.label ?? token;
}

function resolveTokenStatsResource(
  tokenId: string,
  displayName: string | null,
): StatsResource | null {
  const tokenKey = extractAliasKey(tokenId);
  if (!tokenKey) {
    return null;
  }
  const metadata = tokenLabelMap?.get(tokenId) ?? tokenLabelMap?.get(tokenKey);
  return {
    type: 'token',
    name: metadata?.label ?? displayName ?? tokenKey,
    key: tokenKey,
    id: tokenId,
    library: metadata?.library ?? null,
    sourceFile: metadata?.sourceFile ?? null,
  };
}

function resolveStyleStatsResource(
  styleId: string,
  displayName: string | null,
): StatsResource | null {
  const styleKey = extractStyleKey(styleId) ?? styleId;
  const metadata = getStyleMetadataFromKnownKey(styleKey);
  return {
    type: 'style',
    name: metadata?.label ?? displayName ?? styleKey,
    key: metadata?.key ?? styleKey,
    id: styleId,
    library: metadata?.library ?? null,
    sourceFile: metadata?.sourceFile ?? null,
  };
}

function isColorTokenForPaintDiff(token: string): boolean {
  const directEntry = tokenLabelMap?.get(token);
  if (directEntry?.resolvedType) {
    return directEntry.resolvedType === 'COLOR';
  }

  const aliasKey = extractAliasKey(token);
  if (!aliasKey) {
    return true;
  }

  const tokenEntry = tokenLabelMap?.get(aliasKey);
  if (!tokenEntry?.resolvedType) {
    return true;
  }

  return tokenEntry.resolvedType === 'COLOR';
}
function normalizeRgba(value: string): string {
  const compact = value.replace(/\s+/g, '');
  const match = compact.match(
    /^rgba\(([-+]?\d*\.?\d+),([-+]?\d*\.?\d+),([-+]?\d*\.?\d+),([-+]?\d*\.?\d+)\)$/i,
  );
  if (!match) {
    return compact;
  }

  const [, rawR, rawG, rawB, rawA] = match;
  const toNumber = (input: string) => Number.parseFloat(input);
  const formatAlpha = (input: string) => {
    const parsed = toNumber(input);
    if (!Number.isFinite(parsed)) {
      return input;
    }
    return String(Math.round(parsed * 100) / 100);
  };

  return `rgba(${Math.round(toNumber(rawR))},${Math.round(
    toNumber(rawG),
  )},${Math.round(toNumber(rawB))},${formatAlpha(rawA)})`;
}

function toRgbaStringFromToken(value: any): string | null {
  if (!value || typeof value !== 'object') return null;
  if (
    typeof value.r !== 'number' ||
    typeof value.g !== 'number' ||
    typeof value.b !== 'number'
  ) {
    return null;
  }
  const r = clampColorComponent(value.r);
  const g = clampColorComponent(value.g);
  const b = clampColorComponent(value.b);
  const a = typeof value.a === 'number' ? Math.round(value.a * 100) / 100 : 1;
  return normalizeRgba(`rgba(${r},${g},${b},${a})`);
}
