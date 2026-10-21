import { validateScreenSpec } from './schema';
import type { CompositionPlan, GenerationContext, HostVerification } from './types';
/** A host declaration alone cannot turn syntax/capture into norm/scenario PASS. */
export function assessVerification(plan: CompositionPlan, context: GenerationContext, result: HostVerification): HostVerification['status'] {
  if (plan.schemaVersion !== 'apollo.composition-plan.v1-experimental' || !['apollo.screen-spec.v1-experimental','apollo.screen-spec.v2-experimental'].includes(plan.spec?.schemaVersion) || validateScreenSpec(plan.spec).length) return 'incomplete';
  if (result.status !== 'passed') return ['failed','incomplete'].includes(result.status) ? result.status : 'incomplete';
  const e = result.evidence, sha = /^[a-f0-9]{64}$/;
  if (!e || !sha.test(e.factsHash) || !e.checks.length || e.checks.some(c => !sha.test(c.evidenceHash))) return 'incomplete';
  if (e.checks.some(c => c.status === 'failed')) return 'failed';
  if (e.checks.some(c => !['passed','not-applicable'].includes(c.status))) return 'incomplete';
  const used = new Set<string>();
  function component(id: string): boolean {
    if (used.has(id)) return true; used.add(id);
    const c = context.view.components.find(c => c.pin.componentId === id);
    if (!c || c.coverage.pendingRoutes.length || c.coverage.nonExecutableRuleIds.length) return false;
    if (!c.coverage.predicateRuleIds.every(id => e!.checks.filter(check => check.id === id && check.componentId === c.pin.componentId).length === 1)) return false;
    return c.dependencies.every(component);
  }
  if (!plan.components.every(c => component(c.pin.componentId))) return 'incomplete';
  const scenarioIds = plan.spec.nodes.map(n => 'node.'+n.id).concat(plan.spec.states.values.map(s => 'state.'+s),plan.spec.events.map(e => 'event.'+e.id));
  for (const n of plan.spec.nodes) if (n.kind === 'component' && n.actions) scenarioIds.push(...n.actions.items.map(a => (a.behavior === 'none' ? 'content.' : 'action.')+a.id));
  if (!scenarioIds.every(id => e.checks.filter(c => c.id === id && !c.componentId && c.status === 'passed').length === 1)) return 'incomplete';
  return 'passed';
}
