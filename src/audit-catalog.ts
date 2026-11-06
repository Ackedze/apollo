import { collectNodes, appendUnmatchedBaselineWarning, type CaptureReadControl } from '../packages/component-contract-core/src/figma-capture';
import { buildCatalogReference, applyCatalogResourceRemap, materializeCatalogBaseline } from '../packages/component-contract-core/src/catalog-reference';
import { resolveCaptureRepresentation } from '../packages/component-contract-core/src/capture-representation';
import { allowedComponentPropertyNames } from '../packages/component-contract-core/src/instance-validation';
import { configureInstanceMainAliases } from '../packages/component-contract-core/src/instance-main-aliases';
import { planInstanceContentReferences, materializeInstanceContentReferences } from '../packages/component-contract-core/src/instance-content-reference';
import { captureTransitionContext } from '../packages/component-contract-core/src/transition-capture';
import { dependencyPinIssue, COMPONENT_DEPENDENCY_DEPTH_LIMIT, COMPONENT_DEPENDENCY_CAPTURE_LIMIT, DIRECT_CHILD_DEPENDENCY_CAPTURE_LIMIT } from '../packages/component-contract-core/src/component-dependencies';
import type { CompiledContract } from '../packages/component-contract-core/src/types';

// This switch is an explicit, bounded experiment. No catalogue failure invokes
// the live reference materializer, including for a dependency or final recheck.
const pilotComponents = new Set([
  'web-corp.title-view', 'core.web.button', 'core.web.spinner',
  'web-corp.status-property', 'web-core.status', 'web-core.status-badge',
  'web-core.icon-view', 'web-core.indicator', 'core.web.link',
  'web-corp.filter-company-select', 'web-core.icon-button', 'web-core.skeleton',
]);
function fail(code: string, message: string): never { throw Object.assign(Error(message + ' (' + code + ')'), { code }); }
const transitionSession = 'catalog-' + Date.now() + '-' + Math.random().toString(36).slice(2);
let transitionSequence = 0;
export const catalogPilotComponent = (contract: CompiledContract) => pilotComponents.has(contract.package.componentId);

/** Read semantic resource facts once, without scanning inherited baselines,
 * report traces or the UI label collector's deliberately bounded metadata. */
function resourceReferences(snapshot: any) {
  const references = new Map<string, {kind:string; id:string}>();
  const add = (kind: string, id: unknown) => {
    if (typeof id === 'string' && id) references.set(kind + ':' + id, {kind, id});
  };
  const visit = (value: any) => {
    if (!value || typeof value !== 'object') return;
    if (value.type === 'VARIABLE_ALIAS') add('token', value.id);
    for (const [field, child] of Object.entries(value)) {
      if (['fillStyleId', 'strokeStyleId', 'effectStyleId', 'textStyleId', 'styleId'].includes(field)) add('style', child);
      if (field === 'tokenId' || field === 'variableId') add('token', child);
      if (['tokenIds', 'referencedVariableIds'].includes(field) && Array.isArray(child)) child.forEach(id => add('token', id));
      visit(child);
    }
  };
  for (const node of snapshot.nodes) {
    visit(node.appearance); visit(node.variable?.bindings);
    visit(node.textStyleEvidenceV1); visit(node.textFillEvidenceV1);
    for (const id of Object.keys(node.textStyleEvidenceV1?.keysById || {})) add('style', id);
    for (const id of Object.keys(node.hostVariableUsageV1?.bindings || {})) add('token', id);
    visit(node.hostVariableUsageV1?.bindings);
  }
  return references;
}

function markUnreadResource(snapshot: any, id: string) {
  const visit = (node: any, value: any, path: string) => {
    if (value === id) node.unknownFacts = Array.from(new Set((node.unknownFacts || []).concat(path)));
    else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
      if (key === id) node.unknownFacts = Array.from(new Set((node.unknownFacts || []).concat(path)));
      visit(node, child, path ? path + '.' + key : key);
    }
  };
  for (const node of snapshot.nodes) for (const field of ['appearance','variable','textStyleEvidenceV1','textFillEvidenceV1','hostVariableUsageV1'])
    visit(node, node[field], field);
}

/** Resolve identities already present in the document; never import a resource.
 * Published component keys can have several document-local aliases. */
async function resourceWitnesses(prepared: any, snapshot: any, control: CaptureReadControl, failures: string[], allowComponentAliases: boolean) {
  const candidates: any[] = [], collections = new Set<string>(Object.keys(snapshot.context.modes));
  const read = async (kind: string, id: string, work: () => Promise<any>) => {
    try {
      control.guard();
      const resource = await control.read(work);
      if (!resource || resource.id !== id || typeof resource.key !== 'string' || !resource.key
        || kind === 'component' && resource.type !== 'COMPONENT') throw Error('CATALOG_RESOURCE_READ_FAILED');
      candidates.push(Object.assign({kind, consumerId:id, consumerKey:resource.key},
        kind === 'collection' ? {consumerModes:resource.modes} : {}));
      return resource;
    } catch (error) {
      control.guard();
      if ((error as any)?.code === 'AUDIT_CANCELLED') throw error;
      failures.push('CATALOG_RESOURCE_READ_FAILED: ' + kind + ':' + id);
      // Only comparisons consuming this unread identity become UNKNOWN.
      markUnreadResource(snapshot, id);
      return undefined;
    }
  };
  for (const row of resourceReferences(snapshot).values()) {
    const item = await read(row.kind === 'token' ? 'variable' : 'style', row.id, () => row.kind === 'token'
      ? figma.variables.getVariableByIdAsync(row.id) : figma.getStyleByIdAsync(row.id));
    if (row.kind === 'token' && item?.variableCollectionId) collections.add(String(item.variableCollectionId));
  }
  for (const id of collections) await read('collection', id, () => figma.variables.getVariableCollectionByIdAsync(id));
  const componentIds = new Set<string>();
  for (const node of snapshot.nodes) {
    for (const id of [node.component?.identity?.mainComponentId, node.component?.sourceIdentity?.ownerMainComponentId])
      if (typeof id === 'string' && id) componentIds.add(id);
    for (const [name, type] of Object.entries(node.component?.propertyTypes || {})) {
      const id = node.component.properties?.[name];
      if (type === 'INSTANCE_SWAP' && typeof id === 'string' && id) componentIds.add(id);
    }
  }
  for (const id of componentIds) await read('component', id, () => figma.getNodeByIdAsync(id));
  const witnesses = prepared.resourceRequirements.flatMap((requirement: any) => {
    const matches = candidates.filter(row => row.kind === requirement.kind && row.consumerKey === requirement.sourceKey);
    const unique = new Map<string, any>(matches.map(row => [row.consumerId, row]));
    // Alias-aware contracts retain an independent namespaced source ID; every
    // observed local alias is keyed separately. Never choose an occurrence by ID.
    if (requirement.kind === 'component' && allowComponentAliases) return [];
    if (unique.size > 1) {
      // No first-match fallback for styles, tokens or mode domains.
      failures.push('CATALOG_RESOURCE_IDENTITY_AMBIGUOUS: ' + requirement.kind + ':' + requirement.sourceKey);
      for (const match of unique.values()) markUnreadResource(snapshot, match.consumerId);
      return [];
    }
    const match = Array.from(unique.values()).sort((a, b) => a.consumerId.localeCompare(b.consumerId))[0];
    return match ? [Object.assign({}, match, {sourceId:requirement.sourceId, sourceKey:requirement.sourceKey})] : [];
  });
  return {witnesses, componentKeys:Object.fromEntries(candidates.filter(row => row.kind === 'component').map(row => [row.consumerId, row.consumerKey]))};
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
  let selection: any = {contractId:contract.package.id, componentId:contract.package.componentId,
    revision, representationId:representation.id,
    componentKey:main.key, variantKey:main.key, config, modes};
  const failures: string[] = [];
  let prepared: ReturnType<typeof buildCatalogReference> | undefined;
  try {
    const response = await resolve(selection);
    control.guard();
    prepared = buildCatalogReference(response, contract, {releaseId, selection});
  } catch (error) {
    control.guard();
    if ((error as any)?.code === 'AUDIT_CANCELLED') throw error;
    failures.push((error as any)?.code || 'CATALOG_REFERENCE_FAILED');
  }
  // An unavailable reference must not enable the live pristine-instance path.
  const sourceTopology = prepared?.preparedSourceTopology || {componentKey:main.key, rootNodeId:main.id, nodes:[]};
  const captureControl = Object.assign({}, control, {preparedSourceTopology:sourceTopology});
  const actual = await collectNodes(subject, representation.platform, modes, undefined, captureControl);
  (actual.snapshot.source as any).catalogueNodeIds = Object.fromEntries(actual.anatomy.map(n => [n.id, n.figmaNodeId]));
  if ((prepared?.snapshot.source as any)?.rawCatalogue) {
    const nestedComponentKeys = Array.from(new Set(actual.snapshot.nodes.filter(n => n.type === 'INSTANCE'
      && !actual.snapshot.selection.includes(String(n.id))).map(n => (n.component as any)?.identity?.componentKey)
      .filter((k): k is string => typeof k === 'string' && /^[a-f0-9]{40}$/i.test(k)))).sort();
    if (nestedComponentKeys.length) try {
      const requested = Object.assign({}, selection, {hostContext:{nestedComponentKeys}});
      const response = await resolve(requested);
      control.guard();
      prepared = buildCatalogReference(response, contract, {releaseId, selection:requested});
      selection = requested;
    } catch (error) {
      control.guard();
      if ((error as any)?.code === 'AUDIT_CANCELLED') throw error;
      failures.push((error as any)?.code || 'CATALOG_NESTED_REFERENCE_FAILED');
    }
  }
  let baseline: ReturnType<typeof applyCatalogResourceRemap> | undefined;
  const swapKeys: Record<string, string> = {};
  if (prepared) {
    const resources = await resourceWitnesses(prepared, actual.snapshot, control, failures, contract.runtimePolicy.instanceMainComponentAliasesVersion === 1);
    Object.assign(swapKeys, resources.componentKeys);
    try { baseline = applyCatalogResourceRemap(prepared, resources.witnesses); }
    catch (error) { control.guard(); failures.push((error as any)?.code || 'CATALOG_RESOURCE_REMAP_FAILED'); }
    // The full independent reference pin remains authoritative for API facts,
    // even if visual resource/mode remapping failed.
    for (const requirement of prepared.resourceRequirements) if (requirement.kind === 'component') {
      const witness = baseline && resources.witnesses.find((w: any) => w.kind === 'component' && w.sourceId === requirement.sourceId);
      const id = baseline ? witness?.consumerId || 'catalog-source:component:' + prepared.referenceHash + ':' + requirement.sourceId : requirement.sourceId;
      if (swapKeys[id] && swapKeys[id] !== requirement.sourceKey) delete swapKeys[id];
      else swapKeys[id] = requirement.sourceKey;
    }
  }
  for (const snapshot of [actual.snapshot, baseline?.snapshot]) {
    if (!snapshot) continue;
    if (contract.runtimePolicy.portableSwapIdentityVersion === 1) snapshot.source!.swapComponentKeys = swapKeys;
    Object.assign(snapshot.source!, {componentKey:main.key, componentSetKey:setKey, representationId:representation.id});
    configureInstanceMainAliases(snapshot, contract.runtimePolicy.instanceMainComponentAliasesVersion === 1);
  }
  // collectNodes also serves authoring and initializes a self baseline. It is
  // never independent audit evidence when the catalogue could not be applied.
  if (!baseline) for (const node of actual.snapshot.nodes) {
    node.baseline = {effective:{}};
    node.baselineProvenance = {status:'unresolved', reason:'catalog-reference-unavailable'};
    node.unknownFacts = Array.from(new Set([...(Array.isArray(node.unknownFacts) ? node.unknownFacts : []), 'baseline.effective']));
  }
  const raw = Boolean((baseline?.snapshot.source as any)?.rawCatalogue);
  const materialized = baseline ? materializeCatalogBaseline(actual.snapshot, baseline.snapshot, contract) : actual;
  if (prepared && !raw) materialized.snapshot.variantReference = baseline?.variantReference || prepared.variantReference;
  if (raw) (materialized.snapshot as any).rawCatalogueReference = {base:baseline!.snapshot};
  // Preserve the same replay validator and explicit uncertainty for unsupported
  // configured host replacements. Do not borrow any observed visual facts.
  const attempts = baseline && !raw ? planInstanceContentReferences(materialized.snapshot).map(boundary => ({
    boundaryNodeId:boundary.nodeId, failure:'catalog-configured-host-unavailable',
  })) : [];
  if (baseline && !raw) {
    materialized.snapshot.instanceContentReferences = {schemaVersion:'apollo.instance-content-references.v4',
      hostContextVariableModesVersion:1, base:baseline.snapshot, attempts};
    materializeInstanceContentReferences(materialized.snapshot);
  }
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
  const warnings: string[] = failures.map(code => 'Часть эталонных фактов недоступна; независимые проверки выполнены. (' + code + ')');
  const baselineDiagnostics = appendUnmatchedBaselineWarning(warnings, unmatched);
  if (attempts.length) warnings.push('Каталог не содержит независимые настроенные host-эталоны для заменённого содержимого.');
  if (temporalStart) {
    const end = captureTransitionContext(subject), complete = temporalStart.complete && end.complete && temporalStart.fingerprint === end.fingerprint;
    materialized.snapshot.transitionCapture = Object.assign({schemaVersion:'apollo.transition-capture.v1' as const,
      sessionId:transitionSession, sequence, manualSourceHash:contract.package.manualSourceHash,
      externalContext:temporalStart.context, complete}, complete ? {} : {reason:temporalStart.reason || end.reason || 'changed-during-capture'});
  }
  Object.assign(materialized.snapshot.source!, {catalogReference:{schemaVersion:'apollo.catalog-capture.v1', referenceHash:prepared?.referenceHash,
    releaseId, failures, mechanism:raw?'athena-v3-raw-catalogue':'athena-v3-structure-and-native-facts'}});
  control.guard();
  return {componentKey:main.key, anatomy:actual.anatomy, snapshot:materialized.snapshot,
    imageDataUrl:'', width:subject.width, height:subject.height, matchedBaselineNodes:materialized.snapshot.nodes.length - unmatched.length,
    unmatchedBaselineNodeIds:unmatched, warnings, baselineDiagnostics, manualSourceHash:contract.package.manualSourceHash,
    preparedSourceTopology:sourceTopology, referenceOrigin:'catalog'};
}
