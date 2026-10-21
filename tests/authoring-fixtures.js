// Synthetic source norms only. Never reconstruct a real manual from RuleIR.
const runtime = require("../dist/runtime.cjs");
const legacy = require("./fixtures");
const clone = value => JSON.parse(JSON.stringify(value));
function fromContract(input, dependencies = []) {
  const id = input.package.componentId, component = Object.assign({ familyId: id, contractId: input.package.id,
    library: 'Synthetic', layer: 'core', platforms: ['desktop'], lifecycle: 'active' }, clone(input.facts.component));
  const manual = {
    schemaVersion: 'apollo.component-contract.manual.v2-experimental', documentType: 'component-contract-manual',
    component, semantics: { purpose: 'Synthetic component for source-authority tests.' },
    representations: clone(input.facts.representations), semanticApi: [], documentation: [], examples: [], decisions: [],
    generation: { profiles: [], instructions: [] }, source: { kind: 'manual-source', importedFiles: [], sourceHash: 'c'.repeat(64), importedAt: '2026-10-01T00:00:00Z' },
    targets: clone(input.facts.targets), controlPorts: [],
    rules: [{ id: input.customizationPolicy[0].id, targetId: 'root', targetScope: 'self', capability: 'appearance.opacity', permission: 'constrained',
      controlPaths: [], constraints: [{ type: 'propertyDomain', fact: 'appearance.opacity', values: [1] }],
      applicability: { variants: 'all', modes: 'all', platforms: ['desktop'] }, rationale: 'Synthetic root opacity requirement.',
      status: 'reviewed', execution: { route: 'predicate' }, owner: 'test-author' }],
    metadata: { revision: 1, owners: { generated: 'athena-cli', manual: 'test-author', runtime: 'apollo-runtime' }, updatedAt: '2026-10-01T00:00:00Z' },
  };
  if (input.runtimePolicy.dependencyCompletionVersion) manual.metadata.dependencyCompletionVersion = 1;
  if (dependencies.length) manual.componentDependencies = (input.componentDependencies || []).map((pin, i) => {
    const child = runtime.loadAuthoringSource(dependencies[i]).contract;
    return Object.assign({}, pin, { contract: undefined, manualSourceHash: child.package.manualSourceHash, compiledHash: runtime.contractHash(child) });
  });
  const shape = [{ path: '', type: 'ROOT' }], shapeId = runtime.contractHash(shape);
  const variantEvidence = input.facts.variantEvidence || { schemaVersion: 'apollo.variant-anatomy.v1', sourceHash: 'c'.repeat(64),
    structures: { [shapeId]: shape }, variants: [{ componentKey: component.componentKey, componentSetKey: component.componentKey, structureId: shapeId, properties: {} }] };
  return clone({ schemaVersion: runtime.SOURCE_SCHEMA, documentType: 'component-contract-source', manual, variantEvidence, dependencies });
}
function source() { return fromContract(legacy.contract()); }
function snapshot() {
  const s = legacy.snapshot(), root = s.nodes[0]; root.semantic.path = 'Test';
  root.component.identity = { componentKey: 'test-key', componentSetKey: '' }; root.component.propertyTypes = {}; root.component.propertyReferences = [];
  s.variantReference = require("./dependency-fixtures").reference(s);
  return s;
}
function nested() {
  const f = require("./dependency-fixtures").dependencyFixture();
  const childSource = fromContract(f.child), hostSource = fromContract(f.host, [childSource]);
  return Object.assign(f, { source: hostSource, childSource,
    host: runtime.loadAuthoringSource(hostSource).contract, child: runtime.loadAuthoringSource(childSource).contract });
}
module.exports = { source, snapshot, nested, fromContract };
