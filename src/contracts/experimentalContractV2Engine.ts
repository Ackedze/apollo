import type { CustomizationAssessment } from '../assessment/types';
import type { DiffEntry } from '../structure/diff';
import type { DSStructureNode } from '../types/structures';
import { isAuditTraceEnabled } from '../utils/auditInstrumentation';
import { parseVariantName } from '../utils/variantProperties';
import type {
  ExperimentalContractV2,
  ExperimentalRuleV2,
} from './experimentalContractV2Registry';

type EvaluationVerdict = 'pass' | 'fail' | 'unknown';

type RuntimeNode = DSStructureNode & {
  componentInstance?: {
    componentKey: string;
    variantProperties?: Record<string, string>;
    componentProperties?: Record<string, string>;
    directOverrides?: Array<{ nodeId: string; fields: string[] }>;
  } | null;
};

type EvaluationContext = {
  contract: ExperimentalContractV2;
  hostComponentKey: string;
  hostComponentName: string;
  hostVariantProperties: Record<string, string>;
  nodes: RuntimeNode[];
  host: RuntimeNode;
  effectiveBaselineDiffs: DiffEntry[];
  hostVariantBaselineDiffs: DiffEntry[];
  parentMaterializedBaselineDiffs: DiffEntry[];
  resolveTokenLabel?: (token: string) => string | null;
  resolveVariableCollectionMetadata?: (
    collectionId: string,
  ) => {
    collectionId: string;
    collectionName?: string | null;
    modeNames: Record<string, string>;
  } | null;
  resolveComponentFamilyKey?: (componentKey: string) => string;
};

type RuleEvaluation = {
  verdict: EvaluationVerdict;
  target?: RuntimeNode;
  expected?: unknown;
  actual?: unknown;
  evidenceProperty?: string;
  sourceDiff?: DiffEntry;
  sourceDiffs?: Array<{ diff: DiffEntry; target: RuntimeNode }>;
};

type RuleConditionEvaluation =
  | { status: 'matched'; nodes: RuntimeNode[] }
  | { status: 'not-applicable' }
  | { status: 'unsupported' };

export type ExperimentalContractV2Evaluation = {
  diffs: DiffEntry[];
  diagnostics: {
    evaluated: number;
    violations: number;
    passed: number;
    unknown: number;
    classificationSkipped: number;
    unsupportedRuleIds: string[];
  };
};

export type ExperimentalContractV2TreeEvaluation = ExperimentalContractV2Evaluation & {
  coveredNodeIds: string[];
  scopes: Array<{
    packageId: string;
    hostComponentKey: string;
    hostComponentName: string;
    hostNodeId: string | null;
  }>;
};

const SUPPORTED_ASSERTIONS = new Set([
  'allEqual',
  'allMatch',
  'classificationPolicy',
  'componentApiValid',
  'compositionPolicy',
  'configurationPolicy',
  'countBetween',
  'stringLengthBetween',
  'visibleAndNonEmpty',
  'matchesEffectiveBaseline',
  'paintStateEquals',
  'propertiesEqual',
  'relativeOrder',
  'sequenceEquals',
  'valuePosition',
]);

/**
 * Experimental RuleIR evaluator. Unknown evidence and unsupported vocabulary are
 * deliberately non-actionable: they can never produce a violation.
 */
export function evaluateExperimentalContractV2(options: {
  contract: ExperimentalContractV2;
  hostComponentKey: string;
  hostComponentName: string;
  hostVariantProperties?: Record<string, string> | null;
  actualStructure: DSStructureNode[];
  effectiveBaselineDiffs?: DiffEntry[];
  hostVariantBaselineDiffs?: DiffEntry[];
  parentMaterializedBaselineDiffs?: DiffEntry[];
  resolveTokenLabel?: (token: string) => string | null;
  resolveVariableCollectionMetadata?: EvaluationContext['resolveVariableCollectionMetadata'];
  resolveComponentFamilyKey?: (componentKey: string) => string;
  evaluationScope?: 'all' | 'detached-structural';
}): ExperimentalContractV2Evaluation {
  const host = createHostNode(options);
  const context: EvaluationContext = {
    contract: options.contract,
    hostComponentKey: options.hostComponentKey,
    hostComponentName: options.hostComponentName,
    hostVariantProperties: options.hostVariantProperties ?? {},
    nodes: replaceRoot(options.actualStructure, host),
    host,
    effectiveBaselineDiffs: options.effectiveBaselineDiffs ?? [],
    hostVariantBaselineDiffs: options.hostVariantBaselineDiffs ?? [],
    parentMaterializedBaselineDiffs:
      options.parentMaterializedBaselineDiffs ?? [],
    resolveTokenLabel: options.resolveTokenLabel,
    resolveVariableCollectionMetadata: options.resolveVariableCollectionMetadata,
    resolveComponentFamilyKey: options.resolveComponentFamilyKey,
  };
  const result: ExperimentalContractV2Evaluation = {
    diffs: [],
    diagnostics: {
      evaluated: 0,
      violations: 0,
      passed: 0,
      unknown: 0,
      classificationSkipped: 0,
      unsupportedRuleIds: [],
    },
  };
  const claimedBaselineDiffs = new Set<string>();

  const rules = options.evaluationScope === 'detached-structural'
    ? options.contract.rules.filter(isDetachedStructuralRule)
    : options.contract.rules;

  for (const rule of rules) {
    const classificationRuleIsExecutable =
      rule.enforcement === 'classification' &&
      rule.assert.op === 'classificationPolicy';
    if (rule.enforcement !== 'enforced' && !classificationRuleIsExecutable) {
      result.diagnostics.classificationSkipped += 1;
      continue;
    }
    result.diagnostics.evaluated += 1;
    const evaluation = evaluateRule(rule, context);
    debugRuleEvaluation(rule, evaluation, context);
    debugCardImageBaselineRule(rule, evaluation, context, claimedBaselineDiffs);
    if (evaluation.verdict === 'unknown') {
      result.diagnostics.unknown += 1;
      result.diagnostics.unsupportedRuleIds.push(rule.id);
      continue;
    }
    if (evaluation.verdict === 'pass') {
      result.diagnostics.passed += 1;
      continue;
    }
    if (evaluation.sourceDiffs) {
      let emitted = 0;
      for (const match of evaluation.sourceDiffs) {
        const sourceKey = baselineDiffKey(match.diff);
        claimedBaselineDiffs.add(sourceKey);
        result.diffs.push(createViolationDiff(rule, match.target, Object.assign({}, evaluation, {
          sourceDiff: match.diff,
          sourceDiffs: undefined,
          expected: match.diff.details?.reference.value ?? null,
          actual: match.diff.details?.actual.value ?? null,
        })));
        emitted += 1;
      }
      if (emitted) result.diagnostics.violations += emitted;
      else result.diagnostics.passed += 1;
      continue;
    }
    result.diagnostics.violations += 1;
    result.diffs.push(createViolationDiff(rule, evaluation.target ?? host, evaluation));
  }

  const traceBeforePostprocess = isAuditTraceEnabled()
    ? Array.from(result.diffs)
    : null;
  const cardImageBeforePostprocess =
    context.contract.package.family === 'CardImage' &&
    context.effectiveBaselineDiffs.length &&
    !isAuditTraceEnabled() &&
    context.hostVariantBaselineDiffs.some(
      (diff) => diff.context.directHostVariantOverride === true,
    )
    ? summarizeEvaluationDiffs(result.diffs)
    : null;
  result.diffs = suppressDerivedOpacityDiffs(
    dedupeExactRulesOverBaselineRules(
      result.diffs,
      options.contract.rules,
    ),
  );
  if (cardImageBeforePostprocess) {
    console.log(`[Apollo][probe] baseline-evaluator-output ${JSON.stringify({
      hostComponentKey: context.hostComponentKey,
      beforePostprocess: cardImageBeforePostprocess,
      afterPostprocess: summarizeEvaluationDiffs(result.diffs),
    })}`);
  }
  if (traceBeforePostprocess) {
    const afterKeys = new Set(result.diffs.map(violationTraceKey));
    console.log(`[Apollo][probe] rule-output-postprocess ${JSON.stringify({
      packageId: context.contract.package.id,
      hostComponentKey: context.hostComponentKey,
      hostComponentName: context.hostComponentName,
      beforeCount: traceBeforePostprocess.length,
      afterCount: result.diffs.length,
      suppressed: summarizeEvaluationDiffs(
        traceBeforePostprocess.filter((diff) => !afterKeys.has(violationTraceKey(diff))),
      ),
      output: summarizeEvaluationDiffs(result.diffs),
    })}`);
  }
  result.diagnostics.violations = result.diffs.length;
  result.diagnostics.unsupportedRuleIds.sort();
  return result;
}

function debugCardImageBaselineRule(
  rule: ExperimentalRuleV2,
  evaluation: RuleEvaluation,
  context: EvaluationContext,
  claimedBaselineDiffs: ReadonlySet<string>,
): void {
  const hasDirectHostEvidence = context.hostVariantBaselineDiffs.some(
    (diff) => diff.context.directHostVariantOverride === true,
  );
  if (
    (!isAuditTraceEnabled() && !hasDirectHostEvidence) ||
    context.contract.package.family !== 'CardImage' ||
    rule.assert.op !== 'matchesEffectiveBaseline' ||
    !rule.id.endsWith('.visuals-follow-effective-baseline')
  ) {
    return;
  }
  const properties = Array.isArray(rule.assert.properties)
    ? rule.assert.properties.filter(
        (property: unknown): property is string => typeof property === 'string',
      )
    : [];
  const baselineDiffs = resolveAssertionBaselineDiffs(context, rule.assert);
  const selectedKeys = new Set(
    (evaluation.sourceDiffs ?? []).map((match) => baselineDiffKey(match.diff)),
  );
  const ruleSelection = resolveSelection(rule, context) ?? [];
  const candidates = baselineDiffs.map((diff) => {
    const evidenceDiff = resolveHostBaselineEvidence(diff, context, rule.assert);
    const target = findBaselineTarget(evidenceDiff, context.nodes, context);
    const selectedTarget = findBaselineTarget(evidenceDiff, ruleSelection, context);
    const actualOwner = evidenceDiff.context.actualNestedOwnerComponentKey ??
      (evidenceDiff.context.referenceOrigin === 'nested-component'
        ? evidenceDiff.context.actualComponentKey
        : null);
    const referenceOwner = evidenceDiff.context.nestedOwnerComponentKey;
    return {
      nodeId: diff.nodeId ?? null,
      nodePath: diff.nodePath,
      nodeName: diff.nodeName,
      property: diff.details?.property ?? null,
      message: diff.message,
      referenceOrigin: diff.context.referenceOrigin,
      directHostVariantOverride: diff.context.directHostVariantOverride === true,
      resolvedEvidenceNodeId: evidenceDiff.nodeId ?? null,
      resolvedDirectHostVariantOverride:
        evidenceDiff.context.directHostVariantOverride === true,
      actualOwner: actualOwner ?? null,
      actualOwnerFamily: actualOwner
        ? context.resolveComponentFamilyKey?.(actualOwner) ?? actualOwner
        : null,
      referenceOwner: referenceOwner ?? null,
      referenceOwnerFamily: referenceOwner
        ? context.resolveComponentFamilyKey?.(referenceOwner) ?? referenceOwner
        : null,
      presentation: diff.assessment?.presentation ?? null,
      allowed: matchesAllowedBaselineOverride(evidenceDiff, context, rule.assert),
      effectiveActionable: isActionableBaselineDiff(diff, context, rule.assert),
      actionable: isActionableBaselineDiff(evidenceDiff, context, rule.assert),
      descendantOfComponentReplacement:
        isDescendantVisualOfComponentReplacement(evidenceDiff, context),
      propertyMatched: properties.some((property) =>
        baselinePropertyMatches(property, evidenceDiff),
      ),
      targetFound: Boolean(target),
      targetNodeId: target?.nodeId ?? null,
      selectedTargetFound: Boolean(selectedTarget),
      selectedTargetNodeId: selectedTarget?.nodeId ?? null,
      selected: selectedKeys.has(baselineDiffKey(evidenceDiff)),
      claimedBeforeRule: claimedBaselineDiffs.has(baselineDiffKey(evidenceDiff)),
    };
  });
  console.log(`[Apollo][probe] baseline-rule-evaluation ${JSON.stringify({
    ruleId: rule.id,
    hostComponentKey: context.hostComponentKey,
    hostVariantProperties: context.hostVariantProperties,
    verdict: evaluation.verdict,
    contextNodeCount: context.nodes.length,
    ruleSelectionCount: ruleSelection.length,
    baselineDiffCount: baselineDiffs.length,
    selectedDiffCount: evaluation.sourceDiffs?.length ?? 0,
    candidates,
  })}`);
}

function summarizeEvaluationDiffs(diffs: DiffEntry[]): Array<Record<string, unknown>> {
  return diffs.map((diff) => ({
    ruleId: diff.assessment?.ruleId ?? null,
    nodeId: diff.nodeId ?? null,
    nodePath: diff.nodePath,
    property: diff.details?.property ?? null,
    message: diff.message,
  }));
}

function violationTraceKey(diff: DiffEntry): string {
  return [
    diff.assessment?.ruleId ?? '',
    diff.nodeId ?? diff.nodePath,
    canonicalViolationProperty(diff.details?.property ?? ''),
    violationEvidenceValue(diff.details?.reference?.value),
    violationEvidenceValue(diff.details?.actual?.value),
  ].join('::');
}

function debugRuleEvaluation(
  rule: ExperimentalRuleV2,
  evaluation: RuleEvaluation,
  context: EvaluationContext,
): void {
  if (!isAuditTraceEnabled()) return;
  const selection = resolveSelection(rule, context);
  const missingFacts = collectMissingRuleFacts(rule, selection ?? [], context);
  const directOverrides = new Map(
    (context.host.componentInstance?.directOverrides ?? []).map((override) => [
      override.nodeId,
      override.fields,
    ]),
  );
  console.log(`[Apollo][probe] rule-evaluation ${JSON.stringify({
    ruleId: rule.id,
    operator: rule.assert.op,
    enforcement: rule.enforcement,
    hostComponentName: context.hostComponentName,
    hostNodeId: context.host.nodeId ?? null,
    verdict: evaluation.verdict,
    selectionResolved: selection !== null,
    selectedNodeCount: selection?.length ?? 0,
    selectedNodes: (selection ?? []).slice(0, 50).map((node) => ({
      nodeId: node.nodeId ?? node.id,
      path: node.path,
      componentKey: componentKey(node, context),
      directOverrideFields: node.nodeId ? directOverrides.get(node.nodeId) ?? [] : [],
      fillToken: node.fill?.token ?? null,
      widthToken: node.layout?.widthToken ?? null,
      itemSpacingToken: node.layout?.itemSpacingToken ?? null,
      paddingTokens: node.layout?.paddingTokens ?? null,
    })),
    missingFacts,
    sourceDiffCount: evaluation.sourceDiffs?.length ?? (evaluation.sourceDiff ? 1 : 0),
    sourceDiffs: (evaluation.sourceDiffs ?? []).slice(0, 50).map((match) => ({
      nodeId: match.diff.nodeId ?? null,
      path: match.diff.nodePath,
      property: match.diff.details?.property ?? null,
      directHostVariantOverride:
        match.diff.context.directHostVariantOverride === true,
    })),
  })}`);
}

function collectMissingRuleFacts(
  rule: ExperimentalRuleV2,
  nodes: RuntimeNode[],
  context: EvaluationContext,
): string[] {
  if (!SUPPORTED_ASSERTIONS.has(rule.assert.op)) {
    return [`operator:${rule.assert.op}`];
  }
  if (!nodes.length) return ['selection.targets'];
  if (rule.assert.op === 'propertiesEqual') {
    const values = normalizePropertiesEqualValues(rule.assert);
    if (!values) return ['assert.values'];
    const missing = new Set<string>();
    for (const fact of Object.keys(values)) {
      if (nodes.every((node) => readFact(node, fact, context) === undefined)) {
        missing.add(fact);
      }
    }
    return Array.from(missing).sort();
  }
  if (
    rule.assert.op === 'configurationPolicy' &&
    (Array.isArray(rule.assert.allowedModes) || Array.isArray(rule.assert.prohibitedModes)) &&
    !context.resolveVariableCollectionMetadata
  ) {
    return ['variable.collection.metadata'];
  }
  if (rule.assert.op === 'compositionPolicy' && rule.assert.order) {
    return ['page.context'];
  }
  return [];
}

/**
 * Evaluates every distinct contract boundary in a materialized component tree.
 * Internal parts that belong to the same package as their nearest ancestor are
 * intentionally folded into that ancestor scope to avoid duplicate findings.
 */
export function evaluateExperimentalContractV2Tree(options: {
  hostComponentKey: string;
  hostComponentName: string;
  hostVariantProperties?: Record<string, string> | null;
  actualStructure: DSStructureNode[];
  effectiveBaselineDiffs?: DiffEntry[];
  rawBaselineDiffs?: DiffEntry[];
  nestedScopeBaselineDiffs?: ReadonlyMap<number, DiffEntry[]>;
  nestedScopeHostVariantBaselineDiffs?: ReadonlyMap<number, DiffEntry[]>;
  completedNestedScopeNodeIds?: ReadonlySet<number>;
  hostVariantBaselineDiffs?: DiffEntry[];
  resolveContract: (componentKey: string) => ExperimentalContractV2 | null;
  resolveTokenLabel?: (token: string) => string | null;
  resolveVariableCollectionMetadata?: EvaluationContext['resolveVariableCollectionMetadata'];
  resolveComponentFamilyKey?: (componentKey: string) => string;
}): ExperimentalContractV2TreeEvaluation {
  const result: ExperimentalContractV2TreeEvaluation = {
    diffs: [],
    diagnostics: emptyDiagnostics(),
    coveredNodeIds: [],
    scopes: [],
  };
  if (!options.actualStructure.length) return result;

  const nodesById = new Map(
    options.actualStructure.map((node) => [node.id, node]),
  );
  const scopes: Array<{
    node: DSStructureNode;
    contract: ExperimentalContractV2;
    componentKey: string;
    componentName: string;
    variantProperties: Record<string, string>;
    root: boolean;
  }> = [];
  const coveredNodeIds = new Set<string>();

  const root = options.actualStructure[0];
  const rootContract = options.resolveContract(options.hostComponentKey);
  if (rootContract) {
    if (root.nodeId) coveredNodeIds.add(root.nodeId);
    scopes.push({
      node: root,
      contract: rootContract,
      componentKey: options.hostComponentKey,
      componentName: options.hostComponentName,
      variantProperties: options.hostVariantProperties ?? {},
      root: true,
    });
  }

  for (const node of options.actualStructure.slice(1)) {
    // Hidden descendants remain available to the owning host's composition
    // selectors, but must not start an independent nested audit scope.
    if (node.visible === false) continue;
    const componentKey = node.componentInstance?.componentKey;
    if (!componentKey) continue;
    const contract = options.resolveContract(componentKey);
    if (!contract) continue;
    if (hasAncestorContractPackage(node, contract.package.id, nodesById, options.resolveContract)) {
      if (node.nodeId) coveredNodeIds.add(node.nodeId);
      continue;
    }
    if (hasAncestorContractOwnership(node, contract.package.id, nodesById, options.resolveContract)) {
      if (node.nodeId) coveredNodeIds.add(node.nodeId);
      continue;
    }
    scopes.push({
      node,
      contract,
      componentKey,
      componentName: resolveContractComponentName(contract, componentKey, node.name),
      variantProperties: node.componentInstance?.variantProperties ?? {},
      root: false,
    });
  }

  const seenDiffs = new Set<string>();
  const seenEvidence = new Set<string>();
  for (const scope of scopes) {
    if (
      !scope.root &&
      options.completedNestedScopeNodeIds !== undefined &&
      !options.completedNestedScopeNodeIds.has(scope.node.id)
    ) {
      continue;
    }
    const scopeNodes = collectScopeNodes(scope.node, options.actualStructure, nodesById);
    const effectiveBaselineDiffs = scope.root
      ? options.effectiveBaselineDiffs
      : options.nestedScopeBaselineDiffs?.get(scope.node.id) ??
        mergeScopeBaselineDiffs(
          options.effectiveBaselineDiffs ?? [],
          options.rawBaselineDiffs ?? [],
          scopeNodes,
        );
    const hostVariantBaselineDiffs = scope.root
      ? options.hostVariantBaselineDiffs
      : options.nestedScopeHostVariantBaselineDiffs?.get(scope.node.id) ??
        mergeScopeBaselineDiffs(
          [],
          options.hostVariantBaselineDiffs ?? [],
          scopeNodes,
        );
    const parentMaterializedBaselineDiffs = scope.root
      ? options.effectiveBaselineDiffs ?? []
      : mergeScopeBaselineDiffs(
          [],
          options.rawBaselineDiffs ?? [],
          scopeNodes,
        );
    const probeNestedCardImage =
      !scope.root &&
      scope.contract.package.family === 'CardImage' &&
      (hostVariantBaselineDiffs ?? []).some(
        (diff) => diff.context.directHostVariantOverride === true,
      );
    const evaluation = evaluateExperimentalContractV2({
      contract: scope.contract,
      hostComponentKey: scope.componentKey,
      hostComponentName: scope.componentName,
      hostVariantProperties: scope.variantProperties,
      actualStructure: scopeNodes,
      effectiveBaselineDiffs,
      hostVariantBaselineDiffs,
      parentMaterializedBaselineDiffs,
      resolveTokenLabel: options.resolveTokenLabel,
      resolveVariableCollectionMetadata:
        options.resolveVariableCollectionMetadata,
      resolveComponentFamilyKey: options.resolveComponentFamilyKey,
    });
    const mergeDecisions: Array<Record<string, unknown>> = [];
    mergeDiagnostics(result.diagnostics, evaluation.diagnostics);
    result.scopes.push({
      packageId: scope.contract.package.id,
      hostComponentKey: scope.componentKey,
      hostComponentName: scope.componentName,
      hostNodeId: scope.node.nodeId ?? null,
    });
    if (scope.node.nodeId) coveredNodeIds.add(scope.node.nodeId);
    for (const diff of evaluation.diffs) {
      const evidenceKey = [
        diff.nodeId ?? diff.nodePath,
        diff.details?.property ?? '',
        diff.message,
      ].join('|');
      if (seenEvidence.has(evidenceKey)) {
        if (probeNestedCardImage) {
          mergeDecisions.push({
            nodeId: diff.nodeId ?? null,
            property: diff.details?.property ?? null,
            decision: 'skip-seen-evidence',
          });
        }
        continue;
      }
      const key = [
        diff.assessment?.ruleId ?? '',
        diff.nodeId ?? diff.nodePath,
        diff.details?.property ?? '',
        diff.message,
      ].join('|');
      if (seenDiffs.has(key)) {
        if (probeNestedCardImage) {
          mergeDecisions.push({
            nodeId: diff.nodeId ?? null,
            property: diff.details?.property ?? null,
            decision: 'skip-seen-rule-diff',
          });
        }
        continue;
      }
      seenDiffs.add(key);
      seenEvidence.add(evidenceKey);
      result.diffs.push(diff);
      if (probeNestedCardImage) {
        mergeDecisions.push({
          nodeId: diff.nodeId ?? null,
          property: diff.details?.property ?? null,
          decision: 'accepted',
        });
      }
    }
    if (probeNestedCardImage) {
      console.log(`[Apollo][probe] contract-v2-lifecycle ${JSON.stringify({
        stage: 'tree-scope-merge',
        scopeNodeId: scope.node.nodeId ?? null,
        scopePath: scope.node.path,
        packageId: scope.contract.package.id,
        directEvidence: summarizeEvaluationDiffs(hostVariantBaselineDiffs ?? []),
        evaluatorOutput: summarizeEvaluationDiffs(evaluation.diffs),
        mergeDecisions,
        treeOutputAfterScope: summarizeEvaluationDiffs(result.diffs),
      })}`);
    }
  }
  result.diagnostics.violations = result.diffs.length;
  result.diagnostics.unsupportedRuleIds = Array.from(
    new Set(result.diagnostics.unsupportedRuleIds),
  ).sort();
  result.coveredNodeIds = options.actualStructure
    .map((node) => node.nodeId)
    .filter((nodeId): nodeId is string => Boolean(nodeId && coveredNodeIds.has(nodeId)));
  return result;
}

function mergeScopeBaselineDiffs(
  assessedDiffs: DiffEntry[],
  rawDiffs: DiffEntry[],
  scopeNodes: DSStructureNode[],
): DiffEntry[] {
  const nodeIds = new Set(
    scopeNodes
      .map((node) => node.nodeId)
      .filter((nodeId): nodeId is string => Boolean(nodeId)),
  );
  const nodePaths = new Set(scopeNodes.map((node) => node.path));
  const scopedRawDiffs = rawDiffs.filter((diff) =>
    diff.nodeId ? nodeIds.has(diff.nodeId) : nodePaths.has(diff.nodePath),
  );
  return mergeBaselineDiffs(assessedDiffs, scopedRawDiffs);
}

function emptyDiagnostics(): ExperimentalContractV2Evaluation['diagnostics'] {
  return {
    evaluated: 0,
    violations: 0,
    passed: 0,
    unknown: 0,
    classificationSkipped: 0,
    unsupportedRuleIds: [],
  };
}

function mergeDiagnostics(
  target: ExperimentalContractV2Evaluation['diagnostics'],
  source: ExperimentalContractV2Evaluation['diagnostics'],
): void {
  target.evaluated += source.evaluated;
  target.violations += source.violations;
  target.passed += source.passed;
  target.unknown += source.unknown;
  target.classificationSkipped += source.classificationSkipped;
  target.unsupportedRuleIds.push(...source.unsupportedRuleIds);
}

function hasAncestorContractPackage(
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
    if (parentKey && resolveContract(parentKey)?.package.id === packageId) return true;
    parentId = parent.parentId;
  }
  return false;
}

function hasAncestorContractOwnership(
  node: DSStructureNode,
  nestedPackageId: string,
  nodesById: Map<number, DSStructureNode>,
  resolveContract: (componentKey: string) => ExperimentalContractV2 | null,
): boolean {
  let parentId = node.parentId;
  while (parentId !== null) {
    const parent = nodesById.get(parentId);
    if (!parent) break;
    const parentKey = parent.componentInstance?.componentKey;
    const parentContract = parentKey ? resolveContract(parentKey) : null;
    if (parentContract && contractOwnsNestedPackage(parentContract, nestedPackageId)) return true;
    parentId = parent.parentId;
  }
  return false;
}

function contractOwnsNestedPackage(
  contract: ExperimentalContractV2,
  nestedPackageId: string,
): boolean {
  const ownership = contract.facts.contractOwnership;
  if (!ownership || typeof ownership !== 'object' || Array.isArray(ownership)) return false;
  const nestedPackages = (ownership as Record<string, unknown>).nestedPackages;
  if (!Array.isArray(nestedPackages)) return false;
  return nestedPackages.some((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const policy = entry as Record<string, unknown>;
    return policy.packageId === nestedPackageId && policy.mode === 'host-contract';
  });
}

function resolveContractComponentName(
  contract: ExperimentalContractV2,
  componentKey: string,
  fallback: string,
): string {
  const component = contract.facts.componentApi.find((entry) =>
    entry.componentKey === componentKey || entry.componentKeys?.includes(componentKey),
  );
  return component?.name ?? fallback;
}

function collectScopeNodes(
  root: DSStructureNode,
  nodes: DSStructureNode[],
  nodesById: Map<number, DSStructureNode>,
): DSStructureNode[] {
  return nodes.filter((node) => {
    if (node.id === root.id) return true;
    let parentId = node.parentId;
    while (parentId !== null) {
      if (parentId === root.id) return true;
      const parent = nodesById.get(parentId);
      if (!parent) return false;
      parentId = parent.parentId;
    }
    return false;
  });
}

function isDetachedStructuralRule(rule: ExperimentalRuleV2): boolean {
  const host = rule.select?.host;
  if (!host || typeof host !== 'object' || Array.isArray(host)) return false;
  const selector = host as Record<string, any>;
  const componentKeyCondition = selector.where?.componentKey;
  return selector.scope === 'selection-root' &&
    componentKeyCondition &&
    typeof componentKeyCondition === 'object' &&
    (
      componentKeyCondition.op === 'equals' ||
      (
        componentKeyCondition.op === 'oneOf' &&
        Array.isArray(componentKeyCondition.values)
      )
    );
}

function dedupeExactRulesOverBaselineRules(
  diffs: DiffEntry[],
  rules: ExperimentalRuleV2[],
): DiffEntry[] {
  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
  const result: DiffEntry[] = [];

  for (const diff of diffs) {
    const property = canonicalViolationProperty(diff.details?.property ?? '');
    const target = diff.nodeId || diff.nodePath;
    const reference = violationEvidenceValue(diff.details?.reference?.value);
    const actual = violationEvidenceValue(diff.details?.actual?.value);
    const candidateRule = ruleById.get(diff.assessment?.ruleId ?? '');
    const exactIndex = result.findIndex((existing) =>
      (existing.nodeId || existing.nodePath) === target &&
      canonicalViolationProperty(existing.details?.property ?? '') === property &&
      violationEvidenceValue(existing.details?.reference?.value) === reference &&
      violationEvidenceValue(existing.details?.actual?.value) === actual,
    );
    if (exactIndex >= 0) {
      const existingRule = ruleById.get(result[exactIndex].assessment?.ruleId ?? '');
      if (violationRulePriority(candidateRule) > violationRulePriority(existingRule)) {
        result[exactIndex] = diff;
      }
      continue;
    }

    const classificationConflictIndex = result.findIndex((existing) => {
      if (
        (existing.nodeId || existing.nodePath) !== target ||
        canonicalViolationProperty(existing.details?.property ?? '') !== property
      ) {
        return false;
      }
      const existingRule = ruleById.get(existing.assessment?.ruleId ?? '');
      return isClassificationRule(existingRule) !== isClassificationRule(candidateRule);
    });
    if (classificationConflictIndex >= 0) {
      const existingRule = ruleById.get(
        result[classificationConflictIndex].assessment?.ruleId ?? '',
      );
      if (violationRulePriority(candidateRule) > violationRulePriority(existingRule)) {
        result[classificationConflictIndex] = diff;
      }
      continue;
    }

    const baselineConflictIndex = result.findIndex((existing) => {
      if (
        (existing.nodeId || existing.nodePath) !== target ||
        canonicalViolationProperty(existing.details?.property ?? '') !== property
      ) {
        return false;
      }
      const existingRule = ruleById.get(existing.assessment?.ruleId ?? '');
      return isBaselineRule(existingRule) !== isBaselineRule(candidateRule);
    });
    if (baselineConflictIndex >= 0) {
      const existingRule = ruleById.get(
        result[baselineConflictIndex].assessment?.ruleId ?? '',
      );
      if (violationRulePriority(candidateRule) > violationRulePriority(existingRule)) {
        result[baselineConflictIndex] = diff;
      }
      continue;
    }
    result.push(diff);
  }

  return result;
}

function isBaselineRule(rule: ExperimentalRuleV2 | undefined): boolean {
  return rule?.assert.op === 'matchesEffectiveBaseline';
}

function isClassificationRule(rule: ExperimentalRuleV2 | undefined): boolean {
  return rule?.assert.op === 'classificationPolicy';
}

function violationRulePriority(rule: ExperimentalRuleV2 | undefined): number {
  if (!rule) return 0;
  if (rule.assert.op === 'classificationPolicy') return 100000;
  if (rule.assert.op === 'matchesEffectiveBaseline') {
    return 200000 + baselineRuleSpecificity(rule);
  }
  if (rule.assert.op === 'configurationPolicy') return 400000;
  if (rule.assert.op === 'compositionPolicy') return 450000;
  return 500000;
}

function violationEvidenceValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function suppressDerivedOpacityDiffs(diffs: DiffEntry[]): DiffEntry[] {
  const propertyOverrideTargets = new Set(
    diffs
      .filter((diff) => canonicalViolationProperty(diff.details?.property ?? '') === 'variant.Opacity')
      .map((diff) => diff.nodeId || diff.nodePath),
  );
  return diffs.filter((diff) => {
    const target = diff.nodeId || diff.nodePath;
    return canonicalViolationProperty(diff.details?.property ?? '') !== 'opacity' ||
      !propertyOverrideTargets.has(target);
  });
}

function canonicalViolationProperty(property: string): string {
  const parts = property.split('|').map((part) => part.trim()).filter(Boolean);
  if (parts.some((part) => part === 'fill' || part === 'fills' || part === 'styles.fill')) {
    return 'fill';
  }
  if (parts.some((part) => part === 'stroke' || part === 'strokes' || part === 'styles.stroke')) {
    return 'stroke';
  }
  if (parts.some((part) => part === 'textStyle' || part === 'typographyToken' || part === 'styles.text')) {
    return 'styles.text';
  }
  if (property === 'fills' || property === 'styles.fill') return 'fill';
  if (property === 'strokes' || property === 'styles.stroke') return 'stroke';
  if (property === 'textStyle' || property === 'typographyToken') return 'styles.text';
  if (property.startsWith('layout.padding.')) return property.slice('layout.'.length);
  return property;
}

function baselineRuleSpecificity(rule: ExperimentalRuleV2 | undefined): number {
  if (!rule || rule.assert.op !== 'matchesEffectiveBaseline') return 0;
  const properties = Array.isArray(rule.assert.properties)
    ? rule.assert.properties.filter((property: unknown) => typeof property === 'string')
    : [];
  const targets = rule.select?.targets;
  const targetValues = targets && typeof targets === 'object' && !Array.isArray(targets)
    ? (targets as Record<string, any>).where?.semanticRoleOrLayerName?.values
    : null;
  const targetCount = Array.isArray(targetValues) ? targetValues.length : 1000;
  return (properties.length === 1 ? 1000 : Math.max(0, 100 - properties.length)) +
    Math.max(0, 100 - targetCount);
}

function evaluateRule(
  rule: ExperimentalRuleV2,
  context: EvaluationContext,
): RuleEvaluation {
  if (!SUPPORTED_ASSERTIONS.has(rule.assert.op)) return { verdict: 'unknown' };
  const resolvedSelection = resolveSelection(rule, context);
  if (!resolvedSelection) return { verdict: 'unknown' };
  const condition = applyRuleCondition(rule.when, resolvedSelection, context);
  if (condition.status === 'unsupported') return { verdict: 'unknown' };
  if (condition.status === 'not-applicable') return { verdict: 'pass' };
  const selection = condition.nodes;

  switch (rule.assert.op) {
    case 'componentApiValid':
      return evaluateComponentApi(selection, context);
    case 'classificationPolicy':
      return evaluateClassificationPolicy(selection, rule.assert, context);
    case 'compositionPolicy':
      return evaluateCompositionPolicy(selection, rule.assert, context);
    case 'configurationPolicy':
      return evaluateConfigurationPolicy(selection, rule.assert, context);
    case 'allMatch':
      return evaluateAllMatch(selection, rule.assert, context);
    case 'allEqual':
      return evaluateAllEqual(selection, rule.assert, context);
    case 'countBetween':
      return evaluateCountBetween(selection, rule.assert);
    case 'stringLengthBetween':
      return evaluateStringLengthBetween(selection, rule.assert, context);
    case 'visibleAndNonEmpty':
      return evaluateVisibleAndNonEmpty(selection, rule.assert, context);
    case 'matchesEffectiveBaseline':
      return evaluateMatchesEffectiveBaseline(selection, rule.assert, context);
    case 'paintStateEquals':
      return evaluatePaintStateEquals(selection, rule.assert, context);
    case 'propertiesEqual':
      return evaluatePropertiesEqual(selection, rule.assert, context);
    case 'valuePosition':
      return evaluateValuePosition(selection, rule.assert, context);
    case 'relativeOrder':
      return evaluateRelativeOrder(selection, rule.assert);
    case 'sequenceEquals':
      return evaluateSequenceEquals(selection, rule.assert, context);
    default:
      return { verdict: 'unknown' };
  }
}

function evaluateClassificationPolicy(
  nodes: RuntimeNode[],
  assertion: Record<string, any>,
  context: EvaluationContext,
): RuleEvaluation {
  const classification = assertion.classification;
  const wantsComponentProperties =
    classification === 'component-properties-are-first-class' ||
    classification === 'component-property';
  const wantsManualOverrides =
    assertion.manualOverridesAllowed === false ||
    assertion.manualStyleOverridesAllowed === false;
  const wantsDesignerToggle = assertion.designerShouldNotToggleManually === true;
  if (!wantsComponentProperties && !wantsManualOverrides && !wantsDesignerToggle) {
    return { verdict: 'unknown' };
  }

  const matches: Array<{ diff: DiffEntry; target: RuntimeNode }> = [];
  for (const diff of context.effectiveBaselineDiffs) {
    if (diff.visible === false) continue;
    const property = diff.details?.property ?? '';
    const propertyMatches = wantsComponentProperties
      ? property.startsWith('variant.') || property === 'component.identity'
      : wantsDesignerToggle
        ? property.startsWith('variant.')
        : isManualStyleProperty(property);
    if (!propertyMatches) continue;
    if (wantsComponentProperties && !baselineDiffTargetsNode(diff, context.host)) {
      // Classification describes component-property changes on the current
      // contract boundary. Nested instances are evaluated by their own scope
      // or explicit host composition rules. Treating every descendant
      // componentProperties record as forbidden duplicates those rules and
      // marks valid parent-authored Button/Text variants as customizations.
      continue;
    }
    if (
      property === 'component.identity' &&
      normalizePolicyComponentName(String(diff.details?.reference?.value ?? '')) ===
        normalizePolicyComponentName(String(diff.details?.actual?.value ?? ''))
    ) {
      continue;
    }
    let evidenceDiff = diff;
    if (wantsComponentProperties && diff.context.referenceOrigin === 'nested-component') {
      const hostVariantDiff = context.hostVariantBaselineDiffs.find((candidate) =>
        baselineDiffTargetsSameProperty(candidate, diff),
      );
      // Figma exposes componentProperties overrides authored by a parent
      // variant on the nested instance as if they were instance overrides.
      // They are user customizations only when the fully materialized parent
      // variant also differs at the same node/property.
      if (!hostVariantDiff) continue;
      evidenceDiff = hostVariantDiff;
    }
    if (
      wantsComponentProperties &&
      evidenceDiff.context.directHostVariantOverride !== true
    ) {
      continue;
    }
    const target = findBaselineTarget(evidenceDiff, nodes, context);
    if (target?.visible === false) continue;
    if (target) matches.push({ diff: evidenceDiff, target });
  }
  return matches.length
    ? { verdict: 'fail', sourceDiffs: matches }
    : { verdict: 'pass' };
}

function isManualStyleProperty(property: string): boolean {
  return property === 'fill' ||
    property === 'fills' ||
    property === 'stroke' ||
    property === 'strokes' ||
    property === 'radius' ||
    property === 'cornerRadius' ||
    property === 'opacity' ||
    property === 'clipsContent' ||
    property === 'effects' ||
    property.startsWith('effects.') ||
    property.startsWith('styles.');
}

function evaluateCompositionPolicy(
  nodes: RuntimeNode[],
  assertion: Record<string, any>,
  context: EvaluationContext,
): RuleEvaluation {
  if (Array.isArray(assertion.prohibitedDescendants)) {
    const prohibited = assertion.prohibitedDescendants
      .filter((value: unknown): value is string => typeof value === 'string')
      .map(normalizePolicyComponentName);
    if (!prohibited.length) return { verdict: 'unknown' };
    const target = nodes.find((node) =>
      node !== context.host &&
      [node.name, componentName(node, context)]
        .map(normalizePolicyComponentName)
        .some((name) => prohibited.includes(name)),
    );
    return target
      ? {
          verdict: 'fail',
          target,
          expected: 'не вложен',
          actual: componentName(target, context),
          evidenceProperty: 'component.composition',
        }
      : { verdict: 'pass' };
  }
  if (
    assertion.visiblePlaceholdersInFinalLayout === 0 ||
    assertion.swapMeVisibleInFinalLayout === false
  ) {
    const placeholders = nodes.filter((node) =>
      node.visible !== false && isPlaceholderNode(node, context),
    );
    return placeholders.length
      ? {
          verdict: 'fail',
          target: placeholders[0],
          expected: 'все SwapMe заменены содержимым',
          actual: `осталось ${placeholders.length}`,
          evidenceProperty: 'component.composition',
        }
      : { verdict: 'pass' };
  }
  return { verdict: 'unknown' };
}

function normalizePolicyComponentName(value: string): string {
  return value
    .replace(/^\s*(?:❌|🔄|🔩|🔒|🔐|🛠️|🛠)\s*/u, '')
    .replace(/^\s*\[[DMT]\]\s*/u, '')
    .trim()
    .toLowerCase();
}

function isPlaceholderNode(
  node: RuntimeNode,
  context: EvaluationContext,
): boolean {
  const names = [node.name, componentName(node, context)];
  return names.some((name) =>
    typeof name === 'string' && /(?:^|[\s/_-])swap\s*me(?:$|[\s/_-])/iu.test(name),
  );
}

function evaluateConfigurationPolicy(
  nodes: RuntimeNode[],
  assertion: Record<string, any>,
  context: EvaluationContext,
): RuleEvaluation {
  if (assertion.hugWhenVerticalContentOverflows === true) {
    return evaluateHugWhenVerticalContentOverflows(nodes, context);
  }
  const modeEvaluation = evaluateAllowedVariableModes(nodes, assertion, context);
  if (modeEvaluation) return modeEvaluation;

  const manualFields = getConfigurationManualFields(assertion);
  if (manualFields.length) {
    const matches: Array<{ diff: DiffEntry; target: RuntimeNode }> = [];
    for (const node of nodes) {
      const targets = assertion.includeDescendants === true
        ? context.nodes.filter((candidate) =>
            candidate === node || candidate.path.startsWith(`${node.path} / `),
          )
        : [node];
      for (const target of targets) {
        if (hasDirectOverrideForFields(context.host, target, manualFields, assertion, context)) {
          if (
            assertion.manualTextAlignAllowed === false &&
            typeof assertion.expectedTextAlign === 'string' &&
            normalizePolicyValue(target.text?.alignHorizontal ?? '') ===
              normalizePolicyValue(assertion.expectedTextAlign)
          ) {
            // Assigning the contract value back to a nested text layer can
            // leave a native Figma override record behind. The override is no
            // longer a customization once its effective value matches the
            // contract, so do not keep the finding alive on storage metadata
            // alone.
            continue;
          }
          const property = getConfigurationEvidenceProperty(assertion);
          const expected = getConfigurationExpectedValue(assertion);
          const actual = getConfigurationActualValue(target, assertion);
          matches.push({
            target,
            diff: createRuntimePropertyDiff(target, property, expected, actual),
          });
        }
      }
    }
    return matches.length
      ? { verdict: 'fail', sourceDiffs: matches }
      : { verdict: 'pass' };
  }
  return { verdict: 'unknown' };
}

function evaluateHugWhenVerticalContentOverflows(
  nodes: RuntimeNode[],
  context: EvaluationContext,
): RuleEvaluation {
  let checked = 0;
  for (const node of nodes) {
    const sizing = node.layout?.sizing?.vertical;
    const height = node.layout?.height;
    if (sizing === 'HUG' || sizing === 'FILL') {
      checked += 1;
      continue;
    }
    if (sizing !== 'FIXED' || typeof height !== 'number') continue;
    const directChildren = context.nodes.filter((candidate) =>
      candidate.parentId === node.id &&
      candidate.visible !== false &&
      !/BackgroundPlate/i.test(candidate.name),
    );
    if (!directChildren.length) continue;
    checked += 1;
    const padding = node.layout?.padding;
    const contentHeight = directChildren.reduce(
      (sum, child) => sum + (child.layout?.height ?? 0),
      (padding?.top ?? 0) + (padding?.bottom ?? 0),
    ) + Math.max(0, directChildren.length - 1) * (node.layout?.itemSpacing ?? 0);
    if (contentHeight > height + 0.5) {
      return {
        verdict: 'fail',
        target: node,
        expected: 'HUG',
        actual: sizing,
        evidenceProperty: 'layout.sizing.vertical',
      };
    }
  }
  return checked ? { verdict: 'pass' } : { verdict: 'unknown' };
}

function evaluateAllowedVariableModes(
  nodes: RuntimeNode[],
  assertion: Record<string, any>,
  context: EvaluationContext,
): RuleEvaluation | null {
  const allowed = Array.isArray(assertion.allowedModes)
    ? assertion.allowedModes.filter((mode: unknown): mode is string => typeof mode === 'string')
    : [];
  const prohibited = Array.isArray(assertion.prohibitedModes)
    ? assertion.prohibitedModes.filter((mode: unknown): mode is string => typeof mode === 'string')
    : [];
  if (!allowed.length && !prohibited.length) return null;
  if (!context.resolveVariableCollectionMetadata) return { verdict: 'unknown' };
  const collectionNames = Array.isArray(assertion.variableCollections)
    ? assertion.variableCollections.filter(
        (name: unknown): name is string => typeof name === 'string',
      )
    : typeof assertion.variableCollection === 'string'
      ? [assertion.variableCollection]
      : [];

  let checked = 0;
  for (const node of nodes) {
    for (const mode of node.variableModes ?? []) {
      const metadata = context.resolveVariableCollectionMetadata(mode.collectionId);
      if (
        collectionNames.length &&
        !collectionNames.some(
          (name) =>
            normalizePolicyValue(name) ===
            normalizePolicyValue(metadata?.collectionName ?? ''),
        )
      ) {
        continue;
      }
      const modeId = mode.explicitModeId ?? mode.resolvedModeId;
      const modeName = modeId ? metadata?.modeNames[modeId] ?? null : null;
      if (!modeName) continue;
      checked += 1;
      const normalized = normalizePolicyValue(modeName);
      const isAllowed = allowed.some((value) => normalizePolicyValue(value) === normalized);
      const isProhibited = prohibited.some((value) => normalizePolicyValue(value) === normalized);
      if (isProhibited || (allowed.length > 0 && !isAllowed)) {
        return {
          verdict: 'fail',
          target: node,
          expected: allowed.length ? allowed.join(' | ') : `не ${prohibited.join(' | ')}`,
          actual: modeName,
          evidenceProperty: `variables.${metadata?.collectionName ?? mode.collectionId}.mode`,
        };
      }
    }
  }
  return checked ? { verdict: 'pass' } : { verdict: 'unknown' };
}

function normalizePolicyValue(value: string): string {
  return value.trim().toLowerCase().replace(/\bgray\b/g, 'grey').replace(/\s+/g, ' ');
}

function getConfigurationManualFields(assertion: Record<string, any>): string[] {
  if (assertion.manualComponentPropertiesAllowed === false) {
    return ['componentProperties', 'mainComponent'];
  }
  if (assertion.manualTextAlignAllowed === false) {
    return ['textAlignHorizontal'];
  }
  if (assertion.manualFillAllowed === false) {
    return ['fills', 'fillStyleId', 'boundVariables'];
  }
  if (assertion.manualPaddingAllowed === false) {
    return [
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'boundVariables',
    ];
  }
  if (assertion.manualItemSpacingAllowed === false) {
    return ['itemSpacing', 'boundVariables'];
  }
  if (assertion.manualWidthAllowed === false) {
    return ['width', 'layoutSizingHorizontal', 'boundVariables'];
  }
  return [];
}

function getConfigurationEvidenceProperty(assertion: Record<string, any>): string {
  if (assertion.manualComponentPropertiesAllowed === false) return 'component.identity';
  if (assertion.manualTextAlignAllowed === false) return 'text.align.horizontal';
  if (assertion.manualFillAllowed === false) return 'fill';
  if (assertion.manualPaddingAllowed === false) return 'layout.padding';
  if (assertion.manualItemSpacingAllowed === false) return 'layout.itemSpacing';
  if (assertion.manualWidthAllowed === false) return 'layout.width';
  return 'configuration';
}

function getConfigurationExpectedValue(assertion: Record<string, any>): string {
  if (assertion.manualComponentPropertiesAllowed === false) return 'штатный компонент';
  if (assertion.manualTextAlignAllowed === false) {
    return typeof assertion.expectedTextAlign === 'string'
      ? assertion.expectedTextAlign
      : 'штатное выравнивание';
  }
  return 'переменная дизайн-системы';
}

function getConfigurationActualValue(
  target: RuntimeNode,
  assertion: Record<string, any>,
): string {
  if (assertion.manualTextAlignAllowed === false) {
    return target.text?.alignHorizontal ?? 'ручное изменение';
  }
  return 'ручное изменение';
}

function hasDirectOverrideForFields(
  host: RuntimeNode,
  target: RuntimeNode,
  fields: string[],
  assertion: Record<string, any>,
  context: EvaluationContext,
): boolean {
  const directOverrides = host.componentInstance?.directOverrides ?? [];
  const override = directOverrides.find((entry) => entry.nodeId === target.nodeId);
  if (!override) return false;
  const directFields = override.fields.filter(
    (field) => field !== 'boundVariables' && fields.includes(field),
  );
  if (directFields.length) {
    return !configurationFieldsAreBound(target, assertion, directFields);
  }
  if (!fields.includes('boundVariables') || !override.fields.includes('boundVariables')) {
    return false;
  }
  if (
    assertion.manualFillAllowed === false ||
    assertion.manualItemSpacingAllowed === false ||
    assertion.manualWidthAllowed === false
  ) {
    return !hasConfigurationBindingWithoutDiff(target, assertion);
  }
  const relevantDiffs = context.effectiveBaselineDiffs.filter((diff) =>
    baselineDiffTargetsNode(diff, target) &&
    configurationDiffMatches(assertion, diff.details?.property ?? ''),
  );
  if (!relevantDiffs.length) return false;
  return relevantDiffs.some((diff) => !hasConfigurationBinding(target, assertion, diff));
}

function hasConfigurationBindingWithoutDiff(
  target: RuntimeNode,
  assertion: Record<string, any>,
): boolean {
  if (assertion.manualFillAllowed === false) return Boolean(target.fill?.token);
  if (assertion.manualItemSpacingAllowed === false) {
    return Boolean(target.layout?.itemSpacingToken);
  }
  if (assertion.manualWidthAllowed === false) {
    return Boolean(target.layout?.widthToken);
  }
  return false;
}

function configurationFieldsAreBound(
  target: RuntimeNode,
  assertion: Record<string, any>,
  directFields: string[],
): boolean {
  if (assertion.manualFillAllowed === false) {
    return Boolean(target.fill?.token);
  }
  if (assertion.manualPaddingAllowed === false) {
    const sideByField: Record<string, 'top' | 'right' | 'bottom' | 'left'> = {
      paddingTop: 'top',
      paddingRight: 'right',
      paddingBottom: 'bottom',
      paddingLeft: 'left',
    };
    const sides = directFields
      .map((field) => sideByField[field])
      .filter((side): side is 'top' | 'right' | 'bottom' | 'left' => Boolean(side));
    if (sides.length) {
      return sides.every((side) => Boolean(target.layout?.paddingTokens?.[side]));
    }
    return false;
  }
  if (assertion.manualItemSpacingAllowed === false) {
    return Boolean(target.layout?.itemSpacingToken);
  }
  if (assertion.manualWidthAllowed === false) {
    return Boolean(target.layout?.widthToken);
  }
  return false;
}

function baselineDiffTargetsNode(diff: DiffEntry, target: RuntimeNode): boolean {
  if (diff.nodeId && target.nodeId) return diff.nodeId === target.nodeId;
  return diff.nodePath === target.path;
}

function configurationDiffMatches(
  assertion: Record<string, any>,
  property: string,
): boolean {
  if (assertion.manualFillAllowed === false) {
    return property === 'fill' || property === 'fills' || property === 'styles.fill';
  }
  if (assertion.manualPaddingAllowed === false) {
    return property === 'layout.padding' ||
      property.startsWith('layout.padding.') ||
      property.startsWith('padding.');
  }
  if (assertion.manualItemSpacingAllowed === false) {
    return property === 'layout.itemSpacing' || property === 'itemSpacing';
  }
  if (assertion.manualWidthAllowed === false) {
    return property === 'layout.width' ||
      property === 'width' ||
      property === 'layout.sizing.horizontal' ||
      property === 'layoutSizingHorizontal';
  }
  return false;
}

function hasConfigurationBinding(
  target: RuntimeNode,
  assertion: Record<string, any>,
  diff: DiffEntry,
): boolean {
  if (assertion.manualFillAllowed === false) {
    return Boolean(target.fill?.token);
  }
  if (assertion.manualPaddingAllowed === false) {
    const property = diff.details?.property ?? '';
    const side = property.startsWith('layout.padding.')
      ? property.slice('layout.padding.'.length)
      : property.startsWith('padding.')
        ? property.slice('padding.'.length)
        : null;
    if (side === 'top' || side === 'right' || side === 'bottom' || side === 'left') {
      return Boolean(target.layout?.paddingTokens?.[side]);
    }
    const tokens = target.layout?.paddingTokens;
    return Boolean(tokens && (tokens.top || tokens.right || tokens.bottom || tokens.left));
  }
  if (assertion.manualItemSpacingAllowed === false) {
    return Boolean(target.layout?.itemSpacingToken);
  }
  if (assertion.manualWidthAllowed === false) {
    return Boolean(target.layout?.widthToken);
  }
  return false;
}

function evaluateMatchesEffectiveBaseline(
  nodes: RuntimeNode[],
  assertion: Record<string, any>,
  context: EvaluationContext,
): RuleEvaluation {
  if (!Array.isArray(assertion.properties) || !assertion.properties.length) {
    return { verdict: 'unknown' };
  }
  const properties = assertion.properties.filter(
    (property: unknown): property is string => typeof property === 'string' && property.length > 0,
  );
  if (!properties.length) return { verdict: 'unknown' };

  // A host-variant assertion must use the materialized host as its sole
  // baseline. Mixing standalone component diffs back in turns intentional
  // parent-authored overrides into violations (for example StatusPreset
  // choosing the Label color for each Type).
  const baselineDiffs = resolveAssertionBaselineDiffs(context, assertion);
  const matches: Array<{ diff: DiffEntry; target: RuntimeNode }> = [];
  for (const diff of baselineDiffs) {
    if (diff.visible === false) continue;
    const evidenceDiff = resolveHostBaselineEvidence(diff, context, assertion);
    if (evidenceDiff.visible === false) continue;
    if (isCleanAgainstMaterializedParent(evidenceDiff, context)) continue;
    if (!isActionableBaselineDiff(evidenceDiff, context, assertion)) continue;
    if (!properties.some((property) => baselinePropertyMatches(property, evidenceDiff))) continue;
    const target = findBaselineTarget(evidenceDiff, nodes, context);
    if (!target || target.visible === false) continue;
    matches.push({ diff: evidenceDiff, target });
  }
  return matches.length ? { verdict: 'fail', sourceDiffs: matches } : { verdict: 'pass' };
}

function isCleanAgainstMaterializedParent(
  diff: DiffEntry,
  context: EvaluationContext,
): boolean {
  if (
    context.host.parentId === null ||
    diff.context.referenceOrigin !== 'nested-component' ||
    !baselinePropertyAliases(diff.details?.property ?? '').includes('styles.text')
  ) {
    return false;
  }
  if (context.parentMaterializedBaselineDiffs.some((parentDiff) =>
    baselineDiffTargetsSameProperty(parentDiff, diff),
  )) {
    return false;
  }
  const ownerPath = context.host.path;
  return diff.nodePath === ownerPath || diff.nodePath.startsWith(`${ownerPath} / `);
}

function resolveAssertionBaselineDiffs(
  context: EvaluationContext,
  assertion: Record<string, any>,
): DiffEntry[] {
  if (assertion.baselineSource === 'host-variant') {
    // The nested scope already resolved its own exact component variant. The
    // filtered host evidence contains only directly authored changes and can
    // lose a deeper override (StatusPreset Label) when Figma also records a
    // propagated fill override on the enclosing Status. Prefer exact nested
    // evidence for nested scopes; root scopes still use the host variant.
    return context.host.parentId !== null
      ? mergeSelectedVariantBaselineDiffs(
          context.effectiveBaselineDiffs,
          context.hostVariantBaselineDiffs,
        )
      : context.hostVariantBaselineDiffs;
  }

  // Expanding a nested replacement can make its root identity disappear from
  // the effective comparison and leave only differences inside the new
  // component. Preserve directly overridden identities from the selected host
  // variant as first-class effective evidence.
  const baselineDiffs = Array.from(context.effectiveBaselineDiffs);
  for (const hostDiff of context.hostVariantBaselineDiffs) {
    if (
      hostDiff.details?.property !== 'component.identity' ||
      hostDiff.context.directHostVariantOverride !== true ||
      baselineDiffs.some((effectiveDiff) =>
        baselineDiffTargetsSameProperty(effectiveDiff, hostDiff),
      )
    ) {
      continue;
    }
    baselineDiffs.push(hostDiff);
  }
  return baselineDiffs;
}

function resolveHostBaselineEvidence(
  diff: DiffEntry,
  context: EvaluationContext,
  assertion: Record<string, any>,
): DiffEntry {
  if (
    (
      assertion.baselineSource === 'host-variant' &&
      context.host.parentId === null
    ) ||
    diff.context.referenceOrigin !== 'nested-component'
  ) {
    return diff;
  }
  return context.hostVariantBaselineDiffs.find((hostDiff) =>
    baselineDiffTargetsSameProperty(hostDiff, diff),
  ) ?? diff;
}

function mergeBaselineDiffs(
  effectiveDiffs: DiffEntry[],
  hostVariantDiffs: DiffEntry[],
): DiffEntry[] {
  const merged = new Map<string, DiffEntry>();
  for (const diff of effectiveDiffs.concat(hostVariantDiffs)) {
    merged.set(baselineDiffKey(diff), diff);
  }
  return Array.from(merged.values());
}

function mergeSelectedVariantBaselineDiffs(
  effectiveDiffs: DiffEntry[],
  hostVariantDiffs: DiffEntry[],
): DiffEntry[] {
  const result = effectiveDiffs.filter((effectiveDiff) =>
    !hostVariantDiffs.some((hostDiff) =>
      baselineDiffTargetsSameProperty(hostDiff, effectiveDiff),
    ),
  );
  return result.concat(hostVariantDiffs);
}

function isActionableBaselineDiff(
  diff: DiffEntry,
  context: EvaluationContext,
  assertion: Record<string, any>,
): boolean {
  // Contract v2 evaluates the already materialized effective baseline. Legacy
  // Expected/Allowed verdicts are advisory and must not override an exact
  // component contract. Derived diffs are the only non-actionable evidence.
  const property = diff.details?.property ?? '';
  if (
    property === 'component.identity' &&
    normalizePolicyComponentName(String(diff.details?.reference?.value ?? '')) ===
      normalizePolicyComponentName(String(diff.details?.actual?.value ?? ''))
  ) {
    return false;
  }
  if (
    property === 'component.identity' &&
    diff.context.referenceOrigin === 'nested-component' &&
    diff.context.directHostVariantOverride !== true
  ) {
    // Identity noise inside an expanded replacement (for example two `.Grid`
    // components with different keys) is not a user edit. A real nested swap
    // has native Figma override evidence, either on the node itself or on the
    // exposed-property owner that was associated before evaluation.
    return false;
  }
  if (
    diff.assessment?.presentation === 'suppress-derived' &&
    diff.context.directHostVariantOverride !== true &&
    property !== 'component.identity'
  ) {
    return false;
  }
  if (matchesAllowedBaselineOverride(diff, context, assertion)) return false;

  const actualOwner = diff.context.actualNestedOwnerComponentKey ??
    (diff.context.referenceOrigin === 'nested-component'
      ? diff.context.actualComponentKey
      : null);
  const referenceOwner = diff.context.nestedOwnerComponentKey;
  const actualFamily = actualOwner
    ? context.resolveComponentFamilyKey?.(actualOwner) ?? actualOwner
    : null;
  const referenceFamily = referenceOwner
    ? context.resolveComponentFamilyKey?.(referenceOwner) ?? referenceOwner
    : null;
  const directHostEdit = diff.context.directHostVariantOverride === true &&
    !isDescendantVisualOfComponentReplacement(diff, context);
  if (
    actualFamily &&
    referenceFamily &&
    actualFamily !== referenceFamily &&
    property !== 'component.identity' &&
    !directHostEdit
  ) {
    // A nested component swap changes the entire descendant visual tree. Those
    // paints/layout values cannot be compared with the previous owner's
    // baseline; the swap itself remains available as component-property evidence.
    return false;
  }

  if (
    assertion.baselineSource !== 'host-variant' &&
    Array.isArray(assertion.properties) &&
    shouldResolveNestedBaselineAgainstHost(assertion.properties, diff) &&
    diff.context.referenceOrigin === 'nested-component' &&
    actualFamily &&
    referenceFamily &&
    actualFamily === referenceFamily &&
    !context.hostVariantBaselineDiffs.some((hostDiff) =>
      baselineDiffTargetsSameProperty(hostDiff, diff),
    )
  ) {
    // The nested component's standalone baseline may intentionally be
    // overridden by its parent variant. This applies to exact properties such
    // as styles.text as well as wildcard groups. If the full host baseline is
    // clean, that override is expected rather than a user customization.
    return false;
  }

  return true;
}

function isDescendantVisualOfComponentReplacement(
  diff: DiffEntry,
  context: EvaluationContext,
): boolean {
  return context.effectiveBaselineDiffs.some((candidate) => {
    if (candidate.details?.property !== 'component.identity') return false;
    if (
      normalizePolicyComponentName(
        String(candidate.details?.reference?.value ?? ''),
      ) === normalizePolicyComponentName(
        String(candidate.details?.actual?.value ?? ''),
      )
    ) {
      // Catalog expansion can resolve two keys from the same public component
      // and emit technical identity noise such as `Status → Status`. It is not
      // a replacement boundary and must not suppress a direct visual override
      // on a deeper node such as StatusPreset / Status / Label.
      return false;
    }
    return diff.nodePath === candidate.nodePath ||
      diff.nodePath.startsWith(`${candidate.nodePath} / `);
  });
}

function matchesAllowedBaselineOverride(
  diff: DiffEntry,
  context: EvaluationContext,
  assertion: Record<string, any>,
): boolean {
  const policies = context.contract.rules.flatMap((rule) =>
    Array.isArray(rule.assert.allowedBaselineOverrides)
      ? rule.assert.allowedBaselineOverrides
      : [],
  );
  return policies.some((rawPolicy: unknown) => {
    if (!rawPolicy || typeof rawPolicy !== 'object' || Array.isArray(rawPolicy)) {
      return false;
    }
    const policy = rawPolicy as Record<string, unknown>;
    const hostVariant = policy.hostVariant;
    if (
      hostVariant &&
      (
        typeof hostVariant !== 'object' ||
        Array.isArray(hostVariant) ||
        !variantConditionMatches(
          hostVariant as Record<string, string | string[]>,
          context.hostVariantProperties,
        )
      )
    ) {
      return false;
    }

    const properties = Array.isArray(policy.properties)
      ? policy.properties.filter((value): value is string => typeof value === 'string')
      : typeof policy.property === 'string'
        ? [policy.property]
        : [];
    if (
      properties.length &&
      !properties.some((property) => baselinePropertyMatches(property, diff))
    ) {
      return false;
    }

    const targetNames = Array.isArray(policy.targetNames)
      ? policy.targetNames.filter((value): value is string => typeof value === 'string')
      : [];
    if (targetNames.length && !targetNames.includes(diff.nodeName)) {
      return false;
    }

    const pathSuffixes = Array.isArray(policy.pathSuffixes)
      ? policy.pathSuffixes.filter((value): value is string => typeof value === 'string')
      : [];
    if (
      pathSuffixes.length &&
      !pathSuffixes.some((suffix) =>
        diff.nodePath === suffix || diff.nodePath.endsWith(suffix),
      )
    ) {
      return false;
    }

    const actualResourceTypes = Array.isArray(policy.actualResourceTypes)
      ? policy.actualResourceTypes.filter((value): value is string => typeof value === 'string')
      : [];
    if (
      actualResourceTypes.length &&
      !actualResourceTypes.includes(diff.details?.actual.resourceType ?? '')
    ) {
      return false;
    }
    return true;
  });
}

function shouldResolveNestedBaselineAgainstHost(
  properties: unknown[],
  diff: DiffEntry,
): boolean {
  const declared = properties.filter(
    (property): property is string => typeof property === 'string',
  );
  if (declared.some((property) => property.endsWith('.*'))) {
    return true;
  }

  const aliases = baselinePropertyAliases(diff.details?.property ?? '');
  return aliases.includes('styles.text') &&
    declared.some((property) => property === 'styles.text' || property === 'style.text');
}

function baselineDiffTargetsSameProperty(left: DiffEntry, right: DiffEntry): boolean {
  const sameNode = left.nodeId && right.nodeId
    ? left.nodeId === right.nodeId
    : left.nodePath === right.nodePath;
  return Boolean(sameNode) &&
    (left.details?.property ?? '') === (right.details?.property ?? '');
}

function baselinePropertyMatches(pattern: string, diff: DiffEntry): boolean {
  const property = diff.details?.property ?? '';
  const aliases = baselinePropertyAliases(property);
  if (aliases.includes(pattern)) return true;
  if (pattern.endsWith('*') && !pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -1);
    return aliases.some((alias) => alias.startsWith(prefix));
  }
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2);
    return aliases.some((alias) => alias === prefix || alias.startsWith(`${prefix}.`));
  }
  return aliases.some((alias) => pattern.endsWith(`.${alias}`));
}

function baselinePropertyAliases(property: string): string[] {
  const aliases = new Set([property]);
  if (property === 'layout.sizing.horizontal') aliases.add('layoutSizingHorizontal');
  if (property === 'layout.sizing.vertical') aliases.add('layoutSizingVertical');
  if (
    property === 'textStyle' ||
    property === 'typographyToken' ||
    property === 'style.text'
  ) {
    aliases.add('styles.text');
  }
  if (property === 'styles.text') aliases.add('style.text');
  if (property === 'text.align.horizontal') aliases.add('styles.text');
  if (property === 'cornerRadius') aliases.add('radius');
  if (property === 'fills' || property === 'styles.fill') aliases.add('fill');
  if (property === 'strokes' || property === 'styles.stroke') aliases.add('stroke');
  if (property.startsWith('layout.padding.')) aliases.add(property.slice('layout.'.length));
  if (property.startsWith('padding.')) aliases.add(`layout.${property}`);
  if (property === 'effects') aliases.add('effects.*');
  return Array.from(aliases);
}

function findBaselineTarget(
  diff: DiffEntry,
  nodes: RuntimeNode[],
  context: EvaluationContext,
): RuntimeNode | null {
  if (diff.nodeId) {
    const byId = nodes.find((node) => node.nodeId === diff.nodeId);
    if (byId) return byId;

    const ownerKey = diff.context.actualNestedOwnerComponentKey ??
      (diff.context.referenceOrigin === 'nested-component'
        ? diff.context.actualComponentKey
        : null);
    if (!ownerKey) return null;
    const ownerFamily = context.resolveComponentFamilyKey?.(ownerKey) ?? ownerKey;
    return nodes.find((node) => {
      if (!diff.nodePath.startsWith(`${node.path} / `)) return false;
      const targetKey = componentKey(node, context);
      const targetFamily = targetKey
        ? context.resolveComponentFamilyKey?.(targetKey) ?? targetKey
        : null;
      return targetFamily === ownerFamily;
    }) ?? null;
  }
  return nodes.find((node) =>
    node.path === diff.nodePath ||
    diff.nodePath.startsWith(`${node.path} / `),
  ) ?? null;
}

function baselineDiffKey(diff: DiffEntry): string {
  return [diff.nodeId ?? '', diff.nodePath, diff.details?.property ?? '', diff.message].join('|');
}

function applyRuleCondition(
  condition: ExperimentalRuleV2['when'],
  nodes: RuntimeNode[],
  context: EvaluationContext,
): RuleConditionEvaluation {
  if (condition?.op === 'evidenceComplete') return { status: 'matched', nodes };
  if (condition?.op !== 'all' || !condition.clauses || typeof condition.clauses !== 'object') {
    return { status: 'unsupported' };
  }
  const clauses = condition.clauses as Record<string, unknown>;
  for (const field of Object.keys(clauses)) {
    if (
      field !== 'component' &&
      field !== 'hostVariant' &&
      field !== 'variant' &&
      field !== 'except'
    ) return { status: 'unsupported' };
  }
  if (typeof clauses.component === 'string' && !hostComponentMatches(clauses.component, context)) {
    return { status: 'not-applicable' };
  }
  if (clauses.hostVariant !== undefined) {
    const expectedHostVariant = readVariantCondition(clauses.hostVariant);
    if (!expectedHostVariant) return { status: 'unsupported' };
    if (!variantConditionMatches(expectedHostVariant, ruleProperties(context.host, context))) {
      return { status: 'not-applicable' };
    }
  }
  if (clauses.variant !== undefined) {
    const expectedVariant = readVariantCondition(clauses.variant);
    if (!expectedVariant) return { status: 'unsupported' };
    const properties = Object.keys(expectedVariant);
    const targetOwnsVariantProperty = nodes.some((node) => {
      const variants = ruleProperties(node, context);
      return properties.some((property) => variants[property] !== undefined);
    });
    if (targetOwnsVariantProperty) {
      const matchingOwners = nodes.filter((node) =>
        variantConditionMatches(expectedVariant, ruleProperties(node, context)),
      );
      nodes = nodes.filter((node) =>
        matchingOwners.some((owner) =>
          node === owner || node.path.startsWith(`${owner.path} / `),
        ),
      );
      if (!nodes.length) return { status: 'not-applicable' };
    } else if (!variantConditionMatches(expectedVariant, ruleProperties(context.host, context))) {
      return { status: 'not-applicable' };
    }
  }
  if (clauses.except !== undefined) {
    if (!clauses.except || typeof clauses.except !== 'object' || Array.isArray(clauses.except)) {
      return { status: 'unsupported' };
    }
    const exception = clauses.except as Record<string, unknown>;
    for (const field of Object.keys(exception)) {
      if (field !== 'component' && field !== 'variant') return { status: 'unsupported' };
    }
    const componentMatches = typeof exception.component !== 'string' ||
      hostComponentMatches(exception.component, context);
    const variantMatches = exception.variant === undefined ||
      variantConditionMatches(exception.variant, ruleProperties(context.host, context));
    if (componentMatches && variantMatches) return { status: 'not-applicable' };
  }
  return { status: 'matched', nodes };
}

function hostComponentMatches(expected: string, context: EvaluationContext): boolean {
  const normalize = (value: string) => value
    .replace(/^\s*🔒\s*/, '')
    .replace(/^\s*\[[DM]\]\s*/, '')
    .replace(/\s+/g, '')
    .toLowerCase();
  const target = normalize(expected);
  return normalize(context.hostComponentName).includes(target) ||
    normalize(context.contract.package.family).includes(target) ||
    context.contract.package.id === expected;
}

function variantConditionMatches(
  condition: unknown,
  actual: Record<string, string>,
): boolean {
  const expected = readVariantCondition(condition);
  if (!expected) return false;
  return Object.entries(expected).every(([property, value]) =>
    Array.isArray(value)
      ? value.includes(actual[property])
      : actual[property] === value,
  );
}

function readVariantCondition(
  condition: unknown,
): Record<string, string | string[]> | null {
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return null;
  const expected = condition as Record<string, unknown>;
  if (Object.values(expected).some((value) =>
    typeof value !== 'string' &&
    !(Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string')),
  )) return null;
  return expected as Record<string, string | string[]>;
}

function resolveSelection(
  rule: ExperimentalRuleV2,
  context: EvaluationContext,
): RuntimeNode[] | null {
  const hostDefinition = resolveSelectorDefinition(rule.select.host, context);
  if (!hostDefinition) return null;
  const hostMatches = selectNodes(hostDefinition, context, true);
  if (!hostMatches || !hostMatches.length) return null;
  const targetDefinition = resolveSelectorDefinition(rule.select.targets, context);
  return targetDefinition ? selectNodes(targetDefinition, context, false) : null;
}

function resolveSelectorDefinition(
  selector: unknown,
  context: EvaluationContext,
): Record<string, any> | null {
  if (typeof selector === 'string') {
    const resolved = context.contract.facts.selectors[selector];
    return resolved && typeof resolved === 'object' && !Array.isArray(resolved)
      ? (resolved as Record<string, any>)
      : null;
  }
  return selector && typeof selector === 'object' && !Array.isArray(selector)
    ? (selector as Record<string, any>)
    : null;
}

function selectNodes(
  selector: Record<string, any>,
  context: EvaluationContext,
  selectingHost: boolean,
): RuntimeNode[] | null {
  const scope = selector.scope;
  let candidates: RuntimeNode[];
  if (scope === 'selection-root') candidates = [context.host];
  else if (scope === 'self-and-descendants') candidates = context.nodes;
  else if (scope === 'descendants') candidates = context.nodes.slice(1);
  else if (scope === undefined && selectingHost) candidates = [context.host];
  else return null;

  const result: RuntimeNode[] = [];
  for (const node of candidates) {
    const matches = matchesWhere(node, selector.where, context);
    if (matches === null) return null;
    if (matches) result.push(node);
  }
  return result;
}

function matchesWhere(
  node: RuntimeNode,
  where: unknown,
  context: EvaluationContext,
): boolean | null {
  if (where === undefined) return true;
  if (!where || typeof where !== 'object' || Array.isArray(where)) return null;
  for (const [field, condition] of Object.entries(where as Record<string, unknown>)) {
    let value: unknown;
    if (field === 'componentKey') value = componentKey(node, context);
    else if (field === 'componentName') value = componentName(node, context);
    else if (field === 'visible') value = node.visible;
    else if (field === 'semanticRoleOrLayerName') {
      const candidates = Array.from(new Set([
        node === context.host ? 'root' : null,
        node.path || node.name,
        node.name,
        componentName(node, context),
        normalizeSemanticRoleName(node.name),
        normalizeSemanticRoleName(componentName(node, context)),
      ].filter((candidate): candidate is string => Boolean(candidate))));
      const results = candidates.map((candidate) => evaluateCondition(candidate, condition));
      if (results.some((matched) => matched === true)) continue;
      if (results.some((matched) => matched === null)) return null;
      return false;
    }
    else return null;
    const matched = evaluateCondition(value, condition);
    if (matched === null) return null;
    if (!matched) return false;
  }
  return true;
}

function normalizeSemanticRoleName(value: string): string {
  return value
    .replace(/^\s*(?:🔩|🔒|🔐|🛠️|🛠)\s*/u, '')
    .replace(/^\s*\[[DM]\]\s*/, '')
    .trim();
}

function evaluateCondition(value: unknown, condition: unknown): boolean | null {
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return null;
  const record = condition as Record<string, any>;
  if (record.op === 'equals') return value === record.value;
  if (record.op === 'oneOf' && Array.isArray(record.values)) {
    if (record.values.includes(value)) return true;
    if (typeof value === 'string') {
      return record.values.some((candidate: unknown) =>
        typeof candidate === 'string' &&
        (value === candidate || value.endsWith(` / ${candidate}`)),
      );
    }
    return false;
  }
  return null;
}

function evaluateComponentApi(
  nodes: RuntimeNode[],
  context: EvaluationContext,
): { verdict: EvaluationVerdict; target?: RuntimeNode; expected?: unknown; actual?: unknown } {
  const apiByKey = new Map(
    context.contract.facts.componentApi.flatMap((entry) =>
      (entry.componentKeys?.length ? entry.componentKeys : [entry.componentKey])
        .map((key) => [key, entry] as const),
    ),
  );
  let checked = 0;
  for (const node of nodes) {
    const key = componentKey(node, context);
    const api = key ? apiByKey.get(key) : null;
    if (!api) continue;
    checked += 1;
    const actual = variantProperties(node, context);
    const declaredProperties = Object.fromEntries(
      Object.entries(api.publicApi.properties).filter(([property]) => property !== 'raw'),
    );
    for (const [property, value] of Object.entries(actual)) {
      const allowed = declaredProperties[property];
      if (!allowed || !allowed.includes(value)) {
        return { verdict: 'fail', target: node, expected: allowed ?? [], actual: `${property}=${value}` };
      }
    }
    const combinations = Object.keys(declaredProperties).length
      ? api.publicApi.allowedCombinations.map((candidate) =>
          Object.fromEntries(
            Object.entries(candidate).filter(([property]) => property !== 'raw'),
          ),
        )
      : [];
    if (combinations.length && !combinations.some((candidate) => combinationMatches(candidate, actual))) {
      return { verdict: 'fail', target: node, expected: combinations, actual };
    }
  }
  return { verdict: checked ? 'pass' : 'unknown' };
}

function evaluateAllMatch(
  nodes: RuntimeNode[],
  assertion: Record<string, any>,
  context: EvaluationContext,
) {
  if (!nodes.length || !assertion.predicate) return { verdict: 'unknown' as const };
  const predicate = assertion.predicate as Record<string, any>;
  for (const node of nodes) {
    const fact = readFact(node, predicate.fact, context);
    if (fact === undefined) return { verdict: 'unknown' as const };
    if (predicate.op === 'equalsFact') {
      if (typeof predicate.expectedFact !== 'string') {
        return { verdict: 'unknown' as const };
      }
      const expected = readFact(context.host, predicate.expectedFact, context);
      if (expected === undefined) return { verdict: 'unknown' as const };
      if (fact !== expected) {
        return { verdict: 'fail' as const, target: node, expected, actual: fact };
      }
      continue;
    }
    const matches = evaluateCondition(fact, predicate);
    if (matches === null) return { verdict: 'unknown' as const };
    if (!matches) {
      return {
        verdict: 'fail' as const,
        target: node,
        expected: predicate.values ?? predicate.value,
        actual: fact,
      };
    }
  }
  return { verdict: 'pass' as const };
}

function evaluateAllEqual(
  nodes: RuntimeNode[],
  assertion: Record<string, any>,
  context: EvaluationContext,
) {
  const comparableNodes = assertion.strategy?.strategy === 'all-visible-targets-equal'
    ? nodes.filter((node) => node.visible !== false)
    : nodes;
  if (!comparableNodes.length) return { verdict: 'unknown' as const };
  const facts = typeof assertion.fact === 'string'
    ? [assertion.fact]
    : Array.isArray(assertion.facts) && assertion.facts.every((fact: unknown) => typeof fact === 'string')
      ? assertion.facts as string[]
      : null;
  if (!facts?.length) return { verdict: 'unknown' as const };
  const evidence = comparableNodes.flatMap((node) => {
    for (const fact of facts) {
      const value = readFact(node, fact, context);
      if (value !== undefined) return [{ node, value }];
    }
    return [];
  });
  if (!evidence.length) return { verdict: 'unknown' as const };
  const first = JSON.stringify(evidence[0].value);
  const mismatch = evidence.findIndex(
    (entry) => JSON.stringify(entry.value) !== first,
  );
  if (mismatch < 0) return { verdict: 'pass' as const };

  const baselineSources = evidence.flatMap((entry) => {
    const diff = findBaselineSourceDiff(entry.node, facts, assertion, context);
    return diff ? [{ diff, target: entry.node }] : [];
  });
  if (baselineSources.length) {
    return { verdict: 'fail' as const, sourceDiffs: baselineSources };
  }

  if (facts.some(isTypographyStyleFact)) {
    // allEqual describes a relation, not a baseline. Without a materialized
    // text-style diff Apollo cannot know which sibling is canonical and must
    // not offer a reset that would detach the current style.
    return { verdict: 'unknown' as const };
  }

  const referenceEvidence = facts.some(isPaintFact)
    ? selectMostFrequentEvidence(evidence)
    : evidence[0];
  const mismatchEvidence = evidence.find(
    (entry) => JSON.stringify(entry.value) !== JSON.stringify(referenceEvidence.value),
  );
  if (!mismatchEvidence) return { verdict: 'pass' as const };
  const sourceDiff = createRelationalPaintSourceDiff(
    referenceEvidence.node,
    mismatchEvidence.node,
    facts,
    referenceEvidence.value,
    mismatchEvidence.value,
  );
  return {
    verdict: 'fail' as const,
    target: mismatchEvidence.node,
    expected: referenceEvidence.value,
    actual: mismatchEvidence.value,
    sourceDiff,
  };
}

function isTypographyStyleFact(fact: string): boolean {
  return fact === 'style.text' || fact === 'styles.text';
}

function isPaintFact(fact: string): boolean {
  return fact === 'fill' || fact === 'fills' || fact === 'stroke' || fact === 'strokes';
}

function selectMostFrequentEvidence<T extends { value: unknown }>(evidence: T[]): T {
  const groups = new Map<string, { count: number; entry: T }>();
  for (const entry of evidence) {
    const key = JSON.stringify(entry.value);
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { count: 1, entry });
  }
  return Array.from(groups.values()).reduce((best, candidate) =>
    candidate.count > best.count ? candidate : best,
  ).entry;
}

function createRelationalPaintSourceDiff(
  referenceNode: RuntimeNode,
  target: RuntimeNode,
  facts: string[],
  expected: unknown,
  actual: unknown,
): DiffEntry | undefined {
  const property = facts.some((fact) => fact === 'fill' || fact === 'fills')
    ? 'fill'
    : facts.some((fact) => fact === 'stroke' || fact === 'strokes')
      ? 'stroke'
      : null;
  if (!property) return undefined;
  const referencePaint = property === 'fill' ? referenceNode.fill : referenceNode.stroke;
  const actualPaint = property === 'fill' ? target.fill : target.stroke;
  if (!referencePaint?.token) return undefined;

  const referenceValue = stringifyEvidence(expected);
  const actualValue = stringifyEvidence(actual);
  return {
    message: `${formatContractPropertyLabel(property)}: ${referenceValue ?? '—'} → ${actualValue ?? '—'}`,
    nodePath: target.path,
    nodeName: target.name,
    nodeId: target.nodeId,
    visible: target.visible,
    context: createRuntimeDiffContext(target),
    diffKind: 'paint',
    details: {
      property,
      reference: {
        value: referenceValue,
        resourceType: 'token',
        resourceId: referencePaint.token,
        bindingId: referencePaint.token,
      },
      actual: {
        value: actualValue,
        resourceType: actualPaint?.token
          ? 'token'
          : actualPaint?.color
            ? 'color'
            : undefined,
        resourceId: actualPaint?.token ?? null,
        bindingId: actualPaint?.token ?? null,
      },
    },
  };
}

function findBaselineSourceDiff(
  target: RuntimeNode,
  facts: string[],
  assertion: Record<string, any>,
  context: EvaluationContext,
): DiffEntry | undefined {
  return mergeBaselineDiffs(
    context.effectiveBaselineDiffs,
    context.hostVariantBaselineDiffs,
  ).find((diff) => {
    const targetsNode = target.nodeId && diff.nodeId
      ? target.nodeId === diff.nodeId
      : target.path === diff.nodePath;
    if (!targetsNode || !facts.some((fact) => baselinePropertyMatches(fact, diff))) {
      return false;
    }
    return isActionableBaselineDiff(diff, context, assertion) &&
      stringifyEvidence(diff.details?.reference?.value) !==
        stringifyEvidence(diff.details?.actual?.value);
  });
}

function evaluateCountBetween(nodes: RuntimeNode[], assertion: Record<string, any>) {
  if (!Number.isFinite(assertion.min) || !Number.isFinite(assertion.max)) {
    return { verdict: 'unknown' as const };
  }
  return nodes.length >= assertion.min && nodes.length <= assertion.max
    ? { verdict: 'pass' as const }
    : { verdict: 'fail' as const, target: nodes[0], expected: `${assertion.min}-${assertion.max}`, actual: nodes.length };
}

function evaluateStringLengthBetween(
  nodes: RuntimeNode[],
  assertion: Record<string, any>,
  context: EvaluationContext,
): RuleEvaluation {
  if (
    typeof assertion.property !== 'string' ||
    !Number.isFinite(assertion.min) ||
    !Number.isFinite(assertion.max)
  ) {
    return { verdict: 'unknown' };
  }
  const matches: Array<{ diff: DiffEntry; target: RuntimeNode }> = [];
  let checked = 0;
  for (const node of nodes) {
    const value = readFact(node, assertion.property, context);
    if (typeof value !== 'string') continue;
    checked += 1;
    const length = Array.from(value).length;
    if (length < assertion.min || length > assertion.max) {
      matches.push({
        target: node,
        diff: createRuntimePropertyDiff(
          node,
          assertion.property,
          `${assertion.min}-${assertion.max}`,
          length,
        ),
      });
    }
  }
  return matches.length
    ? { verdict: 'fail', sourceDiffs: matches }
    : checked
      ? { verdict: 'pass' }
      : { verdict: 'unknown' };
}

function evaluateVisibleAndNonEmpty(
  nodes: RuntimeNode[],
  assertion: Record<string, any>,
  context: EvaluationContext,
): RuleEvaluation {
  if (!nodes.length || typeof assertion.property !== 'string') {
    return { verdict: 'unknown' };
  }
  const matches: Array<{ diff: DiffEntry; target: RuntimeNode }> = [];
  let checked = 0;
  for (const node of nodes) {
    const value = readFact(node, assertion.property, context);
    if (value === undefined) continue;
    checked += 1;
    if (node.visible === false || (typeof value === 'string' && value.trim() === '')) {
      matches.push({
        target: node,
        diff: createRuntimePropertyDiff(
          node,
          node.visible === false ? 'target.visible' : assertion.property,
          node.visible === false ? true : 'непустое значение',
          node.visible === false ? false : value,
        ),
      });
    }
  }
  return matches.length
    ? { verdict: 'fail', sourceDiffs: matches }
    : checked
      ? { verdict: 'pass' }
      : { verdict: 'unknown' };
}

function evaluatePaintStateEquals(
  nodes: RuntimeNode[],
  assertion: Record<string, any>,
  context: EvaluationContext,
) {
  if (!assertion.state || typeof assertion.state !== 'object' || Array.isArray(assertion.state)) {
    return { verdict: 'unknown' as const };
  }
  const state = assertion.state as Record<string, unknown>;
  const entries = Object.entries(state);
  if (!entries.length) return { verdict: 'unknown' as const };
  if (!nodes.length) return { verdict: 'pass' as const };
  for (const [paintField, expectedState] of entries) {
    if ((paintField !== 'fill' && paintField !== 'stroke') || expectedState !== 'none-or-not-visible') {
      return { verdict: 'unknown' as const };
    }
    for (const node of nodes) {
      const paint = paintField === 'fill' ? node.fill : node.stroke;
      const style = paintField === 'fill' ? node.styles?.fill : node.styles?.stroke;
      const rawActual = paint?.token ?? paint?.color ?? style?.styleKey ?? null;
      const actual = paint?.token && context.resolveTokenLabel
        ? context.resolveTokenLabel(paint.token) ?? rawActual
        : rawActual;
      if (actual !== null && actual !== '') {
        return {
          verdict: 'fail' as const,
          target: node,
          expected: `без видимой ${paintField === 'fill' ? 'заливки' : 'обводки'}`,
          actual,
        };
      }
    }
  }
  return { verdict: 'pass' as const };
}

function evaluatePropertiesEqual(
  nodes: RuntimeNode[],
  assertion: Record<string, any>,
  context: EvaluationContext,
) {
  if (!nodes.length || assertion.when) return { verdict: 'unknown' as const };
  const values = normalizePropertiesEqualValues(assertion);
  if (!values) {
    return { verdict: 'unknown' as const };
  }
  const mismatches: Array<{ diff: DiffEntry; target: RuntimeNode }> = [];
  let checked = 0;
  for (const node of nodes) {
    const actualValues = Object.entries(values).map(([factName, expected]) => ({
      factName,
      expected,
      actual: readFact(node, factName, context),
    }));
    if (actualValues.some((entry) => entry.actual === undefined)) continue;
    checked += 1;
    const nodeMismatches: Array<{ diff: DiffEntry; target: RuntimeNode }> = [];
    for (const { factName, expected, actual } of actualValues) {
      if (actual !== expected) {
        const property = canonicalFactProperty(factName);
        nodeMismatches.push({
          target: node,
          diff: {
            message: `${formatContractPropertyLabel(property)}: ${stringifyEvidence(expected) ?? '—'} → ${stringifyEvidence(actual) ?? '—'}`,
            nodePath: node.path,
            nodeName: node.name,
            nodeId: node.nodeId,
            visible: node.visible,
            context: createRuntimeDiffContext(node),
            diffKind: property === 'opacity' ? 'opacity' : 'other',
            details: {
              property,
              reference: { value: stringifyEvidence(expected) },
              actual: { value: stringifyEvidence(actual) },
            },
          },
        });
      }
    }
    mismatches.push(...collapseAlignmentMismatches(node, nodeMismatches));
  }
  return mismatches.length
    ? { verdict: 'fail' as const, sourceDiffs: mismatches }
    : checked
      ? { verdict: 'pass' as const }
      : { verdict: 'unknown' as const };
}

function normalizePropertiesEqualValues(
  assertion: Record<string, any>,
): Record<string, unknown> | null {
  if (
    assertion.values &&
    typeof assertion.values === 'object' &&
    !Array.isArray(assertion.values)
  ) {
    return assertion.values as Record<string, unknown>;
  }
  if (
    Array.isArray(assertion.properties) &&
    assertion.properties.length > 0 &&
    assertion.properties.every(
      (property: unknown) => typeof property === 'string' && property.length > 0,
    ) &&
    Object.prototype.hasOwnProperty.call(assertion, 'value')
  ) {
    const values: Record<string, unknown> = {};
    for (const property of assertion.properties as string[]) {
      values[property] = assertion.value;
    }
    return values;
  }
  return null;
}

function collapseAlignmentMismatches(
  node: RuntimeNode,
  mismatches: Array<{ diff: DiffEntry; target: RuntimeNode }>,
): Array<{ diff: DiffEntry; target: RuntimeNode }> {
  const primary = mismatches.find(
    ({ diff }) => diff.details?.property === 'layout.primaryAxisAlignItems',
  );
  const counter = mismatches.find(
    ({ diff }) => diff.details?.property === 'layout.counterAxisAlignItems',
  );
  if (!primary || !counter || !primary.diff.details || !counter.diff.details) {
    return mismatches;
  }

  const expected = formatAlignmentPosition(
    node.layout?.direction ?? null,
    primary.diff.details.reference.value,
    counter.diff.details.reference.value,
  );
  const actual = formatAlignmentPosition(
    node.layout?.direction ?? null,
    primary.diff.details.actual.value,
    counter.diff.details.actual.value,
  );
  const composite: DiffEntry = Object.assign({}, primary.diff, {
    message: `Выравнивание: ${expected} → ${actual}`,
    diffKind: 'layout',
    details: {
      property: 'layout.alignment',
      reference: { value: expected },
      actual: { value: actual },
      atomicChanges: [primary.diff.details, counter.diff.details],
    },
  });
  return [
    { diff: composite, target: node },
    ...mismatches.filter((mismatch) => mismatch !== primary && mismatch !== counter),
  ];
}

function formatAlignmentPosition(
  direction: 'H' | 'V' | null,
  primary: string | number | null,
  counter: string | number | null,
): string {
  if (typeof primary !== 'string' || typeof counter !== 'string') {
    return `primary=${String(primary ?? '—')}, counter=${String(counter ?? '—')}`;
  }
  const vertical = direction === 'V';
  const horizontalValue = vertical ? counter : primary;
  const verticalValue = vertical ? primary : counter;
  const horizontal = horizontalValue === 'MIN'
    ? 'слева'
    : horizontalValue === 'MAX'
      ? 'справа'
      : horizontalValue.toLowerCase();
  const verticalPosition = verticalValue === 'MIN'
    ? 'сверху'
    : verticalValue === 'MAX'
      ? 'снизу'
      : verticalValue.toLowerCase();
  return `${verticalPosition} ${horizontal}`;
}

function canonicalFactProperty(factName: string): string {
  if (/^[A-Z][A-Za-z0-9 _-]*$/.test(factName)) return `variant.${factName}`;
  if (factName === 'primaryAxisAlignItems') return 'layout.primaryAxisAlignItems';
  if (factName === 'counterAxisAlignItems') return 'layout.counterAxisAlignItems';
  return canonicalViolationProperty(factName);
}

function evaluateValuePosition(
  nodes: RuntimeNode[],
  assertion: Record<string, any>,
  context: EvaluationContext,
) {
  if (!nodes.length || typeof assertion.fact !== 'string') {
    return { verdict: 'unknown' as const };
  }
  const positions = Array.isArray(assertion.positions) ? assertion.positions : [];
  const matching: number[] = [];
  for (const [index, node] of nodes.entries()) {
    const value = readFact(node, assertion.fact, context);
    if (value === undefined) return { verdict: 'unknown' as const };
    if (value === assertion.value) matching.push(index);
  }
  for (const index of matching) {
    if (!positions.length) break;
    const allowed = positions.some((position: string) =>
      position === 'first' ? index === 0 : position === 'last' ? index === nodes.length - 1 : false,
    );
    if (!allowed) {
      const subjectLabel = typeof assertion.subjectLabel === 'string'
        ? assertion.subjectLabel.trim()
        : '';
      return {
        verdict: 'fail' as const,
        target: nodes[index],
        expected: subjectLabel
          ? `${subjectLabel} — ${formatAllowedPositions(positions)}`
          : formatAllowedPositions(positions),
        actual: `позиция ${index + 1}`,
      };
    }
  }
  if (Number.isFinite(assertion.maxCount) && matching.length > assertion.maxCount) {
    const index = matching[assertion.maxCount] ?? matching[0];
    return {
      verdict: 'fail' as const,
      target: nodes[index],
      expected: `не более ${assertion.maxCount}`,
      actual: `найдено ${matching.length}`,
    };
  }
  return { verdict: 'pass' as const };
}

function evaluateRelativeOrder(nodes: RuntimeNode[], assertion: Record<string, any>) {
  if (!Array.isArray(assertion.values)) return { verdict: 'unknown' as const };
  const positions = assertion.values
    .map((value: string) => nodes.findIndex((node) => node.name === value || node.path.endsWith(` / ${value}`)))
    .filter((index: number) => index >= 0);
  if (!positions.length && assertion.ignoreMissing) return { verdict: 'pass' as const };
  for (let index = 1; index < positions.length; index += 1) {
    if (positions[index] <= positions[index - 1]) {
      return { verdict: 'fail' as const, target: nodes[positions[index]], expected: assertion.values, actual: nodes.map((node) => node.name) };
    }
  }
  return { verdict: 'pass' as const };
}

function evaluateSequenceEquals(
  nodes: RuntimeNode[],
  assertion: Record<string, any>,
  context: EvaluationContext,
) {
  if (
    !nodes.length ||
    typeof assertion.fact !== 'string' ||
    !Array.isArray(assertion.values) ||
    !assertion.values.every((value: unknown) => typeof value === 'string')
  ) {
    return { verdict: 'unknown' as const };
  }
  // Count constraints own missing or extra targets. Sequence comparison only
  // evaluates a complete composition to avoid reporting the same defect twice.
  if (nodes.length !== assertion.values.length) {
    return { verdict: 'unknown' as const };
  }
  for (const [index, node] of nodes.entries()) {
    const actual = readFact(node, assertion.fact, context);
    if (actual === undefined) return { verdict: 'unknown' as const };
    const expected = assertion.values[index];
    if (actual !== expected) {
      return {
        verdict: 'fail' as const,
        target: node,
        expected,
        actual,
      };
    }
  }
  return { verdict: 'pass' as const };
}

function readFact(
  node: RuntimeNode,
  fact: string,
  context: EvaluationContext,
): unknown {
  if (fact === 'target.visible' || fact === 'visible') return node.visible;
  if (fact === 'componentName' || fact === 'target.componentName') {
    return componentName(node, context);
  }
  const property = fact.match(/^(?:target|host|variant)\.variant\.([^\.]+)$/)?.[1]
    ?? fact.match(/^target\.variant\.([^\.]+)$/)?.[1]
    ?? (fact.startsWith('variant.') ? fact.slice('variant.'.length) : null);
  if (property) return ruleProperties(node, context)[property];
  if (/^[A-Z][A-Za-z0-9 _-]*$/.test(fact)) return ruleProperties(node, context)[fact];
  if (fact === 'layoutSizingHorizontal' || fact === 'layout.sizing.horizontal') {
    return node.layout?.sizing?.horizontal;
  }
  if (fact === 'layoutSizingVertical' || fact === 'layout.sizing.vertical') {
    return node.layout?.sizing?.vertical;
  }
  if (fact === 'clipsContent') return node.clipsContent;
  if (fact === 'layoutMode') {
    if (node.layout?.direction === 'H') return 'HORIZONTAL';
    if (node.layout?.direction === 'V') return 'VERTICAL';
    return node.layout?.direction;
  }
  if (fact === 'layout.direction') return node.layout?.direction;
  if (fact === 'primaryAxisAlignItems' || fact === 'layout.primaryAxisAlignItems') {
    return node.layout?.primaryAxisAlignItems;
  }
  if (fact === 'counterAxisAlignItems' || fact === 'layout.counterAxisAlignItems') {
    return node.layout?.counterAxisAlignItems;
  }
  if (fact.startsWith('padding.') || fact.startsWith('layout.padding.')) {
    const parts = fact.split('.');
    const side = parts[parts.length - 1];
    if (side === 'top' || side === 'right' || side === 'bottom' || side === 'left') {
      return node.layout?.padding?.[side];
    }
  }
  if (fact === 'itemSpacing' || fact === 'layout.itemSpacing') {
    return node.layout?.itemSpacing;
  }
  if (fact === 'opacity') return node.opacity;
  if (fact === 'fill' || fact === 'fills') {
    const token = node.fill?.token;
    return token && context.resolveTokenLabel
      ? context.resolveTokenLabel(token) ?? token
      : token ?? node.fill?.color ?? node.styles?.fill?.styleKey;
  }
  if (fact === 'style.text' || fact === 'styles.text') {
    return node.styles?.text?.styleKey ?? node.typographyToken;
  }
  if (fact === 'stroke.align' || fact === 'strokeAlign') return node.stroke?.align;
  if (fact === 'text.characters') return node.text?.characters;
  if (fact === 'text.align.horizontal') return node.text?.alignHorizontal;
  return undefined;
}

export function mergeContractBaselineEvidence(
  assessedDiffs: DiffEntry[],
  rawDiffs: DiffEntry[],
  hostNodeId: string | null | undefined,
): DiffEntry[] {
  const merged = new Map<string, DiffEntry>();
  for (const diff of assessedDiffs) {
    merged.set(baselineDiffKey(diff), diff);
  }
  if (!hostNodeId) return Array.from(merged.values());

  for (const diff of rawDiffs) {
    if (diff.nodeId !== hostNodeId) continue;
    const property = diff.details?.property ?? '';
    if (!property.startsWith('layout.')) continue;
    const key = baselineDiffKey(diff);
    if (!merged.has(key)) merged.set(key, diff);
  }
  return Array.from(merged.values());
}

function createViolationDiff(
  rule: ExperimentalRuleV2,
  target: RuntimeNode,
  evaluation: RuleEvaluation,
): DiffEntry {
  const ruleMessage = rule.presentation?.message || `Нарушено правило ${rule.id}`;
  const variantProperty = getRuleVariantProperty(rule);
  const evidenceProperty = evaluation.evidenceProperty ?? getRuleEvidenceProperty(rule);
  const referenceValue = stringifyEvidence(evaluation.expected);
  const actualValue = stringifyEvidence(evaluation.actual);
  const message = variantProperty
    ? `${variantProperty}: ${referenceValue ?? '—'} → ${actualValue ?? '—'}`
    : evidenceProperty && (referenceValue !== null || actualValue !== null)
      ? `${formatContractPropertyLabel(evidenceProperty)}: ${referenceValue ?? '—'} → ${actualValue ?? '—'}`
    : ruleMessage;
  const assessment: CustomizationAssessment = {
    verdict: 'violation',
    source: 'component-contract',
    reasonCode: 'experimental-component-contract-v2-violation',
    ruleId: rule.id,
    contractId: rule.id.split('.').slice(0, 2).join('.'),
    constraintId: rule.id,
    evidence: {
      runtime: 'component-contract-v2-experimental',
      expected: evaluation.expected ?? null,
      actual: evaluation.actual ?? null,
    },
    message: ruleMessage,
    presentation: 'show',
    remediation: resolveRuleRemediation(rule, target, evaluation),
  };
  if (evaluation.sourceDiff) {
    return Object.assign({}, evaluation.sourceDiff, {
      nodePath: evaluation.sourceDiff.nodePath || target.path,
      nodeName: evaluation.sourceDiff.nodeName || target.name,
      nodeId: evaluation.sourceDiff.nodeId ?? target.nodeId,
      assessment,
    });
  }
  return {
    message,
    nodePath: target.path,
    nodeName: target.name,
    nodeId: target.nodeId,
    visible: target.visible,
    context: createRuntimeDiffContext(target),
    diffKind: 'other',
    details: {
      property: variantProperty
        ? `variant.${variantProperty}`
        : evidenceProperty ?? rule.presentation?.group ?? 'component-contract-v2',
      reference: { value: referenceValue },
      actual: { value: actualValue },
    },
    assessment,
  };
}

function createRuntimePropertyDiff(
  target: RuntimeNode,
  property: string,
  expected: unknown,
  actual: unknown,
): DiffEntry {
  const referenceValue = stringifyEvidence(expected);
  const actualValue = stringifyEvidence(actual);
  return {
    message: `${formatContractPropertyLabel(property)}: ${referenceValue ?? '—'} → ${actualValue ?? '—'}`,
    nodePath: target.path,
    nodeName: target.name,
    nodeId: target.nodeId,
    visible: target.visible,
    context: createRuntimeDiffContext(target),
    diffKind: property.startsWith('layout.') ? 'layout' : 'other',
    details: {
      property,
      reference: { value: referenceValue },
      actual: { value: actualValue },
    },
  };
}

function createRuntimeDiffContext(target: RuntimeNode): DiffEntry['context'] {
  return {
    actualComponentKey: target.componentInstance?.componentKey ?? null,
    referenceComponentKey: null,
    referenceOrigin: 'host',
    actualNestedOwnerComponentKey: null,
    actualNestedOwnerPath: null,
    actualNestedOwnerRelativePath: null,
    nestedOwnerComponentKey: null,
    nestedOwnerComponentRole: null,
    nestedOwnerPath: null,
    nestedOwnerRelativePath: null,
    actualVariantProperties: target.componentInstance?.variantProperties ?? null,
    referenceVariantProperties: null,
  };
}

function getRuleEvidenceProperty(rule: ExperimentalRuleV2): string | null {
  if (rule.assert.op !== 'allEqual') return null;
  const assertion = rule.assert as Record<string, any>;
  const facts = typeof assertion.fact === 'string'
    ? [assertion.fact]
    : Array.isArray(assertion.facts)
      ? assertion.facts.filter((fact: unknown): fact is string => typeof fact === 'string')
      : [];
  if (facts.some((fact) => fact === 'fill' || fact === 'fills')) return 'fill';
  if (facts.some((fact) => fact === 'stroke' || fact === 'strokes')) return 'stroke';
  if (facts.some((fact) => fact === 'style.text' || fact === 'styles.text')) return 'styles.text';
  return facts.length === 1 ? facts[0] : null;
}

function formatContractPropertyLabel(property: string): string {
  if (property === 'fill') return 'заливка';
  if (property === 'stroke') return 'Обводка';
  if (property === 'styles.text') return 'Стиль текст';
  return property;
}

function formatAllowedPositions(positions: string[]): string {
  return positions
    .map((position) => {
      if (position === 'first') return 'первая позиция';
      if (position === 'last') return 'последняя позиция';
      return position;
    })
    .join(', ');
}

function getRuleVariantProperty(rule: ExperimentalRuleV2): string | null {
  const assertion = rule.assert as Record<string, any>;
  const fact = typeof assertion.fact === 'string'
    ? assertion.fact
    : typeof assertion.predicate?.fact === 'string'
      ? assertion.predicate.fact
      : null;
  if (!fact) return null;
  return fact.match(/^(?:target|host)\.variant\.([^\.]+)$/)?.[1]
    ?? (fact.startsWith('variant.') ? fact.slice('variant.'.length) : null);
}

function resolveRuleRemediation(
  rule: ExperimentalRuleV2,
  target: RuntimeNode,
  evaluation: {
    expected?: unknown;
    actual?: unknown;
    sourceDiff?: DiffEntry;
  },
): CustomizationAssessment['remediation'] {
  const remediation = rule.remediation;
  if (
    !remediation ||
    remediation.kind !== 'set-variant-properties' ||
    remediation.target !== '$failingTarget' ||
    !remediation.properties ||
    typeof remediation.properties !== 'object' ||
    Array.isArray(remediation.properties) ||
    !target.nodeId
  ) {
    return null;
  }
  const sourceProperty = evaluation.sourceDiff?.details?.property ?? null;
  if (sourceProperty === 'component.identity') {
    // Instance swaps require swapComponent with the reference component key;
    // they cannot be repaired through variant properties.
    return null;
  }
  const failingVariantProperty = sourceProperty?.startsWith('variant.')
    ? sourceProperty.slice('variant.'.length)
    : null;
  const properties: Record<string, string> = {};
  for (const [property, value] of Object.entries(remediation.properties)) {
    if (failingVariantProperty && property !== failingVariantProperty) {
      continue;
    }
    if (typeof value !== 'string') continue;
    if (!value.startsWith('$')) {
      properties[property] = value;
      continue;
    }
    if (
      value === '$expectedValue' &&
      (typeof evaluation.expected === 'string' || typeof evaluation.expected === 'number')
    ) {
      properties[property] = String(evaluation.expected);
      continue;
    }
    const referenceProperty = value.match(/^\$targets\[0\]\.variant\.([^\.]+)$/)?.[1];
    if (
      referenceProperty === property &&
      (typeof evaluation.expected === 'string' || typeof evaluation.expected === 'number')
    ) {
      properties[property] = String(evaluation.expected);
    }
  }
  if (!Object.keys(properties).length) return null;
  return {
    kind: 'set-variant-properties',
    nodeId: target.nodeId,
    properties,
  };
}

function createHostNode(options: {
  hostComponentKey: string;
  hostComponentName: string;
  hostVariantProperties?: Record<string, string> | null;
  actualStructure: DSStructureNode[];
}): RuntimeNode {
  const source = options.actualStructure[0];
  return Object.assign(
    {},
    source ?? {
      id: 0,
      parentId: null,
      path: options.hostComponentName,
      type: 'INSTANCE',
      name: options.hostComponentName,
      visible: true,
      radius: null,
    },
    {
      componentInstance: {
        componentKey: options.hostComponentKey,
        variantProperties: options.hostVariantProperties ?? {},
        componentProperties: source?.componentInstance?.componentProperties,
        directOverrides: source?.componentInstance?.directOverrides,
      },
    },
  );
}

function replaceRoot(nodes: DSStructureNode[], host: RuntimeNode): RuntimeNode[] {
  return nodes.length ? [host, ...nodes.slice(1)] : [host];
}

function componentKey(node: RuntimeNode, context: EvaluationContext): string | null {
  return node === context.host
    ? context.hostComponentKey
    : node.componentInstance?.componentKey ?? null;
}

function componentName(node: RuntimeNode, context: EvaluationContext): string {
  return node === context.host ? context.hostComponentName : node.name;
}

function variantProperties(
  node: RuntimeNode,
  context: EvaluationContext,
): Record<string, string> {
  return node === context.host
    ? context.hostVariantProperties
    : Object.assign(
        {},
        parseVariantName(node.name),
        node.componentInstance?.variantProperties ?? {},
      );
}

function ruleProperties(
  node: RuntimeNode,
  context: EvaluationContext,
): Record<string, string> {
  return Object.assign(
    {},
    variantProperties(node, context),
    node.componentInstance?.componentProperties ?? {},
  );
}

function combinationMatches(
  expected: Record<string, string>,
  actual: Record<string, string>,
): boolean {
  const expectedProperties = Object.keys(expected).sort();
  const actualProperties = Object.keys(actual).sort();
  if (expectedProperties.length !== actualProperties.length) return false;
  return expectedProperties.every(
    (property, index) =>
      property === actualProperties[index] && actual[property] === expected[property],
  );
}

function stringifyEvidence(value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return Number(value.toFixed(4));
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
    return value.join(' или ');
  }
  return JSON.stringify(value);
}
