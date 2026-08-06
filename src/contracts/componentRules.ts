import type {
  DiffEntry,
  VariableModeEvidence,
} from '../structure/diff';
import type { DSStructureNode } from '../types/structures';
import {
  formatLayoutSizing,
  normalizeLayoutSizing,
  type LayoutSizingAxis,
} from '../structure/layoutSizing';
import { findComponent } from '../reference/library';
import { getRemoteComponentRuleRegistry } from './runtimeContractRegistry';

export type ComponentRuleTarget = {
  component?: string;
  components?: string[];
  componentKeys?: string[];
  componentNames?: string[];
  layer?: string;
  layers?: string[];
  slot?: string;
  slots?: string[];
};

export type ComponentContractRule = {
  ruleId: string;
  severity: string;
  source: string;
  ruleKind?: string;
  severityScope?: string;
  appliesTo: string;
  checkType?: string;
  matchKind?: string;
  changeScope?:
    | 'atomic'
    | 'component-context'
    | 'screen-context'
    | 'package-context';
  ruleText: string;
  remediation?: string;
  target?: ComponentRuleTarget;
  conditions?: {
    component?: string;
    components?: string[];
    variant?: Record<string, string | string[]>;
    variantProperty?: string;
    slot?: string;
    backgroundSurface?: string[];
  };
  classification?: {
    allPublicApiValuesAllowed?: boolean;
    doNotTreatRequiredTokenizedPaintAsViolation?: boolean;
    treatRawRequiredPaintAsViolation?: boolean;
    treatAsViolation?: boolean;
    resetSurface?: 'layer';
  };
  requiredTokenBinding?: {
    byType?: Record<
      string,
      {
        properties?: string[];
        tokenType?: string;
      }
    >;
  };
  requiredPaintState?: Record<string, string>;
  requiredVariant?: Record<string, string>;
  forbiddenVariant?: Record<string, string>;
  requiredVariantByContext?: Record<string, Record<string, string>>;
  requiredValues?: Record<string, string | number | boolean | null>;
  numericConstraint?: {
    minimum?: number;
    maximum?: number;
    recommended?: number;
  };
  requiredTokenSource?: {
    path?: string;
    collection?: string;
    tokenNames?: string[];
  };
  requiredConfiguration?: {
    manualPaddingAllowed?: boolean;
    manualItemSpacingAllowed?: boolean;
    itemSpacingVariable?: string;
    variableCollection?: string;
    desktopCollection?: string;
    mobileWebCollection?: string;
    allowedModes?: string[];
    prohibitedModes?: string[];
  };
};

type ComponentRulesFile = {
  componentKey: string;
  rules: ComponentContractRule[];
};

type ComponentRuleRegistryEntry = {
  componentKey: string;
  packageName?: string;
  aliases: string[];
  figmaKeys?: string[];
  rulesFile: ComponentRulesFile;
};

type ParsedRuleTarget = {
  componentSelectors: string[];
  componentKeySelectors: string[];
  componentNameSelectors: string[];
  layerSelectors: string[];
  slotSelectors: string[];
};

type DiffComponentIdentity = {
  key: string;
  name: string | null;
  kind: 'direct' | 'owner';
  relativePath: string | null;
};

export type VariableCollectionMetadata = {
  collectionId: string;
  collectionName: string | null;
  modeNames: Record<string, string>;
};

export type VariableCollectionMetadataResolver = (
  collectionId: string,
) => VariableCollectionMetadata | null;

declare global {
  var __APOLLO_TEST_COMPONENT_NAME_BY_KEY__:
    | Record<string, string>
    | undefined;
}

const SUPPORTED_TARGET_KEYS = new Set([
  'component',
  'components',
  'componentKeys',
  'componentNames',
  'layer',
  'layers',
  'slot',
  'slots',
]);
const reportedUnsupportedTargets = new Set<string>();

export function findComponentContractRulesForDiff(
  diff: DiffEntry,
): ComponentContractRule[] {
  const property = diff.details?.property ?? null;
  if (!property) {
    return [];
  }

  const result: ComponentContractRule[] = [];
  const ruleIds = new Set<string>();
  const registry = getComponentRuleRegistry();

  for (const entry of registry) {
    if (!diffTargetsComponent(diff, entry)) {
      continue;
    }

    const rules = Array.isArray(entry.rulesFile.rules)
      ? entry.rulesFile.rules
      : [];
    for (const rule of rules) {
      if (!isUsableRule(rule)) {
        continue;
      }
      if (!ruleMatchesDiff(rule, diff, property, entry)) {
        continue;
      }
      if (ruleIds.has(rule.ruleId)) continue;
      ruleIds.add(rule.ruleId);
      result.push(rule);
    }
  }

  return result;
}

export function findComponentContractViolationForDiff(
  diff: DiffEntry,
): ComponentContractRule | null {
  const rules = findComponentContractRulesForDiff(diff);
  for (const rule of rules) {
    if (
      rule.severity === 'error' &&
      (rule.ruleKind === 'design-rule' ||
        isDeterministicBindingViolation(rule, diff)) &&
      ruleConfirmsViolation(rule, diff)
    ) {
      return rule;
    }
  }
  return null;
}

function ruleConfirmsViolation(
  rule: ComponentContractRule,
  diff: DiffEntry,
): boolean {
  if (rule.requiredTokenBinding?.byType) {
    return requiredTokenBindingIsViolated(rule, diff);
  }
  if (rule.requiredPaintState) {
    return requiredPaintStateIsViolated(rule, diff);
  }
  return true;
}

function requiredTokenBindingIsViolated(
  rule: ComponentContractRule,
  diff: DiffEntry,
): boolean {
  const requirement = findRequiredTokenBinding(rule, diff);
  if (!requirement) return false;
  return !diffActualHasTokenBinding(diff);
}

function findRequiredTokenBinding(
  rule: ComponentContractRule,
  diff: DiffEntry,
): { properties?: string[]; tokenType?: string } | null {
  const variantProperties =
    diff.context.actualVariantProperties ??
    diff.context.referenceVariantProperties ??
    null;
  const type = variantProperties
    ? readCaseInsensitiveValue(variantProperties, 'Type')
    : null;
  if (!type) return null;

  const requirement = Object.entries(
    rule.requiredTokenBinding?.byType ?? {},
  ).find(([candidate]) =>
    normalizeVariantValue(candidate) === normalizeVariantValue(type),
  )?.[1];
  if (!requirement) return null;

  const property = normalizePaintProperty(diff.details?.property ?? '');
  const requiredProperties = (requirement.properties ?? []).map(
    normalizePaintProperty,
  );
  if (!property || !requiredProperties.includes(property)) {
    return null;
  }
  return requirement;
}

function requiredPaintStateIsViolated(
  rule: ComponentContractRule,
  diff: DiffEntry,
): boolean {
  const property = normalizePaintProperty(diff.details?.property ?? '');
  if (!property) return false;
  const expectedState = rule.requiredPaintState?.[property] ?? null;
  if (!expectedState) return false;

  const normalizedState = normalizeRuleValue(expectedState);
  if (normalizedState === 'effective-baseline') {
    return true;
  }
  if (
    normalizedState === 'none-or-not-visible' ||
    normalizedState === 'none' ||
    normalizedState === 'not-visible'
  ) {
    return diffActualHasVisiblePaint(diff);
  }
  if (
    normalizedState === 'visible-and-tokenized' ||
    normalizedState === 'tokenized'
  ) {
    return !diffActualHasVisiblePaint(diff) || !diffActualHasTokenBinding(diff);
  }
  return rule.classification?.treatAsViolation === true;
}

function normalizePaintProperty(property: string): string {
  const normalized = property.trim().toLowerCase();
  if (normalized === 'fill' || normalized === 'styles.fill') return 'fill';
  if (normalized === 'stroke' || normalized === 'styles.stroke') return 'stroke';
  return '';
}

function diffActualHasTokenBinding(diff: DiffEntry): boolean {
  const actual = diff.details?.actual;
  if (!actual) return false;
  if (typeof actual.bindingId === 'string' && actual.bindingId.trim()) {
    return true;
  }
  if (actual.resourceType === 'token' && actual.resourceId) {
    return true;
  }
  return diff.details?.bindingStatus === 'different-binding';
}

function diffActualHasVisiblePaint(diff: DiffEntry): boolean {
  const value = diff.details?.actual.value;
  if (value === null || value === undefined) return false;
  if (typeof value !== 'string') return true;
  const normalized = normalizeRuleValue(value);
  return ![
    '',
    'none',
    'not-visible',
    'hidden',
    'transparent',
  ].includes(normalized);
}

function isDeterministicBindingViolation(
  rule: ComponentContractRule,
  diff: DiffEntry,
): boolean {
  if (rule.checkType !== 'deterministic') return false;
  const bindingStatus = diff.details?.bindingStatus ?? null;
  if (bindingStatus !== 'unbound' && bindingStatus !== 'different-binding') {
    return false;
  }
  const property = diff.details?.property ?? '';
  if (
    property.startsWith('layout.padding.') ||
    property.startsWith('layout.paddingTokens.')
  ) {
    return rule.requiredConfiguration?.manualPaddingAllowed === false;
  }
  if (
    property === 'layout.itemSpacing' ||
    property === 'layout.itemSpacingToken'
  ) {
    return rule.requiredConfiguration?.manualItemSpacingAllowed === false;
  }
  return false;
}

export function hasRequiredComponentSizingRules(
  componentKey: string | null | undefined,
  componentNames: Array<string | null | undefined> = [],
): boolean {
  const normalizedKey = componentKey ?? '';
  const normalizedNames = componentNames
    .map((name) => normalizePathSegment(name ?? ''))
    .filter(Boolean);

  for (const entry of getComponentRuleRegistry()) {
    const matchesKey =
      normalizedKey === entry.componentKey ||
      (entry.figmaKeys ?? []).includes(normalizedKey);
    const matchesAlias = entry.aliases.some((alias) =>
      normalizedNames.includes(normalizePathSegment(alias)),
    );
    if (!matchesKey && !matchesAlias) continue;

    if (
      (entry.rulesFile.rules ?? []).some(
        (rule) =>
          isUsableRule(rule) &&
          (Boolean(
            readRequiredSizing(rule.requiredValues ?? {}, 'horizontal'),
          ) ||
            Boolean(
              readRequiredSizing(rule.requiredValues ?? {}, 'vertical'),
            )),
      )
    ) {
      return true;
    }
  }

  return false;
}

export function hasNumericConstraintRules(
  componentKey: string | null | undefined,
  componentNames: Array<string | null | undefined> = [],
): boolean {
  const normalizedKey = componentKey ?? '';
  const normalizedNames = componentNames
    .map((name) => normalizePathSegment(name ?? ''))
    .filter(Boolean);

  for (const entry of getComponentRuleRegistry()) {
    const matchesKey =
      normalizedKey === entry.componentKey ||
      (entry.figmaKeys ?? []).includes(normalizedKey);
    const matchesAlias = entry.aliases.some((alias) =>
      normalizedNames.includes(normalizePathSegment(alias)),
    );
    if (!matchesKey && !matchesAlias) continue;

    if (
      (entry.rulesFile.rules ?? []).some(
        (rule) =>
          isUsableRule(rule) &&
          Boolean(rule.numericConstraint) &&
          readNumericLayoutProperties(rule.appliesTo).length > 0,
      )
    ) {
      return true;
    }
  }

  return false;
}

export function hasVariableModeRules(
  componentKey: string | null | undefined,
  componentNames: Array<string | null | undefined> = [],
): boolean {
  const normalizedKey = componentKey ?? '';
  const normalizedNames = componentNames
    .map((name) => normalizePathSegment(name ?? ''))
    .filter(Boolean);

  for (const entry of getComponentRuleRegistry()) {
    const matchesKey =
      normalizedKey === entry.componentKey ||
      (entry.figmaKeys ?? []).includes(normalizedKey);
    const matchesAlias = entry.aliases.some((alias) =>
      normalizedNames.includes(normalizePathSegment(alias)),
    );
    if (!matchesKey && !matchesAlias) continue;
    if (
      (entry.rulesFile.rules ?? []).some((rule) => {
        const configuration = rule.requiredConfiguration;
        return (
          isUsableRule(rule) &&
          rule.severity === 'error' &&
          rule.checkType === 'deterministic' &&
          readVariableModeCollections(rule.appliesTo).length > 0 &&
          Boolean(
            configuration?.allowedModes?.length ||
              configuration?.prohibitedModes?.length,
          )
        );
      })
    ) {
      return true;
    }
  }
  return false;
}

export function applyRequiredComponentSizingAssessment(
  diff: DiffEntry,
): DiffEntry {
  const property = diff.details?.property ?? '';
  if (
    property !== 'layout.sizing.horizontal' &&
    property !== 'layout.sizing.vertical'
  ) {
    return diff;
  }

  const rules = findComponentContractRulesForDiff(diff);
  const rule = rules.find(
    (candidate) =>
      candidate.ruleKind === 'design-rule' &&
      candidate.severity === 'error' &&
      Boolean(candidate.requiredValues),
  );
  if (!rule) return diff;

  return Object.assign({}, diff, {
    assessment: createRuleViolationAssessment(rule),
  });
}

export function applyVariableBindingAssessment(diff: DiffEntry): DiffEntry {
  const bindingStatus = diff.details?.bindingStatus ?? null;
  if (bindingStatus !== 'unbound' && bindingStatus !== 'different-binding') {
    return diff;
  }
  const rule = findComponentContractViolationForDiff(diff);
  if (!rule) return diff;
  return Object.assign({}, diff, {
    assessment: createRuleViolationAssessment(rule),
  });
}

export function applyContextualComponentRuleAssessment(
  diff: DiffEntry,
): DiffEntry {
  if (diff.assessment?.verdict === 'violation') {
    return diff;
  }
  const property = diff.details?.property ?? '';
  const rules = findComponentContractRulesForDiff(diff);

  if (property.startsWith('variant.')) {
    for (const rule of rules) {
      const contextual = contextualVariantAssessment(rule, diff, property);
      if (contextual?.verdict === 'violation') {
        return Object.assign({}, diff, {assessment: contextual});
      }
    }
  }

  const structuredViolation = rules.find(
    (rule) =>
      rule.severity === 'error' &&
      rule.ruleKind === 'design-rule' &&
      Boolean(rule.requiredPaintState || rule.requiredTokenBinding) &&
      ruleConfirmsViolation(rule, diff),
  );
  if (structuredViolation) {
    const normalizedDiff = normalizeStructuredPaintViolation(
      diff,
      structuredViolation,
    );
    return Object.assign({}, normalizedDiff, {
      assessment: createRuleViolationAssessment(structuredViolation),
    });
  }

  if (diff.assessment?.verdict === 'expected') {
    return diff;
  }
  const paintRule = findComponentContractRulesForDiff(diff).find((rule) =>
    ruleExplicitlyAllowsPaintDiff(rule, diff),
  );
  if (paintRule) {
    return Object.assign({}, diff, {
      assessment: {
        verdict: 'expected' as const,
        source: 'component-contract' as const,
        reasonCode: 'component-contract-tokenized-paint',
        ruleId: paintRule.ruleId,
        message: paintRule.ruleText,
        remediation: null,
        presentation: 'show-expected' as const,
      },
    });
  }
  if (!property.startsWith('variant.')) return diff;

  for (const rule of rules) {
    const contextual = contextualVariantAssessment(rule, diff, property);
    if (contextual) {
      return Object.assign({}, diff, { assessment: contextual });
    }
  }
  for (const rule of rules) {
    if (rule.classification?.allPublicApiValuesAllowed === true) {
      return Object.assign({}, diff, {
        assessment: {
          verdict: 'allowed',
          source: 'component-contract',
          reasonCode: 'component-public-api-value',
          ruleId: rule.ruleId,
          message: rule.ruleText,
          remediation: null,
          presentation: 'show',
        },
      });
    }
  }
  return diff;
}

function normalizeStructuredPaintViolation(
  diff: DiffEntry,
  rule: ComponentContractRule,
): DiffEntry {
  const property = normalizePaintProperty(diff.details?.property ?? '');
  const expectedState = property
    ? rule.requiredPaintState?.[property] ?? null
    : null;
  if (!property || !expectedState || !isNoVisiblePaintState(expectedState)) {
    return diff;
  }
  const details = diff.details;
  if (!details) return diff;

  const actualValue =
    details.actual.displayName ??
    details.actual.binding?.name ??
    details.actual.value ??
    '—';
  return Object.assign({}, diff, {
    message: `${property === 'fill' ? 'заливка' : 'Обводка'}: — → ${actualValue}`,
    details: Object.assign({}, details, {
      reference: {value: null},
      // A forbidden paint is a layer-state violation, not a missing binding.
      bindingStatus: null,
    }),
  });
}

function ruleExplicitlyAllowsPaintDiff(
  rule: ComponentContractRule,
  diff: DiffEntry,
): boolean {
  if (findRequiredTokenBinding(rule, diff)) {
    return diffActualHasVisiblePaint(diff) && diffActualHasTokenBinding(diff);
  }

  const property = normalizePaintProperty(diff.details?.property ?? '');
  const expectedState = property
    ? rule.requiredPaintState?.[property] ?? null
    : null;
  if (!expectedState) return false;
  const normalizedState = normalizeRuleValue(expectedState);
  return (
    (normalizedState === 'visible-and-tokenized' ||
      normalizedState === 'tokenized') &&
    diffActualHasVisiblePaint(diff) &&
    diffActualHasTokenBinding(diff)
  );
}

export function createRequiredComponentSizingDiffs(
  actualNodes: DSStructureNode[],
  existingDiffs: DiffEntry[] = [],
): DiffEntry[] {
  if (!actualNodes.length) return [];

  const existingKeys = new Set(existingDiffs.map(makeDiffKey));
  const nodesById = new Map(actualNodes.map((node) => [node.id, node]));
  const result: DiffEntry[] = [];

  for (const node of actualNodes) {
    const owner = findNearestInstanceOwner(node, nodesById);
    const context = buildActualDiffContext(node, owner);

    for (const entry of getComponentRuleRegistry()) {
      for (const rule of entry.rulesFile.rules ?? []) {
        if (!isUsableRule(rule) || !rule.requiredValues) continue;

        for (const axis of ['horizontal', 'vertical'] as const) {
          const property = `layout.sizing.${axis}`;
          const expected = readRequiredSizing(rule.requiredValues, axis);
          const actual = normalizeLayoutSizing(node.layout?.sizing?.[axis] ?? null);
          if (!expected || !actual || expected === actual) continue;

          const diff: DiffEntry = {
            message: `${getSizingLabel(axis)}: ${formatLayoutSizing(expected)} → ${formatLayoutSizing(actual)}`,
            nodePath: node.path,
            nodeName: node.name,
            nodeId: node.nodeId,
            visible: node.visible,
            context,
            diffKind: 'layout',
            details: {
              property,
              reference: { value: formatLayoutSizing(expected) },
              actual: { value: formatLayoutSizing(actual) },
            },
            assessment: createRuleViolationAssessment(rule),
          };

          const key = makeDiffKey(diff);
          if (
            existingKeys.has(key) ||
            !diffTargetsComponent(diff, entry) ||
            !ruleMatchesDiff(rule, diff, property, entry)
          ) {
            continue;
          }
          existingKeys.add(key);
          result.push(diff);
        }
      }
    }
  }

  return result;
}

export function createRequiredPaintStateDiffs(
  actualNodes: DSStructureNode[],
  existingDiffs: DiffEntry[] = [],
  resolveTokenLabel?: (tokenId: string) => string | null,
): DiffEntry[] {
  if (!actualNodes.length) return [];

  const existingKeys = new Set(existingDiffs.map(makeDiffKey));
  const nodesById = new Map(actualNodes.map((node) => [node.id, node]));
  const result: DiffEntry[] = [];

  for (const node of actualNodes) {
    const owner = findNearestInstanceOwner(node, nodesById);
    const context = buildActualDiffContext(node, owner);

    for (const entry of getComponentRuleRegistry()) {
      for (const rule of entry.rulesFile.rules ?? []) {
        if (!isUsableRule(rule) || !rule.requiredPaintState) continue;

        for (const property of ['fill', 'stroke'] as const) {
          const expectedState = rule.requiredPaintState[property] ?? null;
          if (!expectedState || !isNoVisiblePaintState(expectedState)) continue;

          const actual = readActualPaintValue(
            node,
            property,
            resolveTokenLabel,
          );
          if (!actual) continue;

          const actualDisplayValue = actual.displayName ?? actual.value;

          const diff: DiffEntry = {
            message: `${property === 'fill' ? 'заливка' : 'Обводка'}: — → ${actualDisplayValue}`,
            nodePath: node.path,
            nodeName: node.name,
            nodeId: node.nodeId,
            visible: node.visible,
            context,
            diffKind: 'paint',
            details: {
              property,
              reference: {value: null},
              actual,
              bindingStatus: null,
            },
          };
          const key = makeDiffKey(diff);
          if (
            existingKeys.has(key) ||
            !diffTargetsComponent(diff, entry) ||
            !ruleMatchesDiff(rule, diff, property, entry) ||
            !requiredPaintStateIsViolated(rule, diff)
          ) {
            continue;
          }

          diff.assessment = createRuleViolationAssessment(rule);
          existingKeys.add(key);
          result.push(diff);
        }
      }
    }
  }

  return result;
}

function isNoVisiblePaintState(value: string): boolean {
  return [
    'none-or-not-visible',
    'none',
    'not-visible',
  ].includes(normalizeRuleValue(value));
}

function readActualPaintValue(
  node: DSStructureNode,
  property: 'fill' | 'stroke',
  resolveTokenLabel?: (tokenId: string) => string | null,
): NonNullable<DiffEntry['details']>['actual'] | null {
  const paint = property === 'fill' ? node.fill : node.stroke;
  const styleKey = node.styles?.[property]?.styleKey ?? null;
  if (paint?.token) {
    return {
      value: paint.token,
      resourceType: 'token',
      resourceId: paint.token,
      displayName: resolveTokenLabel?.(paint.token) ?? null,
      bindingId: paint.token,
    };
  }
  if (styleKey) {
    return {
      value: styleKey,
      resourceType: 'style',
      resourceId: styleKey,
    };
  }
  if (paint?.color) {
    return {
      value: paint.color,
      resourceType: 'color',
      resourceId: null,
    };
  }
  return null;
}

export function createNumericConstraintRuleDiffs(
  actualNodes: DSStructureNode[],
  existingDiffs: DiffEntry[] = [],
): DiffEntry[] {
  if (!actualNodes.length) return [];

  const existingKeys = new Set(existingDiffs.map(makeDiffKey));
  const nodesById = new Map(actualNodes.map((node) => [node.id, node]));
  const result: DiffEntry[] = [];

  for (const node of actualNodes) {
    const owner = findNearestInstanceOwner(node, nodesById);
    const context = buildActualDiffContext(node, owner);

    for (const entry of getComponentRuleRegistry()) {
      const rules = entry.rulesFile.rules ?? [];
      for (const rule of rules) {
        if (!isUsableRule(rule) || !rule.numericConstraint) continue;

        for (const property of readNumericLayoutProperties(rule.appliesTo)) {
          const actual = readNumericLayoutValue(node, property);
          if (actual === null) continue;

          const reference = findRecommendedNumericReference(rules, property) ??
            rule.numericConstraint.maximum ??
            rule.numericConstraint.minimum ??
            null;
          if (reference === null) continue;

          const diff: DiffEntry = {
            message: `${getNumericLayoutLabel(property)}: ${reference} → ${actual}`,
            nodePath: node.path,
            nodeName: node.name,
            nodeId: node.nodeId,
            visible: node.visible,
            context,
            diffKind: 'layout',
            details: {
              property,
              reference: { value: reference },
              actual: { value: actual },
            },
          };

          const key = makeDiffKey(diff);
          if (
            existingKeys.has(key) ||
            !diffTargetsComponent(diff, entry) ||
            !ruleMatchesDiff(rule, diff, property, entry)
          ) {
            continue;
          }

          const violation = findComponentContractViolationForDiff(diff);
          if (violation) {
            diff.assessment = createRuleViolationAssessment(violation);
          }
          existingKeys.add(key);
          result.push(diff);
        }
      }
    }
  }

  return result;
}

export function createVariableModeRuleDiffs(
  actualNodes: DSStructureNode[],
  existingDiffs: DiffEntry[] = [],
  resolveCollectionMetadata?: VariableCollectionMetadataResolver,
): DiffEntry[] {
  if (!actualNodes.length || !resolveCollectionMetadata) return [];
  const existingKeys = new Set(existingDiffs.map(makeDiffKey));
  const nodesById = new Map(actualNodes.map((node) => [node.id, node]));
  const result: DiffEntry[] = [];

  for (const node of actualNodes) {
    if (!node.componentInstance?.componentKey || !node.variableModes?.length) {
      continue;
    }
    const owner = findNearestInstanceOwner(node, nodesById);
    const context = buildActualDiffContext(node, owner);

    for (const entry of getComponentRuleRegistry()) {
      for (const rule of entry.rulesFile.rules ?? []) {
        if (
          !isUsableRule(rule) ||
          rule.severity !== 'error' ||
          rule.checkType !== 'deterministic'
        ) {
          continue;
        }
        const collectionNames = readVariableModeCollections(rule.appliesTo);
        const allowedModes = rule.requiredConfiguration?.allowedModes ?? [];
        const prohibitedModes =
          rule.requiredConfiguration?.prohibitedModes ?? [];
        if (
          !collectionNames.length ||
          (!allowedModes.length && !prohibitedModes.length)
        ) {
          continue;
        }

        for (const modeContext of node.variableModes) {
          const collection = resolveCollectionMetadata(
            modeContext.collectionId,
          );
          if (
            !collection?.collectionName ||
            !collectionNames.some(
              (name) =>
                normalizeRuleValue(name) ===
                normalizeRuleValue(collection.collectionName ?? ''),
            )
          ) {
            continue;
          }
          const modeId = modeContext.resolvedModeId;
          const modeName = modeId
            ? collection.modeNames[modeId] ?? null
            : null;
          if (!modeName) continue;
          const normalizedMode = normalizeRuleValue(modeName);
          const allowed = allowedModes.some(
            (mode) => normalizeRuleValue(mode) === normalizedMode,
          );
          const prohibited = prohibitedModes.some(
            (mode) => normalizeRuleValue(mode) === normalizedMode,
          );
          if (!prohibited && (!allowedModes.length || allowed)) {
            continue;
          }

          const property = `variables.${collection.collectionName}.mode`;
          const expected = allowedModes.length
            ? allowedModes.join(' | ')
            : `не ${prohibitedModes.join(' | ')}`;
          const variableMode = buildVariableModeEvidence(
            node,
            modeContext,
            collection,
          );
          const diff: DiffEntry = {
            message: `Mode ${collection.collectionName}: ${expected} → ${modeName}`,
            nodePath: node.path,
            nodeName: node.name,
            nodeId: node.nodeId,
            visible: node.visible,
            context,
            diffKind: 'other',
            details: {
              property,
              reference: { value: expected },
              actual: { value: modeName },
              variableMode,
            },
            assessment: createRuleViolationAssessment(rule),
          };
          const key = `${makeDiffKey(diff)}|${rule.ruleId}`;
          if (
            existingKeys.has(key) ||
            !diffTargetsComponent(diff, entry) ||
            !ruleMatchesDiff(rule, diff, property, entry)
          ) {
            continue;
          }
          existingKeys.add(key);
          result.push(diff);
        }
      }
    }
  }
  return result;
}

function readVariableModeCollections(appliesTo: string): string[] {
  const result: string[] = [];
  for (const part of appliesTo.split('|')) {
    const value = part.trim();
    if (!value.startsWith('variables.') || !value.endsWith('.mode')) {
      continue;
    }
    const collectionName = value.slice('variables.'.length, -'.mode'.length);
    if (collectionName) result.push(collectionName);
  }
  return result;
}

function readNumericLayoutProperties(appliesTo: string): string[] {
  const supported = new Set([
    'layout.width',
    'layout.height',
    'layout.minWidth',
    'layout.maxWidth',
    'layout.minHeight',
    'layout.maxHeight',
  ]);
  return appliesTo
    .split('|')
    .map((property) => property.trim())
    .filter((property) => supported.has(property));
}

function readNumericLayoutValue(
  node: DSStructureNode,
  property: string,
): number | null {
  const layout = node.layout ?? null;
  if (!layout) return null;
  if (property === 'layout.width') return layout.width ?? null;
  if (property === 'layout.height') return layout.height ?? null;
  if (property === 'layout.minWidth') return layout.minWidth ?? null;
  if (property === 'layout.maxWidth') return layout.maxWidth ?? null;
  if (property === 'layout.minHeight') return layout.minHeight ?? null;
  if (property === 'layout.maxHeight') return layout.maxHeight ?? null;
  return null;
}

function findRecommendedNumericReference(
  rules: ComponentContractRule[],
  property: string,
): number | null {
  for (const rule of rules) {
    if (
      rule.numericConstraint &&
      readNumericLayoutProperties(rule.appliesTo).includes(property) &&
      typeof rule.numericConstraint.recommended === 'number'
    ) {
      return rule.numericConstraint.recommended;
    }
  }
  return null;
}

function getNumericLayoutLabel(property: string): string {
  if (property === 'layout.width') return 'Ширина';
  if (property === 'layout.height') return 'Высота';
  if (property === 'layout.minWidth') return 'Минимальная ширина';
  if (property === 'layout.maxWidth') return 'Максимальная ширина';
  if (property === 'layout.minHeight') return 'Минимальная высота';
  if (property === 'layout.maxHeight') return 'Максимальная высота';
  return property;
}

function buildVariableModeEvidence(
  node: DSStructureNode,
  modeContext: NonNullable<DSStructureNode['variableModes']>[number],
  collection: VariableCollectionMetadata,
): VariableModeEvidence {
  const resolvedModeId = modeContext.resolvedModeId;
  const explicitModeId = modeContext.explicitModeId;
  const modeOwnerNodeId = modeContext.explicitOwnerNodeId;
  let modeSource: VariableModeEvidence['modeSource'] = 'unknown';
  if (modeOwnerNodeId && modeOwnerNodeId === node.nodeId) {
    modeSource = 'explicit';
  } else if (modeOwnerNodeId) {
    modeSource = 'inherited';
  } else if (resolvedModeId) {
    modeSource = 'resolved';
  }
  return {
    collectionId: collection.collectionId,
    collectionName: collection.collectionName,
    resolvedModeId,
    resolvedModeName: resolvedModeId
      ? collection.modeNames[resolvedModeId] ?? null
      : null,
    explicitModeId,
    explicitModeName: explicitModeId
      ? collection.modeNames[explicitModeId] ?? null
      : null,
    modeSource,
    modeOwnerNodeId,
    modeOwnerName: modeContext.explicitOwnerName,
    modeOwnerPath: modeContext.explicitOwnerPath,
  };
}

function normalizeRuleValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function createRuleViolationAssessment(
  rule: ComponentContractRule,
): NonNullable<DiffEntry['assessment']> {
  const resetSurface = rule.classification?.resetSurface;
  return {
    verdict: 'violation',
    source: 'component-contract',
    reasonCode: 'component-contract-violation',
    ruleId: rule.ruleId,
    evidence: resetSurface ? {resetSurface} : null,
    message: rule.ruleText,
    remediation: null,
    presentation: 'show',
  };
}

function makeDiffKey(diff: DiffEntry): string {
  return `${diff.nodeId ?? diff.nodePath}|${diff.details?.property ?? diff.message}`;
}

function findNearestInstanceOwner(
  node: DSStructureNode,
  nodesById: Map<number, DSStructureNode>,
): DSStructureNode | null {
  if (node.type === 'INSTANCE' && node.componentInstance?.componentKey) return node;
  let parentId = node.parentId;
  while (typeof parentId === 'number') {
    const parent = nodesById.get(parentId) ?? null;
    if (!parent) return null;
    if (parent.type === 'INSTANCE' && parent.componentInstance?.componentKey) {
      return parent;
    }
    parentId = parent.parentId;
  }
  return null;
}

function buildActualDiffContext(
  node: DSStructureNode,
  owner: DSStructureNode | null,
): DiffEntry['context'] {
  const isOwner = owner?.id === node.id;
  return {
    actualComponentKey: node.componentInstance?.componentKey ?? null,
    referenceComponentKey: null,
    referenceOrigin: 'host',
    actualNestedOwnerComponentKey: isOwner
      ? null
      : owner?.componentInstance?.componentKey ?? null,
    actualNestedOwnerPath: isOwner ? null : owner?.path ?? null,
    actualNestedOwnerRelativePath:
      !isOwner && owner ? getRelativePath(owner.path, node.path) : null,
    nestedOwnerComponentKey: null,
    nestedOwnerComponentRole: null,
    nestedOwnerPath: null,
    nestedOwnerRelativePath: null,
    actualVariantProperties:
      node.componentInstance?.variantProperties ??
      owner?.componentInstance?.variantProperties ??
      null,
    referenceVariantProperties: null,
  };
}

function getRelativePath(ownerPath: string, nodePath: string): string | null {
  const prefix = `${ownerPath} / `;
  return nodePath.startsWith(prefix) ? nodePath.slice(prefix.length) : null;
}

function readRequiredSizing(
  values: Record<string, string | number | boolean | null>,
  axis: LayoutSizingAxis,
) {
  const canonical = values[`layout.sizing.${axis}`];
  const alias =
    axis === 'horizontal'
      ? values.layoutSizingHorizontal
      : values.layoutSizingVertical;
  return normalizeLayoutSizing(
    typeof canonical === 'string'
      ? canonical
      : typeof alias === 'string'
        ? alias
        : null,
  );
}

function getSizingLabel(axis: LayoutSizingAxis): string {
  return axis === 'horizontal'
    ? 'Ширина в auto-layout'
    : 'Высота в auto-layout';
}

function getComponentRuleRegistry(): ComponentRuleRegistryEntry[] {
  return getRemoteComponentRuleRegistry() as ComponentRuleRegistryEntry[];
}

function isUsableRule(rule: ComponentContractRule): boolean {
  return Boolean(rule.ruleId && rule.appliesTo && rule.ruleText);
}

function diffTargetsComponent(
  diff: DiffEntry,
  entry: ComponentRuleRegistryEntry,
): boolean {
  const contextKeys = [
    diff.context.actualComponentKey,
    diff.context.referenceComponentKey,
    diff.context.nestedOwnerComponentKey,
    diff.context.actualNestedOwnerComponentKey,
  ].filter((key): key is string => Boolean(key));
  const figmaKeys = Array.isArray(entry.figmaKeys) ? entry.figmaKeys : [];
  if (contextKeys.length) {
    return contextKeys.some(
      (key) => key === entry.componentKey || figmaKeys.includes(key),
    );
  }

  const path = normalizePath(diff.nodePath);
  for (const alias of entry.aliases) {
    if (pathContainsSegment(path, normalizePathSegment(alias))) {
      return true;
    }
  }

  return false;
}

function ruleMatchesDiff(
  rule: ComponentContractRule,
  diff: DiffEntry,
  property: string,
  entry: ComponentRuleRegistryEntry,
): boolean {
  // Metadata-only rules must be rejected by their domain before parsing selectors
  // that are intentionally unsupported by the Figma property-diff evaluator.
  if (!appliesToMatchesDiff(rule.appliesTo, property, diff)) {
    return false;
  }
  const target = parseRuleTarget(rule);
  if (!target) {
    return false;
  }
  if (
    !parsedTargetHasSelectors(target) &&
    !targetlessRuleCanAttachToAtomicDiff(rule)
  ) {
    return false;
  }
  if (!numericConstraintMatchesDiff(rule.numericConstraint, diff)) {
    return false;
  }

  if (!requiredTokenEvidenceMatches(rule, diff)) {
    return false;
  }

  if (!variantConditionsMatchDiff(rule.conditions?.variant, diff)) {
    return false;
  }
  if (!contextConditionsMatchDiff(rule, diff, property)) {
    return false;
  }

  const identities = getDiffComponentIdentities(diff);
  const componentSelectors = target.componentSelectors.slice();
  if (
    !componentSelectors.length &&
    !target.componentKeySelectors.length &&
    !target.componentNameSelectors.length &&
    rule.conditions?.component
  ) {
    componentSelectors.push(rule.conditions.component);
  }

  const hasComponentSelector =
    componentSelectors.length > 0 ||
    target.componentKeySelectors.length > 0 ||
    target.componentNameSelectors.length > 0;
  const allowOwnerScope =
    target.slotSelectors.length > 0 ||
    target.layerSelectors.length > 0 ||
    ruleHasContextualVariantEvidence(rule);
  const scopedIdentities = getScopedIdentities(identities, allowOwnerScope);
  const matchingIdentities = scopedIdentities.filter((identity) => {
    if (!hasComponentSelector) {
      return identityBelongsToEntry(identity, entry);
    }
    return identityMatchesSelectors(
      identity,
      componentSelectors,
      target.componentKeySelectors,
      target.componentNameSelectors,
      entry,
    );
  });

  if (!matchingIdentities.length) {
    return false;
  }

  if (
    target.layerSelectors.length > 0 &&
    !targetSelectorsMatchDiff(
      target.layerSelectors,
      matchingIdentities,
      identities,
      diff,
    )
  ) {
    return false;
  }

  if (
    target.slotSelectors.length > 0 &&
    !targetSelectorsMatchDiff(
      target.slotSelectors,
      matchingIdentities,
      identities,
      diff,
    )
  ) {
    return false;
  }

  return true;
}

function numericConstraintMatchesDiff(
  constraint: ComponentContractRule['numericConstraint'],
  diff: DiffEntry,
): boolean {
  if (!constraint) return true;

  const actual = readNumericDiffValue(diff.details?.actual.value);
  if (actual === null) return false;

  const checks: boolean[] = [];
  if (typeof constraint.minimum === 'number') {
    checks.push(actual < constraint.minimum);
  }
  if (typeof constraint.maximum === 'number') {
    checks.push(actual > constraint.maximum);
  }
  if (typeof constraint.recommended === 'number') {
    checks.push(actual !== constraint.recommended);
  }
  return checks.length > 0 && checks.some(Boolean);
}

function readNumericDiffValue(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') return null;

  const normalized = value.trim().replace(',', '.');
  const match = normalized.match(/^(-?\d+(?:\.\d+)?)\s*(?:px)?$/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsedTargetHasSelectors(target: ParsedRuleTarget): boolean {
  return Boolean(
    target.componentSelectors.length ||
      target.componentKeySelectors.length ||
      target.componentNameSelectors.length ||
      target.layerSelectors.length ||
      target.slotSelectors.length,
  );
}

function targetlessRuleCanAttachToAtomicDiff(
  rule: ComponentContractRule,
): boolean {
  if (rule.changeScope === 'atomic') return true;
  if (
    rule.changeScope === 'component-context' ||
    rule.changeScope === 'screen-context' ||
    rule.changeScope === 'package-context'
  ) {
    return false;
  }
  if (rule.matchKind === 'composition_rule' && !ruleHasContextualVariantEvidence(rule)) {
    return false;
  }
  const appliesToParts = rule.appliesTo
    .split('|')
    .map((part) => part.trim().toLowerCase());
  if (
    appliesToParts.some(
      (part) =>
        part.startsWith('screen.') ||
        part === 'component.composition' ||
        part === 'screen.composition',
    ) && !ruleHasContextualVariantEvidence(rule)
  ) {
    return false;
  }
  return (
    rule.matchKind === 'exact_component_rule' ||
    rule.matchKind === 'exact_rule' ||
    rule.ruleKind === 'design-rule' ||
    Boolean(rule.checkType?.split('+').includes('deterministic'))
  );
}

function ruleHasContextualVariantEvidence(
  rule: ComponentContractRule,
): boolean {
  return Boolean(
    rule.requiredVariantByContext ||
      ((rule.requiredVariant || rule.forbiddenVariant) &&
        (rule.conditions?.backgroundSurface?.length ||
          rule.conditions?.components?.length ||
          rule.conditions?.slot)),
  );
}

function contextConditionsMatchDiff(
  rule: ComponentContractRule,
  diff: DiffEntry,
  property: string,
): boolean {
  const conditions = rule.conditions;
  if (conditions?.variantProperty) {
    const expectedProperty = conditions.variantProperty.startsWith('variant.')
      ? conditions.variantProperty
      : `variant.${conditions.variantProperty}`;
    if (expectedProperty !== property) return false;
  }

  const identities = getDiffComponentIdentities(diff);
  if (conditions?.components?.length) {
    const matchesComponent = conditions.components.some((selector) =>
      identities.some((identity) =>
        Boolean(
          identity.name &&
            normalizePathSegment(identity.name) ===
              normalizePathSegment(selector),
        ),
      ),
    );
    if (!matchesComponent) return false;
  }

  if (
    conditions?.slot &&
    !pathContainsQualifiedTarget(diff.nodePath, conditions.slot)
  ) {
    return false;
  }

  const surface = diff.context.surfaceContext?.kind ?? 'unknown';
  if (conditions?.backgroundSurface?.length) {
    if (
      surface === 'unknown' ||
      !conditions.backgroundSurface.some((candidate) =>
        surfaceSelectorMatches(candidate, surface),
      )
    ) {
      return false;
    }
  }
  if (rule.requiredVariantByContext && surface === 'unknown') {
    return false;
  }
  return true;
}

function contextualVariantAssessment(
  rule: ComponentContractRule,
  diff: DiffEntry,
  property: string,
): NonNullable<DiffEntry['assessment']> | null {
  const propertyName = property.slice('variant.'.length);
  const actualValue = diff.details?.actual.value;
  if (typeof actualValue !== 'string') return null;
  const surface = diff.context.surfaceContext?.kind ?? 'unknown';
  const requiredByContext = rule.requiredVariantByContext
    ? findSurfaceVariantRequirement(rule.requiredVariantByContext, surface)
    : null;
  const required = readCaseInsensitiveValue(
    requiredByContext ?? rule.requiredVariant ?? {},
    propertyName,
  );
  const forbidden = readCaseInsensitiveValue(
    rule.forbiddenVariant ?? {},
    propertyName,
  );
  const normalizedActual = normalizeVariantValue(actualValue);
  const isAllowed =
    required !== null && normalizeVariantValue(required) === normalizedActual;
  const isViolation =
    (required !== null && !isAllowed) ||
    (forbidden !== null && normalizeVariantValue(forbidden) === normalizedActual);

  if (!isAllowed && !isViolation) return null;
  if (isAllowed) {
    return {
      verdict: 'allowed',
      source: 'component-contract',
      reasonCode: 'contextual-variant-allowed',
      ruleId: rule.ruleId,
      message: rule.ruleText,
      remediation: null,
      presentation: 'show',
    };
  }

  const remediation =
    required !== null && diff.nodeId
      ? {
          kind: 'set-variant-properties' as const,
          nodeId: diff.nodeId,
          properties: { [propertyName]: required },
        }
      : null;
  return {
    verdict: 'violation',
    source: 'component-contract',
    reasonCode: 'contextual-variant-violation',
    ruleId: rule.ruleId,
    message: rule.ruleText,
    remediation,
    presentation: 'show',
  };
}

function findSurfaceVariantRequirement(
  requirements: Record<string, Record<string, string>>,
  surface: string,
): Record<string, string> | null {
  for (const [contextName, requirement] of Object.entries(requirements)) {
    if (surfaceSelectorMatches(contextName, surface)) {
      return requirement;
    }
  }
  return null;
}

function surfaceSelectorMatches(selector: string, surface: string): boolean {
  const normalized = normalizeRuleValue(selector);
  if (surface === 'white') {
    return (
      normalized.includes('white') ||
      normalized === 'base-bg' ||
      normalized.includes('base-bg (white)')
    );
  }
  if (surface === 'gray') {
    return (
      normalized.includes('gray') ||
      normalized.includes('grey') ||
      normalized.includes('neutral') ||
      normalized.includes('alt')
    );
  }
  if (surface === 'contrast') {
    return (
      normalized.includes('contrast') ||
      normalized.includes('inverse') ||
      normalized.includes('inverted')
    );
  }
  return false;
}

function parseRuleTarget(
  rule: ComponentContractRule,
): ParsedRuleTarget | null {
  const rawTarget = rule.target as Record<string, unknown> | undefined;
  if (typeof rawTarget === 'undefined') {
    return createEmptyParsedTarget();
  }
  if (
    !rawTarget ||
    typeof rawTarget !== 'object' ||
    Array.isArray(rawTarget)
  ) {
    reportUnsupportedTarget(rule, [], 'target must be an object');
    return null;
  }

  const keys = Object.keys(rawTarget);
  const unknownKeys = keys.filter((key) => !SUPPORTED_TARGET_KEYS.has(key));
  if (unknownKeys.length) {
    reportUnsupportedTarget(rule, unknownKeys, 'unsupported selector fields');
    return null;
  }

  const target = createEmptyParsedTarget();
  if (!readOptionalString(rawTarget, 'component', target.componentSelectors)) {
    reportUnsupportedTarget(rule, ['component'], 'invalid selector value');
    return null;
  }
  if (!readOptionalStrings(rawTarget, 'components', target.componentSelectors)) {
    reportUnsupportedTarget(rule, ['components'], 'invalid selector value');
    return null;
  }
  if (
    !readOptionalStrings(
      rawTarget,
      'componentKeys',
      target.componentKeySelectors,
    )
  ) {
    reportUnsupportedTarget(rule, ['componentKeys'], 'invalid selector value');
    return null;
  }
  if (
    !readOptionalStrings(
      rawTarget,
      'componentNames',
      target.componentNameSelectors,
    )
  ) {
    reportUnsupportedTarget(rule, ['componentNames'], 'invalid selector value');
    return null;
  }
  if (!readOptionalString(rawTarget, 'layer', target.layerSelectors)) {
    reportUnsupportedTarget(rule, ['layer'], 'invalid selector value');
    return null;
  }
  if (!readOptionalStrings(rawTarget, 'layers', target.layerSelectors)) {
    reportUnsupportedTarget(rule, ['layers'], 'invalid selector value');
    return null;
  }
  if (!readOptionalString(rawTarget, 'slot', target.slotSelectors)) {
    reportUnsupportedTarget(rule, ['slot'], 'invalid selector value');
    return null;
  }
  if (!readOptionalStrings(rawTarget, 'slots', target.slotSelectors)) {
    reportUnsupportedTarget(rule, ['slots'], 'invalid selector value');
    return null;
  }

  if (
    keys.length > 0 &&
    !target.componentSelectors.length &&
    !target.componentKeySelectors.length &&
    !target.componentNameSelectors.length &&
    !target.layerSelectors.length &&
    !target.slotSelectors.length
  ) {
    reportUnsupportedTarget(rule, keys, 'selectors must not be empty');
    return null;
  }

  return target;
}

function createEmptyParsedTarget(): ParsedRuleTarget {
  return {
    componentSelectors: [],
    componentKeySelectors: [],
    componentNameSelectors: [],
    layerSelectors: [],
    slotSelectors: [],
  };
}

function readOptionalString(
  target: Record<string, unknown>,
  key: string,
  result: string[],
): boolean {
  if (!Object.prototype.hasOwnProperty.call(target, key)) return true;
  const value = target[key];
  if (typeof value !== 'string' || !value.trim()) return false;
  result.push(value);
  return true;
}

function readOptionalStrings(
  target: Record<string, unknown>,
  key: string,
  result: string[],
): boolean {
  if (!Object.prototype.hasOwnProperty.call(target, key)) return true;
  const values = target[key];
  if (!Array.isArray(values) || !values.length) return false;
  for (const value of values) {
    if (typeof value !== 'string' || !value.trim()) return false;
    result.push(value);
  }
  return true;
}

function reportUnsupportedTarget(
  rule: ComponentContractRule,
  fields: string[],
  reason: string,
): void {
  const signature = `${rule.ruleId}|${reason}|${fields.slice().sort().join(',')}`;
  if (reportedUnsupportedTargets.has(signature)) return;
  reportedUnsupportedTargets.add(signature);
  console.warn('[Apollo][contracts] unsupported rule target', {
    ruleId: rule.ruleId,
    fields,
    reason,
  });
}

function getDiffComponentIdentities(diff: DiffEntry): DiffComponentIdentity[] {
  const identities: DiffComponentIdentity[] = [];
  addComponentIdentity(
    identities,
    diff.context.actualComponentKey,
    'direct',
    '',
  );
  addComponentIdentity(
    identities,
    diff.context.referenceComponentKey,
    'direct',
    '',
  );
  addComponentIdentity(
    identities,
    diff.context.actualNestedOwnerComponentKey,
    'owner',
    diff.context.actualNestedOwnerRelativePath,
  );
  addComponentIdentity(
    identities,
    diff.context.nestedOwnerComponentKey,
    'owner',
    diff.context.nestedOwnerRelativePath,
  );
  return identities;
}

function addComponentIdentity(
  identities: DiffComponentIdentity[],
  key: string | null,
  kind: 'direct' | 'owner',
  relativePath: string | null,
): void {
  if (!key) return;
  if (
    identities.some(
      (identity) =>
        identity.key === key &&
        identity.kind === kind &&
        identity.relativePath === relativePath,
    )
  ) {
    return;
  }
  identities.push({
    key,
    name: resolveComponentName(key),
    kind,
    relativePath,
  });
}

function resolveComponentName(key: string): string | null {
  const testName = globalThis.__APOLLO_TEST_COMPONENT_NAME_BY_KEY__?.[key];
  if (typeof testName === 'string' && testName.trim()) {
    return testName;
  }
  const component = findComponent(key);
  return component?.name ?? component?.displayName ?? component?.names?.[0] ?? null;
}

function getScopedIdentities(
  identities: DiffComponentIdentity[],
  allowOwnerScope: boolean,
): DiffComponentIdentity[] {
  const direct = identities.filter((identity) => identity.kind === 'direct');
  if (allowOwnerScope) {
    return identities;
  }
  return direct.length
    ? direct
    : identities.filter((identity) => identity.kind === 'owner');
}

function identityMatchesSelectors(
  identity: DiffComponentIdentity,
  componentSelectors: string[],
  componentKeySelectors: string[],
  componentNameSelectors: string[],
  entry: ComponentRuleRegistryEntry,
): boolean {
  if (componentKeySelectors.includes(identity.key)) {
    return true;
  }
  if (
    identity.name &&
    componentNameSelectors.some(
      (selector) =>
        normalizePathSegment(selector) === normalizePathSegment(identity.name ?? ''),
    )
  ) {
    return true;
  }
  return componentSelectors.some((selector) =>
    genericComponentSelectorMatchesIdentity(selector, identity, entry),
  );
}

function genericComponentSelectorMatchesIdentity(
  selector: string,
  identity: DiffComponentIdentity,
  entry: ComponentRuleRegistryEntry,
): boolean {
  const normalizedSelector = normalizePathSegment(selector);
  if (normalizePathSegment(entry.componentKey) === normalizedSelector) {
    return identityBelongsToEntry(identity, entry);
  }
  if (
    entry.packageName &&
    normalizePathSegment(entry.packageName) === normalizedSelector
  ) {
    return identityBelongsToEntry(identity, entry);
  }
  if (identity.key === selector) {
    return true;
  }
  if (
    identity.key === entry.componentKey &&
    entry.aliases.some(
      (alias) => normalizePathSegment(alias) === normalizedSelector,
    )
  ) {
    return true;
  }
  return Boolean(
    identity.name &&
      normalizePathSegment(identity.name) === normalizedSelector,
  );
}

function identityBelongsToEntry(
  identity: DiffComponentIdentity,
  entry: ComponentRuleRegistryEntry,
): boolean {
  const figmaKeys = Array.isArray(entry.figmaKeys) ? entry.figmaKeys : [];
  if (identity.key === entry.componentKey || figmaKeys.includes(identity.key)) {
    return true;
  }
  if (!identity.name) return false;
  const normalizedName = normalizePathSegment(identity.name);
  return entry.aliases.some(
    (alias) => normalizePathSegment(alias) === normalizedName,
  );
}

function targetSelectorsMatchDiff(
  selectors: string[],
  matchingIdentities: DiffComponentIdentity[],
  identities: DiffComponentIdentity[],
  diff: DiffEntry,
): boolean {
  const directIdentities = identities.filter(
    (identity) => identity.kind === 'direct',
  );
  const currentIdentities = directIdentities.length
    ? directIdentities
    : identities.filter((identity) => identity.kind === 'owner');
  const canonicalNames = currentIdentities
    .map((identity) => identity.name)
    .filter((name): name is string => Boolean(name));
  for (const selector of selectors) {
    if (normalizePathSegment(selector) === 'root') {
      if (matchingIdentities.some(identityIsRoot)) {
        return true;
      }
      continue;
    }
    if (
      layerMatchesDiff(
        selector,
        normalizePathSegment(diff.nodeName),
        diff.nodePath,
        canonicalNames,
      )
    ) {
      return true;
    }
  }
  return false;
}

function identityIsRoot(identity: DiffComponentIdentity): boolean {
  return identity.kind === 'direct' || identity.relativePath === '';
}

function requiredTokenEvidenceMatches(
  rule: ComponentContractRule,
  diff: DiffEntry,
): boolean {
  if (!rule.requiredTokenSource) return true;
  const actual = diff.details?.actual;
  if (!actual || !Object.prototype.hasOwnProperty.call(actual, 'bindingId')) {
    return false;
  }
  return !actual.bindingId;
}

function variantConditionsMatchDiff(
  conditions: Record<string, string | string[]> | undefined,
  diff: DiffEntry,
): boolean {
  if (!conditions || !Object.keys(conditions).length) {
    return true;
  }

  const properties =
    diff.context.actualVariantProperties ??
    diff.context.referenceVariantProperties ??
    null;
  if (!properties) {
    return false;
  }

  for (const [conditionName, expected] of Object.entries(conditions)) {
    const actual = readCaseInsensitiveValue(properties, conditionName);
    if (actual === null) {
      return false;
    }
    const expectedValues = Array.isArray(expected) ? expected : [expected];
    if (
      !expectedValues.some(
        (value) => normalizeVariantValue(value) === normalizeVariantValue(actual),
      )
    ) {
      return false;
    }
  }

  return true;
}

function readCaseInsensitiveValue(
  properties: Record<string, string>,
  target: string,
): string | null {
  const normalizedTarget = target.trim().toLowerCase();
  for (const [name, value] of Object.entries(properties)) {
    if (name.trim().toLowerCase() === normalizedTarget) {
      return value;
    }
  }
  return null;
}

function normalizeVariantValue(value: string): string {
  return value.trim().toLowerCase();
}

function appliesToMatchesDiff(
  ruleAppliesTo: string,
  property: string,
  diff: DiffEntry,
): boolean {
  const aliases = getPropertyAliases(property);
  const parts = ruleAppliesTo.split('|');
  for (const part of parts) {
    const trimmed = part.trim();
    if (aliases.includes(trimmed)) {
      return true;
    }
    if (trimmed.endsWith('.*')) {
      const target = trimmed.slice(0, -2);
      if (
        property.startsWith(`${target}.`) ||
        pathContainsQualifiedTarget(diff.nodePath, target)
      ) {
        return true;
      }
      continue;
    }
    if (trimmed.endsWith(`.${property}`)) {
      const target = trimmed.slice(0, -(property.length + 1));
      if (!target || pathContainsQualifiedTarget(diff.nodePath, target)) {
        return true;
      }
    }
  }
  return false;
}

function getPropertyAliases(property: string): string[] {
  if (property === 'layout.sizing.horizontal') {
    return [property, 'layoutSizingHorizontal'];
  }
  if (property === 'layout.sizing.vertical') {
    return [property, 'layoutSizingVertical'];
  }
  return [property];
}

function layerMatchesDiff(
  layer: string,
  normalizedNodeName: string,
  nodePath: string,
  canonicalComponentNames: string[] = [],
): boolean {
  const targetSegments = layer
    .split('/')
    .map((segment) => normalizePathSegment(segment))
    .filter(Boolean);
  if (!targetSegments.length) return true;
  const lastTarget = targetSegments[targetSegments.length - 1];

  const pathSegments = nodePath
    .split('/')
    .map((segment) => normalizePathSegment(segment))
    .filter(Boolean);
  let targetIndex = 0;
  for (let pathIndex = 0; pathIndex < pathSegments.length; pathIndex += 1) {
    const segment = pathSegments[pathIndex];
    if (segment === targetSegments[targetIndex]) {
      targetIndex += 1;
      if (targetIndex === targetSegments.length) {
        return pathIndex === pathSegments.length - 1;
      }
    }
  }

  // Consumer instances may be renamed, and aligned paths may replace the
  // library root with a variant segment. Component ownership has already been
  // verified by component key, so match a nested layer by its relative suffix.
  if (targetSegments.length > 1) {
    const relativeTarget = targetSegments.slice(1);
    if (relativeTarget.length <= pathSegments.length) {
      const pathSuffix = pathSegments.slice(-relativeTarget.length);
      return relativeTarget.every(
        (segment, index) => pathSuffix[index] === segment,
      );
    }
  }

  return (
    targetSegments.length === 1 &&
    (normalizedNodeName === lastTarget ||
      pathSegments[pathSegments.length - 1] === lastTarget ||
      canonicalComponentNames.some(
        (name) => normalizePathSegment(name) === lastTarget,
      ))
  );
}

function pathContainsQualifiedTarget(path: string, target: string): boolean {
  const normalizedTarget = normalizePath(target);
  if (!normalizedTarget) {
    return true;
  }
  const normalizedPath = normalizePath(path);
  if (normalizedTarget.includes('/')) {
    return normalizedPath.includes(normalizedTarget);
  }
  return pathContainsSegment(normalizedPath, normalizedTarget);
}

function pathContainsSegment(path: string, segment: string): boolean {
  const parts = path.split('/');
  for (const part of parts) {
    if (normalizePathSegment(part) === segment) {
      return true;
    }
  }
  return false;
}

function normalizePath(value: string): string {
  return value
    .split('/')
    .map((segment) => normalizePathSegment(segment))
    .join('/');
}

function normalizePathSegment(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
