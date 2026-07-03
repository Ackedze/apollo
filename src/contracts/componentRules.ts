import type { DiffEntry } from '../structure/diff';
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
};

type ComponentRulesFile = {
  componentKey: string;
  rules: ComponentContractRule[];
};

type ComponentRuleRegistryEntry = {
  componentKey: string;
  aliases: string[];
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

  const layers = rule.target?.layers;
  if (!Array.isArray(layers) || !layers.length) {
    return true;
  }

  const nodeName = normalizePathSegment(diff.nodeName);
  const path = normalizePath(diff.nodePath);
  for (const layer of layers) {
    const normalizedLayer = normalizePathSegment(layer);
    if (nodeName === normalizedLayer || pathContainsSegment(path, normalizedLayer)) {
      return true;
    }
  }

  return false;
}

function appliesToMatchesDiff(
  ruleAppliesTo: string,
  property: string,
  diff: DiffEntry,
): boolean {
  const parts = ruleAppliesTo.split('|');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed === property) {
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
