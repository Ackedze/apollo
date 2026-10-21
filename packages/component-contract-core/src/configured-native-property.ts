import type { CompiledContract, ManualRule, ManualSource, PreviewSnapshot } from './types';
import { isDeclaredRootTarget } from './root-target';
import { propertyAvailabilityKey, variantAvailability } from './variant-facts';

export const CONFIGURED_NATIVE_PROPERTY_POLICY = 'configured-native@1' as const;
const PREFIX = 'configuredNativePropertiesV1.';
const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const owns = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const nameFor = (fact: unknown): string | undefined => typeof fact === 'string' && /^component\.properties\.[^.]+$/.test(fact)
  ? fact.slice('component.properties.'.length) : undefined;
const uncertain = (node: Record<string, any>, fact: string): boolean => {
  const paths = node.unknownFacts === undefined ? [] : node.unknownFacts;
  return !Array.isArray(paths) || paths.some(p => typeof p !== 'string' || p === fact || fact.startsWith(p + '.') || p.startsWith(fact + '.'));
};

/** Opt-in configuration conformance, not permission to remove a visual guard. */
export function configuredPropertyPolicyError(manual: ManualSource, rule: ManualRule): string | undefined {
  if (rule.propertyConformance === undefined) return;
  if (rule.propertyConformance !== CONFIGURED_NATIVE_PROPERTY_POLICY) return 'Unsupported configured property policy.';
  const targets = manual.targets.filter(t => t.id === rule.targetId);
  if (targets.length !== 1 || targets[0].resolution !== 'resolved' || !isDeclaredRootTarget(targets[0])
    || (rule.targetScope || 'self') !== 'self' || rule.capability !== 'component.configuration'
    || rule.capabilitySet || rule.permission !== 'constrained' || rule.boundaryPolicy || rule.targetApplicability || rule.propertyApplicability)
    return 'Configured native v1 requires a constrained root/self component.configuration domain rule without visual policies.';
  if (rule.applicability.conditionSubject === 'component-root' || rule.applicability.activeDependency
    || rule.applicability.validationMode || Object.keys(rule.applicability.context || {}).length || Object.keys(rule.applicability.contextDomains || {}).length)
    return 'Configured native v1 supports target native variant conditions, not scenario/dependency/validation-mode conditions.';
  if (!rule.constraints.length || rule.constraints.some(c => c.type !== 'propertyDomain' || !nameFor(c.fact)
    || !Array.isArray(c.values) || !c.values.length || c.values.some(v => !['boolean','string'].includes(typeof v))
    || new Set(c.values.map(v => typeof v)).size !== 1 || c.values.some(v => typeof v === 'string' && !v.trim())
    || Object.keys(c).some(k => !['type','fact','values'].includes(k))))
    return 'Configured native v1 accepts exact native BOOLEAN/VARIANT propertyDomain facts with one typed value domain.';
}

export function configuredNativeFact(fact: string, nativeType: 'BOOLEAN' | 'VARIANT'): string {
  const name = nameFor(fact);
  if (!name) throw new Error('CONFIGURED_NATIVE_PROPERTY_FACT_UNSUPPORTED');
  return PREFIX + (nativeType === 'BOOLEAN' ? 'booleanValues.' : 'variantValues.') + propertyAvailabilityKey(name);
}

/** Rewrite only native property references of the explicitly opted-in rule. */
export function configuredNativeExpression(value: any, nativeType: 'BOOLEAN' | 'VARIANT' = 'VARIANT'): any {
  if (Array.isArray(value)) return value.map(entry => configuredNativeExpression(entry, nativeType));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key,
    key === 'fact' && nameFor(entry) ? configuredNativeFact(entry as string, nativeType) : configuredNativeExpression(entry, nativeType)]));
}

/** Recompute from raw capture + independent reference. Incoming derived facts are never trusted. */
export function materializeConfiguredNativeProperties(source: PreviewSnapshot, prepared: PreviewSnapshot, contract: CompiledContract): void {
  for (const node of prepared.nodes) {
    delete node.configuredNativePropertiesV1;
    // Old reports/hash semantics stay unchanged when the new policy is absent.
    if (contract.runtimePolicy.configuredNativePropertyConformanceVersion === 1 && Array.isArray(node.unknownFacts))
      node.unknownFacts = node.unknownFacts.filter(p => typeof p !== 'string' || !p.startsWith('configuredNativePropertiesV1'));
  }
  if (contract.runtimePolicy.configuredNativePropertyConformanceVersion !== 1) return;
  if (source.selection.length !== 1 || new Set(source.nodes.map(n => n.id)).size !== source.nodes.length) return;
  const roots = source.nodes.filter(n => n.id === source.selection[0]);
  if (roots.length !== 1) return;
  const root = roots[0], output = prepared.nodes.find(n => n.id === root.id), ref = source.variantReference;
  const identity = record(record(root.component).identity), expected = ref?.nodeProperties?.['']?.identity;
  if (!output || root.type !== 'INSTANCE' || root.visible !== true || source.source?.truncated !== false
    || source.source.instanceIdentityVersion !== 1 || source.source.captureTopology?.complete !== true
    || !ref?.complete || !expected || typeof identity.mainComponentId !== 'string' || !identity.mainComponentId
    || expected.componentKey !== ref.componentKey || (expected.componentSetKey || '') !== ref.componentSetKey
    || identity.componentKey !== expected.componentKey || identity.mainComponentId !== expected.mainComponentId
    || (identity.componentSetKey || '') !== (expected.componentSetKey || '') || uncertain(root, 'component.identity')
    || uncertain(root, 'visible')) return;
  const availability = variantAvailability(source, contract);
  if (availability.status === 'unknown') return;
  const targetIds = contract.customizationPolicy.filter(p => p.propertyConformance === CONFIGURED_NATIVE_PROPERTY_POLICY).map(p => p.targetId);
  if (!targetIds.length || targetIds.some(id => {
    const targets = contract.facts.targets.filter(t => t.id === id), target = targets[0];
    const proof = target && availability.targets[target.semanticRole];
    return targets.length !== 1 || target.resolution !== 'resolved' || !isDeclaredRootTarget(target)
      || proof?.state !== 'present' || proof.path !== '';
  })) return;
  const booleanValues: Record<string, boolean> = {}, variantValues: Record<string, string> = {};
  const component = record(root.component), reference = ref.nodeProperties[''];
  const referenceProperties = record(reference.properties), referenceTypes = record(reference.propertyTypes);
  // A visually inactive native property still has a captured configured value.
  // Exact identities only: no friendly-name/alias/index fallback.
  for (const [name, value] of Object.entries(record(component.properties))) {
    const fact = 'component.properties.' + name, type = record(component.propertyTypes)[name];
    if (!nameFor(fact) || uncertain(root, fact) || uncertain(root, 'component.propertyTypes.' + name)
      || !owns(referenceProperties, name) || referenceTypes[name] !== type) continue;
    const expectedValue = referenceProperties[name];
    if (type === 'BOOLEAN' && typeof value === 'boolean' && typeof expectedValue === 'boolean')
      booleanValues[propertyAvailabilityKey(name)] = value;
    if (type === 'VARIANT' && typeof value === 'string' && value.trim() && typeof expectedValue === 'string' && expectedValue.trim())
      variantValues[propertyAvailabilityKey(name)] = value;
  }
  output.configuredNativePropertiesV1 = { booleanValues, variantValues };
}

export function assertConfiguredPropertyContract(contract: CompiledContract): void {
  const version = contract.runtimePolicy.configuredNativePropertyConformanceVersion;
  const markers = contract.rules.map(r => (r.presentation as Record<string, unknown>)?.propertyConformance).filter(v => v !== undefined);
  if (version !== undefined && version !== 1 || markers.some(m => m !== CONFIGURED_NATIVE_PROPERTY_POLICY)
    || markers.length && version !== 1) throw new Error('CONFIGURED_NATIVE_PROPERTY_RUNTIME_UNSUPPORTED');
}

/** The visual selector's empty result is not proof that a configured property is inactive. */
export function configuredCaptureUnknowns(result: Record<string, any>, contract: CompiledContract): void {
  if (contract.runtimePolicy.configuredNativePropertyConformanceVersion !== 1) return;
  const rules = new Set(contract.rules.filter(r => (r.presentation as any)?.propertyConformance === CONFIGURED_NATIVE_PROPERTY_POLICY).map(r => r.ruleId));
  for (const evaluation of result.evaluations) {
    if (rules.has(evaluation.ruleId) && evaluation.trace?.reason === 'selector matched no visible nodes') {
      evaluation.classification = 'human-review';
      evaluation.applicability = 'unknown';
      evaluation.trace = { ...evaluation.trace, reason: 'configured native root visibility/capture is unresolved', truth: 'unknown' };
    }
  }
  const missing = [...rules].filter(id => !result.evaluations.some((e: any) => e.ruleId === id));
  if (missing.length) result.configuredNativePropertyDiagnostics = missing.map(ruleId => ({ ruleId, truth: 'unknown', reason: 'configured native root capture is absent' }));
  const byClassification: Record<string, number> = {};
  for (const e of result.evaluations) byClassification[e.classification] = (byClassification[e.classification] || 0) + 1;
  result.coverage = { ...result.coverage, byClassification };
}
