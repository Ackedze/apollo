import type { PatternContract, ContextValues, Issue } from './schema';
import { validatePattern } from './validator';
import { domain, matches } from './finite-domain';
export function inspectContext(pattern: PatternContract, input: unknown): { values?: ContextValues; missing: string[]; issues: Issue[] } {
  const issues: Issue[] = [], missing: string[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { missing, issues: [{
    level: 'error', code: 'CONTEXT_TYPE', path: '/context', message: 'Context must be an object.' }] };
  const context = input as Record<string, unknown>, ids = new Set(pattern.context.fields.map(field => field.id));
  for (const id of Object.keys(context)) if (!ids.has(id)) issues.push({ level: 'error', code: 'CONTEXT_FIELD', path: '/context/' + id, message: 'Undeclared context input.' });
  for (const field of pattern.context.fields) {
    if (!Object.prototype.hasOwnProperty.call(context, field.id)) missing.push(field.id);
    else if (!domain(field).includes(context[field.id] as boolean | string)) issues.push({
      level: 'error', code: 'CONTEXT_VALUE', path: '/context/' + field.id, message: 'Value does not match the declared typed domain.' });
  }
  return { values: issues.length ? undefined : context as ContextValues, missing, issues };
}
export function resolveDecisions(input: unknown, context: unknown) {
  const result = validatePattern(input);
  if (!result.pattern) return { status: 'invalid' as const, issues: result.issues, missing: [] as string[], selections: [] as Selection[] };
  const inspected = inspectContext(result.pattern, context);
  if (inspected.issues.length) return { status: 'invalid' as const, issues: inspected.issues, missing: inspected.missing, selections: [] as Selection[] };
  if (inspected.missing.length) return { status: 'unresolved' as const, issues: [] as Issue[], missing: inspected.missing, selections: [] as Selection[] };
  const selections: Selection[] = [];
  for (const table of result.pattern.decisionTables) {
    const rows = table.rows.filter(row => matches(row.when, inspected.values!));
    if (rows.length !== 1) return { status: 'invalid' as const, issues: [{ level: 'error' as const, code: 'DECISION_CARDINALITY', path: '/decisionTables/' + table.id, message: 'Exactly one outcome is required.' }], missing: [], selections: [] as Selection[] };
    selections.push({ tableId: table.id, rowId: rows[0].id, outcomeId: rows[0].outcomeId, evidence: rows[0].evidence });
  }
  return { status: 'selected' as const, issues: [] as Issue[], missing: [], selections };
}
export type Selection = { tableId: string; rowId: string; outcomeId: string; evidence: Array<{ sourceId: string; ruleId: string }> };

/** Resolves one declared event. No saves, navigation or target writes are performed. */
export function resolveTransition(input: unknown, context: unknown, request: { stateId: string; eventId: string; outcomeId: string }) {
  const validation = validatePattern(input), decision = resolveDecisions(input, context);
  if (!validation.pattern || decision.status !== 'selected') return { status: decision.status === 'unresolved' ? 'unresolved' as const : 'invalid' as const, issues: decision.issues, missing: decision.missing };
  const p = validation.pattern;
  if (!p.scenario.states.some(state => state.id === request.stateId) || !p.scenario.events.some(event => event.id === request.eventId)
    || !decision.selections.some(selection => selection.outcomeId === request.outcomeId))
    return { status: 'invalid' as const, issues: [{ level: 'error' as const, code: 'SCENARIO_REQUEST', path: '/scenario', message: 'Use a declared state/event and a currently selected outcome.' }] };
  const routes = p.scenario.transitions.filter(t => t.from === request.stateId && t.eventId === request.eventId && t.outcomeIds.includes(request.outcomeId) && matches(t.when, context as ContextValues));
  if (routes.length !== 1) return { status: 'unresolved' as const, issues: [{ level: 'warning' as const, code: 'TRANSITION_UNDEFINED', path: '/scenario', message: 'No unique transition is declared; no product behavior is inferred.' }] };
  const transition = routes[0];
  if ('gapId' in transition.target) return { status: 'unresolved' as const, gapId: transition.target.gapId, transitionId: transition.id, issues: [] as Issue[] };
  return { status: 'resolved' as const, stateId: transition.target.stateId, transitionId: transition.id, actions: transition.actions, issues: [] as Issue[] };
}
