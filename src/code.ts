/// <reference types="@figma/plugin-typings" />

import {
  areReferenceCatalogsReady,
  ensureReferenceCatalogsForChannel,
  ensureReferenceCatalogsForKeys,
  ensureReferenceCatalogsLoaded,
  findComponent,
  getTokenCatalogs,
  reportMissingReference,
  resolveStructure,
  resolveStructureForInstance,
} from './reference/library';
import { LibraryComponent } from './reference/libraryTypes';
import { snapshotTree } from './structure/snapshot';
import {
  diffStructures,
  type DiffEntry,
  type VariableMetadata,
} from './structure/diff';
import {
  buildOccurrenceKeyMap,
} from './structure/occurrenceKeys';
import type { DSStructureNode } from './types/structures';
import type {
  AuditItem,
  PathSegment,
  RelevanceStatus,
} from './types/audit';
import { LEFT_SECTION_ORDER, tabDefinitions } from './config/tabs';
import { buildNodePath, clampColorComponent, extractAliasKey, getPageName } from './utils/nodeHelpers';
import {
  ensureStyleMetadataLoaded,
  extractStyleKey,
  findExactPaintStyleMatches,
  findExactTypographyStyleMatches,
  getNodePaintFingerprint,
  getNodeTypographyFingerprint,
  getPaintStyleFingerprint,
  getStyleMetadataFromKnownKey,
  isKnownStyleId,
  resolveStyleMetadata,
} from './services/styleMetadata';
import { createCheckState } from './create-check-state';
import {
  getHiddenTabsForChannel,
  supportsThemizationForChannel,
} from './policies/componentAuditPolicy';
import {
  buildPageThemizationEntry,
} from './services/themeAudit';
import {
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
  extractVariableCollectionKey,
  getVariableCollectionLookupKeys,
} from './utils/variableCollectionId';
import { submitApolloStatsReport } from './stats/collector';
import type { ApolloAgentReport, StatsResource } from './stats/types';
import {
  ensureContractPackageIndexLoaded,
  ensureContractArtifactsForHints,
  getContractPackageKeyForHint,
  type ContractArtifactHint,
} from './contracts/runtimeContractRegistry';
import {
  ensureExperimentalContractV2ForKeys,
} from './contracts/experimentalContractV2Registry';
import {
  auditEvidenceMatchesCapture,
  buildGenerationExampleCandidate,
  createGenerationExampleAuditEvidence,
  getGenerationExampleCandidateFileName,
  resolveLibraryComponentReference,
  type GenerationExampleAuditEvidence,
  type GenerationExampleCaptureOptions,
} from './examples/generationExampleCandidate';
import { resolveGenerationExampleSourceIdentity } from './examples/generationExampleSource';
import {
  type VariableCollectionMetadata,
} from './contracts/componentRules';
import { focusNode } from './actions/focusNode';
import { applyCorporateComponentReplacement } from './actions/corporateComponentAction';
import {
  createCustomizationResetAction,
  type CustomizationResetPayload,
} from './actions/customizationResetAction';
import { createCustomizationResetMutations } from './actions/customizationResetMutations';
import { applyPageThemeMode } from './actions/pageThemizationAction';
import { executeFindingAction } from './actions/findingAction';
import { createApolloPluginMessageRouter } from './plugin/messageRouter';
import {
  AuditCancelledError,
  AuditLifecycle,
} from './services/auditLifecycle';
import {
  createAuditTraversalContext,
} from './services/auditTraversalContext';
import {
  buildAuditResultViews,
  prepareAuditReport,
} from './services/auditResults';
import {
  alignStructurePaths,
  expandReferenceWithInstanceComponents,
} from './services/nestedReferencePreparation';
import { collectAuditTargets } from './services/auditTargetCollector';
import { FindingActionRegistry } from './remediation/findingActionRegistry';
import { attachFindingActions } from './remediation/findingActionResolver';
import {
  ensureColorTokenValueIndexLoaded,
  findColorTokenValueCandidates,
} from './services/colorTokenValueIndex';
import { getDetachedLibraryComponentKey } from './services/detachedComponentSource';

declare const __APOLLO_VERSION__: string;

const APOLLO_VERSION = __APOLLO_VERSION__;
const APOLLO_PROXY_URL = 'http://localhost:3001/analyze';

figma.showUI(__html__, { width: 800, height: 860 });
console.log('[Apollo] plugin version', { version: APOLLO_VERSION });
const EXPANDED_UI_SIZE = { width: 800, height: 860 };
const COMPACT_UI_SIZE = { width: 400, height: 860 };
let lastApolloAgentReport: ApolloAgentReport | null = null;
let lastContractArtifactHints: ContractArtifactHint[] = [];
let activeApolloAgentRequestId: string | null = null;
const apolloDialogueSessionNonce = Date.now().toString(36);
let lastGenerationExampleAuditEvidence: GenerationExampleAuditEvidence | null =
  null;
let generationExampleCaptureInProgress = false;
const MAX_GENERATION_EXAMPLE_SOURCE_NODES = 25000;
const findingActionRegistry = new FindingActionRegistry();
// Передаём UI конфигурацию табов из централизованного источника.
figma.ui.postMessage({
  type: 'tab-config',
  payload: {
    definitions: tabDefinitions,
    leftSectionOrder: LEFT_SECTION_ORDER,
  },
});

figma.ui.onmessage = createApolloPluginMessageRouter({
  postMessage: (message) => figma.ui.postMessage(message),
  notify: (message) => figma.notify(message),
  uiReady: startCatalogPreload,
  scanSelection: (payload) => {
    void runAudit(undefined, parseAuditChannel(payload?.pickerLabel), {
      shellAuditEnabled: payload?.shellAuditEnabled === true,
      experimentalContractV2Enabled:
        payload?.experimentalContractV2Enabled === true,
    });
  },
  prepareCatalogChannel: (payload) =>
    prepareCatalogChannel(parseAuditChannel(payload?.pickerLabel)),
  captureGenerationExample,
  cancelScan: () => {
    auditLifecycle.requestCancel();
  },
  sendAgentReport: sendApolloAgentReport,
  cancelAgentReport: (requestId) => {
    if (!requestId || requestId === activeApolloAgentRequestId) {
      activeApolloAgentRequestId = null;
      return true;
    }
    return false;
  },
  resizeUi: (compact) => {
    const targetSize = compact ? COMPACT_UI_SIZE : EXPANDED_UI_SIZE;
    figma.ui.resize(targetSize.width, targetSize.height);
  },
  focusNode,
  resetCustomizationGroup,
  applyThemizationAction,
  executeFindingAction: (actionId) =>
    executeFindingAction(actionId, {
      registry: findingActionRegistry,
      rerunAudit: rerunLastAuditWithFallback,
      notify: (message) => figma.notify(message),
    }),
  setDebugAudit: (enabled) => {
    setAuditTraceEnabled(enabled);
    return isAuditTraceEnabled();
  },
  getDebugAudit: isAuditTraceEnabled,
  logError: (message, error) => console.error(message, error),
});

const auditLifecycle = new AuditLifecycle();
let catalogPreloadStarted = false;
let requestedCatalogChannel: AuditChannel = 'Desktop';
let catalogPreparationRevision = 0;
let lastAuditSelectionIds: string[] = [];
let lastAuditChannel: AuditChannel = 'Desktop';
let lastAuditOptions = {
  shellAuditEnabled: false,
  experimentalContractV2Enabled: false,
};
// Compare nested instances against their own component references to avoid placeholder diffs.
const COMPARE_NESTED_INSTANCES_BY_COMPONENT = true;
const LOCAL_DEPENDENCY_CONCURRENCY = 4;

type TokenLabelEntry = {
  label: string;
  library?: string;
  sourceFile?: string;
  resolvedType?: string;
  variableKey?: string;
  variableId?: string;
  collectionId?: string;
  collectionName?: string;
  modeNames?: Record<string, string>;
};

let tokenLabelMap: Map<string, TokenLabelEntry> | null = null;
let variableCollectionMetadataMap: Map<
  string,
  VariableCollectionMetadata
> | null = null;
let tokenLabelLoadPromise: Promise<void> | null = null;

const customizationResetMutations = createCustomizationResetMutations({
  resolveVariableMetadata: resolveVariableMetadataForDiff,
  getSceneNodeById,
});
const customizationResetAction = createCustomizationResetAction({
  ensureReferencesLoaded: ensureReferenceCatalogsLoaded,
  getSceneNodeById,
  resolveReferenceNode: resolveCustomizationResetReferenceNode,
  rerunAudit: rerunLastAuditWithFallback,
  mutations: customizationResetMutations,
  notify: (message) => figma.notify(message),
  log: (message, payload) => console.log(message, payload),
});

/**
 * Запускает полный аудит текущего выделения: проверяет готовность справочников,
 * снимает snapshоты, классифицирует узлы и формирует структуры для табов UI.
 */
async function runAudit(
  selectionOverride?: readonly SceneNode[],
  selectedChannel: AuditChannel = 'Desktop',
  options?: {
    shellAuditEnabled?: boolean;
    experimentalContractV2Enabled?: boolean;
  },
) {
  if (generationExampleCaptureInProgress) {
    figma.notify('Сначала дождитесь подготовки примера.');
    return;
  }
  if (!auditLifecycle.tryBegin()) {
    figma.notify('Проверка уже выполняется.');
    return;
  }
  lastApolloAgentReport = null;
  lastGenerationExampleAuditEvidence = null;
  lastContractArtifactHints = [];
  activeApolloAgentRequestId = null;
  findingActionRegistry.reset();
  lastAuditOptions = {
    shellAuditEnabled: Boolean(options?.shellAuditEnabled),
    experimentalContractV2Enabled: Boolean(
      options?.experimentalContractV2Enabled,
    ),
  };

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

    auditLifecycle.finish();

    console.log(
      `[Apollo] audit total: ${(getTimestamp() - auditStart).toFixed(
        1,
      )} ms (${status})`,
    );
  };

  const throwIfCancelled = () => auditLifecycle.throwIfCancelled();

  try {
    if (!areReferenceCatalogsReady()) {
      figma.notify('Подключаемся к библиотекам Apollo…');
    }

    const preloadStartedAt = getTimestamp();
    await ensureReferenceCatalogsForChannel(selectedChannel);
    await ensureTokenLabelMapLoaded();
    await ensureStyleMetadataLoaded();
    await ensureColorTokenValueIndexLoaded();
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

    const traversalContext = createAuditTraversalContext({
      importComponentByKey: (componentKey) =>
        figma.importComponentByKeyAsync(componentKey),
      customStyleOptions: {
        tokenLabelMap: tokenLabelMap ?? new Map(),
        isKnownStyleId,
        resolveStyleMetadata,
      },
      deprecatedStyleOptions: {
        resolveStyleMetadata,
      },
    });
    const keyCollectStartedAt = getTimestamp();
    const selectionComponentKeys = await collectComponentKeys(
      selection,
      traversalContext.componentKeyCache,
      throwIfCancelled,
    );
    await ensureReferenceCatalogsForKeys(selectionComponentKeys);
    lastContractArtifactHints = buildContractArtifactHints(selectionComponentKeys);
    if (options?.experimentalContractV2Enabled) {
      await ensureExperimentalContractV2ForKeys(selectionComponentKeys);
    } else {
      await ensureContractArtifactsForHints(lastContractArtifactHints);
    }
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

    const collectStartedAt = getTimestamp();
    await collectAuditTargets(
      selection,
      checkState,
      selectedChannel,
      traversalContext,
      {
        shellAuditEnabled: Boolean(options?.shellAuditEnabled),
        experimentalContractV2Enabled: Boolean(
          options?.experimentalContractV2Enabled,
        ),
        dependencyConcurrency: LOCAL_DEPENDENCY_CONCURRENCY,
      },
      {
        getComponentKeyCached,
        buildNodeSegments,
        getReferenceStructureCached,
        isInsideLocalComponentContext,
        resolveTokenLabel: resolveTokenLabelForDiff,
        isPaintToken: isColorTokenForPaintDiff,
        resolveVariableMetadata: resolveVariableMetadataForDiff,
        resolveVariableCollectionMetadata:
          resolveVariableCollectionMetadataForDiff,
        normalizeRelevanceStatus,
        reportMissingReference,
        debugDiffPipeline: debugPaintMeDiffPipeline,
        throwIfCancelled,
        getNodeById: (nodeId) => figma.getNodeByIdAsync(nodeId),
      },
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

    await attachFindingActions(
      checkState,
      selectedChannel,
      findingActionRegistry,
      {
        getNodeById: async (nodeId) =>
          traversalContext.sceneNodeById.get(nodeId) ??
          figma.getNodeByIdAsync(nodeId),
        findExactPaintStyleMatches,
        findExactTypographyStyleMatches,
        findColorTokenValueCandidates,
        getNodePaintFingerprint,
        getNodeTypographyFingerprint,
        getPaintStyleFingerprint,
      },
    );

    const auditResultViews = buildAuditResultViews(checkState);

    figma.ui.postMessage({
      type: 'scan-result',
      payload: {
        summary: {
          totalTargets: checkState.totalItems,
        },
        ui: {
          hiddenTabIds: getHiddenTabsForChannel(selectedChannel),
        },
        visibleViews: auditResultViews.visibleViews,
      },
    });

    try {
      const currentUser = figma.currentUser;
      const { report, agentReport } = await prepareAuditReport({
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
          shellAuditEnabled: Boolean(options?.shellAuditEnabled),
          experimentalContractV2Enabled: Boolean(
            options?.experimentalContractV2Enabled,
          ),
        },
        selection,
        checkState,
        views: auditResultViews,
        resolveNodePath: buildNodePath,
        resolveComponentKey: (node) =>
          getComponentKeyCached(
            node as SceneNode,
            traversalContext.componentKeyCache,
          ),
        resolveStyleResource: resolveStyleStatsResource,
        resolveTokenResource: resolveTokenStatsResource,
      });
      lastGenerationExampleAuditEvidence =
        createGenerationExampleAuditEvidence(report);
      lastApolloAgentReport = agentReport;
      figma.ui.postMessage({
        type: 'apollo-agent-report-ready',
        payload: {
          reportId: agentReport.reportId,
          suggestedFileName: agentReport.suggestedFileName,
          findingCount: agentReport.findings.length,
        },
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

async function captureGenerationExample(rawOptions: unknown): Promise<void> {
  if (auditLifecycle.isRunning()) {
    const message = 'Сначала дождитесь завершения проверки Apollo.';
    figma.notify(message);
    figma.ui.postMessage({
      type: 'generation-example-error',
      payload: { message },
    });
    return;
  }
  if (generationExampleCaptureInProgress) {
    figma.notify('Подготовка примера уже выполняется.');
    return;
  }

  const options = normalizeGenerationExampleCaptureOptions(rawOptions);
  const selection = figma.currentPage.selection;
  if (selection.length !== 1) {
    throwGenerationExampleCaptureError(
      'Выделите один корневой фрейм или секцию примера.',
    );
    return;
  }
  const root = selection[0];
  if (root.type !== 'FRAME' && root.type !== 'SECTION') {
    throwGenerationExampleCaptureError(
      'Корнем примера должен быть FRAME или SECTION.',
    );
    return;
  }

  generationExampleCaptureInProgress = true;
  figma.ui.postMessage({ type: 'generation-example-started' });

  try {
    await ensureReferenceCatalogsLoaded();
    await ensureTokenLabelMapLoaded();

    const snapshot = await snapshotTree(root, new Set<string>());
    if (snapshot.length > MAX_GENERATION_EXAMPLE_SOURCE_NODES) {
      throw new Error(
        `В примере ${snapshot.length} слоёв. Максимум — ${MAX_GENERATION_EXAMPLE_SOURCE_NODES}. Разделите макет на несколько примеров.`,
      );
    }

    const componentKeys = new Set<string>();
    for (const node of snapshot) {
      const componentKey = node.componentInstance?.componentKey;
      if (componentKey) componentKeys.add(componentKey);
    }
    await ensureReferenceCatalogsForKeys(componentKeys);
    const generationExampleCollectionMetadata =
      await resolveGenerationExampleCollectionMetadata(snapshot);
    try {
      await ensureContractPackageIndexLoaded();
    } catch (error) {
      console.warn(
        '[Apollo][examples] contract package index is unavailable; canonical package keys will be omitted',
        error,
      );
    }

    const selectionNodeIds = [root.id];
    const auditEvidence = auditEvidenceMatchesCapture(
      lastGenerationExampleAuditEvidence,
      selectionNodeIds,
      options.platform,
    )
      ? lastGenerationExampleAuditEvidence
      : null;
    const capturedAt = new Date().toISOString();
    const sourceIdentity = resolveGenerationExampleSourceIdentity(
      root.id,
      figma.fileKey,
      options.sourceFigmaUrl,
    );
    const candidate = buildGenerationExampleCandidate({
      pluginVersion: APOLLO_VERSION,
      capturedAt,
      options,
      source: {
        fileKey: sourceIdentity.fileKey,
        fileName: figma.root.name ?? null,
        editorType: figma.editorType,
        pageName: getPageName(root),
        rootNodeId: root.id,
        rootNodeName: root.name,
        figmaLink: sourceIdentity.figmaLink,
      },
      snapshot,
      auditEvidence,
      resolveComponent: (componentKey) => {
        const component = findComponent(componentKey);
        const packageKey = getContractPackageKeyForHint({
          figmaKey: componentKey,
          componentName: component?.name ?? null,
          displayName: component?.displayName ?? null,
          sourceFile: component?.sourceFile ?? null,
        });
        return resolveLibraryComponentReference(component, packageKey);
      },
      resolveVariable: (variableId) => {
        const metadata = resolveVariableMetadataForDiff(variableId);
        if (!metadata) return null;
        return {
          name: metadata.variableName,
          collectionName: metadata.collectionName,
        };
      },
      resolveVariableCollection: (collectionId) => {
        const metadata =
          generationExampleCollectionMetadata.get(collectionId) ??
          resolveVariableCollectionMetadataForDiff(collectionId);
        if (!metadata) return null;
        return {
          collectionName: metadata.collectionName,
          modeNames: metadata.modeNames,
        };
      },
    });
    const suggestedFileName = getGenerationExampleCandidateFileName(
      options.exampleId,
    );
    figma.ui.postMessage({
      type: 'generation-example-ready',
      payload: {
        document: candidate,
        suggestedFileName,
        warningCount: candidate.runtime.warnings.length,
      },
    });
    figma.notify('JSON-кандидат примера подготовлен.');
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Не удалось подготовить пример.';
    console.error('[Apollo][examples] capture failed', error);
    figma.ui.postMessage({
      type: 'generation-example-error',
      payload: { message },
    });
    figma.notify(message);
  } finally {
    generationExampleCaptureInProgress = false;
  }
}

function normalizeGenerationExampleCaptureOptions(
  value: unknown,
): GenerationExampleCaptureOptions {
  const payload =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  return {
    exampleId: String(payload.exampleId ?? '').trim(),
    exampleSetId: normalizeOptionalGenerationExampleValue(
      payload.exampleSetId,
    ),
    breakpointLabel: normalizeOptionalGenerationExampleValue(
      payload.breakpointLabel,
    ),
    title: String(payload.title ?? '').trim(),
    pageType: String(payload.pageType ?? 'other') as GenerationExampleCaptureOptions['pageType'],
    platform: String(payload.platform ?? 'desktop') as GenerationExampleCaptureOptions['platform'],
    exampleKind: String(payload.exampleKind ?? 'golden') as GenerationExampleCaptureOptions['exampleKind'],
    includeTextContent: payload.includeTextContent === true,
    sourceFigmaUrl: normalizeOptionalGenerationExampleValue(
      payload.sourceFigmaUrl,
    ),
  };
}

function normalizeOptionalGenerationExampleValue(
  value: unknown,
): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function throwGenerationExampleCaptureError(message: string): void {
  figma.notify(message);
  figma.ui.postMessage({
    type: 'generation-example-error',
    payload: { message },
  });
}

async function resolveGenerationExampleCollectionMetadata(
  snapshot: DSStructureNode[],
): Promise<Map<string, VariableCollectionMetadata>> {
  const collectionIds = new Set<string>();
  for (const node of snapshot) {
    for (const mode of node.variableModes ?? []) {
      collectionIds.add(mode.collectionId);
    }
  }

  const result = new Map<string, VariableCollectionMetadata>();
  for (const collectionId of Array.from(collectionIds).sort()) {
    const catalogMetadata =
      resolveVariableCollectionMetadataForDiff(collectionId);
    if (catalogMetadata) {
      result.set(collectionId, catalogMetadata);
      continue;
    }

    const liveMetadata = await resolveLiveVariableCollectionMetadata(
      collectionId,
    );
    if (liveMetadata) result.set(collectionId, liveMetadata);
  }
  return result;
}

async function resolveLiveVariableCollectionMetadata(
  collectionId: string,
): Promise<VariableCollectionMetadata | null> {
  const candidates = [collectionId];
  const localId = collectionId.includes('/')
    ? collectionId.slice(collectionId.lastIndexOf('/') + 1)
    : '';
  if (localId) candidates.push(`VariableCollectionId:${localId}`);

  for (const candidate of candidates) {
    try {
      const collection =
        await figma.variables.getVariableCollectionByIdAsync(candidate);
      if (!collection) continue;
      const modeNames: Record<string, string> = {};
      for (const mode of collection.modes) {
        modeNames[mode.modeId] = mode.name;
      }
      return {
        collectionId: collection.id,
        collectionName: collection.name,
        modeNames,
      };
    } catch (_error) {
      // Remote aliases are not always directly importable; try the next id form.
    }
  }
  return null;
}

async function sendApolloAgentReport(
  requestId?: string,
  userMessage?: string,
): Promise<void> {
  const report = lastApolloAgentReport;
  const currentRequestId = requestId || `${Date.now()}`;
  const agentInputText = buildApolloAgentInputText(userMessage);
  const isDirectUserQuestion = agentInputText !== null;
  const requestKind = isDirectUserQuestion ? 'question' : 'report';
  activeApolloAgentRequestId = currentRequestId;

  if (!report && !isDirectUserQuestion) {
    figma.ui.postMessage({
      type: 'apollo-agent-result',
      payload: {
        requestId: currentRequestId,
        requestKind,
        error: 'Сначала завершите проверку Apollo.',
      },
    });
    activeApolloAgentRequestId = null;
    return;
  }

  figma.ui.postMessage({
    type: 'apollo-agent-started',
    payload: {
      requestId: currentRequestId,
      requestKind,
      reportId: report?.reportId ?? null,
      suggestedFileName: report?.suggestedFileName ?? '',
    },
  });

  try {
    const dialogueAgentInputText = agentInputText
      ? buildDialogueApolloAgentInput(agentInputText)
      : null;
    const requestBody = {
      component: 'apollo-agent-report',
      action: isDirectUserQuestion ? 'user-question' : 'audit-report',
      session_id: isDirectUserQuestion
        ? createApolloAgentDialogueSessionId()
        : createApolloAgentSessionId(report!),
    } as {
      component: string;
      action: string;
      session_id: string;
      report?: ApolloAgentReport;
      text?: string;
    };

    if (dialogueAgentInputText) {
      requestBody.text = dialogueAgentInputText;
    } else if (report) {
      requestBody.report = report;
    }

    const response = await fetch(APOLLO_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (activeApolloAgentRequestId !== currentRequestId) {
      return;
    }

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.success) {
      figma.ui.postMessage({
        type: 'apollo-agent-result',
        payload: {
          requestId: currentRequestId,
          requestKind,
          reportId: report?.reportId ?? null,
          suggestedFileName: report?.suggestedFileName ?? '',
          error: data?.error || `Apollo proxy error ${response.status}`,
        },
      });
      return;
    }

    figma.ui.postMessage({
      type: 'apollo-agent-result',
      payload: {
        requestId: currentRequestId,
        requestKind,
        reportId: report?.reportId ?? null,
        suggestedFileName: report?.suggestedFileName ?? '',
        text: typeof data.result === 'string' ? data.result : '',
      },
    });
  } catch (error) {
    if (activeApolloAgentRequestId !== currentRequestId) {
      return;
    }
    figma.ui.postMessage({
      type: 'apollo-agent-result',
      payload: {
        requestId: currentRequestId,
        requestKind,
        reportId: report?.reportId ?? null,
        suggestedFileName: report?.suggestedFileName ?? '',
        error:
          error instanceof Error
            ? error.message
            : 'Не удалось отправить отчёт агенту.',
      },
    });
  } finally {
    if (activeApolloAgentRequestId === currentRequestId) {
      activeApolloAgentRequestId = null;
    }
  }
}

function buildDialogueApolloAgentInput(question: string): string {
  return JSON.stringify({
    schemaVersion: 1,
    mode: 'design-dialogue',
    question,
    context: {
      selection: null,
      finding: null,
      auditReport: null,
      componentContext: null,
    },
  });
}

function buildApolloAgentInputText(userMessage?: string): string | null {
  const trimmedMessage =
    typeof userMessage === 'string' ? userMessage.trim() : '';

  if (!trimmedMessage) {
    return null;
  }

  return trimmedMessage;
}

function createApolloAgentSessionId(report: ApolloAgentReport): string {
  const base = [
    report.user?.slug || report.user?.id || 'unknown-user',
    report.sourceReportId || report.reportId,
  ].join('__');
  const sanitized = base
    .normalize('NFKC')
    .replace(/[^\p{Letter}\p{Number}._-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 180);
  return sanitized || 'apollo-agent-report';
}

function createApolloAgentDialogueSessionId(): string {
  const base = [
    figma.currentUser?.id || 'unknown-user',
    figma.currentUser?.name || 'apollo-user-question',
    'dialogue',
    apolloDialogueSessionNonce,
  ].join('__');
  const sanitized = base
    .normalize('NFKC')
    .replace(/[^\p{Letter}\p{Number}._-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 180);
  return sanitized || `apollo-user-question-${apolloDialogueSessionNonce}`;
}

/**
 * Preload запускается один раз и подготавливает UI, пока каталоги подгружаются в фоне.
 */
function startCatalogPreload() {
  if (catalogPreloadStarted) return;
  catalogPreloadStarted = true;
  void prepareCatalogChannel('Desktop');
}

async function prepareCatalogChannel(channel: AuditChannel): Promise<void> {
  requestedCatalogChannel = channel;
  const revision = ++catalogPreparationRevision;
  figma.ui.postMessage({
    type: 'catalog-loading',
    payload: { channel },
  });

  try {
    await ensureReferenceCatalogsForChannel(channel);
    if (
      revision !== catalogPreparationRevision ||
      channel !== requestedCatalogChannel
    ) {
      return;
    }
    figma.ui.postMessage({
      type: 'catalog-ready',
      payload: { channel },
    });
  } catch (error) {
    if (
      revision !== catalogPreparationRevision ||
      channel !== requestedCatalogChannel
    ) {
      return;
    }
    console.error('Catalog preload failed', error);
    const message =
      'Не удалось загрузить библиотеки. Проверьте подключение и попробуйте снова.';
    figma.ui.postMessage({
      type: 'catalog-error',
      payload: { channel, message },
    });
  }
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

    const detachedComponentKey = getDetachedLibraryComponentKey(node);
    if (detachedComponentKey) {
      keys.add(detachedComponentKey);
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

function buildContractArtifactHints(
  componentKeys: Iterable<string>,
): ContractArtifactHint[] {
  const hints: ContractArtifactHint[] = [];
  for (const key of componentKeys) {
    const reference = findComponent(key);
    hints.push({
      figmaKey: key,
      componentName: reference?.name ?? null,
      displayName: reference?.displayName ?? null,
      sourceFile: reference?.sourceFile ?? null,
    });
  }
  return hints;
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
  _componentKeyCache: Map<string, string | null>,
  localComponentContextCache: Map<string, boolean>,
): Promise<boolean> {
  let current = node.parent as BaseNode | null;

  while (current) {
    const currentId = current.id;
    if (localComponentContextCache.has(currentId)) {
      return localComponentContextCache.get(currentId) === true;
    }

    let isLocalContext = false;

    if (current.type === 'COMPONENT') {
      isLocalContext = !(current as ComponentNode).remote;
    } else if (current.type === 'INSTANCE') {
      const mainComponent = await (current as InstanceNode).getMainComponentAsync();
      isLocalContext = Boolean(mainComponent && !mainComponent.remote);
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

async function resetCustomizationGroup(
  payload: CustomizationResetPayload,
): Promise<void> {
  await customizationResetAction(payload);
}

async function resolveCustomizationResetReferenceNode(
  rootNode: SceneNode,
  nodeId: string,
  options?: { preferSelectedComponentVariant?: boolean },
) {
  const componentKey = await getComponentKey(rootNode);
  await ensureReferenceCatalogsForKeys([componentKey]);
  const reference = componentKey ? findComponent(componentKey) : null;
  const instanceVariantProperties =
    rootNode.type === 'INSTANCE' ? (rootNode.variantProperties ?? null) : null;
  const referenceStructure = getReferenceStructure(
    reference,
    componentKey,
    instanceVariantProperties,
  );

  if (!referenceStructure?.length) {
    return {
      ok: false as const,
      message: 'Не удалось загрузить эталонную структуру компонента.',
    };
  }

  const actualStructure = await snapshotTree(rootNode, new Set<string>());
  const alignedActualStructure = alignStructurePaths(
    actualStructure,
    referenceStructure,
  );
  const expandedReferenceStructure = COMPARE_NESTED_INSTANCES_BY_COMPONENT
    ? expandReferenceWithInstanceComponents(
        referenceStructure,
        alignedActualStructure,
      )
    : referenceStructure;

  const actualEntry = alignedActualStructure.find(
    (entry) => entry.nodeId === nodeId,
  );
  if (!actualEntry) {
    return {
      ok: false as const,
      message:
        'Не удалось сопоставить изменённый узел со структурой компонента.',
    };
  }

  if (
    options?.preferSelectedComponentVariant &&
    actualEntry.type === 'INSTANCE' &&
    actualEntry.componentInstance?.componentKey
  ) {
    const selectedComponent = findComponent(
      actualEntry.componentInstance.componentKey,
    );
    const selectedStructure = resolveStructureForInstance(
      selectedComponent,
      actualEntry.componentInstance,
    );
    const selectedRoot =
      selectedStructure?.find((entry) => entry.parentId === null) ??
      selectedStructure?.[0] ??
      null;
    if (selectedRoot) {
      return { ok: true as const, referenceNode: selectedRoot };
    }
  }

  const actualOccurrenceKeys = buildOccurrenceKeyMap(alignedActualStructure);
  const referenceOccurrenceKeys = buildOccurrenceKeyMap(
    expandedReferenceStructure,
  );
  const actualOccurrenceKey =
    actualOccurrenceKeys.get(actualEntry) ?? actualEntry.path;
  const referenceNode = expandedReferenceStructure.find(
    (entry) =>
      (referenceOccurrenceKeys.get(entry) ?? entry.path) ===
      actualOccurrenceKey,
  );

  if (!referenceNode) {
    return {
      ok: false as const,
      message: 'Не удалось найти эталонные значения для этого узла.',
    };
  }

  return { ok: true as const, referenceNode };
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
  await auditLifecycle.waitUntilIdle();
  const rerunSelection = await resolveSceneNodesByIds(lastAuditSelectionIds);
  if (rerunSelection.length) {
    await runAudit(rerunSelection, lastAuditChannel, lastAuditOptions);
  } else if (fallbackSelection.length) {
    await runAudit(fallbackSelection, lastAuditChannel, lastAuditOptions);
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
    const corporateResult = await applyCorporateComponentReplacement({
      nodeId,
      replacementComponentKey: replacementComponentKey || null,
    });
    if (!corporateResult.ok) {
      figma.notify(corporateResult.message);
      return;
    }

    figma.notify('Компонент заменён.');
    await rerunLastAuditWithFallback([corporateResult.node]);
    return;
  }

  const pageThemeResult = await applyPageThemeMode({
    nodeId,
    themeCollectionId,
    targetModeId,
  });
  if (!pageThemeResult.ok) {
    figma.notify(pageThemeResult.message);
    return;
  }

  figma.notify('Темизация переключена на Corp.');
  await rerunLastAuditWithFallback([pageThemeResult.focusNode]);
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

function debugPaintMeDiffPipeline(payload: {
  rootNode: SceneNode;
  componentName: string | null | undefined;
  alignedActualStructure: DSStructureNode[] | null;
  expandedReferenceStructure: DSStructureNode[] | null;
  rawDiffs: ReturnType<typeof diffStructures>['diffs'];
  contractBaselineDiffs: ReturnType<typeof diffStructures>['diffs'];
  explicitVariantStateDiffs: ReturnType<typeof diffStructures>['diffs'];
  markedDiffs: ReturnType<typeof diffStructures>['diffs'];
  allowlistedDiffs: ReturnType<typeof diffStructures>['diffs'];
  finalDiffs: ReturnType<typeof diffStructures>['diffs'];
}) {
  if (!isAuditTraceEnabled()) {
    return;
  }
  debugDirectOverrideDiffPipeline(payload);
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

    traceAudit('paintme-diff-pipeline', {
      componentName,
      path: actualNode.path,
      occurrenceKey,
      actual: describeDebugPaintNode(actualNode),
      reference: referenceNode ? describeDebugPaintNode(referenceNode) : null,
      rawDiffs: rawDiffs.map(describeDebugDiff),
      markedDiffs: markedDiffs.map(describeDebugDiff),
      allowlistedDiffs: allowlistedDiffs.map(describeDebugDiff),
      finalDiffs: finalDiffs.map(describeDebugDiff),
    });
  }
}

function debugDirectOverrideDiffPipeline(payload: {
  rootNode: SceneNode;
  componentName: string | null | undefined;
  alignedActualStructure: DSStructureNode[] | null;
  expandedReferenceStructure: DSStructureNode[] | null;
  rawDiffs: ReturnType<typeof diffStructures>['diffs'];
  contractBaselineDiffs: ReturnType<typeof diffStructures>['diffs'];
  explicitVariantStateDiffs: ReturnType<typeof diffStructures>['diffs'];
  markedDiffs: ReturnType<typeof diffStructures>['diffs'];
  allowlistedDiffs: ReturnType<typeof diffStructures>['diffs'];
  finalDiffs: ReturnType<typeof diffStructures>['diffs'];
}) {
  if (
    payload.componentName !== 'CardImage' ||
    payload.rootNode.type !== 'INSTANCE' ||
    !Array.isArray(payload.rootNode.overrides)
  ) {
    return;
  }

  const relevantFields = new Set([
    'fills',
    'fillStyleId',
    'effects',
    'effectStyleId',
    'componentProperties',
  ]);
  const overrideRecords = payload.rootNode.overrides.filter((override) =>
    override.overriddenFields.some((field) => relevantFields.has(field)),
  );
  if (!overrideRecords.length) {
    return;
  }

  const actual = payload.alignedActualStructure ?? [];
  const reference = payload.expandedReferenceStructure ?? [];
  const actualByNodeId = new Map(
    actual
      .filter((entry) => Boolean(entry.nodeId))
      .map((entry) => [entry.nodeId!, entry]),
  );
  const actualOccurrenceKeys = buildOccurrenceKeyMap(actual);
  const referenceOccurrenceKeys = buildOccurrenceKeyMap(reference);
  const referenceByOccurrence = new Map(
    reference.map((entry) => [referenceOccurrenceKeys.get(entry) ?? entry.path, entry]),
  );
  const stageDiffs = {
    raw: payload.rawDiffs,
    explicitVariant: payload.explicitVariantStateDiffs,
    contractBaseline: payload.contractBaselineDiffs,
    assessed: payload.markedDiffs,
    allowlisted: payload.allowlistedDiffs,
    final: payload.finalDiffs,
  };

  const records = overrideRecords.map((override) => {
    const actualNode = actualByNodeId.get(override.id) ?? null;
    const occurrenceKey = actualNode
      ? actualOccurrenceKeys.get(actualNode) ?? actualNode.path
      : null;
    const referenceNode = occurrenceKey
      ? referenceByOccurrence.get(occurrenceKey) ?? null
      : null;
    const related = Object.fromEntries(
      Object.entries(stageDiffs).map(([stage, diffs]) => [
        stage,
        diffs
          .filter((diff) => isProbeDiffRelatedToNode(diff, actualNode))
          .map(describeDebugDiff),
      ]),
    );
    return {
      overrideId: override.id,
      fields: override.overriddenFields,
      occurrenceKey,
      actual: actualNode ? describeProbeNode(actualNode) : null,
      reference: referenceNode ? describeProbeNode(referenceNode) : null,
      related,
    };
  });

  console.log(
    `[Apollo][probe] override-diff-pipeline ${JSON.stringify({
      rootNodeId: payload.rootNode.id,
      componentName: payload.componentName,
      records,
    })}`,
  );
}

function isProbeDiffRelatedToNode(
  diff: ReturnType<typeof diffStructures>['diffs'][number],
  node: DSStructureNode | null,
): boolean {
  if (!node) return false;
  return diff.nodeId === node.nodeId ||
    diff.nodePath === node.path ||
    node.path.startsWith(`${diff.nodePath} / `) ||
    diff.nodePath.startsWith(`${node.path} / `);
}

function describeProbeNode(node: DSStructureNode) {
  return {
    nodeId: node.nodeId ?? null,
    path: node.path,
    name: node.name,
    type: node.type,
    componentKey: node.componentInstance?.componentKey ?? null,
    variantProperties: node.componentInstance?.variantProperties ?? null,
    fill: node.fill ?? null,
    effects: node.effects ?? null,
    referenceOrigin: node.referenceOrigin ?? null,
    referenceOwnerComponentKey: node.referenceOwnerComponentKey ?? null,
    referenceOwnerRelativePath: node.referenceOwnerRelativePath ?? null,
    referenceVariantOwnedProperties: node.referenceVariantOwnedProperties ?? [],
  };
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
    directHostVariantOverride: diff.context.directHostVariantOverride === true,
    assessment: diff.assessment
      ? {
          verdict: diff.assessment.verdict,
          source: diff.assessment.source,
          reasonCode: diff.assessment.reasonCode,
          presentation: diff.assessment.presentation ?? null,
        }
      : null,
  };
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
      const collectionMap = new Map<string, VariableCollectionMetadata>();
      for (const catalog of catalogs) {
        const catalogLibrary =
          catalog.meta?.library ?? catalog.meta?.fileName ?? '';
        const collections = catalog.collections ?? [];
        for (const collection of collections) {
          if (!collection) continue;
          const collectionName =
            collection.name ?? catalogLibrary ?? catalog.meta?.fileName ?? '';
          const modeNames: Record<string, string> = {};
          for (const mode of collection.modes ?? []) {
            if (
              mode &&
              typeof mode.modeId === 'string' &&
              typeof mode.name === 'string'
            ) {
              modeNames[mode.modeId] = mode.name;
            }
          }
          if (typeof collection.id === 'string' && collection.id) {
            const collectionMetadata: VariableCollectionMetadata = {
              collectionId: collection.id,
              collectionName: collectionName || null,
              modeNames,
            };
            registerVariableCollectionMetadata(
              collectionMap,
              collection.id,
              collectionMetadata,
            );
            registerVariableCollectionMetadata(
              collectionMap,
              collection.key,
              collectionMetadata,
            );
          }
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
              variableKey:
                typeof variable.key === 'string' ? variable.key : undefined,
              variableId:
                typeof variable.id === 'string' ? variable.id : undefined,
              collectionId:
                typeof variable.variableCollectionId === 'string'
                  ? variable.variableCollectionId
                  : typeof collection.id === 'string'
                    ? collection.id
                    : undefined,
              collectionName: collectionName || undefined,
              modeNames,
            };
            registerTokenLabelKey(map, variable.key, entry);
            registerTokenLabelKey(map, variable.id, entry);
          }
        }
      }
      tokenLabelMap = map;
      variableCollectionMetadataMap = collectionMap;
    } catch (error) {
      console.warn('[Apollo] failed to load token catalogs', error);
      tokenLabelMap = new Map();
      variableCollectionMetadataMap = new Map();
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

function resolveVariableMetadataForDiff(
  bindingId: string,
): VariableMetadata | null {
  const aliasKey = extractAliasKey(bindingId);
  const metadata =
    tokenLabelMap?.get(bindingId) ??
    (aliasKey ? tokenLabelMap?.get(aliasKey) : null) ??
    null;
  if (!metadata) return null;
  return {
    variableId: metadata.variableId ?? null,
    variableKey: metadata.variableKey ?? aliasKey,
    variableName: metadata.label ?? null,
    collectionId: metadata.collectionId ?? null,
    collectionName: metadata.collectionName ?? metadata.library ?? null,
    modeNames: metadata.modeNames ?? {},
  };
}

function resolveVariableCollectionMetadataForDiff(
  collectionId: string,
): VariableCollectionMetadata | null {
  const collectionKey = extractVariableCollectionKey(collectionId);
  return (
    variableCollectionMetadataMap?.get(collectionId) ??
    (collectionKey
      ? variableCollectionMetadataMap?.get(collectionKey) ?? null
      : null)
  );
}

function registerVariableCollectionMetadata(
  map: Map<string, VariableCollectionMetadata>,
  rawKey: string | null | undefined,
  metadata: VariableCollectionMetadata,
): void {
  for (const lookupKey of getVariableCollectionLookupKeys(rawKey)) {
    map.set(lookupKey, metadata);
  }
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
    key: metadata?.variableKey ?? tokenKey,
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
