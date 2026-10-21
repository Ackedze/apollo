const core = require('@apollo/component-contract-runtime');
const engine = require('@apollo/predicate-engine');
const dependencies = require('@apollo/component-contract-dependencies');
const { CONTRACT_SCHEMA, assertRuntimeContract, contractEvaluationMode, collectContractKeys, collectContractRules, collectContractDependencies } = require("./contract-profile");
const authoring = require("./authoring-source");
const RUNTIME_VERSION = '0.4.1';

function loadRuntimeContract(contract, options) {
  return assertRuntimeContract(contract, engine, options);
}

function auditContractSnapshot(snapshot, inputContract, options) {
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
  const result = core.evaluateCompiledContract(snapshot, mode === 'authoring-preview' ? core.prepareAuthoringPreviewContract(contract) : contract);
  const pendingSources = contract.customizationPolicy.filter((entry) => entry.status !== 'deprecated'
    && ['delegated', 'context-only'].includes(entry.execution.route)).map((entry) => ({
    ruleId: entry.id, route: entry.execution.route,
  }));
  const missingRules = contract.rules.filter((rule) => !result.evaluations.some((entry) => entry.ruleId === rule.ruleId)).map((rule) => rule.ruleId);
  const uncertain = result.evaluations.filter((entry) => !['compliant', 'allowed', 'violation', 'not-applicable'].includes(entry.classification)
    || entry.trace?.reason === 'selector matched no visible nodes' || entry.trace?.reason === 'rule authority is not active'
    || contract.runtimePolicy.memberCollectionsVersion === 1 && entry.collection?.missing?.length).length;
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
  collectContractKeys, collectContractRules, collectContractDependencies,
  componentDependencyKeys: dependencies.componentDependencyKeys, contractHash: engine.stableHash,
};
