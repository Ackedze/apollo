export type PatternOccurrence = 'first' | 'after-first' | 'last' | number;

export type PatternValueConstraint = {
  oneOf: string[];
};

export type PatternRule = {
  id: string;
  match: {
    hostComponentKeys?: string[];
    hostComponentNames?: string[];
  };
  selector: {
    nestedComponentKeys?: string[];
    nestedComponentNames?: string[];
    occurrence?: PatternOccurrence;
  };
  when?: {
    nestedCount?: number;
  };
  assert: {
    variantProperties: Record<string, PatternValueConstraint>;
  };
  messages: {
    allowed: string;
    violation: string;
  };
  presentation?: 'show' | 'suppress-derived' | 'semantic-variant';
};

export type PatternRuleContext = {
  hostComponentKey: string | null;
  hostComponentName: string | null;
  nestedComponentKey: string | null;
  nestedComponentName: string | null;
  occurrence: number;
  nestedCount: number;
  actualVariantProperties: Record<string, string>;
  expectedVariantProperties: Record<string, string>;
  nestedNodeId: string | null;
};

export type PatternRuleDecision = {
  verdict: 'allowed' | 'violation';
  ruleId: string;
  message: string;
  remediation: {
    kind: 'set-variant-properties';
    nodeId: string;
    properties: Record<string, string>;
  } | null;
  presentation: 'show' | 'suppress-derived' | 'semantic-variant';
  variantChanges: Array<{
    nodeId: string;
    property: string;
    expected: string;
    actual: string;
  }>;
};

export const PATTERN_RULES_SCHEMA_VERSION = 1;

let runtimePatternRules: PatternRule[] = [];

export type PatternRulesConfig = {
  schemaVersion: number;
  rules: PatternRule[];
};

export function setPatternRulesConfig(payload: unknown): PatternRulesConfig {
  const config = validatePatternRulesConfig(payload);
  runtimePatternRules = config.rules;
  return config;
}

export function getPatternRules(): readonly PatternRule[] {
  return runtimePatternRules;
}

function validatePatternRulesConfig(payload: unknown): PatternRulesConfig {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Pattern rules config must be an object');
  }
  const candidate = payload as Partial<PatternRulesConfig>;
  if (candidate.schemaVersion !== PATTERN_RULES_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported pattern rules schemaVersion: ${String(candidate.schemaVersion)}`,
    );
  }
  if (!Array.isArray(candidate.rules) || !candidate.rules.length) {
    throw new Error('Pattern rules config must contain a non-empty rules array');
  }

  const ids = new Set<string>();
  candidate.rules.forEach((rule, index) => validatePatternRule(rule, index, ids));
  return {
    schemaVersion: candidate.schemaVersion,
    rules: candidate.rules.slice(),
  };
}

function validatePatternRule(
  rule: PatternRule,
  index: number,
  ids: Set<string>,
): void {
  const prefix = `rules[${index}]`;
  if (!rule || typeof rule !== 'object') {
    throw new Error(`${prefix} must be an object`);
  }
  if (typeof rule.id !== 'string' || !rule.id.trim()) {
    throw new Error(`${prefix}.id must be a non-empty string`);
  }
  if (ids.has(rule.id)) {
    throw new Error(`Duplicate pattern rule id: ${rule.id}`);
  }
  ids.add(rule.id);

  if (!hasStringArray(rule.match?.hostComponentKeys) &&
      !hasStringArray(rule.match?.hostComponentNames)) {
    throw new Error(`${prefix}.match must identify at least one host component`);
  }
  if (!hasStringArray(rule.selector?.nestedComponentKeys) &&
      !hasStringArray(rule.selector?.nestedComponentNames)) {
    throw new Error(`${prefix}.selector must identify at least one nested component`);
  }
  if (!rule.assert?.variantProperties ||
      typeof rule.assert.variantProperties !== 'object' ||
      !Object.keys(rule.assert.variantProperties).length) {
    throw new Error(`${prefix}.assert.variantProperties must not be empty`);
  }
  for (const [property, constraint] of Object.entries(
    rule.assert.variantProperties,
  )) {
    if (!property || !hasStringArray(constraint?.oneOf)) {
      throw new Error(`${prefix}.assert.variantProperties.${property} requires oneOf`);
    }
  }
  if (typeof rule.messages?.allowed !== 'string' ||
      typeof rule.messages?.violation !== 'string') {
    throw new Error(`${prefix}.messages must contain allowed and violation strings`);
  }
  if (rule.when?.nestedCount !== undefined &&
      (!Number.isInteger(rule.when.nestedCount) || rule.when.nestedCount < 1)) {
    throw new Error(`${prefix}.when.nestedCount must be a positive integer`);
  }
  if (rule.selector.occurrence !== undefined &&
      !isValidOccurrence(rule.selector.occurrence)) {
    throw new Error(`${prefix}.selector.occurrence is invalid`);
  }
  if (rule.presentation !== undefined &&
      !['show', 'suppress-derived', 'semantic-variant'].includes(rule.presentation)) {
    throw new Error(`${prefix}.presentation is invalid`);
  }
}

function hasStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === 'string' && item.trim().length > 0)
  );
}

function isValidOccurrence(value: PatternOccurrence): boolean {
  return (
    value === 'first' ||
    value === 'after-first' ||
    value === 'last' ||
    (Number.isInteger(value) && value > 0)
  );
}

export function findSemanticVariantRule(
  hostComponentKey: string,
  nestedComponentKey: string,
): PatternRule | null {
  return (
    runtimePatternRules.find(
      (rule) =>
        rule.presentation === 'semantic-variant' &&
        rule.match.hostComponentKeys?.includes(hostComponentKey) &&
        rule.selector.nestedComponentKeys?.includes(nestedComponentKey),
    ) ?? null
  );
}

export function evaluatePatternRules(
  context: PatternRuleContext | null,
  rules: readonly PatternRule[] = runtimePatternRules,
): PatternRuleDecision | null {
  if (!context) {
    return null;
  }

  for (const rule of rules) {
    if (!matchesRuleContext(rule, context)) {
      continue;
    }

    const changedProperties = Object.keys(rule.assert.variantProperties).filter(
      (property) =>
        context.actualVariantProperties[property] !==
        context.expectedVariantProperties[property],
    );
    if (!changedProperties.length) {
      continue;
    }

    const allowed = changedProperties.every((property) => {
      const constraint = rule.assert.variantProperties[property];
      const actual = context.actualVariantProperties[property];
      return Boolean(constraint && actual && constraint.oneOf.includes(actual));
    });

    const remediationProperties = Object.fromEntries(
      changedProperties.map((property) => [
        property,
        rule.assert.variantProperties[property]?.oneOf[0] ?? '',
      ]),
    );

    return {
      verdict: allowed ? 'allowed' : 'violation',
      ruleId: rule.id,
      message: allowed ? rule.messages.allowed : rule.messages.violation,
      remediation:
        !allowed && context.nestedNodeId
          ? {
              kind: 'set-variant-properties',
              nodeId: context.nestedNodeId,
              properties: remediationProperties,
            }
          : null,
      presentation: rule.presentation ?? 'show',
      variantChanges: context.nestedNodeId
        ? changedProperties.map((property) => ({
            nodeId: context.nestedNodeId!,
            property,
            expected: context.expectedVariantProperties[property] ?? '',
            actual: context.actualVariantProperties[property] ?? '',
          }))
        : [],
    };
  }

  return null;
}

function matchesRuleContext(
  rule: PatternRule,
  context: PatternRuleContext,
): boolean {
  if (
    rule.match.hostComponentKeys?.length &&
    (!context.hostComponentKey ||
      !rule.match.hostComponentKeys.includes(context.hostComponentKey))
  ) {
    return false;
  }
  if (
    rule.match.hostComponentNames?.length &&
    (!context.hostComponentName ||
      !rule.match.hostComponentNames.includes(context.hostComponentName))
  ) {
    return false;
  }
  if (
    rule.selector.nestedComponentKeys?.length &&
    (!context.nestedComponentKey ||
      !rule.selector.nestedComponentKeys.includes(context.nestedComponentKey))
  ) {
    return false;
  }
  if (
    rule.selector.nestedComponentNames?.length &&
    (!context.nestedComponentName ||
      !rule.selector.nestedComponentNames.includes(context.nestedComponentName))
  ) {
    return false;
  }
  if (
    rule.when?.nestedCount !== undefined &&
    rule.when.nestedCount !== context.nestedCount
  ) {
    return false;
  }

  return matchesOccurrence(
    rule.selector.occurrence,
    context.occurrence,
    context.nestedCount,
  );
}

function matchesOccurrence(
  expected: PatternOccurrence | undefined,
  actual: number,
  count: number,
): boolean {
  if (expected === undefined) return true;
  if (typeof expected === 'number') return expected === actual;
  if (expected === 'first') return actual === 1;
  if (expected === 'after-first') return actual > 1;
  return actual === count;
}
