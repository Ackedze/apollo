import { collectNodes, appendUnmatchedBaselineWarning, type CaptureReadControl } from '../packages/component-contract-core/src/figma-capture';
import { buildCatalogReference, applyCatalogResourceRemap, materializeCatalogBaseline } from '../packages/component-contract-core/src/catalog-reference';
import { resolveCaptureRepresentation } from '../packages/component-contract-core/src/capture-representation';
import { allowedComponentPropertyNames } from '../packages/component-contract-core/src/instance-validation';
import { configureInstanceMainAliases } from '../packages/component-contract-core/src/instance-main-aliases';
import { planInstanceContentReferences, materializeInstanceContentReferences } from '../packages/component-contract-core/src/instance-content-reference';
import { captureVariantReference } from '../packages/component-contract-core/src/variant-facts';
import { captureTransitionContext } from '../packages/component-contract-core/src/transition-capture';
import { dependencyPinIssue, COMPONENT_DEPENDENCY_DEPTH_LIMIT, COMPONENT_DEPENDENCY_CAPTURE_LIMIT, DIRECT_CHILD_DEPENDENCY_CAPTURE_LIMIT } from '../packages/component-contract-core/src/component-dependencies';
import type { CompiledContract } from '../packages/component-contract-core/src/types';

// This switch is an explicit, bounded experiment. No catalogue failure invokes
// the live reference materializer, including for a dependency or final recheck.
const pilotComponents = new Set(['core.web.button', 'web-corp.title-view', 'core.web.spinner']);
function fail(code: string, message: string): never { throw Object.assign(Error(message + ' (' + code + ')'), { code }); }
const transitionSession = 'catalog-' + Date.now() + '-' + Math.random().toString(36).slice(2);
let transitionSequence = 0;
export const catalogPilotComponent = (contract: CompiledContract) => pilotComponents.has(contract.package.componentId);

/** Resolve identities already present in the document; never import a resource. */
async function resourceWitnesses(prepared: any, snapshot: any, control: CaptureReadControl) {
  const { collectReferences } = require('./v3-binding/resource-labels');
  const batch = collectReferences(snapshot);
  if (batch.truncated) fail('CATALOG_RESOURCE_SCOPE_INCOMPLETE', 'Не удалось прочитать все связи ресурсов каталожного эталона.');
  const candidates: any[] = [], collections = new Set<string>(Object.keys(snapshot.context.modes));
  const remember = (kind: string, resource: any) => {
    if (!resource || typeof resource.id !== 'string' || typeof resource.key !== 'string')
      fail('CATALOG_RESOURCE_READ_FAILED', 'Figma не вернула идентификатор используемого ресурса.');
    candidates.push(Object.assign({kind, consumerId:resource.id, consumerKey:resource.key},
      kind === 'collection' ? {consumerModes:resource.modes} : {}));
  };
  for (const row of batch.references) {
    control.guard();
    const item = await control.read<any>(() => row.kind === 'token'
      ? figma.variables.getVariableByIdAsync(row.id) : figma.getStyleByIdAsync(row.id));
    remember(row.kind === 'token' ? 'variable' : 'style', item);
    if (row.kind === 'token' && item && 'variableCollectionId' in item) collections.add(String(item.variableCollectionId));
  }
  for (const id of collections) remember('collection', await control.read(() => figma.variables.getVariableCollectionByIdAsync(id)));
  const componentIds = new Set<string>();
  for (const node of snapshot.nodes) {
    for (const id of [node.component?.identity?.mainComponentId, node.component?.sourceIdentity?.ownerMainComponentId])
      if (typeof id === 'string' && id) componentIds.add(id);
    for (const [name, type] of Object.entries(node.component?.propertyTypes || {})) {
      const id = node.component.properties?.[name];
      if (type === 'INSTANCE_SWAP' && typeof id === 'string' && id) componentIds.add(id);
    }
  }
  for (const id of componentIds) {
    const node = await control.read(() => figma.getNodeByIdAsync(id));
    if (!node || node.type !== 'COMPONENT') fail('CATALOG_RESOURCE_READ_FAILED', 'Figma не вернула источник свойства замены.');
    remember('component', node);
  }
  return prepared.resourceRequirements.flatMap((requirement: any) => {
    const matches = candidates.filter(row => row.kind === requirement.kind && row.consumerKey === requirement.sourceKey);
    const unique = new Map(matches.map(row => [row.consumerId, row]));
    if (unique.size > 1) fail('CATALOG_RESOURCE_IDENTITY_AMBIGUOUS', 'Ключ ресурса соответствует нескольким источникам в документе.');
    const match = Array.from(unique.values())[0] as any;
    return match ? [Object.assign({}, match, {sourceId:requirement.sourceId, sourceKey:requirement.sourceKey})] : [];
  });
}

export async function captureCatalogAudit(subject: InstanceNode, contract: CompiledContract, releaseId: string,
  resolve: (selection: any) => Promise<any>, control: CaptureReadControl, depth = 0): Promise<any> {
  control.guard();
  if (!catalogPilotComponent(contract)) fail('CATALOG_COMPONENT_OUTSIDE_PILOT', 'Этот компонент ещё не включён в каталожный пилот.');
  if (depth > COMPONENT_DEPENDENCY_DEPTH_LIMIT) fail('CATALOG_DEPENDENCY_DEPTH', 'Не подтверждена полная цепочка каталожных зависимостей.');
  const temporalStart = contract.runtimePolicy.transitionFactsVersion === 1 ? captureTransitionContext(subject) : undefined;
  const sequence = temporalStart ? ++transitionSequence : 0;
  const main = await control.read(() => subject.getMainComponentAsync());
  if (!main) fail('CATALOG_MAIN_UNAVAILABLE', 'Не найден источник выбранного экземпляра.');
  const setKey = main.parent?.type === 'COMPONENT_SET' ? main.parent.key : '';
  const representation = resolveCaptureRepresentation(contract.facts.representations, main.key, setKey);
  if (!representation) fail('CATALOG_REPRESENTATION_UNAVAILABLE', 'Не определено представление компонента для каталожной проверки.');
  const config: Record<string, string | boolean> = {}, allowed = new Set(allowedComponentPropertyNames(contract));
  for (const [name, property] of Object.entries(subject.componentProperties)) if ((allowed.has(name) || property.type === 'VARIANT')
    && (typeof property.value === 'string' || typeof property.value === 'boolean')) config[name] = property.value;
  const modes = Object.assign({}, subject.resolvedVariableModes);
  const revisions = Array.from(new Set(contract.rules.map(rule => rule.revision)));
  const revision = contract.package.manualRevision ?? (revisions.length === 1 ? revisions[0] : undefined);
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision)) fail('CATALOG_CONTRACT_REVISION_REQUIRED', 'В контракте не закреплена ревизия каталожной проверки.');
  const selection = {contractId:contract.package.id, componentId:contract.package.componentId,
    revision, representationId:representation.id,
    componentKey:main.key, variantKey:main.key, config, modes};
  const response = await resolve(selection);
  control.guard();
  const prepared = buildCatalogReference(response, contract, {releaseId, selection});
  const captureControl = Object.assign({}, control, {preparedSourceTopology:prepared.preparedSourceTopology});
  const actual = await collectNodes(subject, representation.platform, modes, undefined, captureControl);
  const baseline = applyCatalogResourceRemap(prepared, await resourceWitnesses(prepared, actual.snapshot, control));
  for (const snapshot of [actual.snapshot, baseline.snapshot]) {
    Object.assign(snapshot.source!, {componentKey:main.key, componentSetKey:setKey, representationId:representation.id});
    configureInstanceMainAliases(snapshot, contract.runtimePolicy.instanceMainComponentAliasesVersion === 1);
  }
  const materialized = materializeCatalogBaseline(actual.snapshot, baseline.snapshot);
  materialized.snapshot.variantReference = captureVariantReference(baseline.snapshot, main.key, setKey,
    Object.keys((main.parent?.type === 'COMPONENT_SET' ? main.parent : main).componentPropertyDefinitions));
  // Preserve the same replay validator and explicit uncertainty for unsupported
  // configured host replacements. Do not borrow any observed visual facts.
  const attempts = planInstanceContentReferences(materialized.snapshot).map(boundary => ({
    boundaryNodeId:boundary.nodeId, failure:'catalog-configured-host-unavailable',
  }));
  materialized.snapshot.instanceContentReferences = {schemaVersion:'apollo.instance-content-references.v4',
    hostContextVariableModesVersion:1, base:baseline.snapshot, attempts};
  materializeInstanceContentReferences(materialized.snapshot);
  const accepted = new Set<string>(), dependencies: any[] = [];
  for (const dependency of contract.componentDependencies || []) if (!dependency.issue && dependency.contract
    && !dependencyPinIssue(dependency, dependency.contract)) {
    dependencies.push(dependency.contract);
    for (const rep of dependency.contract.facts.representations) if (rep.kind === 'figma' && rep.status !== 'deprecated')
      for (const key of [rep.locator.componentKey, rep.locator.componentSetKey]) if (typeof key === 'string' && key) accepted.add(key);
  }
  const candidates = materialized.snapshot.nodes.filter(node => !materialized.snapshot.selection.includes(String(node.id))
    && node.type === 'INSTANCE' && (accepted.has(String((node.component as any)?.identity?.componentKey))
      || accepted.has(String((node.component as any)?.identity?.componentSetKey))));
  if (accepted.size) materialized.snapshot.componentDependencyCaptures = [];
  for (const [index, node] of candidates.entries()) {
    control.guard();
    const attempt: any = {nodeId:String(node.id)};
    materialized.snapshot.componentDependencyCaptures!.push(attempt);
    if (index >= (contract.runtimePolicy.directChildDependenciesVersion === 1 ? DIRECT_CHILD_DEPENDENCY_CAPTURE_LIMIT : COMPONENT_DEPENDENCY_CAPTURE_LIMIT)) {
      attempt.failure = 'dependency-reference-capture-limit'; continue;
    }
    const keys = (node.component as any)?.identity;
    const matched = dependencies.filter(d => d.facts.representations.some((r: any) => r.kind === 'figma'
      && [r.locator.componentKey, r.locator.componentSetKey].some(k => k && [keys.componentKey, keys.componentSetKey].includes(k))));
    if (matched.length !== 1) { attempt.failure = 'dependency-contract-unavailable'; continue; }
    const locator = actual.anatomy.find(n => n.id === node.id)?.figmaNodeId;
    const nested = locator ? await control.read(() => figma.getNodeByIdAsync(locator)) : null;
    if (!nested || nested.type !== 'INSTANCE') { attempt.failure = 'dependency-instance-unavailable'; continue; }
    try {
      const captured = await captureCatalogAudit(nested, matched[0], releaseId, resolve, control, depth + 1);
      attempt.snapshot = captured.snapshot;
      attempt.nodeMap = Object.fromEntries(captured.anatomy.map((local: any) => [local.id,
        actual.anatomy.find(host => host.figmaNodeId === local.figmaNodeId)?.id || '']));
    } catch (error) {
      control.guard(); attempt.failure = 'dependency-catalog-reference-unavailable';
      attempt.failureDetails = {stage:'catalog-reference', code:(error as any)?.code || 'CATALOG_REFERENCE_FAILED',
        message:error instanceof Error ? error.message : String(error)};
    }
  }
  const unmatched = materialized.snapshot.nodes.filter(node => (node.baselineProvenance as any)?.status !== 'matched').map(node => String(node.id));
  const warnings: string[] = [];
  const baselineDiagnostics = appendUnmatchedBaselineWarning(warnings, unmatched);
  if (attempts.length) warnings.push('Каталог не содержит независимые настроенные host-эталоны для заменённого содержимого.');
  if (temporalStart) {
    const end = captureTransitionContext(subject), complete = temporalStart.complete && end.complete && temporalStart.fingerprint === end.fingerprint;
    materialized.snapshot.transitionCapture = Object.assign({schemaVersion:'apollo.transition-capture.v1' as const,
      sessionId:transitionSession, sequence, manualSourceHash:contract.package.manualSourceHash,
      externalContext:temporalStart.context, complete}, complete ? {} : {reason:temporalStart.reason || end.reason || 'changed-during-capture'});
  }
  Object.assign(materialized.snapshot.source!, {catalogReference:{schemaVersion:'apollo.catalog-capture.v1', referenceHash:prepared.referenceHash,
    releaseId, mechanism:'athena-v3-structure-and-native-facts'}});
  control.guard();
  return {componentKey:main.key, anatomy:actual.anatomy, snapshot:materialized.snapshot,
    imageDataUrl:'', width:subject.width, height:subject.height, matchedBaselineNodes:materialized.snapshot.nodes.length - unmatched.length,
    unmatchedBaselineNodeIds:unmatched, warnings, baselineDiagnostics, manualSourceHash:contract.package.manualSourceHash,
    preparedSourceTopology:prepared.preparedSourceTopology, referenceOrigin:'catalog'};
}
