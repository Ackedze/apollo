import {
  apolloReferenceCatalogListUrl,
  buildReferenceCatalogSources,
  getReferenceCatalogBaseUrl,
  normalizePath,
  resolveAuditPolicyConfigUrl,
  resolveComponentContractIndexUrl,
  resolveCompositionContractsUrl,
  resolvePatternRulesUrl,
  resolveRemediationConfigUrl,
  type ReferenceCatalogSource,
} from './referenceList';
import { configureRemoteContractIndexSource } from '../contracts/runtimeContractRegistry';
import { loadPatternRulesConfig } from '../assessment/patternRuleLoader';
import { loadCompositionContractsConfig } from '../contracts/compositionContractLoader';
import { setCompositionContractsConfig } from '../contracts/compositionContracts';
import {
  configureRemoteRemediationConfigSource,
  ensureRemediationConfigLoaded,
} from '../remediation/remediationConfig';
import {
  configureRemoteAuditPolicySource,
  ensureAuditPolicyConfigLoaded,
} from '../policies/auditPolicyConfig';
import {
  appendCacheBustingQuery,
  fetchDirect,
} from '../utils/networkFetch';
import type {
  AthenaCatalog,
  AthenaComponent,
  ComponentPlatform,
  ComponentRole,
  LibraryComponent,
  LibraryStatus,
  NormalizedElement,
  NormalizedJsonCatalog,
  NormalizedJsonComponent,
  StyleCatalog,
  TokenCatalog,
} from './libraryTypes';
import type { ComponentChannelCounterpart } from '../remediation/types';
import type {
  DSPadding,
  DSStructureNode,
  DSInstanceInfo,
  DSVariantStructurePatch,
} from '../types/structures';
import {
  countVariantPropertyMatches,
  parseVariantName,
  variantMatchesSourceWithDefaultExtras,
  variantPropertiesEqual,
} from '../utils/variantProperties';
import { getTimestamp, logAuditMetric } from '../utils/auditInstrumentation';
import { forEachWithConcurrency } from '../utils/promisePool';
import { AsyncResourceLifecycle } from '../services/asyncResourceLifecycle';

const COMPONENT_INDEX_PRELOAD_CONCURRENCY = 8;

let catalogs: AthenaCatalog[] = [];
const tokenCatalogs: TokenCatalog[] = [];
const styleCatalogs: StyleCatalog[] = [];
const componentIndexByKey = new Map<string, LibraryComponent>();
const hostControlledPaintPaths = new Map<string, Set<string>>();
const hostControlledTextPaths = new Map<string, Set<string>>();
const hostControlledLayoutPaths = new Map<string, Set<string>>();
const inferredNestedComponentKeyNodes = new Set<Partial<DSStructureNode>>();
const corporateNameIndex = new Map<string, LibraryComponent>();
let catalogSources: ReferenceCatalogSource[] | null = null;
const componentCatalogSourcesByPath = new Map<string, ReferenceCatalogSource>();
const componentCatalogPathByKey = new Map<string, string>();
const componentChannelCounterpartByKey = new Map<
  string,
  ComponentChannelCounterpart
>();
const loadedComponentCatalogPaths = new Set<string>();
const componentCatalogLoadPromises = new Map<string, Promise<void>>();
const failedComponentIndexSources = new Map<string, ReferenceCatalogSource>();
const catalogCacheBust = Date.now();
const referenceCatalogLifecycle = new AsyncResourceLifecycle({
  retryFailed: true,
});
const componentIndexLifecycle = new AsyncResourceLifecycle({
  retryFailed: true,
});
const componentIndexRetryLifecycle = new AsyncResourceLifecycle({
  retryFailed: true,
});

const missingReferenceLog = new Set<string>();
const missingIndexLog = new Set<string>();

export function areReferenceCatalogsReady(): boolean {
  return referenceCatalogLifecycle.isReady();
}

export async function ensureReferenceCatalogsLoaded(): Promise<void> {
  return referenceCatalogLifecycle.ensure(loadAllCatalogs);
}

async function loadAllCatalogs(): Promise<void> {
  const loadStartedAt = getTimestamp();
  const sources = await ensureCatalogSourceList();

  const componentSources = sources.filter(
    isComponentCatalogSource,
  );
  componentCatalogSourcesByPath.clear();
  for (const source of componentSources) {
    registerComponentCatalogSource(source);
  }

  const hydrateStartedAt = getTimestamp();
  hydrateCatalogs([]);
  const hydrateDurationMs = getTimestamp() - hydrateStartedAt;

  const tokenLoadStartedAt = getTimestamp();
  const tokenSources = sources.filter(isTokenCatalogSource);
  if (!tokenSources.length) {
    throw new Error('Reference manifest does not contain token catalogs');
  }
  await loadTokenCatalogs(tokenSources);
  const tokenLoadDurationMs = getTimestamp() - tokenLoadStartedAt;
  const styleLoadStartedAt = getTimestamp();
  const styleSources = sources.filter(isStyleCatalogSource);
  if (!styleSources.length) {
    throw new Error('Reference manifest does not contain style catalogs');
  }
  await loadStyleCatalogs(styleSources);
  const styleLoadDurationMs = getTimestamp() - styleLoadStartedAt;

  void componentIndexLifecycle
    .ensure(() => loadComponentIndexes(componentSources))
    .catch((error) => {
      console.warn('[Apollo] component index preload failed', error);
    });
  logAuditMetric('reference-preload', {
    totalMs: Number((getTimestamp() - loadStartedAt).toFixed(1)),
    componentFetchMs: 0,
    hydrateMs: Number(hydrateDurationMs.toFixed(1)),
    tokenLoadMs: Number(tokenLoadDurationMs.toFixed(1)),
    styleLoadMs: Number(styleLoadDurationMs.toFixed(1)),
    catalogCount: 0,
    indexPreload: 'background',
  });
}

export async function ensureReferenceCatalogsForKeys(
  keys: Iterable<string | null | undefined>,
): Promise<void> {
  await ensureReferenceCatalogsLoaded();
  await ensureComponentIndexesLoaded();

  const requestedKeys = Array.from(
    new Set(
      Array.from(keys).filter(
        (key): key is string => typeof key === 'string' && key.length > 0,
      ),
    ),
  );
  let { catalogPaths, unresolvedKeys } = resolveCatalogPathsForKeys(requestedKeys);

  if (unresolvedKeys.length && failedComponentIndexSources.size) {
    await retryFailedComponentIndexes();
    ({ catalogPaths, unresolvedKeys } = resolveCatalogPathsForKeys(requestedKeys));
  }

  if (unresolvedKeys.length) {
    reportMissingIndexKeys(unresolvedKeys);
  }

  if (!catalogPaths.size) {
    logAuditMetric('reference-lazy-load', {
      totalMs: 0,
      requestedKeys: requestedKeys.length,
      catalogCount: 0,
      unresolvedKeys: unresolvedKeys.length,
      mode: 'index-only',
    });
    return;
  }

  const loadStartedAt = getTimestamp();
  await Promise.all(Array.from(catalogPaths).map(loadComponentCatalogByPath));
  refreshDerivedComponentCatalogState();
  logAuditMetric('reference-lazy-load', {
    totalMs: Number((getTimestamp() - loadStartedAt).toFixed(1)),
    requestedKeys: requestedKeys.length,
    catalogCount: catalogPaths.size,
    unresolvedKeys: unresolvedKeys.length,
    mode: 'index-only',
  });
}

function reportMissingIndexKeys(keys: string[]): void {
  for (const key of keys.slice(0, 20)) {
    if (missingIndexLog.has(key)) {
      continue;
    }
    missingIndexLog.add(key);
    console.warn('[Apollo::catalog] Component key is missing from index', { key });
  }
}

function registerComponentCatalogSource(source: ReferenceCatalogSource): void {
  const aliases = [
    source.path,
    source.fileName,
    source.url,
    extractJsonsRelativePath(source.path),
    extractJsonsRelativePath(source.url),
  ];

  for (const alias of aliases) {
    const normalizedAlias = normalizePath(alias ?? '');
    if (normalizedAlias) {
      componentCatalogSourcesByPath.set(normalizedAlias, source);
    }
  }
}

function extractJsonsRelativePath(value: string | null | undefined): string {
  const raw = String(value ?? '');
  const marker = '/JSONS/';
  const markerIndex = raw.indexOf(marker);
  if (markerIndex >= 0) {
    return raw.slice(markerIndex + marker.length);
  }
  return raw;
}

function resolveCatalogPathsForKeys(
  requestedKeys: string[],
): {
  catalogPaths: Set<string>;
  unresolvedKeys: string[];
} {
  const catalogPaths = new Set<string>();
  const unresolvedKeys: string[] = [];

  for (const key of requestedKeys) {
    if (findCatalogComponentByKey(key)) {
      continue;
    }

    const catalogPath = componentCatalogPathByKey.get(key);
    if (catalogPath) {
      catalogPaths.add(catalogPath);
    } else {
      unresolvedKeys.push(key);
    }
  }

  return { catalogPaths, unresolvedKeys };
}

async function ensureComponentIndexesLoaded(): Promise<void> {
  await componentIndexLifecycle.ensure(async () => {
    const sources = await ensureCatalogSourceList();
    await loadComponentIndexes(sources.filter(isComponentCatalogSource));
  });

  if (failedComponentIndexSources.size) {
    await retryFailedComponentIndexes();
  }
  if (failedComponentIndexSources.size) {
    const failedPaths = Array.from(failedComponentIndexSources.keys()).slice(0, 10);
    throw new Error(
      `Reference component indexes are incomplete (${failedComponentIndexSources.size} failed): ${failedPaths.join(', ')}`,
    );
  }
}

async function retryFailedComponentIndexes(): Promise<void> {
  const failedSources = Array.from(failedComponentIndexSources.values());
  if (!failedSources.length) {
    return;
  }

  if (!componentIndexRetryLifecycle.isLoading()) {
    componentIndexRetryLifecycle.reset();
  }
  return componentIndexRetryLifecycle.ensure(() =>
    loadComponentIndexes(failedSources, {
      preserveExistingKeys: true,
      resetFailureState: false,
    }),
  );
}

async function ensureCatalogSourceList(): Promise<ReferenceCatalogSource[]> {
  if (catalogSources) {
    return catalogSources;
  }

  try {
    const referenceListRequestUrl = appendCacheBustingQuery(
      apolloReferenceCatalogListUrl,
      'apolloReferenceSources',
    );
    const response = await requestCatalogSource(referenceListRequestUrl);
    const payload = JSON.parse(response);
    const patternRulesUrl = resolvePatternRulesUrl(payload);
    const compositionContractsUrl = resolveCompositionContractsUrl(payload);
    configureRemoteContractIndexSource(
      resolveComponentContractIndexUrl(payload),
      getReferenceCatalogBaseUrl(payload),
    );
    const remediationConfigUrl = resolveRemediationConfigUrl(payload);
    configureRemoteRemediationConfigSource(remediationConfigUrl ?? '');
    const auditPolicyConfigUrl = resolveAuditPolicyConfigUrl(payload);
    configureRemoteAuditPolicySource(auditPolicyConfigUrl ?? '');
    await loadPatternRulesConfig(patternRulesUrl);
    if (compositionContractsUrl) {
      await loadCompositionContractsConfig(compositionContractsUrl);
    } else {
      setCompositionContractsConfig({ schemaVersion: 1, contracts: [] });
    }
    if (remediationConfigUrl) {
      await ensureRemediationConfigLoaded();
    }
    if (auditPolicyConfigUrl) {
      await ensureAuditPolicyConfigLoaded();
    }
    const sources = buildReferenceCatalogSources(payload);

    console.log('[Apollo] reference sources list loaded', {
      url: apolloReferenceCatalogListUrl,
      baseUrl: payload?.baseUrl ?? '',
      patternRulesUrl,
      compositionContractsUrl,
      auditPolicyConfigUrl,
      count: sources.length,
    });

    catalogSources = sources;
    return catalogSources;
  } catch (error) {
    console.warn('[Apollo] failed to load reference sources list', {
      url: apolloReferenceCatalogListUrl,
      error:
        error && typeof error === 'object' && 'message' in error
          ? String((error as {message?: string}).message)
          : String(error ?? 'Unknown error'),
    });
  }

  throw new Error('Failed to load reference catalog list from GitHub Pages');
}

async function fetchCatalogModule(
  source: ReferenceCatalogSource,
): Promise<AthenaCatalog> {
  try {
    const response = await requestCatalogSource(source.url);

    console.log('[Apollo] catalog fetched', {
      fileName: source.fileName,
      url: source.url,
      bytes: response.length,
    });

    reportCatalogLoaded(source.fileName, response.length);

    return parseCatalogPayload(response, source.fileName);

  } catch (error) {
    console.error(`Failed to load catalog ${source.fileName}`, error);

    const message =
      error && typeof error === 'object' && 'message' in error
        ? String((error as any).message)
        : String(error ?? 'Unknown error');

    logCatalogEvent(source, `failed: ${message}`);

    throw error;
  }
}

async function fetchCatalogModuleOptional(
  source: ReferenceCatalogSource,
): Promise<AthenaCatalog | null> {
  try {
    return await fetchCatalogModule(source);
  } catch (error) {
    return null;
  }
}

function isTokenCatalogSource(source: ReferenceCatalogSource): boolean {
  return source.kind === 'tokens' || /\/tokens\//i.test(source.url);
}

function isStyleCatalogSource(source: ReferenceCatalogSource): boolean {
  return source.kind === 'styles' || /\/styles\//i.test(source.url);
}

function isComponentCatalogSource(source: ReferenceCatalogSource): boolean {
  return !isTokenCatalogSource(source) && !isStyleCatalogSource(source);
}

function parseCatalogPayload(raw: string, fileName: string): AthenaCatalog {
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new Error('Empty catalog payload');
  }

  try {
    const parsed = JSON.parse(trimmed);
    
    if (isNormalizedJsonCatalog(parsed)) {
      return parseNormalizedJsonCatalog(parsed, fileName);
    }

    if (isAthenaCatalog(parsed)) {
      return parsed as AthenaCatalog;
    }

  } catch (error) {
    throw error;
  }

  throw new Error('Unsupported catalog JSON format');
}

async function loadTokenCatalogs(
  sources: ReferenceCatalogSource[],
): Promise<void> {
  tokenCatalogs.length = 0;
  const failures: string[] = [];

  for (const source of sources) {
    try {
      const raw = await requestCatalogSource(source.url);

      console.log('[Apollo] token catalog fetched', {
        fileName: source.fileName,
        url: source.url,
        bytes: raw.length,
      });

      reportCatalogLoaded(source.fileName, raw.length);

      const data = JSON.parse(raw);

      tokenCatalogs.push({
        meta: data.meta,
        collections: Array.isArray(data.collections) ? data.collections : [],
      });
    } catch (error) {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? String((error as any).message)
          : String(error ?? 'Unknown error');

      logCatalogEvent(source, `failed: ${message}`);
      failures.push(`${source.fileName}: ${message}`);
    }
  }
  if (failures.length) {
    throw new Error(`Failed to load token catalogs: ${failures.join('; ')}`);
  }
}

async function loadStyleCatalogs(
  sources: ReferenceCatalogSource[],
): Promise<void> {
  styleCatalogs.length = 0;
  const failures: string[] = [];

  for (const source of sources) {
    try {
      const raw = await requestCatalogSource(source.url);

      console.log('[Apollo] style catalog fetched', {
        fileName: source.fileName,
        url: source.url,
        bytes: raw.length,
      });

      reportCatalogLoaded(source.fileName, raw.length);

      const data = JSON.parse(raw);

      styleCatalogs.push({
        meta: {
          fileName: source.fileName,
          library:
            data?.meta?.library ??
            data?.meta?.fileName ??
            source.fileName,
        },
        styles: Array.isArray(data.styles) ? data.styles : [],
      });

    } catch (error) {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? String((error as any).message)
          : String(error ?? 'Unknown error');

      logCatalogEvent(source, `failed: ${message}`);
      failures.push(`${source.fileName}: ${message}`);
    }
  }
  if (failures.length) {
    throw new Error(`Failed to load style catalogs: ${failures.join('; ')}`);
  }
}

type ComponentIndexPayload = {
  catalogPath?: string;
  library?: string;
  components?: Array<{
    key?: string;
    name?: string;
    variants?: Array<{
      key?: string | null;
      channelCounterparts?: {
        desktop?: {
          componentKey?: string;
          componentName?: string;
        };
        mobileWeb?: {
          componentKey?: string;
          componentName?: string;
        };
      };
    } | null>;
    catalogPath?: string;
    channelCounterparts?: {
      desktop?: {
        componentKey?: string;
        componentName?: string;
      };
      mobileWeb?: {
        componentKey?: string;
        componentName?: string;
      };
    };
  } | null>;
  entries?: Array<{
    key?: string;
    catalogPath?: string;
  } | null>;
};

async function loadComponentIndexes(
  sources: ReferenceCatalogSource[],
  options?: {
    preserveExistingKeys?: boolean;
    resetFailureState?: boolean;
  },
): Promise<void> {
  const startedAt = getTimestamp();
  if (!options?.preserveExistingKeys) {
    componentCatalogPathByKey.clear();
    componentChannelCounterpartByKey.clear();
  }
  if (options?.resetFailureState !== false) {
    failedComponentIndexSources.clear();
  }
  let loadedIndexes = 0;
  let failedIndexes = 0;
  const indexSources = sources.filter(
    (source): source is ReferenceCatalogSource & { indexUrl: string } =>
      Boolean(source.indexUrl),
  );
  const indexSourceCount = indexSources.length;

  await forEachWithConcurrency(
    indexSources,
    COMPONENT_INDEX_PRELOAD_CONCURRENCY,
    async (source) => {

      try {
        const raw = await requestCatalogSource(source.indexUrl);
        const payload = JSON.parse(raw) as ComponentIndexPayload;
        const fallbackCatalogPath = normalizePath(payload.catalogPath || source.path);

        if (Array.isArray(payload.entries)) {
          for (const entry of payload.entries) {
            registerComponentIndexKey(entry?.key, entry?.catalogPath || fallbackCatalogPath);
          }
        }

        if (Array.isArray(payload.components)) {
          for (const component of payload.components) {
            const catalogPath = component?.catalogPath || fallbackCatalogPath;
            registerComponentIndexKey(component?.key, catalogPath);
            registerComponentChannelCounterparts(
              component,
              payload.library ?? null,
            );
            for (const variant of component?.variants ?? []) {
              registerComponentIndexKey(variant?.key, catalogPath);
              registerChannelCounterpartsForKey(
                variant?.key,
                variant?.channelCounterparts,
                payload.library ?? null,
              );
            }
          }
        }

        loadedIndexes += 1;
        failedComponentIndexSources.delete(source.path);
        reportCatalogLoaded(source.fileName.replace(/\.json$/i, '.index.json'), raw.length);
      } catch (error) {
        failedIndexes += 1;
        failedComponentIndexSources.set(source.path, source);
        const message =
          error && typeof error === 'object' && 'message' in error
            ? String((error as any).message)
            : String(error ?? 'Unknown error');

        if (!/^HTTP 404\b/.test(message)) {
          logCatalogEvent(source, `index failed: ${message}`);
        }
      }
    },
  );

  logAuditMetric('reference-index-load', {
    totalMs: Number((getTimestamp() - startedAt).toFixed(1)),
    loadedIndexes,
    failedIndexes,
    indexedKeys: componentCatalogPathByKey.size,
    indexSources: indexSourceCount,
    concurrency: COMPONENT_INDEX_PRELOAD_CONCURRENCY,
  });
}

function registerComponentChannelCounterparts(
  component: NonNullable<ComponentIndexPayload['components']>[number],
  library: string | null,
): void {
  registerChannelCounterpartsForKey(
    component?.key,
    component?.channelCounterparts,
    library,
  );
}

function registerChannelCounterpartsForKey(
  sourceKey: string | null | undefined,
  counterparts:
    | {
        desktop?: { componentKey?: string; componentName?: string };
        mobileWeb?: { componentKey?: string; componentName?: string };
      }
    | null
    | undefined,
  library: string | null,
): void {
  if (!sourceKey || !counterparts) return;
  registerComponentChannelCounterpart(
    sourceKey,
    'Desktop',
    counterparts.desktop,
    library,
  );
  registerComponentChannelCounterpart(
    sourceKey,
    'Mobile Web',
    counterparts.mobileWeb,
    library,
  );
}

function registerComponentChannelCounterpart(
  sourceKey: string,
  platform: 'Desktop' | 'Mobile Web',
  target:
    | { componentKey?: string; componentName?: string }
    | null
    | undefined,
  library: string | null,
): void {
  const targetKey = String(target?.componentKey ?? '').trim();
  if (!targetKey || targetKey === sourceKey) {
    return;
  }

  const lookupKey = buildChannelCounterpartLookupKey(sourceKey, platform);
  componentChannelCounterpartByKey.set(lookupKey, {
    componentKey: targetKey,
    componentName:
      String(target?.componentName ?? '').trim() || targetKey,
    platform,
    library,
  });
}

function buildChannelCounterpartLookupKey(
  componentKey: string,
  platform: 'Desktop' | 'Mobile Web',
): string {
  return `${componentKey}:${platform}`;
}

export function getChannelCounterpart(
  componentKey: string | null | undefined,
  targetPlatform: 'Desktop' | 'Mobile Web',
): ComponentChannelCounterpart | null {
  if (!componentKey) {
    return null;
  }
  return (
    componentChannelCounterpartByKey.get(
      buildChannelCounterpartLookupKey(componentKey, targetPlatform),
    ) ?? null
  );
}

export function __test_resetChannelCounterparts(): void {
  componentChannelCounterpartByKey.clear();
}

export function __test_registerChannelCounterparts(
  component: NonNullable<ComponentIndexPayload['components']>[number],
  library: string | null,
): void {
  registerComponentChannelCounterparts(component, library);
  for (const variant of component?.variants ?? []) {
    registerChannelCounterpartsForKey(
      variant?.key,
      variant?.channelCounterparts,
      library,
    );
  }
}

function registerComponentIndexKey(
  key: string | null | undefined,
  catalogPath: string | null | undefined,
): void {
  if (!key || !catalogPath) {
    return;
  }

  const normalizedPath = normalizePath(catalogPath);
  if (!normalizedPath) {
    return;
  }

  componentCatalogPathByKey.set(key, normalizedPath);
}

async function loadComponentCatalogByPath(path: string): Promise<void> {
  const normalizedPath = normalizePath(path);
  if (!normalizedPath || loadedComponentCatalogPaths.has(normalizedPath)) {
    return;
  }

  const existingPromise = componentCatalogLoadPromises.get(normalizedPath);
  if (existingPromise) {
    return existingPromise;
  }

  const source = componentCatalogSourcesByPath.get(normalizedPath);
  if (!source) {
    return;
  }

  const promise = (async () => {
    const module = await fetchCatalogModuleOptional(source);
    if (!module) {
      return;
    }
    hydrateAdditionalCatalogs([module]);
    loadedComponentCatalogPaths.add(normalizedPath);
  })().finally(() => {
    componentCatalogLoadPromises.delete(normalizedPath);
  });

  componentCatalogLoadPromises.set(normalizedPath, promise);
  return promise;
}

export function getTokenCatalogs(): TokenCatalog[] {
  return tokenCatalogs.slice();
}

export function getStyleCatalogs(): StyleCatalog[] {
  return styleCatalogs.slice();
}

export function isNestedComponentPaintPathHostControlled(
  componentKey: string | null | undefined,
  relativePath: string | null | undefined,
): boolean {
  if (!componentKey || relativePath == null) {
    return false;
  }

  return hostControlledPaintPaths.get(componentKey)?.has(relativePath) === true;
}

export function isNestedComponentTextPathHostControlled(
  componentKey: string | null | undefined,
  relativePath: string | null | undefined,
): boolean {
  if (!componentKey || relativePath == null) {
    return false;
  }

  return hostControlledTextPaths.get(componentKey)?.has(relativePath) === true;
}

export function isNestedComponentLayoutPathHostControlled(
  componentKey: string | null | undefined,
  relativePath: string | null | undefined,
): boolean {
  if (!componentKey || relativePath == null) {
    return false;
  }

  return hostControlledLayoutPaths.get(componentKey)?.has(relativePath) === true;
}

// Test helper for verifying host-controlled path aliasing without loading remote catalogs.
export function __test_resetHostControlledNestedPathPolicies(): void {
  hostControlledPaintPaths.clear();
  hostControlledTextPaths.clear();
  hostControlledLayoutPaths.clear();
}

// Test helper for registering path ownership under variant/family aliases.
export function __test_registerHostControlledNestedPath(
  kind: 'paint' | 'text' | 'layout',
  componentKeys: Array<string | null | undefined>,
  relativePath: string,
): void {
  if (kind === 'paint') {
    addHostControlledPath(hostControlledPaintPaths, componentKeys, relativePath);
    return;
  }

  if (kind === 'text') {
    addHostControlledPath(hostControlledTextPaths, componentKeys, relativePath);
    return;
  }

  addHostControlledPath(hostControlledLayoutPaths, componentKeys, relativePath);
}

export function __test_hydrateNestedInstanceComponentKeys(
  component: AthenaComponent,
  components: AthenaComponent[],
): AthenaComponent {
  hydrateNestedInstanceComponentKeys(
    component,
    buildComponentKeyByUniqueName([{ meta: { fileName: 'test' }, components }]),
  );
  return component;
}

export function __test_rehydrateNestedInstanceComponentKeys(
  components: AthenaComponent[],
): AthenaComponent[] {
  rehydrateNestedInstanceComponentKeys([
    { meta: { fileName: 'test' }, components },
  ]);
  return components;
}

function isAthenaCatalog(payload: unknown): payload is AthenaCatalog {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      Array.isArray((payload as AthenaCatalog).components),
  );
}

function isNormalizedJsonCatalog(
  payload: unknown,
): payload is NormalizedJsonCatalog {
  if (!payload || typeof payload !== 'object') return false;

  const catalog = payload as NormalizedJsonCatalog;

  return catalog.kind === 'catalog' && Array.isArray(catalog.elements);
}

function parseNormalizedJsonCatalog(
  payload: NormalizedJsonCatalog,
  fileName: string,
): AthenaCatalog {
  const elements = Array.isArray(payload.elements) ? payload.elements : [];

  const catalog = parseNormalizedCatalogFromElements(elements, fileName);

  if (payload.source?.library) {
    catalog.meta.library = payload.source.library;
  }

  if (Array.isArray(payload.components) && payload.components.length) {
    mergeNormalizedComponents(catalog, payload.components);
  }

  return catalog;
}

function parseNormalizedCatalogFromElements(
  elements: NormalizedElement[],
  fileName: string,
): AthenaCatalog {
  if (!elements.length) {
    return { meta: { fileName }, components: [] };
  }

  const rootComponents = elements.filter((el) => el.type === 'COMPONENT');

  const grouped: AthenaComponent[] = [];

  const fallbackKey = elements.find((el) => el.componentKey)?.componentKey ?? '';

  if (!rootComponents.length) {
    grouped.push(
      buildComponentFromElements(
        fileName,
        elements[0]?.path?.split(' / ')[0] ?? fileName,
        fallbackKey,
        elements,
      ),
    );
  } else {
    for (const root of rootComponents) {
      const rootPath = root.path;

      const group = elements.filter(
        (el) => el.path === rootPath || el.path.startsWith(`${rootPath} / `),
      );

      grouped.push(
        buildComponentFromElements(
          fileName,
          rootPath.split(' / ')[0] ?? rootPath,
          root.componentKey ?? fallbackKey,
          group,
        ),
      );
    }
  }

  return {
    meta: { fileName },
    components: grouped,
  };
}

function mergeNormalizedComponents(
  catalog: AthenaCatalog,
  components: NormalizedJsonComponent[],
) {
  const byKey = new Map<string, NormalizedJsonComponent>();
  const byName = new Map<string, NormalizedJsonComponent>();

  for (const component of components) {
    if (component.key) {
      byKey.set(component.key, component);
    }
    if (component.name) {
      byName.set(component.name, component);
    }
  }

  for (const component of catalog.components) {
    const match =
      (component.key && byKey.get(component.key)) ||
      (component.name && byName.get(component.name));
      
    if (!match) continue;
    if (!component.key && match.key) {
      component.key = match.key;
    }
    if (match.name && component.name !== match.name) {
      component.name = match.name;
    }

    if (
      Array.isArray((match as any).structure) &&
      (match as any).structure.length > 0
    ) {
      component.structure = (match as any).structure as DSStructureNode[];
    }

    if (match.variants && match.variants.length) {
      component.variants = match.variants
        .filter((variant) => variant && variant.key && variant.name)
        .map((variant) => ({
          id: variant.id ?? '',
          key: variant.key ?? '',
          name: variant.name ?? '',
          properties:
            variant.properties && typeof variant.properties === 'object'
              ? Object.assign({}, variant.properties)
              : undefined,
        }));
    }
    if (match.variantStructures && !component.variantStructures) {
      component.variantStructures = match.variantStructures;
    }
    if (match.status && !component.status) {
      component.status = match.status;
    }
    if (match.role && !component.role) {
      component.role = match.role;
    }
    if (match.platform && !component.platform) {
      component.platform = match.platform;
    }
    if (match.description && !component.description) {
      component.description = match.description;
    }
    component.meta = component.meta || { pageName: '', category: null };
    if (match.category && !component.meta.category) {
      component.meta.category = match.category;
    }
  }
}

function buildComponentFromElements(
  fileName: string,
  name: string,
  key: string,
  elements: NormalizedElement[],
): AthenaComponent {
  return {
    key,
    name,
    meta: {
      pageName: fileName,
      category: null,
    },
    structure: buildStructure(elements),
  };
}

function buildStructure(elements: NormalizedElement[]): DSStructureNode[] {
  const nodes: DSStructureNode[] = [];
  const idByPath = new Map<string, number>();
  let nextId = 1;

  for (const element of elements) {
    const id =
      typeof element.id === 'number' && Number.isFinite(element.id)
        ? element.id
        : nextId++;
    if (id >= nextId) {
      nextId = id + 1;
    }
    const path = element.path;
    const parentPath = getParentPath(path);
    const name = getLastSegment(path);
    const parentId = parentPath ? (idByPath.get(parentPath) ?? null) : null;

    const node: DSStructureNode = {
      id,
      parentId,
      path,
      type: element.type ?? 'FRAME',
      name,
      visible: element.visible !== false,
      radius: null
    };

    const layout = buildNodeLayout(element.layout);
    if (layout) {
      node.layout = layout;
    }

    if (typeof element.opacity === 'number') {
      node.opacity = element.opacity;
    }
    if (element.opacityToken) {
      node.opacityToken = element.opacityToken;
    }

    if (element.fill) {
      node.fill = {
        color: element.fill.color ?? null,
        token: element.fill.token ?? null,
      };
    }

    if (element.stroke) {
      node.stroke = {
        color: element.stroke.color ?? null,
        token: element.stroke.token ?? null,
        weight:
          typeof element.stroke.weight === 'number'
            ? element.stroke.weight
            : null,
        align: element.stroke.align ?? null,
      };
    }

    if (element.layout?.radius !== undefined) {
      node.radius = mapRadius(element.layout.radius);
    }
    if (element.radiusToken) {
      node.radiusToken = element.radiusToken;
    }

    if (element.type === 'TEXT' && element.text?.value) {
      node.text = { characters: element.text.value };
    }
    const textStyleKey =
      element.styles?.text?.styleKey ??
      element.typography?.styleKey ??
      null;
    if (textStyleKey) {
      node.styles = node.styles ?? {};
      node.styles.text = { styleKey: textStyleKey };
    }
    const typographyToken =
      element.typographyToken ??
      element.typography?.token ??
      null;
    if (typographyToken) {
      node.typographyToken = typographyToken;
    }

    nodes.push(node);
    idByPath.set(path, id);
  }

  return nodes;
}

function buildNodeLayout(
  layout?: NormalizedElement['layout'],
): DSStructureNode['layout'] | null {
  if (!layout) return null;

  const out: DSStructureNode['layout'] = {};

  if (Array.isArray(layout.padding) && layout.padding.length === 4) {

    out.padding = {
      top: layout.padding[0] ?? null,
      right: layout.padding[1] ?? null,
      bottom: layout.padding[2] ?? null,
      left: layout.padding[3] ?? null,
    };
  }

  if (typeof layout.gap === 'number') {
    out.itemSpacing = layout.gap;
  }

  if (layout.sizing) {
    out.sizing = {
      horizontal: layout.sizing.horizontal ?? null,
      vertical: layout.sizing.vertical ?? null,
    };
  }

  if (layout.paddingTokens) {
    
    out.paddingTokens = {
      top: layout.paddingTokens.top ?? null,
      right: layout.paddingTokens.right ?? null,
      bottom: layout.paddingTokens.bottom ?? null,
      left: layout.paddingTokens.left ?? null,
    };
  }

  if (layout.gapToken) {
    out.itemSpacingToken = layout.gapToken;
  }
  
  return Object.keys(out).length ? out : null;
}

function mapRadius(
  radius: number | number[] | undefined,
): DSStructureNode['radius'] | null {
  if (radius === undefined) return null;

  if (typeof radius === 'number') return radius;

  if (Array.isArray(radius) && radius.length === 4) {
    return {
      topLeft: radius[0],
      topRight: radius[1],
      bottomRight: radius[2],
      bottomLeft: radius[3],
    };
  }

  return null;
}

function getParentPath(path: string): string | null {
  const parts = path.split(' / ');
  if (parts.length <= 1) return null;
  parts.pop();
  return parts.join(' / ');
}

function getLastSegment(path: string): string {
  const parts = path.split(' / ');
  return parts[parts.length - 1] ?? path;
}

// Normalize Athena-like paint fields to the runtime shape used by diff.
function normalizeComponentPaints(component: AthenaComponent) {
  if (!component) return;
  if (Array.isArray(component.structure)) {
    for (const node of component.structure) {
      normalizePaintFields(node);
      normalizeLayoutFields(node);
    }
  }
  if (component.variantStructures) {
    for (const patches of Object.values(component.variantStructures)) {
      if (!Array.isArray(patches)) continue;
      for (const patch of patches) {
        if (!patch) continue;
        if (patch.op === 'update') {
          normalizePaintFields(patch.value);
          normalizeLayoutFields(patch.value);
        } else if (patch.op === 'add') {
          normalizePaintFields(patch.node);
          normalizeLayoutFields(patch.node);
        }
      }
    }
  }
}

function buildComponentKeyByUniqueName(
  modules: AthenaCatalog[],
): Map<string, string> {
  const keysByName = new Map<string, Set<string>>();

  for (const module of modules) {
    for (const component of module.components ?? []) {
      const name = normalizeComponentInstanceName(component.name);
      const key = component.key;
      if (!name || !key) {
        continue;
      }

      const keys = keysByName.get(name) ?? new Set<string>();
      keys.add(key);
      keysByName.set(name, keys);
    }
  }

  const unique = new Map<string, string>();
  for (const [name, keys] of keysByName.entries()) {
    if (keys.size === 1) {
      unique.set(name, Array.from(keys)[0] ?? '');
    }
  }

  return unique;
}

function hydrateNestedInstanceComponentKeys(
  component: AthenaComponent,
  componentKeyByUniqueName: Map<string, string>,
) {
  if (!componentKeyByUniqueName.size) {
    return;
  }

  if (Array.isArray(component.structure)) {
    for (const node of component.structure) {
      hydrateNodeInstanceComponentKey(node, componentKeyByUniqueName);
    }
  }

  if (!component.variantStructures) {
    return;
  }

  for (const patches of Object.values(component.variantStructures)) {
    if (!Array.isArray(patches)) {
      continue;
    }

    for (const patch of patches) {
      if (!patch) {
        continue;
      }

      if (patch.op === 'update') {
        hydrateNodeInstanceComponentKey(patch.value, componentKeyByUniqueName);
      } else if (patch.op === 'add') {
        hydrateNodeInstanceComponentKey(patch.node, componentKeyByUniqueName);
      }
    }
  }
}

function hydrateNodeInstanceComponentKey(
  node: Partial<DSStructureNode> | null | undefined,
  componentKeyByUniqueName: Map<string, string>,
) {
  if (!node || node.type !== 'INSTANCE' || !node.componentInstance) {
    return;
  }

  if (node.componentInstance.componentKey) {
    return;
  }

  const normalizedName = normalizeComponentInstanceName(node.name);
  const componentKey = normalizedName
    ? componentKeyByUniqueName.get(normalizedName)
    : null;
  if (!componentKey) {
    return;
  }

  node.componentInstance = Object.assign({}, node.componentInstance, {
    componentKey,
  });
  inferredNestedComponentKeyNodes.add(node);
}

function normalizeComponentInstanceName(
  value: string | null | undefined,
): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizePaintFields(target: any) {
  if (!target || typeof target !== 'object') return;

  const fillToken = target.fillToken ?? extractTokenFromPaints(target.fills);
  const fillColor = extractColorFromPaints(target.fills);

  if (fillToken || fillColor) {
    target.fill = target.fill ?? {};
    if (!target.fill.token && fillToken) {
      target.fill.token = fillToken;
    }
    if (!target.fill.color && fillColor) {
      target.fill.color = fillColor;
    }
  }

  const strokeToken =
    target.strokeToken ?? extractTokenFromPaints(target.strokes);
  const strokeColor = extractColorFromPaints(target.strokes);

  if (strokeToken || strokeColor || typeof target.strokeWeight === 'number') {
    target.stroke = target.stroke ?? {};
    if (!target.stroke.token && strokeToken) {
      target.stroke.token = strokeToken;
    }
    if (!target.stroke.color && strokeColor) {
      target.stroke.color = strokeColor;
    }
    if (
      target.stroke.weight == null &&
      typeof target.strokeWeight === 'number'
    ) {
      target.stroke.weight = target.strokeWeight;
    }
    if (!target.stroke.align && target.strokeAlign) {
      target.stroke.align = target.strokeAlign;
    }
  }
}

function normalizeLayoutFields(target: any) {
  if (!target || typeof target !== 'object') return;

  const sourceLayout =
    target.layout && typeof target.layout === 'object' ? target.layout : null;
  const horizontal =
    sourceLayout?.sizing?.horizontal ??
    target.layoutSizingHorizontal ??
    sourceLayout?.layoutSizingHorizontal ??
    null;
  const vertical =
    sourceLayout?.sizing?.vertical ??
    target.layoutSizingVertical ??
    sourceLayout?.layoutSizingVertical ??
    null;

  if (!horizontal && !vertical) return;
  target.layout = sourceLayout ?? {};
  target.layout.sizing = target.layout.sizing ?? {};
  if (!target.layout.sizing.horizontal && horizontal) {
    target.layout.sizing.horizontal = horizontal;
  }
  if (!target.layout.sizing.vertical && vertical) {
    target.layout.sizing.vertical = vertical;
  }
}

function extractTokenFromPaints(paints: any): string | null {
  if (!Array.isArray(paints)) return null;
  for (const paint of paints) {
    if (!paint || typeof paint !== 'object') continue;
    const tokenKey =
      paint.tokenKey ||
      paint.token ||
      paint?.boundVariables?.color?.id ||
      paint?.boundVariables?.color?.variableId ||
      paint?.boundVariables?.color?.variable?.id ||
      paint?.boundVariables?.color?.variable?.key;
    if (tokenKey) return String(tokenKey);
  }
  return null;
}

function extractColorFromPaints(paints: any): string | null {
  if (!Array.isArray(paints)) return null;
  for (const paint of paints) {
    if (!paint || typeof paint !== 'object') continue;
    if (paint.visible === false) continue;
    if (paint.type && paint.type !== 'SOLID') continue;
    const color = paint.color;
    if (typeof color === 'string') {
      return color;
    }
    if (color && typeof color === 'object') {
      return formatRgba(color);
    }
  }
  return null;
}

function formatRgba(color: { r: number; g: number; b: number; a?: number }) {
  const max = Math.max(color.r, color.g, color.b);
  const scale = max <= 1 ? 255 : 1;
  const r = Math.round(color.r * scale);
  const g = Math.round(color.g * scale);
  const b = Math.round(color.b * scale);
  const alpha =
    typeof color.a === 'number' ? Math.round(color.a * 100) / 100 : 1;
  return `rgba(${r},${g},${b},${alpha})`;
}

function hydrateCatalogs(modules: AthenaCatalog[]) {
  catalogs = modules;

  componentIndexByKey.clear();
  hostControlledPaintPaths.clear();
  hostControlledTextPaths.clear();
  hostControlledLayoutPaths.clear();

  corporateNameIndex.clear();

  missingReferenceLog.clear();

  let totalComponents = 0;

  const uniqueKeys = new Set<string>();

  const validationWarnings: string[] = [];
  for (const module of catalogs) {
    for (const component of module.components ?? []) {
      totalComponents += 1;

      if (component.key) {
        uniqueKeys.add(component.key);
      }

      if (component.variants) {
        for (const variant of component.variants) {
          if (variant?.key) {
            uniqueKeys.add(variant.key);
          }
        }
      }

      prepareComponent(component, module);
      indexComponentByKey(component as unknown as LibraryComponent);

      registerPartUsage(component as unknown as LibraryComponent);

      validationWarnings.push(
        ...validateCatalogComponent(
          component,
          module.meta?.fileName ?? 'unknown',
        ),
      );
    }
  }

  refreshDerivedComponentCatalogState();

  console.log('[Apollo] catalog merge summary', {
    catalogCount: catalogs.length,
    componentCount: totalComponents,
    uniqueKeys: uniqueKeys.size,
  });

  if (validationWarnings.length) {
    for (const warning of validationWarnings.slice(0, 50)) {
      console.warn(`[Apollo::catalog] ${warning}`);
    }

    if (validationWarnings.length > 50) {
      console.warn(
        `[Apollo::catalog] Дополнительно ${validationWarnings.length - 50} предупреждений`,
      );
    }
  }
}

function hydrateAdditionalCatalogs(modules: AthenaCatalog[]) {
  if (!modules.length) {
    return;
  }

  catalogs = catalogs.concat(modules);

  for (const module of modules) {
    for (const component of module.components ?? []) {
      prepareComponent(component, module);
      indexComponentByKey(component as unknown as LibraryComponent);
      registerPartUsage(component as unknown as LibraryComponent);
    }
  }
}

function refreshDerivedComponentCatalogState() {
  catalogs.sort((left, right) => {
    const leftName = String(left.meta?.fileName ?? '');
    const rightName = String(right.meta?.fileName ?? '');
    return leftName < rightName ? -1 : leftName > rightName ? 1 : 0;
  });
  rehydrateNestedInstanceComponentKeys(catalogs);
  componentIndexByKey.clear();
  corporateNameIndex.clear();
  for (const module of catalogs) {
    for (const component of module.components ?? []) {
      indexComponentByKey(component as unknown as LibraryComponent);
      registerPartUsage(component as unknown as LibraryComponent);
    }
  }
  buildPartHostControlledPaintPaths();
}

function rehydrateNestedInstanceComponentKeys(modules: AthenaCatalog[]) {
  clearInferredNestedInstanceComponentKeys();
  const componentKeyByUniqueName = buildComponentKeyByUniqueName(modules);
  for (const module of modules) {
    for (const component of module.components ?? []) {
      hydrateNestedInstanceComponentKeys(component, componentKeyByUniqueName);
    }
  }
}

function clearInferredNestedInstanceComponentKeys() {
  for (const node of inferredNestedComponentKeyNodes) {
    if (!node.componentInstance) {
      continue;
    }
    const componentInstance = Object.assign({}, node.componentInstance);
    componentInstance.componentKey = '';
    node.componentInstance = componentInstance;
  }
  inferredNestedComponentKeyNodes.clear();
}

function validateCatalogComponent(
  component: AthenaComponent,
  fileName: string,
): string[] {
  const warnings: string[] = [];
  const hasVariants =
    Array.isArray(component.variants) && component.variants.length > 0;

  if (!hasVariants) {
    return warnings;
  }
  
  if (!component.variantStructures) {
    warnings.push(
      `Нет variantStructures для «${component.name}» (${fileName})`,
    );
    return warnings;
  }

  const missingVariantKeys = component.variants
    ?.filter((variant) => variant?.key && !component.variantStructures?.[variant.key])
    .map((variant) => variant?.name ?? variant?.key ?? 'unknown');

  if (missingVariantKeys?.length) {
    warnings.push(
      `variantStructures неполные для «${component.name}» (${fileName}): ${missingVariantKeys.join(', ')}`,
    );
  }

  return warnings;
}

function logCatalogEvent(source: ReferenceCatalogSource, message: string) {
  console.warn('[Apollo] catalog event', {
    fileName: source.fileName,
    url: source.url,
    message,
  });
}

export function reportMissingReference(name: string, key: string | null) {
  const signature = `${key}::${name}`;

  if (missingReferenceLog.has(signature)) {
    return;
  }

  if (missingReferenceLog.size >= 20) {
    return;
  }

  missingReferenceLog.add(signature);

  const message = `Не найден компонент с ключом ${key} (${name})`;

  console.warn(`[Apollo::catalog] ${message}`);

  try {
    figma.ui.postMessage({
      type: 'catalog-miss-debug',
      payload: { key, name },
    });
  } catch (error) {
    console.warn('Failed to report missing reference', error);
  }
}

function reportCatalogLoaded(fileName: string, size: number) {
  try {
    figma.ui?.postMessage({
      type: 'catalog-file-loaded',
      payload: { name: fileName, bytes: size },
    });
  } catch (error) {
    // ignore UI failures
  }
}

async function requestCatalogSource(url: string): Promise<string> {
  return fetchDirect(appendCacheBustingQuery(url, 'apolloCatalog', catalogCacheBust));
}

function* iterateCatalogComponents(): IterableIterator<LibraryComponent> {
  for (const module of catalogs) {
    for (const component of module.components ?? []) {
      yield component as unknown as LibraryComponent;
    }
  }
}

export function findComponent(
  key: string,
): LibraryComponent | null {
  const direct = findCatalogComponentByKey(key);
    
  return direct ?? null;
}

function findCatalogComponentByKey(
  key: string,
): LibraryComponent | null {
  return componentIndexByKey.get(key) ?? null;
}

export function resolveStructure(
  component: LibraryComponent | null | undefined,
  variantKey?: string | null,
): DSStructureNode[] | null {
  if (!component) return null;

  if (
    variantKey &&
    component.variantStructures &&
    component.variantStructures[variantKey]
  ) {
    return normalizeVariantStructureRootPath(
      component,
      variantKey,
      buildStructureFromPatches(
      component.structure ?? [],
      component.variantStructures[variantKey],
      ),
    );
  }

  if (component.structure && component.structure.length > 0) {
    return cloneStructure(component.structure);
  }

  return null;
}

export function resolveStructureForInstance(
  component: LibraryComponent | null | undefined,
  instance: DSInstanceInfo | null | undefined,
): DSStructureNode[] | null {
  if (!component) {
    return null;
  }

  const resolvedVariantKey = resolveVariantKeyForInstance(
    component,
    instance?.componentKey ?? null,
    instance?.variantProperties ?? null,
  );

  return resolveStructure(
    component,
    resolvedVariantKey ?? instance?.componentKey ?? null,
  );
}

export function resolveVariantKeyForInstance(
  component: LibraryComponent | null | undefined,
  componentKey: string | null | undefined,
  variantProperties: Record<string, string> | null | undefined,
): string | null {
  if (!component) {
    return null;
  }

  const variants = component.variants ?? [];
  if (!variants.length) {
    return componentKey ?? null;
  }

  const desiredProperties = variantProperties ?? null;
  if (!desiredProperties || !Object.keys(desiredProperties).length) {
    const directByKey = componentKey
      ? variants.find((variant) => variant.key === componentKey)
      : null;
    if (directByKey) {
      return directByKey.key;
    }
    return componentKey ?? null;
  }

  const exactByProperties = variants.find((variant) =>
    variantPropertiesEqual(
      getVariantPropertiesForLookup(variant),
      desiredProperties,
    ),
  );
  if (exactByProperties?.key) {
    return exactByProperties.key;
  }

  const directByKey = componentKey
    ? variants.find((variant) => variant.key === componentKey)
    : null;
  const defaultVariantKey =
    typeof (component as { defaultVariant?: unknown }).defaultVariant === 'string'
      ? ((component as { defaultVariant?: string }).defaultVariant ?? null)
      : null;
  const defaultVariantName =
    variants.find((variant) => variant.key === defaultVariantKey)?.name ??
    variants[0]?.name ??
    '';
  const defaultVariantProperties = parseVariantName(defaultVariantName);
  const defaultCompatible = variants.find((variant) =>
    variantMatchesSourceWithDefaultExtras(
      getVariantPropertiesForLookup(variant),
      desiredProperties,
      defaultVariantProperties,
    ),
  );
  if (defaultCompatible?.key) {
    return defaultCompatible.key;
  }

  const bestByOverlap = variants
    .map((variant) => ({
      variant,
      score: countVariantPropertyMatches(
        getVariantPropertiesForLookup(variant),
        desiredProperties,
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.variant.name.localeCompare(right.variant.name);
    })[0]?.variant;

  return bestByOverlap?.key ?? directByKey?.key ?? componentKey ?? null;
}

function buildPartHostControlledPaintPaths() {
  hostControlledPaintPaths.clear();
  hostControlledTextPaths.clear();
  hostControlledLayoutPaths.clear();
  const structureCache = new Map<string, DSStructureNode[] | null>();
  const startedAt = getTimestamp();

  for (const component of iterateCatalogComponents()) {
    registerHostControlledPaintPathsForStructure(
      component,
      resolveStructureCachedForPartPolicy(component, component.key ?? null, structureCache),
      structureCache,
    );

    for (const variant of component.variants ?? []) {
      if (!variant?.key) {
        continue;
      }

      registerHostControlledPaintPathsForStructure(
        component,
        resolveStructureCachedForPartPolicy(component, variant.key, structureCache),
        structureCache,
      );
    }
  }

  logAuditMetric('host-controlled-policy-build', {
    totalMs: Number((getTimestamp() - startedAt).toFixed(1)),
    paintOwners: hostControlledPaintPaths.size,
    textOwners: hostControlledTextPaths.size,
    layoutOwners: hostControlledLayoutPaths.size,
  });
}

function registerHostControlledPaintPathsForStructure(
  hostComponent: LibraryComponent,
  hostStructure: DSStructureNode[] | null,
  structureCache: Map<string, DSStructureNode[] | null>,
) {
  if (!hostStructure || !hostStructure.length) {
    return;
  }

  const hostMap = new Map(hostStructure.map((node) => [node.path, node]));

  for (const node of hostStructure) {
    const partKey = node.componentInstance?.componentKey;
    if (!partKey) {
      continue;
    }

    const partComponent = findCatalogComponentByKey(partKey);
      if (!partComponent) {
        continue;
      }

      const partStructure = resolveStructureCachedForPartPolicy(
        partComponent,
        resolveVariantKeyForInstance(
          partComponent,
          partKey,
          node.componentInstance?.variantProperties ?? null,
        ),
        structureCache,
      );
    if (!partStructure || !partStructure.length) {
      continue;
    }

    const alignedPartStructure = alignStructureToInstancePath(partStructure, node.path);
    for (const partNode of alignedPartStructure) {
      const hostNode = hostMap.get(partNode.path);
      if (!hostNode) {
        continue;
      }

      const relativePath = getRelativeInstancePath(node.path, partNode.path);
      if (relativePath == null) {
        continue;
      }

      const overrideKinds = getNestedOverrideKinds(hostNode, partNode);
      if (overrideKinds.paint) {
        addHostControlledPaintPath(partKey, relativePath, partComponent.key ?? null);
      }
      if (overrideKinds.text) {
        addHostControlledTextPath(partKey, relativePath, partComponent.key ?? null);
      }
      if (overrideKinds.layout) {
        addHostControlledLayoutPath(partKey, relativePath, partComponent.key ?? null);
      }
    }
  }
}

function resolveStructureCachedForPartPolicy(
  component: LibraryComponent | null | undefined,
  variantKey: string | null,
  cache: Map<string, DSStructureNode[] | null>,
): DSStructureNode[] | null {
  if (!component) {
    return null;
  }

  const cacheKey = `${component.key ?? component.displayName ?? 'unknown'}:${variantKey ?? 'default'}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) ?? null;
  }

  const structure = resolveStructure(component, variantKey);
  cache.set(cacheKey, structure);
  return structure;
}

function alignStructureToInstancePath(
  structure: DSStructureNode[],
  instancePath: string,
): DSStructureNode[] {
  if (!structure.length) {
    return [];
  }

  const instanceRoot =
    structure.find((item) => !item.path.includes(' / '))?.path ??
    structure[0].path;

  if (!instanceRoot || instanceRoot === instancePath) {
    return structure;
  }

  return structure.map((node) => {
    const cloned = cloneNode(node);
    cloned.path = replaceStructurePathPrefix(node.path, instanceRoot, instancePath);
    return cloned;
  });
}

function replaceStructurePathPrefix(path: string, from: string, to: string): string {
  if (path === from) {
    return to;
  }

  const needle = `${from} / `;
  if (path.startsWith(needle)) {
    return `${to} / ${path.slice(needle.length)}`;
  }

  return path;
}

function getNestedOverrideKinds(
  hostNode: DSStructureNode,
  partNode: DSStructureNode,
): { paint: boolean; text: boolean; layout: boolean } {
  const paint =
    !arePaintDescriptorsEqual(hostNode.fill, partNode.fill) ||
    !arePaintDescriptorsEqual(hostNode.stroke, partNode.stroke) ||
    (hostNode.styles?.fill?.styleKey ?? null) !==
      (partNode.styles?.fill?.styleKey ?? null) ||
    (hostNode.styles?.stroke?.styleKey ?? null) !==
      (partNode.styles?.stroke?.styleKey ?? null);

  const text =
    (hostNode.styles?.text?.styleKey ?? null) !==
      (partNode.styles?.text?.styleKey ?? null) ||
    (hostNode.typographyToken ?? null) !== (partNode.typographyToken ?? null);

  const layout =
    !areLayoutDescriptorsEqual(hostNode.layout ?? null, partNode.layout ?? null) ||
    !areRadiusDescriptorsEqual(hostNode.radius ?? null, partNode.radius ?? null) ||
    (hostNode.radiusToken ?? null) !== (partNode.radiusToken ?? null);

  return { paint, text, layout };
}

function areLayoutDescriptorsEqual(
  left: DSStructureNode['layout'] | null | undefined,
  right: DSStructureNode['layout'] | null | undefined,
): boolean {
  return (
    arePaddingDescriptorsEqual(left?.padding ?? null, right?.padding ?? null) &&
    arePaddingTokenDescriptorsEqual(
      left?.paddingTokens ?? null,
      right?.paddingTokens ?? null,
    ) &&
    (left?.itemSpacing ?? null) === (right?.itemSpacing ?? null) &&
    (left?.itemSpacingToken ?? null) === (right?.itemSpacingToken ?? null) &&
    (left?.sizing?.horizontal ?? null) ===
      (right?.sizing?.horizontal ?? null) &&
    (left?.sizing?.vertical ?? null) === (right?.sizing?.vertical ?? null)
  );
}

function arePaddingDescriptorsEqual(
  left: DSPadding | null | undefined,
  right: DSPadding | null | undefined,
): boolean {
  return (
    (left?.top ?? null) === (right?.top ?? null) &&
    (left?.right ?? null) === (right?.right ?? null) &&
    (left?.bottom ?? null) === (right?.bottom ?? null) &&
    (left?.left ?? null) === (right?.left ?? null)
  );
}

function arePaddingTokenDescriptorsEqual(
  left: NonNullable<DSStructureNode['layout']>['paddingTokens'] | null | undefined,
  right: NonNullable<DSStructureNode['layout']>['paddingTokens'] | null | undefined,
): boolean {
  return (
    (left?.top ?? null) === (right?.top ?? null) &&
    (left?.right ?? null) === (right?.right ?? null) &&
    (left?.bottom ?? null) === (right?.bottom ?? null) &&
    (left?.left ?? null) === (right?.left ?? null)
  );
}

function areRadiusDescriptorsEqual(
  left: DSStructureNode['radius'] | null | undefined,
  right: DSStructureNode['radius'] | null | undefined,
): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function arePaintDescriptorsEqual(
  left: DSStructureNode['fill'] | DSStructureNode['stroke'] | null | undefined,
  right: DSStructureNode['fill'] | DSStructureNode['stroke'] | null | undefined,
): boolean {
  const leftColor = left?.color ?? null;
  const leftToken = left?.token ?? null;
  const leftWeight = 'weight' in (left ?? {}) ? (left as any)?.weight ?? null : null;
  const leftAlign = 'align' in (left ?? {}) ? (left as any)?.align ?? null : null;
  const rightColor = right?.color ?? null;
  const rightToken = right?.token ?? null;
  const rightWeight = 'weight' in (right ?? {}) ? (right as any)?.weight ?? null : null;
  const rightAlign = 'align' in (right ?? {}) ? (right as any)?.align ?? null : null;

  return (
    leftColor === rightColor &&
    leftToken === rightToken &&
    leftWeight === rightWeight &&
    leftAlign === rightAlign
  );
}

function getRelativeInstancePath(
  instancePath: string,
  fullPath: string,
): string | null {
  if (fullPath === instancePath) {
    return '';
  }

  const prefix = `${instancePath} / `;
  if (!fullPath.startsWith(prefix)) {
    return null;
  }

  return fullPath.slice(prefix.length);
}

function addHostControlledPaintPath(
  partKey: string,
  relativePath: string,
  partComponentKey?: string | null,
) {
  addHostControlledPath(
    hostControlledPaintPaths,
    [partKey, partComponentKey ?? null],
    relativePath,
  );
}

function addHostControlledTextPath(
  partKey: string,
  relativePath: string,
  partComponentKey?: string | null,
) {
  addHostControlledPath(
    hostControlledTextPaths,
    [partKey, partComponentKey ?? null],
    relativePath,
  );
}

function addHostControlledLayoutPath(
  partKey: string,
  relativePath: string,
  partComponentKey?: string | null,
) {
  addHostControlledPath(
    hostControlledLayoutPaths,
    [partKey, partComponentKey ?? null],
    relativePath,
  );
}

function addHostControlledPath(
  registry: Map<string, Set<string>>,
  componentKeys: Array<string | null | undefined>,
  relativePath: string,
) {
  const uniqueKeys = Array.from(
    new Set(
      componentKeys.filter(
        (componentKey): componentKey is string =>
          typeof componentKey === 'string' && componentKey.length > 0,
      ),
    ),
  );

  for (const componentKey of uniqueKeys) {
    if (!registry.has(componentKey)) {
      registry.set(componentKey, new Set());
    }

    registry.get(componentKey)!.add(relativePath);
  }
}

function prepareComponent(component: AthenaComponent, module: AthenaCatalog) {
  normalizeComponentPaints(component);
  const role = mapRole(component.role);

  const parentName =
    component.parentComponent?.name ||
    component.meta?.pageName ||
    component.meta?.category ||
    component.name;

  const libraryComponent = component as unknown as LibraryComponent;
  libraryComponent.names = collectNames(component);
  libraryComponent.status = mapStatus(component);
  libraryComponent.platform = detectPlatform(component);
  libraryComponent.role = role;
  libraryComponent.source =
    module.meta?.library ?? module.meta?.fileName ?? 'Неизвестная библиотека';
  libraryComponent.sourceFile = module.meta?.fileName ?? undefined;
  libraryComponent.displayName = component.name;
  libraryComponent.variantOf = role === 'Part' ? parentName : undefined;
  libraryComponent.notes = component.description?.trim() || undefined;

  const canonicalName = normalizeCorporateName(component.name);
  if (canonicalName) {
    const key = buildCorporateIndexKey(
      canonicalName,
      libraryComponent.platform,
      component.name,
      component.name.includes('[Corporate]') ? 'corp' : 'base',
      '-variant',
    );

    corporateNameIndex.set(key, libraryComponent);

    if (!(component as any).variants) {
      corporateNameIndex.set(
        buildCorporateIndexKey(
          canonicalName,
          libraryComponent.platform,
          component.name,
          component.name.includes('[Corporate]') ? 'corp' : 'base',
        ),
        libraryComponent,
      );
    }
  }
}

function collectNames(component: AthenaComponent): string[] {
  const aliases = new Set(buildNameAliases(component));
  for (const variant of component.variants ?? []) {
    for (const alias of buildNameAliases(component, variant.name)) {
      aliases.add(alias);
    }
  }
  return Array.from(aliases);
}

function buildNameAliases(
  component: AthenaComponent,
  variantName?: string,
): string[] {
  const aliases = new Set<string>();
  if (variantName) {
    aliases.add(variantName);
    aliases.add(`${component.name} / ${variantName}`);
  } else {
    aliases.add(component.name);
  }

  if (component.meta?.category) {
    aliases.add(component.meta.category);
  }

  if (component.meta?.pageName) {
    if (variantName) {
      aliases.add(
        `${component.meta.pageName} / ${component.name} / ${variantName}`,
      );
    } else {
      aliases.add(`${component.meta.pageName} / ${component.name}`);
    }
  }

  return Array.from(aliases).map(normalizeName).filter(Boolean);
}

function mapStatus(component: AthenaComponent): LibraryStatus {
  const description = component.description?.toLowerCase() ?? '';
  if (description.includes('изменен') || description.includes('changed')) {
    return 'changed';
  }

  switch (component.status) {
    case 'deprecated':
      return 'deprecated';
    case 'scheduled':
    case 'scheduled-removal':
      return 'update';
    default:
      return 'current';
  }
}

function detectPlatform(component: AthenaComponent): ComponentPlatform {
  const explicitPlatform = String(component.platform ?? '')
    .trim()
    .toLowerCase();

  if (explicitPlatform === 'desktop') return 'Desktop';
  if (explicitPlatform === 'mobile-web' || explicitPlatform === 'mobile web') {
    return 'Mobile Web';
  }
  if (explicitPlatform === 'universal') return 'Universal';

  const sources = [
    component.name,
    component.meta?.pageName ?? '',
    component.meta?.category ?? '',
  ]
    .join(' ')
    .toLowerCase();

  if (sources.includes('[d]')) return 'Desktop';
  if (sources.includes('[m]')) return 'Mobile Web';

  return 'Universal';
}

function mapRole(value: string | undefined): ComponentRole {
  if (value && value.toLowerCase() === 'part') {
    return 'Part';
  }
  return 'Main';
}

function normalizeName(value: string): string {
  return value
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' / ')
    .trim()
    .toLowerCase();
}

function buildStructureFromPatches(
  base: DSStructureNode[] | undefined,
  patches: DSVariantStructurePatch[] | undefined,
): DSStructureNode[] {
  const nodes = cloneStructure(base ?? []);

  const nodeMap = new Map<number, DSStructureNode>();

  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  if (!patches || patches.length === 0) {
    return nodes;
  }

  for (const patch of patches) {
    switch (patch.op) {
      case 'update': {
        const target = nodeMap.get(patch.id);
        if (target) {
          Object.assign(target, patch.value);
          markVariantOwnedProperties(target, patch.value);
        }
        break;
      }
      case 'remove': {
        nodeMap.delete(patch.id);
        const index = nodes.findIndex((node) => node.id === patch.id);
        if (index !== -1) {
          nodes.splice(index, 1);
        }
        break;
      }
      case 'add': {
        const copy = cloneNode(patch.node);
        markVariantOwnedProperties(copy, patch.node);
        nodes.push(copy);
        if (!nodeMap.has(copy.id)) {
          nodeMap.set(copy.id, copy);
        }
        break;
      }
    }
  }

  return nodes;
}

const VARIANT_OWNED_PROPERTY_ROOTS = [
  'styles',
  'fill',
  'stroke',
  'layout',
  'opacity',
  'opacityToken',
  'typographyToken',
  'radius',
  'radiusToken',
  'effects',
  'componentInstance',
  'text',
  'visible',
];

function markVariantOwnedProperties(
  node: DSStructureNode,
  source: Partial<DSStructureNode> | null | undefined,
) {
  if (!source || typeof source !== 'object') {
    return;
  }

  const owned = collectVariantOwnedPropertyPaths(source);
  if (!owned.length) {
    return;
  }

  const merged = new Set<string>(node.referenceVariantOwnedProperties ?? []);
  for (const property of owned) {
    merged.add(property);
  }
  node.referenceVariantOwnedProperties = Array.from(merged).sort();
}

function collectVariantOwnedPropertyPaths(
  source: Partial<DSStructureNode>,
): string[] {
  const result: string[] = [];

  for (const root of VARIANT_OWNED_PROPERTY_ROOTS) {
    if (!Object.prototype.hasOwnProperty.call(source, root)) {
      continue;
    }
    collectVariantOwnedLeafPaths(
      (source as Record<string, unknown>)[root],
      root,
      result,
    );
  }

  return result.sort();
}

function collectVariantOwnedLeafPaths(
  value: unknown,
  path: string,
  result: string[],
) {
  if (
    value == null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    result.push(path);
    return;
  }

  const keys = Object.keys(value as Record<string, unknown>).sort();
  if (!keys.length) {
    result.push(path);
    return;
  }

  for (const key of keys) {
    collectVariantOwnedLeafPaths(
      (value as Record<string, unknown>)[key],
      `${path}.${key}`,
      result,
    );
  }
}

function normalizeVariantStructureRootPath(
  component: LibraryComponent,
  variantKey: string,
  nodes: DSStructureNode[],
): DSStructureNode[] {
  if (!nodes.length) {
    return nodes;
  }

  const variantName =
    component.variants?.find((variant) => variant.key === variantKey)?.name?.trim() ??
    '';

  if (!variantName) {
    return nodes;
  }

  const rootNode =
    nodes.find((node) => !node.path.includes(' / ')) ??
    nodes[0];
  const rootPath = rootNode?.path?.trim() ?? '';

  if (!rootPath || rootPath === variantName) {
    return nodes;
  }

  const rootPrefix = `${rootPath} /`;

  for (const node of nodes) {
    if (node.path === rootPath) {
      node.path = variantName;
      continue;
    }

    if (node.path.startsWith(rootPrefix)) {
      node.path = `${variantName}${node.path.slice(rootPath.length)}`;
    }
  }

  return nodes;
}

function cloneStructure(nodes: DSStructureNode[]): DSStructureNode[] {
  return nodes.map(cloneNode);
}

function cloneNode(node: DSStructureNode): DSStructureNode {
  return JSON.parse(JSON.stringify(node));
}

function getVariantPropertiesForLookup(
  variant: { name?: string | null; properties?: Record<string, string> | null },
): Record<string, string> {
  if (variant.properties && Object.keys(variant.properties).length) {
    return variant.properties;
  }

  return parseVariantName(variant.name ?? '');
}

function indexComponentByKey(component: LibraryComponent) {
  if (component.key) {
    componentIndexByKey.set(component.key, component);
  }

  for (const variant of component.variants ?? []) {
    if (variant?.key) {
      componentIndexByKey.set(variant.key, component);
    }
  }
}

function registerPartUsage(component: LibraryComponent) {
  if ((component as any).variantStructures) {
    for (const variantKey of Object.keys(component.variantStructures ?? {})) {
      const variantEntry = Object.assign({}, component, { name: variantKey }) as LibraryComponent;
      
      const canonicalName = normalizeCorporateName(component.name);

      if (canonicalName) {
        corporateNameIndex.set(
          buildCorporateIndexKey(
            canonicalName,
            component.platform,
            component.name,
            (component.name ?? '').includes('[Corporate]') ? 'corp' : 'base',
            `-variant-${variantKey}`,
          ),
          variantEntry,
        );
      }
    }
  }
}

function normalizeCorporateName(
  name: string | null | undefined,
): string | null {
  if (!name) return null;

  return name
    .replace(/🔄/g, ' ')
    .replace(/\[Corporate\]/gi, ' ')
    .replace(/\[(?:D|M)\]/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeCorporatePlatform(
  platform: ComponentPlatform | string | null | undefined,
  name?: string | null,
): string {
  const normalizedPlatform = String(platform ?? '')
    .trim()
    .toLowerCase();

  if (normalizedPlatform === 'desktop') {
    return 'desktop';
  }

  if (
    normalizedPlatform === 'mobile web' ||
    normalizedPlatform === 'mobile-web'
  ) {
    return 'mobile-web';
  }

  const normalizedName = String(name ?? '').toLowerCase();

  if (normalizedName.includes('[d]')) {
    return 'desktop';
  }

  if (normalizedName.includes('[m]')) {
    return 'mobile-web';
  }

  return 'universal';
}

function buildCorporateIndexKey(
  canonicalName: string,
  platform: ComponentPlatform | string | null | undefined,
  name: string | null | undefined,
  kind: 'base' | 'corp',
  suffix?: string,
): string {
  const platformKey = normalizeCorporatePlatform(platform, name);
  return `${canonicalName}::${platformKey}::${kind}${suffix ?? ''}`;
}

export function getCorporateCounterpart(component: {
  name?: string | null;
  platform?: ComponentPlatform | string | null;
} | string): {
  base?: LibraryComponent | null;
  corporate?: LibraryComponent | null;
} | null {
  const componentName =
    typeof component === 'string' ? component : component?.name ?? '';
  const componentPlatform =
    typeof component === 'string' ? null : component?.platform ?? null;
  const canonical = normalizeCorporateName(componentName);

  if (!canonical) return null;

  const exactBaseKey = buildCorporateIndexKey(
    canonical,
    componentPlatform,
    componentName,
    'base',
  );
  const exactBaseVariantKey = buildCorporateIndexKey(
    canonical,
    componentPlatform,
    componentName,
    'base',
    '-variant',
  );
  const universalBaseKey = buildCorporateIndexKey(
    canonical,
    'Universal',
    componentName,
    'base',
  );
  const universalBaseVariantKey = buildCorporateIndexKey(
    canonical,
    'Universal',
    componentName,
    'base',
    '-variant',
  );
  const base =
    corporateNameIndex.get(exactBaseKey) ??
    corporateNameIndex.get(exactBaseVariantKey) ??
    corporateNameIndex.get(universalBaseKey) ??
    corporateNameIndex.get(universalBaseVariantKey) ??
    null;

  const exactCorporateKey = buildCorporateIndexKey(
    canonical,
    componentPlatform,
    componentName,
    'corp',
  );
  const exactCorporateVariantKey = buildCorporateIndexKey(
    canonical,
    componentPlatform,
    componentName,
    'corp',
    '-variant',
  );
  const universalCorporateKey = buildCorporateIndexKey(
    canonical,
    'Universal',
    componentName,
    'corp',
  );
  const universalCorporateVariantKey = buildCorporateIndexKey(
    canonical,
    'Universal',
    componentName,
    'corp',
    '-variant',
  );
  const corporate =
    corporateNameIndex.get(exactCorporateKey) ??
    corporateNameIndex.get(exactCorporateVariantKey) ??
    corporateNameIndex.get(universalCorporateKey) ??
    corporateNameIndex.get(universalCorporateVariantKey) ??
    null;
    
  return { base, corporate };
}
