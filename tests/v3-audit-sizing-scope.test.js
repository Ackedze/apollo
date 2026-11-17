const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const key = '1'.repeat(40), nestedKey = '2'.repeat(40), foreignKey = '3'.repeat(40);

function load() {
  const result = esbuild.buildSync({
    stdin: {resolveDir: root, loader: 'ts', contents: `
      export * from './src/v3-audit/rules/componentRules';
      export * from './src/v3-audit/rules/runtimeContractRegistry';
      export * from './src/v3-audit/assessment/customizationAssessment';
      export * from './src/v3-audit/structure/diff';
    `}, bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'silent',
  });
  const module = {exports: {}};
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}
const api = load();
function rule(extra = {}) {
  return Object.assign({ruleId: 'synthetic.root-sizing', severity: 'error', source: 'owner-confirmed',
    ruleKind: 'design-rule', authority: {status: 'active', provenance: 'design-system-author', revision: 1},
    appliesTo: 'layout.sizing.*|variant.CustomExtent', checkType: 'deterministic', matchKind: 'exact_component_rule',
    requiredValues: {'layout.sizing.horizontal': 'FILL', 'layout.sizing.vertical': 'HUG'}, ruleText: 'Root Fill/Hug.'}, extra);
}
function entry(componentKey, rules) {
  return {componentKey, aliases: [], figmaKeys: [componentKey], rulesFile: {componentKey, rules}};
}
function withRules(rules, run, extraEntries = []) {
  globalThis.__APOLLO_TEST_REMOTE_COMPONENT_RULE_REGISTRY__ = [entry(key, rules)].concat(extraEntries);
  try { return run(); } finally { delete globalThis.__APOLLO_TEST_REMOTE_COMPONENT_RULE_REGISTRY__; api.clearNormalizedAuditPolicies(); }
}
function node(id, parentId, name, componentKey, horizontal, vertical, variant = 'True') {
  return {id, nodeId: String(id), parentId, name, path: parentId ? `Renamed / ${name}` : name,
    type: componentKey ? 'INSTANCE' : 'FRAME', visible: true,
    componentInstance: componentKey ? {componentKey, variantProperties: {CustomExtent: variant}} : null,
    layout: {sizing: {horizontal, vertical}}};
}
function diff(property = 'layout.sizing.vertical', actual = 'Fixed', options = {}) {
  const self = options.self === true;
  return {nodeId: self ? '1' : '2', nodeName: self ? 'Renamed' : 'Surface',
    nodePath: self ? 'Renamed' : 'Renamed / Body / Surface', visible: true, diffKind: 'layout', message: 'Synthetic change',
    context: {actualComponentKey: self ? key : null, referenceComponentKey: null, referenceOrigin: 'host',
      actualNestedOwnerComponentKey: self ? null : key, actualNestedOwnerPath: self ? null : 'Renamed',
      actualNestedOwnerRelativePath: self ? null : 'Body / Surface', nestedOwnerComponentKey: null,
      nestedOwnerComponentRole: null, nestedOwnerPath: null, nestedOwnerRelativePath: null,
      actualVariantProperties: {CustomExtent: options.variant ?? 'True'}, referenceVariantProperties: null},
    details: {property, reference: {value: property === 'layout.height' ? 200 : 'Hug'}, actual: {value: actual}},
    assessment: {verdict: 'unknown', source: 'standalone-reference', reasonCode: 'no-contextual-expectation',
      ruleId: null, message: 'Unknown', remediation: null, presentation: 'show'}};
}

test('root requirements do not synthesize violations on ordinary internal frames', () => withRules([rule()], () => {
  const input = [node(1, null, 'Renamed', key, 'FILL', 'HUG'), node(2, 1, 'Body', null, 'FIXED', 'FIXED')];
  const before = JSON.stringify(input);
  assert.deepEqual(api.createRequiredComponentSizingDiffs(input), []);
  assert.equal(JSON.stringify(input), before);
}));
test('root requirements still find both axes on renamed roots and dedupe existing findings', () => withRules([rule()], () => {
  const input = [node(1, null, 'Renamed', key, 'FIXED', 'FILL')];
  const found = api.createRequiredComponentSizingDiffs(input);
  assert.equal(found.length, 2);
  assert(found.every(d => d.nodeId === '1' && d.assessment.verdict === 'violation'));
  assert.equal(api.createRequiredComponentSizingDiffs(input, found).length, 0);
}));
test('each nested instance keeps its own root rule while its ordinary descendants do not inherit it', () => {
  const nested = rule({ruleId: 'synthetic.nested-sizing', requiredValues: {'layout.sizing.vertical': 'HUG'}});
  withRules([rule()], () => {
    const input = [node(1, null, 'Renamed', key, 'FILL', 'HUG'), node(2, 1, 'Other', nestedKey, 'FIXED', 'FIXED'), node(3, 2, 'Body', null, 'FIXED', 'FIXED')];
    const found = api.createRequiredComponentSizingDiffs(input);
    assert.equal(found.length, 1);
    assert.equal(found[0].nodeId, '2');
    assert.equal(found[0].assessment.ruleId, nested.ruleId);
  }, [entry(nestedKey, [nested])]);
});
test('all assessment entry points reject inherited root sizing claims and preserve raw facts', () => withRules([rule()], () => {
  const input = diff(), before = JSON.stringify(input);
  assert.equal(api.findComponentContractViolationForDiff(input), null);
  assert.equal(api.applyRequiredComponentSizingAssessment(input), input);
  assert.equal(api.finalizeComponentRuleAssessment(input), input);
  assert.equal(JSON.stringify(input), before);
}));
test('a declared sizing value is not violated merely because the library baseline differs', () => withRules([rule()], () => {
  const input = diff('layout.sizing.vertical', 'Hug', {self: true});
  input.details.reference.value = 'Fill';
  assert.equal(api.findComponentContractViolationForDiff(input), null);
  assert.notEqual(api.applyRequiredComponentSizingAssessment(input).assessment.verdict, 'violation');
  assert.notEqual(api.finalizeComponentRuleAssessment(input).assessment.verdict, 'violation');
}));
test('variant metadata alongside root sizing is not itself an atomic sizing requirement', () => withRules([rule()], () => {
  const input = diff('variant.CustomExtent', 'True', {self: true});
  assert.equal(api.findComponentContractViolationForDiff(input), null);
}));
test('explicit nested-layer and root selectors retain their existing meaning', () => {
  for (const target of [{layer: 'Body / Surface'}, {slot: 'Body / Surface'}]) withRules([rule({target, requiredValues: {'layout.sizing.vertical': 'HUG'}})], () => {
    assert.equal(api.findComponentContractViolationForDiff(diff()).ruleId, rule().ruleId);
  });
  withRules([rule({target: {layer: 'root'}})], () => {
    assert.equal(api.findComponentContractViolationForDiff(diff()), null);
    assert.equal(api.findComponentContractViolationForDiff(diff('layout.sizing.vertical', 'Fixed', {self: true})).ruleId, rule().ruleId);
  });
});

function heightRule(extra = {}) {
  return rule(Object.assign({ruleId: 'synthetic.surface-custom-height', severity: 'info', appliesTo: 'layout.height', requiredValues: undefined,
    target: {layer: 'Body / Surface'}, conditions: {variant: {CustomExtent: 'True'}},
    classification: {treatAsAllowed: true}, ruleText: 'The selected mode permits this surface height.'}, extra));
}
test('a targeted conditional allowance permits only the declared layer, property and actual variant', () => withRules([rule(), heightRule()], () => {
  const allowed = diff('layout.height', 440), before = JSON.stringify(allowed);
  assert.equal(api.findComponentContractViolationForDiff(allowed), null);
  const output = api.applyContextualComponentRuleAssessment(allowed);
  assert.equal(output.assessment.verdict, 'allowed');
  assert.equal(output.assessment.ruleId, heightRule().ruleId);
  assert.equal(JSON.stringify(allowed), before);
  const controls = [diff('layout.width', 440), diff('layout.height', 440, {variant: 'False'}), diff('layout.height', 440, {self: true})];
  const sibling = diff('layout.height', 440); sibling.nodeName = 'Text'; sibling.nodePath = 'Renamed / Body / Text'; controls.push(sibling);
  const foreign = diff('layout.height', 440); foreign.context.actualNestedOwnerComponentKey = foreignKey; controls.push(foreign);
  const missing = diff('layout.height', 440); missing.context.actualVariantProperties = null; controls.push(missing);
  for (const input of controls) assert.notEqual(api.applyContextualComponentRuleAssessment(input).assessment.verdict, 'allowed');
  assert.equal(api.createRequiredComponentSizingDiffs([node(1, null, 'Renamed', key, 'FIXED', 'FIXED')]).length, 2);
}));
test('allowances do not override confirmed violations or accept inactive and broad declarations', () => {
  const controls = [heightRule({authority: {status: 'inactive', provenance: 'design-system-author', revision: 1}}), heightRule({target: undefined}), heightRule({appliesTo: 'layout.*'})];
  for (const candidate of controls) withRules([candidate], () => {
    const input = diff('layout.height', 440);
    assert.notEqual(api.applyContextualComponentRuleAssessment(input).assessment.verdict, 'allowed');
  });
  withRules([heightRule()], () => {
    const input = diff('layout.height', 440); input.assessment.verdict = 'violation';
    assert.equal(api.applyContextualComponentRuleAssessment(input), input);
  });
});
test('the complementary baseline rule still forbids custom height in the other variant', () => {
  const denied = heightRule({ruleId: 'synthetic.surface-content-height', severity: 'error', conditions: {variant: {CustomExtent: 'False'}}, classification: undefined});
  withRules([heightRule(), denied], () => {
    const input = diff('layout.height', 440, {variant: 'False'});
    assert.equal(api.finalizeComponentRuleAssessment(input).assessment.verdict, 'violation');
    assert.equal(api.finalizeComponentRuleAssessment(input).assessment.ruleId, denied.ruleId);
  });
});
test('matching sizing never erases an independently confirmed violation', () => withRules([rule()], () => {
  const input = diff('layout.sizing.vertical', 'Hug', {self: true});
  input.assessment = Object.assign({}, input.assessment, {verdict: 'violation', ruleId: 'independent.rule'});
  assert.equal(api.applyRequiredComponentSizingAssessment(input), input);
  assert.equal(input.assessment.ruleId, 'independent.rule');
}));
test('missing, nonfinite and malformed actual facts never grant a dimension allowance', () => withRules([heightRule()], () => {
  for (const value of [undefined, null, NaN, Infinity, {}, true, 'auto', 'unknown']) {
    assert.notEqual(api.applyContextualComponentRuleAssessment(diff('layout.height', value)).assessment.verdict, 'allowed');
  }
  const missing = diff('layout.height', 440);
  missing.context.actualVariantProperties = null;
  missing.context.referenceVariantProperties = {CustomExtent: 'True'};
  assert.notEqual(api.applyContextualComponentRuleAssessment(missing).assessment.verdict, 'allowed');
  for (const value of [true, {}, null]) {
    const malformed = diff('layout.height', 440); malformed.context.actualVariantProperties = {CustomExtent: value};
    assert.notEqual(api.applyContextualComponentRuleAssessment(malformed).assessment.verdict, 'allowed');
  }
}));
test('ordinary owner-scoped typography and fill checks remain active', () => {
  for (const property of ['styles.text', 'fill']) withRules([rule({ruleId: 'synthetic.layer-baseline', appliesTo: property, requiredValues: undefined})], () => {
    const input = diff(property, 'Changed');
    assert.equal(api.finalizeComponentRuleAssessment(input).assessment.verdict, 'violation');
  });
});
test('an applicable numeric violation outranks an allowance and a catalog-expected value', () => {
  const limit = heightRule({ruleId: 'synthetic.height-limit', severity: 'error', classification: undefined, numericConstraint: {maximum: 400}});
  withRules([heightRule(), limit], () => {
    const input = diff('layout.height', 440); input.assessment.verdict = 'expected';
    const output = api.applyContextualComponentRuleAssessment(input);
    assert.equal(output.assessment.verdict, 'violation');
    assert.equal(output.assessment.ruleId, limit.ruleId);
    assert.equal(api.applyContextualComponentRuleAssessment(diff('layout.height', 300)).assessment.verdict, 'allowed');
  });
});
test('a numeric allowance never trusts reference identity over missing or foreign actual ownership', () => withRules([heightRule()], () => {
  for (const actualKey of [null, foreignKey]) {
    const input = diff('layout.height', 440);
    input.context.actualNestedOwnerComponentKey = actualKey;
    input.context.nestedOwnerComponentKey = key;
    input.context.nestedOwnerPath = 'Renamed';
    input.context.nestedOwnerRelativePath = 'Body / Surface';
    assert.notEqual(api.applyContextualComponentRuleAssessment(input).assessment.verdict, 'allowed');
  }
}));
test('explicit family keys exclude internal instance roots in the same catalog package', () => {
  const sizing = rule({target: {componentKeys: [key], layer: 'root'}});
  globalThis.__APOLLO_TEST_REMOTE_COMPONENT_RULE_REGISTRY__ = [Object.assign(entry(key, [sizing]), {figmaKeys: [key, nestedKey]})];
  try {
    const input = [node(1, null, 'Renamed', key, 'FILL', 'HUG'), node(2, 1, 'Internal', nestedKey, 'FIXED', 'FIXED')];
    assert.deepEqual(api.createRequiredComponentSizingDiffs(input), []);
  } finally {delete globalThis.__APOLLO_TEST_REMOTE_COMPONENT_RULE_REGISTRY__; api.clearNormalizedAuditPolicies();}
});

test('required root sizing survives a host-context explanation', () => withRules([rule()], () => {
  const confirmed = api.applyRequiredComponentSizingAssessment(diff('layout.sizing.vertical', 'Fixed', {self: true}));
  assert.equal(confirmed.assessment.reasonCode, 'component-contract-required-sizing');
  const result = api.assessCustomizationDiffs([confirmed], {hostDiffs: [], hostReference: [], nestedContextEvidence: {explains: () => true}});
  assert.equal(result[0], confirmed);
  assert.equal(api.finalizeComponentRuleAssessment(api.applyContextualComponentRuleAssessment(result[0])).assessment.verdict, 'violation');
}));
test('required root sizing survives an equivalent selected reference', () => withRules([rule()], () => {
  const root = node(1, null, 'Renamed', key, 'FILL', 'FIXED');
  const confirmed = api.createRequiredComponentSizingDiffs([root])[0];
  assert.equal(confirmed.assessment.reasonCode, 'component-contract-required-sizing');
  const before = JSON.stringify(confirmed);
  const result = api.assessCustomizationDiffs([confirmed], {hostDiffs: [], hostReference: [], nestedContextEvidence: {explains: () => true, selectedReference: () => confirmed.details.actual}});
  assert.equal(result.length, 1);
  assert.equal(result[0], confirmed);
  assert.equal(JSON.stringify(confirmed), before);
}));
test('ordinary baseline differences still rebase and disappear without a required sizing decision', () => withRules([], () => {
  const input = diff('layout.sizing.vertical', 'Fixed', {self: true});
  const explained = api.assessCustomizationDiffs([input], {hostDiffs: [], hostReference: [], nestedContextEvidence: {explains: () => true}});
  assert.equal(explained[0].assessment.verdict, 'expected');
  const rebased = api.assessCustomizationDiffs([input], {hostDiffs: [], hostReference: [], nestedContextEvidence: {explains: () => true, selectedReference: () => input.details.actual}});
  assert.equal(rebased[0].details.reference.value, 'Fixed');
  assert.equal(rebased[0].assessment.verdict, 'expected');
  const resource = diff('styles.text', 'Changed', {self: true});
  resource.details.reference = {value: 'Default', resourceType: 'style', resourceId: 'old-style'};
  resource.details.actual = {value: 'Changed', resourceType: 'style', resourceId: 'new-style'};
  assert.equal(api.assessCustomizationDiffs([resource], {hostDiffs: [], hostReference: [], nestedContextEvidence: {explains: () => true, selectedReference: () => resource.details.actual}}).length, 0);
}));
