const engine = require('@apollo/predicate-engine');

function aggregateAreaResult(components, notChecked, selection, governedComponents = []) {
  const evaluations = [], dependencyRuns = [], byClassification = {};
  const scopes = new Set();
  for (const component of components) {
    if (!component.scopeId || scopes.has(component.scopeId)) throw new TypeError('Duplicate area component scope');
    scopes.add(component.scopeId);
    for (const entry of component.result.engine.evaluations) {
      const evaluation = Object.assign({}, entry, { evaluationId: engine.stableHash([component.scopeId, entry.evaluationId]),
        componentEvaluationId: entry.evaluationId, componentScopeId: component.scopeId, componentScopeName: component.name });
      evaluations.push(evaluation);
      byClassification[entry.classification] = (byClassification[entry.classification] || 0) + 1;
    }
    for (const run of component.result.engine.dependencyRuns || []) dependencyRuns.push(Object.assign({}, run, { componentScopeId: component.scopeId }));
  }
  return {
    schemaVersion: 'apollo.area-audit-result.v1-experimental', mode: 'selected-area',
    engine: { evaluations, dependencyRuns, coverage: { byClassification, total: evaluations.length } },
    coverage: { scope: 'available-component-contracts-in-selected-area',
      executionComplete: selection.complete && components.length > 0 && !notChecked.length
        && components.every(component => component.result.coverage.executionComplete),
      checkedComponents: components.length, governedComponents: governedComponents.length,
      notCheckedComponents: notChecked.length, discoveredComponents: selection.components.length,
      scanComplete: selection.complete, incompleteComponents: components.filter(component => !component.result.coverage.executionComplete).length },
  };
}
module.exports = { aggregateAreaResult };
