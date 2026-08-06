import {
  diffStructures,
  type DiffEntry,
  type DiffValueDetails,
  type VariableBindingEvidence,
  type VariableMetadataResolver,
} from '../structure/diff';
import { formatStrokeAlignment } from '../structure/strokeAlignment';
import { formatLayoutSizing } from '../structure/layoutSizing';
import {
  buildOccurrenceKeyMap,
  makeOccurrenceKey,
} from '../structure/occurrenceKeys';
import type { DSStructureNode } from '../types/structures';
import type { CustomizationAssessment } from './types';
import { evaluateCompositionSubtreePropertyPolicy } from '../contracts/compositionContractEngine';
import {
  evaluatePatternRules,
  findSemanticVariantRule,
  type PatternRuleContext,
} from './patternRules';

export {
  evaluatePatternRules,
  setPatternRulesConfig,
} from './patternRules';
export type CustomizationAssessmentOptions = {
  hostDiffs: DiffEntry[];
  hostReference: DSStructureNode[];
  resolvePatternContext?: (diff: DiffEntry) => PatternRuleContext | null;
  nestedContextEvidence?: NestedContextEvidence;
};

export type NestedContextEvidence = {
  explains: (diff: DiffEntry) => boolean;
  selectedReference?: (diff: DiffEntry) => DiffValueDetails | null;
  hasControllingVariantMismatch?: (diff: DiffEntry) => boolean;
};

export type NestedContextEvidenceOptions = {
  resolveTokenLabel?: (token: string) => string | null;
  resolveStyleLabel?: (styleKey: string) => string | null;
  isPaintToken?: (token: string) => boolean;
  resolveVariableMetadata?: VariableMetadataResolver;
};

export type PatternContextResolverOptions = {
  actualStructure: DSStructureNode[];
  hostReference: DSStructureNode[];
  hostComponentKey: string | null;
  hostComponentName: string | null;
  resolveComponent: (
    key: string,
  ) => { key?: string; displayName?: string; name?: string } | null;
};

export function createPatternContextResolver(
  options: PatternContextResolverOptions,
): (diff: DiffEntry) => PatternRuleContext | null {
  const actualByOccurrence = invertOccurrenceMap(options.actualStructure);
  const hostByOccurrence = invertOccurrenceMap(options.hostReference);
  const actualById = new Map(options.actualStructure.map((node) => [node.id, node]));

  return (diff) => {
    const actualNode = findActualDiffNode(diff, options.actualStructure, actualByOccurrence);
    const inferredOwner = actualNode
      ? findNearestInstanceOwner(actualNode, actualById)
      : null;
    const actualOwnerPath =
      inferredOwner?.path ?? diff.context.actualNestedOwnerPath ?? null;
    const hostOwnerPath = diff.context.nestedOwnerPath ?? actualOwnerPath;
    if (!actualOwnerPath || !hostOwnerPath || !inferredOwner) {
      return null;
    }

    const occurrence = extractOccurrence(diff.nodePath);
    const actualOwner =
      actualByOccurrence.get(makeOccurrenceKey(actualOwnerPath, occurrence)) ??
      actualByOccurrence.get(actualOwnerPath) ?? inferredOwner;
    const hostOwner =
      hostByOccurrence.get(makeOccurrenceKey(hostOwnerPath, occurrence)) ??
      hostByOccurrence.get(hostOwnerPath) ??
      null;
    if (!actualOwner || !hostOwner) {
      return null;
    }

    const rawNestedKey =
      actualOwner.componentInstance?.componentKey ??
      diff.context.actualNestedOwnerComponentKey ??
      diff.context.nestedOwnerComponentKey ??
      null;
    const nestedComponent = rawNestedKey
      ? options.resolveComponent(rawNestedKey)
      : null;
    const nestedCount = options.actualStructure.filter(
      (node) => node.type === 'INSTANCE' && node.path === actualOwnerPath,
    ).length;

    return {
      hostComponentKey: options.hostComponentKey,
      hostComponentName: options.hostComponentName,
      nestedComponentKey: nestedComponent?.key ?? rawNestedKey,
      nestedComponentName:
        nestedComponent?.displayName ?? nestedComponent?.name ?? actualOwner.name ?? null,
      occurrence,
      nestedCount: Math.max(1, nestedCount),
      actualVariantProperties: actualOwner.componentInstance?.variantProperties ?? {},
      expectedVariantProperties: hostOwner.componentInstance?.variantProperties ?? {},
      nestedNodeId: actualOwner.nodeId ?? null,
    };
  };
}

export function createNestedContextEvidence(
  actualStructure: DSStructureNode[],
  resolveReference: (instance: DSStructureNode) => DSStructureNode[] | null,
  candidateDiffs: DiffEntry[] = [],
  resolveFamilyKey: (componentKey: string) => string = (componentKey) => componentKey,
  options: NestedContextEvidenceOptions = {},
): NestedContextEvidence {
  const contexts: Array<{
    matchedNodeIds: Set<string>;
    diffKeys: Set<string>;
    referenceByNodeId: Map<string, DSStructureNode>;
    ownerVariantProperties: Record<string, string>;
  }> = [];
  const rootId = actualStructure[0]?.id ?? null;
  const relevantInstanceIds = collectRelevantInstanceIds(
    actualStructure,
    candidateDiffs,
  );

  for (const instance of actualStructure) {
    if (
      instance.id === rootId ||
      instance.type !== 'INSTANCE' ||
      !instance.componentInstance?.componentKey ||
      (relevantInstanceIds && !relevantInstanceIds.has(instance.id))
    ) {
      continue;
    }

    const reference = resolveReference(instance);
    if (!reference?.length) {
      continue;
    }
    const actualSubtree = collectSubtree(actualStructure, instance.id);
    const alignedReference = alignNestedInstancePaths(
      alignReference(reference, instance.path),
      actualSubtree,
      resolveFamilyKey,
    );
    const actualKeys = buildOccurrenceKeyMap(actualSubtree);
    const referenceKeys = buildOccurrenceKeyMap(alignedReference);
    const referenceKeySet = new Set(
      Array.from(referenceKeys.values()),
    );
    const matchedNodeIds = new Set<string>();
    const referenceByOccurrence = new Map(
      alignedReference.map((node) => [
        referenceKeys.get(node) ?? node.path,
        node,
      ]),
    );
    const referenceByNodeId = new Map<string, DSStructureNode>();
    for (const node of actualSubtree) {
      const occurrenceKey = actualKeys.get(node) ?? node.path;
      if (
        node.nodeId &&
        referenceKeySet.has(occurrenceKey)
      ) {
        matchedNodeIds.add(node.nodeId);
        const referenceNode = referenceByOccurrence.get(occurrenceKey);
        if (referenceNode) {
          referenceByNodeId.set(node.nodeId, referenceNode);
        }
      }
    }
    if (!matchedNodeIds.size) {
      continue;
    }

    const contextualDiffs = diffStructures(actualSubtree, alignedReference, {
      resolveTokenLabel: options.resolveTokenLabel,
      resolveStyleLabel: options.resolveStyleLabel,
      isPaintToken: options.isPaintToken,
      resolveVariableMetadata: options.resolveVariableMetadata,
    }).diffs;
    contexts.push({
      matchedNodeIds,
      diffKeys: new Set(contextualDiffs.map(makeDiffPropertyKey)),
      referenceByNodeId,
      ownerVariantProperties:
        instance.componentInstance?.variantProperties ?? {},
    });
  }

  return {
    selectedReference(diff) {
      const referenceNode = findSelectedReferenceNode(contexts, diff);
      return referenceNode ? selectedReferenceValue(referenceNode, diff, options) : null;
    },
    hasControllingVariantMismatch(diff) {
      const property = diff.details?.property ?? '';
      if (!property.startsWith('variant.') || !diff.nodeId) {
        return false;
      }
      const propertyName = property.slice('variant.'.length);
      return contexts.some((context) => {
        const referenceNode = context.referenceByNodeId.get(diff.nodeId!);
        if (!referenceNode) return false;
        const ownerValue = readVariantProperty(
          context.ownerVariantProperties,
          propertyName,
        );
        const referenceValue = readVariantProperty(
          referenceNode.componentInstance?.variantProperties ?? {},
          propertyName,
        );
        if (ownerValue === null || referenceValue === null) {
          return false;
        }
        return (
          normalizeComparableValue(ownerValue) ===
            normalizeComparableValue(referenceValue) &&
          normalizeComparableValue(diff.details?.actual.value) !==
            normalizeComparableValue(referenceValue)
        );
      });
    },
    explains(diff) {
      if (!diff.nodeId) {
        return false;
      }
      const key = makeDiffPropertyKey(diff);
      return contexts.some(
        (context) => {
          if (!context.matchedNodeIds.has(diff.nodeId!)) {
            return false;
          }
          if (!context.diffKeys.has(key)) {
            return true;
          }
          const referenceNode = context.referenceByNodeId.get(diff.nodeId!);
          return referenceNode
            ? referenceMatchesActualDiffValue(referenceNode, diff, options)
            : false;
        },
      );
    },
  };
}

function findSelectedReferenceNode(
  contexts: Array<{
    matchedNodeIds: Set<string>;
    diffKeys: Set<string>;
    referenceByNodeId: Map<string, DSStructureNode>;
    ownerVariantProperties: Record<string, string>;
  }>,
  diff: DiffEntry,
): DSStructureNode | null {
  if (!diff.nodeId || !diff.details) {
    return null;
  }
  const key = makeDiffPropertyKey(diff);
  let matchedReference: DSStructureNode | null = null;
  for (const context of contexts) {
    if (!context.matchedNodeIds.has(diff.nodeId)) {
      continue;
    }
    const referenceNode = context.referenceByNodeId.get(diff.nodeId);
    if (referenceNode && context.diffKeys.has(key)) {
      return referenceNode;
    }
    matchedReference ??= referenceNode ?? null;
  }
  return matchedReference;
}

export function selectedReferenceValue(
  referenceNode: DSStructureNode,
  diff: DiffEntry,
  options: NestedContextEvidenceOptions = {},
): DiffValueDetails | null {
  const property = diff.details?.property;
  if (!property) {
    return null;
  }

  if (property === 'styles.text') {
    const styleKey = referenceNode.styles?.text?.styleKey ?? null;
    return resourceValue(
      styleKey,
      'style',
      styleKey ? options.resolveStyleLabel?.(styleKey) ?? styleKey : null,
    );
  }
  if (property === 'typography.token') {
    const token = referenceNode.typographyToken ?? null;
    return resourceValue(
      token,
      'token',
      token ? options.resolveTokenLabel?.(token) ?? token : null,
    );
  }
  if (property === 'fill') {
    return paintReferenceValue(
      referenceNode.fill ?? null,
      referenceNode.styles?.fill?.styleKey ?? null,
      options,
    );
  }
  if (property === 'stroke') {
    return paintReferenceValue(
      referenceNode.stroke ?? null,
      referenceNode.styles?.stroke?.styleKey ?? null,
      options,
    );
  }
  if (property === 'stroke.align') {
    const align = referenceNode.stroke?.align ?? null;
    return align ? primitiveReferenceValue(formatStrokeAlignment(align)) : null;
  }
  if (property === 'layout.itemSpacing') {
    return primitiveReferenceValue(referenceNode.layout?.itemSpacing ?? null);
  }
  if (property === 'layout.sizing.horizontal') {
    const value = referenceNode.layout?.sizing?.horizontal ?? null;
    return value ? primitiveReferenceValue(formatLayoutSizing(value)) : null;
  }
  if (property === 'layout.sizing.vertical') {
    const value = referenceNode.layout?.sizing?.vertical ?? null;
    return value ? primitiveReferenceValue(formatLayoutSizing(value)) : null;
  }
  if (property === 'layout.itemSpacingToken') {
    return variableReferenceValue(
      referenceNode.layout?.itemSpacing ?? null,
      referenceNode.layout?.itemSpacingToken ?? null,
      referenceNode,
      options,
    );
  }
  if (property === 'radius') {
    return primitiveReferenceValue(
      typeof referenceNode.radius === 'string' ||
        typeof referenceNode.radius === 'number'
        ? referenceNode.radius
        : null,
    );
  }
  if (property.startsWith('variant.')) {
    const propertyName = property.slice('variant.'.length);
    const value = readVariantProperty(
      referenceNode.componentInstance?.variantProperties ?? {},
      propertyName,
    );
    return value === null ? null : primitiveReferenceValue(value);
  }

  const paddingSide = property.match(/^layout\.padding\.(top|right|bottom|left)$/)?.[1] as
    | 'top'
    | 'right'
    | 'bottom'
    | 'left'
    | undefined;
  if (paddingSide) {
    return primitiveReferenceValue(referenceNode.layout?.padding?.[paddingSide] ?? null);
  }

  return null;
}

function readVariantProperty(
  properties: Record<string, string>,
  target: string,
): string | null {
  const normalizedTarget = target.trim().toLowerCase();
  for (const [property, value] of Object.entries(properties)) {
    if (property.trim().toLowerCase() === normalizedTarget) {
      return value;
    }
  }
  return null;
}

function normalizeComparableValue(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function variableReferenceValue(
  value: string | number | null,
  token: string | null,
  node: DSStructureNode,
  options: NestedContextEvidenceOptions,
): DiffValueDetails | null {
  if (!token) {
    return null;
  }
  const metadata = options.resolveVariableMetadata?.(token) ?? null;
  const tokenLabel = options.resolveTokenLabel?.(token) ?? token;
  const baseValue = value === null ? tokenLabel : String(value);
  const collectionName = metadata?.collectionName?.trim() ?? '';
  const displayName = collectionName
    ? `${baseValue} (${collectionName})`
    : baseValue;
  return {
    value,
    resourceType: 'token',
    resourceId: token,
    displayName,
    bindingId: token,
    binding: nestedReferenceBindingEvidence(node, token, metadata),
  };
}

function nestedReferenceBindingEvidence(
  node: DSStructureNode,
  token: string,
  metadata: ReturnType<NonNullable<VariableMetadataResolver>>,
): VariableBindingEvidence {
  const collectionId = metadata?.collectionId ?? null;
  const modeContext = collectionId
    ? node.variableModes?.find(
        (context) => context.collectionId === collectionId,
      ) ?? null
    : null;
  const resolvedModeId = modeContext?.resolvedModeId ?? null;
  const explicitModeId = modeContext?.explicitModeId ?? null;
  const modeNames = metadata?.modeNames ?? {};
  const modeOwnerNodeId = modeContext?.explicitOwnerNodeId ?? null;
  const modeSource: VariableBindingEvidence['modeSource'] =
    modeOwnerNodeId === node.nodeId
      ? 'explicit'
      : modeOwnerNodeId
        ? 'inherited'
        : resolvedModeId
          ? 'resolved'
          : 'unknown';
  return {
    id: token,
    key: metadata?.variableKey ?? null,
    name: metadata?.variableName ?? null,
    collectionId,
    collectionName: metadata?.collectionName ?? null,
    resolvedModeId,
    resolvedModeName: resolvedModeId
      ? modeNames[resolvedModeId] ?? null
      : null,
    explicitModeId,
    explicitModeName: explicitModeId
      ? modeNames[explicitModeId] ?? null
      : null,
    modeSource,
    modeOwnerNodeId,
    modeOwnerName: modeContext?.explicitOwnerName ?? null,
    modeOwnerPath: modeContext?.explicitOwnerPath ?? null,
  };
}

function paintReferenceValue(
  paint: { color?: string | null; token?: string | null } | null,
  styleKey: string | null,
  options: NestedContextEvidenceOptions = {},
): DiffValueDetails | null {
  const token = normalizePaintTokenForAssessment(
    paint?.token ?? null,
    options.isPaintToken,
  );
  if (token) {
    return resourceValue(
      token,
      'token',
      options.resolveTokenLabel?.(token) ?? token,
    );
  }
  if (styleKey) {
    return resourceValue(
      styleKey,
      'style',
      options.resolveStyleLabel?.(styleKey) ?? styleKey,
    );
  }
  if (paint?.color) {
    return {
      value: paint.color,
      resourceType: 'color',
      resourceId: null,
      displayName: paint.color,
    };
  }
  return null;
}

function resourceValue(
  value: string | null,
  resourceType: 'style' | 'token',
  displayName: string | null = value,
): DiffValueDetails | null {
  if (!value) {
    return null;
  }
  const label = displayName || value;
  return {
    value: label,
    resourceType,
    resourceId: value,
    displayName: label,
  };
}

function primitiveReferenceValue(
  value: string | number | null,
): DiffValueDetails | null {
  return value == null ? null : { value };
}

function referenceMatchesActualDiffValue(
  referenceNode: DSStructureNode,
  diff: DiffEntry,
  options: NestedContextEvidenceOptions = {},
): boolean {
  const property = diff.details?.property;
  const actual = diff.details?.actual;
  if (!property || !actual) {
    return false;
  }

  if (property === 'styles.text') {
    return resourceIdsEqual(
      actual.resourceId ?? null,
      referenceNode.styles?.text?.styleKey ?? null,
    );
  }
  if (property === 'typography.token') {
    return resourceIdsEqual(
      actual.resourceId ?? null,
      referenceNode.typographyToken ?? null,
    );
  }
  if (property === 'fill') {
    const token = normalizePaintTokenForAssessment(
      referenceNode.fill?.token ?? null,
      options.isPaintToken,
    );
    const style = referenceNode.styles?.fill?.styleKey ?? null;
    return matchesPaintResource(
      actual.resourceId ?? null,
      actual.value ?? null,
      actual.displayName ?? null,
      token,
      style,
      token ? options.resolveTokenLabel?.(token) ?? token : null,
      style ? options.resolveStyleLabel?.(style) ?? style : null,
    );
  }
  if (property === 'stroke') {
    const token = normalizePaintTokenForAssessment(
      referenceNode.stroke?.token ?? null,
      options.isPaintToken,
    );
    const style = referenceNode.styles?.stroke?.styleKey ?? null;
    return matchesPaintResource(
      actual.resourceId ?? null,
      actual.value ?? null,
      actual.displayName ?? null,
      token,
      style,
      token ? options.resolveTokenLabel?.(token) ?? token : null,
      style ? options.resolveStyleLabel?.(style) ?? style : null,
    );
  }

  if (property === 'stroke.align') {
    return actual.value === formatStrokeAlignment(referenceNode.stroke?.align ?? null);
  }

  const actualValue = actual.value;
  if (property === 'layout.itemSpacing') {
    return actualValue === (referenceNode.layout?.itemSpacing ?? null);
  }
  if (property === 'layout.sizing.horizontal') {
    return actualValue === formatLayoutSizing(referenceNode.layout?.sizing?.horizontal);
  }
  if (property === 'layout.sizing.vertical') {
    return actualValue === formatLayoutSizing(referenceNode.layout?.sizing?.vertical);
  }
  if (property === 'radius') {
    return actualValue === referenceNode.radius;
  }
  const paddingSide = property.match(/^layout\.padding\.(top|right|bottom|left)$/)?.[1] as
    | 'top'
    | 'right'
    | 'bottom'
    | 'left'
    | undefined;
  if (paddingSide) {
    return actualValue === (referenceNode.layout?.padding?.[paddingSide] ?? null);
  }

  return false;
}

function matchesPaintResource(
  actualResourceId: string | null,
  actualValue: string | number | null,
  actualDisplayName: string | null,
  token: string | null,
  style: string | null,
  tokenLabel: string | null = token,
  styleLabel: string | null = style,
): boolean {
  const normalizedActualValue =
    typeof actualValue === 'string' && actualValue.trim()
      ? actualValue.trim()
      : null;
  const normalizedActualDisplayName =
    typeof actualDisplayName === 'string' && actualDisplayName.trim()
      ? actualDisplayName.trim()
      : null;

  return (
    resourceIdsEqual(actualResourceId, token) ||
    resourceIdsEqual(actualResourceId, style) ||
    normalizedActualValue === token ||
    normalizedActualValue === style ||
    normalizedActualValue === tokenLabel ||
    normalizedActualValue === styleLabel ||
    normalizedActualDisplayName === token ||
    normalizedActualDisplayName === style ||
    normalizedActualDisplayName === tokenLabel ||
    normalizedActualDisplayName === styleLabel
  );
}

function normalizePaintTokenForAssessment(
  token: string | null | undefined,
  isPaintToken?: (token: string) => boolean,
): string | null {
  if (!token) {
    return null;
  }
  if (typeof isPaintToken === 'function' && !isPaintToken(token)) {
    return null;
  }
  return token;
}

function resourceIdsEqual(
  left: string | null,
  right: string | null,
): boolean {
  if (!left || !right) {
    return false;
  }
  if (left === right) {
    return true;
  }
  return normalizeStyleResourceId(left) === normalizeStyleResourceId(right);
}

function normalizeStyleResourceId(value: string): string {
  return value.startsWith('S:') ? value.split(',')[0] ?? value : value;
}

function collectRelevantInstanceIds(
  structure: DSStructureNode[],
  diffs: DiffEntry[],
): Set<number> | null {
  if (!diffs.length) {
    return null;
  }

  const byId = new Map(structure.map((node) => [node.id, node]));
  const byNodeId = new Map(
    structure
      .filter((node) => Boolean(node.nodeId))
      .map((node) => [node.nodeId!, node]),
  );
  const byOccurrence = invertOccurrenceMap(structure);
  const relevant = new Set<number>();

  for (const diff of diffs) {
    let node =
      (diff.nodeId ? byNodeId.get(diff.nodeId) : null) ??
      byOccurrence.get(diff.nodePath) ??
      null;
    while (node) {
      if (node.type === 'INSTANCE') {
        relevant.add(node.id);
      }
      node =
        typeof node.parentId === 'number'
          ? byId.get(node.parentId) ?? null
          : null;
    }
  }

  return relevant;
}

export function assessCustomizationDiffs(
  diffs: DiffEntry[],
  options: CustomizationAssessmentOptions,
): DiffEntry[] {
  const hostReferenceKeys = new Set(
    Array.from(buildOccurrenceKeyMap(options.hostReference).values()),
  );
  const hostDiffKeys = new Set(options.hostDiffs.map(makeDiffPropertyKey));

  return diffs.map((inputDiff): DiffEntry | null => {
    const existingComponentContractAssessment =
      inputDiff.assessment?.source === 'component-contract'
        ? inputDiff.assessment
        : null;
    if (
      existingComponentContractAssessment?.contractId ||
      existingComponentContractAssessment?.constraintId
    ) {
      return inputDiff;
    }
    let diff = inputDiff;
    const isVariantDiff = isVariantPropertyDiff(diff);
    const nestedContextExplains = options.nestedContextEvidence?.explains(diff);
    const selectedReference =
      options.nestedContextEvidence?.selectedReference?.(diff) ?? null;
    const hasControllingVariantMismatch =
      options.nestedContextEvidence?.hasControllingVariantMismatch?.(diff) ??
      false;

    if (selectedReference) {
      diff = withSelectedReference(diff, selectedReference);
      if (diffDetailsAreEquivalent(diff)) {
        return null;
      }
    }

    const patternContext = options.resolvePatternContext?.(diff) ?? null;
    const patternDecision = evaluatePatternRules(patternContext);

    if (patternDecision?.verdict === 'violation') {
      return withAssessment(diff, {
        verdict: 'violation',
        source: 'pattern-rule',
        reasonCode: 'pattern-violation',
        ruleId: patternDecision.ruleId,
        message: patternDecision.message,
        remediation: patternDecision.remediation,
        presentation: patternDecision.presentation,
        semanticVariantChanges: patternDecision.variantChanges,
      });
    }

    if (isVariantDiff && hasControllingVariantMismatch) {
      return withAssessment(diff, {
        verdict: 'violation',
        source: 'catalog-host',
        reasonCode: 'differs-from-selected-nested-context',
        ruleId: null,
        message: 'Значение не соответствует выбранной конфигурации родительского компонента',
        remediation: null,
        presentation: 'show',
      });
    }

    if (nestedContextExplains) {
      return withAssessment(diff, {
        verdict: patternDecision?.verdict ?? 'expected',
        source: patternDecision ? 'pattern-rule' : 'catalog-host',
        reasonCode: patternDecision
          ? 'pattern-allowed'
          : 'matches-selected-nested-context',
        ruleId: patternDecision?.ruleId ?? null,
        message:
          patternDecision?.message ??
          'Значение задано выбранной конфигурацией вложенного компонента',
        remediation: null,
        presentation: patternDecision?.presentation ?? 'show',
        semanticVariantChanges: patternDecision?.variantChanges ?? [],
      });
    }

    if (patternDecision?.verdict === 'allowed') {
      return withAssessment(diff, {
        verdict: 'allowed',
        source: 'pattern-rule',
        reasonCode: 'pattern-allowed',
        ruleId: patternDecision.ruleId,
        message: patternDecision.message,
        remediation: null,
        presentation: patternDecision.presentation,
        semanticVariantChanges: patternDecision.variantChanges,
      });
    }

    const property = diff.details?.property ?? null;
    const compositionPropertyDecision =
      property && patternContext
        ? evaluateCompositionSubtreePropertyPolicy({
            hostComponentKey: patternContext.hostComponentKey,
            hostComponentName: patternContext.hostComponentName,
            nestedComponentKey: patternContext.nestedComponentKey,
            nestedComponentName: patternContext.nestedComponentName,
            actualVariantProperties: patternContext.actualVariantProperties,
            property,
          })
        : null;
    if (compositionPropertyDecision) {
      return withAssessment(diff, {
        verdict: compositionPropertyDecision.verdict,
        source: 'component-contract',
        reasonCode:
          compositionPropertyDecision.verdict === 'expected'
            ? 'composition-contract-expected'
            : 'composition-contract-violation',
        ruleId:
          `${compositionPropertyDecision.contractId}.` +
          compositionPropertyDecision.policyId,
        contractId: compositionPropertyDecision.contractId,
        constraintId: compositionPropertyDecision.policyId,
        evidence: {
          variantProperty: compositionPropertyDecision.variantProperty,
          variantValue: compositionPropertyDecision.variantValue,
          controlledProperty: compositionPropertyDecision.property,
          allowedProperties: compositionPropertyDecision.allowedProperties,
        },
        message: compositionPropertyDecision.message,
        remediation: null,
        presentation:
          compositionPropertyDecision.verdict === 'expected'
            ? 'show-expected'
            : 'show',
      });
    }

    if (existingComponentContractAssessment) {
      return diff;
    }

    if (!isVariantDiff && diff.suppressAsHostControlledNestedProperty === true) {
      const hostContainsNode = hostReferenceKeys.has(diff.nodePath);
      const differsFromHost = hostDiffKeys.has(makeDiffPropertyKey(diff));

      if (hostContainsNode && !differsFromHost) {
        return withAssessment(diff, {
          verdict: 'expected',
          source: 'catalog-host',
          reasonCode: 'matches-materialized-host-value',
          ruleId: null,
          message: 'Значение задано структурой родительского компонента',
          remediation: null,
          presentation: 'show',
        });
      }

      if (hostContainsNode && differsFromHost) {
        return withAssessment(diff, {
          verdict: 'violation',
          source: 'catalog-host',
          reasonCode: 'differs-from-materialized-host-value',
          ruleId: null,
          message: 'Значение не соответствует структуре родительского компонента',
          remediation: null,
          presentation: 'show',
        });
      }
    }

    return withAssessment(diff, {
      verdict: 'unknown',
      source: 'standalone-reference',
      reasonCode: 'no-contextual-expectation',
      ruleId: null,
      message: 'Контекстное правило не найдено',
      remediation: null,
      presentation: 'show',
    });
  }).filter((diff): diff is DiffEntry => diff !== null);
}

export function applyAssessmentPresentation(diffs: DiffEntry[]): DiffEntry[] {
  return diffs.filter((diff) => {
    if (isVariantPropertyDiff(diff)) {
      return true;
    }

    if (diff.assessment?.presentation === 'suppress-derived') {
      return false;
    }

    if (
      diff.assessment?.presentation !== 'semantic-variant' &&
      diff.assessment?.presentation !== 'show-expected' &&
      (
        diff.assessment?.verdict === 'expected' ||
        diff.assessment?.verdict === 'allowed'
      )
    ) {
      return false;
    }

    return true;
  });
}

export function collapseVisualDiffsUnderVariantChanges(
  diffs: DiffEntry[],
  actualStructure: DSStructureNode[],
): DiffEntry[] {
  const variantDiffs = diffs.filter(isVariantPropertyDiff);
  if (!variantDiffs.length) {
    return diffs;
  }

  const byNodeId = new Map(
    actualStructure
      .filter((node) => Boolean(node.nodeId))
      .map((node) => [node.nodeId!, node]),
  );
  const byId = new Map(actualStructure.map((node) => [node.id, node]));
  const variantDiffsByNodeId = new Map<string, DiffEntry[]>();
  for (const diff of variantDiffs) {
    if (!diff.nodeId) continue;
    const entries = variantDiffsByNodeId.get(diff.nodeId) ?? [];
    entries.push(diff);
    variantDiffsByNodeId.set(diff.nodeId, entries);
  }
  const derivedVariantDiffs = new Set<DiffEntry>();
  for (const diff of variantDiffs) {
    if (
      !diff.nodeId ||
      (diff.assessment?.verdict !== 'expected' &&
        diff.assessment?.verdict !== 'allowed')
    ) {
      continue;
    }
    let node = byNodeId.get(diff.nodeId) ?? null;
    while (node && typeof node.parentId === 'number') {
      node = byId.get(node.parentId) ?? null;
      if (!node?.nodeId) continue;
      const ancestorDiffs = variantDiffsByNodeId.get(node.nodeId) ?? [];
      if (
        ancestorDiffs.some(
          (ancestorDiff) =>
            ancestorDiff.details?.property === diff.details?.property &&
            ancestorDiff.details?.actual.value === diff.details?.actual.value,
        )
      ) {
        derivedVariantDiffs.add(diff);
        break;
      }
    }
  }
  const collapsedNodeIds = new Set<string>();

  for (const diff of variantDiffs) {
    if (!diff.nodeId) {
      continue;
    }
    const node = byNodeId.get(diff.nodeId);
    if (!node) {
      continue;
    }
    for (const subtreeNode of collectSubtree(actualStructure, node.id)) {
      if (subtreeNode.nodeId) {
        collapsedNodeIds.add(subtreeNode.nodeId);
      }
    }
  }

  if (!collapsedNodeIds.size) {
    return diffs;
  }

  return diffs.filter(
    (diff) =>
      !derivedVariantDiffs.has(diff) &&
      (isVariantPropertyDiff(diff) ||
      diff.assessment?.verdict === 'unknown' ||
      diff.assessment?.verdict === 'violation' ||
      diff.assessment?.presentation === 'show-expected' ||
      !diff.nodeId ||
      !collapsedNodeIds.has(diff.nodeId)),
  );
}

function isVariantPropertyDiff(diff: DiffEntry): boolean {
  return typeof diff.details?.property === 'string' &&
    diff.details.property.startsWith('variant.');
}

export function collapseSemanticVariantDiffs(
  diffs: DiffEntry[],
  actualStructure: DSStructureNode[],
): DiffEntry[] {
  const byNodeId = new Map(
    actualStructure
      .filter((node) => Boolean(node.nodeId))
      .map((node) => [node.nodeId!, node]),
  );
  const groups = new Map<
    string,
    {
      representative: DiffEntry;
      target: DSStructureNode;
      changes: NonNullable<CustomizationAssessment['semanticVariantChanges']>;
      subtreeNodeIds: Set<string>;
    }
  >();

  for (const diff of diffs) {
    const assessment = diff.assessment;
    const changes = assessment?.semanticVariantChanges ?? [];
    if (
      assessment?.presentation !== 'semantic-variant' ||
      !assessment.ruleId ||
      !changes.length
    ) {
      continue;
    }
    const target = byNodeId.get(changes[0].nodeId);
    if (!target) {
      continue;
    }
    const key = `${assessment.ruleId}:${target.nodeId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        representative: diff,
        target,
        changes,
        subtreeNodeIds: new Set(
          collectSubtree(actualStructure, target.id)
            .map((node) => node.nodeId)
            .filter((nodeId): nodeId is string => Boolean(nodeId)),
        ),
      });
    }
  }

  if (!groups.size) {
    return diffs;
  }

  const collapsedNodeIds = new Set<string>();
  for (const group of groups.values()) {
    for (const nodeId of group.subtreeNodeIds) {
      collapsedNodeIds.add(nodeId);
    }
  }
  const preserved = diffs.filter(
    (diff) =>
      !diff.nodeId ||
      !collapsedNodeIds.has(diff.nodeId) ||
      diff.assessment?.presentation !== 'semantic-variant',
  );

  for (const group of groups.values()) {
    for (const change of group.changes) {
      if (!change.expected || !change.actual || change.expected === change.actual) {
        continue;
      }
      const label = change.property.charAt(0).toLowerCase() + change.property.slice(1);
      preserved.push(
        Object.assign({}, group.representative, {
          message: `${label}: ${change.expected.toLowerCase()} → ${change.actual.toLowerCase()}`,
          nodeId: group.target.nodeId,
          nodeName: group.target.name,
          nodePath: group.target.path,
          visible: group.target.visible !== false,
          diffKind: 'other' as const,
          details: {
            property: `variant.${change.property}`,
            reference: { value: change.expected },
            actual: { value: change.actual },
          },
          assessment: group.representative.assessment
            ? Object.assign({}, group.representative.assessment, {
                presentation: 'show' as const,
              })
            : undefined,
        }),
      );
    }
  }

  return preserved;
}

export function collapseConfiguredSemanticVariantDiffs(
  diffs: DiffEntry[],
  options: {
    actualStructure: DSStructureNode[];
    hostReference: DSStructureNode[];
    hostComponentKey: string | null;
    resolveFamilyKey: (componentKey: string) => string;
  },
): DiffEntry[] {
  if (!options.hostComponentKey || !diffs.length) {
    return diffs;
  }

  const hostFamilyKey = options.resolveFamilyKey(options.hostComponentKey);
  const actualKeys = buildOccurrenceKeyMap(options.actualStructure);
  const hostByOccurrence = invertOccurrenceMap(options.hostReference);
  const plans: Array<{
    ruleId: string;
    target: DSStructureNode;
    changes: Array<{
      nodeId: string;
      property: string;
      expected: string;
      actual: string;
    }>;
    subtreeNodeIds: Set<string>;
  }> = [];

  for (const actualNode of options.actualStructure) {
    const actualComponentKey = actualNode.componentInstance?.componentKey;
    if (actualNode.type !== 'INSTANCE' || !actualNode.nodeId || !actualComponentKey) {
      continue;
    }
    const hostNode =
      hostByOccurrence.get(actualKeys.get(actualNode) ?? actualNode.path) ?? null;
    if (!hostNode) {
      continue;
    }
    const nestedFamilyKey = options.resolveFamilyKey(actualComponentKey);
    const rule = findSemanticVariantRule(hostFamilyKey, nestedFamilyKey);
    if (!rule) {
      continue;
    }

    const actualProperties = actualNode.componentInstance?.variantProperties ?? {};
    const expectedProperties = hostNode.componentInstance?.variantProperties ?? {};
    const changes = Object.keys(rule.assert.variantProperties)
      .filter(
        (property) =>
          actualProperties[property] &&
          expectedProperties[property] &&
          actualProperties[property] !== expectedProperties[property] &&
          rule.assert.variantProperties[property]?.oneOf.includes(
            actualProperties[property],
          ),
      )
      .map((property) => ({
        nodeId: actualNode.nodeId!,
        property,
        expected: expectedProperties[property],
        actual: actualProperties[property],
      }));
    if (!changes.length) {
      continue;
    }

    plans.push({
      ruleId: rule.id,
      target: actualNode,
      changes,
      subtreeNodeIds: new Set(
        collectSubtree(options.actualStructure, actualNode.id)
          .map((node) => node.nodeId)
          .filter((nodeId): nodeId is string => Boolean(nodeId)),
      ),
    });
  }

  if (!plans.length) {
    return diffs;
  }

  const removed = new Set<DiffEntry>();
  const additions: DiffEntry[] = [];
  for (const plan of plans) {
    const representative = diffs.find(
      (diff) =>
        Boolean(diff.nodeId) &&
        plan.subtreeNodeIds.has(diff.nodeId!) &&
        (diff.assessment?.verdict === 'expected' ||
          diff.assessment?.verdict === 'allowed'),
    );
    if (!representative) {
      continue;
    }
    for (const diff of diffs) {
      if (
        diff.nodeId &&
        plan.subtreeNodeIds.has(diff.nodeId) &&
        (diff.assessment?.verdict === 'expected' ||
          diff.assessment?.verdict === 'allowed')
      ) {
        removed.add(diff);
      }
    }
    for (const change of plan.changes) {
      const label = change.property.charAt(0).toLowerCase() + change.property.slice(1);
      additions.push(
        Object.assign({}, representative, {
          message: `${label}: ${change.expected.toLowerCase()} → ${change.actual.toLowerCase()}`,
          nodeId: plan.target.nodeId,
          nodeName: plan.target.name,
          nodePath: plan.target.path,
          visible: plan.target.visible !== false,
          diffKind: 'other' as const,
          details: {
            property: `variant.${change.property}`,
            reference: { value: change.expected },
            actual: { value: change.actual },
          },
          assessment: {
            verdict: 'allowed' as const,
            source: 'pattern-rule' as const,
            reasonCode: 'pattern-allowed',
            ruleId: plan.ruleId,
            message: 'Вложенный вариант соответствует паттерну BackgroundPlate',
            remediation: null,
            presentation: 'show' as const,
            semanticVariantChanges: plan.changes,
          },
        }),
      );
    }
  }

  return diffs.filter((diff) => !removed.has(diff)).concat(additions);
}

export function collapsePatternViolationDiffs(
  diffs: DiffEntry[],
  actualStructure: DSStructureNode[],
): DiffEntry[] {
  const byNodeId = new Map(
    actualStructure
      .filter((node) => Boolean(node.nodeId))
      .map((node) => [node.nodeId!, node]),
  );
  const groups = new Map<
    string,
    {
      representative: DiffEntry;
      target: DSStructureNode;
      remediation: NonNullable<CustomizationAssessment['remediation']>;
      subtreeNodeIds: Set<string>;
    }
  >();

  for (const diff of diffs) {
    const assessment = diff.assessment;
    const remediation = assessment?.remediation;
    if (
      assessment?.verdict !== 'violation' ||
      assessment.source !== 'pattern-rule' ||
      !assessment.ruleId ||
      !remediation
    ) {
      continue;
    }
    const target = byNodeId.get(remediation.nodeId);
    if (!target) {
      continue;
    }
    const key = `${assessment.ruleId}:${remediation.nodeId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        representative: diff,
        target,
        remediation,
        subtreeNodeIds: new Set(
          collectSubtree(actualStructure, target.id)
            .map((node) => node.nodeId)
            .filter((nodeId): nodeId is string => Boolean(nodeId)),
        ),
      });
    }
  }

  if (!groups.size) {
    return diffs;
  }

  const collapsedNodeIds = new Set<string>();
  for (const group of groups.values()) {
    for (const nodeId of group.subtreeNodeIds) {
      collapsedNodeIds.add(nodeId);
    }
  }

  const preserved = diffs.filter((diff) => {
    if (!diff.nodeId || !collapsedNodeIds.has(diff.nodeId)) {
      return true;
    }
    return !(
      diff.assessment?.verdict === 'expected' ||
      diff.assessment?.verdict === 'allowed' ||
      diff.assessment?.source === 'pattern-rule'
    );
  });

  for (const group of groups.values()) {
    const actualProperties = group.target.componentInstance?.variantProperties ?? {};
    for (const [property, expectedValue] of Object.entries(
      group.remediation.properties,
    )) {
      const actualValue = actualProperties[property];
      if (!actualValue || actualValue === expectedValue) {
        continue;
      }
      const label = property.charAt(0).toLowerCase() + property.slice(1);
      preserved.push(
        Object.assign({}, group.representative, {
          message: `${label}: ${expectedValue.toLowerCase()} → ${actualValue.toLowerCase()}`,
          nodeId: group.target.nodeId,
          nodeName: group.target.name,
          nodePath: group.target.path,
          visible: group.target.visible !== false,
          diffKind: 'other' as const,
          details: {
            property: `variant.${property}`,
            reference: { value: expectedValue },
            actual: { value: actualValue },
          },
        }),
      );
    }
  }

  return preserved;
}

function makeDiffPropertyKey(diff: DiffEntry): string {
  return [
    diff.nodeId ?? diff.nodePath,
    diff.diffKind ?? 'other',
    diff.details?.property ?? diff.message,
  ].join('|');
}

function findActualDiffNode(
  diff: DiffEntry,
  structure: DSStructureNode[],
  byOccurrence: Map<string, DSStructureNode>,
): DSStructureNode | null {
  if (diff.nodeId) {
    const byNodeId = structure.find((node) => node.nodeId === diff.nodeId);
    if (byNodeId) return byNodeId;
  }
  return byOccurrence.get(diff.nodePath) ?? null;
}

function findNearestInstanceOwner(
  node: DSStructureNode,
  byId: Map<number, DSStructureNode>,
): DSStructureNode | null {
  if (node.type === 'INSTANCE' && node.path.includes(' / ')) {
    return node;
  }

  let parentId = node.parentId;
  while (typeof parentId === 'number') {
    const parent = byId.get(parentId) ?? null;
    if (!parent) return null;
    if (parent.type === 'INSTANCE' && parent.path.includes(' / ')) {
      return parent;
    }
    parentId = parent.parentId;
  }
  return null;
}

function collectSubtree(
  structure: DSStructureNode[],
  rootId: number,
): DSStructureNode[] {
  const included = new Set<number>([rootId]);
  for (const node of structure) {
    if (typeof node.parentId === 'number' && included.has(node.parentId)) {
      included.add(node.id);
    }
  }
  return structure.filter((node) => included.has(node.id));
}

function alignReference(
  reference: DSStructureNode[],
  targetRootPath: string,
): DSStructureNode[] {
  const sourceRoot =
    reference.find((node) => !node.path.includes(' / '))?.path ??
    reference[0]?.path ??
    targetRootPath;
  return reference.map((node) => {
    const path =
      node.path === sourceRoot
        ? targetRootPath
        : node.path.startsWith(`${sourceRoot} / `)
          ? `${targetRootPath} / ${node.path.slice(sourceRoot.length + 3)}`
          : node.path;
    return Object.assign({}, node, { path });
  });
}

function alignNestedInstancePaths(
  reference: DSStructureNode[],
  actual: DSStructureNode[],
  resolveFamilyKey: (componentKey: string) => string,
): DSStructureNode[] {
  if (!reference.length || !actual.length) {
    return reference;
  }

  let aligned = reference.map((node) => Object.assign({}, node));
  const usedActualIds = new Set<number>();
  const referenceRoot = aligned[0];
  const actualRoot = actual[0];
  if (referenceRoot && actualRoot) {
    usedActualIds.add(actualRoot.id);
  }

  for (const referenceInstance of aligned.filter(
    (node) => node.type === 'INSTANCE' && node.id !== referenceRoot?.id,
  )) {
    const referenceKey = referenceInstance.componentInstance?.componentKey;
    if (!referenceKey) {
      continue;
    }
    const referenceParentPath = getParentPath(referenceInstance.path);
    const candidates = actual.filter((node) => {
      const actualKey = node.componentInstance?.componentKey;
      return (
        node.type === 'INSTANCE' &&
        !usedActualIds.has(node.id) &&
        Boolean(actualKey) &&
        getParentPath(node.path) === referenceParentPath &&
        resolveFamilyKey(actualKey!) === resolveFamilyKey(referenceKey)
      );
    });
    const actualInstance =
      candidates.find((candidate) =>
        variantPropertiesEqual(
          candidate.componentInstance?.variantProperties ?? {},
          referenceInstance.componentInstance?.variantProperties ?? {},
        ),
      ) ?? candidates[0];
    if (!actualInstance || actualInstance.path === referenceInstance.path) {
      if (actualInstance) usedActualIds.add(actualInstance.id);
      continue;
    }

    usedActualIds.add(actualInstance.id);
    const oldPath = referenceInstance.path;
    const newPath = actualInstance.path;
    aligned = aligned.map((node) => {
      if (node.path === oldPath) {
        return Object.assign({}, node, { path: newPath });
      }
      const prefix = `${oldPath} / `;
      return node.path.startsWith(prefix)
        ? Object.assign({}, node, {
            path: `${newPath} / ${node.path.slice(prefix.length)}`,
          })
        : node;
    });
  }

  return aligned;
}

function getParentPath(path: string): string {
  const separator = path.lastIndexOf(' / ');
  return separator >= 0 ? path.slice(0, separator) : '';
}

function variantPropertiesEqual(
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => left[key] === right[key])
  );
}

function withAssessment(
  diff: DiffEntry,
  assessment: CustomizationAssessment,
): DiffEntry {
  return Object.assign({}, diff, { assessment });
}

function withSelectedReference(
  diff: DiffEntry,
  reference: DiffValueDetails,
): DiffEntry {
  if (!diff.details) {
    return diff;
  }

  const details = Object.assign({}, diff.details, { reference });
  return Object.assign({}, diff, {
    details,
    message: formatDiffMessageWithReference(diff, reference),
  });
}

function diffDetailsAreEquivalent(diff: DiffEntry): boolean {
  const reference = diff.details?.reference;
  const actual = diff.details?.actual;
  if (!reference || !actual) {
    return false;
  }

  const referenceIdentity = canonicalDiffResourceIdentity(reference);
  const actualIdentity = canonicalDiffResourceIdentity(actual);
  return Boolean(
    referenceIdentity &&
    actualIdentity &&
    referenceIdentity === actualIdentity
  );
}

function canonicalDiffResourceIdentity(value: DiffValueDetails): string | null {
  const resourceType = value.resourceType ?? (value.bindingId || value.binding ? 'token' : null);
  if (!resourceType || resourceType === 'color') {
    return null;
  }

  const stableKey = value.binding?.key?.trim();
  if (stableKey) {
    return `${resourceType}:key:${stableKey}`;
  }

  const resourceId = value.resourceId ?? value.bindingId ?? value.binding?.id ?? null;
  if (!resourceId) {
    return null;
  }

  const normalized = resourceId.trim();
  if (!normalized) {
    return null;
  }
  if (resourceType === 'token' && normalized.startsWith('VariableID:')) {
    return `token:key:${normalized.slice('VariableID:'.length).split('/')[0].trim()}`;
  }
  if (resourceType === 'style' && normalized.startsWith('S:')) {
    return `style:key:${normalized.slice(2).split(',')[0].trim()}`;
  }
  return `${resourceType}:id:${normalized}`;
}

function formatDiffMessageWithReference(
  diff: DiffEntry,
  reference: DiffValueDetails,
): string {
  const labelEnd = diff.message.indexOf(':');
  const label = labelEnd >= 0
    ? diff.message.slice(0, labelEnd)
    : diff.details?.property ?? diff.nodeName;
  const actual = diff.details?.actual;
  return `${label}: ${formatDiffValue(reference)} → ${formatDiffValue(actual)}`;
}

function formatDiffValue(value: DiffValueDetails | undefined): string {
  if (!value) {
    return '—';
  }
  if (value.displayName) {
    return value.displayName;
  }
  return value.value == null ? '—' : String(value.value);
}

function invertOccurrenceMap(
  structure: DSStructureNode[],
): Map<string, DSStructureNode> {
  const keys = buildOccurrenceKeyMap(structure);
  return new Map(
    structure.map((node) => [keys.get(node) ?? node.path, node]),
  );
}

function extractOccurrence(occurrenceKey: string): number {
  const hidden = occurrenceKey.match(/@@hidden(\d+)$/);
  if (hidden) {
    return -(Number.parseInt(hidden[1] ?? '1', 10) || 1);
  }

  const visible = occurrenceKey.match(/@@(\d+)$/);
  return visible ? Number.parseInt(visible[1] ?? '1', 10) || 1 : 1;
}
