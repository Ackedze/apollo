import { diffStructures, type DiffEntry } from '../structure/diff';
import {
  buildOccurrenceKeyMap,
  makeOccurrenceKey,
} from '../structure/occurrenceKeys';
import type { DSStructureNode } from '../types/structures';
import type { CustomizationAssessment } from './types';
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
      diff.context.actualNestedOwnerPath ?? inferredOwner?.path ?? null;
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
): NestedContextEvidence {
  const contexts: Array<{
    matchedNodeIds: Set<string>;
    diffKeys: Set<string>;
    referenceByNodeId: Map<string, DSStructureNode>;
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

    const contextualDiffs = diffStructures(actualSubtree, alignedReference).diffs;
    contexts.push({
      matchedNodeIds,
      diffKeys: new Set(contextualDiffs.map(makeDiffPropertyKey)),
      referenceByNodeId,
    });
  }

  return {
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
            ? referenceMatchesActualDiffValue(referenceNode, diff)
            : false;
        },
      );
    },
  };
}

function referenceMatchesActualDiffValue(
  referenceNode: DSStructureNode,
  diff: DiffEntry,
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
    return matchesPaintResource(
      actual.resourceId ?? null,
      actual.value ?? null,
      actual.displayName ?? null,
      referenceNode.fill?.token ?? null,
      referenceNode.styles?.fill?.styleKey ?? null,
    );
  }
  if (property === 'stroke') {
    return matchesPaintResource(
      actual.resourceId ?? null,
      actual.value ?? null,
      actual.displayName ?? null,
      referenceNode.stroke?.token ?? null,
      referenceNode.styles?.stroke?.styleKey ?? null,
    );
  }

  const actualValue = actual.value;
  if (property === 'layout.itemSpacing') {
    return actualValue === (referenceNode.layout?.itemSpacing ?? null);
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
    normalizedActualDisplayName === token ||
    normalizedActualDisplayName === style
  );
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

  return diffs.map((diff) => {
    const isVariantDiff = isVariantPropertyDiff(diff);
    const patternDecision = evaluatePatternRules(
      options.resolvePatternContext?.(diff) ?? null,
    );

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

    if (!isVariantDiff && options.nestedContextEvidence?.explains(diff)) {
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
  });
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
      isVariantPropertyDiff(diff) ||
      diff.assessment?.verdict === 'unknown' ||
      diff.assessment?.verdict === 'violation' ||
      !diff.nodeId ||
      !collapsedNodeIds.has(diff.nodeId),
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
