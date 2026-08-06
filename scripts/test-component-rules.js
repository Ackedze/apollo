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
  const backgroundPlateRequiredPaintTokenRule = {
    ruleId: 'component:web-corp.background-plate.colored-and-border-use-color-tokens',
    severity: 'error',
    source: 'component-contract',
    ruleKind: 'design-rule',
    appliesTo: 'fill|stroke',
    checkType: 'deterministic',
    matchKind: 'exact_component_rule',
    conditions: {
      components: ['[D] Style Level 1', '[D][Promo] Style Level 1'],
      variant: { Type: ['Colored', 'Border'] },
    },
    requiredTokenBinding: {
      byType: {
        Colored: { properties: ['fill'], tokenType: 'color' },
        Border: { properties: ['stroke'], tokenType: 'color' },
      },
    },
    ruleText: 'Colored fill and Border stroke must use color tokens.',
  };
  const backgroundPlateBorderFillRule = {
    ruleId: 'component:web-corp.background-plate.border-has-no-visible-fill',
    severity: 'error',
    source: 'component-contract',
    ruleKind: 'design-rule',
    appliesTo: 'fill|styles.fill',
    checkType: 'deterministic',
    matchKind: 'exact_component_rule',
    conditions: {
      component: 'web-corp.background-plate',
      variant: { Type: 'Border' },
    },
    requiredPaintState: { fill: 'none-or-not-visible' },
    classification: { resetSurface: 'layer' },
    ruleText: 'Border must not have a visible fill.',
  };
  const backgroundPlateColoredPaintRule = {
    ruleId: 'component:web-corp.background-plate.colored-uses-fill-without-stroke',
    severity: 'error',
    source: 'component-contract',
    ruleKind: 'design-rule',
    appliesTo: 'fill|styles.fill|stroke|styles.stroke',
    checkType: 'deterministic',
    matchKind: 'exact_component_rule',
    conditions: {
      components: ['[D] Style Level 1', '[D][Promo] Style Level 1'],
      variant: { Type: 'Colored' },
    },
    requiredPaintState: {
      fill: 'visible-and-tokenized',
      stroke: 'none-or-not-visible',
    },
    ruleText: 'Colored must use tokenized fill without stroke.',
  };
  const backgroundPlateFixedPaintRule = {
    ruleId: 'component:web-corp.background-plate.primary-secondary-paint-is-fixed',
    severity: 'error',
    source: 'component-contract',
    ruleKind: 'design-rule',
    appliesTo: 'fill|styles.fill|stroke|styles.stroke',
    checkType: 'deterministic',
    matchKind: 'exact_component_rule',
    conditions: {
      components: ['[D] Style Level 1', '[D][Promo] Style Level 1'],
      variant: { Type: ['Primary', 'Secondary'] },
    },
    requiredPaintState: {
      fill: 'effective-baseline',
      stroke: 'effective-baseline',
    },
    ruleText: 'Primary and Secondary paint is fixed.',
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
  const titleStatusSizeRule = {
    ruleId: 'component:web-corp.title-view.status-size-24',
    severity: 'error',
    source: 'pattern-link',
    appliesTo: 'variant.Size',
    checkType: 'deterministic',
    matchKind: 'exact_component_rule',
    conditions: {
      components: ['[D] TitleView', '[M] TitleView'],
      slot: 'Status',
    },
    requiredVariant: {Size: '24'},
    ruleText: 'TitleView StatusPreset must use Size=24.',
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
  const buttonsGroupSpacingRule = {
    ruleId: 'component:web-corp.buttons-group.spacing-uses-effective-baseline',
    severity: 'error',
    source: 'component-contract',
    appliesTo: 'layout.itemSpacing|layout.itemSpacingToken',
    checkType: 'deterministic',
    matchKind: 'exact_component_rule',
    target: {
      component: 'ButtonGroup [D]',
      layers: ['[D] ButtonsGroup', '[M] ButtonsGroup'],
    },
    requiredConfiguration: {
      manualItemSpacingAllowed: false,
    },
    ruleText: 'ButtonsGroup spacing must use the effective baseline.',
  };
  const onboardingHintRecommendedWidthRule = {
    ruleId: 'component:web-corp.onboarding-hint.recommended-width',
    severity: 'warning',
    source: 'component-contract',
    ruleKind: 'design-rule',
    appliesTo: 'layout.width',
    checkType: 'deterministic',
    matchKind: 'exact_component_rule',
    target: {
      component: 'Onboarding Hint [D]',
    },
    numericConstraint: {
      recommended: 360,
    },
    ruleText: 'Recommended width is 360 px.',
  };
  const onboardingHintMaximumWidthRule = {
    ruleId: 'component:web-corp.onboarding-hint.maximum-width',
    severity: 'error',
    source: 'component-contract',
    ruleKind: 'design-rule',
    appliesTo: 'layout.width',
    checkType: 'deterministic',
    matchKind: 'exact_component_rule',
    target: {
      component: 'Onboarding Hint [D]',
    },
    numericConstraint: {
      maximum: 420,
    },
    ruleText: 'Maximum width is 420 px.',
  };
  const amountSharedColorRule = {
    ruleId: 'component:web-corp.amount-styles.parts-share-color',
    severity: 'error',
    source: 'component-contract',
    appliesTo: 'fill|fills',
    checkType: 'deterministic',
    matchKind: 'exact_component_rule',
    target: {
      component: 'AmountStyles',
      layers: ['Operation', 'Minus', 'Major', 'Minor', 'Currency'],
    },
    sharedValueConstraint: {
      strategy: 'all-visible-targets-equal',
      groupByPathBranches: ['Operation', 'Amount'],
    },
    ruleText: 'All visible Amount text parts must share one color.',
  };
  const amountTextStyleRule = {
    ruleId: 'component:web-corp.amount-styles.parts-share-text-style',
    severity: 'error',
    source: 'component-contract',
    ruleKind: 'design-rule',
    appliesTo: 'styles.text',
    checkType: 'deterministic',
    matchKind: 'exact_component_rule',
    target: {
      component: 'AmountStyles',
      layers: ['Operation', 'Minus', 'Major', 'Minor', 'Currency'],
    },
    ruleText: 'Amount text style is controlled by the host Style property.',
  };
  const amountOpacityRule = {
    ruleId: 'component:web-corp.amount-styles.opacity-is-forbidden',
    severity: 'error',
    source: 'component-contract',
    ruleKind: 'design-rule',
    appliesTo: 'opacity|variant.Opacity',
    checkType: 'deterministic',
    matchKind: 'exact_component_rule',
    target: {
      component: 'AmountStyles',
      layers: ['Minor', 'Currency'],
    },
    ruleText: 'Minor and Currency opacity overrides are forbidden.',
  };
  const amountGeometryRule = {
    ruleId: 'component:web-corp.amount-styles.geometry-follows-effective-baseline',
    severity: 'error',
    source: 'component-contract',
    ruleKind: 'design-rule',
    appliesTo: 'layout.*',
    checkType: 'deterministic',
    matchKind: 'exact_component_rule',
    target: {
      component: 'AmountStyles',
      layers: ['Operation', 'Major', 'Minor', 'Currency', 'Addon'],
    },
    ruleText: 'Amount geometry follows the effective Style baseline.',
  };
  globalThis.__APOLLO_TEST_REMOTE_COMPONENT_RULE_REGISTRY__ = [
    {
      componentKey: 'web-corp.background-plate',
      aliases: [
        '[D] BackgroundPlateSlot',
        '[D] Style Level 1',
        '[D][Promo] Style Level 1',
      ],
      figmaKeys: [
        'background-plate-key',
        'style-level-key',
        'promo-style-level-key',
      ],
      rulesFile: {
        componentKey: 'web-corp.background-plate',
        rules: [
          sizingRule,
          sizingRule,
          paddingTokenRule,
          backgroundPlateRequiredPaintTokenRule,
          backgroundPlateBorderFillRule,
          backgroundPlateColoredPaintRule,
          backgroundPlateFixedPaintRule,
        ],
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
        rules: [titleStatusStyleRule, titleStatusTypeRule, titleStatusSizeRule],
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
    {
      componentKey: 'web-corp.buttons-group',
      packageName: 'ButtonGroup [D]',
      aliases: ['[D] ButtonsGroup', '[M] ButtonsGroup', 'ButtonGroup [D]'],
      figmaKeys: ['buttons-group-variant-key'],
      rulesFile: {
        componentKey: 'web-corp.buttons-group',
        rules: [buttonsGroupSpacingRule],
      },
    },
    {
      componentKey: 'web-corp.onboarding-hint',
      packageName: 'Onboarding Hint [D]',
      aliases: ['Onboarding Hint', 'Onboarding Hint [D]'],
      figmaKeys: ['onboarding-hint-key'],
      rulesFile: {
        componentKey: 'web-corp.onboarding-hint',
        rules: [
          onboardingHintRecommendedWidthRule,
          onboardingHintMaximumWidthRule,
        ],
      },
    },
    {
      componentKey: 'web-corp.amount-styles',
      packageName: 'AmountStyles',
      aliases: [
        'AmountStyles',
        '🔒 AmountParagraph',
        'Operation',
        'Major',
        'Minor',
        'Currency',
      ],
      figmaKeys: ['amount-paragraph-key'],
      rulesFile: {
        componentKey: 'web-corp.amount-styles',
        rules: [
          amountSharedColorRule,
          amountTextStyleRule,
          amountOpacityRule,
          amountGeometryRule,
        ],
      },
    },
  ];
  globalThis.__APOLLO_TEST_COMPONENT_NAME_BY_KEY__ = {
    'background-plate-key': '[D] BackgroundPlateSlot',
    'style-level-key': '[D] Style Level 1',
    'promo-style-level-key': '[D][Promo] Style Level 1',
    'corporate-content-key': '[D] CorporateContent',
    'section-key': '[D] Section',
    'body-key': 'Body',
    'table-wide-key': '[D] Table Wide',
    'table-text-key': 'Text',
    'transition-key': 'Consumer rename',
    'transition-name-key': '[T] CorporateContent',
    'title-view-key': '[D] TitleView',
    'status-preset-key': '[D] StatusPreset',
    'buttons-group-variant-key': 'Size=56, Overflow=true',
    'onboarding-hint-key': 'Onboarding Hint',
    'amount-paragraph-key': '🔒 AmountParagraph',
  };

  const styleLevelPaintDiff = (
    type,
    property,
    actualValue,
    bindingStatus,
    bindingId = null,
  ) => ({
    message: `${property}: reference → ${actualValue}`,
    nodePath: `BackgroundColor=base-bg-alt, Type=${type} / [D] Style Level 1`,
    nodeName: '[D] Style Level 1',
    context: scopedContext({
      actualComponentKey: 'style-level-key',
      actualVariantProperties: {
        BackgroundColor: 'base-bg-alt',
        Type: type,
        Skeleton: 'False',
      },
    }),
    details: {
      property,
      reference: { value: 'reference-token', bindingId: 'reference-token' },
      actual: {
        value: actualValue,
        bindingId,
        resourceType: bindingId ? 'token' : undefined,
        resourceId: bindingId,
      },
      bindingStatus,
    },
  });

  assert.equal(
    rules.findComponentContractViolationForDiff(
      styleLevelPaintDiff(
        'Border',
        'stroke',
        'neutral-translucent/1300',
        'different-binding',
        'border-token',
      ),
    ),
    null,
    'A tokenized Border stroke is an allowed customization, not a component-rule violation',
  );
  assert.equal(
    rules.applyContextualComponentRuleAssessment(
      styleLevelPaintDiff(
        'Border',
        'stroke',
        'neutral-translucent/1300',
        'different-binding',
        'border-token',
      ),
    ).assessment?.verdict,
    'expected',
    'A tokenized Border stroke must be presented as Expected',
  );
  assert.equal(
    rules.findComponentContractViolationForDiff(
      styleLevelPaintDiff('Border', 'fill', '#863131', 'unbound'),
    )?.ruleId,
    backgroundPlateBorderFillRule.ruleId,
    'A visible Border fill must remain a violation',
  );
  const borderFillClassifiedAsDerivedExpected = styleLevelPaintDiff(
    'Border',
    'fill',
    'neutral-translucent/100',
    'different-binding',
    'fill-token',
  );
  borderFillClassifiedAsDerivedExpected.assessment = {
    verdict: 'expected',
    source: 'catalog-host',
    reasonCode: 'matches-selected-nested-context',
    ruleId: null,
    message: 'Derived from the selected nested variant',
    remediation: null,
  };
  const forbiddenBorderFillResult =
    rules.applyContextualComponentRuleAssessment(
      borderFillClassifiedAsDerivedExpected,
    );
  assert.equal(
    forbiddenBorderFillResult.assessment?.verdict,
    'violation',
    'A structured Border no-fill rule must override a derived Expected assessment',
  );
  assert.equal(
    forbiddenBorderFillResult.assessment?.ruleId,
    backgroundPlateBorderFillRule.ruleId,
  );
  assert.equal(
    forbiddenBorderFillResult.details.reference.value,
    null,
    'A forbidden Border fill must use an empty reference state instead of the inherited host token',
  );
  assert.equal(forbiddenBorderFillResult.details.bindingStatus, null);
  assert.match(forbiddenBorderFillResult.message, /заливка: — →/);
  const earlyForbiddenBorderFillResult =
    rules.applyStructuredComponentRuleAssessment(
      Object.assign({}, borderFillClassifiedAsDerivedExpected, {
        assessment: null,
        suppressAsHostControlledNestedProperty: true,
        suppressionReason: 'nested-variant-root-switch',
        details: Object.assign({}, borderFillClassifiedAsDerivedExpected.details, {
          bindingStatus: 'missing-reference-binding',
        }),
      }),
    );
  assert.equal(
    earlyForbiddenBorderFillResult.assessment?.verdict,
    'violation',
    'A forbidden Border fill must be protected before composition suppression',
  );
  assert.equal(
    earlyForbiddenBorderFillResult.assessment?.ruleId,
    backgroundPlateBorderFillRule.ruleId,
  );
  assert.equal(
    earlyForbiddenBorderFillResult.suppressAsHostControlledNestedProperty,
    false,
    'An absolute no-fill violation must override nested variant suppression',
  );
  const preAssessedForbiddenBorderFillResult =
    rules.applyStructuredComponentRuleAssessment(
      Object.assign({}, borderFillClassifiedAsDerivedExpected, {
        assessment: {
          verdict: 'violation',
          source: 'component-contract',
          reasonCode: 'component-contract-violation',
          ruleId: backgroundPlateBorderFillRule.ruleId,
          message: 'Already classified during variable binding assessment',
          remediation: null,
        },
        suppressAsHostControlledNestedProperty: true,
        suppressionReason: 'nested-variant-root-switch',
      }),
    );
  assert.equal(
    preAssessedForbiddenBorderFillResult.suppressAsHostControlledNestedProperty,
    false,
    'A pre-assessed no-fill violation must still clear host suppression',
  );
  assert.equal(
    preAssessedForbiddenBorderFillResult.details.reference.value,
    null,
    'A pre-assessed no-fill violation must still normalize its baseline',
  );
  assert.equal(
    preAssessedForbiddenBorderFillResult.assessment.reasonCode,
    'component-contract-required-paint-state',
    'An absolute paint-state violation must remain identifiable downstream',
  );
  const effectiveBaselineDiff = Object.assign(
    {},
    borderFillClassifiedAsDerivedExpected,
    {
      assessment: null,
      context: Object.assign({}, borderFillClassifiedAsDerivedExpected.context, {
        actualVariantProperties: {Type: 'Primary'},
      }),
    },
  );
  assert.equal(
    rules.applyStructuredComponentRuleAssessment(effectiveBaselineDiff),
    effectiveBaselineDiff,
    'Effective-baseline paint rules must wait for composition assessment',
  );
  assert.equal(
    rules.findComponentContractViolationForDiff(
      styleLevelPaintDiff(
        'Colored',
        'fill',
        'status/info',
        'different-binding',
        'fill-token',
      ),
    ),
    null,
    'A tokenized Colored fill is an allowed customization',
  );
  assert.equal(
    rules.applyContextualComponentRuleAssessment(
      styleLevelPaintDiff(
        'Colored',
        'fill',
        'status/info',
        'different-binding',
        'fill-token',
      ),
    ).assessment?.verdict,
    'expected',
    'A tokenized Colored fill must be presented as Expected',
  );
  assert.equal(
    rules.findComponentContractViolationForDiff(
      styleLevelPaintDiff('Colored', 'stroke', '#000000', 'unbound'),
    )?.ruleId,
    backgroundPlateColoredPaintRule.ruleId,
    'Colored must still reject a visible stroke',
  );
  assert.equal(
    rules.findComponentContractViolationForDiff(
      styleLevelPaintDiff(
        'Primary',
        'fill',
        'status/info',
        'different-binding',
        'fill-token',
      ),
    )?.ruleId,
    backgroundPlateFixedPaintRule.ruleId,
    'Primary and Secondary paint changes remain fixed-baseline violations',
  );

  const forbiddenBorderFillDiffs = rules.createRequiredPaintStateDiffs([
    {
      id: 1,
      nodeId: 'style-level-border',
      parentId: null,
      path: 'BackgroundColor=base-bg-alt, Type=Border / [D] Style Level 1',
      type: 'INSTANCE',
      name: '[D] Style Level 1',
      visible: true,
      radius: 16,
      fill: {color: '#FFFFFF'},
      stroke: {token: 'border-token', color: '#000000'},
      componentInstance: {
        componentKey: 'style-level-key',
        variantProperties: {
          BackgroundColor: 'base-bg-alt',
          Type: 'Border',
          Skeleton: 'False',
        },
      },
    },
  ]);
  assert.equal(
    forbiddenBorderFillDiffs.length,
    1,
    'A visible Border fill must produce a violation even when the materialized host baseline inherited the same fill',
  );
  assert.equal(forbiddenBorderFillDiffs[0].details.property, 'fill');
  assert.equal(forbiddenBorderFillDiffs[0].details.reference.value, null);
  assert.equal(forbiddenBorderFillDiffs[0].assessment.verdict, 'violation');
  assert.equal(
    forbiddenBorderFillDiffs[0].assessment.evidence.resetSurface,
    'layer',
    'Layer-scoped paint rules must preserve their reset surface for the UI action',
  );

  const tokenizedForbiddenBorderFillDiffs = rules.createRequiredPaintStateDiffs(
    [
      {
        id: 2,
        nodeId: 'style-level-tokenized-border',
        parentId: null,
        path: 'BackgroundColor=base-bg-alt, Type=Border / [D] Style Level 1',
        type: 'INSTANCE',
        name: '[D] Style Level 1',
        visible: true,
        radius: 16,
        fill: {token: 'VariableID:base-bg-alt-secondary'},
        componentInstance: {
          componentKey: 'style-level-key',
          variantProperties: {
            BackgroundColor: 'base-bg-alt',
            Type: 'Border',
            Skeleton: 'False',
          },
        },
      },
    ],
    [],
    (tokenId) =>
      tokenId === 'VariableID:base-bg-alt-secondary'
        ? 'base-bg-alt/secondary'
        : null,
  );
  assert.equal(tokenizedForbiddenBorderFillDiffs.length, 1);
  assert.equal(
    tokenizedForbiddenBorderFillDiffs[0].details.actual.value,
    'VariableID:base-bg-alt-secondary',
  );
  assert.equal(
    tokenizedForbiddenBorderFillDiffs[0].details.actual.displayName,
    'base-bg-alt/secondary',
  );
  assert.equal(
    tokenizedForbiddenBorderFillDiffs[0].message,
    'заливка: — → base-bg-alt/secondary',
  );

  const promoBorderFillDiffs = rules.createRequiredPaintStateDiffs([
    {
      id: 3,
      nodeId: 'promo-style-level-border',
      parentId: null,
      path:
        'Position=Level 1 (outer) / [D][Promo] Style Level 1',
      type: 'INSTANCE',
      name: '[D][Promo] Style Level 1',
      visible: true,
      radius: 16,
      fill: {color: 'paint:GRADIENT_LINEAR'},
      stroke: {token: 'border-token', color: '#000000'},
      componentInstance: {
        componentKey: 'promo-style-level-key',
        variantProperties: {
          BackgroundColor: 'base-bg-alt (gray)',
          Type: 'Border',
          Skeleton: 'False',
        },
      },
    },
  ]);
  assert.equal(
    promoBorderFillDiffs.length,
    1,
    'A visible non-solid fill on promo Border must produce a violation',
  );
  assert.equal(
    promoBorderFillDiffs[0].assessment.ruleId,
    backgroundPlateBorderFillRule.ruleId,
  );

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

  const buttonsGroupSpacing = scopedDiff(
    'Size=56, Overflow=true',
    '[D] ButtonsGroup',
    'layout.itemSpacing',
    scopedContext({ actualComponentKey: 'buttons-group-variant-key' }),
  );
  buttonsGroupSpacing.details.bindingStatus = 'different-binding';
  assert.deepEqual(
    rules
      .findComponentContractRulesForDiff(buttonsGroupSpacing)
      .map((rule) => rule.ruleId),
    [buttonsGroupSpacingRule.ruleId],
    'A package alias selector must match every Figma variant key owned by the package',
  );
  assert.equal(
    rules.findComponentContractViolationForDiff(buttonsGroupSpacing)?.ruleId,
    buttonsGroupSpacingRule.ruleId,
    'A manual itemSpacing substitution must be a deterministic contract violation',
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

  const catalogExpectedStatusSize = variantDiff(
    'View=xLarge / MainContent / Status / StatusPreset',
    'StatusPreset',
    'variant.Size',
    '24',
    '32',
    nestedStatusContext,
  );
  catalogExpectedStatusSize.assessment = {
    verdict: 'expected',
    source: 'catalog-host',
    reasonCode: 'matches-selected-nested-context',
    ruleId: null,
    message: 'Selected nested catalog value',
    remediation: null,
    presentation: 'show',
  };
  assert.ok(
    rules
      .findComponentContractRulesForDiff(catalogExpectedStatusSize)
      .some((rule) => rule.ruleId === titleStatusSizeRule.ruleId),
    'The exact TitleView size rule must attach to the nested StatusPreset diff',
  );
  const titleStatusSizeAssessment =
    rules.applyContextualComponentRuleAssessment(catalogExpectedStatusSize);
  assert.equal(titleStatusSizeAssessment.assessment.verdict, 'violation');
  assert.equal(
    titleStatusSizeAssessment.assessment.ruleId,
    titleStatusSizeRule.ruleId,
    'An exact TitleView Size rule must override generic Expected evidence from the standalone StatusPreset catalog',
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

  const recommendedWidth = diff(
    'Onboarding Hint',
    'Onboarding Hint',
    'layout.width',
    360,
    null,
    'onboarding-hint-key',
  );
  assert.deepEqual(
    rules.findComponentContractRulesForDiff(recommendedWidth),
    [],
    'The recommended width must not produce a component rule finding',
  );

  const allowedWidth = diff(
    'Onboarding Hint',
    'Onboarding Hint',
    'layout.width',
    400,
    null,
    'onboarding-hint-key',
  );
  assert.deepEqual(
    rules
      .findComponentContractRulesForDiff(allowedWidth)
      .map((rule) => rule.ruleId),
    [onboardingHintRecommendedWidthRule.ruleId],
    'A non-recommended width below the maximum must only produce a recommendation',
  );
  assert.equal(
    rules.findComponentContractViolationForDiff(allowedWidth),
    null,
    'A width below the maximum must remain allowed',
  );

  const excessiveWidth = diff(
    'Onboarding Hint',
    'Onboarding Hint',
    'layout.width',
    '421 px',
    null,
    'onboarding-hint-key',
  );
  assert.deepEqual(
    rules
      .findComponentContractRulesForDiff(excessiveWidth)
      .map((rule) => rule.ruleId),
    [
      onboardingHintRecommendedWidthRule.ruleId,
      onboardingHintMaximumWidthRule.ruleId,
    ],
    'A width above the maximum must produce recommendation and maximum rules',
  );
  assert.equal(
    rules.findComponentContractViolationForDiff(excessiveWidth)?.ruleId,
    onboardingHintMaximumWidthRule.ruleId,
    'A width above 420 px must be an exact component violation',
  );
  assert.equal(
    rules.hasNumericConstraintRules(
      'onboarding-hint-key',
      ['Onboarding Hint'],
    ),
    true,
    'Apollo must request a snapshot when the component has numeric rules',
  );

  const widthNode = (width) => ({
    id: 1,
    parentId: null,
    path: 'Onboarding Hint',
    type: 'INSTANCE',
    name: 'Onboarding Hint',
    visible: true,
    radius: null,
    layout: { width },
    componentInstance: {
      componentKey: 'onboarding-hint-key',
    },
  });
  assert.deepEqual(
    rules.createNumericConstraintRuleDiffs([widthNode(360)]),
    [],
    'The recommended width must not produce a runtime diff',
  );

  const allowedWidthDiffs =
    rules.createNumericConstraintRuleDiffs([widthNode(400)]);
  assert.equal(allowedWidthDiffs.length, 1);
  assert.equal(allowedWidthDiffs[0].details.property, 'layout.width');
  assert.equal(allowedWidthDiffs[0].details.reference.value, 360);
  assert.equal(allowedWidthDiffs[0].details.actual.value, 400);
  assert.equal(
    allowedWidthDiffs[0].assessment,
    undefined,
    'A contextual width below the maximum must remain a recommendation',
  );

  const excessiveWidthDiffs =
    rules.createNumericConstraintRuleDiffs([widthNode(421)]);
  assert.equal(excessiveWidthDiffs.length, 1);
  assert.equal(excessiveWidthDiffs[0].details.reference.value, 360);
  assert.equal(excessiveWidthDiffs[0].details.actual.value, 421);
  assert.equal(
    excessiveWidthDiffs[0].assessment.ruleId,
    onboardingHintMaximumWidthRule.ruleId,
    'A runtime width above the maximum must receive the exact violation assessment',
  );

  const amountNode = (id, parentId, nodePath, name, token) => ({
    id,
    nodeId: `amount-${id}`,
    parentId,
    path: nodePath,
    type: id === 1 ? 'INSTANCE' : 'TEXT',
    name,
    visible: true,
    radius: null,
    fill: token ? {token} : null,
    componentInstance:
      id === 1 ? {componentKey: 'amount-paragraph-key'} : null,
  });
  const amountRoot = amountNode(
    1,
    null,
    '🔒 AmountParagraph',
    '🔒 AmountParagraph',
    null,
  );
  const amountParts = (minorToken) => [
    amountRoot,
    amountNode(2, 1, '🔒 AmountParagraph / Operation / Minus', 'Minus', 'text/custom'),
    amountNode(3, 1, '🔒 AmountParagraph / Amount / Major / Major', 'Major', 'text/custom'),
    amountNode(4, 1, '🔒 AmountParagraph / Amount / Minor / Minor', 'Minor', minorToken),
    amountNode(5, 1, '🔒 AmountParagraph / Amount / Currency / Currency', 'Currency', 'text/custom'),
  ];
  const amountFillDiff = (nodePath, nodeName, actual) => ({
    message: `fill: text/primary → ${actual}`,
    nodePath,
    nodeName,
    nodeId: `diff-${nodeName}`,
    context: scopedContext({
      actualNestedOwnerComponentKey: 'amount-paragraph-key',
      actualNestedOwnerPath: '🔒 AmountParagraph',
      actualNestedOwnerRelativePath: nodePath.replace('🔒 AmountParagraph / ', ''),
    }),
    diffKind: 'paint',
    details: {
      property: 'fill',
      reference: {value: 'text/primary', bindingId: 'text/primary'},
      actual: {value: actual, bindingId: actual},
      bindingStatus: 'different-binding',
    },
  });
  const wholeAmountRecolorDiffs = [
    amountFillDiff('🔒 AmountParagraph / Operation / Minus', 'Minus', 'text/custom'),
    amountFillDiff('🔒 AmountParagraph / Amount / Major / Major', 'Major', 'text/custom'),
    amountFillDiff('🔒 AmountParagraph / Amount / Minor / Minor', 'Minor', 'text/custom'),
    amountFillDiff('🔒 AmountParagraph / Amount / Currency / Currency', 'Currency', 'text/custom'),
  ];
  const expectedWholeAmountRecolor =
    rules.applySharedValueComponentRuleAssessments(
      wholeAmountRecolorDiffs,
      amountParts('text/custom'),
    );
  assert.ok(
    expectedWholeAmountRecolor.every(
      (entry) => entry.assessment?.verdict === 'expected',
    ),
    'A whole-Amount recolor to one shared token must remain Expected',
  );
  const singleVisiblePart = rules.applySharedValueComponentRuleAssessments(
    [
      amountFillDiff(
        '🔒 AmountParagraph / Amount / Major / Major',
        'Major',
        'text/custom',
      ),
    ],
    [
      amountRoot,
      amountNode(
        3,
        1,
        '🔒 AmountParagraph / Amount / Major / Major',
        'Major',
        'text/custom',
      ),
    ],
  );
  assert.equal(
    singleVisiblePart[0].assessment?.verdict,
    'expected',
    'A whole-Amount recolor remains valid when Major is the only visible part',
  );

  const secondAmountParts = amountParts('text/secondary').map((node) =>
    Object.assign({}, node, {
      id: node.id + 10,
      parentId: node.parentId === null ? null : node.parentId + 10,
      path: node.path.replace('🔒 AmountParagraph', 'Card / Second Amount'),
      fill: node.fill?.token ? {token: 'text/secondary'} : node.fill,
    }),
  );
  const independentAmounts = rules.applySharedValueComponentRuleAssessments(
    [
      wholeAmountRecolorDiffs[0],
      amountFillDiff(
        'Card / Second Amount / Operation / Minus',
        'Minus',
        'text/secondary',
      ),
    ],
    amountParts('text/custom').concat(secondAmountParts),
  );
  assert.ok(
    independentAmounts.every(
      (entry) => entry.assessment?.verdict === 'expected',
    ),
    'Different Amount occurrences must not be compared with each other',
  );

  const partialAmountRecolor = rules.applySharedValueComponentRuleAssessments(
    [
      amountFillDiff(
        '🔒 AmountParagraph / Amount / Minor / Minor',
        'Minor',
        'text/secondary',
      ),
    ],
    amountParts('text/secondary'),
  );
  assert.equal(partialAmountRecolor[0].assessment?.verdict, 'violation');
  assert.equal(
    partialAmountRecolor[0].assessment?.ruleId,
    amountSharedColorRule.ruleId,
    'A partial Amount recolor must be an exact component-contract violation',
  );

  const amountRuleContext = scopedContext({
    actualNestedOwnerComponentKey: 'amount-paragraph-key',
    actualNestedOwnerPath: '🔒 AmountParagraph',
    actualNestedOwnerRelativePath: 'Amount / Major / Major',
  });
  const amountTextStyleDiff = scopedDiff(
    '🔒 AmountParagraph / Amount / Major / Major',
    'Major',
    'styles.text',
    amountRuleContext,
  );
  assert.equal(
    rules.findComponentContractViolationForDiff(amountTextStyleDiff)?.ruleId,
    amountTextStyleRule.ruleId,
    'A repeated wrapper/leaf name must still match the exact leaf selector',
  );

  const amountOpacityDiff = scopedDiff(
    '🔒 AmountParagraph / Amount / Minor',
    'Minor',
    'variant.Opacity',
    Object.assign({}, amountRuleContext, {
      actualNestedOwnerRelativePath: 'Amount / Minor',
    }),
  );
  assert.equal(
    rules.findComponentContractViolationForDiff(amountOpacityDiff)?.ruleId,
    amountOpacityRule.ruleId,
    'Minor opacity changes must be deterministic violations',
  );

  const amountSpacingDiff = scopedDiff(
    '🔒 AmountParagraph / Amount / Currency',
    'Currency',
    'layout.itemSpacing',
    Object.assign({}, amountRuleContext, {
      actualNestedOwnerRelativePath: 'Amount / Currency',
    }),
  );
  assert.equal(
    rules.findComponentContractViolationForDiff(amountSpacingDiff)?.ruleId,
    amountGeometryRule.ruleId,
    'Internal Amount geometry changes must use the effective baseline',
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

  const metadataWarnings = [];
  const metadataOnlyRule = {
    ruleId: 'component:web-corp.background-plate.background-plate-view-is-alias',
    severity: 'info',
    source: 'component-contract',
    appliesTo: 'component.identity|codeExport.*',
    checkType: 'deterministic',
    matchKind: 'exact_component_rule',
    target: {
      component: 'web-corp.background-plate',
      codeExports: ['BackgroundPlateView'],
      mapsTo: ['[D] BackgroundPlate'],
    },
    ruleText: 'BackgroundPlateView is a code alias.',
  };
  globalThis.__APOLLO_TEST_REMOTE_COMPONENT_RULE_REGISTRY__[1].rulesFile.rules.push(
    metadataOnlyRule,
  );
  console.warn = (...args) => metadataWarnings.push(args);
  try {
    rules.findComponentContractRulesForDiff(sectionRoot);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(
    metadataWarnings.length,
    0,
    'Metadata-only code export rules must be ignored before target parsing',
  );

  console.log('Component rule scope regression checks passed');
}

main();
