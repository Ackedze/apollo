const { fixture } = require('./asset-identity-lock.cjs');

// All manual rules and generated anatomy are independent synthetic data.
function hostModeContract(core, direction) {
  const manual = fixture(core).manual;
  Object.assign(manual.component, { componentId: 'synthetic.host-modes', contractId: 'synthetic.host-modes', componentKey: 'host', family: 'Host' });
  manual.representations[0].locator = { componentKey: 'host' };
  manual.targets = [{ id: 'root', semanticRole: 'root', label: 'Host', pathHint: 'Host', lineage: [], resolution: 'resolved' }];
  const roles = [], nodes = [{ nodeId: 1, parentId: null, name: 'Host', type: 'COMPONENT' }];
  for (let i = 0; i < 4; i++) {
    const role = 'button-' + i; roles.push(role);
    manual.targets.push({ id: role, semanticRole: role, label: 'Button', pathHint: 'Host / @catalog:' + (2 + i * 2), lineage: [], resolution: 'resolved',
      variantHints: [{ representationId: 'desktop', componentKey: 'host', pathHint: 'Host / @source:100%3A' + (i + 2) }] });
    nodes.push({ nodeId: 2 + i * 2, parentId: 1, name: 'Button', type: 'INSTANCE' }, { nodeId: 3 + i * 2, parentId: 2 + i * 2, name: 'Content', type: 'FRAME' });
  }
  const rule = manual.rules[0];
  Object.assign(rule, { id: 'synthetic.primary-position', capability: 'composition.members', constraints: [{ type: 'memberCollection', collection: {
    version: 1, ownerTargetRole: 'root', memberTargetRoles: roles,
    representationIds: ['desktop'], visibleOnly: true,
    filter: { property: 'Size', propertyType: 'VARIANT', values: ['56'] },
    assertion: { kind: 'position', position: 'first' },
  } }], rationale: 'The synthetic primary variant belongs in the first position.' });
  const evidence = core.extractVariantEvidence([{ componentKey: 'host', figma: { defaultVariantKey: 'host',
    variants: { variantKeys: [{ key: 'host', properties: {} }] }, structureSignature: nodes } }]);
  const compiled = core.compileManualSource(manual, evidence);
  if (!compiled.contract) throw Error(JSON.stringify(compiled.issues));
  return { manual, evidence, compiled, contract: compiled.contract };
}
module.exports = { hostModeContract };
