const CONTRACT_SCHEMA = 'apollo.component-contract.v2.1-experimental';
const representation = require('@apollo/representation-evidence');
const dependencies = require('@apollo/component-contract-dependencies');
const collections = require('@apollo/member-collections');
const declaredIdentity = require('@apollo/component-contract-compiler');
const SNAPSHOT_PROFILES = new Set([
  'component-facts-v2', 'variant-facts-v3', 'variant-facts-v4', 'dependency-facts-v5',
]);
const RUNTIME_VERSIONS = {
  declaredTargetIdentityVersion: [1, 2, 3],
  declaredTargetConfigurationVersion: [1, 2],
  textContentFactsVersion: [1],
  nativeTargetPropertyFactsVersion: [1],
  representationEvidenceVersion: [1],
  crossRepresentationBindingsVersion: [1, 2],
  rootTargetAliasesVersion: [1],
  occurrenceAddressVersion: [1],
  directChildDependenciesVersion: [1],
  memberCollectionsVersion: [1],
  dependencySubjectConditionsVersion: [1],
  assetIdentityLockVersion: [1],
  instanceMainComponentAliasesVersion: [1],
  gradientPaintFactsVersion: [1],
  ruleScopeFactsVersion: [1],
  semanticTargetVisibilityVersion: [1],
  paintBindingFactsVersion: [1],
  textStyleBindingFactsVersion: [1],
  textBindingIdentityFactsVersion: [1],
  structuralOrderFactsVersion: [1],
  variantTextTargetsVersion: [1],
  dependencyCompletionVersion: [1],
  slotTargetFactsVersion: [1],
  nativeSlotTargetsVersion: [1],
  transitionFactsVersion: [1],
  ruleOwnershipVersion: [1],
  validationIntentVersion: [1, 2],
  validationModeVersion: [1],
  configuredNativePropertyConformanceVersion: [1],
  nativeInstanceReplacementsVersion: [1],
};
const ROUTES = new Set(['auto', 'predicate', 'policy-only', 'delegated', 'context-only']);

function reject(message) {
  const error = new TypeError(message);
  error.code = 'APOLLO_V4_CONTRACT_INCOMPATIBLE';
  throw error;
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function uniqueIds(values, field, label) {
  if (!Array.isArray(values)) reject(`${label} must be an array`);
  const ids = new Set();
  for (const value of values) {
    const id = value?.[field];
    if (typeof id !== 'string' || !id || ids.has(id)) reject(`${label} contains a missing or duplicate ${field}`);
    ids.add(id);
  }
  return ids;
}

function collectContractKeys(contract) {
  const keys = new Set();
  const add = (key) => { if (typeof key === 'string' && key) keys.add(key); };
  add(contract.facts?.component?.componentKey);
  for (const representation of contract.facts?.representations || []) {
    if (representation.kind !== 'figma' || representation.status === 'deprecated') continue;
    add(representation.locator?.componentKey);
    add(representation.locator?.componentSetKey);
  }
  for (const variant of contract.facts?.variantEvidence?.variants || []) {
    add(variant.componentKey);
    add(variant.componentSetKey);
  }
  return keys;
}

// This is the initial runtime compatibility profile, not a replacement for the
// authoring schema or a claim that an accepted package is published.
function contractEvaluationMode(options = {}) {
  if (!object(options) || Object.keys(options).some(key => key !== 'evaluationMode')) reject('Invalid contract evaluation options');
  const mode = options.evaluationMode === undefined ? 'ready' : options.evaluationMode;
  if (!['ready', 'authoring-preview'].includes(mode)) reject('Unsupported contract evaluation mode');
  return mode;
}

function assertSingleContract(contract, engine, mode) {
  if (!object(contract) || contract.schemaVersion !== CONTRACT_SCHEMA || contract.documentType !== 'component-contract') {
    reject(`Only ${CONTRACT_SCHEMA} component contracts are supported`);
  }
  if (contract.status !== 'ready' && !(mode === 'authoring-preview' && contract.status === 'draft')) reject('Runtime requires an accepted ready contract');
  if (!object(contract.package) || typeof contract.package.id !== 'string' || !contract.package.id
    || typeof contract.package.componentId !== 'string' || !contract.package.componentId
    || !/^[a-f0-9]{64}$/.test(contract.package.manualSourceHash || '')) reject('Package identity and manualSourceHash are required');
  if (!SNAPSHOT_PROFILES.has(contract.package.snapshotProfile)) reject('Unsupported snapshot profile');
  if (!object(contract.facts) || contract.facts.component?.componentId !== contract.package.componentId) {
    reject('Component facts must match the package identity');
  }
  if (!Array.isArray(contract.facts.representations) || !Array.isArray(contract.facts.targets)) {
    reject('Representations and semantic targets are required');
  }
  uniqueIds(contract.facts.targets, 'id', 'targets');
  try { declaredIdentity.assertDeclaredTargetContract(contract); } catch (error) { reject(error.message); }
  try { declaredIdentity.assertNativeRuleFactPolicies(contract); } catch (error) { reject(error.message); }
  try { declaredIdentity.assertNativeInstanceReplacementPolicy(contract); } catch (error) { reject(error.message); }
  if (contract.runtimePolicy.nativeInstanceReplacements !== undefined
    && contract.runtimePolicy.nativeInstanceReplacementsVersion !== 1) reject('Native instance replacements require their runtime version');
  const representationShape=representation.contractRepresentationShape(contract),representationFlags=representation.representationFeatureFlags(representationShape);
  const representationErrors=representation.representationEvidenceErrors(representationShape);
  if(representationErrors.length || representationFlags.evidence!==(contract.runtimePolicy.representationEvidenceVersion===1) || contract.runtimePolicy.crossRepresentationBindingsVersion!==representationFlags.bindingVersion)reject('Unsupported representation evidence/bindings: '+representationErrors.join('; '));
  for(const binding of contract.facts.dependencyBindings || []) if(binding.identityLock !== undefined
    && (binding.identityLock !== true || contract.runtimePolicy?.assetIdentityLockVersion !== 1 || !Array.isArray(binding.portNames) || !binding.portNames.length
      || binding.portNames.some(p=>typeof p!=='string'||!p.trim()||p.includes('#')) || new Set(binding.portNames).size!==binding.portNames.length
      || binding.contractDependencyId || binding.metrics || binding.variantProperty)) reject('Unsupported or malformed asset identity lock');
  for(const rule of contract.rules || []){
    const fact=rule.assert?.actual?.fact;
    if(typeof fact==='string' && /^dependencies\.[^.]+\.changed$/.test(fact)){
      const id=fact.split('.')[1];
      if(contract.runtimePolicy?.assetIdentityLockVersion!==1 || contract.facts.dependencyBindings?.filter(b=>b.id===id&&b.identityLock===true).length!==1)
        reject('Asset identity assertion requires its exact marked binding');
    }
  }
  if(contract.runtimePolicy?.assetIdentityLockVersion === 1 && !contract.facts.dependencyBindings?.some(binding=>binding.identityLock)) reject('Asset identity lock has no bindings');
  for(const binding of contract.facts.dependencyBindings || []) if(binding.subjectCondition){
    const c=binding.subjectCondition;
    if(contract.runtimePolicy?.dependencySubjectConditionsVersion!==1 || typeof c.property!=='string'||!c.property.trim()
      || Object.keys(c).some(k=>!['property','propertyType','values'].includes(k))
      || !['VARIANT','BOOLEAN','TEXT','INSTANCE_SWAP'].includes(c.propertyType) || !Array.isArray(c.values)||!c.values.length
      || c.values.some(v=>c.propertyType==='BOOLEAN'?typeof v!=='boolean':typeof v!=='string'))reject('Unsupported or malformed dependency subject condition');
  }
  if (contract.runtimePolicy?.rootTargetAliasesVersion === 1 && contract.runtimePolicy?.occurrenceAddressVersion !== 1) reject('Root target aliases require occurrence addressing');
  if (contract.capabilities?.facts?.some(f => f.startsWith('rootTargetAliasesV1.')) && contract.runtimePolicy?.rootTargetAliasesVersion !== 1) reject('Root target aliases require their runtime version');
  if (contract.runtimePolicy?.memberCollectionsVersion === 1 && !contract.facts.memberCollections?.length) reject('Member collection policy has no facts');
  if (contract.facts.memberCollections !== undefined) {
    uniqueIds(contract.facts.memberCollections, 'id', 'memberCollections');
    if (contract.runtimePolicy?.memberCollectionsVersion !== 1 || contract.runtimePolicy?.occurrenceAddressVersion !== 1) reject('Member collections require explicit runtime versions');
    for (const entry of contract.facts.memberCollections) {
      let errors;
      try { errors = collections.memberCollectionErrors(entry.collection, {targets: contract.facts.targets, representations: contract.facts.representations}); }
      catch (_) { reject('Malformed member collection'); }
      if (errors.length) reject(errors.join('; '));
    }
  }
  if(contract.componentDependencies?.some(d=>d.bindings?.some(b=>b.kind==='direct-child'))
    && (contract.runtimePolicy?.directChildDependenciesVersion!==1 || contract.runtimePolicy?.occurrenceAddressVersion!==1))reject('Direct child bindings require explicit runtime versions');
  const occurrenceEvidence=contract.facts.variantEvidence;
  if (occurrenceEvidence?.occurrenceAddressVersion !== undefined && occurrenceEvidence.occurrenceAddressVersion !== 1) reject('Unsupported occurrence evidence version');
  if ((occurrenceEvidence?.occurrenceAddressVersion === 1 || contract.facts.targets.some(t=>t.variantHints?.length))
    && contract.runtimePolicy?.occurrenceAddressVersion !== 1) reject('Occurrence addressing requires its runtime version');
  for (const target of contract.facts.targets) {
    if (target.variantHints === undefined) continue;
    if (!Array.isArray(target.variantHints)) reject('Malformed variant target bindings');
    const bindings = new Set();
    for (const hint of target.variantHints) {
      if (!object(hint) || typeof hint.componentKey !== 'string' || !hint.componentKey
        || typeof hint.pathHint !== 'string' || !hint.pathHint || hint.pathHint.split(' / ').some(p=>/^@(catalog|local):/.test(p))
        || !contract.facts.representations.some(r=>r.kind==='figma' && r.id===hint.representationId)) reject('Malformed variant target binding');
      const key=JSON.stringify([hint.representationId,hint.componentKey]);
      if(bindings.has(key))reject('Duplicate variant target binding');
      bindings.add(key);
    }
  }
  let issues;
  try {
    issues = dependencies.validateComponentDependencies({ component: contract.facts.component,
      representations: contract.facts.representations, targets: contract.facts.targets, componentDependencies: contract.componentDependencies });
  } catch (_) { reject('Malformed component dependency bindings'); }
  if (issues.length) reject(issues.map(issue => issue.message).join('; '));
  for (const field of ['selectors', 'facts', 'operators', 'remediations']) {
    if (!Array.isArray(contract.capabilities?.[field])
      || contract.capabilities[field].some((value) => typeof value !== 'string' || !value)) reject(`Invalid capabilities.${field}`);
  }
  if (contract.capabilities.operators.some((operator) => !engine.IMPLEMENTED_PREDICATES.has(operator))) {
    reject('Contract declares unsupported predicate capabilities');
  }
  if (!collectContractKeys(contract).size) reject('Published component keys are required for identity matching');
  const policy = contract.runtimePolicy;
  if (!object(policy) || policy.engine !== 'apollo-predicate-engine'
    || policy.unknownPolicy !== 'fail-closed' || policy.compiledIsSourceOfTruth !== false) reject('Invalid runtime policy');
  for (const [name, version] of Object.entries(policy)) {
    if (['engine', 'unknownPolicy', 'compiledIsSourceOfTruth', 'nativeInstanceReplacements'].includes(name)) continue;
    if (!RUNTIME_VERSIONS[name]?.includes(version)) reject(`Unsupported runtime feature ${name}=${version}`);
  }
  const sourceIds = uniqueIds(contract.customizationPolicy, 'id', 'customizationPolicy');
  for (const entry of contract.facts.memberCollections || []) {
    if (!sourceIds.has(entry.sourceRuleId) || !contract.rules.some(r => r.source?.anchor === entry.sourceRuleId && r.presentation?.collectionId === entry.id)) reject('Member collection has no source rule');
  }
  for (const rule of contract.rules || []) if (rule.presentation?.collectionId && !contract.facts.memberCollections?.some(e => e.id === rule.presentation.collectionId)) reject('Collection rule has no facts');
  const ruleIds = uniqueIds(contract.rules, 'ruleId', 'rules');
  if (!sourceIds.size) reject('Empty source rule policy');
  uniqueIds(contract.nonExecutableRules, 'id', 'nonExecutableRules');
  const policies = new Map(contract.customizationPolicy.map((entry) => [entry.id, entry]));
  for (const entry of policies.values()) {
    if (typeof entry.capability !== 'string' || !Array.isArray(entry.controlPaths)
      || entry.controlPaths.some((path) => !object(path) || typeof path.kind !== 'string')) reject(`Invalid capture controls for ${entry.id}`);
    if (!['reviewed', 'deprecated'].includes(entry.status) && !(mode === 'authoring-preview' && entry.status === 'draft')) reject(`Unreviewed policy ${entry.id}`);
    if (!ROUTES.has(entry.execution?.route)) reject(`Unsupported execution route for ${entry.id}`);
  }
  for (const rule of contract.rules) {
    const source = policies.get(rule.source?.anchor);
    if (!source || source.status !== 'reviewed' && !(mode === 'authoring-preview' && source.status === 'draft')) reject(`Rule ${rule.ruleId} has no reviewed source policy`);
    if (['policy-only', 'delegated', 'context-only'].includes(source.execution.route)) reject(`Rule ${rule.ruleId} violates its source execution route`);
    if (rule.authority?.status !== 'active' && !(mode === 'authoring-preview' && rule.authority?.status === 'draft') || rule.source?.checksum !== contract.package.manualSourceHash) {
      reject(`Rule ${rule.ruleId} has inactive authority or a different source hash`);
    }
    if (!Number.isInteger(rule.revision) || rule.revision < 1 || typeof rule.source?.path !== 'string' || !rule.source.path) {
      reject(`Rule ${rule.ruleId} has no source path or valid revision`);
    }
    if (typeof rule.presentation?.title !== 'string' || !rule.presentation.title.trim()) reject(`Rule ${rule.ruleId} has no presentation`);
    try { engine.validateRule(rule); } catch (error) { reject(`Rule ${rule.ruleId}: ${error.message}`); }
  }
  for (const entry of contract.nonExecutableRules) {
    if (!policies.has(entry.sourceRuleId)) reject(`Unknown non-executable source ${entry.sourceRuleId}`);
  }
  for (const source of policies.values()) {
    if (source.status === 'deprecated' || ['policy-only', 'delegated', 'context-only'].includes(source.execution.route)) continue;
    // Auto is already resolved by the compiler. Allowed auto policies may have
    // no predicate; forbidden/constrained policies must have explicit coverage.
    if (source.execution.route === 'auto' && source.permission === 'allowed') continue;
    if (!contract.rules.some((rule) => rule.source.anchor === source.id)
      && !contract.nonExecutableRules.some((entry) => entry.sourceRuleId === source.id)) reject(`Source rule ${source.id} is not covered`);
  }
  const coverage = contract.coverage;
  if (!object(coverage) || coverage.compiledRules !== ruleIds.size
    || coverage.sourceRules !== contract.customizationPolicy.length || coverage.policyRules !== contract.customizationPolicy.length
    || coverage.nonExecutableRules !== contract.nonExecutableRules.length) reject('Contract coverage counts do not match its contents');
  return contract;
}

function assertRuntimeContract(contract, engine, options) {
  const mode = contractEvaluationMode(options);
  const versions = new Map(), ruleOwners = new Map();
  let count = 0;
  function visit(current, ancestors) {
    if (ancestors.length > dependencies.COMPONENT_DEPENDENCY_DEPTH_LIMIT) reject('Dependency depth limit exceeded');
    if (++count > 32) reject('Dependency closure limit exceeded');
    assertSingleContract(current, engine, mode);
    // ponytail: draft dependency activation needs a separately pinned preview closure.
    if (mode === 'authoring-preview' && ancestors.length && current.status !== 'ready') reject('Authoring preview requires ready dependencies');
    const id = current.package.componentId;
    if (ancestors.includes(id)) reject('Dependency cycle');
    for (const pin of current.componentDependencies || []) {
      if (pin.issue || !pin.contract) reject(`Unresolved dependency ${pin.id}: ${pin.issue || 'contract missing'}`);
      visit(pin.contract, ancestors.concat(id));
      const issue = dependencies.dependencyPinIssue(pin, pin.contract);
      if (issue) reject(`Dependency ${pin.id}: ${issue}`);
    }
    const hash = engine.stableHash(current);
    if (versions.has(id) && versions.get(id) !== hash) reject(`Dependency version conflict: ${id}`);
    versions.set(id, hash);
    for (const rule of current.rules) {
      if (ruleOwners.has(rule.ruleId) && ruleOwners.get(rule.ruleId) !== id) reject(`RuleID belongs to multiple components: ${rule.ruleId}`);
      ruleOwners.set(rule.ruleId, id);
    }
  }
  visit(contract, []);
  return contract;
}

// Called only after the complete closure has passed the runtime gate.
function collectContractRules(contract) {
  const rules = new Map();
  function visit(current) {
    current.rules.forEach(rule => rules.set(rule.ruleId, { ruleId: rule.ruleId, title: rule.presentation.title,
      sourceId: rule.source.anchor, componentId: current.package.componentId }));
    (current.componentDependencies || []).forEach(pin => visit(pin.contract));
  }
  visit(contract);
  return Array.from(rules.values());
}

function collectContractDependencies(contract) {
  const pins = new Map();
  function visit(current) {
    for (const pin of current.componentDependencies || []) {
      pins.set(pin.componentId, { componentId: pin.componentId, revision: pin.revision,
        manualSourceHash: pin.manualSourceHash, compiledHash: pin.compiledHash });
      visit(pin.contract);
    }
  }
  visit(contract);
  return Array.from(pins.values()).sort((a, b) => a.componentId.localeCompare(b.componentId));
}

module.exports = { CONTRACT_SCHEMA, assertRuntimeContract, contractEvaluationMode, collectContractKeys, collectContractRules, collectContractDependencies };
