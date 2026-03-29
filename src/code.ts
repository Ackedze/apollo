/// <reference types="@figma/plugin-typings" />

import {
  areReferenceCatalogsReady,
  ensureReferenceCatalogsLoaded,
  findComponent,
  getCorporateCounterpart,
  getStyleCatalogs,
  getTokenCatalogs,
  primaryCatalog,
  reportMissingReference,
  resolveStructure,
} from './reference/library';
import {LibraryComponent} from './reference/libraryTypes'
import {  snapshotTree } from './structure/snapshot';
import { diffStructures } from './structure/diff';
import type { DSStructureNode } from './types/structures';
import type { AuditItem, RelevanceStatus, ThemeStatus } from './types/audit';
import { tabDefinitions } from './config/tabs';
import { buildNodePath, clampColorComponent, extractAliasKey, getPageName } from './utils/nodeHelpers';
import {
  collectCustomStyles,
  collectDetachedEntry,
  computeChangesResults,
  type CustomStyleCollectionOptions,
} from './services/auditViewBuilder';
import { CheckState, createCheckState } from './create-check-state';
import { applyCustomizationFilters } from './filters/customizationFilters';
import { filterIgnoredLocalLibraryItems } from './filters/ignoredComponentFilters';
import {
  buildCorporateThemizationEntry,
  buildPageThemizationEntry,
  getContainingPage,
} from './services/themeAudit';

figma.showUI(__html__, { width: 800, height: 860 });
// Передаём UI конфигурацию табов из централизованного источника.
figma.ui.postMessage({
  type: 'tab-config',
  payload: tabDefinitions,
});

startCatalogPreload();

figma.ui.onmessage = (msg) => {
  if (msg.type === 'ping') {
    figma.ui.postMessage({ type: 'pong' });
    return;
  }

  if (msg.type === 'scan-selection') {
    console.log('audit start');
    void runAudit();
    return;
  }

  if (msg.type === 'cancel-scan') {
    if (scanInProgress) {
      cancelRequested = true;
    }
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
};

let scanInProgress = false;
let cancelRequested = false;
let catalogPreloadStarted = false;
let lastAuditSelectionIds: string[] = [];
const STRICT_COMPARISON = true;
// Compare nested instances against their own component references to avoid placeholder diffs.
const COMPARE_NESTED_INSTANCES_BY_COMPONENT = true;

class AuditCancelledError extends Error {
  constructor() {
    super('AUDIT_CANCELLED');
    this.name = 'AuditCancelledError';
  }
}

export const getTimestamp = () =>
  typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();

let tokenLabelMap: Map<string, { label: string; library?: string }> | null =
  null;
let tokenColorMap: Map<string, { label: string; library?: string }> | null =
  null;
let tokenLabelLoadPromise: Promise<void> | null = null;
let styleLabelMap: Map<string, { label: string; library?: string }> | null =
  null;
let styleLabelLoadPromise: Promise<void> | null = null;
const styleLookupCache = new Map<string, string>();

/**
 * Запускает полный аудит текущего выделения: проверяет готовность справочников,
 * снимает snapshоты, классифицирует узлы и формирует структуры для табов UI.
 */
async function runAudit(selectionOverride?: readonly SceneNode[]) {
  if (scanInProgress) {
    figma.notify('Проверка уже выполняется.');
    return;
  }
  scanInProgress = true;
  cancelRequested = false;

  figma.ui.postMessage({ type: 'scan-started' });

  let finished = false;

  const auditStart = getTimestamp();

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

    await ensureReferenceCatalogsLoaded();
    await ensureTokenLabelMapLoaded();
    await ensureStyleLabelMapLoaded();
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

    const checkState = createCheckState()

    const pageThemizationEntry = await buildPageThemizationEntry(selection);
    if (pageThemizationEntry) {
      checkState.themizationEntries.push(pageThemizationEntry);
    }

    const referenceStructureCache = new Map<string, DSStructureNode[] | null>();
    const checkedComponentNodesList = new Set<string>();

    const customStyleReasonOptions: CustomStyleCollectionOptions = {
      tokenLabelMap: tokenLabelMap ?? new Map(),
      isKnownStyleId,
    };

    await collectTargets(
      selection,
      checkState,
      referenceStructureCache,
      customStyleReasonOptions,
      checkedComponentNodesList,
      throwIfCancelled,
    );
    
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

    const counts = {
      current: checkState.relevanceBuckets.current.length,
      deprecated: checkState.relevanceBuckets.deprecated.length,
      update: checkState.relevanceBuckets.update.length,
      themeError: checkState.themeBuckets.error.length,
      themization: checkState.themizationEntries.length,
      local: visibleLocalItems.length,
      detached: checkState.detachedEntries,
      changes: changesResults.length,
    };
    
    const visibleViews = {
      relevance: checkState.relevanceBuckets,
      theme: checkState.themeBuckets,
      themization: checkState.themizationEntries,
      local: visibleLocalItems,
      customStyles: checkState.customStyleEntries,
      detached: checkState.detachedEntries,
      presets: checkState.presetItems,
      changes: changesResults,
    };

    figma.ui.postMessage({
      type: 'scan-result',
      payload: {
        detached: checkState.detachedEntries,
        counts,
        summary: {
          totalTargets: checkState.totalItems,
          selectionRoots: selection.length,
          selectionNames: selection.map((node) => node.name),
          catalogName: primaryCatalog.name,
        },
        views: visibleViews,
        visibleViews,
        changes: changesResults,
      },
    });
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


async function collectTargets(
  selection: readonly SceneNode[], 
  checkState: CheckState, 
  referenceStructureCache: Map<string, DSStructureNode[] | null>,
  customStyleReasonOptions: CustomStyleCollectionOptions,
  checkedComponentNodesList: Set<string>,
  throwIfCancelled: () => void,
) {
  const visit = async (node: SceneNode): Promise<void> => {
      throwIfCancelled();

      if (!node.visible) {
        return;
      }

      const nodeIsComponent = node.type === 'INSTANCE' || node.type === 'COMPONENT'

      if (nodeIsComponent) {
        const item = await classifyNode(
          node,
          referenceStructureCache,
          checkedComponentNodesList,
          throwIfCancelled,
        );
        throwIfCancelled();

        checkState.totalItems++;

        if (item.relevance) {
          checkState.relevanceBuckets[item.relevance].push(item);
        }

        if (item.themeStatus) {
          checkState.themeBuckets[item.themeStatus].push(item);
        }

        if (item.reference) {
          const themizationEntry = buildCorporateThemizationEntry(
            node,
            item.reference,
          );
          if (themizationEntry) {
            checkState.themizationEntries.push(themizationEntry);
          }
        }

        if (item.isLocal) {
          checkState.localLibraryItems.push(item);
        }

        if (isPresetCandidate(item)) {
          checkState.presetItems.push(item);
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

          if (customStyleReasons.length) {
            checkState.customStyleEntries = [
              ...checkState.customStyleEntries, 
              ...customStyleReasons
            ];
          }
      }

      if ('children' in node && node.children.length > 0) {
        for (const child of node.children) {
          throwIfCancelled();
          await visit(child as SceneNode);
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
        : [{ id: node.id, label: node.name }];

  const pageName = getPageName(node);
  const fullPath = buildNodePath(node);
  const componentKey = await getComponentKey(node);
  throwIfCancelled();
  const ref = componentKey ? findComponent(componentKey): null;

  if (!componentKey || !ref) {
    reportMissingReference(node.name, componentKey);

    return {
      id: node.id,
      name: node.name,
      nodeType: node.type,
      relevance: 'unknown',
      themeStatus: 'ok',
      isLocal: true,
      pageName,
      pathSegments,
      fullPath,
      librarySource: null,
      componentKey,
      comparisonIssues: [],
      themeRecommendation: null,
      diffs: []
    }
  }

  const comparisonIssues: string[] = [];

  let referenceStructure = getReferenceStructureCached(
    ref,
    componentKey,
    referenceStructureCache,
  );

  if (ref && componentKey && Array.isArray(ref.variants) && ref.variants.length) {
    const variant = ref.variants.find((item) => item?.key === componentKey);
    if (!variant) {
      comparisonIssues.push(
        `Вариант ${componentKey} не найден в каталоге для «${ref.name ?? node.name}»`,
      );
      referenceStructure = null;
    } else if (!ref.variantStructures || !ref.variantStructures[componentKey]) {
      comparisonIssues.push(
        `Нет variantStructures для «${variant.name ?? componentKey}» (${ref.name ?? node.name})`,
      );
      referenceStructure = null;
    }
  }
  const needsDiff = Boolean(referenceStructure) && !checkedComponentNodesList.has(node.id);
  const instanceHasOverrides =
    node.type === 'INSTANCE' && hasInstanceOverrides(node as InstanceNode);
  const shouldDiff =
    needsDiff && (ref?.status !== 'current' || instanceHasOverrides);
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

  const diffResult =
    shouldDiff && expandedReferenceStructure && alignedActualStructure
      ? diffStructures(alignedActualStructure, expandedReferenceStructure, {
          strict: STRICT_COMPARISON,
          resolveTokenLabel: resolveTokenLabelForDiff,
          resolveStyleLabel: resolveStyleLabelForDiff,
        })
      : { diffs: [], issues: [] };
  if (diffResult.issues.length) {
    comparisonIssues.push(...diffResult.issues);
  }

  const diffs = applyCustomizationFilters(node, diffResult.diffs);

  if (comparisonIssues.length) {
    console.warn('[Apollo] comparison issues', {
      nodeId: node.id,
      name: node.name,
      issues: comparisonIssues.slice(0, 8),
      issuesText: comparisonIssues.slice(0, 8).join(' | '),
      total: comparisonIssues.length,
    });
  }

  const relevance = normalizeRelevanceStatus(ref.status);

  const themeMismatch = detectThemeMismatch(node, ref);
  const themeStatus: ThemeStatus = themeMismatch ? 'error' : 'ok';

  if (themeMismatch) {
    diffs.unshift({
      message: themeMismatch.message,
      nodeId: node.id,
      nodeName: node.name,
      nodePath: fullPath || node.name,
    });
  }

  return {
    id: node.id,
    name: node.name,
    nodeType: node.type,
    pageName,
    pathSegments,
    fullPath,
    relevance: themeStatus === 'ok' ? relevance : 'unknown',
    themeStatus,
    librarySource: ref?.source ?? null,
    isLocal: false,
    reference: ref,
    componentKey,
    diffs,
    comparisonIssues,
    themeRecommendation: themeMismatch?.replacementName ?? null,
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
}) {
  const rootId = typeof payload?.rootId === 'string' ? payload.rootId : '';
  const nodeId = typeof payload?.nodeId === 'string' ? payload.nodeId : '';
  const messages = Array.isArray(payload?.messages)
    ? payload.messages.filter(
        (message): message is string =>
          typeof message === 'string' && message.trim().length > 0,
      )
    : [];

  if (!rootId || !nodeId || !messages.length) {
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

  const componentKey = await getComponentKey(rootNode);
  const ref = componentKey ? findComponent(componentKey) : null;
  const referenceStructure = getReferenceStructure(ref, componentKey);

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

  const referenceNode = expandedReferenceStructure.find(
    (entry) => entry.path === actualEntry.path,
  );
  if (!referenceNode) {
    figma.notify('Не удалось найти эталонные значения для этого узла.');
    return;
  }

  await applyReferenceResetByMessages(targetNode, referenceNode, messages);

  figma.notify('Изменения сброшены.');

  const rerunSelection = await resolveSceneNodesByIds(lastAuditSelectionIds);
  if (rerunSelection.length) {
    void runAudit(rerunSelection);
  } else {
    void runAudit([rootNode]);
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
    void runAudit(rerunSelection);
  } else if (fallbackSelection.length) {
    void runAudit(fallbackSelection);
  }
}

async function applyThemizationAction(payload: {
  kind?: string;
  nodeId?: string;
  themeCollectionId?: string;
  targetModeId?: string;
}) {
  const kind = typeof payload?.kind === 'string' ? payload.kind : '';
  const nodeId = typeof payload?.nodeId === 'string' ? payload.nodeId : '';
  const themeCollectionId =
    typeof payload?.themeCollectionId === 'string' ? payload.themeCollectionId : '';
  const targetModeId = typeof payload?.targetModeId === 'string' ? payload.targetModeId : '';

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

    const replaced = await replaceCorporateInstance(node);
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

async function replaceCorporateInstance(instance: InstanceNode): Promise<boolean> {
  const sourceProperties = snapshotInstanceComponentProperties(instance);
  const componentKey = await getComponentKey(instance);
  const ref = componentKey ? findComponent(componentKey) : null;
  if (!ref) {
    return false;
  }

  const currentReferenceName = ref.displayName ?? ref.name ?? ref.names?.[0] ?? '';
  const pair = getCorporateCounterpart(currentReferenceName);
  const baseComponent = pair?.base ?? null;
  if (!baseComponent) {
    return false;
  }

  const currentVariantName =
    ref.variants?.find((variant) => variant.key === componentKey)?.name ?? null;
  const candidateVariantKey =
    currentVariantName && baseComponent.variants?.length
      ? baseComponent.variants.find((variant) => variant.name === currentVariantName)?.key ??
        null
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

  try {
    const targetComponent = await figma.importComponentByKeyAsync(baseComponentKey);
    instance.swapComponent(targetComponent);
    restoreCompatibleInstanceProperties(instance, sourceProperties);
    return true;
  } catch (error) {
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
            : String(fallbackError ?? error),
      });
      return false;
    }
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

  if (currentVariantName) {
    const exactByName = variants.find((variant) => variant.name === currentVariantName);
    if (exactByName) {
      return exactByName;
    }
  }

  return variants[0] ?? null;
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

function variantMatchesSourceWithDefaultExtras(
  target: Record<string, string> | null | undefined,
  source: Record<string, string> | null | undefined,
  defaults: Record<string, string>,
): boolean {
  const targetEntries = Object.entries(target ?? {});
  const sourceEntries = new Map(Object.entries(source ?? {}));

  for (const [key, value] of sourceEntries) {
    if (target?.[key] !== value) {
      return false;
    }
  }

  for (const [key, value] of targetEntries) {
    if (sourceEntries.has(key)) {
      continue;
    }

    if (defaults[key] !== value) {
      return false;
    }
  }

  return true;
}

function countVariantPropertyMatches(
  left: Record<string, string> | null | undefined,
  right: Record<string, string> | null | undefined,
): number {
  const leftEntries = Object.entries(left ?? {});
  const rightEntries = new Map(Object.entries(right ?? {}));
  let score = 0;

  for (const [key, value] of leftEntries) {
    if (rightEntries.get(key) === value) {
      score += 1;
    }
  }

  return score;
}

function variantPropertiesEqual(
  left: Record<string, string> | null | undefined,
  right: Record<string, string> | null | undefined,
): boolean {
  const leftEntries = Object.entries(left ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const rightEntries = Object.entries(right ?? {}).sort(([a], [b]) => a.localeCompare(b));

  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  return leftEntries.every(([key, value], index) => {
    const [otherKey, otherValue] = rightEntries[index] ?? [];
    return key === otherKey && value === otherValue;
  });
}

type InstanceComponentPropertySnapshot = {
  sourceKey: string;
  canonicalName: string;
  type: ComponentPropertyType;
  value: string | boolean | VariableAlias;
};

function snapshotInstanceComponentProperties(
  instance: InstanceNode,
): InstanceComponentPropertySnapshot[] {
  return Object.entries(instance.componentProperties ?? {})
    .map(([key, definition]) => {
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
  definition: ComponentPropertyDefinition,
): boolean {
  switch (definition.type) {
    case 'BOOLEAN':
      return typeof value === 'boolean';
    case 'TEXT':
      return typeof value === 'string';
    case 'INSTANCE_SWAP':
      return typeof value === 'string';
    case 'VARIANT':
      return (
        typeof value === 'string' &&
        Array.isArray(definition.variantOptions) &&
        definition.variantOptions.includes(value)
      );
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
      trimmed.startsWith('Отступ между элементами:') ||
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

    if (trimmed.startsWith('Token radius:') || trimmed.startsWith('Скругления:')) {
      await resetRadius(node, referenceNode);
      continue;
    }

    if (
      trimmed.startsWith('Token opacity:') ||
      trimmed.startsWith('Прозрачность:')
    ) {
      await resetOpacity(node, referenceNode);
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

  if (target === 'text') {
    if (node.type !== 'TEXT') return;
    const style = styleKey ? await importStyleById(styleKey) : null;
    await (node as TextNode).setTextStyleIdAsync(style?.id ?? '');
    return;
  }

  const style = styleKey ? await importStyleById(styleKey) : null;
  const mutableNode = node as any;
  const styleId = style?.id ?? '';

  if (target === 'fill') {
    if (typeof mutableNode.setFillStyleIdAsync !== 'function') {
      return;
    }
    await mutableNode.setFillStyleIdAsync(styleId);
    return;
  }

  if (typeof mutableNode.setStrokeStyleIdAsync !== 'function') {
    return;
  }
  await mutableNode.setStrokeStyleIdAsync(styleId);
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
  const mutableNode = node as any;
  if (typeof mutableNode.setBoundVariable !== 'function') {
    return;
  }
  const variable = tokenId ? await importVariableByToken(tokenId) : null;
  mutableNode.setBoundVariable(field, variable);
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
) {
  if (!ref) return null;
  const structure = resolveStructure(ref, variantKey);
  if (structure && structure.length > 0) {
    return structure;
  }
  return null;
}

function getReferenceStructureCached(
  ref: LibraryComponent | null | undefined,
  variantKey: string | null,
  cache: Map<string, DSStructureNode[] | null>,
): DSStructureNode[] | null {
  if (!ref) return null;
  const cacheKey = `${ref.key ?? ref.displayName ?? 'unknown'}:${variantKey ?? 'default'}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) ?? null;
  }
  const structure = getReferenceStructure(ref, variantKey);
  cache.set(cacheKey, structure);
  return structure;
}

function buildNodeSegments(node: SceneNode): PathSegment[] {
  const segments: PathSegment[] = [];

  let current: BaseNode | null = node;

  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    const nodeType = current.type;
    const hasVisibleFlag = 'visible' in current;
    const isVisible = hasVisibleFlag
      ? (current as SceneNode & { visible: boolean }).visible !== false
      : true;
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

  const referenceMap = new Map(reference.map((node) => [node.path, node]));
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
    const instanceStructure = resolveStructure(componentRef, componentKey);
    if (!instanceStructure || instanceStructure.length === 0) continue;

    const instanceRoot =
      instanceStructure.find((item) => !item.path.includes(' / '))?.path ??
      instanceStructure[0].path;

    const aligned =
      instanceRoot && instanceRoot !== node.path
        ? instanceStructure.map((refNode) => {
            const cloned = Object.assign({}, refNode);
            cloned.path = replacePathPrefix(refNode.path, instanceRoot, node.path);
            return cloned;
          })
        : instanceStructure;

    // Override placeholder nodes with the nested component's own reference structure.
    for (const refNode of aligned) {
      referenceMap.set(refNode.path, refNode);
    }
  }

  return Array.from(referenceMap.values());
}

type ThemeMismatchInfo = {
  message: string;
  replacementName?: string | null;
};

function detectThemeMismatch(
  node: SceneNode,
  ref: LibraryComponent,
): ThemeMismatchInfo | null {
  if (ref.role === 'Part') return null;

  const name = ref.name ?? '';

  const pair = getCorporateCounterpart(name);

  if (!pair?.corporate) {
    return null;
  }

  const isCorpComponent = name.includes('[Corporate]');

  if (!isCorpComponent) {
    return {
      message: 'Доступен корпоративный вариант компонента',
      replacementName:
        pair.corporate?.name ??
        pair.corporate?.displayName ??
        `[Corporate] ${pair.base?.name ?? ''}`.trim(),
    };
  }

  return null;
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
      const map = new Map<string, { label: string; library?: string }>();
      const colorMap = new Map<string, { label: string; library?: string }>();
      for (const catalog of catalogs) {
        const catalogLibrary =
          catalog.meta?.library ?? catalog.meta?.fileName ?? '';
        const collections = catalog.collections ?? [];
        for (const collection of collections) {
          if (!collection) continue;
          const collectionName =
            collection.name ?? catalogLibrary ?? catalog.meta?.fileName ?? '';
          const defaultModeId = collection.defaultModeId ?? null;
          const variables = collection.variables ?? [];
          for (const variable of variables) {
            if (!variable || !variable.key) continue;
            const label = buildTokenLabel(
              collectionName,
              variable.groupName ?? 'Без группы',
              variable.tokenName ?? variable.name ?? '',
            );
            map.set(variable.key, {
              label,
              library: collectionName || catalogLibrary,
            });
            if (defaultModeId && variable.valuesByMode) {
              const rgba = toRgbaStringFromToken(
                variable.valuesByMode[defaultModeId],
              );
              if (rgba && !colorMap.has(rgba)) {
                colorMap.set(rgba, {
                  label,
                  library: collectionName || catalogLibrary,
                });
              }
            }
          }
        }
      }
      tokenLabelMap = map;
      tokenColorMap = colorMap;
    } catch (error) {
      console.warn('[Apollo] failed to load token catalogs', error);
      tokenLabelMap = new Map();
      tokenColorMap = new Map();
    } finally {
      tokenLabelLoadPromise = null;
    }
  })();
  return tokenLabelLoadPromise;
}

/**
 * Подготавливает карту стилей, привязанную к их библиотекам и группам,
 * для доступного отображения ссылок на стили при сравнении.
 */
async function ensureStyleLabelMapLoaded(): Promise<void> {
  if (styleLabelMap) return;
  if (styleLabelLoadPromise) {
    return styleLabelLoadPromise;
  }
  styleLabelLoadPromise = (async () => {
    try {
      await ensureReferenceCatalogsLoaded();
      const catalogs = getStyleCatalogs();
      const map = new Map<string, { label: string; library?: string }>();
      for (const catalog of catalogs) {
        const libraryName =
          catalog.meta?.library || catalog.meta?.fileName || '';
        const styles = catalog.styles ?? [];
        for (const style of styles) {
          if (!style?.key) continue;
          const label = buildStyleLabel(
            libraryName || '',
            style.group ?? '',
            style.name ?? '',
          );
          map.set(style.key, { label, library: libraryName || undefined });
        }
      }
      styleLookupCache.clear();
      styleLabelMap = map;
    } catch (error) {
      console.warn('[Apollo] failed to load style catalogs', error);
      styleLookupCache.clear();
      styleLabelMap = new Map();
    } finally {
      styleLabelLoadPromise = null;
    }
  })();
  return styleLabelLoadPromise;
}

function buildTokenLabel(
  collectionName: string,
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

function buildStyleLabel(
  libraryName: string,
  groupName: string,
  styleName: string,
): string {
  const normalizedStyleName = stripStyleSuffix(styleName);
  const segments: string[] = [];
  if (groupName && groupName !== 'Без группы') {
    segments.push(groupName);
  }
  if (normalizedStyleName) {
    segments.push(normalizedStyleName);
  }
  return segments.join('/');
}

function stripStyleSuffix(value: string): string {
  if (!value) return value;
  const index = value.indexOf(' (');
  if (index === -1) return value;
  return value.slice(0, index).trim();
}

function resolveTokenLabelForDiff(token: string): string | null {
  const aliasKey = extractAliasKey(token);
  if (!aliasKey) return token;
  const label = tokenLabelMap?.get(aliasKey);
  return label?.label ?? token;
}

function resolveStyleLabelForDiff(styleKey: string): string | null {
  const direct = styleLabelMap?.get(styleKey);
  if (direct?.label) return direct.label;
  if (styleKey.startsWith('S:')) {
    const extracted = styleKey.slice(2).split(',')[0];
    if (extracted) {
      const byKey = styleLabelMap?.get(extracted);
      if (byKey?.label) return byKey.label;
    }
  }
  return styleKey;
}

async function isKnownStyleId(
  styleId: string | null | undefined,
): Promise<boolean> {
  const normalized = normalizeStyleId(styleId);
  if (!normalized) {
    return false;
  }

  const directKey = extractStyleKey(normalized);
  if (directKey && styleLabelMap?.has(directKey)) {
    return true;
  }

  if (styleLookupCache.has(normalized)) {
    const cached = styleLookupCache.get(normalized);
    return Boolean(cached && styleLabelMap?.has(cached));
  }

  const figmaApi = figma as PluginAPI & {
    getStyleById?: (id: string) => BaseStyle | null;
    getStyleByIdAsync?: (id: string) => Promise<BaseStyle | null>;
  };

  try {
    const style =
      typeof figmaApi.getStyleByIdAsync === 'function'
        ? await figmaApi.getStyleByIdAsync(normalized)
        : typeof figmaApi.getStyleById === 'function'
          ? figmaApi.getStyleById(normalized)
          : null;

    const resolvedKey =
      style && typeof style.key === 'string' && style.key
        ? style.key
        : null;

    if (resolvedKey) {
      styleLookupCache.set(normalized, resolvedKey);
      return Boolean(styleLabelMap?.has(resolvedKey));
    }

    return false;
  } catch (error) {
    console.warn('[Apollo] failed to resolve style by id', {
      styleId: normalized,
      error,
    });
    return false;
  }
}

function normalizeStyleId(
  styleId: string | null | undefined,
): string | null {
  if (!styleId || typeof styleId !== 'string' || styleId === figma.mixed) {
    return null;
  }
  return styleId.trim() || null;
}

function extractStyleKey(styleId: string): string | null {
  if (styleLabelMap?.has(styleId)) {
    return styleId;
  }
  if (!styleId.startsWith('S:')) {
    return null;
  }
  const extracted = styleId.slice(2).split(',')[0];
  return extracted || null;
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
