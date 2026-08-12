const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule(relativePath, label) {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-${label}-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '..', relativePath)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: ['node18'],
    logLevel: 'silent',
  });
  try {
    return require(outfile);
  } finally {
    fs.rmSync(outfile, { force: true });
  }
}

function context() {
  return {
    actualComponentKey: null,
    referenceComponentKey: null,
    referenceOrigin: 'host',
    actualNestedOwnerComponentKey: null,
    actualNestedOwnerPath: null,
    actualNestedOwnerRelativePath: null,
    nestedOwnerComponentKey: null,
    nestedOwnerComponentRole: null,
    nestedOwnerPath: null,
    nestedOwnerRelativePath: null,
  };
}

function node(id, name, parentId, componentKey) {
  return {
    id,
    parentId,
    nodeId: `node-${id}`,
    path: parentId === null ? 'CardImage' : `CardImage / ${name}`,
    type: componentKey ? 'INSTANCE' : 'FRAME',
    name,
    visible: true,
    radius: 0,
    componentInstance: componentKey
      ? { componentKey, variantProperties: {} }
      : undefined,
  };
}

function baselineDiff(target, property, reference, actual, resourceType) {
  return {
    message: `${property}: ${reference} -> ${actual}`,
    nodePath: target.path,
    nodeName: target.name,
    nodeId: target.nodeId,
    visible: true,
    context: context(),
    diffKind: property === 'fill' ? 'paint' : 'other',
    details: {
      property,
      reference: { value: reference },
      actual: { value: actual, resourceType },
    },
  };
}

function cardImageContract() {
  return {
    schemaVersion: 'apollo.component-contract.v2-experimental',
    documentType: 'component-contract',
    status: 'experimental',
    package: { id: 'web-corp.card-image', family: 'CardImage', library: 'Web _ Corp Components' },
    capabilities: {
      selectors: [], facts: [], operators: [], remediations: [],
      unknownCapabilityPolicy: 'unsupported-fail-closed',
      missingEvidencePolicy: 'unknown-never-violation',
    },
    facts: { componentApi: [], selectors: {} },
    nonExecutableRules: [],
    coverage: { summary: {} },
    rules: [{
      id: 'rule-ir:web-corp.card-image.layer-properties-use-effective-baseline',
      severity: 'warning',
      enforcement: 'enforced',
      select: {
        host: { scope: 'selection-root' },
        targets: { scope: 'self-and-descendants' },
      },
      when: { op: 'evidenceComplete' },
      assert: {
        op: 'matchesEffectiveBaseline',
        properties: ['fill', 'radius'],
      },
      verdict: { pass: 'expected', fail: 'violation', unknown: 'unknown' },
      evidence: [],
      remediation: null,
      presentation: { message: 'Layer properties follow the effective baseline.' },
      capabilities: { selectors: [], facts: [], operators: [], remediations: [] },
    }, {
      id: 'rule-ir:web-corp.card-image.visuals-follow-effective-baseline',
      severity: 'error',
      enforcement: 'enforced',
      select: {
        host: { scope: 'selection-root' },
        targets: { scope: 'self-and-descendants' },
      },
      when: { op: 'evidenceComplete' },
      assert: {
        op: 'matchesEffectiveBaseline',
        properties: ['component.identity', 'fill', 'radius', 'effects.*'],
        allowedBaselineOverrides: [{
          hostVariant: { Cover: 'None' },
          properties: ['fill'],
          targetNames: ['Cover'],
          pathSuffixes: [' / CardItem / Cover'],
          actualResourceTypes: ['image'],
        }],
      },
      verdict: { pass: 'expected', fail: 'violation', unknown: 'unknown' },
      evidence: [],
      remediation: null,
      presentation: { message: 'CardImage visuals follow the effective baseline.' },
      capabilities: { selectors: [], facts: [], operators: [], remediations: [] },
    }],
  };
}

function testImageFillIsNotVariableDetachment() {
  const { diffStructures } = loadModule('src/structure/diff.ts', 'card-image-paint');
  const actual = node(1, 'Cover', null, 'cover-key');
  actual.fill = {
    color: 'paint:IMAGE,paint:IMAGE',
    token: null,
    paintTypes: ['IMAGE', 'IMAGE'],
  };
  const reference = node(1, 'Cover', null, 'cover-key');
  reference.fill = { color: 'rgba(186,187,194,1)', token: 'neutral-token' };
  const result = diffStructures([actual], [reference], {
    strict: true,
    isPaintToken: () => true,
    resolveTokenLabel: () => 'static_neutral/500',
  });
  assert.equal(result.diffs.length, 1);
  assert.equal(result.diffs[0].message, 'Заливка: static_neutral/500 → Изображение');
  assert.equal(result.diffs[0].details.bindingStatus, null);
  assert.equal(result.diffs[0].details.actual.resourceType, 'image');
}

function testEffectsAreCompared() {
  const { diffStructures } = loadModule('src/structure/diff.ts', 'card-image-effects');
  const actual = node(1, 'Shadow', null, 'shadow-key');
  const reference = node(1, 'Shadow', null, 'shadow-key');
  actual.effects = [{
    type: 'DROP_SHADOW', radius: 28, color: 'rgba(0, 0, 0, 0.60)',
    offset: { x: 0, y: 20 }, spread: -16, visible: true,
  }];
  reference.effects = [{
    type: 'DROP_SHADOW', radius: 28, color: 'rgba(0, 0, 0, 0.30)',
    offset: { x: 0, y: 20 },
  }];
  const result = diffStructures([actual], [reference], { strict: true });
  const effectDiff = result.diffs.find((diff) => diff.details.property === 'effects');
  assert.ok(effectDiff, 'A changed shadow effect must produce evidence');
  assert.equal(effectDiff.details.reference.resourceType, 'effects');
  assert.equal(effectDiff.details.reference.effects[0].color, 'rgba(0, 0, 0, 0.30)');

  reference.effects = [];
  const addedResult = diffStructures([actual], [reference], { strict: true });
  const addedEffect = addedResult.diffs.find((diff) => diff.details.property === 'effects');
  assert.ok(addedEffect, 'An effect added to a clean reference must produce evidence');
  assert.deepEqual(addedEffect.details.reference.effects, []);

  delete reference.effects;
  const omittedResult = diffStructures([actual], [reference], { strict: true });
  assert.ok(
    omittedResult.diffs.some((diff) => diff.details.property === 'effects'),
    'An effect added when the reference omits the empty field must produce evidence',
  );
}

function testCardImageAllowedCoverDoesNotHideOtherChanges() {
  const { evaluateExperimentalContractV2 } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'card-image-contract',
  );
  const root = node(1, 'CardImage', null, 'card-image-key');
  const cover = node(2, 'Cover', 1, 'cover-key');
  cover.path = 'CardImage / CardItem / Cover';
  const overlay = node(3, 'overlay', 1, null);
  overlay.path = 'CardImage / CardItem / State / overlay';
  const shadow = node(4, 'Shadow', 1, 'shadow-key');
  const icon = node(5, 'power-button-compact', 1, 'compact-key');
  icon.path = 'CardImage / CardItem / State / power-button-compact';
  const iconGlyph = node(6, 'icon', 5, null);
  iconGlyph.path = `${icon.path} / icon`;
  const coverFillDiff = baselineDiff(
    cover,
    'fill',
    'static_neutral/500',
    'Изображение',
    'image',
  );
  const coverRadiusDiff = baselineDiff(cover, 'radius', 16, 0);
  const overlayDiff = baselineDiff(
    overlay,
    'fill',
    'static_overlay/default',
    'static_overlay/strong',
  );
  overlayDiff.context.directHostVariantOverride = true;
  overlayDiff.context.actualNestedOwnerComponentKey = 'state-key';
  overlayDiff.context.nestedOwnerComponentKey = 'card-item-key';
  overlayDiff.assessment = {
    verdict: 'expected',
    source: 'pattern-rule',
    reasonCode: 'derived-from-parent-variant',
    ruleId: 'legacy-derived-visual',
    message: 'Legacy derived visual',
    remediation: null,
    presentation: 'suppress-derived',
  };
  const shadowDiff = baselineDiff(
    shadow,
    'effects',
    'alpha 0.30',
    'alpha 0.60',
    'effects',
  );
  shadowDiff.context.directHostVariantOverride = true;
  shadowDiff.context.actualNestedOwnerComponentKey = 'card-image-key';
  shadowDiff.context.nestedOwnerComponentKey = 'shadow-key';
  shadowDiff.assessment = Object.assign({}, overlayDiff.assessment);
  const iconDiff = baselineDiff(
    icon,
    'component.identity',
    'power-button-circle',
    'power-button-compact',
    'component',
  );
  iconDiff.context.actualNestedOwnerComponentKey = 'compact-key';
  iconDiff.context.nestedOwnerComponentKey = 'circle-key';
  const iconGlyphDiff = baselineDiff(
    iconGlyph,
    'fill',
    'rgba(116,116,116,1)',
    'static_neutral/0',
  );
  iconGlyphDiff.context.directHostVariantOverride = true;
  iconGlyphDiff.context.actualNestedOwnerComponentKey = 'compact-key';
  iconGlyphDiff.context.nestedOwnerComponentKey = 'circle-key';
  const result = evaluateExperimentalContractV2({
    contract: cardImageContract(),
    hostComponentKey: 'card-image-key',
    hostComponentName: 'CardImage',
    hostVariantProperties: { Cover: 'None' },
    actualStructure: [root, cover, overlay, shadow, icon, iconGlyph],
    effectiveBaselineDiffs: [
      coverFillDiff,
      coverRadiusDiff,
      overlayDiff,
      shadowDiff,
      iconDiff,
      iconGlyphDiff,
    ],
    resolveComponentFamilyKey: (key) => key,
  });
  assert.deepEqual(
    result.diffs.map((diff) => diff.details.property).sort(),
    ['component.identity', 'effects', 'fill', 'radius'],
    'The allowed image cover must be suppressed without hiding radius, overlay, shadow, or icon changes.',
  );
  assert.equal(
    result.diffs.some((diff) => diff.nodeId === cover.nodeId && diff.details.property === 'fill'),
    false,
  );
  assert.equal(
    result.diffs.some((diff) => diff.nodeId === iconGlyph.nodeId),
    false,
    'A component replacement must not leak descendant paint changes from the replaced icon.',
  );
}

function testParentVariantPaintWinsMaterialization() {
  const { mergeMaterializedInstanceReferenceNode } = loadModule(
    'src/reference/nestedReferenceMerge.ts',
    'card-image-materialization',
  );
  const parent = node(2, 'Cover', 1, 'archive-cover-key');
  parent.path = 'CardImage / CardItem / Cover';
  parent.fill = { token: 'static-neutral-500', color: 'rgba(186,187,194,1)' };
  parent.referenceVariantOwnedProperties = ['fill.color', 'fill.token'];
  const nested = node(2, 'Cover', 1, 'default-cover-key');
  nested.path = parent.path;
  nested.fill = { token: 'static-accent-primary', color: 'rgba(239,49,36,1)' };
  const merged = mergeMaterializedInstanceReferenceNode(parent, nested, {
    preferCandidate: true,
    reason: 'merge-parent-variant-owned-descendant',
    existingOrigin: 'host',
    candidateOrigin: 'nested-component',
    ownerComponentKey: 'card-item-key',
    relativePath: 'Cover',
    withinMaterializedSubtree: true,
  });
  assert.equal(merged.fill.token, 'static-neutral-500');
}

function testCardImageCatalogKeepsNoneCoverBaseline() {
  const library = loadModule('src/reference/library.ts', 'card-image-library');
  const { __test_expandReferenceWithCatalogs } = loadModule(
    'src/services/nestedReferencePreparation.ts',
    'card-image-reference-expansion',
  );
  const catalog = JSON.parse(fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../shared/design-system_ab/JSONS/web/components/web-corp/Web _ Corp Components -- CardImage.json',
    ),
    'utf8',
  ));
  library.__test_hydrateCatalogs([catalog]);
  const component = library.findComponent('c2fde1ea300fd120753686c7d475d0e267f86f74');
  const reference = library.resolveStructureForInstance(component, {
    componentKey: 'c2fde1ea300fd120753686c7d475d0e267f86f74',
    variantProperties: {
      Cover: 'None', Size: '264x164', State: 'Active', Stack: 'false',
    },
  });
  assert.ok(reference);
  const actual = reference.map((entry) => Object.assign({}, entry, {
    nodeId: `actual-${entry.id}`,
    componentInstance: entry.componentInstance
      ? Object.assign({}, entry.componentInstance, {
          variantProperties: Object.assign({}, entry.componentInstance.variantProperties || {}),
        })
      : entry.componentInstance,
  }));
  const actualCover = actual.find((entry) => entry.path.endsWith(' / CardItem / Cover'));
  actualCover.fill = {color: 'paint:IMAGE', token: null, paintTypes: ['IMAGE']};
  const expanded = __test_expandReferenceWithCatalogs(reference, actual, [catalog]);
  const expandedCover = expanded.find((entry) => entry.path.endsWith(' / CardItem / Cover'));
  assert.equal(
    expandedCover.fill.token,
    'VariableID:9c11aadaa65fab5d0047b7673c468d7316fbff99/1930:34',
    'Cover=None must preserve static_neutral/500 after CardItem and Cover materialization.',
  );
}

function testNestedIconReplacementProducesIdentityDiff() {
  const { diffExplicitNestedVariantStates } = loadModule(
    'src/structure/diff.ts',
    'card-image-icon',
  );
  const actualRoot = node(1, 'CardImage', null, 'card-image-key');
  const actualState = node(2, 'State', 1, 'state-key');
  const actualIcon = node(3, 'power-button-compact', 2, 'compact-variant-key');
  actualState.path = 'CardImage / CardItem / State';
  actualIcon.path = `${actualState.path} / power-button-compact`;
  const referenceRoot = node(1, 'CardImage', null, 'card-image-key');
  const referenceState = node(2, 'State', 1, 'state-key');
  const referenceIcon = node(3, 'power-button-circle', 2, 'circle-variant-key');
  referenceState.path = actualState.path;
  referenceIcon.path = `${referenceState.path} / power-button-circle`;
  const family = (key) => ({
    'compact-variant-key': 'power-button-compact',
    'circle-variant-key': 'power-button-circle',
  }[key] || key);
  const result = diffExplicitNestedVariantStates(
    [actualRoot, actualState, actualIcon],
    [referenceRoot, referenceState, referenceIcon],
    [],
    {
      resolveComponentFamilyKey: family,
      resolveReferenceComponentKey: (referenceNode) =>
        referenceNode.componentInstance?.componentKey ?? null,
    },
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].details.property, 'component.identity');
}

function loadCardImageCatalogs() {
  return [
    JSON.parse(fs.readFileSync(
      path.resolve(
        __dirname,
        '../../../shared/design-system_ab/JSONS/web/components/web-corp/Web _ Corp Components -- CardImage.json',
      ),
      'utf8',
    )),
    JSON.parse(fs.readFileSync(
      path.resolve(
        __dirname,
        '../../../shared/design-system_ab/JSONS/icons/Icons -- general (glyph).json',
      ),
      'utf8',
    )),
  ];
}

function cloneAsActual(reference) {
  return JSON.parse(JSON.stringify(reference)).map((entry) => {
    entry.nodeId = `actual-${entry.id}`;
    delete entry.referenceOrigin;
    delete entry.referenceOwnerComponentKey;
    delete entry.referenceOwnerRole;
    delete entry.referenceOwnerPath;
    delete entry.referenceOwnerRelativePath;
    delete entry.referenceOwnerVariantProperties;
    delete entry.referenceVariantOwnedProperties;
    return entry;
  });
}

function testFullCatalogNestedOverridesSurviveMaterialization() {
  const library = loadModule('src/reference/library.ts', 'card-image-full-library');
  const { __test_expandReferenceWithCatalogs } = loadModule(
    'src/services/nestedReferencePreparation.ts',
    'card-image-full-expansion',
  );
  const { diffStructures, diffExplicitNestedVariantStates } = loadModule(
    'src/structure/diff.ts',
    'card-image-full-diff',
  );
  const {
    evaluateExperimentalContractV2,
    evaluateExperimentalContractV2Tree,
  } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'card-image-full-contract',
  );
  const catalogs = loadCardImageCatalogs();
  const contract = JSON.parse(fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../shared/design-system_ab/JSONS/experiments/component-contract-v2/web-corp/CardImage/compiled/component-contract.v2.json',
    ),
    'utf8',
  ));
  const paymentMaskedNumberContract = JSON.parse(fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../shared/design-system_ab/JSONS/experiments/component-contract-v2/web-corp/PaymentMaskedNumber/compiled/component-contract.v2.json',
    ),
    'utf8',
  ));
  const resolveContract = (key) => {
    if (
      key === 'cd3afc6dd04a9e9e9b4383879ed0c0570a0f32a7' ||
      key === '9cb3646aa5c25fb2c62dda071eff2ec1915ea28d'
    ) return contract;
    if (key === 'bd25bbd83bfc28176b42284659f21c8a7cd8e97b') {
      return paymentMaskedNumberContract;
    }
    return null;
  };
  library.__test_hydrateCatalogs(catalogs);

  const inactiveKey = 'cd3afc6dd04a9e9e9b4383879ed0c0570a0f32a7';
  const inactiveComponent = library.findComponent(inactiveKey);
  const inactiveReference = library.resolveStructureForInstance(inactiveComponent, {
    componentKey: inactiveKey,
    variantProperties: {
      Cover: 'Alfa Business', Size: '212x132', State: 'Inactive', Stack: 'false',
    },
  });
  assert.ok(inactiveReference);
  const inactiveActual = cloneAsActual(inactiveReference);
  const overlay = inactiveActual.find((entry) => entry.path.endsWith(' / CardItem / State / overlay'));
  assert.ok(overlay);
  overlay.fill = {
    color: 'rgba(4,4,21,0.55)',
    token: 'VariableID:d9d26239617e3ab9e69d7ed378d811a3c4561063/3541:205',
  };
  const circle = inactiveActual.find((entry) => entry.path.endsWith(' / CardItem / State / power-button-circle'));
  assert.ok(circle?.componentInstance?.componentKey);
  const circlePath = circle.path;
  circle.name = 'power-button-compact';
  circle.path = circle.path.replace(/power-button-circle$/, 'power-button-compact');
  circle.componentInstance.componentKey = '86e9684834071fdd287855b8e831ac4f38ba5c45';
  for (const descendant of inactiveActual) {
    if (descendant.path.startsWith(`${circlePath} / `)) {
      descendant.path = descendant.path.replace(circlePath, circle.path);
    }
  }
  const inactiveExpanded = __test_expandReferenceWithCatalogs(
    inactiveReference,
    inactiveActual,
    catalogs,
  );
  const inactiveDiffs = diffStructures(inactiveActual, inactiveExpanded, { strict: true }).diffs;
  assert.ok(
    inactiveDiffs.some((diff) => diff.nodeId === overlay.nodeId && diff.details?.property === 'fill'),
    'The real multi-level CardImage catalog must retain its parent-authored overlay fill baseline.',
  );
  const iconDiffs = diffExplicitNestedVariantStates(
    inactiveActual,
    inactiveReference,
    inactiveDiffs,
    {
      resolveComponentFamilyKey: (key) => library.findComponent(key)?.key ?? key,
      resolveReferenceComponentKey: (referenceNode) =>
        referenceNode.componentInstance?.componentKey ?? null,
    },
  );
  assert.ok(
    iconDiffs.some((diff) => diff.details?.property === 'component.identity'),
    'The real CardImage catalog must retain the nested icon replacement evidence.',
  );
  const inactiveEvaluation = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: inactiveKey,
    hostComponentName: 'CardImage',
    hostVariantProperties: {
      Cover: 'Alfa Business', Size: '212x132', State: 'Inactive', Stack: 'false',
    },
    actualStructure: inactiveActual,
    effectiveBaselineDiffs: inactiveDiffs.concat(iconDiffs),
    resolveComponentFamilyKey: (key) => library.findComponent(key)?.key ?? key,
  });
  assert.ok(
    inactiveEvaluation.diffs.some((diff) =>
      diff.nodeId === overlay.nodeId && diff.details?.property === 'fill'),
    'The compiled CardImage contract must surface the nested overlay fill evidence.',
  );
  assert.ok(
    inactiveEvaluation.diffs.some((diff) => diff.details?.property === 'component.identity'),
    'The compiled CardImage contract must surface the nested icon replacement evidence.',
  );
  const inactiveTreeEvaluation = evaluateExperimentalContractV2Tree({
    hostComponentKey: inactiveKey,
    hostComponentName: 'CardImage',
    hostVariantProperties: {
      Cover: 'Alfa Business', Size: '212x132', State: 'Inactive', Stack: 'false',
    },
    actualStructure: inactiveActual,
    effectiveBaselineDiffs: inactiveDiffs.concat(iconDiffs),
    resolveComponentFamilyKey: (key) => library.findComponent(key)?.key ?? key,
    resolveContract,
  });
  assert.ok(
    inactiveTreeEvaluation.diffs.some((diff) =>
      diff.nodeId === overlay.nodeId && diff.details?.property === 'fill'),
    'The Contract v2 tree evaluator must retain the CardImage overlay finding.',
  );
  assert.ok(
    inactiveTreeEvaluation.diffs.some((diff) => diff.details?.property === 'component.identity'),
    'The Contract v2 tree evaluator must retain the CardImage icon finding.',
  );

  const activeKey = '9cb3646aa5c25fb2c62dda071eff2ec1915ea28d';
  const activeComponent = library.findComponent(activeKey);
  const activeReference = library.resolveStructureForInstance(activeComponent, {
    componentKey: activeKey,
    variantProperties: {
      Cover: 'Alfa Business', Size: '212x132', State: 'Active', Stack: 'false',
    },
  });
  assert.ok(activeReference);
  const activeActual = cloneAsActual(activeReference);
  const shadow = activeActual.find((entry) => entry.path.endsWith(' / Shadow'));
  assert.ok(shadow?.effects?.length);
  shadow.effects[0].color = 'rgba(0, 0, 0, 0.60)';
  shadow.effects[0].spread = -16;
  shadow.effects[0].visible = true;
  shadow.effects[0].blendMode = 'NORMAL';
  const activeExpanded = __test_expandReferenceWithCatalogs(
    activeReference,
    activeActual,
    catalogs,
  );
  const activeDiffs = diffStructures(activeActual, activeExpanded, { strict: true }).diffs;
  assert.ok(
    activeDiffs.some((diff) => diff.nodeId === shadow.nodeId && diff.details?.property === 'effects'),
    'The real multi-level CardImage catalog must retain its parent-authored shadow baseline.',
  );
  const activeEvaluation = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: activeKey,
    hostComponentName: 'CardImage',
    hostVariantProperties: {
      Cover: 'Alfa Business', Size: '212x132', State: 'Active', Stack: 'false',
    },
    actualStructure: activeActual,
    effectiveBaselineDiffs: activeDiffs,
    resolveComponentFamilyKey: (key) => library.findComponent(key)?.key ?? key,
  });
  assert.ok(
    activeEvaluation.diffs.some((diff) =>
      diff.nodeId === shadow.nodeId && diff.details?.property === 'effects'),
    'The compiled CardImage contract must surface the nested shadow evidence.',
  );
  const activeTreeEvaluation = evaluateExperimentalContractV2Tree({
    hostComponentKey: activeKey,
    hostComponentName: 'CardImage',
    hostVariantProperties: {
      Cover: 'Alfa Business', Size: '212x132', State: 'Active', Stack: 'false',
    },
    actualStructure: activeActual,
    effectiveBaselineDiffs: activeDiffs,
    resolveComponentFamilyKey: (key) => library.findComponent(key)?.key ?? key,
    resolveContract,
  });
  assert.ok(
    activeTreeEvaluation.diffs.some((diff) =>
      diff.nodeId === shadow.nodeId && diff.details?.property === 'effects'),
    'The Contract v2 tree evaluator must retain the CardImage shadow finding.',
  );
}

function main() {
  testImageFillIsNotVariableDetachment();
  testEffectsAreCompared();
  testCardImageAllowedCoverDoesNotHideOtherChanges();
  testParentVariantPaintWinsMaterialization();
  testCardImageCatalogKeepsNoneCoverBaseline();
  testNestedIconReplacementProducesIdentityDiff();
  testFullCatalogNestedOverridesSurviveMaterialization();
  console.log('CardImage customization regression tests passed.');
}

main();
