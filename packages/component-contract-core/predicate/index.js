// Shared Node/browser bootstrap. The interpreter below is unchanged.
const { sha256Hex } = require('../vendor/sha256');
const crypto = { createHash: function (algorithm) {
  if (algorithm !== 'sha256') throw new Error('Only SHA-256 is supported');
  let value = '';
  return { update: function (next) { value += String(next); return this; },
    digest: function (format) { if (format !== 'hex') throw new Error('Only hex digest is supported'); return sha256Hex(value); } };
} };
const registry = require('../schemas/apollo-predicate-capabilities.v1.json');

const TRUTH = Object.freeze({ TRUE: 'true', FALSE: 'false', UNKNOWN: 'unknown' });
const APPLICABILITY = Object.freeze({
  APPLICABLE: 'applicable',
  NOT_APPLICABLE: 'not-applicable',
  UNKNOWN: 'unknown',
});
const IMPLEMENTED_PREDICATES = new Set([
  'all',
  'any',
  'not',
  'exists',
  'fact-present',
  'equals',
  'not-equals',
  'one-of',
  'none-of',
  'compare',
  'approximately-equals',
  'between',
  'string-length-between',
  'matches',
  'every',
  'some',
  'none',
  'count-between',
  'all-equal',
  'unique',
  'sequence-equals',
  'value-position',
  'direct-parent',
  'ancestor',
  'direct-child',
  'descendant',
  'before',
  'after',
  'adjacent',
  'contains',
  'overlaps',
  'aligned',
  'distance',
  'component-api-valid',
  'matches-effective-baseline',
  'binding-satisfies',
  'paint-state-satisfies',
]);
const REGISTERED_PREDICATES = new Set(registry.predicates.map((predicate) => predicate.id));
const SELECTOR_ORIGINS = new Set(['selection-root', 'self', 'page-descendants']);
const QUERY_ORIGINS = new Set(['subject', 'selection-root', 'page-descendants']);
const SELECTOR_TRAVERSALS = new Set([
  'self',
  'direct-children',
  'descendants',
  'self-and-descendants',
  'parent',
  'ancestors',
  'siblings',
]);
const DERIVE_OPERATORS = new Set([
  'add',
  'subtract',
  'multiply',
  'divide',
  'length',
  'absolute-difference',
]);
const CAUSAL_RELATIONS = new Set([
  'same-subject',
  'same-focus',
  'descendant-subject',
]);

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function stableHash(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function snapshotHash(snapshot) {
  if (typeof snapshot.snapshotHash === 'string' && snapshot.snapshotHash) return snapshot.snapshotHash;
  const normalized = { ...snapshot };
  delete normalized.generatedAt;
  delete normalized.snapshotHash;
  return stableHash(normalized);
}

function capabilityError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validateValueRef(valueRef, location) {
  if (!valueRef || typeof valueRef !== 'object' || Array.isArray(valueRef)) {
    throw capabilityError('RULE_IR_INVALID', `${location} must be a value reference object`);
  }
  const kinds = ['literal', 'fact', 'query', 'derive'].filter((key) => (
    Object.prototype.hasOwnProperty.call(valueRef, key)
  ));
  if (kinds.length !== 1) {
    throw capabilityError(
      'RULE_IR_INVALID',
      `${location} must contain exactly one of literal, fact, query or derive`,
    );
  }
  if (kinds[0] === 'literal') return;
  if (kinds[0] === 'fact') {
    if (typeof valueRef.fact !== 'string' || !valueRef.fact) {
      throw capabilityError('RULE_IR_INVALID', `${location}.fact must be a non-empty string`);
    }
    return;
  }
  if (kinds[0] === 'query') {
    const query = valueRef.query;
    if (!query || typeof query !== 'object' || Array.isArray(query)) {
      throw capabilityError('RULE_IR_INVALID', `${location}.query must be an object`);
    }
    if (!QUERY_ORIGINS.has(query.from)) {
      throw capabilityError('SELECTOR_UNKNOWN', `Unknown query origin: ${query.from}`);
    }
    if (!SELECTOR_TRAVERSALS.has(query.traverse)) {
      throw capabilityError('SELECTOR_UNKNOWN', `Unknown query traversal: ${query.traverse}`);
    }
    for (const [index, expression] of (query.where || []).entries()) {
      validateExpressionCapabilities(expression, `${location}.query.where[${index}]`);
    }
    if (query.project !== undefined) {
      validateValueRef(query.project, `${location}.query.project`);
    }
    return;
  }
  const derive = valueRef.derive;
  if (!derive || typeof derive !== 'object' || Array.isArray(derive)) {
    throw capabilityError('RULE_IR_INVALID', `${location}.derive must be an object`);
  }
  if (!DERIVE_OPERATORS.has(derive.operator)) {
    throw capabilityError(
      'RULE_IR_INVALID',
      `${location}.derive.operator is unsupported: ${derive.operator}`,
    );
  }
  if (!Array.isArray(derive.args) || derive.args.length === 0) {
    throw capabilityError('RULE_IR_INVALID', `${location}.derive.args must not be empty`);
  }
  if (derive.operator === 'length' && derive.args.length !== 1) {
    throw capabilityError('RULE_IR_INVALID', `${location}.derive.length requires one arg`);
  }
  if (
    ['subtract', 'divide', 'absolute-difference'].includes(derive.operator) &&
    derive.args.length !== 2
  ) {
    throw capabilityError(
      'RULE_IR_INVALID',
      `${location}.derive.${derive.operator} requires two args`,
    );
  }
  for (const [index, value] of derive.args.entries()) {
    validateValueRef(value, `${location}.derive.args[${index}]`);
  }
}

function validateExpressionCapabilities(expression, location) {
  if (!expression || typeof expression !== 'object' || Array.isArray(expression)) {
    throw capabilityError('RULE_IR_INVALID', `${location} must be an expression object`);
  }
  const predicate = expression.predicate;
  if (typeof predicate !== 'string' || !predicate) {
    throw capabilityError('RULE_IR_INVALID', `${location}.predicate is required`);
  }
  if (!REGISTERED_PREDICATES.has(predicate)) {
    throw capabilityError('PREDICATE_UNKNOWN', `Unknown predicate: ${predicate}`);
  }
  if (!IMPLEMENTED_PREDICATES.has(predicate)) {
    throw capabilityError('PREDICATE_NOT_IMPLEMENTED', `Predicate is not implemented yet: ${predicate}`);
  }
  const args = expression.args || [];
  if (['all', 'any'].includes(predicate) && (!Array.isArray(args) || args.length === 0)) {
    throw capabilityError('RULE_IR_INVALID', `${location}.${predicate} requires at least one arg`);
  }
  if (predicate === 'not' && (!Array.isArray(args) || args.length !== 1)) {
    throw capabilityError('RULE_IR_INVALID', `${location}.not requires exactly one arg`);
  }
  if (!['all', 'any', 'not'].includes(predicate) && !expression.actual) {
    throw capabilityError('RULE_IR_INVALID', `${location}.${predicate}.actual is required`);
  }
  for (const key of ['actual', 'expected', 'target', 'lower', 'upper']) {
    if (expression[key] !== undefined) validateValueRef(expression[key], `${location}.${key}`);
  }
  if ([
    'equals',
    'not-equals',
    'one-of',
    'none-of',
    'compare',
    'approximately-equals',
    'matches',
    'every',
    'some',
    'none',
    'sequence-equals',
    'value-position',
    'direct-parent',
    'ancestor',
    'direct-child',
    'descendant',
    'before',
    'after',
    'adjacent',
    'matches-effective-baseline',
    'binding-satisfies',
    'paint-state-satisfies',
  ].includes(predicate) && !expression.expected) {
    throw capabilityError('RULE_IR_INVALID', `${location}.${predicate}.expected is required`);
  }
  if (predicate === 'compare' && !['lt', 'lte', 'gt', 'gte'].includes(expression.operator)) {
    throw capabilityError('RULE_IR_INVALID', `${location}.compare.operator must be lt, lte, gt or gte`);
  }
  if (['between', 'string-length-between', 'count-between'].includes(predicate) && (!expression.lower || !expression.upper)) {
    throw capabilityError('RULE_IR_INVALID', `${location}.between requires lower and upper values`);
  }
  if (expression.bounds && !['inclusive', 'exclusive', 'inclusive-lower', 'inclusive-upper'].includes(expression.bounds)) {
    throw capabilityError('RULE_IR_INVALID', `${location}.bounds is invalid`);
  }
  if (predicate === 'value-position') {
    if (!Array.isArray(expression.positions) || expression.positions.length === 0) {
      throw capabilityError('RULE_IR_INVALID', `${location}.value-position.positions requires at least one position`);
    }
    if (expression.maxCount !== undefined && (!Number.isInteger(expression.maxCount) || expression.maxCount < 0)) {
      throw capabilityError('RULE_IR_INVALID', `${location}.value-position.maxCount must be a non-negative integer`);
    }
  }
  if (['contains', 'overlaps', 'aligned', 'distance'].includes(predicate) && !expression.target) {
    throw capabilityError('RULE_IR_INVALID', `${location}.${predicate}.target is required`);
  }
  if (predicate === 'distance' && !expression.expected) {
    throw capabilityError('RULE_IR_INVALID', `${location}.distance.expected is required`);
  }
  if (predicate === 'aligned' && !['left', 'center-x', 'right', 'top', 'center-y', 'bottom'].includes(expression.axis)) {
    throw capabilityError('RULE_IR_INVALID', `${location}.aligned.axis is invalid`);
  }
  if (predicate === 'distance' && !['horizontal', 'vertical', 'euclidean'].includes(expression.axis)) {
    throw capabilityError('RULE_IR_INVALID', `${location}.distance.axis is invalid`);
  }
  if (expression.tolerance !== undefined && (
    typeof expression.tolerance !== 'number' ||
    !Number.isFinite(expression.tolerance) ||
    expression.tolerance < 0
  )) {
    throw capabilityError('RULE_IR_INVALID', `${location}.tolerance must be a non-negative finite number`);
  }
  for (const [index, child] of args.entries()) {
    validateExpressionCapabilities(child, `${location}.args[${index}]`);
  }
}

function validateRule(rule) {
  if (!rule || rule.schemaVersion !== 'apollo.rule-ir.v1') {
    throw capabilityError('RULE_IR_INVALID', 'RuleIR schemaVersion must be apollo.rule-ir.v1');
  }
  if (!['require', 'forbid', 'allow'].includes(rule.effect)) {
    throw capabilityError('RULE_IR_INVALID', `Unsupported rule effect: ${rule.effect}`);
  }
  for (const [dimension, values] of Object.entries(rule.scope || {})) {
    if (!['platform', 'product', 'channel', 'pageType'].includes(dimension)
      || (values !== undefined && (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || !value.trim())))) {
      throw capabilityError('RULE_IR_INVALID', `Unsupported or invalid scope dimension: ${dimension}`);
    }
  }
  if (!rule.select || !SELECTOR_ORIGINS.has(rule.select.from)) {
    throw capabilityError('SELECTOR_UNKNOWN', `Unknown selector origin: ${rule.select?.from}`);
  }
  if (!SELECTOR_TRAVERSALS.has(rule.select.traverse)) {
    throw capabilityError('SELECTOR_UNKNOWN', `Unknown selector traversal: ${rule.select.traverse}`);
  }
  validateExpressionCapabilities(rule.assert, 'assert');
  if (rule.when) validateExpressionCapabilities(rule.when, 'when');
  for (const [index, expression] of (rule.select?.where || []).entries()) {
    validateExpressionCapabilities(expression, `select.where[${index}]`);
  }
  if (rule.causality !== undefined && rule.causality !== null) {
    if (
      typeof rule.causality !== 'object'
      || Array.isArray(rule.causality)
      || !Array.isArray(rule.causality.causes)
      || !rule.causality.causes.length
    ) {
      throw capabilityError(
        'RULE_IR_INVALID',
        'causality.causes must be a non-empty array',
      );
    }
    for (const [index, cause] of rule.causality.causes.entries()) {
      if (!cause || typeof cause !== 'object' || Array.isArray(cause)) {
        throw capabilityError('RULE_IR_INVALID', `causality.causes[${index}] must be an object`);
      }
      if (typeof cause.ruleId !== 'string' || !cause.ruleId) {
        throw capabilityError(
          'RULE_IR_INVALID',
          `causality.causes[${index}].ruleId must be a non-empty string`,
        );
      }
      if (!CAUSAL_RELATIONS.has(cause.relation)) {
        throw capabilityError(
          'RULE_IR_INVALID',
          `causality.causes[${index}].relation is unsupported: ${cause.relation}`,
        );
      }
      if (typeof cause.reason !== 'string' || !cause.reason) {
        throw capabilityError(
          'RULE_IR_INVALID',
          `causality.causes[${index}].reason must be a non-empty string`,
        );
      }
    }
  }
  return rule;
}

function unknownFactMatches(unknownFacts, factPath) {
  return (unknownFacts || []).some((unknownPath) => (
    unknownPath === factPath || factPath.startsWith(`${unknownPath}.`)
  ));
}

function readObjectPath(root, factPath) {
  let current = root;
  for (const part of factPath.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return { state: 'absent', value: undefined };
    }
    if (!Object.prototype.hasOwnProperty.call(current, part)) {
      return { state: 'absent', value: undefined };
    }
    current = current[part];
  }
  return { state: 'known', value: current };
}

function resolveQueryValue(query, subject, snapshot) {
  const index = nodeIndex(snapshot);
  const roots = query.from === 'subject'
    ? [subject]
    : selectionRoots(snapshot, query.from, index);
  const candidates = roots.flatMap((root) => traversalNodes(root, query.traverse, index));
  const unique = new Map(candidates.map((node) => [node.id, node]));
  const nodes = Array.from(unique.values())
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const selected = [];
  const factPaths = new Set();
  for (const node of nodes) {
    let matches = true;
    for (const expression of query.where || []) {
      const trace = evaluateExpression(expression, node, snapshot);
      for (const factPath of trace.factPaths) factPaths.add(factPath);
      if (trace.truth === TRUTH.UNKNOWN) {
        return { state: 'unknown', value: undefined, factPaths: Array.from(factPaths).sort() };
      }
      if (trace.truth === TRUTH.FALSE) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;
    if (query.project === undefined) {
      selected.push(node.id);
      continue;
    }
    const projected = resolveValue(query.project, node, snapshot);
    for (const factPath of projected.factPaths) factPaths.add(factPath);
    if (projected.state !== 'known') {
      return { state: 'unknown', value: undefined, factPaths: Array.from(factPaths).sort() };
    }
    selected.push(projected.value);
  }
  return { state: 'known', value: selected, factPaths: Array.from(factPaths).sort() };
}

function resolveDerivedValue(derive, subject, snapshot) {
  const resolved = derive.args.map((value) => resolveValue(value, subject, snapshot));
  const factPaths = Array.from(new Set(resolved.flatMap((value) => value.factPaths))).sort();
  if (resolved.some((value) => value.state !== 'known')) {
    return { state: 'unknown', value: undefined, factPaths };
  }
  const values = resolved.map((value) => value.value);
  if (derive.operator === 'length') {
    const value = values[0];
    if (!Array.isArray(value) && typeof value !== 'string') {
      return { state: 'unknown', value: undefined, factPaths };
    }
    return {
      state: 'known',
      value: Array.isArray(value) ? value.length : Array.from(value).length,
      factPaths,
    };
  }
  if (!values.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return { state: 'unknown', value: undefined, factPaths };
  }
  if (derive.operator === 'add') {
    return { state: 'known', value: values.reduce((sum, value) => sum + value, 0), factPaths };
  }
  if (derive.operator === 'multiply') {
    return { state: 'known', value: values.reduce((product, value) => product * value, 1), factPaths };
  }
  if (derive.operator === 'subtract') {
    return { state: 'known', value: values[0] - values[1], factPaths };
  }
  if (derive.operator === 'absolute-difference') {
    return { state: 'known', value: Math.abs(values[0] - values[1]), factPaths };
  }
  if (values[1] === 0) return { state: 'unknown', value: undefined, factPaths };
  return { state: 'known', value: values[0] / values[1], factPaths };
}

function resolveValue(valueRef, subject, snapshot) {
  if (!valueRef || typeof valueRef !== 'object' || Array.isArray(valueRef)) {
    return { state: 'unknown', value: undefined, factPaths: [] };
  }
  if (Object.prototype.hasOwnProperty.call(valueRef, 'literal')) {
    return { state: 'known', value: valueRef.literal, factPaths: [] };
  }
  if (Object.prototype.hasOwnProperty.call(valueRef, 'query')) {
    return resolveQueryValue(valueRef.query, subject, snapshot);
  }
  if (Object.prototype.hasOwnProperty.call(valueRef, 'derive')) {
    return resolveDerivedValue(valueRef.derive, subject, snapshot);
  }
  if (typeof valueRef.fact !== 'string' || !valueRef.fact) {
    return { state: 'unknown', value: undefined, factPaths: [] };
  }
  const factPath = valueRef.fact;
  if (unknownFactMatches(subject.unknownFacts, factPath)) {
    return { state: 'unknown', value: undefined, factPaths: [factPath] };
  }
  if (factPath.startsWith('page.context.')) {
    const contextFactPath = factPath.slice('page.context.'.length);
    if (unknownFactMatches(snapshot.context?.unknownFacts, contextFactPath)) {
      return { state: 'unknown', value: undefined, factPaths: [factPath] };
    }
    const resolved = readObjectPath(snapshot.context, contextFactPath);
    return { ...resolved, factPaths: [factPath] };
  }
  return { ...readObjectPath(subject, factPath), factPaths: [factPath] };
}

function deepEqual(left, right) {
  return stableStringify(left) === stableStringify(right);
}

function makeTrace(predicate, truth, reason, actual, expected, factPaths, children) {
  const trace = {
    predicate,
    truth,
    reason,
    actual: actual.state === 'known' ? actual.value : { state: actual.state },
    expected: expected.state === 'known' ? expected.value : { state: expected.state },
    factPaths,
  };
  if (children) trace.children = children;
  return trace;
}

function combineLogic(predicate, children) {
  const truths = children.map((child) => child.truth);
  if (predicate === 'all') {
    if (truths.includes(TRUTH.FALSE)) return TRUTH.FALSE;
    return truths.includes(TRUTH.UNKNOWN) ? TRUTH.UNKNOWN : TRUTH.TRUE;
  }
  if (predicate === 'any') {
    if (truths.includes(TRUTH.TRUE)) return TRUTH.TRUE;
    return truths.includes(TRUTH.UNKNOWN) ? TRUTH.UNKNOWN : TRUTH.FALSE;
  }
  return truths[0] === TRUTH.UNKNOWN
    ? TRUTH.UNKNOWN
    : (truths[0] === TRUTH.TRUE ? TRUTH.FALSE : TRUTH.TRUE);
}

function evaluateLogicExpression(expression, subject, snapshot) {
  const children = expression.args.map((child) => evaluateExpression(child, subject, snapshot));
  const truth = combineLogic(expression.predicate, children);
  const factPaths = Array.from(new Set(children.flatMap((child) => child.factPaths))).sort();
  const reason = expression.predicate === 'not'
    ? 'logical negation evaluated'
    : `logical ${expression.predicate} evaluated`;
  return makeTrace(
    expression.predicate,
    truth,
    reason,
    { state: 'known', value: children.map((child) => child.truth) },
    { state: 'known', value: expression.predicate === 'all' ? 'all true' : (expression.predicate === 'any' ? 'at least one true' : 'negated') },
    factPaths,
    children,
  );
}

function numericValue(resolved) {
  return resolved.state === 'known' && typeof resolved.value === 'number' && Number.isFinite(resolved.value);
}

function knownArray(resolved) {
  return resolved.state === 'known' && Array.isArray(resolved.value);
}

function resolveBounds(expression, subject, snapshot) {
  const lower = resolveValue(expression.lower, subject, snapshot);
  const upper = resolveValue(expression.upper, subject, snapshot);
  return {
    lower,
    upper,
    factPaths: Array.from(new Set([...lower.factPaths, ...upper.factPaths])).sort(),
  };
}

function evaluateNumericRange(predicate, actual, lower, upper, bounds, factPaths) {
  if ([actual, lower, upper].some((value) => value.state === 'unknown')) {
    return makeTrace(predicate, TRUTH.UNKNOWN, 'range evidence is unknown', actual, { state: 'unknown' }, factPaths);
  }
  if ([actual, lower, upper].some((value) => value.state === 'absent')) {
    return makeTrace(predicate, TRUTH.FALSE, 'range value is absent', actual, { state: 'absent' }, factPaths);
  }
  if (![actual, lower, upper].every(numericValue) || lower.value > upper.value) {
    return makeTrace(predicate, TRUTH.UNKNOWN, 'range requires ordered finite numeric bounds', actual, { state: 'known', value: { lower: lower.value, upper: upper.value } }, factPaths);
  }
  const lowerPass = ['inclusive', 'inclusive-lower'].includes(bounds)
    ? actual.value >= lower.value
    : actual.value > lower.value;
  const upperPass = ['inclusive', 'inclusive-upper'].includes(bounds)
    ? actual.value <= upper.value
    : actual.value < upper.value;
  const truth = lowerPass && upperPass ? TRUTH.TRUE : TRUTH.FALSE;
  return makeTrace(predicate, truth, `numeric range ${bounds} evaluated`, actual, { state: 'known', value: { lower: lower.value, upper: upper.value, bounds } }, factPaths);
}

function resolveNodePair(actual, expected, snapshot) {
  if (typeof actual.value !== 'string' || typeof expected.value !== 'string') {
    return { state: 'invalid', actualNode: null, expectedNode: null };
  }
  const index = nodeIndex(snapshot);
  const actualNode = index.get(actual.value) || null;
  const expectedNode = index.get(expected.value) || null;
  if (!actualNode || !expectedNode) {
    return { state: 'missing', actualNode, expectedNode };
  }
  return { state: 'known', actualNode, expectedNode };
}

function isAncestorNode(ancestorNode, descendantNode, index) {
  let current = descendantNode.parentId ? index.get(descendantNode.parentId) : null;
  while (current) {
    if (current.id === ancestorNode.id) return true;
    current = current.parentId ? index.get(current.parentId) : null;
  }
  return false;
}

function siblingPosition(node, parent, index) {
  if (!parent) return null;
  const visibleIds = (parent.childIds || []).filter((id) => index.get(id)?.visible === true);
  const position = visibleIds.indexOf(node.id);
  return position >= 0 ? position : null;
}

function evaluateRelation(predicate, actual, expected, snapshot, factPaths) {
  const pair = resolveNodePair(actual, expected, snapshot);
  if (pair.state !== 'known') {
    return makeTrace(predicate, TRUTH.UNKNOWN, pair.state === 'missing' ? 'relation node is outside the snapshot' : 'relation operands must be node ids', actual, expected, factPaths);
  }
  const { actualNode, expectedNode } = pair;
  const index = nodeIndex(snapshot);
  let passes = false;
  if (predicate === 'direct-parent') passes = actualNode.parentId === expectedNode.id;
  else if (predicate === 'ancestor') passes = isAncestorNode(expectedNode, actualNode, index);
  else if (predicate === 'direct-child') passes = expectedNode.parentId === actualNode.id;
  else if (predicate === 'descendant') passes = isAncestorNode(actualNode, expectedNode, index);
  else {
    const sameParent = actualNode.parentId !== null && actualNode.parentId === expectedNode.parentId;
    const parent = sameParent ? index.get(actualNode.parentId) : null;
    const actualPosition = siblingPosition(actualNode, parent, index);
    const expectedPosition = siblingPosition(expectedNode, parent, index);
    if (sameParent && actualPosition !== null && expectedPosition !== null) {
      if (predicate === 'before') passes = actualPosition < expectedPosition;
      else if (predicate === 'after') passes = actualPosition > expectedPosition;
      else passes = Math.abs(actualPosition - expectedPosition) === 1;
    }
  }
  const truth = passes ? TRUTH.TRUE : TRUTH.FALSE;
  return makeTrace(predicate, truth, truth === TRUTH.TRUE ? `node relation ${predicate} holds` : `node relation ${predicate} does not hold`, actual, expected, factPaths);
}

function isBounds(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    ['x', 'y', 'width', 'height'].every((key) => (
      typeof value[key] === 'number' && Number.isFinite(value[key])
    )) && value.width >= 0 && value.height >= 0;
}

function boundsCoordinate(bounds, axis) {
  if (axis === 'left') return bounds.x;
  if (axis === 'center-x') return bounds.x + bounds.width / 2;
  if (axis === 'right') return bounds.x + bounds.width;
  if (axis === 'top') return bounds.y;
  if (axis === 'center-y') return bounds.y + bounds.height / 2;
  return bounds.y + bounds.height;
}

function axisGap(firstStart, firstSize, secondStart, secondSize) {
  const firstEnd = firstStart + firstSize;
  const secondEnd = secondStart + secondSize;
  if (firstEnd < secondStart) return secondStart - firstEnd;
  if (secondEnd < firstStart) return firstStart - secondEnd;
  return 0;
}

function partialMatch(actual, constraint) {
  if (!constraint || typeof constraint !== 'object' || Array.isArray(constraint)) {
    return deepEqual(actual, constraint);
  }
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
  return Object.keys(constraint).every((key) => partialMatch(actual[key], constraint[key]));
}

function evaluateExpression(expression, subject, snapshot) {
  if (['all', 'any', 'not'].includes(expression.predicate)) {
    return evaluateLogicExpression(expression, subject, snapshot);
  }
  const actual = resolveValue(expression.actual, subject, snapshot);
  const expected = expression.expected
    ? resolveValue(expression.expected, subject, snapshot)
    : { state: 'known', value: null, factPaths: [] };
  const factPaths = Array.from(new Set([...actual.factPaths, ...expected.factPaths])).sort();

  if (expression.predicate === 'exists') {
    if (actual.state === 'unknown') {
      return makeTrace('exists', TRUTH.UNKNOWN, 'required fact is unknown', actual, expected, factPaths);
    }
    const truth = actual.state === 'known' && actual.value !== null ? TRUTH.TRUE : TRUTH.FALSE;
    return makeTrace('exists', truth, truth === TRUTH.TRUE ? 'fact exists' : 'fact is absent', actual, expected, factPaths);
  }
  if (expression.predicate === 'fact-present') {
    if (actual.state === 'unknown') {
      return makeTrace('fact-present', TRUTH.UNKNOWN, 'fact presence is unknown', actual, expected, factPaths);
    }
    const truth = actual.state === 'known' ? TRUTH.TRUE : TRUTH.FALSE;
    return makeTrace(
      'fact-present',
      truth,
      truth === TRUTH.TRUE ? 'fact path is present' : 'fact path is absent',
      actual,
      expected,
      factPaths,
    );
  }
  if (actual.state === 'unknown' || expected.state === 'unknown') {
    return makeTrace(expression.predicate, TRUTH.UNKNOWN, 'comparison evidence is unknown', actual, expected, factPaths);
  }
  if (actual.state === 'absent' || expected.state === 'absent') {
    if (expression.missingPolicy === 'unknown') {
      return makeTrace(expression.predicate, TRUTH.UNKNOWN, 'comparison value is absent', actual, expected, factPaths);
    }
    return makeTrace(expression.predicate, TRUTH.FALSE, 'comparison value is absent', actual, expected, factPaths);
  }
  if (expression.predicate === 'equals') {
    const truth = deepEqual(actual.value, expected.value) ? TRUTH.TRUE : TRUTH.FALSE;
    return makeTrace('equals', truth, truth === TRUTH.TRUE ? 'values are equal' : 'values differ', actual, expected, factPaths);
  }
  if (expression.predicate === 'not-equals') {
    const truth = deepEqual(actual.value, expected.value) ? TRUTH.FALSE : TRUTH.TRUE;
    return makeTrace('not-equals', truth, truth === TRUTH.TRUE ? 'values differ' : 'values are equal', actual, expected, factPaths);
  }
  if (expression.predicate === 'one-of') {
    if (!Array.isArray(expected.value)) {
      return makeTrace('one-of', TRUTH.UNKNOWN, 'expected value is not an array', actual, expected, factPaths);
    }
    const truth = expected.value.some((candidate) => deepEqual(actual.value, candidate))
      ? TRUTH.TRUE
      : TRUTH.FALSE;
    return makeTrace('one-of', truth, truth === TRUTH.TRUE ? 'value belongs to the allowed set' : 'value is outside the allowed set', actual, expected, factPaths);
  }
  if (expression.predicate === 'none-of') {
    if (!Array.isArray(expected.value)) {
      return makeTrace('none-of', TRUTH.UNKNOWN, 'expected value is not an array', actual, expected, factPaths);
    }
    const truth = expected.value.some((candidate) => deepEqual(actual.value, candidate))
      ? TRUTH.FALSE
      : TRUTH.TRUE;
    return makeTrace('none-of', truth, truth === TRUTH.TRUE ? 'value is outside the forbidden set' : 'value belongs to the forbidden set', actual, expected, factPaths);
  }
  if (expression.predicate === 'compare') {
    if (!numericValue(actual) || !numericValue(expected)) {
      return makeTrace('compare', TRUTH.UNKNOWN, 'comparison requires finite numeric values', actual, expected, factPaths);
    }
    const comparisons = {
      lt: actual.value < expected.value,
      lte: actual.value <= expected.value,
      gt: actual.value > expected.value,
      gte: actual.value >= expected.value,
    };
    const truth = comparisons[expression.operator] ? TRUTH.TRUE : TRUTH.FALSE;
    return makeTrace('compare', truth, `numeric comparison ${expression.operator} evaluated`, actual, { state: 'known', value: { operator: expression.operator, value: expected.value } }, factPaths);
  }
  if (expression.predicate === 'approximately-equals') {
    if (!numericValue(actual) || !numericValue(expected)) {
      return makeTrace(
        'approximately-equals',
        TRUTH.UNKNOWN,
        'approximate comparison requires finite numeric values',
        actual,
        expected,
        factPaths,
      );
    }
    const tolerance = expression.tolerance || 0;
    const difference = Math.abs(actual.value - expected.value);
    const truth = difference <= tolerance ? TRUTH.TRUE : TRUTH.FALSE;
    return makeTrace(
      'approximately-equals',
      truth,
      truth === TRUTH.TRUE
        ? 'values are equal within tolerance'
        : 'values differ beyond tolerance',
      actual,
      { state: 'known', value: { value: expected.value, tolerance, difference } },
      factPaths,
    );
  }
  if (expression.predicate === 'between') {
    const range = resolveBounds(expression, subject, snapshot);
    const bounds = expression.bounds || 'inclusive';
    const rangeFactPaths = Array.from(new Set([...actual.factPaths, ...range.factPaths])).sort();
    return evaluateNumericRange('between', actual, range.lower, range.upper, bounds, rangeFactPaths);
  }
  if (expression.predicate === 'string-length-between') {
    const range = resolveBounds(expression, subject, snapshot);
    const rangeFactPaths = Array.from(new Set([...actual.factPaths, ...range.factPaths])).sort();
    if (actual.state === 'unknown') {
      return makeTrace('string-length-between', TRUTH.UNKNOWN, 'string evidence is unknown', actual, { state: 'unknown' }, rangeFactPaths);
    }
    if (actual.state === 'absent') {
      return makeTrace('string-length-between', TRUTH.FALSE, 'string value is absent', actual, { state: 'absent' }, rangeFactPaths);
    }
    if (typeof actual.value !== 'string') {
      return makeTrace('string-length-between', TRUTH.UNKNOWN, 'actual value is not a string', actual, { state: 'unknown' }, rangeFactPaths);
    }
    return evaluateNumericRange(
      'string-length-between',
      { state: 'known', value: Array.from(actual.value).length, factPaths: actual.factPaths },
      range.lower,
      range.upper,
      expression.bounds || 'inclusive',
      rangeFactPaths,
    );
  }
  if (expression.predicate === 'matches') {
    if (typeof actual.value !== 'string' || typeof expected.value !== 'string') {
      return makeTrace('matches', TRUTH.UNKNOWN, 'regex comparison requires string values', actual, expected, factPaths);
    }
    let matcher;
    try {
      matcher = new RegExp(expected.value, expression.flags || 'u');
    } catch (_error) {
      return makeTrace('matches', TRUTH.UNKNOWN, 'regular expression is invalid', actual, expected, factPaths);
    }
    const truth = matcher.test(actual.value) ? TRUTH.TRUE : TRUTH.FALSE;
    return makeTrace('matches', truth, truth === TRUTH.TRUE ? 'string matches the pattern' : 'string does not match the pattern', actual, { state: 'known', value: { pattern: expected.value, flags: expression.flags || 'u' } }, factPaths);
  }
  if (['every', 'some', 'none'].includes(expression.predicate)) {
    if (!knownArray(actual)) {
      return makeTrace(expression.predicate, TRUTH.UNKNOWN, 'collection predicate requires an actual array', actual, expected, factPaths);
    }
    const allowed = Array.isArray(expected.value) ? expected.value : [expected.value];
    const matches = actual.value.map((item) => allowed.some((candidate) => deepEqual(item, candidate)));
    const values = {
      every: matches.every(Boolean),
      some: matches.some(Boolean),
      none: matches.every((match) => !match),
    };
    const truth = values[expression.predicate] ? TRUTH.TRUE : TRUTH.FALSE;
    return makeTrace(expression.predicate, truth, `collection membership ${expression.predicate} evaluated`, actual, { state: 'known', value: allowed }, factPaths);
  }
  if (expression.predicate === 'count-between') {
    const range = resolveBounds(expression, subject, snapshot);
    const rangeFactPaths = Array.from(new Set([...actual.factPaths, ...range.factPaths])).sort();
    if (!knownArray(actual)) {
      return makeTrace('count-between', actual.state === 'unknown' ? TRUTH.UNKNOWN : TRUTH.FALSE, 'count predicate requires an actual array', actual, { state: 'unknown' }, rangeFactPaths);
    }
    return evaluateNumericRange(
      'count-between',
      { state: 'known', value: actual.value.length, factPaths: actual.factPaths },
      range.lower,
      range.upper,
      expression.bounds || 'inclusive',
      rangeFactPaths,
    );
  }
  if (expression.predicate === 'all-equal') {
    if (!knownArray(actual)) {
      return makeTrace('all-equal', TRUTH.UNKNOWN, 'all-equal requires an actual array', actual, expected, factPaths);
    }
    const reference = expression.expected ? expected.value : actual.value[0];
    const truth = actual.value.every((item) => deepEqual(item, reference)) ? TRUTH.TRUE : TRUTH.FALSE;
    return makeTrace('all-equal', truth, truth === TRUTH.TRUE ? 'all collection values are equal' : 'collection values differ', actual, { state: 'known', value: reference }, factPaths);
  }
  if (expression.predicate === 'unique') {
    if (!knownArray(actual)) {
      return makeTrace('unique', TRUTH.UNKNOWN, 'unique requires an actual array', actual, expected, factPaths);
    }
    const identities = actual.value.map(stableStringify);
    const truth = identities.length === new Set(identities).size ? TRUTH.TRUE : TRUTH.FALSE;
    return makeTrace('unique', truth, truth === TRUTH.TRUE ? 'collection values are unique' : 'collection contains duplicates', actual, { state: 'known', value: 'unique values' }, factPaths);
  }
  if (expression.predicate === 'sequence-equals') {
    if (!knownArray(actual) || !knownArray(expected)) {
      return makeTrace('sequence-equals', TRUTH.UNKNOWN, 'sequence comparison requires two arrays', actual, expected, factPaths);
    }
    const truth = deepEqual(actual.value, expected.value) ? TRUTH.TRUE : TRUTH.FALSE;
    return makeTrace('sequence-equals', truth, truth === TRUTH.TRUE ? 'sequences are equal' : 'sequences differ', actual, expected, factPaths);
  }
  if (expression.predicate === 'value-position') {
    if (!knownArray(actual)) {
      return makeTrace('value-position', TRUTH.UNKNOWN, 'value-position requires an actual array', actual, expected, factPaths);
    }
    const positions = expression.positions;
    const matchingIndexes = actual.value
      .map((item, index) => (deepEqual(item, expected.value) ? index : -1))
      .filter((index) => index >= 0);
    const allowedIndexes = new Set();
    for (const position of positions) {
      if (position === 'first') allowedIndexes.add(0);
      else if (position === 'last') allowedIndexes.add(Math.max(0, actual.value.length - 1));
      else if (Number.isInteger(position) && position >= 0) allowedIndexes.add(position);
    }
    const withinCount = expression.maxCount === undefined || matchingIndexes.length <= expression.maxCount;
    const correctlyPositioned = matchingIndexes.every((index) => allowedIndexes.has(index));
    const truth = withinCount && correctlyPositioned ? TRUTH.TRUE : TRUTH.FALSE;
    return makeTrace('value-position', truth, truth === TRUTH.TRUE ? 'matching values occupy allowed positions' : 'matching values violate position or count constraints', actual, { state: 'known', value: { value: expected.value, positions, maxCount: expression.maxCount ?? null } }, factPaths);
  }
  if ([
    'direct-parent',
    'ancestor',
    'direct-child',
    'descendant',
    'before',
    'after',
    'adjacent',
  ].includes(expression.predicate)) {
    return evaluateRelation(expression.predicate, actual, expected, snapshot, factPaths);
  }
  if (['contains', 'overlaps', 'aligned', 'distance'].includes(expression.predicate)) {
    const target = resolveValue(expression.target, subject, snapshot);
    const geometryFactPaths = Array.from(new Set([...actual.factPaths, ...target.factPaths, ...expected.factPaths])).sort();
    if (actual.state === 'unknown' || target.state === 'unknown' || expected.state === 'unknown') {
      return makeTrace(expression.predicate, TRUTH.UNKNOWN, 'geometry evidence is unknown', actual, target, geometryFactPaths);
    }
    if (!isBounds(actual.value) || !isBounds(target.value)) {
      return makeTrace(expression.predicate, TRUTH.UNKNOWN, 'geometry predicate requires valid bounds', actual, target, geometryFactPaths);
    }
    let passes = false;
    let measured = null;
    if (expression.predicate === 'contains') {
      passes = target.value.x >= actual.value.x &&
        target.value.y >= actual.value.y &&
        target.value.x + target.value.width <= actual.value.x + actual.value.width &&
        target.value.y + target.value.height <= actual.value.y + actual.value.height;
    } else if (expression.predicate === 'overlaps') {
      const intersectionWidth = Math.min(actual.value.x + actual.value.width, target.value.x + target.value.width) - Math.max(actual.value.x, target.value.x);
      const intersectionHeight = Math.min(actual.value.y + actual.value.height, target.value.y + target.value.height) - Math.max(actual.value.y, target.value.y);
      passes = intersectionWidth > 0 && intersectionHeight > 0;
    } else if (expression.predicate === 'aligned') {
      measured = Math.abs(boundsCoordinate(actual.value, expression.axis) - boundsCoordinate(target.value, expression.axis));
      passes = measured <= (expression.tolerance || 0);
    } else {
      if (!numericValue(expected)) {
        return makeTrace('distance', TRUTH.UNKNOWN, 'distance expectation must be a finite number', actual, expected, geometryFactPaths);
      }
      const horizontal = axisGap(actual.value.x, actual.value.width, target.value.x, target.value.width);
      const vertical = axisGap(actual.value.y, actual.value.height, target.value.y, target.value.height);
      measured = expression.axis === 'horizontal'
        ? horizontal
        : (expression.axis === 'vertical' ? vertical : Math.sqrt(horizontal ** 2 + vertical ** 2));
      passes = Math.abs(measured - expected.value) <= (expression.tolerance || 0);
    }
    const truth = passes ? TRUTH.TRUE : TRUTH.FALSE;
    const expectedTrace = expression.predicate === 'distance'
      ? { state: 'known', value: { distance: expected.value, axis: expression.axis, tolerance: expression.tolerance || 0, measured } }
      : { state: 'known', value: { target: target.value, axis: expression.axis || null, tolerance: expression.tolerance || 0, measured } };
    return makeTrace(expression.predicate, truth, truth === TRUTH.TRUE ? `geometry ${expression.predicate} holds` : `geometry ${expression.predicate} does not hold`, actual, expectedTrace, geometryFactPaths);
  }
  if (expression.predicate === 'component-api-valid') {
    const valid = typeof actual.value === 'boolean'
      ? actual.value
      : (actual.value && typeof actual.value === 'object' ? actual.value.valid : undefined);
    if (typeof valid !== 'boolean') {
      return makeTrace('component-api-valid', TRUTH.UNKNOWN, 'component API evidence has no boolean validity', actual, expected, factPaths);
    }
    return makeTrace('component-api-valid', valid ? TRUTH.TRUE : TRUTH.FALSE, valid ? 'component API is valid' : 'component API is invalid', actual, { state: 'known', value: true }, factPaths);
  }
  if (expression.predicate === 'matches-effective-baseline') {
    const truth = deepEqual(actual.value, expected.value) ? TRUTH.TRUE : TRUTH.FALSE;
    return makeTrace('matches-effective-baseline', truth, truth === TRUTH.TRUE ? 'actual value matches effective baseline' : 'actual value differs from effective baseline', actual, expected, factPaths);
  }
  if (['binding-satisfies', 'paint-state-satisfies'].includes(expression.predicate)) {
    if (!expected.value || typeof expected.value !== 'object' || Array.isArray(expected.value)) {
      return makeTrace(expression.predicate, TRUTH.UNKNOWN, 'contract constraint must be an object', actual, expected, factPaths);
    }
    const truth = partialMatch(actual.value, expected.value) ? TRUTH.TRUE : TRUTH.FALSE;
    return makeTrace(expression.predicate, truth, truth === TRUTH.TRUE ? 'contract constraint is satisfied' : 'contract constraint is not satisfied', actual, expected, factPaths);
  }
  return makeTrace(expression.predicate, TRUTH.UNKNOWN, 'predicate is not implemented', actual, expected, factPaths);
}

function scopeApplicability(rule, snapshot) {
  const scope = rule.scope || {};
  let unknown;
  for (const key of ['platform', 'product', 'channel', 'pageType']) {
    if (!scope[key]?.length) continue;
    const factPath = `page.context.${key}`;
    const actual = resolveValue({ fact: factPath }, { unknownFacts: [] }, snapshot);
    const result = { dimension: key === 'pageType' ? 'page type' : key, actual, expected: scope[key], factPath };
    if (actual.state !== 'known' || typeof actual.value !== 'string' || !actual.value.trim()) {
      unknown = unknown || { ...result, applicability: APPLICABILITY.UNKNOWN };
      continue;
    }
    // Scope dimensions are a conjunction: a known mismatch dominates unknowns.
    if (!scope[key].includes(actual.value)) return { ...result, applicability: APPLICABILITY.NOT_APPLICABLE };
  }
  return unknown || { applicability: APPLICABILITY.APPLICABLE };
}

const EXECUTION_INDEX = Symbol('predicate-execution-index');
function nodeIndex(snapshot) {
  return snapshot[EXECUTION_INDEX] || new Map(snapshot.nodes.map((node) => [node.id, node]));
}

function descendantsOf(root, index) {
  const result = [];
  const visit = (node) => {
    for (const childId of node.childIds || []) {
      const child = index.get(childId);
      if (!child || child.visible !== true) continue;
      result.push(child);
      visit(child);
    }
  };
  visit(root);
  return result;
}

function traversalNodes(root, traverse, index) {
  if (traverse === 'self') return [root];
  if (traverse === 'direct-children') {
    return (root.childIds || []).map((id) => index.get(id)).filter((node) => node?.visible === true);
  }
  if (traverse === 'descendants') return descendantsOf(root, index);
  if (traverse === 'self-and-descendants') return [root, ...descendantsOf(root, index)];
  if (traverse === 'parent') {
    const parent = root.parentId ? index.get(root.parentId) : null;
    return parent?.visible === true ? [parent] : [];
  }
  if (traverse === 'ancestors') {
    const result = [];
    let current = root.parentId ? index.get(root.parentId) : null;
    while (current) {
      if (current.visible === true) result.push(current);
      current = current.parentId ? index.get(current.parentId) : null;
    }
    return result;
  }
  if (traverse === 'siblings') {
    const parent = root.parentId ? index.get(root.parentId) : null;
    return (parent?.childIds || [])
      .filter((id) => id !== root.id)
      .map((id) => index.get(id))
      .filter((node) => node?.visible === true);
  }
  throw capabilityError('SELECTOR_NOT_IMPLEMENTED', `Unsupported traversal: ${traverse}`);
}

function selectionRoots(snapshot, from, index) {
  if (from === 'selection-root' || from === 'self') {
    const ids = from === 'self' ? snapshot.selection.slice(0, 1) : snapshot.selection;
    return ids.map((id) => index.get(id)).filter((node) => node?.visible === true);
  }
  if (from === 'page-descendants') {
    return snapshot.nodes.filter((node) => node.visible === true && node.parentId === null);
  }
  throw capabilityError('SELECTOR_NOT_IMPLEMENTED', `Unsupported selector origin: ${from}`);
}

function selectSubjects(rule, snapshot) {
  const index = nodeIndex(snapshot);
  const roots = selectionRoots(snapshot, rule.select.from, index);
  const candidates = roots.flatMap((root) => traversalNodes(root, rule.select.traverse, index));
  const unique = new Map(candidates.map((node) => [node.id, node]));
  const unknownNodes = [];
  const nodes = Array.from(unique.values()).filter((node) => {
    for (const expression of rule.select.where || []) {
      const result = evaluateExpression(expression, node, snapshot);
      if (result.truth === TRUTH.UNKNOWN) {
        unknownNodes.push(node);
        return false;
      }
      if (result.truth === TRUTH.FALSE) return false;
    }
    return true;
  });
  nodes.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  unknownNodes.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  return { nodes, unknown: unknownNodes.length > 0, unknownNodes, roots };
}

function terminalClassification(rule, truth) {
  if (truth === TRUTH.UNKNOWN) return rule.unknownPolicy;
  if (rule.effect === 'allow') return truth === TRUTH.TRUE ? 'allowed' : 'not-applicable';
  const violation = rule.effect === 'require' ? truth === TRUTH.FALSE : truth === TRUTH.TRUE;
  return violation ? 'violation' : 'compliant';
}

function evaluationId(hash, rule, subject, trace, applicability) {
  return stableHash({
    snapshotHash: hash,
    ruleId: rule.ruleId,
    ruleRevision: rule.revision,
    subjectNodeId: subject.id,
    factPaths: trace.factPaths,
    applicability,
  });
}

function traceNodes(trace) {
  if (!trace || typeof trace !== 'object') return [];
  return [trace, ...(trace.children || []).flatMap(traceNodes)];
}

function normalizePlatformTrace(rule, subject, trace) {
  if (rule.presentation?.causalRole !== 'platform-root') return trace;
  const componentPlatform = subject.component?.platform;
  const candidates = traceNodes(trace).filter((item) => (
    (item.factPaths || []).includes('page.context.platform')
  ));
  const comparison = componentPlatform === 'universal'
    ? candidates.find((item) => item.predicate === 'one-of')
    : candidates.find((item) => (
      item.predicate === 'equals'
      && (item.factPaths || []).includes('component.platform')
    ));
  if (!comparison) return trace;
  return Object.assign({}, trace, {
    reason: 'page channel compatibility evaluated',
    actual: comparison.actual,
    expected: comparison.expected,
  });
}

function makeEvaluation(hash, rule, subject, applicability, classification, trace) {
  const normalizedTrace = normalizePlatformTrace(rule, subject, trace);
  return {
    evaluationId: evaluationId(hash, rule, subject, normalizedTrace, applicability),
    ruleId: rule.ruleId,
    ruleRevision: rule.revision,
    subjectNodeId: subject.id,
    subjectNodeName: subject.name || subject.id,
    focusNodeId: subject.id,
    focusNodeName: subject.name || subject.id,
    applicability,
    classification,
    severity: rule.severity,
    trace: normalizedTrace,
    actionId: null,
  };
}

function buildCoverage(evaluations) {
  const byClassification = {};
  for (const item of evaluations) {
    byClassification[item.classification] = (byClassification[item.classification] || 0) + 1;
  }
  const ids = evaluations.map((item) => item.evaluationId);
  return {
    total: evaluations.length,
    byClassification,
    unclassified: evaluations.filter((item) => !item.classification).length,
    duplicateEvaluationIds: ids.length - new Set(ids).size,
  };
}

function isDescendantOrSelf(node, ancestorNodeId, index) {
  let current = node;
  while (current) {
    if (current.id === ancestorNodeId) return true;
    current = current.parentId ? index.get(current.parentId) : null;
  }
  return false;
}

function suppressPlatformDependentViolations(evaluations, rules, snapshot, hash) {
  const index = nodeIndex(snapshot);
  const rulesById = new Map(rules.map((rule) => [rule.ruleId, rule]));
  const platformViolations = evaluations.filter((evaluation) => (
    evaluation.classification === 'violation'
    && rulesById.get(evaluation.ruleId)?.presentation?.causalRole === 'platform-root'
  ));
  if (!platformViolations.length) return evaluations;

  return evaluations.map((evaluation) => {
    if (
      evaluation.classification !== 'violation'
      || platformViolations.some((platform) => platform.evaluationId === evaluation.evaluationId)
      || !(evaluation.trace?.factPaths || []).includes('page.context.platform')
    ) return evaluation;

    const subject = index.get(evaluation.subjectNodeId);
    const cause = platformViolations.find((platform) => (
      subject && isDescendantOrSelf(subject, platform.subjectNodeId, index)
    ));
    if (!cause) return evaluation;

    const rule = rulesById.get(evaluation.ruleId);
    if (!rule) return evaluation;
    const trace = makeTrace(
      'causal-suppression',
      TRUTH.UNKNOWN,
      `platform-dependent violation is suppressed by ${cause.ruleId}`,
      { state: 'known', value: evaluation.subjectNodeId },
      { state: 'known', value: cause.subjectNodeId },
      ['page.context.platform'],
    );
    return Object.assign(
      makeEvaluation(
        hash,
        rule,
        subject,
        APPLICABILITY.NOT_APPLICABLE,
        'not-applicable',
        trace,
      ),
      {
        suppressedByEvaluationId: cause.evaluationId,
        suppressedByRuleId: cause.ruleId,
      },
    );
  });
}

function causalRelationMatches(root, derived, relation, index) {
  if (relation === 'same-subject') {
    return root.subjectNodeId === derived.subjectNodeId;
  }
  if (relation === 'same-focus') {
    return root.focusNodeId === derived.focusNodeId;
  }
  if (relation === 'descendant-subject') {
    const derivedSubject = index.get(derived.subjectNodeId);
    return Boolean(
      derivedSubject
      && derivedSubject.id !== root.subjectNodeId
      && isDescendantOrSelf(derivedSubject, root.subjectNodeId, index)
    );
  }
  return false;
}

function groupCausalViolations(evaluations, rules, snapshot) {
  const index = nodeIndex(snapshot);
  const rulesById = new Map(rules.map((rule) => [rule.ruleId, rule]));
  const violations = evaluations.filter((evaluation) => (
    evaluation.classification === 'violation'
  ));
  const assignmentByDerivedId = new Map();
  const derivedByRootId = new Map();

  const roots = violations
    .filter((evaluation) => rulesById.get(evaluation.ruleId)?.causality?.causes?.length)
    .sort((left, right) => (
      left.subjectNodeId.localeCompare(right.subjectNodeId)
      || left.ruleId.localeCompare(right.ruleId)
      || left.evaluationId.localeCompare(right.evaluationId)
    ));

  for (const root of roots) {
    const rule = rulesById.get(root.ruleId);
    for (const cause of rule.causality.causes) {
      const candidates = violations
        .filter((evaluation) => (
          evaluation.evaluationId !== root.evaluationId
          && evaluation.ruleId === cause.ruleId
          && !assignmentByDerivedId.has(evaluation.evaluationId)
          && causalRelationMatches(root, evaluation, cause.relation, index)
        ))
        .sort((left, right) => (
          left.subjectNodeId.localeCompare(right.subjectNodeId)
          || left.evaluationId.localeCompare(right.evaluationId)
        ));
      for (const derived of candidates) {
        assignmentByDerivedId.set(derived.evaluationId, {
          rootFindingId: root.evaluationId,
          causalGroupingReason: cause.reason,
        });
        if (!derivedByRootId.has(root.evaluationId)) {
          derivedByRootId.set(root.evaluationId, []);
        }
        derivedByRootId.get(root.evaluationId).push(derived.evaluationId);
      }
    }
  }

  return evaluations.map((evaluation) => {
    const derived = assignmentByDerivedId.get(evaluation.evaluationId);
    if (derived) {
      return Object.assign({}, evaluation, derived, { derivedFindingIds: [] });
    }
    const derivedFindingIds = (derivedByRootId.get(evaluation.evaluationId) || [])
      .slice()
      .sort((left, right) => left.localeCompare(right));
    if (!derivedFindingIds.length) return evaluation;
    return Object.assign({}, evaluation, {
      rootFindingId: evaluation.evaluationId,
      derivedFindingIds,
      causalGroupingReason: 'explicit source-rule causal relation',
    });
  });
}

function evaluateRules({ snapshot, rules, ruleRelease = 'unversioned' }) {
  // A private view keeps indexes local to this execution and outside snapshot hashes.
  snapshot = Object.assign({}, snapshot);
  Object.defineProperty(snapshot, EXECUTION_INDEX, { value: nodeIndex(snapshot) });
  const hash = snapshotHash(snapshot);
  const evaluations = [];
  for (const ruleInput of rules) {
    const rule = validateRule(ruleInput);
    const index = nodeIndex(snapshot);
    const fallback = index.get(snapshot.selection[0]) || snapshot.nodes[0];
    if (!fallback) continue;
    if (rule.authority?.status !== 'active') {
      const trace = makeTrace(rule.assert.predicate, TRUTH.UNKNOWN, 'rule authority is not active', { state: 'unknown' }, { state: 'unknown' }, []);
      evaluations.push(makeEvaluation(hash, rule, fallback, APPLICABILITY.UNKNOWN, 'not-evaluable', trace));
      continue;
    }
    const scopeResult = scopeApplicability(rule, snapshot);
    let unknownScopeTrace;
    if (scopeResult.applicability !== APPLICABILITY.APPLICABLE) {
      const unknown = scopeResult.applicability === APPLICABILITY.UNKNOWN;
      const trace = makeTrace(
        'one-of',
        unknown ? TRUTH.UNKNOWN : TRUTH.FALSE,
        `rule ${scopeResult.dimension} scope ${unknown ? 'is unknown' : 'does not apply'}`,
        scopeResult.actual,
        { state: 'known', value: scopeResult.expected },
        [scopeResult.factPath],
      );
      if (!unknown) {
        evaluations.push(makeEvaluation(hash, rule, fallback, scopeResult.applicability, 'not-applicable', trace));
        continue;
      }
      unknownScopeTrace = trace;
    }
    const selected = selectSubjects(rule, snapshot);
    if (selected.unknown && !selected.nodes.length) {
      const trace = makeTrace(rule.assert.predicate, TRUTH.UNKNOWN, 'selector evidence is unknown', { state: 'unknown' }, { state: 'unknown' }, []);
      evaluations.push(makeEvaluation(hash, rule, fallback, APPLICABILITY.UNKNOWN, rule.unknownPolicy, trace));
      continue;
    }
    if (!selected.nodes.length) {
      if (unknownScopeTrace) {
        evaluations.push(makeEvaluation(hash, rule, fallback, APPLICABILITY.UNKNOWN, rule.unknownPolicy, unknownScopeTrace));
        continue;
      }
      const trace = makeTrace(rule.assert.predicate, TRUTH.UNKNOWN, 'selector matched no visible nodes', { state: 'absent' }, { state: 'unknown' }, []);
      evaluations.push(makeEvaluation(hash, rule, fallback, APPLICABILITY.NOT_APPLICABLE, 'not-applicable', trace));
      continue;
    }
    for (const subject of selected.nodes) {
      if (rule.when) {
        const whenTrace = evaluateExpression(rule.when, subject, snapshot);
        if (whenTrace.truth === TRUTH.FALSE) {
          evaluations.push(makeEvaluation(hash, rule, subject, APPLICABILITY.NOT_APPLICABLE, 'not-applicable', whenTrace));
          continue;
        }
        if (whenTrace.truth === TRUTH.UNKNOWN) {
          evaluations.push(makeEvaluation(hash, rule, subject, APPLICABILITY.UNKNOWN, rule.unknownPolicy, whenTrace));
          continue;
        }
      }
      if (unknownScopeTrace) {
        evaluations.push(makeEvaluation(hash, rule, subject, APPLICABILITY.UNKNOWN, rule.unknownPolicy, unknownScopeTrace));
        continue;
      }
      const trace = evaluateExpression(rule.assert, subject, snapshot);
      evaluations.push(makeEvaluation(
        hash,
        rule,
        subject,
        APPLICABILITY.APPLICABLE,
        terminalClassification(rule, trace.truth),
        trace,
      ));
    }
  }
  const normalizedEvaluations = groupCausalViolations(suppressPlatformDependentViolations(
    evaluations,
    rules,
    snapshot,
    hash,
  ), rules, snapshot);
  normalizedEvaluations.sort((left, right) => (
    left.subjectNodeId.localeCompare(right.subjectNodeId) ||
    left.ruleId.localeCompare(right.ruleId) ||
    left.evaluationId.localeCompare(right.evaluationId)
  ));
  return {
    schemaVersion: 'apollo.predicate-result.v1',
    snapshotHash: hash,
    ruleRelease,
    evaluations: normalizedEvaluations,
    coverage: buildCoverage(normalizedEvaluations),
  };
}

module.exports = {
  APPLICABILITY,
  IMPLEMENTED_PREDICATES,
  TRUTH,
  evaluateExpression,
  evaluateRules,
  resolveValue,
  selectSubjects,
  snapshotHash,
  stableHash,
  stableStringify,
  validateRule,
};
