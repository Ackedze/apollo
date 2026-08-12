import {
  ensureReferenceCatalogsForKeys,
  findComponent,
  findComponentByName,
  findComponentVariantKeyByName,
  isNestedComponentLayoutPathHostControlled,
  isNestedComponentPaintPathHostControlled,
  isNestedComponentTextPathHostControlled,
  resolveStructureForInstance,
  resolveVariantKeyForInstance,
} from '../reference/library';
import type { LibraryComponent } from '../reference/libraryTypes';
import { snapshotTree } from '../structure/snapshot';
import {
  diffExplicitNestedVariantStates,
  diffStructures,
  type DiffEntry,
  type VariableMetadata,
} from '../structure/diff';
import type { DSStructureNode } from '../types/structures';
import type {
  AuditItem,
  PathSegment,
  RelevanceStatus,
  UpdateReason,
} from '../types/audit';
import { buildNodePath, getPageName } from '../utils/nodeHelpers';
import {
  getLibraryComponentFreshnessScope,
} from './libraryComponentFreshness';
import { resolveStyleLabelForDiff } from './styleMetadata';
import {
  applyAllowedCustomizationRules,
} from '../filters/allowedCustomizationRules';
import { applyCustomizationFilters } from '../filters/customizationFilters';
import {
  createRuntimeSuppressionDependencies,
  markSuppressedDiff,
} from '../filters/suppressionPolicy';
import {
  getForcedAuditCategory,
  getForcedAuditCategoryReason,
} from '../policies/componentAuditPolicy';
import {
  applyAssessmentPresentation,
  assessCustomizationDiffs,
  collapseConfiguredSemanticVariantDiffs,
  collapsePatternViolationDiffs,
  collapseSemanticVariantDiffs,
  collapseVisualDiffsUnderVariantChanges,
  createNestedContextEvidence,
  createPatternContextResolver,
} from '../assessment/customizationAssessment';
import { resolveSurfaceContext } from '../assessment/surfaceContext';
import {
  APOLLO_CONTRACT_AWARE_AUDIT_ENABLED,
  applyContractAwareDiffs,
} from '../contracts/contractAwareDiffs';
import {
  applyCompositionContracts,
  hasMatchingCompositionContract,
} from '../contracts/compositionContractEngine';
import {
  applyContextualComponentRuleAssessment,
  applyRequiredComponentSizingAssessment,
  applySharedValueComponentRuleAssessments,
  applyStructuredComponentRuleAssessment,
  applyVariableBindingAssessment,
  createNumericConstraintRuleDiffs,
  createRequiredPaintStateDiffs,
  createRequiredComponentSizingDiffs,
  createVariableModeRuleDiffs,
  hasNumericConstraintRules,
  hasRequiredComponentSizingRules,
  hasVariableModeRules,
  type VariableCollectionMetadata,
} from '../contracts/componentRules';
import { createComponentApiVariantDiffs } from '../contracts/componentApiContracts';
import { getComponentApiContractByFigmaKey } from '../contracts/runtimeContractRegistry';
import {
  ensureExperimentalContractV2ForKeys,
  getExperimentalContractV2ForKey,
  hasExperimentalContractV2ForKey,
  resolveExperimentalContractV2ComponentFamilyKey,
  type ExperimentalContractV2,
} from '../contracts/experimentalContractV2Registry';
import {
  evaluateExperimentalContractV2Tree,
  mergeContractBaselineEvidence,
} from '../contracts/experimentalContractV2Engine';
import { alignMaterializedReferenceInstancePaths } from '../reference/nestedReferenceMerge';
import {
  alignStructurePaths,
  attachSurfaceContext,
  expandReferenceWithInstanceComponents,
} from './nestedReferencePreparation';
import type { AuditTraversalContext } from './auditTraversalContext';
import { getTimestamp, traceAudit } from '../utils/auditInstrumentation';

const STRICT_COMPARISON = true;
const COMPARE_NESTED_INSTANCES_BY_COMPONENT = true;
const runtimeSuppressionDependencies = createRuntimeSuppressionDependencies(
  isNestedComponentPaintPathHostControlled,
  isNestedComponentTextPathHostControlled,
  isNestedComponentLayoutPathHostControlled,
);

type DiffList = ReturnType<typeof diffStructures>['diffs'];

export interface ComponentClassifierDependencies {
  getComponentKeyCached(
    node: SceneNode,
    cache: Map<string, string | null>,
    options: { retryIfMissing: boolean },
  ): Promise<string | null>;
  buildNodeSegments(node: SceneNode): PathSegment[];
  getReferenceStructureCached(
    reference: LibraryComponent | null | undefined,
    variantKey: string | null,
    variantProperties: Record<string, string> | null | undefined,
    cache: Map<string, DSStructureNode[] | null>,
  ): DSStructureNode[] | null;
  isInsideLocalComponentContext(
    node: SceneNode,
    componentKeyCache: Map<string, string | null>,
    localComponentContextCache: Map<string, boolean>,
  ): Promise<boolean>;
  resolveTokenLabel(token: string): string | null;
  isPaintToken(token: string): boolean;
  resolveVariableMetadata(bindingId: string): VariableMetadata | null;
  resolveVariableCollectionMetadata(
    collectionId: string,
  ): VariableCollectionMetadata | null;
  normalizeRelevanceStatus(status: unknown): RelevanceStatus;
  reportMissingReference(
    componentName: string,
    componentKey: string | null,
  ): void;
  debugDiffPipeline(payload: {
    rootNode: SceneNode;
    componentName: string | null | undefined;
    alignedActualStructure: DSStructureNode[] | null;
    expandedReferenceStructure: DSStructureNode[] | null;
    rawDiffs: DiffList;
    contractBaselineDiffs: DiffList;
    explicitVariantStateDiffs: DiffList;
    markedDiffs: DiffList;
    allowlistedDiffs: DiffList;
    finalDiffs: DiffList;
  }): void;
  experimentalContractV2Enabled?: boolean;
  throwIfCancelled(): void;
}

function hasInstanceOverrides(instance: InstanceNode): boolean {
  return Array.isArray(instance.overrides) && instance.overrides.length > 0;
}

export function isNativeLocalComponent(
  nativeLocalDefinition: ComponentNode | null,
): boolean {
  return Boolean(nativeLocalDefinition && !nativeLocalDefinition.remote);
}

export function shouldRunComponentDiff(options: {
  forcedCategory: boolean;
  needsDiff: boolean;
  instanceHasOverrides: boolean;
  requiresSizingRuleAudit: boolean;
  requiresNumericConstraintAudit: boolean;
  requiresVariableModeRuleAudit: boolean;
  requiresCompositionContractAudit: boolean;
  requiresComponentApiAudit: boolean;
  isInheritedFromLocalComponentContext: boolean;
}): boolean {
  return !options.forcedCategory && options.needsDiff && (
    options.instanceHasOverrides ||
    options.requiresSizingRuleAudit ||
    options.requiresNumericConstraintAudit ||
    options.requiresVariableModeRuleAudit ||
    options.requiresCompositionContractAudit ||
    options.requiresComponentApiAudit ||
    options.isInheritedFromLocalComponentContext
  );
}

export function shouldMaterializeComponentDiff(options: {
  hasReferenceStructure: boolean;
  alreadyMaterialized: boolean;
  requiresExperimentalContractV2Audit: boolean;
  contractV2ScopeCovered: boolean;
}): boolean {
  if (!options.hasReferenceStructure) return false;
  if (!options.alreadyMaterialized) return true;
  return options.requiresExperimentalContractV2Audit && !options.contractV2ScopeCovered;
}

export function filterUndocumentedNestedVisualDiffs(
  host: DSStructureNode,
  diffs: readonly DiffEntry[],
): DiffEntry[] {
  const nativeOverrides = new Set(
    (host.componentInstance?.directOverrides ?? []).flatMap((override) =>
      override.fields.map((field) => `${override.nodeId}|${field}`),
    ),
  );
  return diffs.filter((diff) => {
    if (
      diff.context.directHostVariantOverride === true ||
      !diff.nodeId
    ) {
      return true;
    }
    const property = diff.details?.property ?? '';
    const fields = property === 'radius'
      ? [
          'cornerRadius',
          'topLeftRadius',
          'topRightRadius',
          'bottomRightRadius',
          'bottomLeftRadius',
        ]
      : property === 'fill' || property === 'styles.fill'
        ? ['fills', 'fillStyleId', 'boundVariables']
        : property === 'stroke' || property === 'styles.stroke'
          ? ['strokes', 'strokeStyleId', 'strokeWeight', 'strokeAlign', 'boundVariables']
          : property === 'effects' || property.startsWith('effects.')
            ? ['effects', 'effectStyleId']
            : [];
    if (!fields.length) return true;
    return fields.some((field) => nativeOverrides.has(`${diff.nodeId}|${field}`));
  });
}

export function contractRequiresNativeVisualOverrideEvidence(
  contract: { package?: { family?: string } } | null | undefined,
): boolean {
  return contract?.package?.family === 'CorporateSystemMessage';
}

export function collectExperimentalContractV2StructureKeys(
  structure: readonly DSStructureNode[],
): Set<string> {
  const keys = new Set<string>();
  for (const node of structure) {
    const key = node.componentInstance?.componentKey?.trim();
    if (key) keys.add(key);
  }
  return keys;
}

export async function preloadExperimentalContractV2Structure(
  structure: readonly DSStructureNode[],
  ensureForKeys: (keys: Iterable<string>) => Promise<void> =
    ensureExperimentalContractV2ForKeys,
): Promise<Set<string>> {
  const keys = collectExperimentalContractV2StructureKeys(structure);
  if (keys.size) {
    await ensureForKeys(keys);
  }
  return keys;
}

export function createExperimentalContractV2NestedBaselineDiffs(
  structure: readonly DSStructureNode[],
  dependencies: {
    resolveContract(componentKey: string): ExperimentalContractV2 | null;
    resolveReference(instance: DSStructureNode): DSStructureNode[] | null;
    expandReference(
      reference: DSStructureNode[],
      actual: DSStructureNode[],
    ): DSStructureNode[];
    compare(actual: DSStructureNode[], reference: DSStructureNode[]): DiffEntry[];
  },
): Map<number, DiffEntry[]> {
  const effectiveOnlyDependencies = Object.assign({}, dependencies, {
    compareHostVariant: () => [] as DiffEntry[],
  });
  return createExperimentalContractV2NestedBaselineEvidence(
    structure,
    effectiveOnlyDependencies,
  ).effectiveDiffs;
}

export interface ExperimentalContractV2NestedBaselineEvidence {
  effectiveDiffs: Map<number, DiffEntry[]>;
  hostVariantDiffs: Map<number, DiffEntry[]>;
  completedScopeNodeIds: Set<number>;
}

export function createExperimentalContractV2NestedBaselineEvidence(
  structure: readonly DSStructureNode[],
  dependencies: {
    resolveContract(componentKey: string): ExperimentalContractV2 | null;
    resolveReference(instance: DSStructureNode): DSStructureNode[] | null;
    expandReference(
      reference: DSStructureNode[],
      actual: DSStructureNode[],
    ): DSStructureNode[];
    compare(actual: DSStructureNode[], reference: DSStructureNode[]): DiffEntry[];
    compareHostVariant?(
      actual: DSStructureNode[],
      reference: DSStructureNode[],
    ): DiffEntry[];
    compareComponentStates?(
      actual: DSStructureNode[],
      reference: DSStructureNode[],
      existingDiffs: DiffEntry[],
    ): DiffEntry[];
  },
): ExperimentalContractV2NestedBaselineEvidence {
  const evidence: ExperimentalContractV2NestedBaselineEvidence = {
    effectiveDiffs: new Map<number, DiffEntry[]>(),
    hostVariantDiffs: new Map<number, DiffEntry[]>(),
    completedScopeNodeIds: new Set<number>(),
  };
  if (structure.length < 2) return evidence;
  const nodesById = new Map(structure.map((node) => [node.id, node]));

  for (const instance of structure.slice(1)) {
    if (instance.visible === false) continue;
    const componentKey = instance.componentInstance?.componentKey;
    if (!componentKey || instance.type !== 'INSTANCE') continue;
    const contract = dependencies.resolveContract(componentKey);
    if (!contract) continue;
    if (
      hasAncestorExperimentalContractPackage(
        instance,
        contract.package.id,
        nodesById,
        dependencies.resolveContract,
      )
    ) {
      continue;
    }

    const actualSubtree = collectStructureSubtree(structure, instance.id);
    const scopeWithInheritedOverrides = inheritScopeDirectOverrides(
      instance,
      actualSubtree,
      nodesById,
    );
    const standaloneReference = dependencies.resolveReference(instance);
    if (!standaloneReference?.length) continue;
    const ownedStandaloneReference = markNestedContractReferenceOwnership(
      standaloneReference,
      componentKey,
    );
    const alignedActual = alignStructurePaths(actualSubtree, ownedStandaloneReference);
    const alignedStandaloneReference = alignMaterializedReferenceInstancePaths(
      ownedStandaloneReference,
      alignedActual,
      alignedActual[0]?.path ?? '',
    );
    const hostVariantDiffs = dependencies.compareHostVariant
      ? dependencies.compareHostVariant(alignedActual, alignedStandaloneReference)
      : dependencies.compare(alignedActual, alignedStandaloneReference);
    const hostVariantComponentDiffs = dependencies.compareComponentStates
      ? dependencies.compareComponentStates(
          alignedActual,
          alignedStandaloneReference,
          hostVariantDiffs,
        )
      : [];
    const directHostVariantDiffs = filterDirectNestedHostVariantDiffs(
      scopeWithInheritedOverrides,
      hostVariantDiffs.concat(hostVariantComponentDiffs),
    );
    const expandedReference = dependencies.expandReference(
      alignedStandaloneReference,
      alignedActual,
    );
    const effectiveDiffs = dependencies.compare(alignedActual, expandedReference);
    const effectiveComponentDiffs = dependencies.compareComponentStates
      ? dependencies.compareComponentStates(
          alignedActual,
          expandedReference,
          effectiveDiffs,
        )
      : [];
    const effectiveEvidence = effectiveDiffs.concat(effectiveComponentDiffs);
    evidence.hostVariantDiffs.set(
      instance.id,
      markDirectHostVariantDiffs(
        scopeWithInheritedOverrides,
        hostVariantDiffs.concat(hostVariantComponentDiffs),
      ),
    );
    evidence.effectiveDiffs.set(
      instance.id,
      mergeDirectNestedBaselineEvidence(
        effectiveEvidence,
        directHostVariantDiffs,
      ),
    );
    evidence.completedScopeNodeIds.add(instance.id);
  }

  return evidence;
}

function inheritScopeDirectOverrides(
  scope: DSStructureNode,
  scopeNodes: readonly DSStructureNode[],
  nodesById: ReadonlyMap<number, DSStructureNode>,
): DSStructureNode {
  const scopeNodeIds = new Set(
    scopeNodes
      .map((node) => node.nodeId)
      .filter((nodeId): nodeId is string => Boolean(nodeId)),
  );
  const fieldsByNodeId = new Map<string, Set<string>>();
  let current: DSStructureNode | undefined = scope;
  while (current) {
    for (const override of current.componentInstance?.directOverrides ?? []) {
      if (!scopeNodeIds.has(override.nodeId)) continue;
      const fields = fieldsByNodeId.get(override.nodeId) ?? new Set<string>();
      override.fields.forEach((field) => fields.add(field));
      fieldsByNodeId.set(override.nodeId, fields);
    }
    current = current.parentId === null
      ? undefined
      : nodesById.get(current.parentId);
  }
  if (!fieldsByNodeId.size) return scope;
  return Object.assign({}, scope, {
    componentInstance: Object.assign({}, scope.componentInstance, {
      directOverrides: Array.from(fieldsByNodeId, ([nodeId, fields]) => ({
        nodeId,
        fields: Array.from(fields),
      })),
    }),
  });
}

function mergeDirectNestedBaselineEvidence(
  effectiveDiffs: readonly DiffEntry[],
  directHostVariantDiffs: readonly DiffEntry[],
): DiffEntry[] {
  const merged = new Map<string, DiffEntry>();
  for (const diff of effectiveDiffs.concat(directHostVariantDiffs)) {
    const key = [
      diff.nodeId ?? diff.nodePath,
      diff.details?.property ?? diff.message,
    ].join('|');
    const existing = merged.get(key);
    if (!existing || diff.context?.directHostVariantOverride === true) {
      merged.set(key, diff);
    }
  }
  return Array.from(merged.values());
}

export function markNestedContractBaselineDiff(
  diff: DiffEntry,
): DiffEntry {
  // A text diff against a standalone nested component can either be an
  // intentional host override or a real user change. Contract v2 resolves
  // that ambiguity against the full host baseline, so the evidence must reach
  // the contract engine unchanged. Paint/layout keep using the legacy
  // suppression policy because their allowed host overrides are resolved
  // before contract evaluation.
  return diff.diffKind === 'text-style'
    ? diff
    : markSuppressedDiff(diff, runtimeSuppressionDependencies);
}

export function filterDirectNestedHostVariantDiffs(
  scope: DSStructureNode,
  diffs: readonly DiffEntry[],
): DiffEntry[] {
  return markDirectHostVariantDiffs(scope, diffs).filter(
    (diff) => diff.context?.directHostVariantOverride === true,
  );
}

export function markDirectHostVariantDiffs(
  scope: DSStructureNode,
  diffs: readonly DiffEntry[],
): DiffEntry[] {
  const directOverrides = scope.componentInstance?.directOverrides ?? [];
  if (!directOverrides.length) return Array.from(diffs);
  const fieldsByNodeId = new Map(
    directOverrides.map((override) => [override.nodeId, new Set(override.fields)]),
  );
  return diffs.map((diff) => {
    if (!diff.nodeId) return diff;
    const fields = findDirectOverrideFieldsForDiff(fieldsByNodeId, diff);
    if (!fields || !directOverrideFieldsMatchDiff(fields, diff)) return diff;
    return Object.assign({}, diff, {
      context: Object.assign({}, diff.context, {
        directHostVariantOverride: true,
      }),
    });
  });
}

function findDirectOverrideFieldsForDiff(
  fieldsByNodeId: ReadonlyMap<string, ReadonlySet<string>>,
  diff: DiffEntry,
): ReadonlySet<string> | undefined {
  if (!diff.nodeId) return undefined;
  const exactFields = fieldsByNodeId.get(diff.nodeId);
  if (exactFields) return exactFields;
  if (diff.details?.property !== 'component.identity') return undefined;

  // Figma records an exposed instance-swap property on the instance that owns
  // the property, while the changed component identity belongs to the swapped
  // descendant. Use the nearest such ancestor as direct evidence for identity
  // only; inheriting it for paint/layout would turn the replacement's entire
  // visual tree into false user customizations.
  let nearest: { nodeId: string; fields: ReadonlySet<string> } | null = null;
  for (const [nodeId, fields] of fieldsByNodeId) {
    if (
      !fields.has('componentProperties') ||
      !diff.nodeId.startsWith(`${nodeId};`) ||
      (nearest && nearest.nodeId.length >= nodeId.length)
    ) {
      continue;
    }
    nearest = { nodeId, fields };
  }
  return nearest?.fields;
}

function directOverrideFieldsMatchDiff(
  fields: ReadonlySet<string>,
  diff: DiffEntry,
): boolean {
  const property = diff.details?.property ?? '';
  if (property === 'fill' || property === 'fills' || property === 'styles.fill') {
    return hasAnyOverrideField(fields, ['fills', 'fillStyleId', 'boundVariables']);
  }
  if (property === 'stroke' || property === 'strokes' || property === 'styles.stroke') {
    return hasAnyOverrideField(fields, [
      'strokes',
      'strokeStyleId',
      'strokeWeight',
      'strokeAlign',
      'boundVariables',
    ]);
  }
  if (
    property === 'styles.text' ||
    property === 'style.text' ||
    property === 'textStyle' ||
    property === 'typographyToken'
  ) {
    return hasAnyOverrideField(fields, [
      'textStyleId',
      'fontName',
      'fontSize',
      'fontWeight',
      'lineHeight',
      'letterSpacing',
      'paragraphSpacing',
      'textCase',
      'textDecoration',
      'boundVariables',
    ]);
  }
  if (property === 'text.align.horizontal') {
    return hasAnyOverrideField(fields, ['textAlignHorizontal']);
  }
  if (property === 'text.characters') {
    return hasAnyOverrideField(fields, ['characters', 'componentProperties']);
  }
  if (property.startsWith('variant.') || property === 'component.identity') {
    return hasAnyOverrideField(fields, ['componentProperties', 'mainComponent']);
  }
  if (property.startsWith('layout.padding.')) {
    const side = property.slice('layout.padding.'.length);
    return hasAnyOverrideField(fields, [
      `padding${side.charAt(0).toUpperCase()}${side.slice(1)}`,
      'boundVariables',
    ]);
  }
  if (property === 'layout.itemSpacing') {
    return hasAnyOverrideField(fields, ['itemSpacing', 'boundVariables']);
  }
  if (property === 'layout.sizing.horizontal') {
    return hasAnyOverrideField(fields, [
      'layoutSizingHorizontal',
      'width',
      'minWidth',
      'maxWidth',
    ]);
  }
  if (property === 'layout.sizing.vertical') {
    return hasAnyOverrideField(fields, [
      'layoutSizingVertical',
      'height',
      'minHeight',
      'maxHeight',
    ]);
  }
  if (property === 'opacity') {
    return hasAnyOverrideField(fields, ['opacity', 'boundVariables']);
  }
  if (property === 'effects' || property.startsWith('effects.')) {
    return hasAnyOverrideField(fields, ['effects', 'effectStyleId', 'boundVariables']);
  }
  if (property === 'radius' || property === 'cornerRadius') {
    return hasAnyOverrideField(fields, [
      'cornerRadius',
      'topLeftRadius',
      'topRightRadius',
      'bottomRightRadius',
      'bottomLeftRadius',
      'boundVariables',
    ]);
  }
  const propertyTail = property.split('.').pop();
  return Boolean(propertyTail && fields.has(propertyTail));
}

function hasAnyOverrideField(
  fields: ReadonlySet<string>,
  candidates: readonly string[],
): boolean {
  return candidates.some((candidate) => fields.has(candidate));
}

function markNestedContractReferenceOwnership(
  reference: readonly DSStructureNode[],
  componentKey: string,
): DSStructureNode[] {
  const rootPath = reference[0]?.path ?? '';
  return reference.map((node) => Object.assign({}, node, {
    referenceOrigin: 'nested-component' as const,
    referenceOwnerComponentKey: componentKey,
    referenceOwnerPath: rootPath,
    referenceOwnerRelativePath:
      node.path === rootPath
        ? ''
        : node.path.startsWith(`${rootPath} / `)
          ? node.path.slice(rootPath.length + 3)
          : node.path,
  }));
}

function collectStructureSubtree(
  structure: readonly DSStructureNode[],
  rootId: number,
): DSStructureNode[] {
  const included = new Set<number>([rootId]);
  const result: DSStructureNode[] = [];
  for (const node of structure) {
    if (node.id === rootId || (node.parentId !== null && included.has(node.parentId))) {
      included.add(node.id);
      result.push(node);
    }
  }
  return result;
}

function hasAncestorExperimentalContractPackage(
  node: DSStructureNode,
  packageId: string,
  nodesById: Map<number, DSStructureNode>,
  resolveContract: (componentKey: string) => ExperimentalContractV2 | null,
): boolean {
  let parentId = node.parentId;
  while (parentId !== null) {
    const parent = nodesById.get(parentId);
    if (!parent) break;
    const parentKey = parent.componentInstance?.componentKey;
    if (parentKey && resolveContract(parentKey)?.package.id === packageId) {
      return true;
    }
    parentId = parent.parentId;
  }
  return false;
}

/**
 * Приводит SceneNode к `AuditItem`: ищет компонент в каталогах, делает снапшот,
 * сравнивает структуру и собирает diff-последствия, статус темы и причины кастомизации.
 */
export async function classifyComponentNode(
  node: SceneNode,
  nativeLocalDefinition: ComponentNode | null,
  traversalContext: AuditTraversalContext,
  dependencies: ComponentClassifierDependencies,
): Promise<AuditItem> {
  const {
    buildNodeSegments,
    debugDiffPipeline,
    experimentalContractV2Enabled = false,
    getComponentKeyCached,
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
    checkedComponentNodes: checkedComponentNodesList,
    componentKeyCache,
    evaluatedContractV2Nodes,
    libraryComponentFreshnessChecker,
    localComponentContextCache,
    referenceStructureCache,
  } = traversalContext;
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

    return {
      id: node.id,
      name: node.name,
      nodeType: node.type,
      relevance: 'unknown',
      pageName,
      pathSegments,
      fullPath,
      librarySource: null,
      librarySourceFile: null,
      componentKey,
      // A missing catalog entry does not make a published Figma component local.
      // Locality comes from the native main component and its `remote` flag.
      isLocal: isNativeLocalComponent(nativeLocalDefinition),
      comparisonIssues: [],
      diffs: []
    }
  }

  const libraryFreshness =
    node.type === 'INSTANCE'
      ? await libraryComponentFreshnessChecker.check(
          node as InstanceNode,
          getLibraryComponentFreshnessScope(node),
        )
      : null;
  throwIfCancelled();

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
  const instanceHasOverrides =
    node.type === 'INSTANCE' && hasInstanceOverrides(node as InstanceNode);
  const requiresSizingRuleAudit = hasRequiredComponentSizingRules(
    componentKey,
    [ref?.name, ref?.displayName, node.name],
  );
  const requiresExperimentalContractV2Audit =
    experimentalContractV2Enabled && hasExperimentalContractV2ForKey(componentKey);
  const needsDiff = shouldMaterializeComponentDiff({
    hasReferenceStructure: Boolean(referenceStructure),
    alreadyMaterialized: checkedComponentNodesList.has(node.id),
    requiresExperimentalContractV2Audit,
    contractV2ScopeCovered: evaluatedContractV2Nodes.has(node.id),
  });
  const requiresNumericConstraintAudit = hasNumericConstraintRules(
    componentKey,
    [ref?.name, ref?.displayName, node.name],
  );
  const requiresVariableModeRuleAudit = hasVariableModeRules(
    componentKey,
    [ref?.name, ref?.displayName, node.name],
  );
  const requiresCompositionContractAudit = hasMatchingCompositionContract({
    hostComponentKey: ref?.key ?? componentKey ?? null,
    hostComponentName: ref?.displayName ?? ref?.name ?? ref?.names?.[0] ?? node.name,
  });
  const requiresComponentApiAudit = !experimentalContractV2Enabled && Boolean(
    getComponentApiContractByFigmaKey(componentKey),
  );
  const isInheritedFromLocalComponentContext =
    node.type === 'INSTANCE' &&
    (await isInsideLocalComponentContext(node, componentKeyCache, localComponentContextCache));
  const shouldDiff = shouldRunComponentDiff({
    forcedCategory: Boolean(forcedCategory),
    needsDiff,
    instanceHasOverrides: ref?.status !== 'current' || instanceHasOverrides,
    requiresSizingRuleAudit,
    requiresNumericConstraintAudit,
    requiresVariableModeRuleAudit,
    requiresCompositionContractAudit,
    requiresComponentApiAudit:
      requiresComponentApiAudit || requiresExperimentalContractV2Audit,
    isInheritedFromLocalComponentContext,
  });
  const actualStructure =
    shouldDiff && referenceStructure
      ? await snapshotTree(node, checkedComponentNodesList, {
          // Contract v2 composition rules may own hidden slots (for example
          // CardSwiperMobile previous/next). Keep those nodes in the structural
          // snapshot while preserving visible=false so presentation filters and
          // nested-scope evaluation can still ignore hidden customizations.
          includeHidden: experimentalContractV2Enabled,
        })
      : null;
  throwIfCancelled();
  const alignedActualStructure =
    referenceStructure && actualStructure
      ? alignStructurePaths(actualStructure, referenceStructure)
      : actualStructure;
  if (experimentalContractV2Enabled && alignedActualStructure) {
    const structureContractKeys = await preloadExperimentalContractV2Structure(
      alignedActualStructure,
    );
    // Actual nested replacements can live in a catalog that was not needed by
    // the host reference itself. Load those component families before path and
    // identity alignment; loading one icon catalog also rehydrates the sibling
    // reference icon key used by the selected host variant.
    await ensureReferenceCatalogsForKeys(structureContractKeys);
    console.log('[Apollo][contracts-v2] materialized subtree ready', {
      hostComponentKey: componentKey,
      componentKeyCount: structureContractKeys.size,
    });
    throwIfCancelled();
  }
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
          resolveTokenLabel: resolveTokenLabel,
          resolveStyleLabel: resolveStyleLabelForDiff,
          isPaintToken: isPaintToken,
          resolveVariableMetadata: resolveVariableMetadata,
        })
      : { diffs: [], issues: [] };
  if (diffResult.issues.length) {
    comparisonIssues.push(...diffResult.issues);
  }

  const requiredSizingDiffs =
    shouldDiff && alignedActualStructure
      ? createRequiredComponentSizingDiffs(
          alignedActualStructure,
          diffResult.diffs,
        )
      : [];
  const numericConstraintDiffs =
    shouldDiff && alignedActualStructure
      ? createNumericConstraintRuleDiffs(
          alignedActualStructure,
          diffResult.diffs.concat(requiredSizingDiffs),
        )
      : [];
  const requiredPaintStateDiffs =
    shouldDiff && alignedActualStructure
      ? createRequiredPaintStateDiffs(
          alignedActualStructure,
          diffResult.diffs
            .concat(requiredSizingDiffs)
            .concat(numericConstraintDiffs),
          resolveTokenLabel,
        )
      : [];
  const componentApiDiffs =
    shouldDiff && alignedActualStructure
      ? createComponentApiVariantDiffs(
          alignedActualStructure,
          getComponentApiContractByFigmaKey,
          diffResult.diffs
            .concat(requiredSizingDiffs)
            .concat(numericConstraintDiffs)
            .concat(requiredPaintStateDiffs),
        )
      : [];
  const variableModeRuleDiffs =
    shouldDiff && alignedActualStructure
      ? createVariableModeRuleDiffs(
          alignedActualStructure,
          diffResult.diffs
            .concat(requiredSizingDiffs)
            .concat(numericConstraintDiffs)
            .concat(requiredPaintStateDiffs)
            .concat(componentApiDiffs),
          resolveVariableCollectionMetadata,
        )
      : [];
  const surfaceContext = resolveSurfaceContext(
    node,
    resolveTokenLabel,
  );
  const rawDiffs = diffResult.diffs
    .concat(requiredSizingDiffs)
    .concat(numericConstraintDiffs)
    .concat(requiredPaintStateDiffs)
    .concat(componentApiDiffs)
    .concat(variableModeRuleDiffs)
    .map((diff) => attachSurfaceContext(diff, surfaceContext))
    .map(applyRequiredComponentSizingAssessment)
    .map(applyVariableBindingAssessment);
  const nestedContractBaselineEvidence =
    experimentalContractV2Enabled && alignedActualStructure
      ? createExperimentalContractV2NestedBaselineEvidence(
          alignedActualStructure,
          {
            resolveContract: getExperimentalContractV2ForKey,
            resolveReference: (instance) => {
              const nestedReference = findComponent(
                instance.componentInstance?.componentKey ?? '',
              );
              return resolveStructureForInstance(
                nestedReference,
                instance.componentInstance ?? null,
              );
            },
            expandReference: (nestedReference, nestedActual) =>
              expandReferenceWithInstanceComponents(
                nestedReference,
                nestedActual,
              ),
            compare: (nestedActual, nestedReference) =>
              diffStructures(nestedActual, nestedReference, {
                strict: STRICT_COMPARISON,
                resolveTokenLabel,
                resolveStyleLabel: resolveStyleLabelForDiff,
                isPaintToken,
                resolveVariableMetadata,
              }).diffs
                .map((diff) => attachSurfaceContext(diff, surfaceContext))
                .map(applyRequiredComponentSizingAssessment)
                .map(applyVariableBindingAssessment),
            compareComponentStates: (
              nestedActual,
              nestedReference,
              existingDiffs,
            ) => diffExplicitNestedVariantStates(
              nestedActual,
              nestedReference,
              existingDiffs,
              {
                resolveComponentFamilyKey: (nestedComponentKey) =>
                  findComponent(nestedComponentKey)?.key ??
                  resolveExperimentalContractV2ComponentFamilyKey(nestedComponentKey) ??
                  nestedComponentKey,
                resolveReferenceComponentKey: (referenceNode) =>
                  referenceNode.componentInstance?.componentKey ||
                  (findComponentVariantKeyByName(
                      referenceNode.name,
                      referenceNode.componentInstance?.variantProperties,
                    ) ??
                    findComponentByName(referenceNode.name)?.key ??
                    null),
              },
            )
              .map((diff) => attachSurfaceContext(diff, surfaceContext))
              .map(applyRequiredComponentSizingAssessment)
              .map(applyVariableBindingAssessment),
          },
        )
      : {
          effectiveDiffs: new Map<number, DiffEntry[]>(),
          hostVariantDiffs: new Map<number, DiffEntry[]>(),
          completedScopeNodeIds: new Set<number>(),
        };
  const nestedDirectHostVariantDiffs = new Map<number, DiffEntry[]>();
  if (alignedActualStructure) {
    const actualNodesById = new Map(
      alignedActualStructure.map((structureNode) => [structureNode.id, structureNode]),
    );
    for (const [scopeNodeId, scopeDiffs] of nestedContractBaselineEvidence.hostVariantDiffs) {
      const scopeNode = actualNodesById.get(scopeNodeId);
      if (!scopeNode) continue;
      nestedDirectHostVariantDiffs.set(
        scopeNodeId,
        filterDirectNestedHostVariantDiffs(scopeNode, scopeDiffs),
      );
    }
  }
  const sharedValueAssessedDiffs = alignedActualStructure
    ? applySharedValueComponentRuleAssessments(rawDiffs, alignedActualStructure)
    : rawDiffs;
  const markedDiffs = sharedValueAssessedDiffs
    .map((diff) => markSuppressedDiff(diff, runtimeSuppressionDependencies))
    .map(applyStructuredComponentRuleAssessment);
  const explicitVariantStateDiffs =
    shouldDiff && referenceStructure && alignedActualStructure
      ? diffExplicitNestedVariantStates(
          alignedActualStructure,
          referenceStructure,
          markedDiffs,
          {
            resolveComponentFamilyKey: (nestedComponentKey) =>
              findComponent(nestedComponentKey)?.key ??
              resolveExperimentalContractV2ComponentFamilyKey(nestedComponentKey) ??
              nestedComponentKey,
            resolveReferenceComponentKey: (referenceNode) =>
              referenceNode.componentInstance?.componentKey ||
              (findComponentVariantKeyByName(
                  referenceNode.name,
                  referenceNode.componentInstance?.variantProperties,
                ) ??
                findComponentByName(referenceNode.name)?.key ??
                null),
          },
        )
          .map((diff) => attachSurfaceContext(diff, surfaceContext))
          .map((diff) => markSuppressedDiff(diff, runtimeSuppressionDependencies))
      : [];
  const diffsForAssessment = markedDiffs.concat(explicitVariantStateDiffs);
  const compositionContractResult =
    shouldDiff && alignedActualStructure && referenceStructure
      ? applyCompositionContracts(diffsForAssessment, {
          actualStructure: alignedActualStructure,
          hostReference: referenceStructure,
          hostComponentKey: ref?.key ?? componentKey ?? null,
          hostComponentName:
            ref?.displayName ?? ref?.name ?? ref?.names?.[0] ?? node.name,
          resolveComponent: findComponent,
        })
      : {
          diffs: diffsForAssessment,
          matchedContractIds: [] as string[],
          decisionCount: 0,
        };
  if (compositionContractResult.matchedContractIds.length) {
    traceAudit('composition-contracts', {
      nodeId: node.id,
      nodeName: node.name,
      matchedContracts: compositionContractResult.matchedContractIds,
      decisionCount: compositionContractResult.decisionCount,
    });
  }
  const hostReferenceForDiff =
    referenceStructure && alignedActualStructure
      ? alignMaterializedReferenceInstancePaths(
          referenceStructure,
          alignedActualStructure,
          alignedActualStructure[0]?.path ?? '',
        )
      : referenceStructure;
  const hostDiffs =
    shouldDiff && hostReferenceForDiff && alignedActualStructure
      ? diffStructures(alignedActualStructure, hostReferenceForDiff, {
          strict: STRICT_COMPARISON,
          resolveTokenLabel: resolveTokenLabel,
          resolveStyleLabel: resolveStyleLabelForDiff,
          isPaintToken: isPaintToken,
          resolveVariableMetadata: resolveVariableMetadata,
        }).diffs
      : [];
  const markedHostVariantDiffs = alignedActualStructure?.[0]
    ? markDirectHostVariantDiffs(alignedActualStructure[0], hostDiffs)
    : hostDiffs;
  const assessedDiffs = assessCustomizationDiffs(compositionContractResult.diffs, {
    hostDiffs: markedHostVariantDiffs,
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
          compositionContractResult.diffs,
          (nestedComponentKey) =>
            findComponent(nestedComponentKey)?.key ?? nestedComponentKey,
          {
            resolveTokenLabel: resolveTokenLabel,
            resolveStyleLabel: resolveStyleLabelForDiff,
            isPaintToken: isPaintToken,
            resolveVariableMetadata: resolveVariableMetadata,
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
  }).map(applyContextualComponentRuleAssessment);
  const assessedContractBaselineDiffs = collapsePatternViolationDiffs(
    collapseVisualDiffsUnderVariantChanges(
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
      alignedActualStructure ?? [],
    ),
    alignedActualStructure ?? [],
  );
  const mergedContractBaselineDiffs = mergeContractBaselineEvidence(
    assessedContractBaselineDiffs,
    diffsForAssessment,
    alignedActualStructure?.[0]?.nodeId,
  );
  // A component contract may intentionally revive visual evidence that a
  // legacy pattern marks as derived. Preserve the native Figma override proof
  // on that evidence so the contract can distinguish a direct user edit from
  // a visual consequence of a parent variant change.
  const contractBaselineDiffs = alignedActualStructure?.[0]
    ? markDirectHostVariantDiffs(
        alignedActualStructure[0],
        mergedContractBaselineDiffs,
      )
    : mergedContractBaselineDiffs;
  const experimentalHostContract = experimentalContractV2Enabled
    ? getExperimentalContractV2ForKey(componentKey)
    : null;
  const actionableContractBaselineDiffs =
    alignedActualStructure?.[0] &&
    contractRequiresNativeVisualOverrideEvidence(experimentalHostContract)
      ? filterUndocumentedNestedVisualDiffs(
          alignedActualStructure[0],
          contractBaselineDiffs,
        )
      : contractBaselineDiffs;
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
  const contractAwareResult = applyContractAwareDiffs(allowlistedDiffs, {
    enabled: APOLLO_CONTRACT_AWARE_AUDIT_ENABLED,
    hostComponentKey: ref?.key ?? componentKey ?? null,
    hostComponentName: ref?.displayName ?? ref?.name ?? node.name,
    actualStructure: alignedActualStructure ?? [],
    hostReference: referenceStructure ?? [],
    resolveStyleLabel: resolveStyleLabelForDiff,
    resolveTokenLabel,
  });
  if (contractAwareResult.applied) {
    console.log('[Apollo][contracts] applied composition contract', {
      componentName: ref?.displayName ?? ref?.name ?? node.name,
      matchedContracts: contractAwareResult.matchedContractKeys,
      suppressedCount: contractAwareResult.suppressedCount,
      rebasedCount: contractAwareResult.rebasedCount,
    });
    traceAudit('contract-aware-diffs', {
      nodeId: node.id,
      nodeName: node.name,
      componentKey: ref?.key ?? componentKey ?? null,
      matchedContracts: contractAwareResult.matchedContractKeys,
      suppressedCount: contractAwareResult.suppressedCount,
      rebasedCount: contractAwareResult.rebasedCount,
    });
  }
  const legacyDiffs = applyCustomizationFilters(contractAwareResult.diffs, {
    libraryName: ref?.source ?? null,
    componentName: ref?.displayName ?? ref?.name ?? node.name,
  });
  const experimentalResult =
    experimentalContractV2Enabled && alignedActualStructure
      ? evaluateExperimentalContractV2Tree({
          hostComponentKey: componentKey ?? ref?.key ?? '',
          hostComponentName:
            ref?.displayName ?? ref?.name ?? ref?.names?.[0] ?? node.name,
          hostVariantProperties: instanceVariantProperties ?? {},
          actualStructure: alignedActualStructure,
          // Exact component contracts must evaluate evidence before legacy
          // allowlists and Expected/Allowed presentation filters remove it.
          effectiveBaselineDiffs: actionableContractBaselineDiffs,
          // Nested contracts reuse the fully materialized host reference. It
          // already contains parent-variant overrides and expands components
          // injected through slots from their own selected variant. The tree
          // evaluator scopes this evidence by node id.
          rawBaselineDiffs: rawDiffs,
          // Nested components must evaluate their own expanded standalone
          // baseline. Falling back to parent-host diffs loses direct paint
          // overrides on deep CardImage leaves such as Image Container,
          // State/icon and overlay.
          nestedScopeBaselineDiffs:
            nestedContractBaselineEvidence.effectiveDiffs,
          nestedScopeHostVariantBaselineDiffs: nestedDirectHostVariantDiffs,
          completedNestedScopeNodeIds:
            nestedContractBaselineEvidence.completedScopeNodeIds,
          // `host-variant` is intentionally pre-expansion. For StatusPreset it
          // preserves the Type-authored Label color instead of replacing it
          // with the generic nested Status baseline.
          hostVariantBaselineDiffs: markedHostVariantDiffs,
          resolveTokenLabel,
          resolveVariableCollectionMetadata,
          resolveComponentFamilyKey: (nestedComponentKey) =>
            findComponent(nestedComponentKey)?.key ??
            resolveExperimentalContractV2ComponentFamilyKey(nestedComponentKey) ??
            nestedComponentKey,
          resolveContract: getExperimentalContractV2ForKey,
        })
      : null;
  debugCardSwiperNestedContractEvidence({
    hostComponentName:
      ref?.displayName ?? ref?.name ?? ref?.names?.[0] ?? node.name,
    actualStructure: alignedActualStructure ?? [],
    evidence: nestedContractBaselineEvidence,
    directHostVariantDiffs: nestedDirectHostVariantDiffs,
    finalDiffs: experimentalResult?.diffs ?? [],
  });
  debugTitleViewStatusPresetEvidence({
    hostComponentName:
      ref?.displayName ?? ref?.name ?? ref?.names?.[0] ?? node.name,
    actualStructure: alignedActualStructure ?? [],
    evidence: nestedContractBaselineEvidence,
    directHostVariantDiffs: nestedDirectHostVariantDiffs,
    finalDiffs: experimentalResult?.diffs ?? [],
  });
  debugCorporateSystemMessageBaselineEvidence({
    hostComponentName:
      ref?.displayName ?? ref?.name ?? ref?.names?.[0] ?? node.name,
    actualStructure: alignedActualStructure ?? [],
    rawDiffs,
    contractBaselineDiffs: actionableContractBaselineDiffs,
    finalDiffs: experimentalResult?.diffs ?? [],
  });
  debugBenefitCardBaselineEvidence({
    hostComponentName:
      ref?.displayName ?? ref?.name ?? ref?.names?.[0] ?? node.name,
    actualStructure: alignedActualStructure ?? [],
    rawDiffs,
    contractBaselineDiffs: actionableContractBaselineDiffs,
    finalDiffs: experimentalResult?.diffs ?? [],
  });
  const diffs = experimentalContractV2Enabled
    ? experimentalResult?.diffs ?? []
    : legacyDiffs;
  if (experimentalContractV2Enabled && experimentalResult) {
    for (const nodeId of experimentalResult.coveredNodeIds) {
      evaluatedContractV2Nodes.add(nodeId);
    }
  }
  if (experimentalContractV2Enabled) {
    console.log('[Apollo][contracts-v2] component evaluated', {
      componentKey,
      componentName: ref?.displayName ?? ref?.name ?? node.name,
      packageIds: experimentalResult?.scopes.map((scope) => scope.packageId) ?? [],
      scopeCount: experimentalResult?.scopes.length ?? 0,
      diagnostics: experimentalResult?.diagnostics ?? {
        evaluated: 0,
        violations: 0,
        passed: 0,
        unknown: 0,
        classificationSkipped: 0,
        unsupportedRuleIds: [],
      },
      completedNestedScopeCount:
        nestedContractBaselineEvidence.completedScopeNodeIds.size,
      legacyDecisionCountDiscarded: legacyDiffs.length,
    });
  }
  debugDiffPipeline({
    rootNode: node,
    componentName: ref?.displayName ?? ref?.name ?? node.name,
    alignedActualStructure,
    expandedReferenceStructure,
    rawDiffs,
    contractBaselineDiffs,
    explicitVariantStateDiffs,
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
    rawDiffs: rawDiffs.length,
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

  const catalogRelevance = normalizeRelevanceStatus(ref.status);
  const updateReasons: UpdateReason[] = [];
  if (catalogRelevance === 'update') {
    updateReasons.push('catalog-lifecycle');
  }
  if (libraryFreshness?.status === 'update-available') {
    updateReasons.push('library-update-available');
  }
  const relevance =
    forcedCategory ??
    (libraryFreshness?.status === 'update-available'
      ? 'update'
      : catalogRelevance);

  if (libraryFreshness && libraryFreshness.status !== 'not-applicable') {
    traceAudit('library-component-freshness', {
      nodeId: node.id,
      nodeName: node.name,
      componentKey,
      status: libraryFreshness.status,
      reason: libraryFreshness.reason,
      currentComponentId: libraryFreshness.currentComponentId,
      latestComponentId: libraryFreshness.latestComponentId,
      categoryDecision: relevance,
    });
  }

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
    isLocal: isNativeLocalComponent(nativeLocalDefinition),
    reference: ref,
    componentKey,
    diffs,
    comparisonIssues,
    updateReasons,
    libraryFreshness,
    forcedCategory,
    forcedCategoryReason,
    resolvedReferenceVariantKey,
    resolvedReferenceVariantName,
  };
}

function debugCardSwiperNestedContractEvidence(input: {
  hostComponentName: string;
  actualStructure: readonly DSStructureNode[];
  evidence: ExperimentalContractV2NestedBaselineEvidence;
  directHostVariantDiffs: ReadonlyMap<number, DiffEntry[]>;
  finalDiffs: readonly DiffEntry[];
}): void {
  if (!input.hostComponentName.includes('CardSwiperMobile')) return;
  const relevantFields = new Set([
    'fills',
    'fillStyleId',
    'effects',
    'effectStyleId',
    'componentProperties',
    'mainComponent',
  ]);
  const records: Array<Record<string, unknown>> = [];
  for (const scope of input.actualStructure) {
    if (scope.name !== 'CardImage' || scope.type !== 'INSTANCE') continue;
    const overrides = (scope.componentInstance?.directOverrides ?? []).filter(
      (override) => override.fields.some((field) => relevantFields.has(field)),
    );
    if (!overrides.length) continue;
    records.push({
      scopeId: scope.id,
      scopeNodeId: scope.nodeId ?? null,
      scopePath: scope.path,
      scopeVisible: scope.visible !== false,
      componentKey: scope.componentInstance?.componentKey ?? null,
      overrides,
      effectiveDiffs: describeProbeDiffs(
        input.evidence.effectiveDiffs.get(scope.id) ?? [],
      ),
      hostVariantDiffs: describeProbeDiffs(
        input.evidence.hostVariantDiffs.get(scope.id) ?? [],
      ),
      directHostVariantDiffs: describeProbeDiffs(
        input.directHostVariantDiffs.get(scope.id) ?? [],
      ),
      finalDiffs: describeProbeDiffs(
        input.finalDiffs.filter((diff) => isDiffInsideScope(diff, scope)),
      ),
      completed: input.evidence.completedScopeNodeIds.has(scope.id),
    });
  }
  if (!records.length) return;
  console.log(`[Apollo][probe] card-swiper-nested-contract ${JSON.stringify({
    hostComponentName: input.hostComponentName,
    records,
    allFinalDiffs: describeProbeDiffs(input.finalDiffs),
  })}`);
}

function debugTitleViewStatusPresetEvidence(input: {
  hostComponentName: string;
  actualStructure: readonly DSStructureNode[];
  evidence: ExperimentalContractV2NestedBaselineEvidence;
  directHostVariantDiffs: ReadonlyMap<number, DiffEntry[]>;
  finalDiffs: readonly DiffEntry[];
}): void {
  if (!input.hostComponentName.includes('TitleView')) return;
  const relevantFields = new Set([
    'fills',
    'fillStyleId',
    'boundVariables',
  ]);
  const nodesById = new Map(
    input.actualStructure.map((structureNode) => [structureNode.id, structureNode]),
  );
  const records: Array<Record<string, unknown>> = [];
  for (const scope of input.actualStructure) {
    if (scope.name !== 'StatusPreset' || scope.type !== 'INSTANCE') continue;
    const scopeNodeIds = new Set(
      collectStructureSubtree(input.actualStructure, scope.id)
        .map((structureNode) => structureNode.nodeId)
        .filter((nodeId): nodeId is string => Boolean(nodeId)),
    );
    const overrideOwners: Array<Record<string, unknown>> = [];
    let current: DSStructureNode | undefined = scope;
    while (current) {
      const overrides = (current.componentInstance?.directOverrides ?? []).filter(
        (override) =>
          scopeNodeIds.has(override.nodeId) &&
          override.fields.some((field) => relevantFields.has(field)),
      );
      if (overrides.length) {
        overrideOwners.push({
          ownerId: current.id,
          ownerNodeId: current.nodeId ?? null,
          ownerName: current.name,
          ownerPath: current.path,
          overrides,
        });
      }
      current = current.parentId === null
        ? undefined
        : nodesById.get(current.parentId);
    }
    records.push({
      scopeId: scope.id,
      scopeNodeId: scope.nodeId ?? null,
      scopePath: scope.path,
      componentKey: scope.componentInstance?.componentKey ?? null,
      variantProperties: scope.componentInstance?.variantProperties ?? null,
      overrideOwners,
      effectiveDiffs: describeProbeDiffs(
        input.evidence.effectiveDiffs.get(scope.id) ?? [],
      ),
      hostVariantDiffs: describeProbeDiffs(
        input.evidence.hostVariantDiffs.get(scope.id) ?? [],
      ),
      directHostVariantDiffs: describeProbeDiffs(
        input.directHostVariantDiffs.get(scope.id) ?? [],
      ),
      finalDiffs: describeProbeDiffs(
        input.finalDiffs.filter((diff) => isDiffInsideScope(diff, scope)),
      ),
      completed: input.evidence.completedScopeNodeIds.has(scope.id),
    });
  }
  if (!records.length) return;
  console.log(`[Apollo][probe] title-view-status-preset ${JSON.stringify({
    hostComponentName: input.hostComponentName,
    records,
  })}`);
}

function debugCorporateSystemMessageBaselineEvidence(input: {
  hostComponentName: string;
  actualStructure: readonly DSStructureNode[];
  rawDiffs: readonly DiffEntry[];
  contractBaselineDiffs: readonly DiffEntry[];
  finalDiffs: readonly DiffEntry[];
}): void {
  if (!input.hostComponentName.includes('CorporateSystemMessage')) return;
  const relevantFields = new Set([
    'itemSpacing',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'textStyleId',
    'textAlignHorizontal',
    'fills',
    'fillStyleId',
    'strokes',
    'strokeStyleId',
    'cornerRadius',
    'topLeftRadius',
    'topRightRadius',
    'bottomLeftRadius',
    'bottomRightRadius',
    'opacity',
    'effects',
    'effectStyleId',
    'layoutSizingHorizontal',
    'layoutSizingVertical',
    'componentProperties',
    'mainComponent',
  ]);
  const overrideOwners = input.actualStructure
    .filter((structureNode) => structureNode.componentInstance?.directOverrides?.some(
      (override) => override.fields.some((field) => relevantFields.has(field)),
    ))
    .map((structureNode) => ({
      ownerNodeId: structureNode.nodeId ?? null,
      ownerName: structureNode.name,
      ownerPath: structureNode.path,
      overrides: (structureNode.componentInstance?.directOverrides ?? [])
        .filter((override) => override.fields.some((field) => relevantFields.has(field))),
    }));
  if (!overrideOwners.length && !input.rawDiffs.length && !input.finalDiffs.length) return;
  console.log(`[Apollo][probe] corporate-system-message-baseline ${JSON.stringify({
    hostComponentName: input.hostComponentName,
    overrideOwners,
    rawDiffs: describeProbeDiffs(input.rawDiffs),
    contractBaselineDiffs: describeProbeDiffs(input.contractBaselineDiffs),
    finalDiffs: describeProbeDiffs(input.finalDiffs),
  })}`);
}

function debugBenefitCardBaselineEvidence(input: {
  hostComponentName: string;
  actualStructure: readonly DSStructureNode[];
  rawDiffs: readonly DiffEntry[];
  contractBaselineDiffs: readonly DiffEntry[];
  finalDiffs: readonly DiffEntry[];
}): void {
  if (!input.hostComponentName.includes('BenefitCard')) return;
  const relevantNames = new Set([
    'ContentWrapper',
    'Content',
    'Title',
    'Subtitle',
    'value',
    'BackgroundPlate',
  ]);
  const relevantFields = new Set([
    'itemSpacing',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'textStyleId',
    'textAlignHorizontal',
    'fills',
    'fillStyleId',
    'strokes',
    'strokeStyleId',
    'cornerRadius',
    'topLeftRadius',
    'topRightRadius',
    'bottomLeftRadius',
    'bottomRightRadius',
    'opacity',
    'effects',
    'effectStyleId',
    'layoutSizingHorizontal',
    'layoutSizingVertical',
  ]);
  const relevantNodes = input.actualStructure
    .filter((structureNode) => relevantNames.has(structureNode.name))
    .map((structureNode) => ({
      nodeId: structureNode.nodeId ?? null,
      name: structureNode.name,
      path: structureNode.path,
      visible: structureNode.visible !== false,
      directOverrides: (structureNode.componentInstance?.directOverrides ?? [])
        .filter((override) => override.fields.some((field) => relevantFields.has(field))),
    }));
  const relevantNodeIds = new Set(
    relevantNodes.map((entry) => entry.nodeId).filter(Boolean),
  );
  const relevantDiffs = (diffs: readonly DiffEntry[]) => describeProbeDiffs(
    diffs.filter((diff) =>
      relevantNodeIds.has(diff.nodeId ?? null) ||
      [...relevantNames].some((name) => diff.nodePath.split(' / ').includes(name)),
    ),
  );
  if (!relevantNodes.length && !input.rawDiffs.length && !input.finalDiffs.length) return;
  console.log(`[Apollo][probe] benefit-card-baseline ${JSON.stringify({
    hostComponentName: input.hostComponentName,
    relevantNodes,
    rawDiffs: relevantDiffs(input.rawDiffs),
    contractBaselineDiffs: relevantDiffs(input.contractBaselineDiffs),
    finalDiffs: relevantDiffs(input.finalDiffs),
  })}`);
}

function describeProbeDiffs(diffs: readonly DiffEntry[]): Array<Record<string, unknown>> {
  return diffs.map((diff) => ({
    nodeId: diff.nodeId ?? null,
    nodePath: diff.nodePath,
    nodeName: diff.nodeName,
    property: diff.details?.property ?? null,
    reference: diff.details?.reference.value ?? null,
    actual: diff.details?.actual.value ?? null,
    presentation: diff.assessment?.presentation ?? null,
    directHostVariantOverride:
      diff.context.directHostVariantOverride === true,
    referenceOrigin: diff.context.referenceOrigin,
  }));
}

function isDiffInsideScope(diff: DiffEntry, scope: DSStructureNode): boolean {
  if (
    diff.nodeId &&
    scope.nodeId &&
    (diff.nodeId === scope.nodeId || diff.nodeId.startsWith(`${scope.nodeId};`))
  ) {
    return true;
  }
  return diff.nodePath === scope.path ||
    diff.nodePath.startsWith(`${scope.path} / `);
}

export function resolveHostReferenceForContractDiff(
  referenceStructure: DSStructureNode[] | null,
  expandedReferenceStructure: DSStructureNode[] | null,
  actualStructure: DSStructureNode[] | null,
): DSStructureNode[] | null {
  const effectiveReference = expandedReferenceStructure ?? referenceStructure;
  if (!effectiveReference || !actualStructure) return effectiveReference;
  return alignMaterializedReferenceInstancePaths(
    effectiveReference,
    actualStructure,
    actualStructure[0]?.path ?? '',
  );
}
