const core = require('@apollo/component-contract-runtime');
const engine = require('@apollo/predicate-engine');
const dependencies = require('@apollo/component-contract-dependencies');
const { CONTRACT_SCHEMA, assertRuntimeContract, contractEvaluationMode, collectContractKeys, collectContractRules, collectContractDependencies } = require("./contract-profile");
const authoring = require("./authoring-source");
const { collectContractOwnedParts, hiddenContractTarget } = require('./area-ownership');
const RUNTIME_VERSION = '0.4.1';

function loadRuntimeContract(contract, options) {
  return assertRuntimeContract(contract, engine, options);
}

function auditContractSnapshot(snapshot, inputContract, options, ownerContext) {
  const mode = contractEvaluationMode(options), contract = loadRuntimeContract(inputContract, options);
  if (!snapshot || snapshot.schemaVersion !== 'apollo.predicate-snapshot.v2'
    || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.selection)
    || snapshot.selection.length !== 1) {
    throw new TypeError('The initial pilot requires one component snapshot');
  }
  let captures = 0;
  const captureLimit=contract.runtimePolicy.directChildDependenciesVersion===1 ? dependencies.DIRECT_CHILD_DEPENDENCY_CAPTURE_LIMIT : dependencies.COMPONENT_DEPENDENCY_CAPTURE_LIMIT;
  function boundCapture(current, depth) {
    if (!current || !Array.isArray(current.nodes) || current.nodes.length > 500
      || depth > dependencies.COMPONENT_DEPENDENCY_DEPTH_LIMIT) throw new TypeError('Snapshot capture limit exceeded');
    if (current.componentDependencyCaptures !== undefined && !Array.isArray(current.componentDependencyCaptures)) throw new TypeError('Malformed dependency captures');
    for (const capture of current.componentDependencyCaptures || []) {
      if (++captures > captureLimit) throw new TypeError('Snapshot dependency capture limit exceeded');
      if (capture?.snapshot) boundCapture(capture.snapshot, depth + 1);
    }
  }
  boundCapture(snapshot, 0);
  const ids = snapshot.nodes.map((node) => node?.id);
  if (ids.some((id) => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length
    || !ids.includes(snapshot.selection[0])) {
    throw new TypeError('Snapshot requires unique node identities and an existing selected root');
  }
  const knownKeys = collectContractKeys(contract);
  const keys = [snapshot.source?.componentKey, snapshot.source?.componentSetKey];
  if (!keys.some((key) => knownKeys.has(key))) {
    const error = new TypeError('Snapshot component identity is not covered by this contract');
    error.code = 'APOLLO_V4_COMPONENT_NOT_COVERED';
    throw error;
  }
  let ownerBaseline, ownerPropertyRules = [];
  const owner = ownerContext;
  if (owner) {
    boundCapture(owner.snapshot, 0);
    const parent = loadRuntimeContract(owner.contract, owner.evaluationMode ? { evaluationMode: owner.evaluationMode } : undefined);
    const parts = collectContractOwnedParts(owner.snapshot, parent).filter(part => part.snapshotNodeId === owner.nodeId);
    const host = JSON.parse(JSON.stringify(owner.snapshot));
    host.componentDependencyCaptures = (host.componentDependencyCaptures || []).filter(capture => capture.nodeId !== owner.nodeId);
    host.componentDependencyCaptures.push({ nodeId: owner.nodeId, nodeMap: owner.nodeMap, snapshot });
    const proof = parts.length === 1 && dependencies.validatedDependencyCapture(host, owner.nodeId, contract);
    if (!proof?.snapshot || !proof.nodeMap || contract.capabilities.facts.some(fact => fact.startsWith('baseline.effective')) && !proof.ownerBaseline) {
      const error = new TypeError('Enclosing component evidence is unavailable or inconsistent');
      error.code = 'APOLLO_V4_OWNER_CONTEXT_UNAVAILABLE';
      throw error;
    }
    snapshot = proof.snapshot;
    ownerBaseline = proof.ownerBaseline;
    // Baseline facts retain the enclosing authority, but child guards operate
    // in child-relative coordinates (not the parent's reference path).
    const prefix = ownerBaseline?.[snapshot.selection[0]]?.provenance?.referencePath;
    if (typeof prefix === 'string' && prefix) for (const baseline of Object.values(ownerBaseline)) {
      const path = baseline.provenance?.referencePath;
      if (typeof path === 'string' && (path === prefix || path.startsWith(prefix + ' / '))) {
        baseline.provenance = { ...baseline.provenance, enclosingReferencePath: path,
          referencePath: path === prefix ? '' : path.slice(prefix.length + 3) };
      }
    }
    const hasOwnerFillConstraint = parent.customizationPolicy.some(policy => policy.status !== 'deprecated'
      && policy.permission === 'constrained' && policy.capability === 'appearance.fill'
      && (policy.targetScope || 'self') === 'self');
    const parentEvaluations = hasOwnerFillConstraint ? core.evaluateCompiledContract(owner.snapshot,
      owner.evaluationMode === 'authoring-preview' ? core.prepareAuthoringPreviewContract(parent) : parent).evaluations : [];
    for (const evaluation of parentEvaluations) {
      if (evaluation.applicability !== 'applicable' || !['compliant', 'violation'].includes(evaluation.classification)) continue;
      const ir = parent.rules.find(rule => rule.ruleId === evaluation.ruleId);
      const policy = parent.customizationPolicy.find(rule => rule.id === ir?.source?.anchor);
      if (!policy || policy.permission !== 'constrained' || policy.capability !== 'appearance.fill'
        || (policy.targetScope || 'self') !== 'self'
        || !parent.facts.targets.some(target => target.id === policy.targetId && target.resolution === 'resolved')
        || !policy.controlPaths.some(control => control.kind === 'direct' && control.target === policy.targetId
          && control.property === 'appearance.fill') || (ir.assert?.predicate !== 'binding-satisfies' || ir.assert?.actual?.fact !== 'paintBindingsV1.fill'
          || ir.assert?.expected?.literal?.required !== true)) continue;
      const childIds = Object.entries(owner.nodeMap).filter(([, host]) => host === evaluation.subjectNodeId).map(([local]) => local);
      if (childIds.length === 1) ownerPropertyRules.push({ nodeId: childIds[0], fact: 'appearance.fill',
        parentRuleId: evaluation.ruleId, parentManualSourceHash: parent.package.manualSourceHash });
    }
  }
  // An active, identity-proven enclosing field constraint owns its value domain.
  // Keep its token violation and all other child constraints in the same engine.
  const contextual = !ownerPropertyRules.length ? contract : { ...contract, rules: contract.rules.map(rule => {
    if (rule.assert?.predicate !== 'matches-effective-baseline' || rule.assert?.actual?.fact !== 'appearance.fill') return rule;
    const ids = [...new Set(ownerPropertyRules.map(p => p.nodeId))];
    return { ...rule, when: { predicate: 'all', args: [...(rule.when ? [rule.when] : []), {
      predicate: 'none-of', actual: { fact: 'id' }, expected: { literal: ids }, missingPolicy: 'unknown',
    }] } };
  }) };
  const result = core.evaluateCompiledContract(snapshot, mode === 'authoring-preview' ? core.prepareAuthoringPreviewContract(contextual) : contextual, [], undefined, ownerBaseline);
  const pendingSources = contract.customizationPolicy.filter((entry) => entry.status !== 'deprecated'
    && ['delegated', 'context-only'].includes(entry.execution.route)).map((entry) => ({
    ruleId: entry.id, route: entry.execution.route,
  }));
  const missingRules = contract.rules.filter((rule) => !result.evaluations.some((entry) => entry.ruleId === rule.ruleId)).map((rule) => rule.ruleId);
  const hiddenTargetScopes = [];
  let checkedSnapshot;
  for (const entry of result.evaluations) {
    if (entry.classification !== 'not-applicable' || entry.applicability !== 'not-applicable'
      || entry.trace?.reason !== 'selector matched no visible nodes') continue;
    const ir = contract.rules.find(rule => rule.ruleId === entry.ruleId);
    const policy = contract.customizationPolicy.find(rule => rule.id === ir?.source?.anchor);
    // Never exempt a recursive, presence or visibility assertion by its label.
    if (!policy || (policy.targetScope || 'self') !== 'self' || policy.capability === 'visibility'
      || !['matches-effective-baseline','one-of','equals'].includes(ir.assert?.predicate)
      || ir.assert?.actual?.fact === 'visible') continue;
    checkedSnapshot ||= core.prepareValidationSnapshot(snapshot, contract);
    const proof = hiddenContractTarget(checkedSnapshot, contract, policy.targetId);
    if (proof) hiddenTargetScopes.push({ ruleId: entry.ruleId, ...proof });
  }
  const hiddenRules = new Set(hiddenTargetScopes.map(proof => proof.ruleId));
  const uncertain = result.evaluations.filter((entry) => !['compliant', 'allowed', 'violation', 'not-applicable'].includes(entry.classification)
    || entry.trace?.reason === 'selector matched no visible nodes' && !hiddenRules.has(entry.ruleId)
    || entry.trace?.reason === 'rule authority is not active'
    || contract.runtimePolicy.memberCollectionsVersion === 1 && entry.collection?.missing?.length
      && !(entry.applicability === 'not-applicable' && entry.trace?.truth === 'false')).length;
  const incompleteDependencies = (result.dependencyRuns || []).filter((run) => !['executed', 'not-applicable'].includes(run.status)).length;
  const captureIncomplete = snapshot.source?.truncated === true
    || snapshot.source?.captureTopology?.complete === false
    || Boolean(snapshot.source?.captureTopology?.issues?.length);
  const audit = {
    schemaVersion: 'apollo.contract-audit-result.v1-experimental',
    documentType: 'apollo-contract-audit-result',
    mode: 'component-snapshot',
    contract: {
      id: contract.package.id, componentId: contract.package.componentId,
      schemaVersion: contract.schemaVersion, manualSourceHash: contract.package.manualSourceHash,
    },
    engine: result,
    ...(hiddenTargetScopes.length ? { hiddenTargetScopes } : {}),
    ...(ownerPropertyRules.length ? { ownerFieldConstraints: ownerPropertyRules } : {}),
    coverage: {
      scope: 'compiled-predicate-execution',
      executionComplete: !captureIncomplete && !uncertain && !missingRules.length && !pendingSources.length
        && !contract.nonExecutableRules.length && !incompleteDependencies,
      captureIncomplete, uncertain, missingRules, pendingSources,
      nonExecutableRules: contract.nonExecutableRules.length, incompleteDependencies,
    },
  };
  if (mode === 'authoring-preview') Object.assign(audit, { evaluationMode: mode, sourceStatus: contract.status, Ready: false });
  return audit;
}

// Historical replay is intentionally separate from loading a runtime contract.
// It retains archived activation without enabling the opt-in preview audit path.
function replayArchivedReport(report) {
  if (report?.schemaVersion !== 'apollo.editor-validation-report.v1'
    || !report.snapshot || report.runtime?.evaluatedContract?.schemaVersion !== CONTRACT_SCHEMA) {
    throw new TypeError('Expected an archived ComponentContract Editor validation report');
  }
  return core.evaluateCompiledContract(report.snapshot, report.runtime.evaluatedContract);
}

module.exports = {
  CONTRACT_SCHEMA, RUNTIME_VERSION, loadRuntimeContract, auditContractSnapshot, replayArchivedReport,
  SOURCE_SCHEMA: authoring.SOURCE_SCHEMA, loadAuthoringSource: authoring.loadAuthoringSource, sourceFromFiles: authoring.sourceFromFiles,
  linkSourcePackages: authoring.linkSourcePackages,
  reviewAuthoringSource: authoring.reviewAuthoringSource,
  aggregateAreaResult: require("./area-result").aggregateAreaResult,
  collectContractOwnedParts: require("./area-ownership").collectContractOwnedParts,
  scopeContractCaptureWarnings: require("./area-ownership").scopeContractCaptureWarnings,
  collectContractKeys, collectContractRules, collectContractDependencies,
  componentDependencyKeys: dependencies.componentDependencyKeys, contractHash: engine.stableHash,
};
