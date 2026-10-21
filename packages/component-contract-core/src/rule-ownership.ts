import type { CompileResult, ManualRule, ManualSource, RuleOwnership } from './types';

export const RULE_OWNERSHIP_KINDS = ['component', 'product-policy', 'pattern', 'editorial-policy'] as const;
export type OwnershipGroup = 'component' | 'usage' | 'unclassified';

/** No inference from RuleID, prose, product scope or execution route. */
export function validRuleOwnership(value: unknown, componentId: string): value is RuleOwnership {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as RuleOwnership;
  return Object.keys(v).every(key => key === 'kind' || key === 'ownerId')
    && RULE_OWNERSHIP_KINDS.includes(v.kind) && typeof v.ownerId === 'string' && !!v.ownerId.trim() && v.ownerId === v.ownerId.trim()
    && (v.kind !== 'component' || v.ownerId === componentId);
}

export function ruleOwnershipGroup(rule: ManualRule | undefined, componentId: string): OwnershipGroup {
  if (!validRuleOwnership(rule?.ownership, componentId)) return 'unclassified';
  return rule!.ownership!.kind === 'component' ? 'component' : 'usage';
}

export function buildOwnershipReadiness(compiled: CompileResult, manual: ManualSource, gaps: Set<string>) {
  const active = manual.rules.filter(rule => rule.status !== 'deprecated');
  const globalErrors = compiled.issues.filter(i => i.level === 'error' && !i.path.startsWith('/rules/')).length;
  const group = (key: OwnershipGroup) => {
    const rules = active.filter(rule => ruleOwnershipGroup(rule, manual.component.componentId) === key);
    const ruleIds = rules.map(rule => rule.id).sort();
    const unimplementedRuleIds = ruleIds.filter(id => gaps.has(id));
    const unreviewedRuleIds = rules.filter(rule => rule.status !== 'reviewed').map(rule => rule.id).sort();
    const unresolvedTargetIds = manual.targets.filter(target => target.resolution !== 'resolved'
      && rules.some(rule => rule.targetId === target.id)).map(target => target.id).sort();
    const validationErrors = compiled.issues.filter(issue => issue.level === 'error'
      && rules.some(rule => issue.path.startsWith(`/rules/${manual.rules.indexOf(rule)}/`))).length;
    return { status: !rules.length ? 'not-included' : key === 'unclassified' || globalErrors || validationErrors
      || unimplementedRuleIds.length || unreviewedRuleIds.length || unresolvedTargetIds.length ? 'draft' : 'ready',
      rules: rules.length, ruleIds, unimplementedRuleIds, unreviewedRuleIds, unresolvedTargetIds, validationErrors };
  };
  return { version: 1 as const, scope: 'included-source-rules-only' as const,
    component: group('component'), usage: group('usage'), unclassified: group('unclassified'), globalErrors };
}

/** Attribution only: consumes existing verdicts; never executes or suppresses a predicate. */
export function buildOwnershipCoverage(evaluations: Array<Record<string, unknown>>, compiled: CompileResult, manual: ManualSource) {
  const sources = new Map(manual.rules.map(rule => [rule.id, rule]));
  const atomic = new Map(compiled.contract.rules.map(rule => [rule.ruleId, String((rule.source as Record<string, unknown>)?.anchor || '')]));
  const groups = { component: [], usage: [], unclassified: [], dependencies: [], infrastructure: [] } as Record<
    OwnershipGroup | 'dependencies' | 'infrastructure', Array<Record<string, unknown>>>;
  for (const evaluation of evaluations) {
    const ruleId = String(evaluation.ruleId);
    const source = sources.get(atomic.get(ruleId) || ruleId);
    // Dependency provenance is supplied by the runtime, not guessed from child RuleIDs.
    const group = evaluation.dependency ? 'dependencies' : source ? ruleOwnershipGroup(source, manual.component.componentId)
      : evaluation.origin === 'editor-coverage' ? 'infrastructure' : 'unclassified';
    groups[group].push(evaluation);
  }
  const summarize = (key: keyof typeof groups) => {
    const entries = groups[key];
    const notExecuted = entries.filter(e => e.classification === 'not-executed').length;
    const inconclusive = entries.filter(e => ['human-review', 'not-evaluable', 'unknown'].includes(String(e.classification))).length;
    const violations = entries.filter(e => e.classification === 'violation').length;
    const notApplicable = entries.filter(e => e.classification === 'not-applicable').length;
    const complete = !!entries.length && !notExecuted && !inconclusive && key !== 'unclassified';
    return { status: !entries.length ? 'not-evaluated' : !complete ? 'incomplete'
      : notApplicable === entries.length ? 'not-applicable' : violations ? 'violations' : 'checked',
      complete, evaluations: entries.length, notExecuted, inconclusive, violations, notApplicable };
  };
  return { version: 1 as const, scope: 'included-source-rules-only' as const,
    component: summarize('component'), usage: summarize('usage'), unclassified: summarize('unclassified'),
    dependencies: summarize('dependencies'), infrastructure: summarize('infrastructure') };
}
