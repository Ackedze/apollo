import { decorateDependencyUsages } from './dependency-usage';
import { declaredTargetIdentityErrors, bindDeclaredTargetRuleSelectors } from './declared-target-identity';
import { representationFeatureFlags, manualRepresentationShape } from './representation-evidence';
import {
  COMPILED_SCHEMA_VERSION,
  type CompileResult,
  type CompiledContract,
  type ManualRule,
  type ManualSource,
  type RuleIr,
  type SemanticTarget,
  type TypedConstraint,
  type VariantEvidence,
} from './types';
import { capabilitiesForSet, factForCapability } from './capabilities';
import { stableHash, uniqueSorted } from './stable';
import { validateManualSource } from './validator';
import { PRODUCT_SCOPE_CATALOG } from './context-catalog';
import { propertyAvailabilityKey } from './variant-facts';
import { dependencyBinding } from './dependency-facts';
import { propertyApplicabilityCondition } from './property-applicability';
import { CONFIGURED_NATIVE_PROPERTY_POLICY, configuredNativeExpression } from './configured-native-property';
import { linkComponentDependencies } from './component-dependencies';
import { ruleOwnershipGroup } from './rule-ownership';
import { configurationActive, configurationAssertion, configurationExclusion } from './configuration-domain';
import { allowsVisibleTargetPolicy } from './rule-scope-policy';
import { mappingActive, mappingAssertion, mappingCondition } from './configuration-mapping';
import { textStyleBindingFact, validTextStyleCatalog } from './text-style-facts';
import { bindingConsistencyKey, hasTextBindingReference } from './text-binding-identity';
import { replacementId } from './native-instance-replacements';
import { declaredRootAliasRoles, isDeclaredRootTarget } from './root-target';
import { declaredTargetMembershipKey } from './declared-target-membership';

function roleFilter(role: string, rootAliases = new Set<string>()): Record<string, unknown> {
  return {
    predicate: 'equals',
    actual: { fact: rootAliases.has(role) ? `rootTargetAliasesV1.${role}` : 'semantic.role' },
    expected: { literal: rootAliases.has(role) ? true : role },
  };
}

function rolesFilter(roles: string[], rootAliases: Set<string>): Record<string, unknown> {
  // Preserve historical IR when none of the queried roles uses the opt-in alias facts.
  if (!roles.some(role => rootAliases.has(role))) return {
    predicate: 'one-of', actual: { fact: 'semantic.role' }, expected: { literal: roles },
  };
  return { predicate: 'any', args: roles.map(role => roleFilter(role, rootAliases)) };
}

function targetSelector(
  target: SemanticTarget,
  targetScope: ManualRule['targetScope'],
  baselineApplicabilityFact?: string,
  rootAliases = new Set<string>(),
): Record<string, unknown> {
  const ownTarget = roleFilter(target.semanticRole, rootAliases);
  const targetFilter = targetScope === 'self-and-descendants'
    ? [{
        predicate: 'any',
        args: [
          ownTarget,
          {
            predicate: 'ancestor',
            actual: { fact: 'id' },
            expected: { fact: `relations.${target.semanticRole}` },
          },
        ],
      }]
    : targetScope === 'descendants'
      ? [{ predicate: 'ancestor', actual: { fact: 'id' }, expected: { fact: `relations.${target.semanticRole}` } }]
      : [ownTarget];
  const where = baselineApplicabilityFact
    ? [
        ...targetFilter,
        {
          predicate: 'fact-present',
          actual: { fact: baselineApplicabilityFact },
        },
      ]
    : targetFilter;
  return {
    from: 'selection-root',
    traverse: 'self-and-descendants',
    where,
  };
}

function targetQuery(role: string, project?: string, rootAliases = new Set<string>()): Record<string, unknown> {
  const query: Record<string, unknown> = {
    from: 'selection-root',
    traverse: 'self-and-descendants',
    where: [roleFilter(role, rootAliases)],
  };
  if (project) query.project = { fact: project };
  return { query };
}

function availabilityEquals(fact: string, value: boolean): Record<string, unknown> {
  return { predicate: 'equals', actual: { fact }, expected: { literal: value }, missingPolicy: 'unknown' };
}

/** Shared by executable assertions and diagnostic-only applicability probes. */
function applyVariantTargetAvailability(
  select: Record<string, unknown>, conditions: unknown[], target: SemanticTarget,
) {
  const present = `variantAvailability.targets.${target.semanticRole}.present`;
  conditions.push(availabilityEquals(present, true));
  // Confirmed absence needs a subject for a false precondition, not an empty selector.
  // Unknown or missing evidence must never activate this fallback.
  select.where = [{ predicate: 'any', args: [
    { predicate: 'all', args: select.where },
    { predicate: 'all', args: [availabilityEquals('variantAvailability.isRoot', true), availabilityEquals(present, false)] },
  ] }];
}

function propertyAvailabilityCondition(fact: string): Record<string, unknown> | undefined {
  if (fact.startsWith('semanticApi.')) return availabilityEquals(`variantAvailability.properties.${fact.slice('semanticApi.'.length)}`, true);
  if (fact.startsWith('component.properties.')) return availabilityEquals(`variantAvailability.componentProperties.${propertyAvailabilityKey(fact.slice('component.properties.'.length))}`, true);
  return undefined;
}

function applyExplicitRuleScope(select: Record<string, unknown>, conditions: unknown[], source: ManualRule, target: SemanticTarget) {
  if (source.boundaryPolicy === 'component-owned@1') conditions.push(availabilityEquals('ruleScopeV1.local', true));
  if (source.targetApplicability === 'visible-target@1') {
    const fact = `ruleScopeV1.targets.${target.semanticRole}.visible`;
    conditions.push(availabilityEquals(fact, true));
    // Hidden/absent target still receives a real false precondition on the root.
    // Missing or ambiguous evidence stays unknown, never a synthetic pass.
    select.where = [{ predicate: 'any', args: [
      { predicate: 'all', args: select.where || [] },
      { predicate: 'all', args: [availabilityEquals('ruleScopeV1.isRoot', true), availabilityEquals(fact, false)] },
    ] }];
  }
}

function availabilityFactFor(constraint: TypedConstraint, capability: string): string {
  // Relationship assertions read node identity/relations, not the capability's property.
  return constraint.type === 'relationship' ? '' : constraint.fact || factForCapability(capability);
}

function constraintsFor(rule: ManualRule): TypedConstraint[] {
  return rule.permission === 'forbidden' && !rule.constraints.length
    ? [{ type: 'propertyForbidden' }] : rule.constraints;
}

function capabilitiesFor(rule: ManualRule): readonly string[] {
  const registered = rule.capabilitySet ? capabilitiesForSet(rule.capabilitySet) : [rule.capability];
  return rule.capabilitySet && rule.capabilitySelection
    ? registered.filter(capability => rule.capabilitySelection!.includes(capability)) : registered;
}

function conditionFor(rule: ManualRule): Record<string, unknown> | undefined {
  const conditions: Array<Record<string, unknown>> = [];
  if (rule.applicability.validationMode === 'specification') conditions.push({
    predicate: 'equals', actual: { fact: 'validationScopeV1.mode' }, expected: { literal: 'specification' }, missingPolicy: 'unknown',
  });
  if (rule.applicability.activeDependency) conditions.push(availabilityEquals(`dependencyCompositionV1.${rule.applicability.activeDependency}.active`, true));
  const prefix = rule.applicability.conditionSubject === 'component-root' ? 'host.' : '';
  for (const [fact, value] of Object.entries(rule.applicability.context || {})) {
    // Validator requires an explicit declared semanticApi property. No prose inference.
    conditions.push({ predicate: 'equals', actual: { fact: `${prefix}${fact}` }, expected: { literal: value } });
  }
  for (const [fact, values] of Object.entries(rule.applicability.contextDomains || {})) {
    conditions.push({ predicate: 'one-of', actual: { fact: `${prefix}${fact}` }, expected: { literal: values }, missingPolicy: 'unknown' });
  }
  if (rule.applicability.variants !== 'all') {
    for (const [property, values] of Object.entries(rule.applicability.variants)) {
      conditions.push({
        predicate: 'one-of',
        actual: { fact: `${prefix}component.properties.${property}` },
        expected: { literal: values },
        missingPolicy: 'unknown',
      });
    }
  }
  if (rule.applicability.modes !== 'all') {
    if (Array.isArray(rule.applicability.modes)) {
      if (rule.applicability.modes.length) {
        conditions.push({
          predicate: 'one-of',
          actual: { fact: 'page.context.modes.active' },
          expected: { literal: rule.applicability.modes },
          missingPolicy: 'unknown',
        });
      }
    } else {
      for (const [collectionId, modeIds] of Object.entries(rule.applicability.modes)) {
        if (!modeIds.length) continue;
        conditions.push({
          predicate: 'one-of',
          actual: { fact: `page.context.modes.${collectionId}` },
          expected: { literal: modeIds },
          missingPolicy: 'unknown',
        });
      }
    }
  }
  if (!conditions.length) return undefined;
  const expression = conditions.length === 1 ? conditions[0] : { predicate: 'all', args: conditions };
  return rule.propertyConformance === CONFIGURED_NATIVE_PROPERTY_POLICY ? configuredNativeExpression(expression) : expression;
}

function scopeFor(rule: ManualRule): Record<string, unknown> {
  return {
    platform: rule.applicability.platforms.length ? rule.applicability.platforms : undefined,
    product: rule.applicability.products?.length ? rule.applicability.products : undefined,
    channel: rule.applicability.channels?.length ? rule.applicability.channels : undefined,
  };
}

/** Scope diagnostics need a root subject even when a specification target is absent. */
function applyValidationModeFallback(select: Record<string, unknown>, source: ManualRule) {
  if (source.applicability.validationMode !== 'specification' || select.traverse === 'self') return;
  select.where = [{ predicate: 'any', args: [
    { predicate: 'all', args: select.where || [] },
    { predicate: 'all', args: [
      availabilityEquals('validationScopeV1.isRoot', true),
      { predicate: 'equals', actual: { fact: 'validationScopeV1.mode' }, expected: { literal: 'component-audit' } },
    ] },
  ] }];
}

/** Diagnostic-only RuleIR: ask the canonical engine about scope, never execute an excluded constraint. */
export function compileApplicabilityProbe(manual: ManualSource, source: ManualRule, variantAvailability = false, rootTargetAliases = false) {
  const rootAliases = rootTargetAliases ? declaredRootAliasRoles(manual.targets) : new Set<string>();
  const unsupported: string[] = [];
  const list = (value: unknown, path: string): string[] => {
    if (value === undefined) return [];
    if (Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim())) return value;
    unsupported.push(path);
    return [];
  };
  const applicability: ManualRule['applicability'] = {
    variants: 'all', modes: 'all',
    platforms: list(source.applicability.platforms, 'platforms'),
    products: list(source.applicability.products, 'products'),
    channels: list(source.applicability.channels, 'channels'),
    context: {},
  };
  if (applicability.products?.some((product) => !PRODUCT_SCOPE_CATALOG.some((choice) => choice.value === product))) {
    unsupported.push(`products:unmapped:${applicability.products.join(',')}`);
    // Do not guess aliases or treat an unknown identifier as a known different product.
    applicability.products = [];
  }
  for (const key of Object.keys(source.applicability)) {
    if (!['variants', 'modes', 'platforms', 'products', 'channels', 'context', 'contextDomains', 'scopeStatus', 'conditionSubject', 'activeDependency', 'validationMode'].includes(key)) unsupported.push(key);
  }
  if (source.applicability.validationMode === 'specification') applicability.validationMode = 'specification';
  else if (source.applicability.validationMode !== undefined) unsupported.push('validationMode');
  if (source.applicability.activeDependency !== undefined) {
    if (manual.componentDependencies?.some(d => d.id === source.applicability.activeDependency)) applicability.activeDependency = source.applicability.activeDependency;
    else unsupported.push('activeDependency');
  }
  if (source.applicability.conditionSubject === 'component-root' || source.applicability.conditionSubject === 'target') {
    applicability.conditionSubject = source.applicability.conditionSubject;
  } else if (source.applicability.conditionSubject !== undefined) unsupported.push('conditionSubject');
  const domains = (value: unknown, path: string): Record<string, string[]> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) { unsupported.push(path); return {}; }
    const result: Record<string, string[]> = {};
    for (const [key, input] of Object.entries(value)) {
      const values = list(input, `${path}.${key}`);
      if (key.trim() && values.length) result[key] = values;
      else unsupported.push(`${path}.${key}`);
    }
    return result;
  };
  if (source.applicability.variants !== 'all') applicability.variants = domains(source.applicability.variants, 'variants');
  if (source.applicability.modes !== 'all') applicability.modes = Array.isArray(source.applicability.modes)
    ? list(source.applicability.modes, 'modes') : domains(source.applicability.modes, 'modes');
  const context = source.applicability.context;
  if (context !== undefined && (!context || typeof context !== 'object' || Array.isArray(context))) unsupported.push('context');
  for (const [fact, value] of Object.entries(context && typeof context === 'object' && !Array.isArray(context) ? context : {})) {
    if (manual.semanticApi.some((property) => fact === `semanticApi.${property.id}`
      || (fact === `expectedInput.${property.id}` && property.validationInput?.version === 1))) applicability.context![fact] = value;
    else unsupported.push(`context.${fact}`);
  }
  if (source.applicability.scopeStatus === 'needs-confirmation') unsupported.push('scopeStatus:needs-confirmation');
  if (source.applicability.contextDomains) {
    applicability.contextDomains = {};
    for (const [fact, values] of Object.entries(source.applicability.contextDomains)) {
      if (manual.semanticApi.some(p => fact === `semanticApi.${p.id}`) && Array.isArray(values) && values.length
        && values.every(v => ['string','number','boolean'].includes(typeof v))) applicability.contextDomains[fact] = values;
      else unsupported.push(`contextDomains.${fact}`);
    }
  }
  const target = manual.targets.find((entry) => entry.id === source.targetId);
  const invalidTargetScope = source.targetScope && !['self', 'self-and-descendants', 'descendants'].includes(source.targetScope);
  const targetUncertain = !target || target.resolution !== 'resolved' || Boolean(invalidTargetScope);
  if (targetUncertain) unsupported.push('target');
  if (invalidTargetScope) unsupported.push('targetScope');
  const safe = { ...source, applicability };
  let select: Record<string, unknown> = target
    ? targetSelector(target, invalidTargetScope ? 'self' : source.targetScope || 'self', undefined, rootAliases)
    : { from: 'selection-root', traverse: 'self' };
  let when = targetUncertain ? undefined : conditionFor(safe);
  // The scope can be conclusively false even when this mode's target is unresolved.
  if (targetUncertain && applicability.validationMode === 'specification') when = conditionFor({ ...safe, applicability: { variants: 'all', modes: 'all', platforms: [], validationMode: 'specification' } });
  // Excluded source rules stay pending rather than being hidden by a property gate.
  // The executable route below evaluates gates per assertion, never for the whole group.
  if (source.propertyApplicability) unsupported.push('propertyApplicability:per-assertion');
  if (source.propertyConformance !== undefined) unsupported.push('propertyConformance:per-assertion');
  if (variantAvailability && target && !targetUncertain) {
    const assertions = capabilitiesFor(source).flatMap(capability => constraintsFor(source).map(constraint => ({
      ...assertionFor(constraint, target, capability, rootAliases), fact: availabilityFactFor(constraint, capability),
    })));
    if (assertions.some(assertion => assertion.selectRoot)) {
      // Presence, absence, quantity and order still apply when their target is absent.
      // A compound rule with any structural assertion must not be excluded wholesale.
      select = { from: 'selection-root', traverse: 'self' };
    } else if (assertions.length && assertions.every(assertion => assertion.expression)) {
      const conditions: unknown[] = when ? [when] : [];
      applyVariantTargetAvailability(select, conditions, target);
      const propertyConditions = assertions.map(assertion => propertyAvailabilityCondition(assertion.fact));
      // A source rule is excluded only if ALL its property assertions are unavailable.
      // An ordinary layer property has no API-consumer gate and keeps the rule pending.
      if (propertyConditions.every(Boolean)) conditions.push(propertyConditions.length === 1
        ? propertyConditions[0] : { predicate: 'any', args: propertyConditions });
      when = { predicate: 'all', args: conditions };
    }
  }
  // Deferred constraints use the same explicit visibility policy as executable
  // rules. Do not infer applicability from a missing selector or missing facts.
  // Unresolved targets cannot establish an exemption.
  if (source.targetApplicability && (source.targetApplicability !== 'visible-target@1' || !allowsVisibleTargetPolicy(source))) {
    unsupported.push('targetApplicability');
  } else if (target && !targetUncertain && source.targetApplicability === 'visible-target@1') {
    const conditions: unknown[] = when ? [when] : [];
    applyExplicitRuleScope(select, conditions, safe, target);
    when = { predicate: 'all', args: conditions };
  }
  applyValidationModeFallback(select, safe);
  const rule: RuleIr = {
    schemaVersion: 'apollo.rule-ir.v1', ruleId: `editor:applicability:${source.id}`, revision: manual.metadata.revision,
    source: { path: 'contract.manual.json', anchor: source.id },
    authority: { status: 'active', provenance: 'editor-coverage-probe' },
    effect: 'require', scope: scopeFor(safe),
    select,
    when,
    assert: { predicate: 'equals', actual: { literal: true }, expected: { literal: true } },
    severity: 'info', unknownPolicy: 'human-review',
  };
  // A hidden target is not absence proof. However, an explicitly root-scoped
  // condition can be false independently of that target. Probe only those
  // declared conditions on the root; never move target/property gates there.
  const rootWhen = !unsupported.length && !targetUncertain && applicability.conditionSubject === 'component-root'
    ? conditionFor({ ...safe, applicability: {
      variants: applicability.variants, context: applicability.context, contextDomains: applicability.contextDomains,
      modes: 'all', platforms: [], conditionSubject: 'target',
    } }) : undefined;
  const rootConditionRule: RuleIr | undefined = rootWhen ? {
    ...rule, ruleId: `${rule.ruleId}:component-root-condition`,
    select: { from: 'selection-root', traverse: 'self' }, when: rootWhen,
  } : undefined;
  return { rule, unsupported: uniqueSorted(unsupported), rootConditionRule };
}

function assertionFor(
  constraint: TypedConstraint,
  target: SemanticTarget,
  capability: string,
  rootAliases = new Set<string>(),
): {
  selectRoot: boolean;
  expression?: Record<string, unknown>;
  baselineApplicabilityFact?: string;
  reason?: string;
} {
  const fact = constraint.fact || factForCapability(capability);
  if (constraint.type === 'bindingConsistency') {
    const field=constraint.bindingKind==='fill-token'?'fill':'style';
    const query=(suffix?:string) => ({query:{from:'selection-root',traverse:'self-and-descendants',where:[
      rolesFilter(constraint.targetRoles || [], rootAliases),
      {predicate:'equals',actual:{fact:'visibility.effective'},expected:{literal:true}},
    ],...(suffix?{project:{fact:`textBindingIdentityV1.${field}.${suffix}`}}:{})}});
    return {selectRoot:true,expression:{predicate:'all',args:[
      {predicate:'count-between',actual:query(),lower:{literal:1},upper:{literal:9999},bounds:'inclusive',missingPolicy:'unknown'},
      {predicate:'all-equal',actual:query('valid'),expected:{literal:true},missingPolicy:'unknown'},
      {predicate:'all-equal',actual:query('keys'),missingPolicy:'unknown',
        ...(constraint.bindingReference==='selected-variant'?{expected:{fact:`selectedTextBindingV1.${bindingConsistencyKey(constraint)}`}}:{})},
    ]}};
  }
  if (constraint.type === 'styleBinding') return {
    selectRoot: false,
    expression: { predicate: 'binding-satisfies', actual: { fact: textStyleBindingFact(constraint.styleCatalog || '') },
      expected: { literal: { required: true, library: true } }, missingPolicy: 'unknown' },
  };
  if (constraint.type === 'propertyDomain' || constraint.type === 'propertyExclusion') {
    return {
      selectRoot: false,
      expression: constraint.type === 'propertyExclusion' ? {
        predicate: 'not', args: [{ predicate: 'one-of', actual: { fact }, expected: { literal: constraint.values || [] }, missingPolicy: 'unknown' }],
      } : {
        predicate: 'one-of',
        actual: { fact },
        expected: { literal: constraint.values || [] },
        ...(fact.startsWith('variable.modes.') || fact.startsWith('nativeTargetPropertiesV1.') ? { missingPolicy: 'unknown' } : {}),
      },
    };
  }
  if (constraint.type === 'presence') {
    const expected = constraint.expected !== false;
    return {
      selectRoot: true,
      expression: {
        predicate: 'count-between',
        actual: targetQuery(target.semanticRole, undefined, rootAliases),
        lower: { literal: expected ? 1 : 0 },
        upper: { literal: expected ? 9999 : 0 },
        bounds: 'inclusive',
      },
    };
  }
  if (constraint.type === 'propertyForbidden') {
    const baselineFact = constraint.baselineSource === 'library-text' ? constraint.textNormalization === 'trim' ? 'libraryTextV1.trimmedCharacters' : 'libraryTextV1.characters' : `baseline.effective.${fact}`;
    return {
      selectRoot: false,
      // These assertions still apply when capture cannot supply a reference.
      // Let the interpreter report unknown instead of an empty selector.
      baselineApplicabilityFact: constraint.baselineSource === 'library-text' ? 'text.characters' : /^(bounds\.(width|height)|appearance\.(effectDetailsV1|blendMode)|layout\.(gridStyleId|clipsContent))$/.test(fact) ? undefined
        : /^appearance\.(fill|stroke)$/.test(fact) ? `paintEvidenceV1.${fact.split('.')[1]}` : baselineFact,
      expression: {
        predicate: 'matches-effective-baseline',
        actual: { fact: constraint.textNormalization === 'trim' ? 'libraryTextV1.actualTrimmedCharacters' : fact },
        expected: { fact: baselineFact },
        ...(constraint.baselineSource === 'library-text' || /^(bounds\.(width|height)|appearance\.(fill|stroke|effectDetailsV1|blendMode)|layout\.(gridStyleId|clipsContent))$/.test(fact) ? { missingPolicy: 'unknown' } : {}),
      },
    };
  }
  if (constraint.type === 'quantity') {
    if (constraint.contractDependencyId) return {selectRoot:true, expression: {
      predicate:'count-between', actual:{fact:`dependencyCompositionV1.${constraint.contractDependencyId}.visibleInstances`},
      lower:{literal:constraint.min ?? 0}, upper:{literal:constraint.max ?? 9999}, bounds:'inclusive', missingPolicy:'unknown',
    }};
    const roles = constraint.targetRoles;
    const query = roles ? {
      from: 'selection-root', traverse: 'self-and-descendants',
      where: [
        rolesFilter(roles, rootAliases),
        ...(constraint.visibleOnly ? [{ predicate: 'equals', actual: { fact: 'visibility.effective' }, expected: { literal: true } }] : []),
      ],
    } : undefined;
    return {
      selectRoot: true,
      expression: {
        predicate: 'count-between',
        actual: query ? { query } : targetQuery(constraint.targetRole || target.semanticRole, undefined, rootAliases),
        lower: { literal: constraint.min ?? 0 },
        upper: { literal: constraint.max ?? 9999 },
        bounds: 'inclusive',
      },
    };
  }
  if (constraint.type === 'positionOrder') {
    return {
      selectRoot: true,
      expression: {
        predicate: 'sequence-equals',
        actual: constraint.orderScope === 'structural' ? { fact: 'structuralOrderV1.directChildRoles' } : {
          query: {
            from: 'selection-root',
            traverse: 'direct-children',
            project: { fact: 'semantic.role' },
          },
        },
        expected: { literal: constraint.order || [] },
      },
    };
  }
  if (constraint.type === 'relationship') {
    return {
      selectRoot: false,
      expression: {
        predicate: constraint.relation,
        actual: { fact: 'id' },
        expected: { fact: `relations.${constraint.targetRole}` },
      },
    };
  }
  if (constraint.type === 'tokenBinding') {
    const expected: Record<string, unknown> = {};
    if (constraint.bindingRequired !== undefined) expected.required = constraint.bindingRequired;
    if (constraint.tokenIds?.length) expected.tokenIds = constraint.tokenIds;
    return {
      selectRoot: false,
      expression: {
        predicate: 'binding-satisfies',
        actual: { fact: constraint.fact || `variable.bindings.${fact.replace(/\./g, '_')}` },
        expected: { literal: expected },
      },
    };
  }
  if (constraint.type === 'layoutConstraint') {
    if (constraint.operator === 'at-most-line-height') return {selectRoot:false,expression:{
      predicate:'compare',operator:'lte',actual:{fact},expected:{fact:`lineHeightReferenceV1.${constraint.targetRole}`},missingPolicy:'unknown',
    }};
    if (constraint.operator === 'between' || constraint.min !== undefined || constraint.max !== undefined) {
      return {
        selectRoot: false,
        expression: {
          predicate: 'between',
          actual: { fact },
          lower: { literal: constraint.min ?? Number.MIN_SAFE_INTEGER },
          upper: { literal: constraint.max ?? Number.MAX_SAFE_INTEGER },
          bounds: 'inclusive',
        },
      };
    }
    return {
      selectRoot: false,
      expression: {
        predicate: 'equals',
        actual: { fact },
        expected: { literal: constraint.value },
      },
    };
  }
  return { selectRoot: false, reason: `Constraint ${constraint.type} is not compilable.` };
}

function sourceCapabilities(rule: RuleIr): CompiledContract['capabilities'] {
  const selectors = ['selection-root', String((rule.select as Record<string, unknown>).traverse || 'self')];
  const serialized = JSON.stringify(rule);
  const facts = Array.from(serialized.matchAll(/"fact":"([^"]+)"/g)).map((match) => match[1]);
  const operators = Array.from(serialized.matchAll(/"predicate":"([^"]+)"/g)).map((match) => match[1]);
  return {
    selectors: uniqueSorted(selectors),
    facts: uniqueSorted(facts),
    operators: uniqueSorted(operators),
    remediations: rule.remediation ? [String((rule.remediation as Record<string, unknown>).kind || '')].filter(Boolean) : [],
  };
}

export function compileManualSource(manual: ManualSource, variantEvidence?: VariantEvidence, dependencyContracts: CompiledContract[] = []): CompileResult {
  const identityErrors = declaredTargetIdentityErrors({version:manual.metadata.declaredTargetIdentityVersion,configurationVersion:manual.metadata.declaredTargetConfigurationVersion,targets:manual.targets,representations:manual.representations});
  if (manual.metadata.declaredTargetIdentityVersion !== undefined && !variantEvidence) identityErrors.push('independent variant anatomy is required');
  if (identityErrors.length) throw Object.assign(new Error('DECLARED_TARGET_IDENTITY_UNSUPPORTED: ' + identityErrors.join('; ')),{code:'DECLARED_TARGET_IDENTITY_UNSUPPORTED'});
  if (variantEvidence) {
    const keys = new Set(manual.representations.filter(r => r.kind === 'figma' && r.status !== 'deprecated')
      .flatMap(r => [r.locator.componentKey, r.locator.componentSetKey]).filter(Boolean));
    const variants = variantEvidence.variants.filter(v => keys.has(v.componentSetKey) || keys.has(v.componentKey));
    const structures = Object.fromEntries([...new Set(variants.map(v => v.structureId))]
      .filter(id => variantEvidence!.structures[id]).map(id => [id, variantEvidence!.structures[id]]));
    variantEvidence = { ...variantEvidence, variants, structures };
    if (!manual.rules.some(r=>r.constraints.some(c=>c.type==='bindingConsistency'))) delete variantEvidence.textBindings;
    else if (variantEvidence.textBindings) variantEvidence.textBindings=variantEvidence.textBindings.filter(v=>keys.has(v.componentSetKey)||keys.has(v.componentKey));
    if (!manual.rules.some(r => r.constraints.some(c => c.baselineSource === 'library-text'))) delete variantEvidence.libraryText;
    const styleCatalogs = new Set(manual.rules.flatMap(r => r.constraints.filter(c => c.type === 'styleBinding').map(c => c.styleCatalog)));
    if (!styleCatalogs.size) delete variantEvidence.textStyleCatalogs;
    else if (variantEvidence.textStyleCatalogs) variantEvidence.textStyleCatalogs = variantEvidence.textStyleCatalogs.filter(c => styleCatalogs.has(c.id));
  }
  const issues = validateManualSource(manual);
  manual.rules.forEach((r,i)=>r.constraints.forEach((c,j)=>{
    if (c.type==='bindingConsistency' && c.bindingReference==='selected-variant' && !hasTextBindingReference(manual,variantEvidence,c)) {
      issues.push({level:'error',code:'TEXT_BINDING_REFERENCE_MISSING',path:`/rules/${i}/constraints/${j}`,
        message:'Нет однозначной матрицы Text Style выбранного варианта для всех объявленных текстовых целей. Обновите Athena facts.'});
    }
  }));
  manual.rules.forEach((r, i) => r.constraints.forEach((c, j) => {
    if (c.type !== 'styleBinding') return;
    const catalogs = variantEvidence?.textStyleCatalogs?.filter(s => s.id === c.styleCatalog) || [];
    if (catalogs.length !== 1 || !validTextStyleCatalog(catalogs[0])) issues.push({ level: 'error', code: 'TEXT_STYLE_CATALOG_MISSING',
      path: `/rules/${i}/constraints/${j}`, message: `Нет единственного корректного каталога Text Style: ${c.styleCatalog}. Импортируйте закреплённые Athena facts.` });
  }));
  manual.representations.forEach((representation, index) => {
    const setKey = representation.locator.componentSetKey;
    if (representation.kind === 'figma' && representation.status !== 'deprecated' && setKey
      && variantEvidence?.variants.some(v => v.componentKey === setKey && v.componentSetKey === setKey)) {
      issues.push({ level: 'error', code: 'STANDALONE_COMPONENT_AS_SET',
        path: `/representations/${index}/locator/componentSetKey`,
        message: 'Athena описывает одиночный компонент с этим ключом, а не Component Set. Удалите ошибочный componentSetKey; componentKey сохраняется.' });
    }
  });
  const rootAliases = variantEvidence?.occurrenceAddressVersion === 1 ? declaredRootAliasRoles(manual.targets) : new Set<string>();
  const assetIdentityLockSource=manual.rules.some(r=>r.constraints.some(c=>c.dependency?.field==='changed'));
  const semanticTargetVisibility = manual.semanticApi.some(p => p.bindings.some(b => b.targetId && !b.ownedOccurrence && !b.nativeSlotBinding))
    || manual.rules.some(r=>r.status!=='deprecated'&&r.permission==='constrained'
      && ['auto','predicate'].includes(r.execution?.route || 'auto')&&r.constraints.some(c=>c.dependency?.field==='changed'));
  const configurations = manual.rules.some(r => r.constraints.some(c => c.type === 'configurationDomain'));
  const componentDependencies = linkComponentDependencies(manual, dependencyContracts);
  componentDependencies.forEach((d,index)=>{if(d.issue)issues.push({level:'error',code:'COMPONENT_DEPENDENCY_LINK',path:`/componentDependencies/${index}`,message:d.issue});});
  const manualSourceHash = stableHash(manual);
  const targets = new Map(manual.targets.map((target) => [target.id, target]));
  const rules: RuleIr[] = [];
  const dependencyBindings = new Map<string, import('./types').DependencyBinding>();
  const transitions: NonNullable<CompiledContract['facts']['transitions']> = [];
  const memberCollections: NonNullable<CompiledContract['facts']['memberCollections']> = [];
  const nonExecutableRules: CompiledContract['nonExecutableRules'] = [];
  const byConstraintType: Record<string, number> = {};
  const byExecutionRoute: Record<string, number> = {};

  for (const [ruleIndex, sourceRule] of manual.rules.entries()) {
    if (sourceRule.status === 'deprecated') continue;
    const target = targets.get(sourceRule.targetId);
    if (!target) continue;
    const requestedRoute = sourceRule.execution?.route || 'auto';
    const executionRoute = requestedRoute === 'auto'
      ? sourceRule.permission === 'allowed' ? 'policy-only' : 'predicate'
      : requestedRoute;
    byExecutionRoute[executionRoute] = (byExecutionRoute[executionRoute] || 0) + 1;
    const ruleErrors = issues.filter((issue) => issue.level === 'error' && issue.path.startsWith(`/rules/${ruleIndex}/`));
    if (ruleErrors.length) {
      nonExecutableRules.push({
        id: sourceRule.id,
        sourceRuleId: sourceRule.id,
        reason: ruleErrors.map((issue) => `${issue.code}: ${issue.message}`).join(' '),
      });
      continue;
    }
    if (executionRoute === 'policy-only' || executionRoute === 'delegated') continue;
    if (executionRoute === 'context-only') {
      nonExecutableRules.push({
        id: sourceRule.id,
        sourceRuleId: sourceRule.id,
        reason: `Missing runtime facts: ${(sourceRule.execution?.missingFacts || []).join(', ')}.`,
      });
      continue;
    }
    const registeredCapabilities = sourceRule.capabilitySet
      ? capabilitiesForSet(sourceRule.capabilitySet)
      : [sourceRule.capability];
    const capabilities = capabilitiesFor(sourceRule);
    if (sourceRule.capabilitySet && !registeredCapabilities.length) {
      nonExecutableRules.push({
        id: sourceRule.id,
        sourceRuleId: sourceRule.id,
        reason: `Unknown capability set: ${sourceRule.capabilitySet}.`,
      });
      continue;
    }
    if (sourceRule.capabilitySet && !capabilities.length) {
      nonExecutableRules.push({
        id: sourceRule.id,
        sourceRuleId: sourceRule.id,
        reason: `Capability set has no selected capabilities: ${sourceRule.capabilitySet}.`,
      });
      continue;
    }
    const constraints = constraintsFor(sourceRule);
    if (!constraints.length) {
      nonExecutableRules.push({
        id: sourceRule.id,
        sourceRuleId: sourceRule.id,
        reason: 'Rule has no normative constraint to compile.',
      });
      continue;
    }

    capabilities.forEach((capability, capabilityIndex) => {
      constraints.forEach((constraint, constraintIndex) => {
        byConstraintType[constraint.type] = (byConstraintType[constraint.type] || 0) + 1;
        if (constraint.type === 'memberCollection' && constraint.collection) {
          const id = 'c_' + stableHash({sourceRuleId: sourceRule.id, constraintIndex}).slice(0, 16), prefix = `memberCollectionsV1.${id}`;
          memberCollections.push({id, sourceRuleId: sourceRule.id, collection: constraint.collection});
          rules.push({schemaVersion: 'apollo.rule-ir.v1', ruleId: `${sourceRule.id}.${capabilityIndex + 1}.${constraintIndex + 1}`,
            revision: manual.metadata.revision, source: {path: 'contract.manual.json', checksum: manualSourceHash, anchor: sourceRule.id},
            authority: {status: sourceRule.status === 'reviewed' ? 'active' : sourceRule.status, provenance: sourceRule.owner},
            effect: 'require', scope: scopeFor(sourceRule), select: {from: 'selection-root', traverse: 'self'},
            when: {predicate: 'all', args: [...(conditionFor(sourceRule) ? [conditionFor(sourceRule)] : []), availabilityEquals(`${prefix}.active`, true)]},
            assert: {predicate: 'count-between', actual: {fact: `${prefix}.violations`}, lower: {literal: 0}, upper: {literal: 0}, bounds: 'inclusive', missingPolicy: 'unknown'},
            severity: sourceRule.severity, unknownPolicy: 'human-review', presentation: {title: sourceRule.message || sourceRule.rationale, group: capability, collectionId: id},
            manual: {permission: sourceRule.permission, controlPaths: sourceRule.controlPaths},
          });
          return;
        }
        if (constraint.type === 'propertyForbidden' && constraint.targetRoles?.length) {
          for (const role of constraint.targetRoles) {
            const destination = manual.targets.find(t=>t.semanticRole===role)!;
            const assertion = assertionFor(constraint, destination, capability, rootAliases);
            const conditions: unknown[] = [
              availabilityEquals(`semanticTargets.${role}.resolved`, true),
              availabilityEquals(`ruleScopeV1.targets.${role}.visible`, true),
            ];
            const context = conditionFor(sourceRule); if (context) conditions.unshift(context);
            // A missing target gets a root diagnostic, never an empty-selector pass.
            const select = {from:'selection-root',traverse:'self-and-descendants',where:[{predicate:'any',args:[
              roleFilter(role, rootAliases),{predicate:'all',args:[roleFilter('root', rootAliases),{
                predicate:'count-between',actual:targetQuery(role, undefined, rootAliases),lower:{literal:0},upper:{literal:0},bounds:'inclusive',
              }]},
            ]}]};
            rules.push({schemaVersion:'apollo.rule-ir.v1',ruleId:`${sourceRule.id}.${capabilityIndex+1}.${constraintIndex+1}.${role}`,
              revision:manual.metadata.revision,source:{path:'contract.manual.json',checksum:manualSourceHash,anchor:sourceRule.id},
              authority:{status:sourceRule.status==='reviewed'?'active':sourceRule.status,provenance:sourceRule.owner},
              effect:'require',scope:scopeFor(sourceRule),select,when:{predicate:'all',args:conditions},
              assert:{...assertion.expression,missingPolicy:'unknown'},severity:sourceRule.severity,unknownPolicy:'human-review',
              presentation:{title:sourceRule.message||sourceRule.rationale,group:constraint.fact||capability},
              manual:{permission:sourceRule.permission,controlPaths:sourceRule.controlPaths,targetRole:role},
            });
          }
          return;
        }
        if (constraint.type === 'configurationMapping' && constraint.mapping) {
          for (const entry of constraint.mapping.cases) rules.push({
            schemaVersion: 'apollo.rule-ir.v1', ruleId: `${sourceRule.id}.${capabilityIndex + 1}.${constraintIndex + 1}.${entry.id}`,
            revision: manual.metadata.revision, source: { path: 'contract.manual.json', checksum: manualSourceHash, anchor: sourceRule.id },
            authority: { status: sourceRule.status === 'reviewed' ? 'active' : sourceRule.status, provenance: sourceRule.owner },
            effect: 'require', scope: scopeFor(sourceRule), select: { from: 'selection-root', traverse: 'self' },
            when: { predicate: 'all', args: [conditionFor(sourceRule), mappingActive(constraint.mapping), mappingCondition(entry)] },
            assert: mappingAssertion(entry), severity: sourceRule.severity, unknownPolicy: 'human-review',
            presentation: { title: sourceRule.message || sourceRule.rationale, group: capability, mappingCase: entry.id },
            manual: { permission: sourceRule.permission, controlPaths: sourceRule.controlPaths },
          });
          return;
        }
        if (constraint.type === 'instanceReplacementDomain' && constraint.replacement) {
          const d=constraint.replacement,prefix=`nativeInstanceReplacementsV1.${replacementId(sourceRule.id,d.targetRole)}`;
          const one=(fact:string,values:string[])=>({predicate:'one-of',actual:{fact},expected:{literal:values},missingPolicy:'unknown'});
          rules.push({schemaVersion:'apollo.rule-ir.v1',ruleId:`${sourceRule.id}.${capabilityIndex+1}.${constraintIndex+1}`,revision:manual.metadata.revision,
            source:{path:'contract.manual.json',checksum:manualSourceHash,anchor:sourceRule.id},authority:{status:sourceRule.status==='reviewed'?'active':sourceRule.status,provenance:sourceRule.owner},effect:'require',scope:scopeFor(sourceRule),select:{from:'selection-root',traverse:'self'},
            when:{predicate:'all',args:[availabilityEquals(`${prefix}.present`,true),...(conditionFor(sourceRule)?[conditionFor(sourceRule)]:[])]},
            assert:{predicate:'any',args:d.alternatives.map(a=>({predicate:'all',args:[one(`${prefix}.componentSetKey`,[a.componentSetKey]),...Object.entries(a.properties||{}).map(([name,values])=>one(`${prefix}.properties.${name}`,values))]}))},
            severity:sourceRule.severity,unknownPolicy:'human-review',presentation:{title:sourceRule.message||sourceRule.rationale,group:capability},manual:{permission:sourceRule.permission,controlPaths:sourceRule.controlPaths}});return;
        }
        if (constraint.type === 'configurationDomain' && constraint.configuration) {
          const c = constraint.configuration;
          for (const specification of c.specificationInput ? [false, true] : [false]) rules.push({
            schemaVersion: 'apollo.rule-ir.v1', ruleId: `${sourceRule.id}.${capabilityIndex + 1}.${constraintIndex + 1}${specification ? '.specification' : ''}`,
            revision: manual.metadata.revision, source: { path: 'contract.manual.json', checksum: manualSourceHash, anchor: sourceRule.id },
            authority: { status: sourceRule.status === 'reviewed' ? 'active' : sourceRule.status, provenance: sourceRule.owner },
            effect: 'require', scope: scopeFor(sourceRule), select: { from: 'selection-root', traverse: 'self' },
            when: { predicate: 'all', args: [configurationActive(c), ...(specification ? [{ predicate: 'equals', actual: { fact: 'validationScopeV1.mode' }, expected: { literal: 'specification' }, missingPolicy: 'unknown' }] : [])] },
            assert: configurationAssertion(c, specification), severity: sourceRule.severity, unknownPolicy: 'human-review',
            presentation: { title: `${sourceRule.message || sourceRule.rationale}${specification ? ' · по спецификации' : ''}`, group: capability },
            manual: { permission: sourceRule.permission, controlPaths: sourceRule.controlPaths },
          });
          return;
        }
        if (constraint.type==='transitionInvariant' && constraint.transition) {
          const id='t_'+stableHash({sourceRuleId:sourceRule.id,constraintIndex}).slice(0,16),prefix=`transitionsV1.${id}`;
          transitions.push({id,sourceRuleId:sourceRule.id,fact:constraint.fact!,transition:constraint.transition});
          rules.push({schemaVersion:'apollo.rule-ir.v1',ruleId:`${sourceRule.id}.${capabilityIndex+1}.${constraintIndex+1}`,
            revision:manual.metadata.revision,source:{path:'contract.manual.json',checksum:manualSourceHash,anchor:sourceRule.id},
            authority:{status:sourceRule.status==='reviewed'?'active':sourceRule.status,provenance:sourceRule.owner},
            effect:'require',scope:scopeFor(sourceRule),select:{from:'selection-root',traverse:'self'},
            when:{predicate:'all',args:[...(conditionFor(sourceRule)?[conditionFor(sourceRule)]:[]),availabilityEquals(`${prefix}.applicable`,true)]},
            assert:{predicate:'approximately-equals',actual:{fact:`${prefix}.after`},expected:{fact:`${prefix}.before`},tolerance:constraint.transition.tolerance,missingPolicy:'unknown'},
            severity:sourceRule.severity,unknownPolicy:'human-review',
            presentation:{title:sourceRule.message||sourceRule.rationale,group:capability,transitionId:id},
            manual:{permission:sourceRule.permission,controlPaths:sourceRule.controlPaths},
          });
          return;
        }
        if (constraint.type === 'dependencyDomain' && constraint.dependency) {
          const dependency = constraint.dependency;
          dependency.subjects.forEach((subject, subjectIndex) => {
            const binding = dependencyBinding(subject, constraint);
            dependencyBindings.set(binding.id, {...dependencyBindings.get(binding.id), ...binding});
            const prefix = `dependencies.${binding.id}`;
            const domain = (values: unknown[]) => dependency.tolerance !== undefined
              ? {predicate:'any',args:values.map(value => ({predicate:'between',actual:{fact:`${prefix}.${dependency.field}`},
                lower:{literal:Number(value)-dependency.tolerance!},upper:{literal:Number(value)+dependency.tolerance!},bounds:'inclusive',missingPolicy:'unknown'}))}
              : {predicate:'one-of',actual:{fact:`${prefix}.${dependency.field}`},expected:{literal:values},missingPolicy:'unknown'};
            const assert = dependency.cases ? {predicate:'any',args:dependency.cases.map(c => ({predicate:'all',args:[
              c.context ? {predicate:'all',args:[
                {predicate:'one-of',actual:{fact:dependency.sourceFact},expected:{literal:c.when},missingPolicy:'unknown'},
                ...Object.entries(c.context).map(([fact,value]) => ({predicate:'equals',actual:{fact},expected:{literal:value},missingPolicy:'unknown'})),
              ]} : {predicate:'one-of',actual:{fact:dependency.sourceFact},expected:{literal:c.when},missingPolicy:'unknown'}, domain(c.values),
            ]}))} : domain(constraint.values || []);
            const conditions: unknown[] = [availabilityEquals(`${prefix}.applicable`, true)];
            if (dependency.subjectCondition) conditions.push(availabilityEquals(`${prefix}.subjectMatches`, true));
            if (dependency.catalogs) conditions.push({predicate:'one-of',actual:{fact:`${prefix}.catalog`},expected:{literal:dependency.catalogs},missingPolicy:'unknown'});
            if (dependency.activePorts) conditions.push({predicate:'one-of',actual:{fact:`${prefix}.portName`},expected:{literal:dependency.activePorts},missingPolicy:'unknown'});
            if (conditionFor(sourceRule)) conditions.push(conditionFor(sourceRule));
            if (dependency.baselinePolicy === 'allow-unchanged') conditions.push(availabilityEquals(`${prefix}.changed`, true));
            rules.push({
              schemaVersion:'apollo.rule-ir.v1',ruleId:`${sourceRule.id}.${capabilityIndex+1}.${constraintIndex+1}.${subjectIndex+1}`,
              revision:manual.metadata.revision,source:{path:'contract.manual.json',checksum:manualSourceHash,anchor:sourceRule.id},
              authority:{status:sourceRule.status==='reviewed'?'active':sourceRule.status,provenance:sourceRule.owner},
              effect:'require',scope:scopeFor(sourceRule),select:{from:'selection-root',traverse:'self'},
              when:{predicate:'all',args:conditions},assert,severity:sourceRule.severity,unknownPolicy:'human-review',
              presentation:{title:sourceRule.message||sourceRule.rationale,group:`${capability} · ${subject.targetRole}`,
                ...(['portName','width','height','variantProperty'].includes(dependency.field)?{dependency:{bindingId:binding.id,field:dependency.field,targetRole:subject.targetRole,...(dependency.property?{property:dependency.property}:{}),...(dependency.contractDependencyId?{contractDependencyId:dependency.contractDependencyId}:{})}}:{})},
              manual:{permission:sourceRule.permission,controlPaths:sourceRule.controlPaths},
            });
          });
          return;
        }
        const assertion = assertionFor(constraint, target, capability, rootAliases);

        if (!assertion.expression) {
          nonExecutableRules.push({
            id: `${sourceRule.id}.${constraintIndex + 1}`,
            sourceRuleId: sourceRule.id,
            reason: assertion.reason || 'Unsupported constraint.',
          });
          return;
        }
        const ruleId = [sourceRule.id, capabilityIndex + 1, constraintIndex + 1].join('.');
        const conditions: unknown[] = conditionFor(sourceRule) ? [conditionFor(sourceRule)] : [];
        if (constraint.type==='bindingConsistency') conditions.push(
          {predicate:'equals',actual:{fact:'visibility.effective'},expected:{literal:true}},
          {predicate:'equals',actual:{fact:'variantAvailability.targets.root.present'},expected:{literal:true}},
        );
        if (constraint.exceptConfiguration) {
          const roles = constraint.exceptConfiguration.targetRoles;
          conditions.push(...roles.map(role => availabilityEquals(`semanticTargets.${role}.resolved`, true)));
          conditions.push(configurationExclusion(roles));
        }
        const activity = constraint.type === 'propertyForbidden'
          ? propertyApplicabilityCondition(sourceRule, constraint.fact || factForCapability(capability)) : undefined;
        if (activity) conditions.push(activity);
        const eq = (fact: string, value: boolean) => ({ predicate: 'equals', actual: { fact }, expected: { literal: value } });
        if (constraint.targetRoles?.length) {
          conditions.push(...constraint.targetRoles.map(role => eq(`semanticTargets.${role}.resolved`, true)));
          if (constraint.visibleOnly) conditions.push(...constraint.targetRoles.map(role => eq(`semanticTargets.${role}.visibilityKnown`, true)));
        }
        if (variantEvidence && assertion.selectRoot && !constraint.targetRoles?.length && !constraint.contractDependencyId && ['presence','quantity'].includes(constraint.type)) {
          conditions.push(eq(`semanticTargets.${constraint.targetRole || target.semanticRole}.resolved`,true));
        }
        const configured = sourceRule.propertyConformance === CONFIGURED_NATIVE_PROPERTY_POLICY;
        const select = configured ? { from: 'selection-root', traverse: 'self' } as Record<string, unknown> : assertion.selectRoot ? { from: 'selection-root', traverse: 'self' } as Record<string, unknown>
          : targetSelector(target, sourceRule.targetScope || 'self', activity ? undefined : assertion.baselineApplicabilityFact, rootAliases);
        if (constraint.type === 'styleBinding') {
          (select.where as unknown[]).push({predicate:'equals',actual:{fact:'type'},expected:{literal:'TEXT'}});
          // styleBinding constrains rendered text, not hidden content.
          conditions.push(eq('visibility.effective', true));
        }
        if (constraint.type === 'layoutConstraint' && constraint.fact === 'text.textAlignHorizontal') {
          (select.where as unknown[]).push({predicate:'equals',actual:{fact:'type'},expected:{literal:'TEXT'}});
          conditions.push(eq('visibility.effective', true));
        }
        if (variantEvidence && !assertion.selectRoot && !configured) {
          applyVariantTargetAvailability(select, conditions, target);
          const fact = availabilityFactFor(constraint, capability);
          const propertyCondition = propertyAvailabilityCondition(fact);
          if (propertyCondition) conditions.push(propertyCondition);
        }
        applyExplicitRuleScope(select, conditions, sourceRule, target);
        applyValidationModeFallback(select, sourceRule);
        const rootCondition = sourceRule.applicability.conditionSubject === 'component-root' ? conditionFor(sourceRule) : undefined;
        const rootTarget = manual.targets.find(isDeclaredRootTarget);
        if (manual.metadata.declaredTargetIdentityVersion === 3 && !assertion.selectRoot && !configured && rootCondition && rootTarget) {
          // A proven false host condition excludes the rule without claiming child absence.
          select.where = [{predicate:'any',args:[{predicate:'all',args:select.where},
            {predicate:'all',args:[availabilityEquals(`declaredTargetMembershipV1.${declaredTargetMembershipKey(rootTarget.id)}`,true),{predicate:'not',args:[rootCondition]}]}]}];
        }
        const rule: RuleIr = {
          schemaVersion: 'apollo.rule-ir.v1',
          ruleId,
          revision: manual.metadata.revision,
          source: {
            path: 'contract.manual.json',
            checksum: manualSourceHash,
            anchor: sourceRule.id,
          },
          authority: {
            status: sourceRule.status === 'reviewed' ? 'active' : sourceRule.status,
            provenance: sourceRule.owner || 'design-system-authors',
          },
          effect: 'require',
          scope: scopeFor(sourceRule),
          select,
          when: activity || constraint.exceptConfiguration || constraint.targetRoles?.length || variantEvidence || sourceRule.boundaryPolicy || sourceRule.targetApplicability
            ? (conditions.length ? { predicate: 'all', args: conditions } : undefined) : conditionFor(sourceRule),
          assert: configured ? configuredNativeExpression({ ...assertion.expression, missingPolicy: 'unknown' }, typeof constraint.values?.[0] === 'boolean' ? 'BOOLEAN' : 'VARIANT')
            : activity ? { ...assertion.expression, missingPolicy: 'unknown' } : assertion.expression,
          severity: sourceRule.severity,
          unknownPolicy: 'human-review',
          remediation: sourceRule.remediationIntent
            ? { kind: sourceRule.remediationIntent, safety: 'compiler-review-required' }
            : null,
          presentation: {
            title: sourceRule.message || sourceRule.rationale || sourceRule.id,
            group: capability,
            ...(constraint.type === 'styleBinding' ? { textStyleBinding: true } : {}),
            remediation: sourceRule.remediationMessage,
            ...(activity ? { propertyApplicability: sourceRule.propertyApplicability?.[(constraint.fact || factForCapability(capability)) as keyof NonNullable<ManualRule['propertyApplicability']>] } : {}),
            ...(configured ? { propertyConformance: CONFIGURED_NATIVE_PROPERTY_POLICY } : {}),
            ...(sourceRule.boundaryPolicy ? { boundaryPolicy: sourceRule.boundaryPolicy } : {}),
            ...(sourceRule.targetApplicability ? { targetApplicability: sourceRule.targetApplicability } : {}),
          },
          manual: {
            permission: sourceRule.permission,
            targetScope: sourceRule.targetScope || 'self',
            controlPaths: sourceRule.controlPaths,
          },
        };
        rules.push(rule);
      });
    });
  }

  rules.sort((left, right) => left.ruleId.localeCompare(right.ruleId));
  for (const rule of rules) {
    const source = manual.rules.find(entry => entry.id === (rule.source as Record<string, unknown>)?.anchor);
    if (source?.ownership) rule.manual = { ...(rule.manual as Record<string, unknown>), ownership: source.ownership };
  }
  nonExecutableRules.sort((left, right) => left.id.localeCompare(right.id));
  const capabilityParts = rules.map(sourceCapabilities);
  const dependencyCompositionIds = uniqueSorted(manual.rules.filter(r=>r.status!=='deprecated').flatMap(r => [
    ...(r.applicability.activeDependency ? [r.applicability.activeDependency] : []),
    ...r.constraints.flatMap(c=>c.contractDependencyId ? [c.contractDependencyId] : []),
    ...r.constraints.flatMap(c=>c.transition ? [c.transition.dependencyId] : []),
  ]));
  const contract: CompiledContract = {
    schemaVersion: COMPILED_SCHEMA_VERSION,
    documentType: 'component-contract',
    package: {
      id: manual.component.contractId,
      componentId: manual.component.componentId,
      family: manual.component.family,
      library: manual.component.library,
      sourcePath: 'contract.manual.json',
      sourceGeneratedAt: manual.metadata.updatedAt || manual.metadata.createdAt || manual.source.importedAt,
      // Last compiler-output revision; presentation-only Editor patches keep
      // compiled bytes and pinned dependency hashes stable.
      sourceExportVersion: rootAliases.size ? 'component-contract-editor@0.2.80' : manual.rules.some(r => r.constraints.some(c => c.type === 'positionOrder' && c.orderScope === 'structural')) ? 'component-contract-editor@0.2.60' : manual.rules.some(r => r.constraints.some(c => c.type === 'bindingConsistency')) ? 'component-contract-editor@0.2.59' : manual.rules.some(r => r.constraints.some(c => c.fact === 'appearance.effectDetailsV1' || c.dependency?.cases?.some(c => c.context))) ? 'component-contract-editor@0.2.52' : manual.validationContext || manual.rules.some(r => r.constraints.some(c => c.mapping)) ? 'component-contract-editor@0.2.51' : configurations ? 'component-contract-editor@0.2.49' : manual.rules.some(r => r.applicability.validationMode) ? 'component-contract-editor@0.2.47' : manual.semanticApi.some(p => p.validationInput) ? 'component-contract-editor@0.2.46' : manual.metadata.ruleOwnershipVersion === 1 ? 'component-contract-editor@0.2.45' : manual.rules.some(r => r.targetScope === 'descendants') ? 'component-contract-editor@0.2.42' : transitions.length ? 'component-contract-editor@0.2.41' : semanticTargetVisibility ? 'component-contract-editor@0.2.40' : dependencyCompositionIds.length ? 'component-contract-editor@0.2.39' : 'component-contract-editor@0.2.37',
      ...(componentDependencies.length ? {manualRevision:manual.metadata.revision} : {}),
      snapshotProfile: dependencyBindings.size ? 'dependency-facts-v5' : variantEvidence ? 'variant-facts-v4' : 'component-facts-v2',
      ...(variantEvidence ? { generatedFactsHash: stableHash(variantEvidence) } : {}),
      manualSourceHash,
    },
    status: issues.some((issue) => issue.level === 'error') || nonExecutableRules.length > 0 || manual.rules.some((rule) => rule.status !== 'reviewed' && rule.status !== 'deprecated')
      ? 'draft'
      : 'ready',
    ...(componentDependencies.length ? {componentDependencies} : {}),
    facts: {
      ...(memberCollections.length ? {memberCollections} : {}),
      ...(manual.rules.some(r=>r.constraints.some(c=>c.type==='bindingConsistency')) ? {
        textBindingComparisons:manual.rules.filter(r=>r.status!=='deprecated').flatMap(r=>r.constraints.filter(c=>c.type==='bindingConsistency')),
      } : {}),
      ...(transitions.length ? {transitions} : {}),
      ...(dependencyCompositionIds.length ? {dependencyCompositionIds} : {}),
      ...(dependencyBindings.size ? {dependencyBindings:[...dependencyBindings.values()].sort((a,b)=>a.id.localeCompare(b.id))} : {}),
      ...(variantEvidence ? { variantEvidence } : {}),
      component: manual.component,
      semantics: manual.semantics,
      representations: manual.representations,
      semanticApi: manual.semanticApi,
      ...(manual.validationContext ? { validationContext: manual.validationContext } : {}),
      documentation: manual.documentation,
      examples: manual.examples,
      decisions: manual.decisions,
      generation: manual.generation,
      targets: manual.targets,
      controlPorts: manual.controlPorts,
    },
    customizationPolicy: manual.rules.map((rule) => ({
      id: rule.id,
      targetId: rule.targetId,
      ...(rule.targetScope ? { targetScope: rule.targetScope } : {}),
      ...(rule.boundaryPolicy ? { boundaryPolicy: rule.boundaryPolicy } : {}),
      ...(rule.targetApplicability ? { targetApplicability: rule.targetApplicability } : {}),
      capability: rule.capability,
      ...(rule.capabilitySet ? { capabilitySet: rule.capabilitySet } : {}),
      ...(rule.capabilitySelection ? { capabilitySelection: rule.capabilitySelection } : {}),
      ...(rule.propertyApplicability ? { propertyApplicability: rule.propertyApplicability } : {}),
      ...(rule.propertyConformance ? { propertyConformance: rule.propertyConformance } : {}),
      permission: rule.permission,
      controlPaths: rule.controlPaths,
      applicability: rule.applicability,
      severity: rule.severity,
      status: rule.status,
      owner: rule.owner,
      ...(rule.sourceRefs?.length ? { sourceRefs: rule.sourceRefs } : {}),
      ...(rule.ownership ? { ownership: rule.ownership } : {}),
      execution: rule.execution || { route: 'auto' },
    })).sort((left, right) => left.id.localeCompare(right.id)),
    rules,
    nonExecutableRules,
    capabilities: {
      selectors: uniqueSorted(capabilityParts.flatMap((part) => part.selectors)),
      facts: uniqueSorted(capabilityParts.flatMap((part) => part.facts)),
      operators: uniqueSorted(capabilityParts.flatMap((part) => part.operators)),
      remediations: uniqueSorted(capabilityParts.flatMap((part) => part.remediations)),
    },
    coverage: {
      ...(manual.metadata.ruleOwnershipVersion === 1 ? { byOwnership: {
        component: manual.rules.filter(r => r.status !== 'deprecated' && ruleOwnershipGroup(r, manual.component.componentId) === 'component').length,
        usage: manual.rules.filter(r => r.status !== 'deprecated' && ruleOwnershipGroup(r, manual.component.componentId) === 'usage').length,
        unclassified: manual.rules.filter(r => r.status !== 'deprecated' && ruleOwnershipGroup(r, manual.component.componentId) === 'unclassified').length,
      } } : {}),
      sourceRules: manual.rules.length,
      policyRules: manual.rules.length,
      policyOnlyRules: manual.rules.filter((rule) => rule.permission === 'allowed').length,
      compiledRules: rules.length,
      nonExecutableRules: nonExecutableRules.length,
      byConstraintType: Object.fromEntries(
        Object.entries(byConstraintType).sort(([left], [right]) => left.localeCompare(right)),
      ),
      byExecutionRoute: Object.fromEntries(
        Object.entries(byExecutionRoute).sort(([left], [right]) => left.localeCompare(right)),
      ),
    },
    runtimePolicy: {
      ...(manual.rules.some(r => r.propertyConformance === CONFIGURED_NATIVE_PROPERTY_POLICY) ? { configuredNativePropertyConformanceVersion: 1 as const } : {}),
      ...(rootAliases.size ? {rootTargetAliasesVersion: 1 as const} : {}),
      ...(manual.rules.some(r=>r.constraints.some(c=>c.dependency?.subjectCondition)) ? {dependencySubjectConditionsVersion:1 as const} : {}),
      ...([...dependencyBindings.values()].some(b=>b.identityLock) ? {assetIdentityLockVersion:1 as const,instanceMainComponentAliasesVersion:1 as const} : {}),
      ...(manual.metadata.instanceMainComponentAliasesVersion === 1 ? {instanceMainComponentAliasesVersion:1 as const} : {}),
      ...(memberCollections.length ? {memberCollectionsVersion: 1 as const, occurrenceAddressVersion: 1 as const} : {}),
      ...(manual.componentDependencies?.some(d=>d.bindings.some(b=>b.kind==='direct-child')) ? {directChildDependenciesVersion:1 as const,occurrenceAddressVersion:1 as const} : {}),
      ...(variantEvidence?.occurrenceAddressVersion===1 || manual.targets.some(t=>t.variantHints?.length) ? {occurrenceAddressVersion:1 as const} : {}),
      ...(manual.targets.some(t => t.variantContinuity) ? { variantTextTargetsVersion: 1 as const } : {}),
      ...(manual.targets.some(t => t.nativeSourceContinuity) ? { nativeSourceContinuityVersion: 1 as const } : {}),
      ...(manual.metadata.dependencyCompletionVersion === 1 ? { dependencyCompletionVersion: 1 as const } : {}),
      ...(manual.rules.some(r => r.constraints.some(c => c.type === 'positionOrder' && c.orderScope === 'structural')) ? { structuralOrderFactsVersion: 1 as const } : {}),
      engine: 'apollo-predicate-engine',
      unknownPolicy: 'fail-closed',
      ...(manual.rules.some(r => r.constraints.some(c => c.type === 'styleBinding')) ? { textStyleBindingFactsVersion: 1 as const } : {}),
      ...(manual.rules.some(r => r.constraints.some(c => c.type === 'bindingConsistency')) ? { textBindingIdentityFactsVersion: 1 as const } : {}),
      compiledIsSourceOfTruth: false,
      ...(configurations || manual.rules.some(r => r.applicability.validationMode === 'specification') ? { validationModeVersion: 1 as const } : {}),
      ...(manual.validationContext || manual.semanticApi.some(p => p.validationInput?.version === 2) ? { validationIntentVersion: 2 as const } : manual.semanticApi.some(p => p.validationInput?.version === 1) ? { validationIntentVersion: 1 as const } : {}),
      ...(manual.metadata.ruleOwnershipVersion === 1 ? { ruleOwnershipVersion: 1 as const } : {}),
      ...(manual.rules.some(r=>r.status!=='deprecated'&&r.constraints.some(c=>c.type==='instanceReplacementDomain')) ? {nativeInstanceReplacementsVersion:1 as const,nativeInstanceReplacements:manual.rules.filter(r=>r.status!=='deprecated').flatMap(r=>r.constraints.filter(c=>c.type==='instanceReplacementDomain'&&c.replacement).map(c=>({id:replacementId(r.id,c.replacement!.targetRole),sourceRuleId:r.id,targetRole:c.replacement!.targetRole,propertyNames:[...new Set(c.replacement!.alternatives.flatMap(a=>Object.keys(a.properties||{})))]})))} : {}),
      gradientPaintFactsVersion: 1,
      ...(manual.rules.some(r => r.constraints.some(c => c.type === 'tokenBinding' && /^paintBindingsV1\.(fill|stroke)$/.test(c.fact || ''))) ? { paintBindingFactsVersion: 1 as const } : {}),
      ...(manual.rules.some(r => r.controlPaths.some(p => p.kind === 'slot-api' && p.property)) ? { slotTargetFactsVersion: 1 as const } : {}),
      ...(manual.rules.some(r => r.status !== 'deprecated' && r.controlPaths.some(p => {
        if (p.kind !== 'slot-api' || !p.property || p.contentOwnership !== 'external') return false;
        // Existing BOOLEAN swap contracts must compile byte-for-byte as before.
        // Native content is explicit in the new capability or read-only anatomy;
        // this does not prove the live boundary (the runtime does that separately).
        if (r.capability === 'composition.content') return true;
        const target = manual.targets.find(t => t.id === p.target);
        const paths = [target?.pathHint, ...(target?.representationHints || []).map(h => h.pathHint)]
          .filter((path): path is string => !!path).map(path => path.split(' / ').slice(1).join(' / '));
        return Object.values(variantEvidence?.structures || {}).some(nodes =>
          nodes.some(node => node.type === 'SLOT' && paths.includes(node.path)));
      })) ? { nativeSlotTargetsVersion: 1 as const } : {}),
      ...(configurations || semanticTargetVisibility || manual.rules.some(rule => rule.boundaryPolicy || rule.targetApplicability || rule.constraints.some(c => c.mapping || (c.type==='propertyForbidden' && c.targetRoles?.length))) ? { ruleScopeFactsVersion: 1 as const } : {}),
      ...(semanticTargetVisibility ? { semanticTargetVisibilityVersion: 1 as const } : {}),
      ...(transitions.length ? { transitionFactsVersion: 1 as const } : {}),
    },
  };
  if (manual.targets.some(t => t.variantContinuity)) contract.package.sourceExportVersion = 'component-contract-editor@0.2.61';
  if (manual.rules.some(r => r.controlPaths.some(p => p.ownerTargetId))) contract.package.sourceExportVersion = 'component-contract-editor@0.2.62';
  if (manual.rules.some(r => r.constraints.some(c => c.operator === 'at-most-line-height'))) contract.package.sourceExportVersion = 'component-contract-editor@0.2.63';
  if (manual.rules.some(r => r.constraints.some(c => c.type === 'propertyForbidden' && c.targetRoles?.length))) contract.package.sourceExportVersion = 'component-contract-editor@0.2.64';
  if (contract.runtimePolicy.nativeSlotTargetsVersion === 1) contract.package.sourceExportVersion = 'component-contract-editor@0.2.70';
  if (contract.runtimePolicy.occurrenceAddressVersion === 1) contract.package.sourceExportVersion = 'component-contract-editor@0.2.75';
  if (contract.runtimePolicy.directChildDependenciesVersion === 1) contract.package.sourceExportVersion = 'component-contract-editor@0.2.76';
  if (contract.runtimePolicy.memberCollectionsVersion === 1) contract.package.sourceExportVersion = 'component-contract-editor@0.2.77';
  if (contract.runtimePolicy.dependencySubjectConditionsVersion === 1) contract.package.sourceExportVersion = 'component-contract-editor@0.2.77';
  if (contract.runtimePolicy.rootTargetAliasesVersion === 1) contract.package.sourceExportVersion = 'component-contract-editor@0.2.80';
  if (assetIdentityLockSource) contract.package.sourceExportVersion = 'component-contract-editor@0.2.88';
  if (contract.runtimePolicy.instanceMainComponentAliasesVersion === 1) contract.package.sourceExportVersion = 'component-contract-editor@0.2.90';
  const representationFlags=representationFeatureFlags(manualRepresentationShape(manual));
  if(representationFlags.evidence)contract.runtimePolicy.representationEvidenceVersion=1;
  if(representationFlags.bindingVersion)contract.runtimePolicy.crossRepresentationBindingsVersion=representationFlags.bindingVersion;
  if(representationFlags.evidence||representationFlags.bindings)contract.package.sourceExportVersion='component-contract-editor@0.2.91';
  if ([1,2,3].includes(manual.metadata.declaredTargetIdentityVersion || 0)) {
    contract.runtimePolicy.declaredTargetIdentityVersion = manual.metadata.declaredTargetIdentityVersion;
    contract.package.sourceExportVersion = manual.metadata.declaredTargetIdentityVersion === 2 ? 'component-contract-editor@0.2.93' : 'component-contract-editor@0.2.92';
    bindDeclaredTargetRuleSelectors(contract);
  }
  if (contract.capabilities.facts.some(f => f.startsWith('textContentV1.'))) contract.runtimePolicy.textContentFactsVersion = 1;
  if (contract.capabilities.facts.some(f => f.startsWith('nativeTargetPropertiesV1.'))) contract.runtimePolicy.nativeTargetPropertyFactsVersion = 1;
  if (contract.runtimePolicy.textContentFactsVersion === 1 || contract.runtimePolicy.nativeTargetPropertyFactsVersion === 1) contract.package.sourceExportVersion = 'component-contract-editor@0.2.94';
  if (contract.runtimePolicy.declaredTargetIdentityVersion === 3) contract.package.sourceExportVersion = 'component-contract-editor@0.2.95';
  if (manual.metadata.declaredTargetConfigurationVersion === 1 || manual.metadata.declaredTargetConfigurationVersion === 2) {
    contract.runtimePolicy.declaredTargetConfigurationVersion = manual.metadata.declaredTargetConfigurationVersion;
    contract.package.sourceExportVersion = manual.metadata.declaredTargetConfigurationVersion === 2 ? 'component-contract-editor@0.2.103' : 'component-contract-editor@0.2.99';
  }

  if (contract.runtimePolicy.nativeInstanceReplacementsVersion===1) contract.package.sourceExportVersion='component-contract-editor@0.2.108';
  return decorateDependencyUsages(manual, { contract, issues });
}

export { assertDeclaredTargetContract } from './declared-target-identity';
export { assertNativeRuleFactPolicies } from './text-content-facts';
export { assertNativeInstanceReplacementPolicy } from './native-instance-replacements';
