import type { LibraryComponent } from '../reference/libraryTypes';
import type { ApolloStatsReport } from '../stats/types';
import type {
  DSStructureNode,
  DSVariableModeContext,
} from '../types/structures';
import { isFigmaSourceUrl } from './generationExampleSource';

export type GenerationExamplePageType =
  | 'form'
  | 'landing'
  | 'data-list'
  | 'details'
  | 'status-screen'
  | 'dashboard'
  | 'other';

export type GenerationExamplePlatform =
  | 'desktop'
  | 'mobile-web'
  | 'ios'
  | 'android';
export type GenerationExampleKind = 'golden' | 'variant' | 'anti-example';

export type GenerationExampleCaptureOptions = {
  exampleId: string;
  exampleSetId: string | null;
  breakpointLabel: string | null;
  title: string;
  pageType: GenerationExamplePageType;
  platform: GenerationExamplePlatform;
  exampleKind: GenerationExampleKind;
  includeTextContent: boolean;
  sourceFigmaUrl: string | null;
};

export type GenerationExampleAuditEvidence = {
  status: 'passed' | 'needs-review' | 'blocked';
  matchBasis: 'selection-node-ids+platform';
  reportId: string;
  generatedAt: string;
  pluginVersion: string;
  channel: string;
  selectionNodeIds: string[];
  violationCount: number;
  unknownCount: number;
  allowedCount: number;
  expectedCount: number;
  comparisonIssueCount: number;
  problemOccurrenceCount: number;
  blockingOccurrenceCount: number;
  categoryCounts: Record<string, number>;
};

export type GenerationExampleComponentReferenceKind =
  | 'contract-package'
  | 'catalog-resource'
  | 'unresolved';

export type GenerationExampleComponentReference = {
  referenceKind: GenerationExampleComponentReferenceKind;
  packageKey: string | null;
  name: string | null;
  library: string | null;
  sourceFile: string | null;
  platform: string | null;
  role: string | null;
};

export type GenerationExampleVariableReference = {
  name: string | null;
  collectionName: string | null;
};

export type GenerationExampleVariableCollectionReference = {
  collectionName: string | null;
  modeNames: Record<string, string>;
};

export type BuildGenerationExampleCandidateInput = {
  pluginVersion: string;
  capturedAt: string;
  options: GenerationExampleCaptureOptions;
  source: {
    fileKey: string | null;
    fileName: string | null;
    editorType: string;
    pageName: string;
    rootNodeId: string;
    rootNodeName: string;
    figmaLink: string | null;
  };
  snapshot: DSStructureNode[];
  auditEvidence: GenerationExampleAuditEvidence | null;
  resolveComponent?: (
    componentKey: string,
  ) => GenerationExampleComponentReference | null;
  resolveVariable?: (
    variableId: string,
  ) => GenerationExampleVariableReference | null;
  resolveVariableCollection?: (
    collectionId: string,
  ) => GenerationExampleVariableCollectionReference | null;
};

const STRUCTURAL_NODE_TYPES = new Set([
  'FRAME',
  'GROUP',
  'SECTION',
  'COMPONENT',
  'COMPONENT_SET',
]);
const MAX_CONTENT_SAMPLES = 500;
const MAX_CONTENT_SAMPLE_LENGTH = 500;
const PAGE_TYPES = new Set<GenerationExamplePageType>([
  'form',
  'landing',
  'data-list',
  'details',
  'status-screen',
  'dashboard',
  'other',
]);
const PLATFORMS = new Set<GenerationExamplePlatform>([
  'desktop',
  'mobile-web',
  'ios',
  'android',
]);
const EXAMPLE_KINDS = new Set<GenerationExampleKind>([
  'golden',
  'variant',
  'anti-example',
]);

export function buildGenerationExampleCandidate(
  input: BuildGenerationExampleCandidateInput,
) {
  validateCaptureOptions(input.options);
  validateSnapshot(input.snapshot);

  const root = input.snapshot[0];
  const variableModeRegistry = buildVariableModeRegistry(input);
  const compositionNodes = buildCompositionNodes(input, variableModeRegistry);
  const contentSamples = input.options.includeTextContent
    ? buildContentSamples(input.snapshot)
    : [];
  const componentResources = buildComponentResources(input);
  const variableResources = buildVariableResources(input);
  const variableCollections = buildVariableCollections(input);
  const unresolvedVariableCollections = variableCollections.filter(
    (collection) => !collection.collectionName,
  );
  const componentInstanceCount = input.snapshot.filter((node) =>
    Boolean(node.componentInstance?.componentKey),
  ).length;
  const unresolvedComponents = componentResources.filter(
    (resource) => resource.referenceKind === 'unresolved',
  );
  const warnings: string[] = [];

  if (!input.auditEvidence) {
    warnings.push(
      'Для текущего выделения нет совпадающего завершённого аудита Apollo.',
    );
  }
  if (!input.options.includeTextContent) {
    warnings.push('Текстовое содержимое исключено настройками capture.');
  }
  if (
    input.options.includeTextContent &&
    input.snapshot.filter((node) => node.type === 'TEXT').length >
      MAX_CONTENT_SAMPLES
  ) {
    warnings.push(
      `Текстовые примеры ограничены первыми ${MAX_CONTENT_SAMPLES} узлами.`,
    );
  }
  if (input.auditEvidence?.status === 'blocked') {
    warnings.push(
      `Связанный аудит содержит ${input.auditEvidence.blockingOccurrenceCount} блокирующих результатов.`,
    );
  }
  if (input.auditEvidence?.status === 'needs-review') {
    warnings.push('Связанный аудит требует ручной проверки.');
  }
  if (unresolvedComponents.length > 0) {
    warnings.push(
      `Не удалось разрешить ${unresolvedComponents.length} component keys по reference-каталогам.`,
    );
  }
  if (unresolvedVariableCollections.length > 0) {
    warnings.push(
      `Не удалось разрешить ${unresolvedVariableCollections.length} variable collections.`,
    );
  }
  if (!input.source.fileKey || !input.source.figmaLink) {
    warnings.push('Не удалось определить полный Figma source link.');
  }

  return {
    schemaVersion: 'apollo.generation-example-candidate.v2',
    documentType: 'generation-example-candidate',
    metadata: {
      exampleId: input.options.exampleId,
      title: input.options.title.trim(),
      status: 'runtime-candidate',
      exampleKind: input.options.exampleKind,
      pageType: input.options.pageType,
      platform: input.options.platform,
      responsive: {
        exampleSetId: input.options.exampleSetId,
        breakpointLabel: input.options.breakpointLabel,
      },
      capturedAt: input.capturedAt,
      ownership: {
        runtime: 'apollo-runtime',
        promotion: 'design-system-authors + athena-cli',
      },
      requiresManualReview: true,
    },
    runtime: {
      source: input.source,
      dimensions: buildGenerationExampleDimensions(root, compositionNodes),
      capture: {
        profile: 'composition',
        textContent: input.options.includeTextContent
          ? 'included'
          : 'omitted',
        rootId: root.id,
        nodes: compositionNodes,
        contentSamples,
        resources: {
          components: componentResources,
          variables: variableResources,
          variableCollections,
          variableModeContexts: variableModeRegistry.contexts,
        },
        statistics: {
          sourceNodeCount: input.snapshot.length,
          capturedNodeCount: compositionNodes.length,
          componentInstanceCount,
          uniqueComponentCount: componentResources.length,
          contractPackageCount: componentResources.filter(
            (resource) => resource.referenceKind === 'contract-package',
          ).length,
          catalogResourceCount: componentResources.filter(
            (resource) => resource.referenceKind === 'catalog-resource',
          ).length,
          unresolvedComponentCount: unresolvedComponents.length,
          variableCount: variableResources.length,
          variableModeContextCount: variableModeRegistry.contexts.length,
          textSampleCount: contentSamples.length,
        },
      },
      validation: input.auditEvidence ?? {
        status: 'not-run',
        reportId: null,
        message:
          'Проверьте то же выделение Apollo перед promotion в approved example.',
      },
      warnings,
    },
  };
}

export function createGenerationExampleAuditEvidence(
  report: ApolloStatsReport,
): GenerationExampleAuditEvidence {
  let violationCount = 0;
  let unknownCount = 0;
  let allowedCount = 0;
  let expectedCount = 0;
  let comparisonIssueCount = 0;

  for (const item of report.categories.customizations.items) {
    comparisonIssueCount += item.comparisonIssues.length;
    for (const change of item.changes) {
      const verdict = change.assessment?.verdict ?? 'unknown';
      if (verdict === 'violation') violationCount += 1;
      else if (verdict === 'allowed') allowedCount += 1;
      else if (verdict === 'expected') expectedCount += 1;
      else unknownCount += 1;
    }
  }

  for (const category of [
    report.categories.deprecatedComponents,
    report.categories.updates,
    report.categories.localComponents,
    report.categories.wrongChannel,
    report.categories.technicalComponents,
  ]) {
    for (const item of category.items) {
      comparisonIssueCount += item.comparisonIssues.length;
    }
  }

  const blockingOccurrenceCount =
    report.categories.deprecatedComponents.count +
    report.categories.deprecatedStyles.count +
    report.categories.customStyles.count +
    report.categories.updates.count +
    report.categories.localComponents.count +
    report.categories.detachedComponents.count +
    report.categories.wrongChannel.count +
    report.categories.themization.count;
  const status =
    violationCount > 0 || blockingOccurrenceCount > 0
      ? 'blocked'
      : unknownCount > 0 || comparisonIssueCount > 0
        ? 'needs-review'
        : 'passed';

  return {
    status,
    matchBasis: 'selection-node-ids+platform',
    reportId: report.reportId,
    generatedAt: report.generatedAt,
    pluginVersion: report.plugin.version,
    channel: report.scan.channel,
    selectionNodeIds: report.scan.selection.map((item) => item.nodeId),
    violationCount,
    unknownCount,
    allowedCount,
    expectedCount,
    comparisonIssueCount,
    problemOccurrenceCount: report.summary.problemOccurrenceCount,
    blockingOccurrenceCount,
    categoryCounts: Object.assign({}, report.summary.categoryCounts),
  };
}

export function auditEvidenceMatchesCapture(
  evidence: GenerationExampleAuditEvidence | null,
  selectionNodeIds: string[],
  platform: GenerationExamplePlatform,
): boolean {
  if (!evidence) return false;
  const expectedChannel =
    platform === 'mobile-web'
      ? 'MobileWeb'
      : platform === 'ios'
        ? 'iOS'
        : platform === 'android'
          ? 'Android'
          : 'Desktop';
  if (evidence.channel !== expectedChannel) return false;
  if (evidence.selectionNodeIds.length !== selectionNodeIds.length) return false;
  const expected = evidence.selectionNodeIds.slice().sort();
  const actual = selectionNodeIds.slice().sort();
  return expected.every((nodeId, index) => nodeId === actual[index]);
}

export function getGenerationExampleCandidateFileName(
  exampleId: string,
): string {
  return `${exampleId}.generation-example-candidate.json`;
}

export function resolveLibraryComponentReference(
  component: LibraryComponent | null,
  packageKey: string | null,
): GenerationExampleComponentReference | null {
  if (!component && !packageKey) return null;
  return {
    referenceKind: packageKey
      ? 'contract-package'
      : component?.sourceFile
        ? 'catalog-resource'
        : 'unresolved',
    packageKey,
    name:
      component?.displayName ?? component?.name ?? component?.names?.[0] ?? null,
    library: component?.source ?? null,
    sourceFile: component?.sourceFile ?? null,
    platform: component?.platform ?? null,
    role: component?.role ?? null,
  };
}

function validateCaptureOptions(options: GenerationExampleCaptureOptions): void {
  const exampleId = options.exampleId.trim();
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(exampleId)) {
    throw new Error(
      'ID примера должен содержать только строчные латинские буквы, цифры, точки и дефисы.',
    );
  }
  if (!options.title.trim()) {
    throw new Error('Укажите название примера.');
  }
  if (
    options.exampleSetId &&
    !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(options.exampleSetId)
  ) {
    throw new Error(
      'ID группы должен содержать только строчные латинские буквы, цифры, точки и дефисы.',
    );
  }
  if ((options.breakpointLabel?.length ?? 0) > 80) {
    throw new Error('Название брейкпоинта не должно превышать 80 символов.');
  }
  if (
    options.sourceFigmaUrl &&
    !isFigmaSourceUrl(options.sourceFigmaUrl)
  ) {
    throw new Error('Ссылка на источник должна вести на файл Figma.');
  }
  if (!PAGE_TYPES.has(options.pageType)) {
    throw new Error('Выбран неизвестный тип страницы.');
  }
  if (!PLATFORMS.has(options.platform)) {
    throw new Error('Выбрана неподдерживаемая платформа.');
  }
  if (!EXAMPLE_KINDS.has(options.exampleKind)) {
    throw new Error('Выбрана неизвестная роль примера.');
  }
}

function buildGenerationExampleDimensions(
  root: DSStructureNode,
  compositionNodes: Array<{ layout: DSStructureNode['layout'] | null }>,
) {
  const rootWidth = root.layout?.width ?? null;
  const rootHeight = root.layout?.height ?? null;
  const horizontalSizing = root.layout?.sizing?.horizontal ?? null;
  const verticalSizing = root.layout?.sizing?.vertical ?? null;
  let estimatedContentWidth = rootWidth;
  let estimatedContentHeight = rootHeight;

  for (const node of compositionNodes) {
    const width = node.layout?.width;
    const height = node.layout?.height;
    if (
      typeof width === 'number' &&
      (estimatedContentWidth === null || width > estimatedContentWidth)
    ) {
      estimatedContentWidth = width;
    }
    if (
      typeof height === 'number' &&
      (estimatedContentHeight === null || height > estimatedContentHeight)
    ) {
      estimatedContentHeight = height;
    }
  }

  return {
    rootBounds: {
      width: rootWidth,
      height: rootHeight,
    },
    viewport: {
      width: rootWidth,
      height: verticalSizing === 'FIXED' ? rootHeight : null,
    },
    contentBounds: {
      estimatedWidth: estimatedContentWidth,
      estimatedHeight: estimatedContentHeight,
    },
    semantics: {
      horizontalSizing,
      verticalSizing,
      rootHeightKind: verticalSizing === 'FIXED' ? 'viewport' : 'content',
    },
  };
}

function validateSnapshot(snapshot: DSStructureNode[]): void {
  if (!snapshot.length) {
    throw new Error('Не удалось получить структуру выделенного фрейма.');
  }
  const ids = new Set<number>();
  for (const node of snapshot) {
    if (ids.has(node.id)) {
      throw new Error(`Дублирующийся snapshot id: ${node.id}.`);
    }
    ids.add(node.id);
  }
}

type GenerationExampleVariableModeRegistry = {
  contexts: Array<{
    id: string;
    collectionId: string;
    collectionName: string | null;
    resolvedModeId: string | null;
    resolvedModeName: string | null;
    explicitModeId: string | null;
    explicitModeName: string | null;
    explicitOwnerNodeId: string | null;
    explicitOwnerName: string | null;
    explicitOwnerPath: string | null;
  }>;
  idsByNodeId: Map<number, string[]>;
};

function buildCompositionNodes(
  input: BuildGenerationExampleCandidateInput,
  variableModeRegistry: GenerationExampleVariableModeRegistry,
) {
  const nodesById = new Map(input.snapshot.map((node) => [node.id, node]));
  const keptIds = new Set<number>();

  for (const node of input.snapshot) {
    if (
      node.id === input.snapshot[0].id ||
      Boolean(node.componentInstance) ||
      (!hasInstanceAncestor(node, nodesById) &&
        STRUCTURAL_NODE_TYPES.has(node.type))
    ) {
      keptIds.add(node.id);
    }
  }

  return input.snapshot
    .filter((node) => keptIds.has(node.id))
    .map((node) => {
      const componentKey = node.componentInstance?.componentKey ?? null;
      const component = componentKey
        ? input.resolveComponent?.(componentKey) ?? null
        : null;
      return {
        id: node.id,
        parentId: findNearestKeptParentId(node, nodesById, keptIds),
        figmaNodeId: node.nodeId ?? null,
        path: node.path,
        type: node.type,
        name: node.name,
        visible: node.visible,
        layout: node.layout ?? null,
        component: componentKey
          ? {
              referenceKind:
                component?.referenceKind ?? 'unresolved',
              figmaKey: componentKey,
              packageKey: component?.packageKey ?? null,
              name: component?.name ?? node.name,
              library: component?.library ?? null,
              sourceFile: component?.sourceFile ?? null,
              platform: component?.platform ?? null,
              role: component?.role ?? null,
              variantProperties:
                node.componentInstance?.variantProperties ?? {},
            }
          : null,
        bindings: {
          fill: buildBinding(node.fill?.token ?? null, input),
          stroke: buildBinding(node.stroke?.token ?? null, input),
          opacity: buildBinding(node.opacityToken ?? null, input),
          radius: buildBinding(node.radiusToken ?? null, input),
          typography: buildBinding(node.typographyToken ?? null, input),
          itemSpacing: buildBinding(
            node.layout?.itemSpacingToken ?? null,
            input,
          ),
          padding: {
            top: buildBinding(
              node.layout?.paddingTokens?.top ?? null,
              input,
            ),
            right: buildBinding(
              node.layout?.paddingTokens?.right ?? null,
              input,
            ),
            bottom: buildBinding(
              node.layout?.paddingTokens?.bottom ?? null,
              input,
            ),
            left: buildBinding(
              node.layout?.paddingTokens?.left ?? null,
              input,
            ),
          },
        },
        variableModeContextIds:
          variableModeRegistry.idsByNodeId.get(node.id) ?? [],
      };
    });
}

function hasInstanceAncestor(
  node: DSStructureNode,
  nodesById: Map<number, DSStructureNode>,
): boolean {
  let parentId = node.parentId;
  while (typeof parentId === 'number') {
    const parent = nodesById.get(parentId) ?? null;
    if (!parent) return false;
    if (parent.componentInstance) return true;
    parentId = parent.parentId;
  }
  return false;
}

function findNearestKeptParentId(
  node: DSStructureNode,
  nodesById: Map<number, DSStructureNode>,
  keptIds: Set<number>,
): number | null {
  let parentId = node.parentId;
  while (typeof parentId === 'number') {
    if (keptIds.has(parentId)) return parentId;
    const parent = nodesById.get(parentId) ?? null;
    if (!parent) return null;
    parentId = parent.parentId;
  }
  return null;
}

function buildBinding(
  variableId: string | null,
  input: BuildGenerationExampleCandidateInput,
) {
  if (!variableId) return null;
  const resolved = input.resolveVariable?.(variableId) ?? null;
  return {
    variableId,
    name: resolved?.name ?? null,
    collectionName: resolved?.collectionName ?? null,
  };
}

function buildVariableModeRegistry(
  input: BuildGenerationExampleCandidateInput,
): GenerationExampleVariableModeRegistry {
  const contexts: GenerationExampleVariableModeRegistry['contexts'] = [];
  const idsBySignature = new Map<string, string>();
  const idsByNodeId = new Map<number, string[]>();

  for (const node of input.snapshot) {
    const contextIds: string[] = [];
    for (const mode of node.variableModes ?? []) {
      const context = buildVariableModeContext(mode, input);
      const signature = buildVariableModeContextSignature(context);
      let contextId = idsBySignature.get(signature) ?? null;
      if (!contextId) {
        contextId = `vmc-${contexts.length + 1}`;
        idsBySignature.set(signature, contextId);
        contexts.push({
          id: contextId,
          collectionId: context.collectionId,
          collectionName: context.collectionName,
          resolvedModeId: context.resolvedModeId,
          resolvedModeName: context.resolvedModeName,
          explicitModeId: context.explicitModeId,
          explicitModeName: context.explicitModeName,
          explicitOwnerNodeId: context.explicitOwnerNodeId,
          explicitOwnerName: context.explicitOwnerName,
          explicitOwnerPath: context.explicitOwnerPath,
        });
      }
      contextIds.push(contextId);
    }
    if (contextIds.length > 0) {
      idsByNodeId.set(node.id, contextIds);
    }
  }

  return { contexts, idsByNodeId };
}

function buildVariableModeContext(
  mode: DSVariableModeContext,
  input: BuildGenerationExampleCandidateInput,
) {
    const collection =
      input.resolveVariableCollection?.(mode.collectionId) ?? null;
    return {
      collectionId: mode.collectionId,
      collectionName: collection?.collectionName ?? null,
      resolvedModeId: mode.resolvedModeId,
      resolvedModeName: mode.resolvedModeId
        ? collection?.modeNames[mode.resolvedModeId] ?? null
        : null,
      explicitModeId: mode.explicitModeId,
      explicitModeName: mode.explicitModeId
        ? collection?.modeNames[mode.explicitModeId] ?? null
        : null,
      explicitOwnerNodeId: mode.explicitOwnerNodeId,
      explicitOwnerName: mode.explicitOwnerName,
      explicitOwnerPath: mode.explicitOwnerPath,
    };
}

function buildVariableModeContextSignature(
  context: ReturnType<typeof buildVariableModeContext>,
): string {
  return [
    context.collectionId,
    context.collectionName,
    context.resolvedModeId,
    context.resolvedModeName,
    context.explicitModeId,
    context.explicitModeName,
    context.explicitOwnerNodeId,
    context.explicitOwnerName,
    context.explicitOwnerPath,
  ]
    .map((value) => String(value ?? ''))
    .join('\u0000');
}

function buildContentSamples(snapshot: DSStructureNode[]) {
  return snapshot
    .filter(
      (node) =>
        node.type === 'TEXT' &&
        typeof node.text?.characters === 'string' &&
        Boolean(node.text.characters),
    )
    .slice(0, MAX_CONTENT_SAMPLES)
    .map((node) => ({
      figmaNodeId: node.nodeId ?? null,
      path: node.path,
      value: String(node.text?.characters ?? '').slice(
        0,
        MAX_CONTENT_SAMPLE_LENGTH,
      ),
      textStyleKey: node.styles?.text?.styleKey ?? null,
    }));
}

function buildComponentResources(input: BuildGenerationExampleCandidateInput) {
  const observedNames = new Map<string, string>();
  for (const node of input.snapshot) {
    const key = node.componentInstance?.componentKey;
    if (key && !observedNames.has(key)) observedNames.set(key, node.name);
  }
  return Array.from(observedNames.keys())
    .sort()
    .map((figmaKey) => {
      const component = input.resolveComponent?.(figmaKey) ?? null;
      return {
        referenceKind: component?.referenceKind ?? 'unresolved',
        figmaKey,
        packageKey: component?.packageKey ?? null,
        name: component?.name ?? observedNames.get(figmaKey) ?? null,
        library: component?.library ?? null,
        sourceFile: component?.sourceFile ?? null,
        platform: component?.platform ?? null,
        role: component?.role ?? null,
      };
    });
}

function buildVariableResources(input: BuildGenerationExampleCandidateInput) {
  const ids = new Set<string>();
  for (const node of input.snapshot) {
    addVariableId(ids, node.fill?.token);
    addVariableId(ids, node.stroke?.token);
    addVariableId(ids, node.opacityToken);
    addVariableId(ids, node.radiusToken);
    addVariableId(ids, node.typographyToken);
    addVariableId(ids, node.layout?.itemSpacingToken);
    addVariableId(ids, node.layout?.paddingTokens?.top);
    addVariableId(ids, node.layout?.paddingTokens?.right);
    addVariableId(ids, node.layout?.paddingTokens?.bottom);
    addVariableId(ids, node.layout?.paddingTokens?.left);
  }
  return Array.from(ids)
    .sort()
    .map((variableId) => {
      const resolved = input.resolveVariable?.(variableId) ?? null;
      return {
        variableId,
        name: resolved?.name ?? null,
        collectionName: resolved?.collectionName ?? null,
      };
    });
}

function buildVariableCollections(
  input: BuildGenerationExampleCandidateInput,
) {
  const ids = new Set<string>();
  for (const node of input.snapshot) {
    for (const mode of node.variableModes ?? []) {
      ids.add(mode.collectionId);
    }
  }
  return Array.from(ids)
    .sort()
    .map((collectionId) => {
      const resolved =
        input.resolveVariableCollection?.(collectionId) ?? null;
      return {
        collectionId,
        collectionName: resolved?.collectionName ?? null,
        modeNames: resolved?.modeNames ?? {},
      };
    });
}

function addVariableId(
  result: Set<string>,
  value: string | null | undefined,
): void {
  if (value) result.add(value);
}
