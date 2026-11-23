import { getComponentLifecycle, componentRelevance } from '../component-lifecycle';
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
} from '../rules/contractAwareDiffs';
import {
  applyCompositionContracts,
  hasMatchingCompositionContract,
} from '../rules/compositionContractEngine';
import {
  applyContextualComponentRuleAssessment,
  applyRequiredComponentSizingAssessment,
  applySharedValueComponentRuleAssessments,
  applyStructuredComponentRuleAssessment,
  applyVariableBindingAssessment,
  finalizeComponentRuleAssessment,
  createNumericConstraintRuleDiffs,
  createRequiredPaintStateDiffs,
  createRequiredComponentSizingDiffs,
  createVariableModeRuleDiffs,
  hasNumericConstraintRules,
  hasRequiredComponentSizingRules,
  hasVariableModeRules,
  type VariableCollectionMetadata,
} from '../rules/componentRules';
import { createComponentApiVariantDiffs } from '../rules/componentApiContracts';
import { assertAuditPolicyCoverage, getComponentApiContractByFigmaKey } from '../rules/runtimeContractRegistry';
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
    explicitVariantStateDiffs: DiffList;
    markedDiffs: DiffList;
    allowlistedDiffs: DiffList;
    finalDiffs: DiffList;
  }): void;
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
}): boolean {
  return options.hasReferenceStructure && !options.alreadyMaterialized;
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

function markDirectStructureVariantDiffs(
  structure: readonly DSStructureNode[],
  diffs: readonly DiffEntry[],
): DiffEntry[] {
  const fieldsByNodeId = new Map<string, Set<string>>();
  for (const node of structure) {
    for (const override of node.componentInstance?.directOverrides ?? []) {
      const fields = fieldsByNodeId.get(override.nodeId) ?? new Set<string>();
      for (const field of override.fields) fields.add(field);
      fieldsByNodeId.set(override.nodeId, fields);
    }
  }
  if (!fieldsByNodeId.size) return Array.from(diffs);

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
  if (property === 'text.case') {
    return hasAnyOverrideField(fields, ['textCase']);
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

function toBaselineDiffFact(diff: DiffEntry): DiffEntry {
  const fact = Object.assign({}, diff);
  delete fact.assessment;
  delete fact.suppressAsHostControlledNestedProperty;
  delete fact.suppressionReason;
  delete fact.contractEvidenceOnly;
  return fact;
}

function hasSameBaselineAndActualValue(diff: DiffEntry): boolean {
  const referenceValue = diff.details?.reference.value;
  const actualValue = diff.details?.actual.value;
  if (referenceValue === actualValue) return true;
  if (referenceValue === null || actualValue === null) return false;
  return String(referenceValue) === String(actualValue);
}

function isComponentSelectionDiff(diff: DiffEntry): boolean {
  const property = diff.details?.property ?? '';
  return property === 'component.identity' || property.startsWith('variant.');
}

function isEffectivelyVisible(
  diff: DiffEntry,
  actualStructure: readonly DSStructureNode[],
): boolean {
  if (diff.visible === false) return false;
  if (!diff.nodeId) return true;

  const byNodeId = new Map(
    actualStructure
      .filter((node) => Boolean(node.nodeId))
      .map((node) => [node.nodeId!, node]),
  );
  const byId = new Map(actualStructure.map((node) => [node.id, node]));
  let current = byNodeId.get(diff.nodeId);
  while (current) {
    if (current.visible === false) return false;
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return true;
}

function isInsideChangedComponentSelection(
  diff: DiffEntry,
  actualStructure: readonly DSStructureNode[],
  changedSelectionNodeIds: ReadonlySet<string>,
): boolean {
  if (!diff.nodeId || !changedSelectionNodeIds.size) return false;
  const byNodeId = new Map(
    actualStructure
      .filter((node) => Boolean(node.nodeId))
      .map((node) => [node.nodeId!, node]),
  );
  const byId = new Map(actualStructure.map((node) => [node.id, node]));
  let current = byNodeId.get(diff.nodeId);
  while (current) {
    if (current.nodeId && changedSelectionNodeIds.has(current.nodeId)) return true;
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return false;
}

/**
 * Builds the uninterpreted customization facts consumed by the WIP report.
 *
 * The comparison deliberately uses the authored host variant instead of the
 * recursively expanded standalone reference. Figma's native override records
 * distinguish a direct user mutation from visual values derived from a public
 * component-property change. This is evidence normalization, not a policy
 * decision: allowed and forbidden direct mutations remain indistinguishable
 * here and are classified later.
 */
export function buildBaselineCustomizationFacts(
  host: DSStructureNode | null,
  actualStructure: readonly DSStructureNode[],
  hostDiffs: readonly DiffEntry[],
  explicitVariantStateDiffs: readonly DiffEntry[],
  isExplainedBySelectedVariant: (diff: DiffEntry) => boolean = () => false,
  expandedNestedDiffs: readonly DiffEntry[] = [],
): DiffEntry[] {
  if (!host) return [];

  const candidates = markDirectStructureVariantDiffs(
    actualStructure,
    Array.from(hostDiffs)
      .concat(
        expandedNestedDiffs.filter(
          (diff) => !isComponentSelectionDiff(diff),
        ),
      )
      .concat(explicitVariantStateDiffs),
  );
  const changedSelectionNodeIds = new Set(
    candidates
      .filter((diff) =>
        isComponentSelectionDiff(diff) &&
        !hasSameBaselineAndActualValue(diff) &&
        Boolean(diff.nodeId),
      )
      .map((diff) => diff.nodeId!),
  );
  const requiresDirectOverrideEvidence = host.type === 'INSTANCE';

  return candidates
    .filter((diff) =>
      !requiresDirectOverrideEvidence ||
      diff.context?.directHostVariantOverride === true,
    )
    .filter((diff) =>
      isComponentSelectionDiff(diff) ||
      !isInsideChangedComponentSelection(
        diff,
        actualStructure,
        changedSelectionNodeIds,
      ) ||
      !isExplainedBySelectedVariant(diff),
    )
    .filter((diff) => !hasSameBaselineAndActualValue(diff))
    .filter((diff) => isEffectivelyVisible(diff, actualStructure))
    .map(toBaselineDiffFact);
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
    getComponentKeyCached,
    getReferenceStructureCached,
    isInsideLocalComponentContext,
    isPaintToken,
    reportMissingReference,
    resolveTokenLabel,
    resolveVariableCollectionMetadata,
    resolveVariableMetadata,
    throwIfCancelled,
  } = dependencies;
  const {
    checkedComponentNodes: checkedComponentNodesList,
    componentKeyCache,
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

  assertAuditPolicyCoverage([{
    figmaKey: componentKey, componentName: ref?.name ?? node.name,
    displayName: ref?.displayName, sourceFile: ref?.sourceFile,
  }]);

  const catalogLifecycle = getComponentLifecycle(componentKey, node.id);
  const libraryFreshness =
    node.type === 'INSTANCE'
      ? await libraryComponentFreshnessChecker.check(
          node as InstanceNode,
          getLibraryComponentFreshnessScope(node),
        )
      : null;
  throwIfCancelled();
  const updateReasons: UpdateReason[] = [];
  if (catalogLifecycle.status === 'scheduled') updateReasons.push('catalog-lifecycle');
  if (libraryFreshness?.status === 'update-available') updateReasons.push('library-update-available');

  if (!componentKey || !ref) {
    reportMissingReference(node.name, componentKey);

    return {
      id: node.id,
      name: node.name,
      nodeType: node.type,
      relevance: componentRelevance(catalogLifecycle, libraryFreshness, false, false),
      catalogLifecycle, libraryFreshness, updateReasons,
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
  const needsDiff = shouldMaterializeComponentDiff({
    hasReferenceStructure: Boolean(referenceStructure),
    alreadyMaterialized: checkedComponentNodesList.has(node.id),
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
  const requiresComponentApiAudit = !false && Boolean(
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
      requiresComponentApiAudit,
    isInheritedFromLocalComponentContext,
  });
  const actualStructure =
    shouldDiff && referenceStructure
      ? await snapshotTree(node, checkedComponentNodesList, {
          includeHidden: false,
          throwIfCancelled,
        })
      : null;
  throwIfCancelled();
  if (actualStructure) {
    assertAuditPolicyCoverage(actualStructure.filter(item => item.componentInstance?.componentKey).map(item => {
      const key = item.componentInstance!.componentKey;
      const reference = key ? findComponent(key) : null;
      return {figmaKey: key, componentName: reference?.name ?? item.name,
        displayName: reference?.displayName, sourceFile: reference?.sourceFile};
    }));
  }
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
  const baselineSelectedVariantEvidence = alignedActualStructure
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
        hostDiffs.concat(explicitVariantStateDiffs),
        (nestedComponentKey) =>
          findComponent(nestedComponentKey)?.key ?? nestedComponentKey,
        {
          resolveTokenLabel: resolveTokenLabel,
          resolveStyleLabel: resolveStyleLabelForDiff,
          isPaintToken: isPaintToken,
          resolveVariableMetadata: resolveVariableMetadata,
        },
      )
    : null;
  // WIP fact layer: compare against the selected host variant and keep only
  // deviations backed by Figma's direct override evidence. This removes
  // standalone-materialization noise and visual consequences of variant
  // switches without applying any design-system allow/deny policy.
  const baselineDiffs = buildBaselineCustomizationFacts(
    alignedActualStructure?.[0] ?? null,
    alignedActualStructure ?? [],
    hostDiffs,
    explicitVariantStateDiffs,
    (diff) => baselineSelectedVariantEvidence?.explains(diff) ?? false,
    markedDiffs,
  );
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
  const diffs = legacyDiffs.map(finalizeComponentRuleAssessment);
  debugDiffPipeline({
    rootNode: node,
    componentName: ref?.displayName ?? ref?.name ?? node.name,
    alignedActualStructure,
    expandedReferenceStructure,
    rawDiffs,
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

  const relevance = componentRelevance(catalogLifecycle, libraryFreshness, forcedCategory === 'technical', true);

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
    baselineDiffs,
    comparisonIssues,
    updateReasons,
    libraryFreshness,
    catalogLifecycle,
    forcedCategory,
    forcedCategoryReason,
    resolvedReferenceVariantKey,
    resolvedReferenceVariantName,
  };
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
