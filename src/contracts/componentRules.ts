import type { DiffEntry } from '../structure/diff';
import type { DSStructureNode } from '../types/structures';
import {
  formatLayoutSizing,
  normalizeLayoutSizing,
  type LayoutSizingAxis,
} from '../structure/layoutSizing';
import { getRemoteComponentRuleRegistry } from './runtimeContractRegistry';

export type ComponentContractRule = {
  ruleId: string;
  severity: string;
  source: string;
  ruleKind?: string;
  severityScope?: string;
  appliesTo: string;
  checkType?: string;
  matchKind?: string;
  ruleText: string;
  remediation?: string;
  target?: {
    component?: string;
    layers?: string[];
  };
  conditions?: {
    component?: string;
    variant?: Record<string, string | string[]>;
  };
  requiredValues?: Record<string, string | number | boolean | null>;
};

type ComponentRulesFile = {
  componentKey: string;
  rules: ComponentContractRule[];
};

type ComponentRuleRegistryEntry = {
  componentKey: string;
  aliases: string[];
  figmaKeys?: string[];
  rulesFile: ComponentRulesFile;
};

export function findComponentContractRulesForDiff(
  diff: DiffEntry,
): ComponentContractRule[] {
  const property = diff.details?.property ?? null;
  if (!property) {
    return [];
  }

  const result: ComponentContractRule[] = [];
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
      if (!ruleMatchesDiff(rule, diff, property)) {
        continue;
      }
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
    if (rule.ruleKind === 'design-rule' && rule.severity === 'error') {
      return rule;
    }
  }
  return null;
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
            !ruleMatchesDiff(rule, diff, property)
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

function createRuleViolationAssessment(
  rule: ComponentContractRule,
): NonNullable<DiffEntry['assessment']> {
  return {
    verdict: 'violation',
    source: 'component-contract',
    reasonCode: 'component-contract-violation',
    ruleId: rule.ruleId,
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
  if (
    diff.context.actualComponentKey === entry.componentKey ||
    diff.context.referenceComponentKey === entry.componentKey ||
    diff.context.nestedOwnerComponentKey === entry.componentKey ||
    diff.context.actualNestedOwnerComponentKey === entry.componentKey
  ) {
    return true;
  }

  const figmaKeys = Array.isArray(entry.figmaKeys) ? entry.figmaKeys : [];
  if (
    figmaKeys.includes(diff.context.actualComponentKey ?? '') ||
    figmaKeys.includes(diff.context.referenceComponentKey ?? '') ||
    figmaKeys.includes(diff.context.nestedOwnerComponentKey ?? '') ||
    figmaKeys.includes(diff.context.actualNestedOwnerComponentKey ?? '')
  ) {
    return true;
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
): boolean {
  if (!appliesToMatchesDiff(rule.appliesTo, property, diff)) {
    return false;
  }

  if (!variantConditionsMatchDiff(rule.conditions?.variant, diff)) {
    return false;
  }

  const layers = rule.target?.layers;
  if (!Array.isArray(layers) || !layers.length) {
    return true;
  }

  const nodeName = normalizePathSegment(diff.nodeName);
  for (const layer of layers) {
    if (layerMatchesDiff(layer, nodeName, diff.nodePath)) {
      return true;
    }
  }

  return false;
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
  for (const segment of pathSegments) {
    if (segment === targetSegments[targetIndex]) {
      targetIndex += 1;
      if (targetIndex === targetSegments.length) return true;
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
      pathSegments[pathSegments.length - 1] === lastTarget)
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
