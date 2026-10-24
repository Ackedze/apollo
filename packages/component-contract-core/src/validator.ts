import { declaredTargetIdentityErrors, nativeSourceContinuityErrors } from './declared-target-identity';
import { representationEvidenceErrors, manualRepresentationShape } from './representation-evidence';
import type { ManualSource, ValidationIssue } from './types';
import { capabilitiesForSet } from './capabilities';
import { configuredPropertyPolicyError } from './configured-native-property';
import { baselineFactsForRule, PROPERTY_APPLICABILITY } from './property-applicability';
import { validateComponentDependencies } from './component-dependencies';
import { validRuleOwnership } from './rule-ownership';
import { configurationErrors } from './configuration-domain';
import { allowsVisibleTargetPolicy } from './rule-scope-policy';
import { mappingErrors } from './configuration-mapping';
import { memberCollectionErrors } from './member-collections';
import { isDeclaredRootTarget } from './root-target';
import { replacementErrors, replacementContextMapped } from './native-instance-replacements';

const KNOWN_CONSTRAINTS = new Set([
  'propertyDomain',
  'propertyExclusion',
  'presence',
  'propertyForbidden',
  'quantity',
  'memberCollection',
  'positionOrder',
  'relationship',
  'tokenBinding',
  'styleBinding',
  'bindingConsistency',
  'layoutConstraint',
  'dependencyDomain',
  'transitionInvariant',
  'configurationDomain',
  'configurationMapping',
  'instanceReplacementDomain',
]);

export function validateManualSource(manual: ManualSource): ValidationIssue[] {
  const issues: ValidationIssue[] = validateComponentDependencies(manual);
  for(const message of representationEvidenceErrors(manualRepresentationShape(manual)))issues.push({level:'error',code:'REPRESENTATION_CODE_BINDING',path:'/representations',message});
  const error = (code: string, path: string, message: string) => {
    issues.push({ level: 'error', code, path, message });
  };
  const warning = (code: string, path: string, message: string) => {
    issues.push({ level: 'warning', code, path, message });
  };

  if (manual.schemaVersion !== 'apollo.component-contract.manual.v2-experimental') {
    error('SCHEMA_VERSION', '/schemaVersion', 'Unsupported manual source schema version.');
  }
  if (manual.metadata.instanceMainComponentAliasesVersion !== undefined && manual.metadata.instanceMainComponentAliasesVersion !== 1) {
    error('INSTANCE_MAIN_COMPONENT_ALIASES_VERSION', '/metadata/instanceMainComponentAliasesVersion', 'Unsupported native main identity aliases.');
  }
  if (manual.metadata.ruleOwnershipVersion !== undefined && manual.metadata.ruleOwnershipVersion !== 1) {
    error('RULE_OWNERSHIP_VERSION', '/metadata/ruleOwnershipVersion', 'Unsupported rule ownership model.');
  }
  if (manual.metadata.publicRepresentationBoundaryVersion !== undefined && manual.metadata.publicRepresentationBoundaryVersion !== 1) {
    error('PUBLIC_REPRESENTATION_BOUNDARY_VERSION', '/metadata/publicRepresentationBoundaryVersion', 'Unsupported public representation boundary.');
  }
  if (manual.metadata.publicRepresentationBoundaryVersion === 1 && !manual.representations.some(r =>
    r.kind === 'figma' && r.status !== 'deprecated' && (r.locator.componentKey || r.locator.componentSetKey))) {
    error('PUBLIC_REPRESENTATION_BOUNDARY_EMPTY', '/representations', 'An explicit public boundary requires at least one active Figma key.');
  }
  if (!manual.component.componentId.trim()) error('COMPONENT_SEMANTIC_ID', '/component/componentId', 'Stable componentId is required.');
  if (!manual.component.familyId.trim()) error('COMPONENT_FAMILY_ID', '/component/familyId', 'Stable familyId is required.');
  if (!manual.component.contractId.trim()) error('COMPONENT_ID', '/component/contractId', 'Contract id is required.');
  if (!manual.component.family.trim()) error('COMPONENT_FAMILY', '/component/family', 'Component family is required.');
  if (!manual.component.componentKey.trim()) {
    warning('COMPONENT_KEY', '/component/componentKey', 'Live Figma preview is unavailable without componentKey.');
  }
  if (!manual.semantics.purpose.trim()) warning('SEMANTICS_PURPOSE', '/semantics/purpose', 'Component purpose is empty.');

  const representationIds = new Set<string>();
  manual.representations.forEach((representation, index) => {
    const path = `/representations/${index}`;
    if (!representation.id.trim()) error('REPRESENTATION_ID', `${path}/id`, 'Representation id is required.');
    if (representationIds.has(representation.id)) error('REPRESENTATION_DUPLICATE', `${path}/id`, `Duplicate representation id: ${representation.id}.`);
    representationIds.add(representation.id);
    if (!representation.platform.trim()) error('REPRESENTATION_PLATFORM', `${path}/platform`, 'Representation platform is required.');
    if (!Object.keys(representation.locator).length) warning('REPRESENTATION_LOCATOR', `${path}/locator`, 'Representation locator is empty.');
  });

  const propertyIds = new Set<string>();
  manual.semanticApi.forEach((property, index) => {
    const path = `/semanticApi/${index}`;
    if (!property.id.trim()) error('SEMANTIC_PROPERTY_ID', `${path}/id`, 'Semantic property id is required.');
    if (propertyIds.has(property.id)) error('SEMANTIC_PROPERTY_DUPLICATE', `${path}/id`, `Duplicate semantic property id: ${property.id}.`);
    propertyIds.add(property.id);
    if (property.validationInput && (!(property.validationInput.version === 1 && property.valueType === 'boolean'
      || property.validationInput.version === 2 && property.valueType === 'enum' && Array.isArray(property.domain) && property.domain.length > 0
        && property.domain.every(v => typeof v === 'string' && v.trim()) && new Set(property.domain).size === property.domain.length)
      || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(property.id) || typeof property.validationInput.label !== 'string' || !property.validationInput.label.trim()
      || typeof property.validationInput.description !== 'string' || !property.validationInput.description.trim())) {
      error('VALIDATION_INPUT_INVALID', `${path}/validationInput`, 'Independent input requires boolean v1 or a finite string enum v2, a simple stable ID, label and description.');
    }
    property.bindings.forEach((binding, bindingIndex) => {
      if (!representationIds.has(binding.representationId)) {
        error('SEMANTIC_PROPERTY_REPRESENTATION', `${path}/bindings/${bindingIndex}/representationId`, `Unknown representation: ${binding.representationId}.`);
      }
      if (!binding.path.trim()) error('SEMANTIC_PROPERTY_PATH', `${path}/bindings/${bindingIndex}/path`, 'Binding path is required.');
      if ((!binding.ownedOccurrence && !binding.nativeSlotBinding && binding.targetId !== undefined) || binding.path === 'visibility.effective') {
        const target = manual.targets.filter(t => t.id === binding.targetId);
        const visibility = binding.path === 'visibility.effective' && property.kind === 'visibility' && property.valueType === 'boolean';
        const componentProperty = binding.path.startsWith('component.properties.') && ['variant', 'content', 'state'].includes(property.kind) && ['enum', 'string', 'boolean', 'content'].includes(property.valueType);
        if ((!visibility && !componentProperty)
          || ![undefined, 'identity'].includes(binding.transform)
          || target.length !== 1 || manual.targets.filter(t => t.semanticRole === target[0]?.semanticRole).length !== 1
          || manual.representations.find(r => r.id === binding.representationId)?.kind !== 'figma') {
          error('SEMANTIC_TARGET_BINDING', `${path}/bindings/${bindingIndex}`, 'Target binding requires one declared target, Figma representation and identity transform: effective visibility or a typed component property.');
        }
        if (property.bindings.filter(b => b.representationId === binding.representationId).length !== 1) {
          error('SEMANTIC_TARGET_BINDING_AMBIGUOUS', `${path}/bindings/${bindingIndex}`, 'A target-derived fact cannot share a representation with another binding.');
        }
      }
      if (binding.path === 'representation.surface' && binding.transform === 'identity') {
        const rep = manual.representations.find(r => r.id === binding.representationId);
        if (rep?.kind !== 'figma' || !rep.surface || !['enum', 'string'].includes(property.valueType)
          || (property.domain && !property.domain.includes(rep.surface))) {
          error('SEMANTIC_REPRESENTATION_SURFACE', `${path}/bindings/${bindingIndex}`, 'Surface identity binding requires an explicit Figma representation surface in the semantic domain.');
        }
      }
    });
  });

  if (manual.validationContext !== undefined) {
    const contexts = manual.validationContext;
    if (!Array.isArray(contexts)) error('VALIDATION_CONTEXT_INVALID', '/validationContext', 'Scenario context must be an array.');
    else {
      const ids = new Set(propertyIds);
      contexts.forEach((p, i) => {
        if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(p.id)
          || ids.has(p.id) || typeof p.label !== 'string' || !p.label.trim() || typeof p.description !== 'string' || !p.description.trim()
          || Object.keys(p).some(k => !['id', 'valueType', 'domain', 'label', 'description'].includes(k))
          || !(p.valueType === 'boolean' && p.domain === undefined || p.valueType === 'enum' && Array.isArray(p.domain)
            && p.domain.length > 0 && p.domain.every(v => typeof v === 'string' && v.trim()) && new Set(p.domain).size === p.domain.length)) {
          error('VALIDATION_CONTEXT_INVALID', `/validationContext/${i}`, 'Context needs a unique ID (not an API property), label, description and boolean or finite enum type. No bindings/defaults.');
        }
        if (p?.id) ids.add(p.id);
      });
    }
  }
  const documentIds = new Set<string>();
  manual.documentation.forEach((document, index) => {
    const path = `/documentation/${index}`;
    if (!document.id.trim()) error('DOCUMENT_ID', `${path}/id`, 'Documentation id is required.');
    if (documentIds.has(document.id)) error('DOCUMENT_DUPLICATE', `${path}/id`, `Duplicate document id: ${document.id}.`);
    documentIds.add(document.id);
    if (!document.path.trim()) error('DOCUMENT_PATH', `${path}/path`, 'Documentation path is required.');
  });

  const exampleIds = new Set<string>();
  manual.examples.forEach((example, index) => {
    const path = `/examples/${index}`;
    if (!example.id.trim()) error('EXAMPLE_ID', `${path}/id`, 'Example id is required.');
    if (exampleIds.has(example.id)) error('EXAMPLE_DUPLICATE', `${path}/id`, `Duplicate example id: ${example.id}.`);
    exampleIds.add(example.id);
    example.ruleIds?.forEach((ruleId, ruleIndex) => {
      if (!manual.rules.some((rule) => rule.id === ruleId)) {
        warning('EXAMPLE_RULE', `${path}/ruleIds/${ruleIndex}`, `Example references unknown rule: ${ruleId}.`);
      }
    });
  });

  const decisionIds = new Set<string>();
  const retiredRuleIds = new Set<string>();
  manual.decisions.forEach((decision, index) => {
    const path = `/decisions/${index}`;
    if (!decision.id.trim()) error('DECISION_ID', `${path}/id`, 'Decision id is required.');
    if (decisionIds.has(decision.id)) error('DECISION_DUPLICATE', `${path}/id`, `Duplicate decision id: ${decision.id}.`);
    decisionIds.add(decision.id);
    if (!decision.summary.trim()) error('DECISION_SUMMARY', `${path}/summary`, 'Decision summary is required.');
    for (const id of decision.retiredRuleIds || []) {
      if (!id || decision.status !== 'accepted' || !decision.rationale.trim() || retiredRuleIds.has(id) || manual.rules.some(r=>r.id===id)) {
        error('DECISION_RETIREMENT', `${path}/retiredRuleIds`, 'Retirement requires an accepted reason and a unique, non-active RuleID.');
      }
      retiredRuleIds.add(id);
    }
  });

  const profileIds = new Set<string>();
  manual.generation.profiles.forEach((profile, index) => {
    const path = `/generation/profiles/${index}`;
    if (!profile.id.trim()) error('GENERATION_PROFILE_ID', `${path}/id`, 'Generation profile id is required.');
    if (profileIds.has(profile.id)) error('GENERATION_PROFILE_DUPLICATE', `${path}/id`, `Duplicate generation profile id: ${profile.id}.`);
    profileIds.add(profile.id);
    if (!representationIds.has(profile.representationId)) {
      error('GENERATION_REPRESENTATION', `${path}/representationId`, `Unknown representation: ${profile.representationId}.`);
    }
    for (const id of Object.keys(profile.properties)) {
      if (manual.semanticApi.find(p => p.id === id)?.bindings.some(b => b.representationId === profile.representationId && b.targetId)) {
        error('GENERATION_READ_ONLY_FACT', `${path}/properties/${id}`, 'Target-derived visibility is read-only; use the configured component property for generation.');
      }
    }
  });

  for (const message of declaredTargetIdentityErrors({version:manual.metadata.declaredTargetIdentityVersion,configurationVersion:manual.metadata.declaredTargetConfigurationVersion,targets:manual.targets,representations:manual.representations})) {
    error('DECLARED_TARGET_IDENTITY', '/targets', message);
  }
  for (const message of nativeSourceContinuityErrors(manual.targets)) error('TARGET_NATIVE_SOURCE_CONTINUITY', '/targets', message);
  if (manual.targets.some(t => t.nativeSourceContinuity) && manual.metadata.declaredTargetIdentityVersion !== undefined)
    error('TARGET_NATIVE_SOURCE_CONTINUITY', '/targets', 'Native source continuity v1 does not support declared identity ledgers.');
  const targetIds = new Set<string>();
  const roles = new Set<string>();
  manual.targets.forEach((target, index) => {
    const path = `/targets/${index}`;
    if (target.variantContinuity) {
      const c = target.variantContinuity, anchors = manual.targets.filter(t => t.id === c.anchorTargetId);
      if (c.kind !== 'same-family-text' || anchors.length !== 1 || c.anchorTargetId === target.id || anchors[0].variantContinuity) {
        error('TARGET_VARIANT_CONTINUITY', `${path}/variantContinuity`, 'Text continuity requires one distinct non-delegated anchor target.');
      } else for (const rep of manual.representations.filter(r => r.kind === 'figma' && r.status !== 'deprecated')) {
        const hint = (t: typeof target) => t.representationHints?.find(h => h.representationId === rep.id)?.pathHint || t.pathHint;
        const child = hint(target), parent = hint(anchors[0]);
        if (!child || !parent || !child.startsWith(parent + ' / ')) error('TARGET_VARIANT_CONTINUITY', `${path}/variantContinuity`, `Text must be inside its anchor in ${rep.id}.`);
      }
    }
    if (!target.id.trim()) error('TARGET_ID', `${path}/id`, 'Target id is required.');
    if (targetIds.has(target.id)) error('TARGET_DUPLICATE', `${path}/id`, `Duplicate target id: ${target.id}.`);
    targetIds.add(target.id);
    if (!target.semanticRole.trim()) error('TARGET_ROLE', `${path}/semanticRole`, 'Semantic role is required.');
    if (roles.has(target.semanticRole)) {
      warning('TARGET_ROLE_DUPLICATE', `${path}/semanticRole`, `Semantic role is not unique: ${target.semanticRole}.`);
    }
    roles.add(target.semanticRole);
    if (target.resolution && target.resolution !== 'resolved') {
      warning('TARGET_UNRESOLVED', path, `Target resolution is ${target.resolution}.`);
    }
    target.representationHints?.forEach((hint, hintIndex) => {
      if (!representationIds.has(hint.representationId)) {
        error('TARGET_REPRESENTATION', `${path}/representationHints/${hintIndex}/representationId`, `Unknown representation: ${hint.representationId}.`);
      }
    });
    target.variantHints?.forEach((hint,hintIndex)=>{
      const hintPath=`${path}/variantHints/${hintIndex}`;
      const rep=manual.representations.find(r=>r.id===hint.representationId);
      if(!rep || rep.kind!=='figma')error('TARGET_VARIANT_REPRESENTATION',hintPath,'Variant hint requires a known Figma representation.');
      if(typeof hint.componentKey!=='string' || !hint.componentKey.trim() || typeof hint.pathHint!=='string' || !hint.pathHint.trim()
        || hint.pathHint.split(' / ').some(p=>p.startsWith('@catalog:') || p.startsWith('@local:')))
        error('TARGET_VARIANT_HINT',hintPath,'Variant hint requires a library variant key and a reviewed reference address; local/catalog IDs are not source identity.');
      if(target.variantHints!.filter(h=>h.representationId===hint.representationId && h.componentKey===hint.componentKey).length!==1)
        error('TARGET_VARIANT_HINT_DUPLICATE',hintPath,'One target may have only one address per representation and library variant.');
    });
  });

  const portIds = new Set<string>();
  manual.controlPorts.forEach((port, index) => {
    const path = `/controlPorts/${index}`;
    if (!port.id.trim()) error('PORT_ID', `${path}/id`, 'Control port id is required.');
    if (portIds.has(port.id)) error('PORT_DUPLICATE', `${path}/id`, `Duplicate control port: ${port.id}.`);
    portIds.add(port.id);
    if (!targetIds.has(port.targetId)) error('PORT_TARGET', `${path}/targetId`, `Unknown target: ${port.targetId}.`);
  });

  const ruleIds = new Set<string>();
  manual.rules.forEach((rule, index) => {
    const path = `/rules/${index}`;
    if (rule.ownership !== undefined && !validRuleOwnership(rule.ownership, manual.component.componentId)) {
      error('RULE_OWNERSHIP', `${path}/ownership`, 'Choose normative responsibility and a nonempty owner ID. A component rule must belong to this componentId.');
    } else if (manual.metadata.ruleOwnershipVersion === 1 && rule.status !== 'deprecated' && !rule.ownership) {
      // Migration metadata must not suppress an otherwise valid existing constraint.
      // Saving a reviewed edit is gated separately; readiness/coverage remain incomplete.
      warning('RULE_OWNERSHIP_REQUIRED', `${path}/ownership`, 'Normative ownership is not classified. It cannot be inferred from the rule ID or Product.');
    }
    if (!rule.id.trim()) error('RULE_ID', `${path}/id`, 'Rule id is required.');
    if (ruleIds.has(rule.id)) error('RULE_DUPLICATE', `${path}/id`, `Duplicate rule id: ${rule.id}.`);
    ruleIds.add(rule.id);
    if (!targetIds.has(rule.targetId)) error('RULE_TARGET', `${path}/targetId`, `Unknown target: ${rule.targetId}.`);
    if (rule.targetScope && !['self', 'self-and-descendants', 'descendants'].includes(rule.targetScope)) {
      error('RULE_TARGET_SCOPE', `${path}/targetScope`, `Unknown target scope: ${rule.targetScope}.`);
    }
    if (rule.targetScope === 'descendants' && rule.constraints.some(c => !['propertyDomain', 'propertyExclusion', 'propertyForbidden', 'tokenBinding', 'styleBinding'].includes(c.type))) {
      error('RULE_DESCENDANT_CONSTRAINT', `${path}/constraints`, 'Descendants-only scope currently supports property domains and effective-baseline comparisons, not root-level structural or dependency assertions.');
    }
    const baselineOnly = rule.permission !== 'allowed' && (rule.constraints.length
      ? rule.constraints.every(constraint => constraint.type === 'propertyForbidden') : rule.permission === 'forbidden');
    const openSlot = manual.rules.some(policy => policy.status !== 'deprecated' && ['allowed', 'constrained'].includes(policy.permission)
      && policy.controlPaths.some(control => control.kind === 'slot-api' && control.target === policy.targetId && control.property?.trim()
        && control.contentOwnership === 'external'));
    if (rule.boundaryPolicy !== undefined && (rule.boundaryPolicy !== 'component-owned@1'
      || !['self-and-descendants', 'descendants'].includes(rule.targetScope || 'self') || !baselineOnly || (!manual.componentDependencies?.length && !openSlot && !manual.rules.some(r=>r.status!=='deprecated'&&r.constraints.some(c=>c.type==='instanceReplacementDomain'))))) {
      error('RULE_BOUNDARY_POLICY', `${path}/boundaryPolicy`, 'Component-owned policy requires recursive baseline comparisons and explicit component dependencies or an explicitly open slot.');
    }
    if (rule.targetApplicability !== undefined && (rule.targetApplicability !== 'visible-target@1'
      || !allowsVisibleTargetPolicy(rule))) {
      error('RULE_TARGET_APPLICABILITY', `${path}/targetApplicability`, 'Visible-target policy applies only to style baseline comparisons or deferred layout mappings, never presence or visibility requirements.');
    }
    if (!rule.capability.trim() && !rule.capabilitySet) error('RULE_CAPABILITY', `${path}/capability`, 'Capability or capability set is required.');
    if (rule.capabilitySelection && !rule.capabilitySet) {
      error('RULE_CAPABILITY_SELECTION_SET', `${path}/capabilitySelection`, 'Capability selection requires a capability set.');
    }
    if (rule.capabilitySet) {
      const registered = capabilitiesForSet(rule.capabilitySet);
      if (!registered.length) {
        error('RULE_CAPABILITY_SET', `${path}/capabilitySet`, `Unknown capability set: ${rule.capabilitySet}.`);
      }
      if (rule.capabilitySelection) {
        if (!rule.capabilitySelection.length) {
          error('RULE_CAPABILITY_SELECTION_EMPTY', `${path}/capabilitySelection`, 'Select at least one capability from the set.');
        }
        const duplicates = rule.capabilitySelection.filter((value, valueIndex, values) => values.indexOf(value) !== valueIndex);
        if (duplicates.length) {
          error('RULE_CAPABILITY_SELECTION_DUPLICATE', `${path}/capabilitySelection`, 'Capability selection contains duplicates.');
        }
        const unknown = rule.capabilitySelection.filter((value) => !registered.includes(value));
        if (unknown.length) {
          error('RULE_CAPABILITY_SELECTION_UNKNOWN', `${path}/capabilitySelection`, `Capabilities are not part of ${rule.capabilitySet}: ${unknown.join(', ')}.`);
        }
      }
    }
    if (rule.permission === 'constrained' && !rule.constraints.length) {
      error('RULE_CONSTRAINT', `${path}/constraints`, 'Constrained permission requires at least one constraint.');
    }
    if (rule.status === 'reviewed' && !rule.rationale.trim()) {
      error('RULE_RATIONALE', `${path}/rationale`, 'Reviewed rule requires rationale.');
    }
    if (!rule.owner.trim()) warning('RULE_OWNER', `${path}/owner`, 'Rule owner is not assigned.');
    const route = rule.execution?.route || 'auto';
    const predicateRoute = rule.status !== 'deprecated' && (route === 'predicate' || (route === 'auto' && rule.permission !== 'allowed'));
    const configuredError = configuredPropertyPolicyError(manual, rule);
    if (configuredError) error('RULE_PROPERTY_CONFORMANCE', `${path}/propertyConformance`, configuredError);
    if (rule.propertyApplicability !== undefined) {
      const gates = rule.propertyApplicability;
      const facts = baselineFactsForRule(rule);
      if (!gates || typeof gates !== 'object' || Array.isArray(gates)) {
        error('RULE_PROPERTY_APPLICABILITY', `${path}/propertyApplicability`, 'Property applicability must be an exact-property policy map.');
      } else for (const [fact, policy] of Object.entries(gates)) {
        if (!Object.prototype.hasOwnProperty.call(PROPERTY_APPLICABILITY, fact)
          || policy !== PROPERTY_APPLICABILITY[fact as keyof typeof PROPERTY_APPLICABILITY]
          || !facts.includes(fact) || rule.permission === 'allowed') {
          error('RULE_PROPERTY_APPLICABILITY', `${path}/propertyApplicability/${fact}`, `Unsupported policy or no baseline comparison for ${fact}.`);
        }
      }
    }
    const applicabilityKeys = new Set(['variants', 'modes', 'platforms', 'products', 'channels', 'context', 'contextDomains', 'scopeStatus', 'conditionSubject', 'activeDependency', 'validationMode']);
    const contextDomains = rule.applicability.contextDomains;
    if (contextDomains !== undefined && (!contextDomains || typeof contextDomains !== 'object' || Array.isArray(contextDomains))) {
      error('RULE_CONTEXT_DOMAIN', `${path}/applicability/contextDomains`, 'Context domains must be an object.');
    }
    for (const [fact, values] of Object.entries(contextDomains && typeof contextDomains === 'object' && !Array.isArray(contextDomains) ? contextDomains : {})) {
      if (!manual.semanticApi.some(p => fact === `semanticApi.${p.id}`) || !Array.isArray(values) || !values.length
        || values.some(v => !['string', 'number', 'boolean'].includes(typeof v))) {
        error('RULE_CONTEXT_DOMAIN', `${path}/applicability/contextDomains`, 'Context domains require a declared semantic API fact and nonempty scalar values.');
      }
    }
    if (rule.applicability.conditionSubject !== undefined && !['target', 'component-root'].includes(rule.applicability.conditionSubject)) {
      error('RULE_CONDITION_SUBJECT', `${path}/applicability/conditionSubject`, 'Choose target or component-root for variant/context conditions.');
    }
    Object.keys(rule.applicability).forEach((key) => {
      if (!applicabilityKeys.has(key)) error('RULE_APPLICABILITY_FIELD', `${path}/applicability/${key}`, `Unsupported applicability field: ${key}.`);
    });
    for (const key of ['platforms', 'products', 'channels'] as const) {
      const values = rule.applicability[key];
      if (values !== undefined && (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || !value.trim()))) {
        error('RULE_SCOPE_VALUES', `${path}/applicability/${key}`, 'Scope must be an array of non-empty strings; [] means all.');
      }
    }
    if (rule.applicability.variants !== 'all') {
      Object.entries(rule.applicability.variants).forEach(([property, values]) => {
        if (!property.trim() || !Array.isArray(values) || !values.length || values.some((value) => typeof value !== 'string' || !value.trim())) {
          error('RULE_VARIANTS', `${path}/applicability/variants`, 'Variant scope requires a property and at least one non-empty value.');
        }
      });
    }
    if (predicateRoute && rule.applicability.context && Object.keys(rule.applicability.context).some((key) => (
      !manual.semanticApi.some((property) => key === `semanticApi.${property.id}`
        || (key === `expectedInput.${property.id}` && property.validationInput?.version === 1 && property.valueType === 'boolean'
          && typeof rule.applicability.context![key] === 'boolean' && rule.targetScope !== 'descendants'
          && rule.targetScope !== 'self-and-descendants' && manual.targets.find(t => t.id === rule.targetId)?.semanticRole === 'root'))
      && !replacementContextMapped(manual,key,rule.applicability.context![key])
      && !manual.validationContext?.some(property => key === `expectedInput.${property.id}`
        && (property.valueType === 'boolean' && typeof rule.applicability.context![key] === 'boolean'
          || property.valueType === 'enum' && property.domain?.includes(rule.applicability.context![key] as string))
        && (!rule.targetScope || rule.targetScope === 'self')
        && manual.targets.find(t => t.id === rule.targetId)?.semanticRole === 'root')
    ))) {
      error('RULE_CONTEXT_UNMAPPED', `${path}/applicability/context`, 'Context conditions have no explicit runtime fact binding. Keep this rule context-only until mapped; do not run it unconditionally.');
    }
    if (rule.applicability.validationMode !== undefined && rule.applicability.validationMode !== 'specification') {
      error('RULE_VALIDATION_MODE', `${path}/applicability/validationMode`, 'Choose specification scope or omit it for intrinsic checks in both modes.');
    }
    if (predicateRoute && rule.applicability.scopeStatus === 'needs-confirmation') {
      error('RULE_SCOPE_UNCONFIRMED', `${path}/applicability/scopeStatus`, 'Confirm the rule scope before enabling a predicate check.');
    }
    if (rule.applicability.activeDependency !== undefined && (!manual.componentDependencies?.some(d => d.id === rule.applicability.activeDependency)
      || manual.targets.find(t => t.id === rule.targetId)?.semanticRole !== 'root' || (rule.targetScope || 'self') !== 'self')) {
      error('RULE_ACTIVE_DEPENDENCY', `${path}/applicability/activeDependency`, 'Choose a declared dependency and a root/self rule.');
    }
    if (route === 'delegated' && !rule.execution?.externalRuleIds?.length) {
      error('RULE_DELEGATION', `${path}/execution/externalRuleIds`, 'Delegated rule requires externalRuleIds.');
    }
    if (route === 'context-only' && !rule.execution?.missingFacts?.length) {
      error('RULE_CONTEXT_FACTS', `${path}/execution/missingFacts`, 'Context-only rule requires missingFacts.');
    }
    if (Array.isArray(rule.applicability.modes)) {
      warning('RULE_MODES_LEGACY', `${path}/applicability/modes`, 'Legacy mode list does not identify its variable collection. Re-select modes in the Editor.');
    } else if (rule.applicability.modes !== 'all') {
      Object.entries(rule.applicability.modes).forEach(([collectionId, modeIds]) => {
        if (!collectionId.trim() || !modeIds.length) {
          error('RULE_MODES', `${path}/applicability/modes`, 'Mode scope requires a collection id and at least one mode id.');
        }
      });
    }
    rule.controlPaths.forEach((controlPath, controlIndex) => {
      if (controlPath.ownerTargetId !== undefined) {
        const owners = manual.targets.filter(t => t.id === controlPath.ownerTargetId);
        const slot = manual.targets.find(t => t.id === controlPath.target);
        if (controlPath.kind !== 'slot-api' || !controlPath.property?.trim() || controlPath.target !== rule.targetId
          || owners.length !== 1 || !slot || owners[0].id === slot.id || owners[0].resolution !== 'resolved'
          || manual.representations.filter(r => r.kind === 'figma' && r.status !== 'deprecated').some(r => {
            const ownerPath = owners[0].representationHints?.find(h => h.representationId === r.id)?.pathHint || owners[0].pathHint;
            const slotPath = slot.representationHints?.find(h => h.representationId === r.id)?.pathHint || slot.pathHint;
            return !ownerPath || !slotPath || !slotPath.startsWith(ownerPath + ' / ') || slotPath.slice(ownerPath.length + 3).includes(' / ');
          })) error('CONTROL_SLOT_OWNER', `${path}/controlPaths/${controlIndex}`, 'Slot owner must be a distinct resolved local target directly containing the slot in each representation.');
      }
      if (controlPath.contentOwnership !== undefined && (controlPath.contentOwnership !== 'external' || controlPath.kind !== 'slot-api'
        || !controlPath.property?.trim() || controlPath.target !== rule.targetId || !['allowed','constrained'].includes(rule.permission))) {
        error('CONTROL_SLOT_BOUNDARY', `${path}/controlPaths/${controlIndex}`, 'External content requires an explicit slot-api target and native property anchor.');
      }
      if (controlPath.kind === 'inherited-port' && (!controlPath.port || !portIds.has(controlPath.port))) {
        error('CONTROL_PORT', `${path}/controlPaths/${controlIndex}/port`, 'Inherited control path must reference a local control port.');
      }
    });
    rule.constraints.forEach((constraint, constraintIndex) => {
      const constraintPath = `${path}/constraints/${constraintIndex}`;
      if (constraint.operator === 'at-most-line-height' && (constraint.type !== 'layoutConstraint'
        || constraint.fact !== 'bounds.height' || !constraint.targetRole || !/^[\w-]+$/.test(constraint.targetRole)
        || manual.targets.filter(t=>t.semanticRole===constraint.targetRole && t.resolution==='resolved').length !== 1
        || constraint.min !== undefined || constraint.max !== undefined || constraint.value !== undefined)) {
        error('CONSTRAINT_LINE_HEIGHT', constraintPath, 'Use bounds.height and one resolved reference TEXT role, without fixed min/max/value.');
      }
      configurationErrors(manual, manual.rules.indexOf(rule), constraint).forEach(message => error('CONSTRAINT_CONFIGURATION', constraintPath, message));
      mappingErrors(manual, manual.rules.indexOf(rule), constraint).forEach(message => error('CONSTRAINT_MAPPING', constraintPath, message));
      for (const message of replacementErrors(manual, manual.rules.indexOf(rule), constraint)) error('CONSTRAINT_INSTANCE_REPLACEMENT', constraintPath, message);
      if (!KNOWN_CONSTRAINTS.has(constraint.type)) {
        error('CONSTRAINT_TYPE', `${constraintPath}/type`, `Unknown constraint type: ${constraint.type}.`);
      }
      if (constraint.type === 'memberCollection') {
        if (rule.targetScope && rule.targetScope !== 'self' || !isDeclaredRootTarget(manual.targets.find(t => t.id === rule.targetId))
          || rule.permission !== 'constrained' || rule.capabilitySet) error('MEMBER_COLLECTION_SCOPE', constraintPath, 'Member collections require a constrained self rule on a declared root target.');
        for (const message of memberCollectionErrors(constraint.collection!, manual)) error('MEMBER_COLLECTION', constraintPath, message);
        if (Object.keys(constraint).some(k => !['type', 'collection'].includes(k))) error('MEMBER_COLLECTION_FIELDS', constraintPath, 'Collection constraints cannot mix legacy quantity/property fields.');
      } else if (constraint.collection !== undefined) error('MEMBER_COLLECTION_TYPE', constraintPath, 'Collection data requires memberCollection type.');
      if (constraint.type === 'bindingConsistency') {
        if (!['fill-token','text-style'].includes(constraint.bindingKind || '')
          || !['shared','selected-variant'].includes(constraint.bindingReference || '')
          || (constraint.bindingReference === 'selected-variant' && constraint.bindingKind !== 'text-style')
          || constraint.fact || rule.capabilitySet || rule.permission !== 'constrained'
          || (rule.targetScope || 'self') !== 'self' || manual.targets.find(t=>t.id===rule.targetId)?.semanticRole !== 'root'
          || constraint.visibleOnly !== true || !constraint.targetRoles?.length
          || new Set(constraint.targetRoles).size !== constraint.targetRoles.length
          || constraint.targetRoles.some(role=>manual.targets.filter(t=>t.semanticRole===role).length!==1)) {
          error('CONSTRAINT_BINDING_CONSISTENCY', constraintPath, 'Choose root/self, constrained permission, explicit unique TEXT roles, visibleOnly, binding kind and reference. Selected-variant supports Text Style only.');
        }
      }
      if (constraint.type === 'styleBinding' && (typeof constraint.styleCatalog !== 'string' || !constraint.styleCatalog.trim()
        || constraint.styleCatalog !== constraint.styleCatalog.trim() || /[/\\]/.test(constraint.styleCatalog)
        || constraint.fact || rule.capability !== 'text.style' || rule.permission !== 'constrained')) {
        error('CONSTRAINT_STYLE_BINDING', constraintPath, 'Text Style binding requires text.style, constrained permission and an explicit catalog filename; no fact override.');
      }
      if (constraint.type === 'transitionInvariant') {
        const t=constraint.transition,invalid=(message:string)=>error('CONSTRAINT_TRANSITION',constraintPath,message);
        if (!t || t.evidenceProfile!=='same-instance-context@1') invalid('Declare same-instance-context@1 paired evidence.');
        if (!t || !manual.componentDependencies?.some(d=>d.id===t.dependencyId)) invalid('Transition state must reference a declared fixed dependency.');
        if (!t || typeof t.from!=='boolean'||typeof t.to!=='boolean'||t.from===t.to) invalid('Declare two different boolean dependency states.');
        if (!t || !Array.isArray(t.invariantFacts)||!t.invariantFacts.length||new Set(t.invariantFacts).size!==t.invariantFacts.length
          ||t.invariantFacts.some(f=>!manual.semanticApi.some(p=>f===`semanticApi.${p.id}`))) invalid('Invariants must be unique explicit semantic API facts.');
        if (!t || typeof t.tolerance!=='number'||!Number.isFinite(t.tolerance)||t.tolerance<0) invalid('Declare a finite nonnegative absolute tolerance.');
        if (!['bounds.width','bounds.height'].includes(constraint.fact||'')||(rule.targetScope||'self')!=='self'
          ||manual.targets.find(t=>t.id===rule.targetId)?.semanticRole!=='root'||rule.capabilitySet) invalid('Paired dimensions currently support only root/self width or height.');
        if (rule.applicability.activeDependency || Object.keys(rule.applicability.context||{}).length) invalid('Use the explicit transition state, not a second activation condition.');
      }
      if (constraint.type === 'dependencyDomain') {
        const d = constraint.dependency;
        const invalid = (message: string) => error('CONSTRAINT_DEPENDENCY', `${constraintPath}/dependency`, message);
        if (!d || !Array.isArray(d.subjects) || !d.subjects.length) { invalid('Declare at least one dependency subject.'); return; }
        if (!isDeclaredRootTarget(manual.targets.find(t=>t.id===rule.targetId)) || (rule.targetScope||'self')!=='self' || rule.capabilitySet) invalid('Dependency rules are rooted at the host; choose nested subjects in the constraint, not a capability group or descendant scope.');
        if (constraint.fact) invalid('Dependency field is explicit; do not also override fact.');
        if (!['componentSetKey','catalog','portName','width','height','variantProperty','changed'].includes(d.field)) invalid('Choose a supported dependency field.');
        if (d.field==='variantProperty' ? typeof d.property!=='string'||!d.property.trim()||d.property!==d.property.trim() : d.property!==undefined) invalid('Only variantProperty requires an exact nonempty VARIANT property name.');
        if (d.activePorts !== undefined && (d.field!=='variantProperty'||!Array.isArray(d.activePorts)||!d.activePorts.length||d.activePorts.some(p=>!d.portNames?.includes(p))||new Set(d.activePorts).size!==d.activePorts.length)) invalid('Variant property filters require unique active ports from the declared consumer domain.');
        if (!['require-domain','allow-unchanged'].includes(d.baselinePolicy)) invalid('Choose an explicit baseline policy.');
        if (d.field === 'changed' && (d.contractDependencyId || d.baselinePolicy !== 'require-domain'
          || d.cases !== undefined || d.sourceFact !== undefined || d.catalogs !== undefined || d.activePorts !== undefined
          || d.tolerance !== undefined || constraint.values?.length !== 1 || constraint.values[0] !== false)) {
          invalid('An icon identity lock requires the unchanged value false, an explicit swap port and independent baseline; mappings, fixed child bindings and exemptions are unsupported.');
        }
        if (d.subjectCondition && (typeof d.subjectCondition.property!=='string'||!d.subjectCondition.property.trim()
          || Object.keys(d.subjectCondition).some(k=>!['property','propertyType','values'].includes(k))
          || !['VARIANT','BOOLEAN','TEXT','INSTANCE_SWAP'].includes(d.subjectCondition.propertyType)
          || !Array.isArray(d.subjectCondition.values)||!d.subjectCondition.values.length
          || d.subjectCondition.values.some(v=>d.subjectCondition!.propertyType==='BOOLEAN'?typeof v!=='boolean':typeof v!=='string'))) invalid('Subject condition requires an exact typed property and matching values. VARIANT is a string.');
        if (new Set(d.subjects.map(s=>JSON.stringify(s))).size !== d.subjects.length) invalid('Duplicate subjects.');
        for (const s of d.subjects) {
          if (manual.targets.filter(t=>t.semanticRole===s.targetRole && t.resolution==='resolved').length!==1) invalid(`Unresolved semantic target: ${s.targetRole}.`);
          if (typeof s.relativePath!=='string' || s.relativePath.split(' / ').some(p=>p==='..' || p==='.' || (!p && s.relativePath!==''))) invalid('Use an exact relative instance path, without wildcards.');
        }
        if (d.contractDependencyId) {
          const declared=manual.componentDependencies?.find(p=>p.id===d.contractDependencyId);
          if (!declared || d.subjects.some(s=>declared.bindings.filter(b=>b.targetRole===s.targetRole&&b.relativePath===s.relativePath).length!==1)) invalid('Fixed nested subject must match one declared component dependency binding.');
          if (d.portNames?.length || d.catalogs || d.activePorts || d.baselinePolicy!=='require-domain' || ['catalog','portName'].includes(d.field)) invalid('Fixed nested components do not use icon ports, catalog filters or unchanged exemptions.');
        }
        if (d.field!=='componentSetKey' && !d.contractDependencyId && (!d.portNames?.length || d.portNames.some(p=>typeof p!=='string'||!p.trim()||p.includes('#')) || new Set(d.portNames).size!==d.portNames.length)) invalid('Asset policy requires unique exact port names without Figma suffixes.');
        if (d.field==='componentSetKey' && (d.portNames?.length || d.baselinePolicy==='allow-unchanged')) invalid('Component set checks cannot skip unchanged wrappers or select icon ports.');
        const assetMetric = ['portName','width','height','variantProperty'].includes(d.field);
        const numeric = ['width','height'].includes(d.field);
        if (assetMetric && d.baselinePolicy!=='require-domain') invalid('Adapter and asset dimensions apply to unchanged assets too.');
        if (d.catalogs !== undefined && (!assetMetric || !Array.isArray(d.catalogs) || !d.catalogs.length || d.catalogs.some(c=>typeof c!=='string'||!c.trim()) || new Set(d.catalogs).size!==d.catalogs.length)) invalid('Catalog filter needs unique nonempty catalog names on an asset metric.');
        if (d.tolerance !== undefined && (!numeric || typeof d.tolerance!=='number' || !Number.isFinite(d.tolerance) || d.tolerance<0)) invalid('Only asset dimensions support a finite nonnegative px tolerance.');
        const outputs = d.cases?.flatMap(c=>Array.isArray(c.values)?c.values:[]) || constraint.values || [];
        if (outputs.some(v=>d.field==='changed' ? typeof v!=='boolean' : numeric ? typeof v!=='number'||!Number.isFinite(v)||v<=0 : typeof v!=='string'||!v.trim())) invalid('Use the declared dependency value type: boolean identity lock, positive dimensions or nonempty keys/catalogs/ports.');
        if (d.cases) {
          if (!d.sourceFact || !manual.semanticApi.some(p=>d.sourceFact===`semanticApi.${p.id}`)) invalid('Mapping needs an explicitly bound host semanticApi fact.');
          if (constraint.values?.length || !d.cases.length) invalid('Use a nonempty mapping or a fixed domain, not both.');
          for (const [caseIndex, c] of d.cases.entries()) {
            if (!Array.isArray(c.when)||!c.when.length||!Array.isArray(c.values)||!c.values.length) { invalid('Each mapping case needs input and output values.'); continue; }
            if (c.context !== undefined && (!c.context || typeof c.context !== 'object' || Array.isArray(c.context) || !Object.keys(c.context).length)) { invalid('Case context must be a nonempty explicit semanticApi condition map.'); continue; }
            for (const [fact, value] of Object.entries(c.context || {})) {
              const p = manual.semanticApi.find(p => fact === `semanticApi.${p.id}`);
              if (!p || fact === d.sourceFact || !(p.valueType === 'boolean' && typeof value === 'boolean' || p.valueType === 'enum' && p.domain?.includes(value))) invalid('Case context needs declared boolean/enum semanticApi facts and valid values.');
            }
            if (new Set(c.when.map(v => JSON.stringify(v))).size !== c.when.length) invalid('Mapping cases must not repeat input values.');
            for (const prior of d.cases.slice(0, caseIndex)) {
              const commonInput = Array.isArray(prior.when) && prior.when.some(v => c.when.some(w => JSON.stringify(w) === JSON.stringify(v)));
              const disjointContext = Object.entries(c.context || {}).some(([fact, value]) => prior.context && fact in prior.context && JSON.stringify(prior.context[fact]) !== JSON.stringify(value));
              if (commonInput && !disjointContext) invalid('Mapping cases must not overlap.');
            }
          }
        } else if (d.sourceFact || !constraint.values?.length) invalid('A fixed dependency domain requires allowed values.');
      }
      if (['propertyDomain', 'propertyExclusion'].includes(constraint.type) && !(constraint.values?.length)) {
        error('CONSTRAINT_VALUES', `${constraintPath}/values`, 'Property domain requires allowed values.');
      }
      if (constraint.baselineSource !== undefined && (constraint.baselineSource !== 'library-text'
        || constraint.type !== 'propertyForbidden' || (constraint.fact || rule.capability) !== 'text.characters')) {
        error('CONSTRAINT_BASELINE_SOURCE', `${constraintPath}/baselineSource`, 'Library text reference supports only propertyForbidden text.characters.');
      }
      if (constraint.textNormalization !== undefined && (constraint.textNormalization !== 'trim' || constraint.baselineSource !== 'library-text')) {
        error('CONSTRAINT_TEXT_NORMALIZATION', `${constraintPath}/textNormalization`, 'Trim requires an explicit library-text reference.');
      }
      if (constraint.type === 'quantity' && constraint.min === undefined && constraint.max === undefined) {
        error('CONSTRAINT_RANGE', constraintPath, 'Quantity requires min or max.');
      }
      if (constraint.fact === 'textContentV1.wordCount' && (constraint.type !== 'layoutConstraint'
        || !Number.isSafeInteger(constraint.max) || constraint.max! < 0
        || !Number.isSafeInteger(constraint.min ?? 0) || (constraint.min ?? 0) < 0
        || (constraint.min ?? 0) > constraint.max! || constraint.value !== undefined)) {
        error('CONSTRAINT_WORD_COUNT', constraintPath, 'Word count requires an explicit nonnegative integer max and optional min.');
      }
      if (constraint.contractDependencyId !== undefined) {
        if (constraint.type !== 'quantity' || !manual.componentDependencies?.some(d=>d.id===constraint.contractDependencyId)
          || constraint.targetRole || constraint.targetRoles || constraint.fact || constraint.visibleOnly !== undefined
          || (rule.targetScope || 'self') !== 'self' || manual.targets.find(t=>t.id===rule.targetId)?.semanticRole !== 'root') {
          error('CONSTRAINT_DEPENDENCY_QUANTITY', constraintPath, 'Dependency quantity counts visible proven children of one declared dependency; use root/self and no role/fact/visibility overrides.');
        }
        if ([constraint.min,constraint.max].some(v=>v!==undefined && (!Number.isInteger(v)||v<0))
          || (constraint.min!==undefined && constraint.max!==undefined && constraint.min>constraint.max)) {
          error('CONSTRAINT_DEPENDENCY_RANGE', constraintPath, 'Dependency counts require nonnegative integer bounds in ascending order.');
        }
      }
      if (constraint.targetRoles !== undefined) {
        if (!['quantity','bindingConsistency','propertyForbidden'].includes(constraint.type) || constraint.targetRole || !Array.isArray(constraint.targetRoles)
          || !constraint.targetRoles.length || new Set(constraint.targetRoles).size !== constraint.targetRoles.length
          || constraint.targetRoles.some((role) => !/^[a-zA-Z0-9_-]+$/.test(role) || manual.targets.filter((target) => target.semanticRole === role).length !== 1)) {
          error('CONSTRAINT_TARGET_ROLES', `${constraintPath}/targetRoles`, 'Use a unique list of declared semantic roles; do not also set targetRole.');
        }
        if (constraint.visibleOnly !== true) error('CONSTRAINT_VISIBLE_ONLY', `${constraintPath}/visibleOnly`, 'Explicit targetRoles requires visibleOnly=true.');
        if (constraint.type === 'propertyForbidden' && ((rule.targetScope || 'self') !== 'self'
          || rule.boundaryPolicy || rule.targetApplicability || constraint.exceptConfiguration
          || constraint.baselineSource || rule.propertyApplicability
          || manual.targets.find(t=>t.id===rule.targetId)?.semanticRole !== 'root')) {
          error('CONSTRAINT_TARGET_ROLES_SCOPE', constraintPath, 'Explicit baseline targets require root/self and no recursive scope, boundary, visibility or configuration overrides.');
        }
      }
      if (constraint.visibleOnly !== undefined && (typeof constraint.visibleOnly !== 'boolean' || !['quantity','bindingConsistency','propertyForbidden'].includes(constraint.type) || !constraint.targetRoles?.length)) {
        error('CONSTRAINT_VISIBLE_ONLY', `${constraintPath}/visibleOnly`, 'visibleOnly requires explicit targetRoles on quantity, bindingConsistency or propertyForbidden.');
      }
      if (constraint.type === 'positionOrder' && !(constraint.order?.length)) {
        error('CONSTRAINT_ORDER', `${constraintPath}/order`, 'Position/order requires semantic roles.');
      }
      if (constraint.orderScope !== undefined && (constraint.type !== 'positionOrder' || !['visible','structural'].includes(constraint.orderScope))) {
        error('CONSTRAINT_ORDER_SCOPE', `${constraintPath}/orderScope`, 'Order scope requires positionOrder and visible or structural.');
      }
      if (constraint.type === 'relationship' && (!constraint.relation || !constraint.targetRole)) {
        error('CONSTRAINT_RELATION', constraintPath, 'Relationship requires relation and target role.');
      }
      if (constraint.type === 'tokenBinding' && !(constraint.tokenIds?.length) && !constraint.bindingRequired) {
        error('CONSTRAINT_TOKEN', constraintPath, 'Token binding requires token ids or bindingRequired.');
      }
    });
  });

  return issues.sort((left, right) => (
    left.level.localeCompare(right.level)
    || left.path.localeCompare(right.path)
    || left.code.localeCompare(right.code)
  ));
}
