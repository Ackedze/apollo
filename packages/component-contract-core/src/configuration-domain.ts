import type { ManualSource, TypedConstraint } from './types';

export const configurationRoles = (c: NonNullable<TypedConstraint['configuration']>) =>
  [...new Set(c.profiles.flatMap(p => p.requirements.map(r => r.targetRole)))];
const eq = (fact: string, value: unknown) => ({ predicate: 'equals', actual: { fact }, expected: { literal: value }, missingPolicy: 'unknown' });
const visible = (role: string, value: boolean) => eq(`ruleScopeV1.targets.${role}.visible`, value);
export const configurationActive = (c: NonNullable<TypedConstraint['configuration']>) =>
  ({ predicate: 'any', args: c.activeRoles.map(role => visible(role, true)) });

/** Only proven semantic targets participate. An absent optional role on another
 * node is not an unknown target; an explicitly unreadable role remains unknown.
 * Callers retain semanticTargets.*.resolved guards (including confirmed absence).
 */
export function configurationTargetQuery(roles: string[], fact: string, visibleOnly = false) {
  return { query: {
    from: 'selection-root', traverse: 'self-and-descendants',
    where: [
      { predicate: 'fact-present', actual: { fact: 'semantic.role' } },
      { predicate: 'one-of', actual: { fact: 'semantic.role' }, expected: { literal: roles }, missingPolicy: 'unknown' },
      ...(visibleOnly ? [eq('visibility.effective', true)] : []),
    ], project: { fact },
  } };
}

export const configurationExclusion = (roles: string[]) => ({
  predicate: 'none-of', actual: { fact: 'id' },
  expected: configurationTargetQuery(roles, 'id'), missingPolicy: 'unknown',
});

/** Compiler only: all decisions remain in the single Predicate Engine. */
export function configurationAssertion(c: NonNullable<TypedConstraint['configuration']>, expectedInput = false) {
  const query = (role: string, fact: string) => configurationTargetQuery([role], fact, true);
  return { predicate: 'any', args: c.profiles.map(profile => ({ predicate: 'all', args: [
    ...(expectedInput ? [eq(`expectedInput.${c.specificationInput}`, profile.id)] : []),
    ...configurationRoles(c).map(role => ({ predicate: 'any', args: [visible(role, false), {
      predicate: 'all', args: [visible(role, true), ...profile.requirements.filter(r => r.targetRole === role).map(r => ({
        predicate: 'sequence-equals', actual: query(role, r.fact),
        expected: r.baseline ? query(role, `baseline.effective.${r.fact}`) : { literal: [r.value] }, missingPolicy: 'unknown',
      }))],
    }] })),
  ] })) };
}

/** Structural guard for manual authoring. Never infer exclusions from layer names. */
export function configurationErrors(manual: ManualSource, ruleIndex: number, constraint: TypedConstraint): string[] {
  const rule = manual.rules[ruleIndex], c = constraint.configuration, errors: string[] = [];
  const fail = (message: string) => errors.push(message);
  if (constraint.type === 'configurationDomain') {
    if (!c || !Array.isArray(c.activeRoles) || !c.activeRoles.length || !Array.isArray(c.profiles) || !c.profiles.length) return ['Declare active roles and configuration profiles.'];
    if (Object.keys(c).some(k => !['activeRoles', 'profiles', 'specificationInput'].includes(k))) fail('Unknown configuration field.');
    if (Object.keys(constraint).some(k => !['type', 'configuration'].includes(k))) fail('Configuration uses only its typed profiles, not other constraint fields.');
    if (manual.targets.find(t => t.id === rule.targetId)?.semanticRole !== 'root' || (rule.targetScope || 'self') !== 'self'
      || rule.capabilitySet || rule.permission !== 'constrained' || rule.execution?.route !== 'predicate') fail('Configuration requires root/self, constrained permission and predicate execution.');
    if (rule.applicability.validationMode || rule.applicability.activeDependency || Object.keys(rule.applicability.context || {}).length
      || rule.applicability.variants !== 'all' || rule.applicability.modes !== 'all' || rule.applicability.products?.length || rule.applicability.channels?.length) fail('Configuration domain is intrinsic; activation is declared by activeRoles, not external context.');
    if (c.profiles.some(p => !p || typeof p !== 'object' || !Array.isArray(p.requirements) || !p.requirements.length
      || p.requirements.some(r => !r || typeof r !== 'object'))) return [...errors, 'Every profile needs typed requirements.'];
    const ids = c.profiles.map(p => p.id);
    if (ids.some(id => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length) fail('Profile IDs must be unique nonempty strings.');
    const roles = configurationRoles(c);
    if (roles.some(role => !/^[a-zA-Z0-9_-]+$/.test(role) || manual.targets.filter(t => t.semanticRole === role && t.resolution === 'resolved').length !== 1)) fail('All roles must be unique resolved semantic targets.');
    if (new Set(c.activeRoles).size !== c.activeRoles.length || c.activeRoles.some(role => !roles.includes(role))) fail('Active roles must be a unique subset of the configuration targets.');
    const fields = (p: typeof c.profiles[number]) => p.requirements.map(r => `${r.targetRole}:${r.fact}`).sort();
    for (const profile of c.profiles) {
      if (Object.keys(profile).some(k => !['id', 'requirements'].includes(k))) fail('Unknown profile field.');
      if (new Set(fields(profile)).size !== profile.requirements.length || JSON.stringify(fields(profile)) !== JSON.stringify(fields(c.profiles[0]))) fail('Profiles must constrain the same unique target/fact pairs.');
      for (const r of profile.requirements) {
        if (Object.keys(r).some(k => !['targetRole', 'fact', 'value', 'baseline'].includes(k))) fail('Unknown configuration requirement field.');
        if (!/^(layout|text)\.[a-zA-Z][a-zA-Z0-9.]*$/.test(r.fact) || /(?:__proto__|constructor|prototype)/.test(r.fact)) fail('Configuration facts must be explicit observed layout/text fields.');
        if (r.baseline === true ? r.value !== undefined : r.baseline !== undefined || r.value === undefined) fail('Choose a literal value or baseline, not both.');
      }
    }
    if (c.specificationInput !== undefined) {
      if (typeof c.specificationInput !== 'string' || !c.specificationInput.trim()) fail('Specification input must be a nonempty semantic API ID.');
      const p = manual.semanticApi.find(p => p.id === c.specificationInput);
      if (!p || p.validationInput?.version !== 2 || p.valueType !== 'enum' || JSON.stringify([...(p.domain || [])].sort()) !== JSON.stringify([...ids].sort())) fail('Specification input requires a declared enum v2 matching profile IDs.');
    }
  } else if (c) fail('configuration is supported only by configurationDomain.');
  if (constraint.exceptConfiguration) {
    const e = constraint.exceptConfiguration, owner = manual.rules.find(r => r.id === e.ruleId);
    const configs = owner?.constraints.filter(c => c.type === 'configurationDomain' && c.configuration) || [];
    if (constraint.type !== 'propertyForbidden' || !constraint.fact || !owner || owner.status === 'deprecated' || configs.length !== 1
      || !Array.isArray(e.targetRoles) || !e.targetRoles.length || new Set(e.targetRoles).size !== e.targetRoles.length
      || JSON.stringify(owner?.applicability.platforms) !== JSON.stringify(rule.applicability.platforms)) fail('Baseline exclusion requires one active configuration rule with matching platform scope and explicit target roles/fact.');
    else {
      if (configurationErrors(manual, manual.rules.indexOf(owner), configs[0]).length) return [...errors, 'Baseline exclusion references an invalid configuration.'];
      for (const p of configs[0].configuration!.profiles) for (const role of e.targetRoles)
        if (!p.requirements.some(r => r.targetRole === role && r.fact === constraint.fact && r.baseline !== true)) fail('Every exempt target/fact must be constrained by literals in every profile.');
    }
  }
  return errors;
}
