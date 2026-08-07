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
}): ExperimentalContractV2Evaluation {
  const host = createHostNode(options);
  const context: EvaluationContext = {
    contract: options.contract,
    hostComponentKey: options.hostComponentKey,
    hostComponentName: options.hostComponentName,
    hostVariantProperties: options.hostVariantProperties ?? {},
    nodes: replaceRoot(options.actualStructure, host),
    host,
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

  for (const rule of options.contract.rules) {
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
    result.diagnostics.violations += 1;
    result.diffs.push(createViolationDiff(rule, evaluation.target ?? host, evaluation));
  }

  result.diagnostics.unsupportedRuleIds.sort();
  return result;
}

function evaluateRule(
  rule: ExperimentalRuleV2,
  context: EvaluationContext,
): { verdict: EvaluationVerdict; target?: RuntimeNode; expected?: unknown; actual?: unknown } {
  if (rule.when?.op !== 'evidenceComplete') return { verdict: 'unknown' };
  if (!SUPPORTED_ASSERTIONS.has(rule.assert.op)) return { verdict: 'unknown' };
  const selection = resolveSelection(rule, context);
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
    context.contract.facts.componentApi.map((entry) => [entry.componentKey, entry]),
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
  for (const node of nodes) {
    const fact = readFact(node, assertion.predicate.fact, context);
    if (fact === undefined) return { verdict: 'unknown' as const };
    const matches = evaluateCondition(fact, assertion.predicate);
    if (matches === null) return { verdict: 'unknown' as const };
    if (!matches) {
      return {
        verdict: 'fail' as const,
        target: node,
        expected: assertion.predicate.values ?? assertion.predicate.value,
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
  if (!nodes.length || typeof assertion.fact !== 'string') return { verdict: 'unknown' as const };
  const values = nodes.map((node) => readFact(node, assertion.fact, context));
  if (values.some((value) => value === undefined)) return { verdict: 'unknown' as const };
  const first = JSON.stringify(values[0]);
  const mismatch = values.findIndex((value) => JSON.stringify(value) !== first);
  return mismatch < 0
    ? { verdict: 'pass' as const }
    : { verdict: 'fail' as const, target: nodes[mismatch], expected: values[0], actual: values[mismatch] };
}

function evaluateCountBetween(nodes: RuntimeNode[], assertion: Record<string, any>) {
  if (!Number.isFinite(assertion.min) || !Number.isFinite(assertion.max)) {
    return { verdict: 'unknown' as const };
  }
  return nodes.length >= assertion.min && nodes.length <= assertion.max
    ? { verdict: 'pass' as const }
    : { verdict: 'fail' as const, target: nodes[0], expected: `${assertion.min}-${assertion.max}`, actual: nodes.length };
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
    return { verdict: 'fail' as const, target: nodes[index], expected: `max ${assertion.maxCount}`, actual: matching.length };
  }
  for (const index of matching) {
    const allowed = assertion.positions.some((position: string) =>
      position === 'first' ? index === 0 : position === 'last' ? index === nodes.length - 1 : false,
    );
    if (!allowed) {
      return { verdict: 'fail' as const, target: nodes[index], expected: assertion.positions.join(', '), actual: index + 1 };
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
  if (fact === 'stroke.align' || fact === 'strokeAlign') return node.stroke?.align;
  if (fact === 'text.characters') return node.text?.characters;
  return undefined;
}

function createViolationDiff(
  rule: ExperimentalRuleV2,
  target: RuntimeNode,
  evaluation: { expected?: unknown; actual?: unknown },
): DiffEntry {
  const message = rule.presentation?.message || `Нарушено правило ${rule.id}`;
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
    message,
    presentation: 'show',
    remediation: null,
  };
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
      property: rule.presentation?.group || 'component-contract-v2',
      reference: { value: stringifyEvidence(evaluation.expected) },
      actual: { value: stringifyEvidence(evaluation.actual) },
    },
    assessment,
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
  if (typeof value === 'string' || typeof value === 'number') return value;
  return JSON.stringify(value);
}
