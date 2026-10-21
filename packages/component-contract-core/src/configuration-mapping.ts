import type { ManualSource, TypedConstraint } from './types';
import { validationInputs } from './validation-inputs';
import { configurationTargetQuery } from './configuration-domain';

type Mapping = NonNullable<TypedConstraint['mapping']>;
const eq = (fact: string, value: unknown) => ({ predicate: 'equals', actual: { fact }, expected: { literal: value }, missingPolicy: 'unknown' });
export const mappingActive = (m: Mapping) => ({ predicate: 'any', args: m.activeRoles.map(role => eq(`ruleScopeV1.targets.${role}.visible`, true)) });
export const mappingCondition = (c: Mapping['cases'][number]) => ({ predicate: 'all', args: Object.entries(c.when).map(([id, value]) => eq(`expectedInput.${id}`, value)) });
export function mappingAssertion(c: Mapping['cases'][number]) {
  return { predicate: 'all', args: [...new Set(c.requirements.map(r => r.targetRole))].map(role => ({ predicate: 'any', args: [
    eq(`ruleScopeV1.targets.${role}.visible`, false),
    { predicate: 'all', args: [eq(`ruleScopeV1.targets.${role}.visible`, true), ...c.requirements.filter(r => r.targetRole === role).map(r => ({
      predicate: 'any', args: (r.values || [r.value]).map(value => ({
        predicate: 'sequence-equals', actual: configurationTargetQuery([role], r.fact, true), expected: { literal: [value] }, missingPolicy: 'unknown',
      })),
    }))] },
  ] })) };
}

export function mappingErrors(manual: ManualSource, index: number, constraint: TypedConstraint): string[] {
  if (constraint.type !== 'configurationMapping') return constraint.mapping ? ['mapping requires configurationMapping.'] : [];
  const rule = manual.rules[index], m = constraint.mapping, errors: string[] = [];
  if (!m || !Array.isArray(m.activeRoles) || !m.activeRoles.length || !Array.isArray(m.cases) || !m.cases.length) return ['Declare activeRoles and conditional cases.'];
  if (Object.keys(constraint).some(k => !['type', 'mapping'].includes(k)) || Object.keys(m).some(k => !['activeRoles', 'cases'].includes(k))) errors.push('Unknown mapping field.');
  if (manual.targets.find(t => t.id === rule.targetId)?.semanticRole !== 'root' || (rule.targetScope || 'self') !== 'self'
    || rule.permission !== 'constrained' || rule.execution?.route !== 'predicate' || rule.capabilitySet
    || rule.applicability.validationMode !== 'specification' || rule.boundaryPolicy || rule.targetApplicability
    || rule.applicability.activeDependency || Object.keys(rule.applicability.context || {}).length
    || rule.applicability.variants !== 'all' || rule.applicability.modes !== 'all') errors.push('Mapping requires root/self and explicit specification mode; activation belongs to cases and activeRoles.');
  const validRole = (role: string) => /^[a-zA-Z0-9_-]+$/.test(role) && manual.targets.filter(t => t.semanticRole === role && t.resolution === 'resolved').length === 1;
  if (new Set(m.activeRoles).size !== m.activeRoles.length || m.activeRoles.some(r => !validRole(r))) errors.push('Active roles must be unique resolved targets.');
  const inputs = validationInputs(manual), ids = new Set();
  for (const c of m.cases) {
    if (!c || typeof c !== 'object' || !c.when || typeof c.when !== 'object' || Array.isArray(c.when)
      || !Array.isArray(c.requirements) || !c.requirements.length) { errors.push('Every case needs conditions and requirements.'); continue; }
    if (typeof c.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(c.id) || ids.has(c.id) || Object.keys(c).some(k => !['id', 'when', 'requirements'].includes(k))) errors.push('Unique case ID and typed fields required.');
    ids.add(c.id);
    if (!Object.keys(c.when).length) errors.push('Every mapping case needs an independent input condition.');
    for (const [id, value] of Object.entries(c.when)) {
      const input = inputs.find(p => p.id === id);
      if (!input || !(input.valueType === 'boolean' && typeof value === 'boolean' || input.valueType === 'enum' && input.domain?.includes(value))) errors.push(`Invalid declared input: ${id}.`);
    }
    const pairs = new Set();
    for (const r of c.requirements) {
      if (!r || typeof r !== 'object') { errors.push('Invalid mapping requirement.'); continue; }
      const pair = `${r.targetRole}:${r.fact}`;
      if (!validRole(r.targetRole) || pairs.has(pair)) errors.push('Requirements need unique resolved target/fact pairs.');
      pairs.add(pair);
      if (Object.keys(r).some(k => !['targetRole', 'fact', 'value', 'values'].includes(k))
        || !/^(layout|text|parent\.layout)\.[a-zA-Z][a-zA-Z0-9.]*$/.test(r.fact) || /(?:__proto__|constructor|prototype)/.test(r.fact)) errors.push('Mapping requires explicit observed layout/text facts.');
      if (r.value === undefined ? !Array.isArray(r.values) || !r.values.length : r.values !== undefined) errors.push('Choose one value or a nonempty value domain.');
    }
    if (m.activeRoles.some(role => !c.requirements.some(r => r?.targetRole === role))) errors.push('Each active role must be constrained in every case.');
  }
  return errors;
}
