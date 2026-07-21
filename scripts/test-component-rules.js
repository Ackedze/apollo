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

function variantDiff(
  nodePath,
  nodeName,
  property,
  referenceValue,
  actualValue,
  diffContext,
) {
  return {
    message: `${property}: ${referenceValue} → ${actualValue}`,
    nodePath,
    nodeName,
    nodeId: 'nested-status-node',
    context: diffContext,
    details: {
      property,
      reference: { value: referenceValue },
      actual: { value: actualValue },
    },
    assessment: {
      verdict: 'unknown',
      source: 'standalone-reference',
      reasonCode: 'no-contextual-expectation',
      ruleId: null,
      message: 'No contextual expectation',
      remediation: null,
      presentation: 'show',
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
  const headerAdjacencyRule = {
    ruleId: 'component:web-corp.corporate-content.header-adjacency',
    severity: 'error',
    source: 'pattern-link',
    appliesTo: 'screen.composition|layout.itemSpacing',
    checkType: 'deterministic',
    matchKind: 'composition_rule',
    ruleText: 'Header must be adjacent to CorporateContent.',
  };
  const gutterHorizontalCompositionRule = {
    ruleId:
      'component:web-corp.corporate-content.gutter-horizontal-composition',
    severity: 'info',
    source: 'component-contract',
    appliesTo: 'layout.itemSpacing|variables.Gutter',
    checkType: 'llm',
    matchKind: 'composition_rule',
    ruleText: 'Gutter may be used by horizontal compositions.',
  };
  const targetlessAtomicRule = {
    ruleId: 'component:web-corp.corporate-content.atomic-padding-policy',
    severity: 'warning',
    source: 'component-contract',
    appliesTo: 'layout.padding.*',
    checkType: 'deterministic',
    matchKind: 'exact_component_rule',
    changeScope: 'atomic',
    ruleText: 'Atomic padding changes use the component policy.',
  };
  const targetlessPackageContextRule = {
    ruleId: 'component:web-corp.corporate-content.package-layout-context',
    severity: 'info',
    source: 'component-contract',
    appliesTo: 'layout.itemSpacing',
    checkType: 'deterministic',
    changeScope: 'package-context',
    ruleText: 'Package-level layout context.',
  };
  const legacyTargetlessDeterministicRule = {
    ruleId: 'component:web-corp.corporate-content.legacy-padding-classification',
    severity: 'warning',
    source: 'component-contract',
    appliesTo: 'layout.padding.*',
    checkType: 'deterministic',
    ruleText: 'Legacy deterministic atomic classification.',
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
  const titleStatusStyleRule = {
    ruleId: 'component:web-corp.title-view.status-style-matches-surface',
    severity: 'error',
    source: 'pattern-link',
    appliesTo: 'variant.Style|surface.context',
    checkType: 'deterministic',
    matchKind: 'composition_rule',
    conditions: {
      components: ['[D] TitleView', '[M] TitleView'],
      slot: 'Status',
    },
    requiredVariantByContext: {
      graySurface: { Style: 'Contrast' },
      whiteSurface: { Style: 'Muted' },
    },
    ruleText: 'Status style follows the containing surface.',
  };
  const titleStatusTypeRule = {
    ruleId: 'component:web-corp.title-view.status-type-follows-public-api',
    severity: 'info',
    source: 'component-contract',
    appliesTo: 'variant.Type',
    checkType: 'deterministic',
    matchKind: 'exact_component_rule',
    target: {
      component: 'web-corp.title-view',
      layers: ['Status/StatusPreset'],
    },
    classification: { allPublicApiValuesAllowed: true },
    ruleText: 'Every published StatusPreset Type is allowed.',
  };
  const statusContrastRule = {
    ruleId: 'component:web-corp.status-property.status-preset-contrast-on-grey-surface',
    severity: 'error',
    source: 'composition-contract',
    appliesTo: 'variant.Style',
    checkType: 'deterministic',
    matchKind: 'exact_component_rule',
    conditions: {
      components: ['[D] StatusPreset', '[M] StatusPreset'],
      variantProperty: 'Style',
      backgroundSurface: [
        'grey',
        'neutral',
        'page-grey',
        'surface-grey',
        'base-bg-alt',
      ],
    },
    requiredVariant: { Style: 'Contrast' },
    forbiddenVariant: { Style: 'Muted' },
    ruleText: 'Muted is forbidden on a grey surface.',
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
          headerAdjacencyRule,
          gutterHorizontalCompositionRule,
          targetlessAtomicRule,
          targetlessPackageContextRule,
          legacyTargetlessDeterministicRule,
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
    {
      componentKey: 'web-corp.title-view',
      aliases: ['[D] TitleView', '[M] TitleView'],
      figmaKeys: ['title-view-key'],
      rulesFile: {
        componentKey: 'web-corp.title-view',
        rules: [titleStatusStyleRule, titleStatusTypeRule],
      },
    },
    {
      componentKey: 'web-corp.status-property',
      aliases: ['[D] StatusPreset', '[M] StatusPreset'],
      figmaKeys: ['status-preset-key'],
      rulesFile: {
        componentKey: 'web-corp.status-property',
        rules: [statusContrastRule],
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
    'title-view-key': '[D] TitleView',
    'status-preset-key': '[D] StatusPreset',
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
    'A renamed Section root must keep its exact rule without targetless composition/package context leakage',
  );

  const corporateRootPadding = scopedDiff(
    'Dashboard / Corporate content',
    'Corporate content',
    'layout.padding.left',
    scopedContext({ actualComponentKey: 'corporate-content-key' }),
  );
  const corporateRootPaddingRuleIds = rules
    .findComponentContractRulesForDiff(corporateRootPadding)
    .map((rule) => rule.ruleId);
  assert.equal(
    corporateRootPaddingRuleIds.includes(targetlessAtomicRule.ruleId),
    true,
    'An explicitly atomic targetless exact rule may attach component-wide',
  );
  assert.equal(
    corporateRootPaddingRuleIds.includes(
      legacyTargetlessDeterministicRule.ruleId,
    ),
    true,
    'Legacy targetless deterministic atomic rules remain compatible',
  );
  assert.equal(
    corporateRootPaddingRuleIds.includes(targetlessPackageContextRule.ruleId),
    false,
    'A package-context rule must never attach to an atomic change',
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

  const nestedStatusContext = scopedContext({
    actualComponentKey: 'status-preset-key',
    actualNestedOwnerComponentKey: 'title-view-key',
    actualNestedOwnerPath: 'View=xLarge / MainContent',
    actualNestedOwnerRelativePath: 'Status / StatusPreset',
    surfaceContext: {
      kind: 'white',
      source: 'ancestor-fill-token',
      nodeId: 'surface-node',
      nodeName: 'White surface',
      tokenId: 'white-token',
      tokenName: 'static_monochrome-white/100',
      color: '#FFFFFF',
    },
  });
  const whiteStatusStyle = variantDiff(
    'View=xLarge / MainContent / Status / StatusPreset',
    'StatusPreset',
    'variant.Style',
    'Contrast',
    'Muted',
    nestedStatusContext,
  );
  const whiteStatusAssessment =
    rules.applyContextualComponentRuleAssessment(whiteStatusStyle);
  assert.equal(whiteStatusAssessment.assessment.verdict, 'allowed');
  assert.equal(
    whiteStatusAssessment.assessment.ruleId,
    titleStatusStyleRule.ruleId,
    'Muted StatusPreset must be allowed when the nearest surface evidence is white',
  );
  assert.equal(
    rules
      .findComponentContractRulesForDiff(whiteStatusStyle)
      .some((rule) => rule.ruleId === statusContrastRule.ruleId),
    false,
    'Grey-only StatusPreset rules must not attach on a white surface',
  );

  const grayStatusStyle = variantDiff(
    'View=xLarge / MainContent / Status / StatusPreset',
    'StatusPreset',
    'variant.Style',
    'Contrast',
    'Muted',
    Object.assign({}, nestedStatusContext, {
      surfaceContext: Object.assign({}, nestedStatusContext.surfaceContext, {
        kind: 'gray',
        tokenName: 'base-bg-alt (grey)',
        color: '#F3F4F7',
      }),
    }),
  );
  const grayStatusAssessment =
    rules.applyContextualComponentRuleAssessment(grayStatusStyle);
  assert.equal(grayStatusAssessment.assessment.verdict, 'violation');
  assert.equal(
    grayStatusAssessment.assessment.ruleId,
    titleStatusStyleRule.ruleId,
    'Muted StatusPreset must be a deterministic violation on a gray surface',
  );

  const publicStatusType = variantDiff(
    'View=xLarge / MainContent / Status / StatusPreset',
    'StatusPreset',
    'variant.Type',
    'Approved',
    'Processing',
    nestedStatusContext,
  );
  const publicStatusAssessment =
    rules.applyContextualComponentRuleAssessment(publicStatusType);
  assert.equal(publicStatusAssessment.assessment.verdict, 'allowed');
  assert.equal(
    publicStatusAssessment.assessment.ruleId,
    titleStatusTypeRule.ruleId,
    'A published nested StatusPreset Type must be allowed by the TitleView host contract',
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
