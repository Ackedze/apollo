import {
  LEGACY_MANUAL_SCHEMA_VERSION,
  MANUAL_SCHEMA_VERSION,
  type AnatomyNode,
  type ComponentChoice,
  type ComponentIdentity,
  type CompiledContract,
  type ImportedWorkspace,
  type JsonValue,
  type ManualSource,
  type SemanticTarget,
  type VariantScenario,
} from './types';
import { slug, stableHash, uniqueSorted } from './stable';
import { extractVariantEvidence } from './variant-facts';
import { catalogOccurrencePaths } from './occurrence-address';
import { extractAssetCatalogs, parseAssetCatalogs } from './dependency-facts';
import { extractTextStyleCatalogs } from './text-style-facts';

export type TextFile = { name: string; text: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function collectStrings(value: unknown, keyMatcher: RegExp, result: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectStrings(entry, keyMatcher, result));
    return result;
  }
  if (!isRecord(value)) return result;
  for (const [key, entry] of Object.entries(value)) {
    if (keyMatcher.test(key) && typeof entry === 'string' && entry) result.push(entry);
    collectStrings(entry, keyMatcher, result);
  }
  return result;
}

function parseFiles(files: TextFile[]): Array<{ name: string; data: Record<string, unknown> }> {
  const seen=new Map<string,string>();
  const unique=files.filter(file=>{const key=file.name.split('/').pop() || file.name;const previous=seen.get(key);if(previous===file.text)return false;seen.set(key,file.text);return true;});
  return unique.map((file) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(file.text);
    } catch (error) {
      throw new Error(`${file.name}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
    }
    if (!isRecord(parsed)) throw new Error(`${file.name}: root must be a JSON object.`);
    return { name: file.name, data: parsed };
  });
}

function packageFolder(files: TextFile[]): string {
  const generated = files.find((file) => /contract\.generated\.json$/i.test(file.name));
  const path = generated?.name || files[0]?.name || '';
  const parts = path.split('/').filter(Boolean);
  const sourceIndex = parts.lastIndexOf('source');
  if (sourceIndex > 0) return parts[sourceIndex - 1];
  return parts.length > 1 ? parts[parts.length - 2] : '';
}

function contractCandidates(parsed: Array<{ name: string; data: Record<string, unknown> }>): Record<string, unknown>[] {
  const candidates: Record<string, unknown>[] = [];
  for (const entry of parsed) {
    for (const candidate of arrayValue(entry.data.contracts)) {
      if (isRecord(candidate)) candidates.push({ ...candidate, packageAthena: true });
    }
    const generated = record(entry.data.generated);
    for (const candidate of arrayValue(generated.contracts)) {
      if (isRecord(candidate)) candidates.push({ ...candidate, packageAthena: true });
    }
  }
  if (candidates.length) return candidates;
  for (const entry of parsed) {
    if (entry.data.documentType !== 'component-contract') continue;
    const packageInfo = record(entry.data.package);
    const familySlug = slug(stringValue(packageInfo.family));
    const library = stringValue(packageInfo.library);
    for (const componentApiEntry of arrayValue(record(entry.data.facts).componentApi)) {
      if (!isRecord(componentApiEntry)) continue;
      const name = stringValue(componentApiEntry.name);
      const status = stringValue(componentApiEntry.status, 'active');
      candidates.push({
        ...componentApiEntry,
        normalizedName: slug(name),
        packageComponentApi: true,
        packageFamily: slug(name) === familySlug,
        role: status !== 'deprecated' ? 'main' : 'supporting',
        source: { ...record(componentApiEntry.source), library },
      });
    }
  }
  return candidates;
}

function compiledContainsCandidate(
  data: Record<string, unknown>,
  candidate: Record<string, unknown> | undefined,
): boolean {
  if (data.documentType !== 'component-contract') return false;
  if (!candidate) return true;
  const candidateId = stringValue(candidate.id);
  const candidateKey = stringValue(candidate.componentKey);
  const packageInfo = record(data.package);
  if (candidateId && stringValue(packageInfo.id) === candidateId) return true;
  const facts = record(data.facts);
  const factsComponent = record(facts.component);
  if (candidateKey && stringValue(factsComponent.componentKey) === candidateKey) return true;
  return arrayValue(facts.componentApi).some((entry) => {
    const componentApi = record(entry);
    return Boolean(
      (candidateId && stringValue(componentApi.id) === candidateId)
      || (candidateKey && stringValue(componentApi.componentKey) === candidateKey),
    );
  });
}

function chooseContract(
  candidates: Record<string, unknown>[],
  folder: string,
  preferredContractId?: string,
): Record<string, unknown> | undefined {
  if (!candidates.length) return undefined;
  if (preferredContractId) {
    const preferred = candidates.find((candidate) => stringValue(candidate.id) === preferredContractId);
    if (preferred) return preferred;
  }
  const folderSlug = slug(folder);
  return candidates.find((candidate) => {
    const name = stringValue(candidate.normalizedName) || slug(stringValue(candidate.name));
    return name === folderSlug;
  }) || candidates.find((candidate) => candidate.packageFamily === true && candidate.role === 'main')
    || candidates.find((candidate) => candidate.role === 'main') || candidates[0];
}

function choicesForContract(
  candidates: Record<string, unknown>[],
  selected: Record<string, unknown> | undefined,
  representedComponentKeys: Set<string>,
): ComponentChoice[] {
  if (!selected) return [];
  const normalizedName = stringValue(selected.normalizedName) || slug(stringValue(selected.name));
  const familyName = normalizedName.replace(/-inverted$/i, '');
  const selectedLibrary = stringValue(record(selected.source).library);
  const matching = candidates.filter((candidate) => {
    const candidateName = stringValue(candidate.normalizedName) || slug(stringValue(candidate.name));
    const candidateLibrary = stringValue(record(candidate.source).library);
    const candidateKey = stringValue(candidate.componentKey);
    const belongsToRepresentations = representedComponentKeys.size > 0
      && representedComponentKeys.has(candidateKey);
    const belongsToSameCompiledPackage = selected.packageComponentApi === true
      && candidate.packageComponentApi === true;
    const belongsToSameAthenaPackage = selected.packageAthena === true
      && candidate.packageAthena === true;
    const belongsToDetectedFamily = candidateName.replace(/-inverted$/i, '') === familyName;
    return candidate.role === 'main'
      && stringValue(candidate.status, 'active') !== 'deprecated'
      && (belongsToSameCompiledPackage || belongsToSameAthenaPackage || belongsToRepresentations || belongsToDetectedFamily)
      && (!selectedLibrary || !candidateLibrary || candidateLibrary === selectedLibrary);
  });
  const preferredByRepresentation = new Map<string, Record<string, unknown>>();
  matching.forEach((candidate) => {
    const candidateName = stringValue(candidate.normalizedName) || slug(stringValue(candidate.name));
    const platform = stringValue(candidate.platform) || 'universal';
    const representationId = `${candidateName}.${platform}`;
    const current = preferredByRepresentation.get(representationId);
    if (!current || stringValue(candidate.id) === representationId) {
      preferredByRepresentation.set(representationId, candidate);
    }
  });
  const choiceCandidates = preferredByRepresentation.size
    ? Array.from(preferredByRepresentation.values())
    : [selected];
  const choices = choiceCandidates.map((candidate) => ({
    contractId: stringValue(candidate.id),
    label: stringValue(candidate.name) || stringValue(candidate.normalizedName) || 'Component',
    platform: stringValue(candidate.platform) || 'universal',
    componentKey: stringValue(candidate.componentKey),
  })).filter((choice) => choice.contractId);
  return Array.from(new Map(choices.map((choice) => [choice.contractId, choice])).values());
}

function componentIdentity(
  parsed: Array<{ name: string; data: Record<string, unknown> }>,
  candidate: Record<string, unknown> | undefined,
  folder: string,
): ComponentIdentity {
  const compiled = parsed.find((entry) => compiledContainsCandidate(entry.data, candidate))?.data;
  const packageInfo = record(compiled?.package);
  const source = record(candidate?.source);
  const metadata = parsed.map((entry) => record(entry.data.metadata)).find((entry) => Object.keys(entry).length);
  const family = stringValue(candidate?.name)
    || stringValue(candidate?.normalizedName)
    || stringValue(packageInfo.family)
    || folder
    || 'Imported component';
  const contractId = stringValue(candidate?.id)
    || stringValue(packageInfo.id)
    || stringValue(metadata?.componentKey)
    || `manual.${slug(family)}`;
  const discoveredKeys = collectStrings(parsed.map((entry) => entry.data), /^componentKey$/i);
  const componentKey = stringValue(candidate?.componentKey)
    || discoveredKeys.find((value) => /^[a-f\d]{20,}$/i.test(value))
    || '';
  const semanticId = stringValue(metadata?.componentKey)
    || stringValue(record(record(compiled?.facts).component).componentId)
    || contractId;
  const platform = stringValue(candidate?.platform) || 'universal';
  return {
    componentId: semanticId,
    familyId: semanticId,
    contractId,
    family: family.replace(/^\[[DMT]\]\s*/, ''),
    layer: stringValue(metadata?.layer) || 'core',
    library: stringValue(source.library) || stringValue(packageInfo.library) || 'Unknown library',
    platform,
    platforms: platform === 'universal' ? [] : [platform],
    lifecycle: stringValue(candidate?.status) === 'deprecated'
      ? 'deprecated'
      : stringValue(candidate?.status) === 'scheduled'
        ? 'scheduled'
        : 'active',
    componentKey,
  };
}

function normalizeManualSource(value: Record<string, unknown>): ManualSource {
  if (value.schemaVersion === MANUAL_SCHEMA_VERSION) {
    return {
      ...(value as unknown as ManualSource),
      examples: arrayValue(value.examples) as ManualSource['examples'],
      decisions: arrayValue(value.decisions) as ManualSource['decisions'],
    };
  }
  if (value.schemaVersion !== LEGACY_MANUAL_SCHEMA_VERSION) {
    throw new Error(`Unsupported manual source schema: ${stringValue(value.schemaVersion, 'unknown')}.`);
  }
  const legacy = value as unknown as Omit<ManualSource, 'schemaVersion' | 'semantics' | 'representations' | 'semanticApi' | 'documentation' | 'examples' | 'decisions' | 'generation'>;
  const component = legacy.component as ComponentIdentity;
  const componentId = component.componentId || component.contractId;
  return {
    ...legacy,
    schemaVersion: MANUAL_SCHEMA_VERSION,
    component: {
      ...component,
      componentId,
      familyId: component.familyId || componentId,
      layer: component.layer || 'core',
      platforms: component.platforms || (component.platform === 'universal' ? [] : [component.platform]),
      lifecycle: component.lifecycle || 'active',
    },
    semantics: {
      purpose: '',
      useWhen: [],
      doNotUseWhen: [],
      relatedComponentIds: [],
      keywords: [],
    },
    representations: component.componentKey ? [{
      id: `${componentId}.figma.${component.platform || 'universal'}`,
      kind: 'figma',
      platform: component.platform || 'universal',
      status: 'draft',
      locator: { componentKey: component.componentKey },
    }] : [],
    semanticApi: [],
    documentation: [],
    examples: [],
    decisions: [],
    generation: { profiles: [], instructions: [] },
    metadata: {
      ...legacy.metadata,
      updatedAt: new Date().toISOString(),
    },
  };
}

function variantsFromContract(candidate: Record<string, unknown> | undefined, identity: ComponentIdentity): VariantScenario[] {
  const figma = record(candidate?.figma);
  const variants = record(figma.variants);
  const variantKeys = arrayValue(variants.variantKeys);
  const result = variantKeys.flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const properties = Object.fromEntries(
      Object.entries(record(entry.properties)).map(([key, value]) => [key, stringValue(value)]),
    );
    return [{
      id: stringValue(entry.key) || `variant-${index + 1}`,
      label: stringValue(entry.name) || Object.entries(properties).map(([key, value]) => `${key}=${value}`).join(', '),
      componentKey: stringValue(entry.key) || identity.componentKey,
      properties,
    }];
  });
  if (result.length) return result;
  return [{
    id: identity.componentKey || 'default',
    label: 'Default',
    componentKey: identity.componentKey,
    properties: {},
  }];
}

function nodeProperties(node: Record<string, unknown>): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {
    visible: node.visible !== false,
    name: stringValue(node.name),
    type: stringValue(node.type),
  };
  if (node.layout !== undefined) result.layout = node.layout as JsonValue;
  if (node.radius !== undefined) result.radius = node.radius as JsonValue;
  if (node.opacity !== undefined) result.opacity = node.opacity as JsonValue;
  if (node.fills !== undefined) result.fills = node.fills as JsonValue;
  if (node.strokes !== undefined) result.strokes = node.strokes as JsonValue;
  if (node.fillToken !== undefined) result.fillToken = node.fillToken as JsonValue;
  if (node.strokeToken !== undefined) result.strokeToken = node.strokeToken as JsonValue;
  if (node.typographyToken !== undefined) result.typographyToken = node.typographyToken as JsonValue;
  if (node.text !== undefined) result.text = node.text as JsonValue;
  if (node.variantProperties !== undefined) result.variantProperties = node.variantProperties as JsonValue;
  return result;
}

function structureFromContract(candidate: Record<string, unknown> | undefined): AnatomyNode[] {
  const figma = record(candidate?.figma);
  const raw = arrayValue(figma.structureSignature);
  const ids = raw.map((entry, index) => stringValue(record(entry).nodeId, String(index + 1)));
  const result: AnatomyNode[] = raw.flatMap((entry, index): AnatomyNode[] => {
    if (!isRecord(entry)) return [];
    const parentRaw = entry.parentId;
    const parentId = parentRaw === null || parentRaw === undefined ? null : String(parentRaw);
    const name = stringValue(entry.name, `Node ${index + 1}`);
    const path = stringValue(entry.path, name);
    const depth = Math.max(0, path.split('/').length - 1);
    return [{
      id: ids[index],
      parentId,
      name,
      type: stringValue(entry.type, 'NODE'),
      path,
      semanticRole: slug(name),
      visible: entry.visible !== false,
      order: index,
      depth,
      childIds: [],
      properties: nodeProperties(entry),
      unknownFacts: [],
    }];
  });
  const byId = new Map(result.map((node) => [node.id, node]));
  result.forEach((node) => {
    if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId)?.childIds.push(node.id);
  });
  const paths=catalogOccurrencePaths(new Map(raw.filter(isRecord).map(node=>[String(node.nodeId),node])));
  const root=result.find(n=>n.parentId===null);
  if(paths && root)for(const node of result){
    node.path=[root.name,paths.get(node.id)].filter(Boolean).join(' / ');
    node.depth=paths.get(node.id) ? paths.get(node.id)!.split(' / ').length : 0;
  }
  return result;
}

/** Compact compiled evidence restores a navigable tree when the original Athena source was not exported. */
function structureFromVariantEvidence(evidence: ImportedWorkspace['variantEvidence'], componentKey: string, rootName: string): AnatomyNode[] {
  const matches = evidence?.variants.filter(v => v.componentKey === componentKey || v.componentSetKey === componentKey) || [];
  if (matches.length !== 1) return [];
  const variant = matches[0];
  const shape = evidence?.structures[variant.structureId];
  if (!shape?.length || stableHash(shape) !== variant.structureId
    || shape.filter(node => node.path === '').length !== 1
    || new Set(shape.map(node => node.path)).size !== shape.length) return [];
  const byPath = new Map<string, AnatomyNode>();
  for (const [index, node] of shape.entries()) {
    const parentPath = node.path.includes(' / ') ? node.path.slice(0, node.path.lastIndexOf(' / ')) : '';
    if (node.path && !shape.some(part => part.path === parentPath)) return [];
    const names=evidence?.occurrences?.find(o=>o.componentKey===variant.componentKey && o.componentSetKey===variant.componentSetKey)?.namesByPath;
    const name = node.path ? names?.[node.path] || node.path.split(' / ').pop() || node.path : rootName;
    const entry: AnatomyNode = {
      id: `compiled:${variant.structureId}:${index}`, parentId: null, name,
      type: node.type, path: evidence?.occurrenceAddressVersion===1 ? [rootName,node.path].filter(Boolean).join(' / ') : node.path || rootName, semanticRole: slug(name),
      visible: true, order: index, depth: node.path ? node.path.split(' / ').length : 0,
      childIds: [], properties: { name, type: node.type }, unknownFacts: ['compact-structure-only'],
    };
    byPath.set(node.path, entry);
  }
  for (const [path, node] of byPath) {
    if (!path) continue;
    const parentPath = path.includes(' / ') ? path.slice(0, path.lastIndexOf(' / ')) : '';
    const parent = byPath.get(parentPath);
    if (!parent) return [];
    node.parentId = parent.id;
    parent.childIds.push(node.id);
  }
  return [...byPath.values()];
}

function targetsFromAnatomy(anatomy: AnatomyNode[], family: string): SemanticTarget[] {
  const used = new Map<string, number>();
  return anatomy.map((node) => {
    const base = node.semanticRole || slug(node.name);
    const count = (used.get(base) || 0) + 1;
    used.set(base, count);
    const semanticRole = count === 1 ? base : `${base}-${count}`;
    return {
      id: `target.${semanticRole}`,
      semanticRole,
      label: node.name,
      componentFamily: node.type === 'INSTANCE' ? node.name : family,
      lineage: node.path.split('/').slice(0, -1).map((part) => slug(part.trim())),
      structuralFingerprint: stableHash({ type: node.type, path: node.path, order: node.order }).slice(0, 16),
      nameHint: node.name,
      pathHint: node.path,
      nodeIdHint: node.id,
      resolution: node.path.split(' / ').some(p=>p.startsWith('@catalog:')) ? 'unknown' : 'resolved',
    };
  });
}

function tokensFromCandidate(candidate: Record<string, unknown> | undefined): string[] {
  const tokens = record(record(candidate?.figma).tokens);
  return uniqueSorted(Object.values(tokens).flatMap((value) => arrayValue(value).map((entry) => stringValue(entry))));
}

function newManual(
  identity: ComponentIdentity,
  files: TextFile[],
  targets: SemanticTarget[],
  sourceKind: ManualSource['source']['kind'],
): ManualSource {
  return {
    schemaVersion: MANUAL_SCHEMA_VERSION,
    documentType: 'component-contract-manual',
    component: identity,
    semantics: {
      purpose: '',
      useWhen: [],
      doNotUseWhen: [],
      relatedComponentIds: [],
      keywords: [],
    },
    representations: identity.componentKey ? [{
      id: `${identity.componentId}.figma.${identity.platform}`,
      kind: 'figma',
      platform: identity.platform,
      status: 'draft',
      locator: { componentKey: identity.componentKey },
    }] : [],
    semanticApi: [],
    documentation: [],
    examples: [],
    decisions: [],
    generation: { profiles: [], instructions: [] },
    source: {
      kind: sourceKind,
      importedFiles: files.map((file) => file.name).sort((left, right) => left.localeCompare(right)),
      sourceHash: stableHash(files.map((file) => ({ name: file.name, text: file.text }))),
      importedAt: new Date().toISOString(),
    },
    targets,
    controlPorts: [],
    rules: [],
    metadata: {
      ruleOwnershipVersion: 1,
      owners: {
        generated: 'athena-cli',
        manual: 'design-system-authors',
        runtime: 'apollo-runtime',
      },
      revision: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

export function importWorkspace(files: TextFile[], preferredContractId?: string): ImportedWorkspace {
  if (!files.length) throw new Error('Choose at least one JSON file or ZIP package.');
  const allParsed = parseFiles(files);
  const dependencyEntries=allParsed.filter(p=>/(^|\/)dependencies\//.test(p.name));
  const parsed = allParsed.filter(p=>!dependencyEntries.includes(p));
  for (const entry of parsed) if (entry.data.documentType === 'component-contract-manual'
    && entry.data.schemaVersion !== MANUAL_SCHEMA_VERSION && entry.data.schemaVersion !== LEGACY_MANUAL_SCHEMA_VERSION) {
    throw new Error(`Unsupported manual source schema: ${stringValue(entry.data.schemaVersion, 'unknown')}.`);
  }
  const folder = packageFolder(files);
  const candidates = contractCandidates(parsed);
  const boundaryEntries = parsed.filter(entry =>
    (entry.data.schemaVersion === MANUAL_SCHEMA_VERSION || entry.data.schemaVersion === LEGACY_MANUAL_SCHEMA_VERSION)
    && record(entry.data.metadata).publicRepresentationBoundaryVersion === 1);
  const representedComponentKeys = new Set(parsed.flatMap((entry) => (
    arrayValue(entry.data.representations)
      .filter((value) => record(value).kind === 'figma')
      .flatMap((value) => {
        const locator = record(record(value).locator);
        return [stringValue(locator.componentKey), stringValue(locator.componentSetKey)].filter(Boolean);
      })
  )));
  // Explicit authored boundaries are authoritative. Legacy partial authoring
  // packages may still expose sibling roots that do not have a manual yet.
  const boundaryKeys = new Set(boundaryEntries.flatMap(entry => arrayValue(entry.data.representations)
    .filter(value => record(value).kind === 'figma' && record(value).status !== 'deprecated')
    .flatMap(value => {
      const locator = record(record(value).locator);
      return [stringValue(locator.componentKey), stringValue(locator.componentSetKey)].filter(Boolean);
    })));
  if (boundaryEntries.length && !boundaryKeys.size) {
    throw new Error('The explicit public Figma representation boundary is empty.');
  }
  const publicCandidates = boundaryEntries.length
    ? candidates.filter(c => boundaryKeys.has(stringValue(c.componentKey))) : candidates;
  if (boundaryEntries.length && candidates.length && !publicCandidates.length) {
    throw new Error('No generated component matches the explicit public Figma representation boundary.');
  }
  if (preferredContractId && candidates.some(c => stringValue(c.id) === preferredContractId)
    && !publicCandidates.some(c => stringValue(c.id) === preferredContractId)) {
    throw new Error('This component is internal to the loaded contract, not a public Figma representation.');
  }
  const manualEntries = parsed.filter((entry) => (
    entry.data.schemaVersion === MANUAL_SCHEMA_VERSION
    || entry.data.schemaVersion === LEGACY_MANUAL_SCHEMA_VERSION
  ));
  const authoredCandidate = manualEntries.length === 1 ? publicCandidates.find((candidate) => {
    const manualComponent = record(manualEntries[0].data.component);
    const key = stringValue(manualComponent.componentKey);
    return stringValue(candidate.id) === stringValue(manualComponent.contractId)
      || Boolean(key && stringValue(candidate.componentKey) === key);
  }) : undefined;
  const defaultCandidate = authoredCandidate || chooseContract(publicCandidates, folder);
  const componentChoices = choicesForContract(publicCandidates, defaultCandidate, representedComponentKeys);
  const candidate = chooseContract(publicCandidates, folder, preferredContractId || stringValue(authoredCandidate?.id));
  const identity = componentIdentity(parsed, candidate, folder);
  const manualEntry = candidate
    ? manualEntries.find((entry) => {
        const component = record(entry.data.component);
        return stringValue(component.contractId) === identity.contractId
          || Boolean(identity.componentKey && stringValue(component.componentKey) === identity.componentKey);
      }) || (manualEntries.length === 1 && arrayValue(manualEntries[0].data.representations).some((entry) => {
        const representation = record(entry);
        const locator = record(representation.locator);
        return representation.kind === 'figma'
          && Boolean(identity.componentKey && stringValue(locator.componentKey) === identity.componentKey);
      }) ? manualEntries[0] : undefined)
    : manualEntries[0];
  const athenaAnatomy = structureFromContract(candidate);
  const generatedTargets = targetsFromAnatomy(athenaAnatomy, identity.family);
  const compiledEntries = parsed.filter((entry) => entry.data.documentType === 'component-contract');
  const compiledEntry = compiledEntries.find((entry) =>
    (manualEntry && record(entry.data.package).componentId === record(manualEntry.data.component).componentId)
    || compiledContainsCandidate(entry.data, candidate));
  const warnings: string[] = [];

  let manual: ManualSource;
  if (manualEntry) {
    manual = normalizeManualSource(manualEntry.data);
    if (manualEntry.data.schemaVersion === LEGACY_MANUAL_SCHEMA_VERSION) {
      warnings.push('Manual source v1 migrated in memory to v2; export the package to persist the new schema.');
    }
  } else {
    const sourceKind = compiledEntry ? 'component-contract-v2' : 'athena-package';
    manual = newManual(identity, files, [], sourceKind);
    if (compiledEntry) {
      warnings.push('Compiled v2 imported as read-only evidence; compact manual rules cannot be reconstructed losslessly.');
    }
  }

  if (!identity.componentKey && !manual.component.componentKey) {
    warnings.push('No Figma componentKey found. Anatomy remains available, but live preview cannot be rendered.');
  }
  if (componentChoices.length > 1) {
    warnings.push(`Package contains ${componentChoices.length} Figma representations; selected ${candidate?.name || identity.family}.`);
  }

  const variantEvidence: ImportedWorkspace['variantEvidence'] = (candidates.some(c=>c.packageAthena) ? extractVariantEvidence(candidates, manual.rules.some(r => r.constraints.some(c => c.type === 'bindingConsistency'))) : undefined)
    || ((compiledEntry?.data.facts as any)?.variantEvidence as ImportedWorkspace['variantEvidence'])
    || extractVariantEvidence(candidates, manual.rules.some(r => r.constraints.some(c => c.type === 'bindingConsistency')));
  const assetCatalogs = extractAssetCatalogs(parsed.map(p=>p.data));
  const compactAssets = parsed.filter(p=>p.data.schemaVersion === 'apollo.asset-catalogs.v1').flatMap(p=>arrayValue(p.data.catalogs));
  if (variantEvidence) {
    const textStyles = extractTextStyleCatalogs(parsed);
    const savedStyles = (compiledEntry?.data.facts as any)?.variantEvidence?.textStyleCatalogs;
    if (textStyles.length || savedStyles?.length) variantEvidence.textStyleCatalogs = textStyles.length ? textStyles : savedStyles;
    const assets = assetCatalogs.length ? assetCatalogs : compactAssets.length ? compactAssets : (compiledEntry?.data.facts as any)?.variantEvidence?.assetCatalogs;
    if (assets?.length) variantEvidence.assetCatalogs = parseAssetCatalogs(assets);
  }
  const selectedKey = manual.component.componentKey || identity.componentKey;
  const compiledVariants = variantEvidence?.variants.filter(v => v.componentKey === selectedKey || v.componentSetKey === selectedKey) || [];
  // The UI initially selects the first declared variant. Restore that same
  // variant's diagnostic tree; this never creates runtime target identity.
  const initialVariantKey = compiledVariants[0]?.componentKey || selectedKey;
  const compactAnatomy = athenaAnatomy.length ? [] : structureFromVariantEvidence(variantEvidence, initialVariantKey, manual.component.family);
  const anatomy = athenaAnatomy.length ? athenaAnatomy : compactAnatomy;
  if (!anatomy.length) warnings.push('No structure signature found. Live Figma preview can repopulate the anatomy tree.');
  else if (compactAnatomy.length) warnings.push('Anatomy restored from compact compiled facts. Import Athena JSONs with this ZIP to recover full layer properties.');
  const hasAthenaVariants = arrayValue(record(record(candidate?.figma).variants).variantKeys).length > 0;
  return {
    manual,
    variantEvidence,
    dependencyContracts: dependencyEntries.filter(p=>p.data.documentType==='component-contract').map(p=>p.data as unknown as CompiledContract)
      .concat(dependencyEntries.length ? [] : ((compiledEntry?.data.componentDependencies || []) as Array<{contract?:CompiledContract}>).flatMap(d=>d.contract?[d.contract]:[])),
    activeContractId: candidate ? identity.contractId : manual.component.contractId,
    componentChoices,
    variants: hasAthenaVariants ? variantsFromContract(candidate, manual.component)
      : compiledVariants.length ? compiledVariants.map(v => ({ id: v.componentKey, label: Object.entries(v.properties).map(([key,value])=>`${key}=${value}`).join(', ') || 'Default', componentKey:v.componentKey, properties:v.properties }))
        : variantsFromContract(candidate, manual.component),
    hasVariantEvidence: hasAthenaVariants || compiledVariants.length > 0,
    anatomy,
    tokens: tokensFromCandidate(candidate),
    warnings,
    compiledInput: compiledEntry?.data,
    sourceFiles: files.map(file=>({name:file.name,text:file.text})),
  };
}

export function createWorkspaceFromPreview(
  identity: ComponentIdentity,
  anatomy: AnatomyNode[],
): ImportedWorkspace {
  const placeholder = [{ name: 'figma-selection.json', text: JSON.stringify({ identity }) }];
  return {
    manual: newManual(identity, placeholder, [], 'figma-selection'),
    activeContractId: identity.contractId,
    variants: [{ id: identity.componentKey || 'selection', label: 'Current', componentKey: identity.componentKey, properties: {} }],
    hasVariantEvidence: true,
    anatomy,
    tokens: [],
    warnings: [],
  };
}
