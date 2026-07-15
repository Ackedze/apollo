const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-component-rules-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/contracts/componentRules.ts')],
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

function context(componentKey) {
  return {
    actualComponentKey: null,
    referenceComponentKey: null,
    referenceOrigin: 'host',
    actualNestedOwnerComponentKey: componentKey,
    actualNestedOwnerPath: '[D] BackgroundPlateSlot',
    actualNestedOwnerRelativePath: null,
    nestedOwnerComponentKey: componentKey,
    nestedOwnerComponentRole: 'Main',
    nestedOwnerPath: '[D] BackgroundPlateSlot',
    nestedOwnerRelativePath: null,
  };
}

function scopedContext(overrides = {}) {
  return Object.assign(
    {
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
    },
    overrides,
  );
}

function diff(nodePath, nodeName, property, actual, bindingId, componentKey) {
  return {
    message: `${property}: reference → ${actual}`,
    nodePath,
    nodeName,
    context: context(componentKey),
    details: {
      property,
      reference: { value: 'reference', bindingId: 'reference-token' },
      actual: { value: actual, bindingId },
    },
  };
}

function scopedDiff(nodePath, nodeName, property, diffContext) {
  return {
    message: `${property}: reference → actual`,
    nodePath,
    nodeName,
    context: diffContext,
    details: {
      property,
      reference: { value: 'reference' },
      actual: { value: 'actual' },
    },
  };
}

function sceneNode(id, parentId, nodePath, name, type, sizing, componentKey) {
  const result = {
    id,
    parentId,
    path: nodePath,
    type,
    name,
    visible: true,
    radius: null,
    layout: { sizing },
  };
  if (componentKey) {
    result.componentInstance = {
      componentKey,
      variantProperties: {},
    };
  }
  return result;
}

function main() {
  const rules = loadModule();
  const sizingRule = {
    ruleId: 'component:web-corp.background-plate.slot-sizing',
    severity: 'error',
    source: 'pattern-link',
    ruleKind: 'design-rule',
    appliesTo: 'layout.sizing.horizontal|layout.sizing.vertical',
    ruleText: 'Slot must use Fill and Hug.',
    target: {
      component: 'web-corp.background-plate',
      layers: ['[D] BackgroundPlateSlot / Slot'],
    },
    requiredValues: {
      'layout.sizing.horizontal': 'FILL',
      'layout.sizing.vertical': 'HUG',
    },
  };
  const paddingTokenRule = {
    ruleId: 'component:web-corp.background-plate.padding-token',
    severity: 'error',
    source: 'pattern-link',
    ruleKind: 'design-rule',
    appliesTo: 'layout.padding.*',
    ruleText: 'Padding must use a spacing token.',
    target: {
      component: 'web-corp.background-plate',
      layers: ['[D] BackgroundPlateSlot'],
    },
    requiredTokenSource: {
      collection: 'Spacing',
    },
  };
  const corporateRootRule = {
    ruleId: 'component:web-corp.corporate-content.root-layout-protected',
    severity: 'error',
    source: 'pattern-link',
    ruleKind: 'design-rule',
    appliesTo: 'layout.itemSpacing|layout.direction',
    ruleText: 'CorporateContent root layout is protected.',
    target: {
      components: ['[D] CorporateContent', '[M] CorporateContent'],
      layer: 'root',
    },
  };
  const corporateSpacingRule = {
    ruleId: 'component:web-corp.corporate-content.spacing-uses-grid-cols-mode',
    severity: 'error',
    source: 'pattern-link',
    ruleKind: 'design-rule',
    appliesTo: 'layout.padding.*',
    ruleText: 'CorporateContent root spacing must use Grid & Cols.',
    target: {
      components: ['[D] CorporateContent', '[M] CorporateContent'],
      layer: 'root',
    },
  };
  const corporateCanonicalLayerRule = {
    ruleId: 'component:web-corp.corporate-content.canonical-root-layer',
    severity: 'error',
    source: 'pattern-link',
    ruleKind: 'design-rule',
    appliesTo: 'layout.padding.*',
    ruleText: 'CorporateContent canonical root layer is protected.',
    target: {
      component: 'web-corp.corporate-content',
      layers: ['[D] CorporateContent'],
    },
  };
  const corporateBodySlotRule = {
    ruleId: 'component:web-corp.corporate-content.body-layout-delegated',
    severity: 'warning',
    source: 'pattern-link',
    ruleKind: 'design-rule',
    appliesTo: 'layout.itemSpacing',
    ruleText: 'Body owns its internal layout.',
    target: {
      components: ['[D] CorporateContent', '[M] CorporateContent'],
      slots: ['Body'],
    },
  };
  const sectionRootRule = {
    ruleId: 'component:web-corp.corporate-content.section-gutter-required',
    severity: 'error',
    source: 'pattern-link',
    ruleKind: 'design-rule',
    appliesTo: 'layout.itemSpacing',
    ruleText: 'Section root gutter is required.',
    target: {
      component: '[D] Section',
      layer: 'root',
    },
  };
  const sectionSlotRule = {
    ruleId: 'component:web-corp.corporate-content.section-slot-content-policy',
    severity: 'warning',
    source: 'pattern-link',
    ruleKind: 'design-rule',
    appliesTo: 'layout.itemSpacing',
    ruleText: 'Section Content and Isle are semantic slots.',
    target: {
      component: '[D] Section',
      slots: ['Content', 'Isle'],
    },
  };
  const sectionSingularSlotRule = {
    ruleId: 'component:web-corp.corporate-content.section-isle-opacity',
    severity: 'warning',
    source: 'pattern-link',
    ruleKind: 'design-rule',
    appliesTo: 'opacity',
    ruleText: 'Section Isle opacity is protected.',
    target: {
      component: '[D] Section',
      slot: 'Isle',
    },
  };
  const transitionKeyRule = {
    ruleId: 'component:web-corp.corporate-content.transition-key-prohibited',
    severity: 'error',
    source: 'pattern-link',
    ruleKind: 'design-rule',
    appliesTo: 'component.key',
    ruleText: 'Transition component key is prohibited.',
    target: {
      componentKeys: ['transition-key'],
    },
  };
  const transitionNameRule = {
    ruleId: 'component:web-corp.corporate-content.transition-name-prohibited',
    severity: 'error',
    source: 'pattern-link',
    ruleKind: 'design-rule',
    appliesTo: 'component.name',
    ruleText: 'Transition component name is prohibited.',
    target: {
      componentNames: ['[T] CorporateContent'],
    },
  };
  const unsupportedPlaceholderRule = {
    ruleId: 'component:web-corp.corporate-content.placeholder-policy',
    severity: 'warning',
    source: 'pattern-link',
    ruleKind: 'design-rule',
    appliesTo: 'layout.itemSpacing',
    ruleText: 'Placeholder policy is structural.',
    target: {
      components: ['[D] CorporateContent'],
      placeholder: 'Body',
    },
  };
  const tableTextRule = {
    ruleId: 'component:web-corp.table-wide-d.component-properties-are-first-class',
    severity: 'warning',
    source: 'pattern-link',
    ruleKind: 'design-rule',
    appliesTo: 'variant.*',
    ruleText: 'Table cell properties are first-class.',
    target: {
      component: 'web-corp.table-wide-d',
      layers: ['Text', 'BodyCell'],
    },
  };
  globalThis.__APOLLO_TEST_REMOTE_COMPONENT_RULE_REGISTRY__ = [
    {
      componentKey: 'web-corp.background-plate',
      aliases: ['[D] BackgroundPlateSlot'],
      figmaKeys: ['background-plate-key'],
      rulesFile: {
        componentKey: 'web-corp.background-plate',
        rules: [sizingRule, sizingRule, paddingTokenRule],
      },
    },
    {
      componentKey: 'web-corp.corporate-content',
      aliases: [
        '[D] CorporateContent',
        '[M] CorporateContent',
        '[D] Section',
        'Body',
      ],
      figmaKeys: [
        'corporate-content-key',
        'section-key',
        'body-key',
        'background-plate-key',
        'transition-key',
        'transition-name-key',
      ],
      rulesFile: {
        componentKey: 'web-corp.corporate-content',
        rules: [
          corporateRootRule,
          corporateSpacingRule,
          corporateCanonicalLayerRule,
          corporateBodySlotRule,
          sectionRootRule,
          sectionSlotRule,
          sectionSingularSlotRule,
          transitionKeyRule,
          transitionNameRule,
        ],
      },
    },
    {
      componentKey: 'web-corp.table-wide-d',
      aliases: ['[D] Table Wide', 'Text', 'BodyCell'],
      figmaKeys: ['table-wide-key', 'table-text-key'],
      rulesFile: {
        componentKey: 'web-corp.table-wide-d',
        rules: [tableTextRule],
      },
    },
  ];
  globalThis.__APOLLO_TEST_COMPONENT_NAME_BY_KEY__ = {
    'background-plate-key': '[D] BackgroundPlateSlot',
    'corporate-content-key': '[D] CorporateContent',
    'section-key': '[D] Section',
    'body-key': 'Body',
    'table-wide-key': '[D] Table Wide',
    'table-text-key': 'Text',
    'transition-key': 'Consumer rename',
    'transition-name-key': '[T] CorporateContent',
  };

  const actualNodes = [
    sceneNode(
      1,
      null,
      '[D] BackgroundPlateSlot',
      '[D] BackgroundPlateSlot',
      'INSTANCE',
      { horizontal: 'FILL', vertical: 'HUG' },
      'background-plate-key',
    ),
    sceneNode(
      2,
      1,
      '[D] BackgroundPlateSlot / Level=1 / Slot',
      'Slot',
      'FRAME',
      { horizontal: 'FIXED', vertical: 'FIXED' },
    ),
    sceneNode(
      3,
      2,
      '[D] BackgroundPlateSlot / Level=1 / Slot / Table / HeadCell',
      'HeadCell',
      'INSTANCE',
      { horizontal: 'HUG', vertical: 'FIXED' },
      'table-wide-key',
    ),
  ];
  const sizingDiffs = rules.createRequiredComponentSizingDiffs(actualNodes);
  assert.equal(sizingDiffs.length, 2);
  assert.equal(
    sizingDiffs.every((entry) => entry.nodeName === 'Slot'),
    true,
    'A Slot rule must not leak to descendants below Slot',
  );

  const duplicated = rules.findComponentContractRulesForDiff(
    diff(
      '[D] BackgroundPlateSlot / Level=1 / Slot',
      'Slot',
      'layout.sizing.horizontal',
      'Fixed',
      null,
      'background-plate-key',
    ),
  );
  assert.equal(
    duplicated.filter((rule) => rule.ruleId === sizingRule.ruleId).length,
    1,
    'Repeated registry data must produce one rule per ruleId',
  );

  const tokenizedPadding = diff(
    '[D] BackgroundPlateSlot',
    '[D] BackgroundPlateSlot',
    'layout.padding.right',
    16,
    'VariableID:spacing/16',
    'background-plate-key',
  );
  assert.equal(
    rules.findComponentContractViolationForDiff(tokenizedPadding),
    null,
    'A changed padding with an actual token binding is not a token violation',
  );

  const rawPadding = diff(
    '[D] BackgroundPlateSlot',
    '[D] BackgroundPlateSlot',
    'layout.padding.right',
    16,
    null,
    'background-plate-key',
  );
  assert.equal(
    rules.findComponentContractViolationForDiff(rawPadding)?.ruleId,
    paddingTokenRule.ruleId,
    'A changed padding with explicit missing binding remains a token violation',
  );

  const unrelatedOwner = diff(
    '[D] BackgroundPlateSlot / Level=1 / Slot / Table / HeadCell',
    'HeadCell',
    'layout.sizing.horizontal',
    'Hug',
    null,
    'table-wide-key',
  );
  assert.deepEqual(
    rules.findComponentContractRulesForDiff(unrelatedOwner),
    [],
    'An ancestor alias must not override an explicit nested component owner key',
  );

  const sectionContent = scopedDiff(
    'Dashboard / Section / Content',
    'Content',
    'layout.itemSpacing',
    scopedContext({
      actualNestedOwnerComponentKey: 'section-key',
      actualNestedOwnerPath: 'Dashboard / Section',
      actualNestedOwnerRelativePath: 'Content',
    }),
  );
  const sectionContentRuleIds = rules
    .findComponentContractRulesForDiff(sectionContent)
    .map((rule) => rule.ruleId);
  assert.deepEqual(
    sectionContentRuleIds,
    [sectionSlotRule.ruleId],
    'Section Content must receive its slot rule without CorporateContent root rules',
  );

  const sectionContentChild = scopedDiff(
    'Dashboard / Section / Content / Heading',
    'Heading',
    'layout.itemSpacing',
    scopedContext({
      actualNestedOwnerComponentKey: 'section-key',
      actualNestedOwnerPath: 'Dashboard / Section',
      actualNestedOwnerRelativePath: 'Content / Heading',
    }),
  );
  assert.deepEqual(
    rules.findComponentContractRulesForDiff(sectionContentChild),
    [],
    'A slot rule must not leak below the terminal Content slot',
  );

  const sectionIsle = scopedDiff(
    'Dashboard / Section / Isle',
    'Isle',
    'opacity',
    scopedContext({
      actualNestedOwnerComponentKey: 'section-key',
      actualNestedOwnerPath: 'Dashboard / Section',
      actualNestedOwnerRelativePath: 'Isle',
    }),
  );
  assert.deepEqual(
    rules.findComponentContractRulesForDiff(sectionIsle).map((rule) => rule.ruleId),
    [sectionSingularSlotRule.ruleId],
    'The singular target.slot selector must use the same terminal scope as slots',
  );

  const sectionRoot = scopedDiff(
    'Dashboard / Custom section name',
    'Custom section name',
    'layout.itemSpacing',
    scopedContext({ actualComponentKey: 'section-key' }),
  );
  assert.deepEqual(
    rules.findComponentContractRulesForDiff(sectionRoot).map((rule) => rule.ruleId),
    [sectionRootRule.ruleId],
    'A renamed Section instance root must match by Figma key and canonical name',
  );

  const backgroundPlateInsideCorporateContent = scopedDiff(
    'Dashboard / Corporate content / Operations table',
    'Operations table',
    'layout.padding.right',
    scopedContext({
      actualComponentKey: 'background-plate-key',
      actualNestedOwnerComponentKey: 'corporate-content-key',
      actualNestedOwnerPath: 'Dashboard / Corporate content',
      actualNestedOwnerRelativePath: 'Operations table',
    }),
  );
  backgroundPlateInsideCorporateContent.details.actual.bindingId = null;
  const backgroundPlateRuleIds = rules
    .findComponentContractRulesForDiff(backgroundPlateInsideCorporateContent)
    .map((rule) => rule.ruleId);
  assert.equal(
    backgroundPlateRuleIds.includes(paddingTokenRule.ruleId),
    true,
    'A renamed BackgroundPlateSlot root must match its layer by component key',
  );
  assert.equal(
    backgroundPlateRuleIds.includes(corporateSpacingRule.ruleId),
    false,
    'CorporateContent root padding rules must not attach to BackgroundPlateSlot',
  );
  assert.equal(
    backgroundPlateRuleIds.includes(corporateCanonicalLayerRule.ruleId),
    false,
    'An ancestor canonical name must not satisfy the changed instance layer selector',
  );

  const bodySlot = scopedDiff(
    'Dashboard / Corporate content / Body',
    'Body',
    'layout.itemSpacing',
    scopedContext({
      actualComponentKey: 'body-key',
      actualNestedOwnerComponentKey: 'corporate-content-key',
      actualNestedOwnerPath: 'Dashboard / Corporate content',
      actualNestedOwnerRelativePath: 'Body',
    }),
  );
  assert.deepEqual(
    rules.findComponentContractRulesForDiff(bodySlot).map((rule) => rule.ruleId),
    [corporateBodySlotRule.ruleId],
    'A component-owned slot rule must match the parent component and terminal slot',
  );

  const tableText = scopedDiff(
    'Table / Renamed text cell',
    'Renamed text cell',
    'variant.Presets',
    scopedContext({ actualComponentKey: 'table-text-key' }),
  );
  assert.deepEqual(
    rules.findComponentContractRulesForDiff(tableText).map((rule) => rule.ruleId),
    [tableTextRule.ruleId],
    'Table Wide layer rules must resolve a renamed nested component by key',
  );

  const transitionByKey = scopedDiff(
    'Dashboard / Renamed transition component',
    'Renamed transition component',
    'component.key',
    scopedContext({ actualComponentKey: 'transition-key' }),
  );
  assert.deepEqual(
    rules.findComponentContractRulesForDiff(transitionByKey).map((rule) => rule.ruleId),
    [transitionKeyRule.ruleId],
    'target.componentKeys must match the exact Figma component key after rename',
  );

  const transitionByName = scopedDiff(
    'Dashboard / Transition component',
    'Transition component',
    'component.name',
    scopedContext({ actualComponentKey: 'transition-name-key' }),
  );
  assert.deepEqual(
    rules.findComponentContractRulesForDiff(transitionByName).map((rule) => rule.ruleId),
    [transitionNameRule.ruleId],
    'target.componentNames must use the canonical catalog component name',
  );

  const warnings = [];
  const originalWarn = console.warn;
  globalThis.__APOLLO_TEST_REMOTE_COMPONENT_RULE_REGISTRY__[1].rulesFile.rules.push(
    unsupportedPlaceholderRule,
  );
  console.warn = (...args) => warnings.push(args);
  try {
    rules.findComponentContractRulesForDiff(sectionRoot);
    rules.findComponentContractRulesForDiff(sectionRoot);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(
    warnings.filter((args) =>
      String(args[0]).includes('unsupported rule target'),
    ).length,
    1,
    'Unsupported target shapes must be reported once and never act unconstrained',
  );
  assert.equal(
    rules
      .findComponentContractRulesForDiff(sectionRoot)
      .some((rule) => rule.ruleId === unsupportedPlaceholderRule.ruleId),
    false,
    'Unsupported target shapes must not attach to a diff',
  );

  console.log('Component rule scope regression checks passed');
}

main();
