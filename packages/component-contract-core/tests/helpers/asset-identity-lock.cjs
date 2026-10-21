// Independent synthetic component/port/reference data; no private catalog or capture.
const clone = value => JSON.parse(JSON.stringify(value));
function fixture(core) {
  const nodes = [];
  const add = (id, parentId, name, key, set, properties = {}, propertyTypes = {}) => {
    const parent = nodes.find(node => node.id === parentId);
    const node = { id, parentId, name, type: 'INSTANCE', childIds: [], order: nodes.length, visible: true, unknownFacts: [],
      semantic: { path: parent ? parent.semantic.path + ' / ' + name : name }, appearance: { opacity: 1 }, resolvedModes: {},
      component: { identity: { componentKey: key, componentSetKey: set, mainComponentId: key + '-main' }, properties, propertyTypes,
        propertyReferences: [], propertyReferenceBindings: {} } };
    if (parent) parent.childIds.push(id);
    nodes.push(node); return node;
  };
  add('root', null, 'Group', 'group-variant', 'group-set', { Size: '56', Overflow: 'true' }, { Size: 'VARIANT', Overflow: 'VARIANT' });
  for (let i = 1; i <= 4; i++) {
    add('button-' + i, 'root', 'Button' + i, 'button-variant', 'button-set', { SingleIcon: i === 4 ? 'True' : 'False' }, { SingleIcon: 'VARIANT' });
    add('addon-' + i, 'button-' + i, 'Addon', 'addon-variant', 'addon-set', { 'Icon-24#1:1': 'original-icon-main' }, { 'Icon-24#1:1': 'INSTANCE_SWAP' });
    const icon = add('icon-' + i, 'addon-' + i, 'Icon', 'original-icon', 'icon-set');
    icon.component.propertyReferences = ['Icon-24#1:1']; icon.component.propertyReferenceBindings = { mainComponent: 'Icon-24#1:1' };
  }
  const snapshot = { schemaVersion: 'apollo.predicate-snapshot.v2', generatedAt: '2026-10-05T00:00:00Z', nodes, selection: ['root'],
    context: { platform: 'desktop', modes: {}, unknownFacts: [] },
    source: { componentKey: 'group-variant', componentSetKey: 'group-set', rootNodeId: 'actual-root', truncated: false, nodeLimit: 500 } };
  const librarySnapshot = clone(snapshot);
  librarySnapshot.source.rootNodeId = 'independent-library-root';
  snapshot.variantReference = core.captureVariantReference(librarySnapshot, 'group-variant', 'group-set');
  const shape = snapshot.variantReference.nodes, structureId = core.stableHash(shape);
  const evidence = { schemaVersion: 'apollo.variant-anatomy.v1', sourceHash: 'c'.repeat(64), structures: { [structureId]: shape },
    variants: [{ componentKey: 'group-variant', componentSetKey: 'group-set', structureId, properties: { Size: '56', Overflow: 'true' } }] };
  const manual = { schemaVersion: 'apollo.component-contract.manual.v2-experimental', documentType: 'component-contract-manual',
    component: { componentId: 'synthetic.group', familyId: 'synthetic.group', contractId: 'synthetic.group', family: 'Group',
      library: 'Synthetic', layer: 'core', platform: 'desktop', platforms: ['desktop'], lifecycle: 'active', componentKey: 'group-set' },
    semantics: { purpose: 'Synthetic conditional asset identity lock.' }, representations: [{ id: 'desktop', kind: 'figma', platform: 'desktop', status: 'verified', locator: { componentKey: 'group-set' } }],
    semanticApi: [], documentation: [], examples: [], decisions: [], generation: { profiles: [], instructions: [] },
    source: { kind: 'manual-source', importedFiles: [], sourceHash: 'c'.repeat(64), importedAt: '2026-10-05T00:00:00Z' },
    targets: [{ id: 'root', semanticRole: 'root', label: 'Group', pathHint: 'Group', lineage: [], resolution: 'resolved' },
      ...Array.from({ length: 4 }, (_, i) => ({ id: 'button-' + (i + 1), semanticRole: 'button-' + (i + 1), label: 'Button' + (i + 1),
        pathHint: 'Group / Button' + (i + 1), lineage: [], resolution: 'resolved' }))], controlPorts: [],
    rules: [{ id: 'synthetic.single-icon-icon-is-fixed', targetId: 'root', targetScope: 'self', capability: 'composition.members',
      permission: 'constrained', controlPaths: [], constraints: [{ type: 'dependencyDomain', values: [false], dependency: {
        subjects: Array.from({ length: 4 }, (_, i) => ({ targetRole: 'button-' + (i + 1), relativePath: 'Addon' })),
        subjectCondition: { property: 'SingleIcon', propertyType: 'VARIANT', values: ['True'] },
        field: 'changed', portNames: ['Icon-24'], baselinePolicy: 'require-domain' } }],
      applicability: { variants: 'all', modes: 'all', platforms: ['desktop'], scopeStatus: 'confirmed' },
      rationale: 'An active SingleIcon preserves the exact independent library asset.', severity: 'error', status: 'reviewed', owner: 'test-author', execution: { route: 'auto' } }],
    metadata: { revision: 1, owners: { generated: 'athena-cli', manual: 'test-author', runtime: 'apollo-runtime' }, updatedAt: '2026-10-05T00:00:00Z' } };
  const compile = () => core.compileManualSource(manual, evidence);
  return { manual, evidence, snapshot, librarySnapshot, compile, clone };
}
function sizePortFixture(core, size, port) {
  const f = fixture(core), property = port + '#1:1';
  f.manual.rules[0].constraints[0].dependency.portNames = ['Icon-16', 'Icon-20', 'Icon-24'];
  f.evidence.variants[0].properties.Size = size;
  for (const snapshot of [f.snapshot, f.librarySnapshot]) {
    snapshot.nodes[0].component.properties.Size = size;
    for (let i = 1; i <= 4; i++) {
      const asset = 'original-' + size + '-' + port;
      const addon = snapshot.nodes.find(n => n.id === 'addon-' + i);
      // A Figma family may expose all ports while this variant has one consumer.
      addon.component.properties = Object.fromEntries(['Icon-16', 'Icon-20', 'Icon-24'].map(p => [p + '#1:1', 'inactive-' + p + '-main']));
      addon.component.properties[property] = asset + '-main';
      addon.component.propertyTypes = Object.fromEntries(['Icon-16', 'Icon-20', 'Icon-24'].map(p => [p + '#1:1', 'INSTANCE_SWAP']));
      const icon = snapshot.nodes.find(n => n.id === 'icon-' + i);
      Object.assign(icon.component.identity, { componentKey: asset, mainComponentId: asset + '-main' });
      icon.component.propertyReferences = [property]; icon.component.propertyReferenceBindings = { mainComponent: property };
    }
  }
  f.snapshot.variantReference = core.captureVariantReference(f.librarySnapshot, 'group-variant', 'group-set');
  return f;
}
module.exports = { fixture, sizePortFixture, clone };
