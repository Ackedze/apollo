// @ts-ignore Canonical interpreter is JavaScript-owned by Apollo.
import { evaluateRules, resolveValue, selectSubjects } from '../predicate/index.js';
import type { CompileResult, ManualRule, ManualSource, PreviewSnapshot } from './types';
import { compileApplicabilityProbe } from './compiler';
import { buildOwnershipReadiness, validRuleOwnership } from './rule-ownership';

type RuntimeEvaluation = { applicability: string; subjectNodeId: string; trace: Record<string, unknown> };
export type RuleApplicabilityEvidence = {
  status: 'applicable' | 'not-applicable' | 'unknown';
  unsupportedConditions: string[];
  evaluations: RuntimeEvaluation[];
};

/** A freshly resolved hidden child is different from an empty or uncertain selector. */
export function provenHiddenRuleTarget(manual: ManualSource, rule: ManualRule, snapshot: PreviewSnapshot) {
  if (rule.targetScope && rule.targetScope !== 'self' || snapshot.source?.truncated
    || snapshot.source?.captureTopology?.complete !== true || snapshot.source.captureTopology.limitReached
    || snapshot.source.captureTopology.issues?.length || snapshot.selection.length !== 1) return undefined;
  const target = manual.targets.find(entry => entry.id === rule.targetId && entry.resolution === 'resolved');
  const identities = (snapshot as PreviewSnapshot & {declaredTargetIdentitiesV1?: {targets:Array<{
    targetId:string;semanticRole:string;status:string;present?:boolean;effectiveVisible?:boolean;nodeId?:string;
  }>}}).declaredTargetIdentitiesV1;
  const identity = identities?.targets.find(entry => entry.targetId === target?.id);
  if (!target || identity?.status !== 'resolved' || identity.present !== true || identity.effectiveVisible !== false
    || identity.semanticRole !== target.semanticRole || snapshot.selection.includes(identity.nodeId || '')) return undefined;
  const node = snapshot.nodes.find(entry => entry.id === identity.nodeId);
  if (!node) return undefined;
  // A hidden visibility override must stay a gap when its baseline is missing or different.
  if (rule.capability === 'visibility' || rule.constraints.some(constraint => constraint.fact === 'visible')) {
    const actual = resolveValue({fact:'visible'}, node, snapshot);
    const baseline = resolveValue({fact:'baseline.effective.visible'}, node, snapshot);
    if (actual.state !== 'known' || baseline.state !== 'known' || actual.value !== baseline.value) return undefined;
  }
  return node;
}

export function diagnoseRuleApplicability(manual: ManualSource, rule: ManualRule, snapshot?: PreviewSnapshot, variantAvailability = false, rootTargetAliases = false): RuleApplicabilityEvidence {
  const probe = compileApplicabilityProbe(manual, rule, variantAvailability, rootTargetAliases);
  if (!snapshot) return { status: 'unknown', unsupportedConditions: ['snapshot', ...probe.unsupported], evaluations: [] };
  const result = evaluateRules({ snapshot, rules: [probe.rule], ruleRelease: 'editor-coverage' });
  const evaluations = result.evaluations as RuntimeEvaluation[];
  const subjects = selectSubjects(probe.rule, snapshot);
  // An empty selector is not absence proof. A false availability condition backed by
  // generated anatomy + live reference is; so is a known global scope mismatch.
  const scopeMismatch = evaluations.some((entry) => /^rule (?:product|platform|channel|page type) scope does not apply$/.test(String(entry.trace.reason)));
  const allConditionsFalse = evaluations.length > 0 && !subjects.unknown && evaluations.every((entry) => (
    entry.applicability === 'not-applicable' && entry.trace.truth === 'false'
  ));
  if (!scopeMismatch && !allConditionsFalse && !subjects.unknown && !subjects.nodes.length
    && probe.rootConditionRule && snapshot.selection.length === 1 && !snapshot.source?.truncated) {
    const rootSubjects = selectSubjects(probe.rootConditionRule, snapshot);
    const rootResult = evaluateRules({ snapshot, rules: [probe.rootConditionRule], ruleRelease: 'editor-coverage' });
    const rootEvaluations = rootResult.evaluations as RuntimeEvaluation[];
    if (!rootSubjects.unknown && rootSubjects.nodes.length === 1 && rootEvaluations.length === 1
      && rootEvaluations[0].applicability === 'not-applicable' && rootEvaluations[0].trace.truth === 'false') {
      return { status: 'not-applicable', unsupportedConditions: probe.unsupported, evaluations: rootEvaluations };
    }
  }
  const status = scopeMismatch || allConditionsFalse ? 'not-applicable'
    : !probe.unsupported.length && !subjects.unknown && evaluations.length > 0
      && evaluations.every((entry) => entry.applicability === 'applicable') ? 'applicable' : 'unknown';
  return { status, unsupportedConditions: probe.unsupported, evaluations };
}

export type FactEvidence = {
  path: string;
  state: 'available' | 'unavailable' | 'unknown';
  scope: 'component-root' | 'rule-target';
  subjects: Array<{ nodeId: string; state: string }>;
};

/** Inspect declared dependencies, not prose. Presence of data never enables a context-only rule. */
export function inspectRuleFacts(manual: ManualSource, rule: ManualRule, snapshot?: PreviewSnapshot, rootTargetAliases = false): FactEvidence[] {
  const paths = Array.from(new Set(rule.execution?.missingFacts || []));
  if (!paths.length) return [];
  const probe = compileApplicabilityProbe(manual, rule, false, rootTargetAliases);
  const selected = snapshot ? selectSubjects(probe.rule, snapshot) : { nodes: [], unknown: true };
  return paths.map((path) => {
    const rootFact = path.startsWith('semanticApi.');
    const nodes = rootFact ? (snapshot?.nodes.filter((node) => snapshot.selection.includes(String(node.id))) || []) : selected.nodes;
    const subjects = nodes.map((node: Record<string, unknown>) => ({
      nodeId: String(node.id), state: resolveValue({ fact: path }, node, snapshot).state as string,
    }));
    const uncertain = !snapshot || !subjects.length || (rootFact ? subjects.length !== 1 : selected.unknown || probe.unsupported.includes('target'));
    const state = uncertain || subjects.some((entry: { state: string }) => entry.state === 'unknown') ? 'unknown'
      : subjects.every((entry: { state: string }) => entry.state === 'known') ? 'available' : 'unavailable';
    return { path, state, scope: rootFact ? 'component-root' : 'rule-target', subjects };
  });
}

/** Package-level authoring/execution readiness: deliberately independent of the tested snapshot. */
export function buildContractReadiness(compiled: CompileResult, manual: ManualSource) {
  const active = manual.rules.filter((rule) => rule.status !== 'deprecated');
  const excluded = new Set(compiled.contract.nonExecutableRules.map((entry) => entry.sourceRuleId));
  const delegated = active.filter((rule) => rule.execution?.route === 'delegated').map((rule) => rule.id);
  const contextOnly = active.filter((rule) => rule.execution?.route === 'context-only').map((rule) => rule.id);
  const ruleIds = new Set([...excluded, ...delegated, ...contextOnly]);
  for (const [index, rule] of manual.rules.entries()) {
    if (rule.status === 'deprecated') continue;
    if (manual.metadata.ruleOwnershipVersion === 1 && !validRuleOwnership(rule.ownership, manual.component.componentId)) ruleIds.add(rule.id);
    if (!manual.targets.some((target) => target.id === rule.targetId)
      || compiled.issues.some((issue) => issue.level === 'error' && issue.path.startsWith(`/rules/${index}/`))) ruleIds.add(rule.id);
  }
  const unreviewedRuleIds = active.filter((rule) => rule.status !== 'reviewed').map((rule) => rule.id).sort();
  const unresolvedTargetIds = manual.targets.filter((target) => target.resolution !== 'resolved'
    && active.some((rule) => rule.targetId === target.id)).map((target) => target.id).sort();
  const errors = compiled.issues.filter((issue) => issue.level === 'error');
  return {
    status: compiled.contract.status === 'ready' && !ruleIds.size && !unreviewedRuleIds.length && !unresolvedTargetIds.length && !errors.length ? 'ready' : 'draft',
    ...(manual.metadata.ruleOwnershipVersion === 1 ? { ownership: buildOwnershipReadiness(compiled, manual, ruleIds) } : {}),
    activeRules: active.length, deprecatedRules: manual.rules.length - active.length,
    unimplementedRules: ruleIds.size, unimplementedRuleIds: Array.from(ruleIds).sort(),
    contextOnlyRules: contextOnly.length, delegatedRules: delegated.length,
    compilerExcludedRules: Array.from(excluded).filter((id) => !contextOnly.includes(id)).length,
    unreviewedRuleIds, unresolvedTargetIds, validationErrors: errors.length,
  };
}
