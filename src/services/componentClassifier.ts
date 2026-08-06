import {
  ensureReferenceCatalogsForKeys,
  findComponent,
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
    componentName: string | null | undefined;
    alignedActualStructure: DSStructureNode[] | null;
    expandedReferenceStructure: DSStructureNode[] | null;
    rawDiffs: DiffList;
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
  const needsDiff = Boolean(referenceStructure) && !checkedComponentNodesList.has(node.id);
  const instanceHasOverrides =
    node.type === 'INSTANCE' && hasInstanceOverrides(node as InstanceNode);
  const requiresSizingRuleAudit = hasRequiredComponentSizingRules(
    componentKey,
    [ref?.name, ref?.displayName, node.name],
  );
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
  const requiresComponentApiAudit = Boolean(
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
    requiresComponentApiAudit,
    isInheritedFromLocalComponentContext,
  });
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
  const hostDiffs =
    shouldDiff && referenceStructure && alignedActualStructure
      ? diffStructures(alignedActualStructure, referenceStructure, {
          strict: STRICT_COMPARISON,
          resolveTokenLabel: resolveTokenLabel,
          resolveStyleLabel: resolveStyleLabelForDiff,
          isPaintToken: isPaintToken,
          resolveVariableMetadata: resolveVariableMetadata,
        }).diffs
      : [];
  const assessedDiffs = assessCustomizationDiffs(compositionContractResult.diffs, {
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
  const diffs = applyCustomizationFilters(contractAwareResult.diffs, {
    libraryName: ref?.source ?? null,
    componentName: ref?.displayName ?? ref?.name ?? node.name,
  });
  debugDiffPipeline({
    componentName: ref?.displayName ?? ref?.name ?? node.name,
    alignedActualStructure,
    expandedReferenceStructure,
    rawDiffs,
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
