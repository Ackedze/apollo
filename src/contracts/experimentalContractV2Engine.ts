import type { CustomizationAssessment } from '../assessment/types';
import type { DiffEntry } from '../structure/diff';
import type { DSStructureNode } from '../types/structures';
import type {
  ExperimentalContractV2,
  ExperimentalRuleV2,
} from './experimentalContractV2Registry';

type EvaluationVerdict = 'pass' | 'fail' | 'unknown';

type RuntimeNode = DSStructureNode & {
  componentInstance?: {
    componentKey: string;
    variantProperties?: Record<string, string>;
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
  resolveTokenLabel?: (token: string) => string | null;
};

type RuleEvaluation = {
  verdict: EvaluationVerdict;
  target?: RuntimeNode;
  expected?: unknown;
  actual?: unknown;
  sourceDiff?: DiffEntry;
  sourceDiffs?: Array<{ diff: DiffEntry; target: RuntimeNode }>;
};

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

const SUPPORTED_ASSERTIONS = new Set([
  'allEqual',
  'allMatch',
  'componentApiValid',
  'countBetween',
  'matchesEffectiveBaseline',
  'paintStateEquals',
  'propertiesEqual',
  'relativeOrder',
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
  resolveTokenLabel?: (token: string) => string | null;
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
    resolveTokenLabel: options.resolveTokenLabel,
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
    if (rule.enforcement !== 'enforced') {
      result.diagnostics.classificationSkipped += 1;
      continue;
    }
    result.diagnostics.evaluated += 1;
    const evaluation = evaluateRule(rule, context);
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
        if (claimedBaselineDiffs.has(sourceKey)) continue;
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

  result.diffs = dedupeExactRulesOverBaselineRules(
    result.diffs,
    options.contract.rules,
  );
  result.diagnostics.violations = result.diffs.length;
  result.diagnostics.unsupportedRuleIds.sort();
  return result;
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
  const indexByTargetProperty = new Map<string, number>();

  for (const diff of diffs) {
    const property = canonicalViolationProperty(diff.details?.property ?? '');
    const target = diff.nodeId || diff.nodePath;
    const key = `${target}::${property}`;
    const existingIndex = indexByTargetProperty.get(key);
    if (existingIndex === undefined) {
      indexByTargetProperty.set(key, result.length);
      result.push(diff);
      continue;
    }

    const existing = result[existingIndex];
    const existingRule = ruleById.get(existing.assessment?.ruleId ?? '');
    const candidateRule = ruleById.get(diff.assessment?.ruleId ?? '');
    const existingOp = existingRule?.assert.op;
    const candidateOp = candidateRule?.assert.op;
    const existingIsBaseline = existingOp === 'matchesEffectiveBaseline';
    const candidateIsBaseline = candidateOp === 'matchesEffectiveBaseline';

    if (existingIsBaseline && !candidateIsBaseline) {
      result[existingIndex] = diff;
      continue;
    }
    if (!existingIsBaseline && candidateIsBaseline) {
      continue;
    }
    if (existingIsBaseline && candidateIsBaseline) {
      if (baselineRuleSpecificity(candidateRule) > baselineRuleSpecificity(existingRule)) {
        result[existingIndex] = diff;
      }
      continue;
    }

    indexByTargetProperty.set(`${key}::${result.length}`, result.length);
    result.push(diff);
  }

  return result;
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
  const selection = applyRuleCondition(rule.when, resolvedSelection, context);
  if (!selection) return { verdict: 'unknown' };

  switch (rule.assert.op) {
    case 'componentApiValid':
      return evaluateComponentApi(selection, context);
    case 'allMatch':
      return evaluateAllMatch(selection, rule.assert, context);
    case 'allEqual':
      return evaluateAllEqual(selection, rule.assert, context);
    case 'countBetween':
      return evaluateCountBetween(selection, rule.assert);
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
    default:
      return { verdict: 'unknown' };
  }
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

  const baselineDiffs = assertion.baselineSource === 'host-variant'
    ? mergeBaselineDiffs(
        context.effectiveBaselineDiffs,
        context.hostVariantBaselineDiffs,
      )
    : context.effectiveBaselineDiffs;
  const matches: Array<{ diff: DiffEntry; target: RuntimeNode }> = [];
  for (const diff of baselineDiffs) {
    if (!isActionableBaselineDiff(diff)) continue;
    if (!properties.some((property) => baselinePropertyMatches(property, diff))) continue;
    const target = findBaselineTarget(diff, nodes);
    if (!target) continue;
    matches.push({ diff, target });
  }
  return matches.length ? { verdict: 'fail', sourceDiffs: matches } : { verdict: 'pass' };
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

function isActionableBaselineDiff(diff: DiffEntry): boolean {
  // Contract v2 evaluates the already materialized effective baseline. Legacy
  // Expected/Allowed verdicts are advisory and must not override an exact
  // component contract. Derived diffs are the only non-actionable evidence.
  return diff.assessment?.presentation !== 'suppress-derived';
}

function baselinePropertyMatches(pattern: string, diff: DiffEntry): boolean {
  const property = diff.details?.property ?? '';
  const aliases = baselinePropertyAliases(property);
  if (aliases.includes(pattern)) return true;
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
  if (property === 'textStyle' || property === 'typographyToken') aliases.add('styles.text');
  if (property === 'cornerRadius') aliases.add('radius');
  if (property === 'fills' || property === 'styles.fill') aliases.add('fill');
  if (property === 'strokes' || property === 'styles.stroke') aliases.add('stroke');
  return Array.from(aliases);
}

function findBaselineTarget(diff: DiffEntry, nodes: RuntimeNode[]): RuntimeNode | null {
  if (diff.nodeId) {
    const byId = nodes.find((node) => node.nodeId === diff.nodeId);
    if (byId) return byId;
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
): RuntimeNode[] | null {
  if (condition?.op === 'evidenceComplete') return nodes;
  if (condition?.op !== 'all' || !condition.clauses || typeof condition.clauses !== 'object') {
    return null;
  }
  const clauses = condition.clauses as Record<string, unknown>;
  for (const field of Object.keys(clauses)) {
    if (field !== 'component' && field !== 'variant' && field !== 'except') return null;
  }
  if (typeof clauses.component === 'string' && !hostComponentMatches(clauses.component, context)) {
    return [];
  }
  if (clauses.variant !== undefined) {
    const expectedVariant = readVariantCondition(clauses.variant);
    if (!expectedVariant) return null;
    const properties = Object.keys(expectedVariant);
    if (properties.some((property) => context.hostVariantProperties[property] !== undefined)) {
      if (!variantConditionMatches(expectedVariant, context.hostVariantProperties)) return [];
    } else {
      nodes = nodes.filter((node) =>
        variantConditionMatches(expectedVariant, variantProperties(node, context)),
      );
    }
  }
  if (clauses.except !== undefined) {
    if (!clauses.except || typeof clauses.except !== 'object' || Array.isArray(clauses.except)) {
      return null;
    }
    const exception = clauses.except as Record<string, unknown>;
    for (const field of Object.keys(exception)) {
      if (field !== 'component' && field !== 'variant') return null;
    }
    const componentMatches = typeof exception.component !== 'string' ||
      hostComponentMatches(exception.component, context);
    const variantMatches = exception.variant === undefined ||
      variantConditionMatches(exception.variant, context.hostVariantProperties);
    if (componentMatches && variantMatches) return [];
  }
  return nodes;
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
    else if (field === 'semanticRoleOrLayerName') value = node.path || node.name;
    else return null;
    const matched = evaluateCondition(value, condition);
    if (matched === null) return null;
    if (!matched) return false;
  }
  return true;
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
    for (const [property, value] of Object.entries(actual)) {
      const allowed = api.publicApi.properties[property];
      if (!allowed || !allowed.includes(value)) {
        return { verdict: 'fail', target: node, expected: allowed ?? [], actual: `${property}=${value}` };
      }
    }
    const combinations = api.publicApi.allowedCombinations;
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
  if (!nodes.length) return { verdict: 'unknown' as const };
  const facts = typeof assertion.fact === 'string'
    ? [assertion.fact]
    : Array.isArray(assertion.facts) && assertion.facts.every((fact: unknown) => typeof fact === 'string')
      ? assertion.facts as string[]
      : null;
  if (!facts?.length) return { verdict: 'unknown' as const };
  const evidence = nodes.flatMap((node) => {
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
  return mismatch < 0
    ? { verdict: 'pass' as const }
    : {
        verdict: 'fail' as const,
        target: evidence[mismatch].node,
        expected: evidence[0].value,
        actual: evidence[mismatch].value,
      };
}

function evaluateCountBetween(nodes: RuntimeNode[], assertion: Record<string, any>) {
  if (!Number.isFinite(assertion.min) || !Number.isFinite(assertion.max)) {
    return { verdict: 'unknown' as const };
  }
  return nodes.length >= assertion.min && nodes.length <= assertion.max
    ? { verdict: 'pass' as const }
    : { verdict: 'fail' as const, target: nodes[0], expected: `${assertion.min}-${assertion.max}`, actual: nodes.length };
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
  const values = assertion.values;
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    return { verdict: 'unknown' as const };
  }
  for (const node of nodes) {
    for (const [factName, expected] of Object.entries(values)) {
      const actual = readFact(node, factName, context);
      if (actual === undefined) return { verdict: 'unknown' as const };
      if (actual !== expected) {
        return { verdict: 'fail' as const, target: node, expected, actual };
      }
    }
  }
  return { verdict: 'pass' as const };
}

function evaluateValuePosition(
  nodes: RuntimeNode[],
  assertion: Record<string, any>,
  context: EvaluationContext,
) {
  if (!nodes.length || typeof assertion.fact !== 'string' || !Array.isArray(assertion.positions)) {
    return { verdict: 'unknown' as const };
  }
  const matching: number[] = [];
  for (const [index, node] of nodes.entries()) {
    const value = readFact(node, assertion.fact, context);
    if (value === undefined) return { verdict: 'unknown' as const };
    if (value === assertion.value) matching.push(index);
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
  for (const index of matching) {
    const allowed = assertion.positions.some((position: string) =>
      position === 'first' ? index === 0 : position === 'last' ? index === nodes.length - 1 : false,
    );
    if (!allowed) {
      return {
        verdict: 'fail' as const,
        target: nodes[index],
        expected: formatAllowedPositions(assertion.positions),
        actual: `позиция ${index + 1}`,
      };
    }
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

function readFact(
  node: RuntimeNode,
  fact: string,
  context: EvaluationContext,
): unknown {
  const property = fact.match(/^(?:target|host|variant)\.variant\.([^\.]+)$/)?.[1]
    ?? fact.match(/^target\.variant\.([^\.]+)$/)?.[1]
    ?? (fact.startsWith('variant.') ? fact.slice('variant.'.length) : null);
  if (property) return variantProperties(node, context)[property];
  if (/^[A-Z][A-Za-z0-9 _-]*$/.test(fact)) return variantProperties(node, context)[fact];
  if (fact === 'layoutSizingHorizontal' || fact === 'layout.sizing.horizontal') {
    return node.layout?.sizing?.horizontal;
  }
  if (fact === 'layoutSizingVertical' || fact === 'layout.sizing.vertical') {
    return node.layout?.sizing?.vertical;
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
  return undefined;
}

function createViolationDiff(
  rule: ExperimentalRuleV2,
  target: RuntimeNode,
  evaluation: RuleEvaluation,
): DiffEntry {
  const ruleMessage = rule.presentation?.message || `Нарушено правило ${rule.id}`;
  const variantProperty = getRuleVariantProperty(rule);
  const referenceValue = stringifyEvidence(evaluation.expected);
  const actualValue = stringifyEvidence(evaluation.actual);
  const message = variantProperty
    ? `${variantProperty}: ${referenceValue ?? '—'} → ${actualValue ?? '—'}`
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
    context: {
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
    },
    diffKind: 'other',
    details: {
      property: variantProperty
        ? `variant.${variantProperty}`
        : rule.presentation?.group || 'component-contract-v2',
      reference: { value: referenceValue },
      actual: { value: actualValue },
    },
    assessment,
  };
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
  evaluation: { expected?: unknown; actual?: unknown },
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
  const properties: Record<string, string> = {};
  for (const [property, value] of Object.entries(remediation.properties)) {
    if (typeof value !== 'string') continue;
    if (!value.startsWith('$')) {
      properties[property] = value;
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
    : node.componentInstance?.variantProperties ?? {};
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
