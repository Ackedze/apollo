function contract() {
  const hash = 'a'.repeat(64);
  return {
    schemaVersion: 'apollo.component-contract.v2.1-experimental', documentType: 'component-contract', status: 'ready',
    package: { id: 'test.component', componentId: 'test.component', manualSourceHash: hash, snapshotProfile: 'component-facts-v2' },
    facts: {
      component: { componentId: 'test.component', componentKey: 'test-key', family: 'Test', platform: 'desktop' },
      representations: [{ id: 'figma', kind: 'figma', platform: 'desktop', status: 'verified', locator: { componentKey: 'test-key' } }],
      targets: [{ id: 'root', semanticRole: 'root', nameHint: 'Test', pathHint: 'Test', lineage: [], resolution: 'resolved' }],
      semanticApi: [], semantics: {}, controlPorts: [], documentation: [], examples: [], decisions: [], generation: [],
    },
    customizationPolicy: [{ id: 'source.rule', status: 'reviewed', permission: 'constrained', capability: '', controlPaths: [], execution: { route: 'predicate' } }],
    rules: [{
      schemaVersion: 'apollo.rule-ir.v1', ruleId: 'source.rule.1', revision: 1,
      source: { anchor: 'source.rule', path: 'contract.manual.json', checksum: hash },
      authority: { status: 'active', provenance: 'test-author' }, effect: 'require', scope: {},
      select: { from: 'selection-root', traverse: 'self' },
      assert: { predicate: 'equals', actual: { fact: 'appearance.opacity' }, expected: { literal: 1 }, missingPolicy: 'unknown' },
      severity: 'error', unknownPolicy: 'human-review', presentation: { title: 'Root opacity must equal 1.' },
    }],
    nonExecutableRules: [], capabilities: { selectors: [], facts: [], operators: [], remediations: [] },
    coverage: { sourceRules: 1, policyRules: 1, policyOnlyRules: 0, compiledRules: 1, nonExecutableRules: 0 },
    runtimePolicy: { engine: 'apollo-predicate-engine', unknownPolicy: 'fail-closed', compiledIsSourceOfTruth: false },
  };
}

function snapshot() {
  return {
    schemaVersion: 'apollo.predicate-snapshot.v2', generatedAt: '2026-10-01T00:00:00.000Z',
    source: { componentKey: 'test-key', rootNodeId: 'root', truncated: false }, selection: ['root'],
    context: { platform: 'desktop', modes: {} },
    nodes: [{ id: 'root', name: 'Test', type: 'INSTANCE', visible: true, order: 0, parentId: null, childIds: [],
      semantic: { role: 'root' }, component: { key: 'test-key', properties: {} }, appearance: { opacity: 1 } }],
  };
}

module.exports = { contract, snapshot };
