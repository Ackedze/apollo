import type { DiffEntry, DiffValueDetails } from '../structure/diff';
import { formatStrokeAlignment } from '../structure/strokeAlignment';
import type { DSStructureNode } from '../types/structures';
import { formatLayoutSizing } from '../structure/layoutSizing';
import { buildOccurrenceKeyMap } from '../structure/occurrenceKeys';
import { getRemoteCompositionContractRegistry } from './runtimeContractRegistry';

export const APOLLO_CONTRACT_AWARE_AUDIT_ENABLED = true;

type CompositionAllowedOverride = {
  targetPathPattern?: string;
  property?: string;
  expectedOverride?: string | number | null;
  scope?: string;
  reason?: string;
};

type CompositionContract = {
  componentKey?: string;
  component?: {
    name?: string;
    library?: string;
  };
  allowedOverrides?: CompositionAllowedOverride[];
  standaloneBaselines?: Array<{
    targetPathPattern?: string;
    property?: string;
    expectedValue?: string | number | null;
    styleKey?: string | null;
    scope?: string;
  }>;
  compositionPolicy?: {
    singleIcon?: {
      enabledBy?: string;
      requiredPosition?: string;
      minimumButtonCount?: number;
    };
  };
};

type ContractRegistryEntry = {
  contract: CompositionContract;
  aliases: string[];
  companionContracts?: CompositionContract[];
};

export type ContractAwareDiffResult = {
  diffs: DiffEntry[];
  applied: boolean;
  suppressedCount: number;
  rebasedCount: number;
  matchedContractKeys: string[];
};

export function applyContractAwareDiffs(
  diffs: DiffEntry[],
  options: {
    enabled: boolean;
    hostComponentKey: string | null;
    hostComponentName: string | null;
    actualStructure: DSStructureNode[];
    hostReference: DSStructureNode[];
    resolveStyleLabel?: (styleKey: string) => string | null;
    resolveTokenLabel?: (tokenId: string) => string | null;
  },
): ContractAwareDiffResult {
  const emptyResult = {
    diffs,
    applied: false,
    suppressedCount: 0,
    rebasedCount: 0,
    matchedContractKeys: [],
  };

  if (!options.enabled || !diffs.length) {
    return emptyResult;
  }

  const contract = resolveCompositionContract(options.hostComponentName);
  if (!contract) {
    return emptyResult;
  }

  const allowedOverrides = Array.isArray(contract.allowedOverrides)
    ? contract.allowedOverrides
    : [];

  const hostReferenceByOccurrence = buildNodeByOccurrenceMap(options.hostReference);
  const actualByOccurrence = buildNodeByOccurrenceMap(options.actualStructure);
  const actualOccurrenceKeys = buildOccurrenceKeyMap(options.actualStructure);
  const output: DiffEntry[] = [];
  let suppressedCount = 0;
  let rebasedCount = 0;

  for (const diff of diffs) {
    if (isProtectedContractAssessment(diff)) {
      output.push(diff);
      continue;
    }
    const property = diff.details?.property ?? null;
    const rule = findAllowedOverrideRule(diff, property, allowedOverrides, contract);
    const linkedVariantBaseline = resolveLinkedVariantBaseline(
      diff,
      property,
      contract,
      options.actualStructure,
      actualByOccurrence,
      actualOccurrenceKeys,
    );
    const expectedBaseline = linkedVariantBaseline ?? (rule
      ? resolveExpectedBaseline(rule, diff, {
          hostReferenceByOccurrence,
          actualByOccurrence,
          resolveStyleLabel: options.resolveStyleLabel,
          resolveTokenLabel: options.resolveTokenLabel,
        })
      : resolveContractEffectiveBaseline(diff, property, {
          contract,
          hostReferenceByOccurrence,
          actualByOccurrence,
          resolveStyleLabel: options.resolveStyleLabel,
          resolveTokenLabel: options.resolveTokenLabel,
        }));

    if (!expectedBaseline || property === null) {
      output.push(diff);
      continue;
    }

    const actualValue = diff.details?.actual?.value ?? null;

    if (valuesEqual(actualValue, expectedBaseline.value)) {
      suppressedCount += 1;
      continue;
    }

    output.push(rebaseDiffReference(diff, property, expectedBaseline, rule));
    rebasedCount += 1;
  }

  return {
    diffs: output,
    applied: suppressedCount > 0 || rebasedCount > 0,
    suppressedCount,
    rebasedCount,
    matchedContractKeys: getMatchedContractKeys(contract),
  };
}

function isProtectedContractAssessment(diff: DiffEntry): boolean {
  if (diff.assessment?.source === 'component-contract' &&
      diff.assessment.verdict === 'violation') {
    return true;
  }
  return diff.assessment?.reasonCode === 'composition-contract-expected';
}

function resolveLinkedVariantBaseline(
  diff: DiffEntry,
  property: string | null,
  contract: CompositionContract,
  actualStructure: DSStructureNode[],
  actualByOccurrence: Map<string, DSStructureNode>,
  occurrenceKeys: Map<DSStructureNode, string>,
): DiffValueDetails | null {
  if (property !== 'variant.SingleIcon') {
    return null;
  }

  const policy = contract.compositionPolicy?.singleIcon;
  if (!policy?.enabledBy) {
    return null;
  }

  const linkedCondition = parseVariantCondition(policy.enabledBy);
  if (!linkedCondition) {
    return null;
  }

  const occurrenceKey = findOccurrenceKeyForDiff(diff, actualByOccurrence);
  const actualNode = occurrenceKey
    ? actualByOccurrence.get(occurrenceKey) ?? null
    : null;
  if (!actualNode || !variantConditionIsEnabled(diff, actualStructure, linkedCondition)) {
    return null;
  }

  const siblings = actualStructure.filter((node) => {
    if (node.visible === false || node.parentId !== actualNode.parentId) {
      return false;
    }
    return readCaseInsensitiveProperty(
      node.componentInstance?.variantProperties ?? null,
      'SingleIcon',
    ) !== null;
  });
  const minimumButtonCount = policy.minimumButtonCount ?? 1;
  if (siblings.length < minimumButtonCount) {
    return null;
  }

  if (normalizeComparableValue(policy.requiredPosition ?? '') === 'last') {
    const lastSibling = siblings[siblings.length - 1] ?? null;
    if (!lastSibling || occurrenceKeys.get(lastSibling) !== occurrenceKey) {
      return null;
    }
  }

  return { value: 'True' };
}

function parseVariantCondition(
  value: string,
): { property: string; value: string } | null {
  const separator = value.indexOf('=');
  if (separator <= 0 || separator >= value.length - 1) {
    return null;
  }
  const property = value.slice(0, separator).trim();
  const expectedValue = value.slice(separator + 1).trim();
  if (!property || !expectedValue) {
    return null;
  }
  return { property, value: expectedValue };
}

function variantConditionIsEnabled(
  diff: DiffEntry,
  actualStructure: DSStructureNode[],
  condition: { property: string; value: string },
): boolean {
  const ownerPath = diff.context.actualNestedOwnerPath ?? null;
  for (const node of actualStructure) {
    if (ownerPath && node.path !== ownerPath) {
      continue;
    }
    const actualValue = readCaseInsensitiveProperty(
      node.componentInstance?.variantProperties ?? null,
      condition.property,
    );
    if (actualValue !== null && valuesEqual(actualValue, condition.value)) {
      return true;
    }
  }

  const path = ownerPath ?? diff.nodePath;
  const rootSegment = normalizePath(path).split(' / ')[0] ?? '';
  for (const part of rootSegment.split(',')) {
    const parsed = parseVariantCondition(part.trim());
    if (
      parsed &&
      normalizeComparableValue(parsed.property) ===
        normalizeComparableValue(condition.property) &&
      valuesEqual(parsed.value, condition.value)
    ) {
      return true;
    }
  }
  return false;
}

function resolveCompositionContract(hostComponentName: string | null): CompositionContract | null {
  const normalizedName = normalizeComponentName(hostComponentName);
  const registry = getContractRegistry();

  for (const entry of registry) {
    const contractName = normalizeComponentName(entry.contract.component?.name ?? '');
    if (normalizedName === contractName) {
      return entry.contract;
    }

    for (const alias of entry.aliases) {
      if (normalizedName === normalizeComponentName(alias)) {
        return entry.contract;
      }
    }
  }

  return null;
}

function getContractRegistry(): ContractRegistryEntry[] {
  return getRemoteCompositionContractRegistry() as ContractRegistryEntry[];
}

function findAllowedOverrideRule(
  diff: DiffEntry,
  property: string | null,
  rules: CompositionAllowedOverride[],
  contract: CompositionContract,
): CompositionAllowedOverride | null {
  if (!property) {
    return null;
  }

  const nodePath = diff.nodePath;
  const relativeNodePath = stripRootPathSegment(nodePath);

  for (const rule of rules) {
    if (rule.property !== property || !rule.targetPathPattern) {
      continue;
    }

    if (pathMatchesPattern(relativeNodePath, rule.targetPathPattern)) {
      return rule;
    }
  }

  return findTabsViewCoreTabsAliasRule(diff, property, contract);
}

function findTabsViewCoreTabsAliasRule(
  diff: DiffEntry,
  property: string,
  contract: CompositionContract,
): CompositionAllowedOverride | null {
  if (!isTabsViewContract(contract)) {
    return null;
  }

  const coreTabsContract = findCoreTabsContract();
  const standaloneBaselines = coreTabsContract?.standaloneBaselines ?? [];
  const normalizedPath = normalizePath(diff.nodePath);
  const normalizedNodeName = normalizePathSegment(diff.nodeName);

  for (const baseline of standaloneBaselines) {
    if (baseline.property !== property || !baseline.targetPathPattern) {
      continue;
    }

    const baselinePattern = normalizePath(baseline.targetPathPattern);
    const matchesAlias =
      isTabPrimaryDiff(normalizedPath, normalizedNodeName, baselinePattern) ||
      isTabPrimaryLabelDiff(normalizedPath, normalizedNodeName, baselinePattern);
    if (!matchesAlias) {
      continue;
    }

    const hostRule = findAllowedOverrideForBaseline(
      contract.allowedOverrides ?? [],
      property,
      baselinePattern,
    );
    if (hostRule) {
      return {
        targetPathPattern: diff.nodePath,
        property,
        expectedOverride: hostRule.expectedOverride,
        scope: hostRule.scope,
        reason: hostRule.reason,
      };
    }
  }

  return null;
}

function findAllowedOverrideForBaseline(
  rules: CompositionAllowedOverride[],
  property: string,
  baselinePattern: string,
): CompositionAllowedOverride | null {
  for (const rule of rules) {
    if (rule.property !== property || !rule.targetPathPattern) {
      continue;
    }
    const normalizedRulePattern = normalizePath(rule.targetPathPattern);
    if (
      normalizedRulePattern === baselinePattern ||
      normalizedRulePattern.endsWith(` / ${baselinePattern}`) ||
      baselinePattern.endsWith(` / ${normalizedRulePattern}`)
    ) {
      return rule;
    }
  }
  return null;
}

function findCoreTabsContract(): CompositionContract | null {
  const registry = getContractRegistry();
  for (const entry of registry) {
    const contract = entry.contract;
    if (
      contract.componentKey === 'web-core-navigation.tabs' ||
      normalizeComponentName(contract.component?.name ?? '') === 'tabs'
    ) {
      return contract;
    }
  }
  return null;
}

function resolveExpectedBaseline(
  rule: CompositionAllowedOverride,
  diff: DiffEntry,
  options: {
    hostReferenceByOccurrence: Map<string, DSStructureNode>;
    actualByOccurrence: Map<string, DSStructureNode>;
    resolveStyleLabel?: (styleKey: string) => string | null;
    resolveTokenLabel?: (tokenId: string) => string | null;
  },
): DiffValueDetails | null {
  const property = rule.property ?? '';
  const occurrenceKey = findOccurrenceKeyForDiff(diff, options.actualByOccurrence);
  const hostReferenceNode = occurrenceKey
    ? options.hostReferenceByOccurrence.get(occurrenceKey) ?? null
    : null;
  const fromHostReference = hostReferenceNode
    ? readNodePropertyAsDiffValue(
        hostReferenceNode,
        property,
        options.resolveStyleLabel,
        options.resolveTokenLabel,
      )
    : null;
  const expected = rule.expectedOverride ?? null;

  if (fromHostReference) {
    if (expected === null || expected === undefined) {
      return fromHostReference;
    }
    if (valuesEqual(fromHostReference.value, expected)) {
      return fromHostReference;
    }
    if (property === 'styles.text') {
      return {
        value: expected,
        resourceType: 'style',
        resourceId: null,
        displayName: String(expected),
      };
    }

    return fromHostReference;
  }

  if (expected === null || expected === undefined) {
    return null;
  }

  if (property === 'styles.text') {
    return {
      value: expected,
      resourceType: 'style',
      resourceId: null,
      displayName: String(expected),
    };
  }

  return {
    value: expected,
  };
}

function resolveContractEffectiveBaseline(
  diff: DiffEntry,
  property: string | null,
  options: {
    contract: CompositionContract;
    hostReferenceByOccurrence: Map<string, DSStructureNode>;
    actualByOccurrence: Map<string, DSStructureNode>;
    resolveStyleLabel?: (styleKey: string) => string | null;
    resolveTokenLabel?: (tokenId: string) => string | null;
  },
): DiffValueDetails | null {
  if (!property) {
    return null;
  }

  const referenceDetails = diff.details?.reference ?? null;
  const occurrenceKey = findOccurrenceKeyForDiff(diff, options.actualByOccurrence);
  const hostReferenceNode = occurrenceKey
    ? options.hostReferenceByOccurrence.get(occurrenceKey) ?? null
    : null;
  if (!hostReferenceNode) {
    return null;
  }

  const hostBaseline = readNodePropertyAsDiffValue(
    hostReferenceNode,
    property,
    options.resolveStyleLabel,
    options.resolveTokenLabel,
  );
  if (!hostBaseline || diffValueDetailsEqual(hostBaseline, referenceDetails)) {
    return null;
  }

  return hostBaseline;
}

function diffValueDetailsEqual(
  left: DiffValueDetails,
  right: DiffValueDetails | null,
): boolean {
  if (!right) {
    return false;
  }

  if (
    left.resourceType &&
    left.resourceType === right.resourceType &&
    left.resourceId &&
    right.resourceId &&
    canonicalResourceIdentity(left.resourceType, left.resourceId) ===
      canonicalResourceIdentity(right.resourceType, right.resourceId)
  ) {
    return true;
  }

  return valuesEqual(left.value, right.value);
}

function canonicalResourceIdentity(
  resourceType: NonNullable<DiffValueDetails['resourceType']>,
  resourceId: string,
): string {
  const normalized = resourceId.trim();
  if (resourceType === 'style' && normalized.startsWith('S:')) {
    return normalized.slice(2).split(',')[0].trim();
  }
  if (resourceType === 'token' && normalized.startsWith('VariableID:')) {
    return normalized.slice('VariableID:'.length).split('/')[0].trim();
  }
  return normalized;
}

function readNodePropertyAsDiffValue(
  node: DSStructureNode,
  property: string,
  resolveStyleLabel?: (styleKey: string) => string | null,
  resolveTokenLabel?: (tokenId: string) => string | null,
): DiffValueDetails | null {
  if (property.indexOf('variant.') === 0) {
    const propertyName = property.slice('variant.'.length);
    const properties = node.componentInstance?.variantProperties ?? null;
    const value = readCaseInsensitiveProperty(properties, propertyName);
    return value !== null ? { value } : null;
  }

  if (property === 'layout.itemSpacing') {
    const value = node.layout?.itemSpacing ?? null;
    return typeof value === 'number' ? { value } : null;
  }
  if (property === 'layout.sizing.horizontal') {
    const value = node.layout?.sizing?.horizontal ?? null;
    return value ? { value: formatLayoutSizing(value) } : null;
  }
  if (property === 'layout.sizing.vertical') {
    const value = node.layout?.sizing?.vertical ?? null;
    return value ? { value: formatLayoutSizing(value) } : null;
  }

  if (property === 'styles.text') {
    const styleKey = node.styles?.text?.styleKey ?? null;
    if (!styleKey) {
      return null;
    }

    const displayName = resolveStyleLabel ? resolveStyleLabel(styleKey) || styleKey : styleKey;
    return {
      value: displayName,
      resourceType: 'style',
      resourceId: styleKey,
      displayName,
    };
  }

  if (property === 'fill') {
    const token = node.fill?.token ?? null;
    if (token) {
      const displayName = resolveTokenLabel?.(token) ?? token;
      return {
        value: token,
        resourceType: 'token',
        resourceId: token,
        displayName,
      };
    }
    const color = node.fill?.color ?? null;
    return color ? { value: color, resourceType: 'color', displayName: color } : null;
  }

  if (property === 'stroke') {
    const token = node.stroke?.token ?? null;
    if (token) {
      const displayName = resolveTokenLabel?.(token) ?? token;
      return {
        value: token,
        resourceType: 'token',
        resourceId: token,
        displayName,
      };
    }
    const color = node.stroke?.color ?? null;
    return color ? { value: color, resourceType: 'color', displayName: color } : null;
  }

  if (property === 'stroke.align') {
    const align = node.stroke?.align ?? null;
    return align ? { value: formatStrokeAlignment(align) } : null;
  }

  if (property === 'opacity') {
    const value = node.opacity ?? null;
    return typeof value === 'number' ? { value } : null;
  }

  return null;
}

function readCaseInsensitiveProperty(
  properties: Record<string, string> | null,
  propertyName: string,
): string | null {
  if (!properties) {
    return null;
  }

  const normalizedTarget = propertyName.toLowerCase();
  for (const key of Object.keys(properties)) {
    if (key.toLowerCase() === normalizedTarget) {
      return properties[key] ?? null;
    }
  }

  return null;
}

function rebaseDiffReference(
  diff: DiffEntry,
  property: string,
  reference: DiffValueDetails,
  rule: CompositionAllowedOverride | null,
): DiffEntry {
  const actual = diff.details?.actual ?? { value: null };
  const details = Object.assign({}, diff.details, {
    property,
    reference,
    actual,
  });

  return Object.assign({}, diff, {
    message: formatRebasedMessage(diff, reference, actual),
    details,
    suppressionReason:
      rule?.reason ??
      'Apollo contract applied an effective baseline for wrapper-owned nested property',
  });
}

function formatRebasedMessage(
  diff: DiffEntry,
  reference: DiffValueDetails,
  actual: DiffValueDetails,
): string {
  const property = diff.details?.property ?? '';
  const label = getPropertyDisplayLabel(property);
  return `${label}: ${formatDiffValue(reference)} → ${formatDiffValue(actual)}`;
}

function formatDiffValue(value: DiffValueDetails): string {
  return formatValue(value.displayName ?? value.value);
}

function getPropertyDisplayLabel(property: string): string {
  if (property === 'layout.itemSpacing') {
    return 'Отступ между элементами';
  }
  if (property === 'layout.sizing.horizontal') {
    return 'Ширина в auto-layout';
  }
  if (property === 'layout.sizing.vertical') {
    return 'Высота в auto-layout';
  }
  if (property === 'styles.text') {
    return 'Стиль текст';
  }
  if (property === 'stroke.align') {
    return 'Положение обводки';
  }
  if (property.indexOf('variant.') === 0) {
    const propertyName = property.slice('variant.'.length);
    return propertyName.charAt(0).toLowerCase() + propertyName.slice(1);
  }
  return property || 'Параметр';
}

function buildNodeByOccurrenceMap(nodes: DSStructureNode[]): Map<string, DSStructureNode> {
  const occurrenceKeys = buildOccurrenceKeyMap(nodes);
  const map = new Map<string, DSStructureNode>();

  for (const node of nodes) {
    const occurrenceKey = occurrenceKeys.get(node) ?? node.path;
    map.set(occurrenceKey, node);

    // The plain path is the key of the first visible occurrence. Do not let
    // later siblings with the same path overwrite that alias.
    if (!map.has(node.path)) {
      map.set(node.path, node);
    }
  }

  return map;
}

function findOccurrenceKeyForDiff(
  diff: DiffEntry,
  actualByOccurrence: Map<string, DSStructureNode>,
): string | null {
  if (actualByOccurrence.has(diff.nodePath)) {
    return diff.nodePath;
  }

  const stripped = stripRootPathSegment(diff.nodePath);
  if (actualByOccurrence.has(stripped)) {
    return stripped;
  }

  for (const key of actualByOccurrence.keys()) {
    if (stripRootPathSegment(key) === stripped) {
      return key;
    }
  }

  for (const key of actualByOccurrence.keys()) {
    const strippedKey = stripRootPathSegment(key);
    if (strippedKey.endsWith(` / ${stripped}`) || key.endsWith(` / ${diff.nodePath}`)) {
      return key;
    }
  }

  return null;
}

function pathMatchesPattern(path: string, pattern: string): boolean {
  const normalizedPath = normalizePath(path);
  const normalizedPattern = normalizePath(pattern);

  return (
    normalizedPath === normalizedPattern ||
    normalizedPath.endsWith(` / ${normalizedPattern}`)
  );
}

function isTabsViewContract(contract: CompositionContract): boolean {
  return normalizeComponentName(contract.component?.name ?? '') === 'tabsview';
}

function getMatchedContractKeys(contract: CompositionContract): string[] {
  const keys = [contract.componentKey ?? 'unknown'];
  const registry = getContractRegistry();

  for (const entry of registry) {
    if (entry.contract === contract && entry.companionContracts) {
      for (const companion of entry.companionContracts) {
        keys.push(companion.componentKey ?? 'unknown');
      }
    }
  }

  if (isTabsViewContract(contract)) {
    const coreTabsContract = findCoreTabsContract();
    const coreTabsKey = coreTabsContract?.componentKey ?? null;
    if (coreTabsKey && !keys.includes(coreTabsKey)) {
      keys.push(coreTabsKey);
    }
  }

  return keys;
}

function isTabPrimaryDiff(
  path: string,
  nodeName: string,
  baselinePattern: string,
): boolean {
  if (!normalizePath(baselinePattern).endsWith('TabPrimary')) {
    return false;
  }

  return nodeName === 'TabPrimary' || path.endsWith(' / TabPrimary') || path === 'TabPrimary';
}

function isTabPrimaryLabelDiff(
  path: string,
  nodeName: string,
  baselinePattern: string,
): boolean {
  const normalizedBaseline = normalizePath(baselinePattern);
  if (!normalizedBaseline.endsWith('TabPrimary / Content / Label')) {
    return false;
  }

  return (
    nodeName === 'Label' &&
    (
      path === 'Label' ||
      path.endsWith(' / Label') ||
      path.includes('TabPrimary / Content / Label')
    )
  );
}

function normalizePathSegment(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

function stripRootPathSegment(path: string): string {
  const segments = normalizePath(path).split(' / ');
  if (segments.length <= 1) {
    return normalizePath(path);
  }

  return segments.slice(1).join(' / ');
}

function normalizePath(path: string): string {
  return String(path ?? '')
    .split(' / ')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join(' / ');
}

function normalizeComponentName(name: string | null): string {
  return String(name ?? '')
    .replace(/\[[DM]\]/gi, '')
    .replace(/[^a-zа-я0-9]/gi, '')
    .toLowerCase();
}

function valuesEqual(left: string | number | null, right: string | number | null): boolean {
  if (left === right) {
    return true;
  }
  if (left === null || right === null) {
    return false;
  }

  if (typeof left === 'number' || typeof right === 'number') {
    return Number(left) === Number(right);
  }

  return normalizeComparableValue(String(left)) === normalizeComparableValue(String(right));
}

function normalizeComparableValue(value: string): string {
  return value
    .replace(/-/g, '–')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function formatValue(value: string | number | null): string {
  return value === null || value === undefined ? '—' : String(value);
}
