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
import { eyeClosedIcon, eyeOpenIcon } from './icons';
import { buildNodePath, clampColorComponent, extractAliasKey, getPageName } from './utils/nodeHelpers';
import {
  collectCustomStyles,
  collectDetachedEntry,
  computeChangesResults,
  describeTextNode,
  TextNodeCollectionOptions,
  type CustomStyleCollectionOptions,
} from './services/auditViewBuilder';
import { CheckState, createCheckState } from './create-check-state';

figma.showUI(__html__, { width: 800, height: 860 });
figma.ui.postMessage({
  type: 'icon-assets',
  payload: { visible: eyeOpenIcon, hidden: eyeClosedIcon },
});
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
    try {
      console.log('audit start');
      runAudit();
    } catch (error) {
      console.error('scan failed', error);
    }
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
};

let scanInProgress = false;
let cancelRequested = false;
let catalogPreloadStarted = false;
let catalogPreloadFinished = false;
const STRICT_COMPARISON = true;
// Compare nested instances against their own component references to avoid placeholder diffs.
const COMPARE_NESTED_INSTANCES_BY_COMPONENT = true;

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

/**
 * Запускает полный аудит текущего выделения: проверяет готовность справочников,
 * снимает snapshоты, классифицирует узлы и формирует структуры для табов UI.
 */
async function runAudit() {
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

  const abortIfNeeded = () => {
    if (cancelRequested) {
      finalize('cancelled');

      return true;
    }

    return false;
  };

  try {
    if (!areReferenceCatalogsReady()) {
      figma.notify('Подключаемся к библиотекам Apollo…');
    }

    await ensureReferenceCatalogsLoaded();
    await ensureTokenLabelMapLoaded();
    await ensureStyleLabelMapLoaded();

  } catch (error) {
    console.error('Failed to load reference catalogs', error);

    const message =
      'Не удалось загрузить данные библиотеки. Проверьте интернет-соединение и попробуйте ещё раз.';

    figma.notify(message);

    figma.ui.postMessage({ type: 'scan-error', payload: { message } });

    finalize('finished');

    return;
  }

  try {
    const selection = figma.currentPage.selection;

    if (selection.length === 0) {
      const message = 'Выделите область или слой, чтобы проверить компоненты.';

      figma.notify(message);

      figma.ui.postMessage({ type: 'scan-error', payload: { message } });

      finalize('finished');

      return;
    }

    const checkState = createCheckState()

    const referenceStructureCache = new Map<string, DSStructureNode[] | null>();
    const checkedComponentNodesList = new Set<string>();

    const customStyleReasonOptions: CustomStyleCollectionOptions = {
      tokenLabelMap: tokenLabelMap ?? new Map(),
    };

    const textNodeOptions: TextNodeCollectionOptions = {
      tokenLabelMap: tokenLabelMap ?? new Map(),
      tokenColorMap: tokenColorMap ?? new Map(),
    };

    await collectTargets(selection, checkState, referenceStructureCache, customStyleReasonOptions, textNodeOptions, checkedComponentNodesList );
    
    if (checkState.totalItems === 0) {
      const message = 'Компоненты или инстансы в выделении не найдены.';

      figma.notify(message);
      
      figma.ui.postMessage({ type: 'scan-error', payload: { message } });
    }

    if (abortIfNeeded()) {
      return;
    }

    const changesResults = computeChangesResults(checkState.relevanceBuckets.current);

    const counts = {
      current: checkState.relevanceBuckets.current.length,
      deprecated: checkState.relevanceBuckets.deprecated.length,
      update: checkState.relevanceBuckets.update.length,
      themeError: checkState.themeBuckets.error.length,
      textNodes: checkState.textNodes.length,
      textAll: checkState.textAll.length,
      local: checkState.localLibraryItems.length,
      detached: checkState.detachedEntries,
      changes: changesResults.length,
    };
    
    const visibleViews = {
      relevance: checkState.relevanceBuckets,
      theme: checkState.themeBuckets,
      local: checkState.localLibraryItems,
      customStyles: checkState.customStyleEntries,
      detached: checkState.detachedEntries,
      textNodes: checkState.textNodes.length,
      textAll: checkState.textAll.length,
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
      catalogPreloadFinished = true;
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
  textOptions: TextNodeCollectionOptions,
  checkedComponentNodesList: Set<string>,
) {
  const visit = async (node: SceneNode): Promise<void> => {
      if (!node.visible) {
        return;
      }

      const nodeIsComponent = node.type === 'INSTANCE' || node.type === 'COMPONENT'

      if (nodeIsComponent) {
        const item = await classifyNode(node, referenceStructureCache, checkedComponentNodesList);

        checkState.totalItems++;

        if (item.relevance) {
          checkState.relevanceBuckets[item.relevance].push(item);
        }

        if (item.themeStatus) {
          checkState.themeBuckets[item.themeStatus].push(item);
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
          const customStyleReasons = collectCustomStyles(node, customStyleReasonOptions);

          if (customStyleReasons.length) {
            checkState.customStyleEntries = [
              ...checkState.customStyleEntries, 
              ...customStyleReasons
            ];
          }
      }

      if (node.type === 'TEXT') {
        const item = describeTextNode(node, textOptions)

        if (item) {
          checkState.textAll.push(item)

          if (!item.usesStyle && !item.usesToken) {
            checkState.textNodes.push(item)
          }
        }
      }

      if ('children' in node && node.children.length > 0) {
        for (const child of node.children) {
          await visit(child as SceneNode);
        }
      }
  };

  for (const node of selection) {
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
  checkedComponentNodesList: Set<string>
): Promise<AuditItem> {
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
          resolveColorLabel: resolveTokenLabelFromColor,
          resolveStyleLabel: resolveStyleLabelForDiff,
        })
      : { diffs: [], issues: [] };
  if (diffResult.issues.length) {
    comparisonIssues.push(...diffResult.issues);
  }

  const diffs = diffResult.diffs;

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
      styleLabelMap = map;
    } catch (error) {
      console.warn('[Apollo] failed to load style catalogs', error);
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

function resolveTokenLabelFromColor(color: string): string | null {
  const normalized = normalizeRgba(color);
  const label = tokenColorMap?.get(normalized);
  return label?.label ?? null;
}

function normalizeRgba(value: string): string {
  return value.replace(/\s+/g, '');
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
