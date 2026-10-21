const test = require('node:test');
const assert = require('node:assert/strict');
const core = require(process.env.APOLLO_CONFIGURED_CORE_CJS || '../dist/core.cjs');
const copy = value => JSON.parse(JSON.stringify(value));
const OFFSET = 'Offset#1:0';
const facts = { offset: `component.properties.${OFFSET}`, crop: 'component.properties.ImageCrop' };

// Entirely synthetic fixtures: no Figma writes, live capture, or source activation.
function fixture(image = 'Bottom', offset = false, crop = 'False', optIn = true) {
  const identity = { componentId: 'web.synthetic-card', familyId: 'synthetic-card', contractId: 'synthetic-card',
    family: 'SyntheticCard', layer: 'component', library: 'test', platform: 'desktop', platforms: ['desktop'],
    lifecycle: 'draft', componentKey: 'synthetic-set' };
  const manual = core.createWorkspaceFromPreview(identity, []).manual;
  manual.targets = [{ id: 'target.root', semanticRole: 'root', kind: 'INSTANCE', resolution: 'resolved',
    nameHint: 'SyntheticCard', pathHint: 'SyntheticCard', lineage: [] }];
  manual.representations[0].locator = { componentSetKey: 'synthetic-set' };
  const rule = (id, constraints, images) => ({ id, targetId: 'target.root', targetScope: 'self',
    capability: 'component.configuration', permission: 'constrained', controlPaths: [], constraints,
    applicability: { variants: { Image: images }, modes: 'all', platforms: ['desktop'],
      scopeStatus: 'confirmed', conditionSubject: 'target' },
    severity: 'error', rationale: 'Synthetic native configuration norm', message: id,
    remediationMessage: '', status: 'draft', owner: 'test', execution: { route: 'predicate' },
    ...(optIn ? { propertyConformance: 'configured-native@1' } : {}) });
  manual.rules = [
    rule('offset-top-only', [{ type: 'propertyDomain', fact: facts.offset, values: [false] }], ['Bottom', 'None']),
    rule('none-effects', [
      { type: 'propertyDomain', fact: facts.offset, values: [false] },
      { type: 'propertyDomain', fact: facts.crop, values: ['False'] },
    ], ['None']),
  ];
  const shape = [{ path: '', type: 'ROOT' }];
  const variants = ['Bottom', 'Top', 'None'].flatMap(image => ['False', 'True'].map(crop => ({
    componentKey: `synthetic-${image}-${crop}`, componentSetKey: 'synthetic-set', structureId: 'root',
    properties: { Image: image, ImageCrop: crop },
  })));
  const evidence = { schemaVersion: 'apollo.variant-anatomy.v1', sourceHash: 'synthetic-evidence', structures: { root: shape }, variants };
  const variant = variants.find(v => v.properties.Image === image && v.properties.ImageCrop === crop);
  const nativeIdentity = { componentKey: variant.componentKey, componentSetKey: 'synthetic-set', mainComponentId: 'main:1' };
  const referenceProperties = { [OFFSET]: false, Image: image, ImageCrop: crop };
  const propertyTypes = { [OFFSET]: 'BOOLEAN', Image: 'VARIANT', ImageCrop: 'VARIANT' };
  const referenceRoot = { identity: nativeIdentity, properties: referenceProperties, propertyTypes,
    propertyReferences: [], definedProperties: Object.keys(referenceProperties) };
  const snapshot = { schemaVersion: 'apollo.snapshot.v1', generatedAt: '2026-01-01T00:00:00Z',
    source: { componentKey: variant.componentKey, componentSetKey: 'synthetic-set', instanceIdentityVersion: 1,
      truncated: false, captureTopology: { version: 1, complete: true, limitReached: false, issues: [] } },
    selection: ['root:1'], context: { platform: 'desktop', modes: { active: [] } },
    nodes: [{ id: 'root:1', name: 'SyntheticCard', type: 'INSTANCE', parentId: null, childIds: [], visible: true,
      semantic: { role: 'root', path: 'SyntheticCard' }, component: { identity: copy(nativeIdentity),
        properties: { ...referenceProperties, [OFFSET]: offset }, propertyTypes: copy(propertyTypes), propertyReferences: [] } }],
    variantReference: { complete: true, componentKey: variant.componentKey, componentSetKey: 'synthetic-set', nodes: shape,
      properties: copy(referenceProperties), propertyTypes: copy(propertyTypes), propertyReferences: [],
      nodeProperties: { '': copy(referenceRoot) }, definedProperties: Object.keys(referenceProperties) },
  };
  return { manual, evidence, snapshot };
}
function compile(f) {
  const compiled = core.compileManualSource(f.manual, f.evidence);
  assert.equal(compiled.issues.filter(i => i.severity === 'error').length, 0, JSON.stringify(compiled.issues));
  return core.prepareAuthoringPreviewContract(compiled.contract);
}
function evaluate(f, contract = compile(f)) { return core.evaluateCompiledContract(f.snapshot, contract); }
function evaluation(result, id = 'offset-top-only.1.1') {
  const found = result.evaluations.find(e => e.ruleId === id);
  assert.ok(found, `Missing evaluation for ${id}`);
  return found;
}
function outcome(result, id, classification, applicability, truth) {
  const e = evaluation(result, id);
  assert.equal(e.classification, classification, JSON.stringify(e));
  assert.equal(e.applicability, applicability);
  assert.equal(e.trace.truth, truth);
}
function unknown(f, id = 'offset-top-only.1.1', contract) {
  const result = evaluate(f, contract);
  const e = evaluation(result, id);
  assert.equal(e.classification, 'human-review', JSON.stringify(e));
  assert.equal(e.trace.truth, 'unknown');
  return result;
}

test('inactive BOOLEAN configured value: false complies, true violates; Top is outside the norm', () => {
  outcome(evaluate(fixture('Bottom')), 'offset-top-only.1.1', 'compliant', 'applicable', 'true');
  outcome(evaluate(fixture('Bottom', true)), 'offset-top-only.1.1', 'violation', 'applicable', 'false');
  outcome(evaluate(fixture('Top', true)), 'offset-top-only.1.1', 'not-applicable', 'not-applicable', 'false');
});
test('None checks BOOLEAN Offset and string VARIANT ImageCrop independently', () => {
  const good = evaluate(fixture('None'));
  outcome(good, 'none-effects.1.1', 'compliant', 'applicable', 'true');
  outcome(good, 'none-effects.1.2', 'compliant', 'applicable', 'true');
  outcome(evaluate(fixture('None', true)), 'none-effects.1.1', 'violation', 'applicable', 'false');
  outcome(evaluate(fixture('None', false, 'True')), 'none-effects.1.2', 'violation', 'applicable', 'false');
});
test('unmarked native property rule retains inactive-property guard', () => {
  const f = fixture('Bottom', true, 'False', false), contract = compile(f);
  assert.equal(contract.runtimePolicy.configuredNativePropertyConformanceVersion, undefined);
  assert.ok(JSON.stringify(contract.rules[0].when).includes('variantAvailability.componentProperties'));
  outcome(evaluate(f, contract), 'offset-top-only.1.1', 'not-applicable', 'not-applicable', 'false');
});

const nativeMissingOrMalformed = [
  ['missing property value', f => { delete f.snapshot.nodes[0].component.properties[OFFSET]; }],
  ['missing native type', f => { delete f.snapshot.nodes[0].component.propertyTypes[OFFSET]; }],
  ['string false is not BOOLEAN', f => { f.snapshot.nodes[0].component.properties[OFFSET] = 'false'; }],
  ['zero is not BOOLEAN', f => { f.snapshot.nodes[0].component.properties[OFFSET] = 0; }],
  ['type disagrees with reference', f => { f.snapshot.nodes[0].component.propertyTypes[OFFSET] = 'TEXT'; }],
  ['coherent VARIANT capture is not a BOOLEAN domain', f => {
    f.snapshot.nodes[0].component.properties[OFFSET] = 'False';
    f.snapshot.nodes[0].component.propertyTypes[OFFSET] = 'VARIANT';
    f.snapshot.variantReference.nodeProperties[''].properties[OFFSET] = 'False';
    f.snapshot.variantReference.nodeProperties[''].propertyTypes[OFFSET] = 'VARIANT';
  }],
  ['missing exact reference property', f => { delete f.snapshot.variantReference.nodeProperties[''].properties[OFFSET]; }],
  ['malformed reference BOOLEAN', f => { f.snapshot.variantReference.nodeProperties[''].properties[OFFSET] = 'False'; }],
  ['null native value', f => { f.snapshot.nodes[0].component.properties[OFFSET] = null; }],
  ['unknown native value', f => { f.snapshot.nodes[0].unknownFacts = [facts.offset]; }],
  ['unknown native type', f => { f.snapshot.nodes[0].unknownFacts = [`component.propertyTypes.${OFFSET}`]; }],
  ['stale exact property identity cannot fall back to friendly name', f => {
    f.snapshot.nodes[0].component.properties.Offset = true;
    delete f.snapshot.nodes[0].component.properties[OFFSET];
  }],
];
for (const [name, mutate] of nativeMissingOrMalformed) test(name + ' remains UNKNOWN', () => {
  const f = fixture('Bottom', true); mutate(f); unknown(f);
});

const untrustedCapture = [
  ['missing reference', f => { delete f.snapshot.variantReference; }],
  ['incomplete reference', f => { f.snapshot.variantReference.complete = false; }],
  ['missing native identity', f => { delete f.snapshot.nodes[0].component.identity; }],
  ['missing instance identity capture version', f => { delete f.snapshot.source.instanceIdentityVersion; }],
  ['main component identity mismatch', f => { f.snapshot.nodes[0].component.identity.mainComponentId = 'other:1'; }],
  ['unknown identity subfact', f => { f.snapshot.nodes[0].unknownFacts = ['component.identity.mainComponentId']; }],
  ['reference root identity disagrees with its catalog key', f => {
    f.snapshot.nodes[0].component.identity.componentKey = 'wrong-component';
    f.snapshot.variantReference.nodeProperties[''].identity.componentKey = 'wrong-component';
  }],
  ['truncated capture', f => { f.snapshot.source.truncated = true; }],
  ['incomplete topology', f => { f.snapshot.source.captureTopology.complete = false; }],
  ['missing capture topology', f => { delete f.snapshot.source.captureTopology; }],
  ['duplicate root IDs', f => { f.snapshot.nodes.push(copy(f.snapshot.nodes[0])); }],
  ['multiple selected roots', f => { f.snapshot.selection.push('root:2'); }],
  ['selected FRAME is not a native INSTANCE', f => { f.snapshot.nodes[0].type = 'FRAME'; }],
  ['ambiguous declared root', f => { f.manual.targets[0].resolution = 'ambiguous'; }],
];
for (const [name, mutate] of untrustedCapture) test(name + ' cannot prove configured conformance', () => {
  const f = fixture('Bottom', true), contract = compile(f);
  // Runtime ambiguity controls use a previously valid compiler result.
  mutate(f);
  if (name === 'ambiguous declared root') contract.facts.targets[0].resolution = 'ambiguous';
  unknown(f, 'offset-top-only.1.1', contract);
});

test('missing, hidden and unknown root visibility are UNKNOWN, not inactive configuration', () => {
  for (const visible of [undefined, false, true]) {
    const f = fixture('None', true);
    if (visible === undefined) delete f.snapshot.nodes[0].visible;
    else f.snapshot.nodes[0].visible = visible;
    if (visible === true) f.snapshot.nodes[0].unknownFacts = ['visible'];
    const result = unknown(f);
    unknown(f, 'none-effects.1.1');
    unknown(f, 'none-effects.1.2');
    if (visible !== true) {
      assert.equal(evaluation(result).applicability, 'unknown');
      assert.equal(evaluation(result).trace.reason, 'configured native root visibility/capture is unresolved');
      assert.equal(result.coverage.byClassification['not-applicable'], undefined);
    }
  }
});

test('absent native root produces UNKNOWN diagnostics without inventing a subject', () => {
  const f = fixture(); f.snapshot.nodes = []; f.snapshot.selection = [];
  const result = evaluate(f);
  assert.equal(result.evaluations.length, 0);
  assert.equal(result.configuredNativePropertyDiagnostics.length, 3);
  assert.ok(result.configuredNativePropertyDiagnostics.every(d => d.truth === 'unknown' && d.reason.includes('absent')));
});

test('derived fact injection cannot hide a configured violation or missing raw property', () => {
  for (const missing of [false, true]) {
    const f = fixture('Bottom', true), contract = compile(f);
    const fact = contract.rules[0].assert.actual.fact.split('.').pop();
    f.snapshot.nodes[0].configuredNativePropertiesV1 = { booleanValues: { [fact]: false } };
    if (missing) delete f.snapshot.nodes[0].component.properties[OFFSET];
    const untouched = copy(f.snapshot);
    if (missing) unknown(f);
    else outcome(evaluate(f), 'offset-top-only.1.1', 'violation', 'applicable', 'false');
    assert.deepEqual(f.snapshot, untouched);
  }
});

test('boolean and blank values cannot satisfy a string VARIANT domain', () => {
  for (const crop of [false, '', '   ']) {
    const f = fixture('None'); f.snapshot.nodes[0].component.properties.ImageCrop = crop;
    unknown(f, 'none-effects.1.2');
  }
});

test('missing or untrusted Image condition remains UNKNOWN', () => {
  for (const mutate of [
    f => { delete f.snapshot.nodes[0].component.properties.Image; },
    f => { f.snapshot.nodes[0].component.propertyTypes.Image = 'BOOLEAN'; },
    f => { f.snapshot.nodes[0].unknownFacts = ['component.properties.Image']; },
  ]) { const f = fixture(); mutate(f); unknown(f); }
});

test('semantic label is unnecessary only when the visible exact native root is independently proved', () => {
  const f = fixture('None', true); delete f.snapshot.nodes[0].semantic;
  outcome(evaluate(f), 'offset-top-only.1.1', 'violation', 'applicable', 'false');
  outcome(evaluate(f), 'none-effects.1.1', 'violation', 'applicable', 'false');
});

test('wrong runtime version and orphaned IR marker are rejected', () => {
  const f = fixture(), contract = compile(f);
  for (const version of [2, undefined]) {
    const changed = copy(contract); changed.runtimePolicy.configuredNativePropertyConformanceVersion = version;
    assert.throws(() => evaluate(f, changed), /CONFIGURED_NATIVE_PROPERTY_RUNTIME_UNSUPPORTED/);
  }
  const changed = copy(contract); changed.rules[0].presentation.propertyConformance = 'configured-native@2';
  assert.throws(() => evaluate(f, changed), /CONFIGURED_NATIVE_PROPERTY_RUNTIME_UNSUPPORTED/);
});

test('opt-in is rejected outside exact native root/self domain conformance', () => {
  const invalid = [
    f => { f.manual.rules[0].propertyConformance = 'configured-native@2'; },
    f => { f.manual.rules[0].targetScope = 'descendants'; },
    f => { f.manual.targets[0].resolution = 'ambiguous'; },
    f => { f.manual.targets.push(copy(f.manual.targets[0])); },
    f => { f.manual.rules[0].capability = 'style.fill'; },
    f => { f.manual.rules[0].permission = 'forbidden'; },
    f => { f.manual.rules[0].constraints[0].type = 'propertyForbidden'; },
    f => { f.manual.rules[0].constraints[0].fact = 'fills'; },
    f => { f.manual.rules[0].constraints[0].values = [false, 'False']; },
    f => { f.manual.rules[0].constraints[0].values = [0]; },
    f => { f.manual.rules[0].constraints[0].values = []; },
    f => { f.manual.rules[0].constraints[0].values = [' ']; },
    f => { f.manual.rules[0].constraints[0].exceptConfiguration = {}; },
    f => { f.manual.rules[0].applicability.conditionSubject = 'component-root'; },
    f => { f.manual.rules[0].applicability.context = { 'semanticApi.loading': true }; },
    f => { f.manual.rules[0].boundaryPolicy = 'component-owned@1'; },
    f => { f.manual.rules[0].targetApplicability = 'visible-target@1'; },
    f => { f.manual.rules[0].propertyApplicability = { fills: 'visible-paints@1' }; },
  ];
  for (const mutate of invalid) {
    const f = fixture(); mutate(f);
    assert.ok(core.validateManualSource(f.manual).some(i => i.code === 'RULE_PROPERTY_CONFORMANCE'));
  }
});

test('per-assertion configured capture is not silently accepted as a standalone applicability probe', () => {
  const f = fixture(), probe = core.compileApplicabilityProbe(f.manual, f.manual.rules[0], true);
  assert.ok(probe.unsupported.includes('propertyConformance:per-assertion'));
});

test('legacy inactive stroke and layout guards survive next to an opted-in native rule', () => {
  const f = fixture('Bottom', true);
  const root = f.snapshot.nodes[0];
  root.propertyActivityV1 = { strokePresent: false, gapApplicable: false };
  root.baseline = { effective: { propertyActivityV1: { strokePresent: false, gapApplicable: false } } };
  for (const [id, fact, policy] of [
    ['stroke-lock', 'appearance.strokeWeight', 'stroke-present-either@1'],
    ['gap-lock', 'layout.itemSpacing', 'flow-gap-either@1'],
  ]) {
    f.manual.rules.push({ ...copy(f.manual.rules[0]), id, capability: fact, propertyConformance: undefined,
      permission: 'forbidden', constraints: [{ type: 'propertyForbidden', fact }],
      applicability: { variants: 'all', modes: 'all', platforms: ['desktop'], scopeStatus: 'confirmed' },
      propertyApplicability: { [fact]: policy } });
  }
  const contract = compile(f), result = evaluate(f, contract);
  outcome(result, 'offset-top-only.1.1', 'violation', 'applicable', 'false');
  for (const id of ['stroke-lock', 'gap-lock']) {
    const ir = contract.rules.find(r => r.ruleId === `${id}.1.1`);
    assert.ok(JSON.stringify(ir.when).includes('baseline.effective.propertyActivityV1'));
    assert.equal(ir.presentation.propertyConformance, undefined);
    outcome(result, `${id}.1.1`, 'not-applicable', 'not-applicable', 'false');
  }
});

test('compilation preserves authoring Draft/context-only rather than activating a source norm', () => {
  const f = fixture(), result = core.compileManualSource(f.manual, f.evidence);
  assert.ok(result.contract.rules.every(r => r.authority.status === 'draft'));
  f.manual.rules.forEach(r => { r.execution.route = 'context-only'; });
  const contextOnly = core.compileManualSource(f.manual, f.evidence);
  assert.equal(contextOnly.contract.rules.length, 0);
  assert.ok(contextOnly.contract.customizationPolicy.every(r => r.status === 'draft' && r.execution.route === 'context-only'));
});
