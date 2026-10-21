import {
  type Applicability,
  type ManualRule,
  type ManualSource,
  type SemanticTarget,
} from './types';
import { slug } from './stable';

export const PROTECTED_INTERNAL_CAPABILITY_SETS = ['auto-layout@1', 'visual-style@1'] as const;

export type QuickPolicyResult = {
  manual: ManualSource;
  changed: boolean;
  createdRuleIds: string[];
  updatedRuleIds: string[];
  conflictingRuleIds: string[];
};

function cloneManual(source: ManualSource): ManualSource {
  return JSON.parse(JSON.stringify(source)) as ManualSource;
}

function applicability(source: ManualSource): Applicability {
  return {
    variants: 'all',
    modes: 'all',
    platforms: source.component.platform === 'universal' ? [] : [source.component.platform],
  };
}

function uniqueRuleId(source: ManualSource, base: string): string {
  const ids = new Set(source.rules.map((rule) => rule.id));
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function sameRule(left: ManualRule, right: ManualRule): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function finish(
  source: ManualSource,
  next: ManualSource,
  createdRuleIds: string[],
  updatedRuleIds: string[],
  conflictingRuleIds: string[] = [],
): QuickPolicyResult {
  const changed = createdRuleIds.length > 0 || updatedRuleIds.length > 0;
  if (changed) {
    next.rules.sort((left, right) => left.id.localeCompare(right.id));
    next.metadata.revision = source.metadata.revision + 1;
  }
  return { manual: next, changed, createdRuleIds, updatedRuleIds, conflictingRuleIds };
}

export function applyProtectInternalsPolicy(source: ManualSource, target: SemanticTarget): QuickPolicyResult {
  const next = cloneManual(source);
  const createdRuleIds: string[] = [];
  const updatedRuleIds: string[] = [];

  PROTECTED_INTERNAL_CAPABILITY_SETS.forEach((capabilitySet) => {
    const existingIndex = next.rules.findIndex((rule) => (
      rule.targetId === target.id && rule.capabilitySet === capabilitySet
    ));
    const rationale = capabilitySet === 'auto-layout@1'
      ? 'Внутренняя геометрия компонента не изменяется напрямую.'
      : 'Внутреннее визуальное оформление компонента не изменяется напрямую.';
    const baseId = `component:${source.component.contractId}.${target.semanticRole}.${slug(capabilitySet)}`;

    if (existingIndex < 0) {
      const id = uniqueRuleId(next, baseId);
      next.rules.push({
        id,
        targetId: target.id,
        targetScope: 'self-and-descendants',
        capability: '',
        capabilitySet,
        permission: 'forbidden',
        controlPaths: [],
        constraints: [],
        applicability: applicability(source),
        severity: 'error',
        rationale,
        remediationIntent: 'restore-effective-baseline',
        status: 'draft',
        owner: source.metadata.owners.manual,
        ...(source.metadata.ruleOwnershipVersion === 1 ? { ownership: { kind: 'component' as const, ownerId: source.component.componentId } } : {}),
      });
      createdRuleIds.push(id);
      return;
    }

    const existing = next.rules[existingIndex];
    const normalized: ManualRule = {
      ...existing,
      targetScope: 'self-and-descendants',
      capability: '',
      capabilitySet,
      capabilitySelection: undefined,
      permission: 'forbidden',
      controlPaths: [],
      constraints: [],
      applicability: applicability(source),
      severity: 'error',
      rationale: existing.rationale || rationale,
      remediationIntent: existing.remediationIntent || 'restore-effective-baseline',
      status: sameRule(existing, {
        ...existing,
        targetScope: 'self-and-descendants',
        capability: '',
        capabilitySet,
        capabilitySelection: undefined,
        permission: 'forbidden',
        controlPaths: [],
        constraints: [],
        applicability: applicability(source),
        severity: 'error',
        rationale: existing.rationale || rationale,
        remediationIntent: existing.remediationIntent || 'restore-effective-baseline',
      }) ? existing.status : 'draft',
    };
    if (!sameRule(existing, normalized)) {
      next.rules[existingIndex] = normalized;
      updatedRuleIds.push(existing.id);
    }
  });

  return finish(source, next, createdRuleIds, updatedRuleIds);
}

export function componentPropertyName(capability: string): string | null {
  const prefixes = ['component.properties.', 'component-property.'];
  const prefix = prefixes.find((value) => capability.startsWith(value));
  return prefix ? capability.slice(prefix.length) || null : null;
}

export function allowPublicComponentProperties(
  source: ManualSource,
  target: SemanticTarget,
  properties: string[],
): QuickPolicyResult {
  const next = cloneManual(source);
  const createdRuleIds: string[] = [];
  const conflictingRuleIds: string[] = [];
  const normalizedProperties = Array.from(new Set(properties.map((value) => value.trim()).filter(Boolean))).sort();

  normalizedProperties.forEach((property) => {
    const existing = next.rules.find((rule) => (
      rule.targetId === target.id && componentPropertyName(rule.capability) === property
    ));
    if (existing) {
      if (existing.permission !== 'allowed') conflictingRuleIds.push(existing.id);
      return;
    }

    const capability = `component.properties.${property}`;
    const baseId = `component:${source.component.contractId}.${target.semanticRole}.${slug(capability)}`;
    const id = uniqueRuleId(next, baseId);
    next.rules.push({
      id,
      targetId: target.id,
      targetScope: 'self',
      capability,
      permission: 'allowed',
      controlPaths: [{ kind: 'host-property', property, required: true, exclusive: true }],
      constraints: [],
      applicability: applicability(source),
      severity: 'info',
      rationale: `Публичное свойство «${property}» является разрешённым способом настройки компонента.`,
      status: 'draft',
      owner: source.metadata.owners.manual,
      ...(source.metadata.ruleOwnershipVersion === 1 ? { ownership: { kind: 'component' as const, ownerId: source.component.componentId } } : {}),
    });
    createdRuleIds.push(id);
  });

  return finish(source, next, createdRuleIds, [], conflictingRuleIds);
}

export function sameManualComponentFamily(left: ManualSource, right: ManualSource): boolean {
  const baseFamily = (source: ManualSource): string => (
    slug(source.component.family).replace(/-inverted$/i, '')
  );
  return left.component.componentId === right.component.componentId
    && left.component.library === right.component.library
    && baseFamily(left) === baseFamily(right);
}

export function samePreviewComponent(left: ManualSource, right: ManualSource): boolean {
  const sameFamilyAndPlatform = left.component.family === right.component.family
    && left.component.platform === right.component.platform;
  if (!sameFamilyAndPlatform) return false;
  return left.component.contractId === right.component.contractId
    || left.component.library === right.component.library;
}
