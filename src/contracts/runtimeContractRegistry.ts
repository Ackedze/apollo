import {
  appendCacheBustingQuery,
  fetchDirect,
} from '../utils/networkFetch';
import {
  normalizePath,
  resolveCatalogUrl,
} from '../reference/referenceList';
import type { ComponentContractRule } from './componentRules';
import {
  compactAgentContext,
  compactExamples,
  resolveAuditPresentation,
  type RuntimeAuditPresentation,
  type RuntimeComponentAgentContext,
  type RuntimeComponentExample,
} from './artifactContext';
import { compilePublicArtifact } from './publicArtifact';

type RemoteContractPackage = {
  componentKey?: string;
  packageName?: string;
  packagePath?: string;
  aliases?: string[];
  figmaKeys?: string[];
  sourceCatalogPath?: string;
  artifacts?: {
    rules?: string;
    composition?: string;
    agentContext?: string;
    auditMapping?: string;
    overrides?: string;
    generatedContract?: string;
    examples?: string;
  };
  rulesPath?: string;
  rulesFile?: string;
  compositionPath?: string;
  compositionFile?: string;
  agentContextPath?: string;
};

type RemoteComponentContractIndex = {
  schemaVersion?: number;
  baseUrl?: string;
  generatedAt?: string;
  packages?: RemoteContractPackage[];
  entries?: RemoteContractPackage[];
  components?: Record<string, unknown>;
  aliases?: Record<string, string>;
};

type RuntimeComponentRuleRegistryEntry = {
  componentKey: string;
  aliases: string[];
  figmaKeys: string[];
  rulesFile: {
    componentKey: string;
    rules: ComponentContractRule[];
  };
};

type RuntimeCompositionContract = {
  componentKey?: string;
  component?: {
    name?: string;
    library?: string;
  };
  allowedOverrides?: Array<{
    targetPathPattern?: string;
    property?: string;
    expectedOverride?: string | number | null;
    scope?: string;
    reason?: string;
  }>;
  standaloneBaselines?: Array<{
    targetPathPattern?: string;
    property?: string;
    expectedValue?: string | number | null;
    styleKey?: string | null;
    scope?: string;
  }>;
};

type RuntimeCompositionRegistryEntry = {
  contract: RuntimeCompositionContract;
  aliases: string[];
};

export type ContractArtifactHint = {
  figmaKey?: string | null;
  componentName?: string | null;
  displayName?: string | null;
  sourceFile?: string | null;
};

type RuntimeContractPackageState = {
  indexEntry: RemoteContractPackage;
  aliases: string[];
  rulesEntry: RuntimeComponentRuleRegistryEntry | null;
  compositionEntry: RuntimeCompositionRegistryEntry | null;
  agentContext: RuntimeComponentAgentContext | null;
  auditMapping: any | null;
  overridesPayload: any | null;
  examples: RuntimeComponentExample[] | null;
  examplesLoading: Promise<void> | null;
  loading: Promise<void> | null;
  loaded: boolean;
};

let remoteContractIndexUrl: string | null = null;
let remoteContractsBaseUrl = '';
let remoteContractsCacheBust = Date.now();
let indexPromise: Promise<void> | null = null;
let indexLoaded = false;
let indexUnavailable = false;
let packageStates: RuntimeContractPackageState[] = [];

const STRICT_REMOTE_CONTRACT_ARTIFACTS = true;

declare global {
  var __APOLLO_TEST_REMOTE_COMPONENT_RULE_REGISTRY__:
    | RuntimeComponentRuleRegistryEntry[]
    | undefined;
  var __APOLLO_TEST_REMOTE_COMPOSITION_CONTRACT_REGISTRY__:
    | RuntimeCompositionRegistryEntry[]
    | undefined;
  var __APOLLO_TEST_REMOTE_AGENT_CONTEXTS__:
    | RuntimeComponentAgentContext[]
    | undefined;
  var __APOLLO_TEST_REMOTE_AUDIT_PRESENTATIONS__:
    | Array<{
        componentKey: string;
        property: string;
        presentation: RuntimeAuditPresentation;
      }>
    | undefined;
}

export function configureRemoteContractIndexSource(
  indexUrl: string | null,
  baseUrl: string,
): void {
  remoteContractIndexUrl = indexUrl;
  remoteContractsBaseUrl = baseUrl;
  remoteContractsCacheBust = Date.now();
  indexPromise = null;
  indexLoaded = false;
  indexUnavailable = false;
  packageStates = [];
}

export async function ensureContractArtifactsForHints(
  hints: ContractArtifactHint[],
): Promise<void> {
  await ensureRemoteContractIndexLoaded();
  if (!indexLoaded || indexUnavailable || !packageStates.length) {
    if (STRICT_REMOTE_CONTRACT_ARTIFACTS && hints.length) {
      throw new Error('Apollo strict mode: remote component contract index is unavailable');
    }
    return;
  }

  const matchedPackages = new Set<RuntimeContractPackageState>();
  for (const hint of hints) {
    for (const state of packageStates) {
      if (packageMatchesHint(state, hint)) {
        matchedPackages.add(state);
      }
    }
  }

  if (!matchedPackages.size) {
    console.log('[Apollo][contracts] remote artifacts skipped', {
      reason: 'no matching packages',
      hintCount: hints.length,
    });
    return;
  }

  const startedAt = Date.now();
  await Promise.all(Array.from(matchedPackages).map(loadPackageArtifacts));
  console.log('[Apollo][contracts] remote artifacts ready', {
    totalMs: Date.now() - startedAt,
    requestedPackages: matchedPackages.size,
    rulesCount: getRemoteComponentRuleRegistry().length,
    compositionCount: getRemoteCompositionContractRegistry().length,
    agentContextCount: getRemoteComponentAgentContexts().length,
  });
}

export function getRemoteComponentRuleRegistry():
  RuntimeComponentRuleRegistryEntry[] {
  if (Array.isArray(globalThis.__APOLLO_TEST_REMOTE_COMPONENT_RULE_REGISTRY__)) {
    return globalThis.__APOLLO_TEST_REMOTE_COMPONENT_RULE_REGISTRY__;
  }
  return packageStates
    .map((state) => state.rulesEntry)
    .filter((entry): entry is RuntimeComponentRuleRegistryEntry => entry !== null);
}

export function getRemoteCompositionContractRegistry():
  RuntimeCompositionRegistryEntry[] {
  if (Array.isArray(globalThis.__APOLLO_TEST_REMOTE_COMPOSITION_CONTRACT_REGISTRY__)) {
    return globalThis.__APOLLO_TEST_REMOTE_COMPOSITION_CONTRACT_REGISTRY__;
  }
  return packageStates
    .map((state) => state.compositionEntry)
    .filter((entry): entry is RuntimeCompositionRegistryEntry => entry !== null);
}

export function getRemoteComponentAgentContexts(): RuntimeComponentAgentContext[] {
  if (Array.isArray(globalThis.__APOLLO_TEST_REMOTE_AGENT_CONTEXTS__)) {
    return globalThis.__APOLLO_TEST_REMOTE_AGENT_CONTEXTS__;
  }
  return packageStates
    .map((state) => state.agentContext)
    .filter((entry): entry is RuntimeComponentAgentContext => entry !== null);
}

export function getComponentAgentContextsForKeys(
  componentKeys: Array<string | null | undefined>,
): RuntimeComponentAgentContext[] {
  const keys = new Set(componentKeys.filter((key): key is string => Boolean(key)));
  if (Array.isArray(globalThis.__APOLLO_TEST_REMOTE_AGENT_CONTEXTS__)) {
    return globalThis.__APOLLO_TEST_REMOTE_AGENT_CONTEXTS__.filter((context) =>
      keys.has(context.componentKey),
    );
  }
  const contexts = packageStates
    .filter((state) => {
      const entry = state.indexEntry;
      return (
        state.agentContext !== null &&
        (keys.has(entry.componentKey ?? '') ||
          (entry.figmaKeys ?? []).some((key) => keys.has(key)))
      );
    })
    .map((state) => state.agentContext as RuntimeComponentAgentContext);
  const unique = new Map<string, RuntimeComponentAgentContext>();
  for (const context of contexts) {
    if (!unique.has(context.componentKey)) {
      unique.set(context.componentKey, context);
    }
  }
  return Array.from(unique.values());
}

export function getAuditPresentationForComponent(
  componentKey: string | null | undefined,
  property: string,
): RuntimeAuditPresentation | null {
  if (!componentKey) return null;
  if (Array.isArray(globalThis.__APOLLO_TEST_REMOTE_AUDIT_PRESENTATIONS__)) {
    return (
      globalThis.__APOLLO_TEST_REMOTE_AUDIT_PRESENTATIONS__.find(
        (entry) =>
          entry.componentKey === componentKey && entry.property === property,
      )?.presentation ?? null
    );
  }
  for (const state of packageStates) {
    const entry = state.indexEntry;
    if (
      componentKey !== entry.componentKey &&
      !(entry.figmaKeys ?? []).includes(componentKey)
    ) {
      continue;
    }
    const presentation = resolveAuditPresentation(state.auditMapping, property);
    if (presentation) return presentation;
  }
  return null;
}

export async function ensureContractExamplesForHints(
  hints: ContractArtifactHint[],
): Promise<void> {
  await ensureRemoteContractIndexLoaded();
  const matched = packageStates.filter((state) =>
    hints.some((hint) => packageMatchesHint(state, hint)),
  );
  await Promise.all(matched.map(loadPackageExamples));
}

export function getComponentExamplesForKeys(
  componentKeys: Array<string | null | undefined>,
): Array<{ componentKey: string; examples: RuntimeComponentExample[] }> {
  const keys = new Set(componentKeys.filter((key): key is string => Boolean(key)));
  return packageStates
    .filter((state) => {
      const entry = state.indexEntry;
      return (
        state.examples !== null &&
        (keys.has(entry.componentKey ?? '') ||
          (entry.figmaKeys ?? []).some((key) => keys.has(key)))
      );
    })
    .map((state) => ({
      componentKey: state.indexEntry.componentKey ?? state.indexEntry.packageName ?? '',
      examples: state.examples ?? [],
    }))
    .filter((entry) => Boolean(entry.componentKey) && entry.examples.length > 0);
}

async function ensureRemoteContractIndexLoaded(): Promise<void> {
  if (!remoteContractIndexUrl || indexUnavailable || indexLoaded) {
    return;
  }

  if (!indexPromise) {
    indexPromise = loadRemoteContractIndex().finally(() => {
      indexPromise = null;
    });
  }

  return indexPromise;
}

async function loadRemoteContractIndex(): Promise<void> {
  if (!remoteContractIndexUrl) {
    return;
  }

  try {
    const raw = await fetchDirect(
      appendCacheBustingQuery(
        remoteContractIndexUrl,
        'apolloContractIndex',
        remoteContractsCacheBust,
      ),
    );
    const index = JSON.parse(raw) as RemoteComponentContractIndex;
    const entries = Array.isArray(index.packages)
      ? index.packages
      : Array.isArray(index.entries)
        ? index.entries
        : [];

    packageStates = entries
      .filter((entry) => Boolean(entry.componentKey || entry.packageName))
      .map((entry) => ({
        indexEntry: entry,
        aliases: buildPackageAliases(entry),
        rulesEntry: null,
        compositionEntry: null,
        agentContext: null,
        auditMapping: null,
        overridesPayload: null,
        examples: null,
        examplesLoading: null,
        loading: null,
        loaded: false,
      }));
    if (index.baseUrl) {
      remoteContractsBaseUrl = index.baseUrl;
    }
    indexLoaded = true;

    console.log('[Apollo][contracts] index loaded', {
      url: remoteContractIndexUrl,
      generatedAt: index.generatedAt ?? null,
      packageCount: packageStates.length,
    });
  } catch (error) {
    indexUnavailable = true;
    const payload = {
      url: remoteContractIndexUrl,
      error:
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: string }).message)
          : String(error ?? 'Unknown error'),
    };
    console.warn('[Apollo][contracts] failed to load remote index', payload);
    if (STRICT_REMOTE_CONTRACT_ARTIFACTS) {
      throw new Error(`Apollo strict mode: failed to load remote component contract index: ${payload.error}`);
    }
  }
}

async function loadPackageArtifacts(
  state: RuntimeContractPackageState,
): Promise<void> {
  if (state.loaded) {
    return;
  }
  if (state.loading) {
    return state.loading;
  }

  state.loading = (async () => {
    const entry = state.indexEntry;
    const componentKey = entry.componentKey ?? entry.packageName ?? '';
    const aliases = state.aliases;

    const rulesPath = getPackageArtifactPath(
      entry,
      entry.rulesPath ?? entry.rulesFile ?? entry.artifacts?.rules ?? '',
    );
    if (rulesPath) {
      const rulesPayload = await loadJsonArtifact(rulesPath);
      const rules = Array.isArray(rulesPayload?.rules)
        ? rulesPayload.rules
        : [];
      if (componentKey && rules.length) {
        state.rulesEntry = {
          componentKey,
          aliases,
          figmaKeys: Array.isArray(entry.figmaKeys) ? entry.figmaKeys : [],
          rulesFile: {
            componentKey,
            rules: rules as ComponentContractRule[],
          },
        };
      }
    }

    const compositionPath = getPackageArtifactPath(
      entry,
      entry.compositionPath ??
        entry.compositionFile ??
        entry.artifacts?.composition ??
        '',
    );
    if (compositionPath) {
      const contract = await loadJsonArtifact(compositionPath);
      if (contract && typeof contract === 'object') {
        state.compositionEntry = {
          contract: contract as RuntimeCompositionContract,
          aliases,
        };
      }
    }

    const overridesPath = getPackageArtifactPath(
      entry,
      entry.artifacts?.overrides ?? 'contract.overrides.json',
    );
    state.overridesPayload = overridesPath
      ? await loadJsonArtifact(overridesPath)
      : null;

    const agentContextPath = getPackageArtifactPath(
      entry,
      entry.agentContextPath ?? entry.artifacts?.agentContext ?? '',
    );
    if (agentContextPath) {
      const payload = await loadJsonArtifact(agentContextPath);
      state.agentContext = compactAgentContext(
        payload,
        componentKey,
        state.overridesPayload,
      );
    }

    const auditMappingPath = getPackageArtifactPath(
      entry,
      entry.artifacts?.auditMapping ?? 'audit-mapping.json',
    );
    state.auditMapping = auditMappingPath
      ? await loadJsonArtifact(auditMappingPath)
      : null;

    state.loaded = true;
  })().catch((error) => {
    const payload = {
      componentKey: state.indexEntry.componentKey ?? null,
      packageName: state.indexEntry.packageName ?? null,
      error:
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: string }).message)
          : String(error ?? 'Unknown error'),
    };
    console.warn('[Apollo][contracts] failed to load package artifacts', payload);
    if (STRICT_REMOTE_CONTRACT_ARTIFACTS) {
      throw new Error(`Apollo strict mode: failed to load remote component artifacts: ${payload.error}`);
    }
  }).finally(() => {
    state.loading = null;
  });

  return state.loading;
}

async function loadPackageExamples(
  state: RuntimeContractPackageState,
): Promise<void> {
  if (state.examples !== null) return;
  if (state.examplesLoading) return state.examplesLoading;
  state.examplesLoading = (async () => {
    const path = getPackageArtifactPath(
      state.indexEntry,
      state.indexEntry.artifacts?.examples ?? 'examples.json',
    );
    const payload = path ? await loadJsonArtifact(path) : null;
    state.examples = compactExamples(payload);
  })().catch((error) => {
    state.examples = [];
    console.warn('[Apollo][contracts] optional examples unavailable', {
      componentKey: state.indexEntry.componentKey ?? null,
      error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    });
  }).finally(() => {
    state.examplesLoading = null;
  });
  return state.examplesLoading;
}

async function loadJsonArtifact(path: string): Promise<any> {
  const url = resolveArtifactUrl(path);
  const raw = await fetchDirect(
    appendCacheBustingQuery(url, 'apolloContractArtifact', remoteContractsCacheBust),
  );
  return compilePublicArtifact(JSON.parse(raw));
}

function resolveArtifactUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return resolveCatalogUrl(remoteContractsBaseUrl, path);
}

function getPackageArtifactPath(
  entry: RemoteContractPackage,
  artifactPath: string,
): string {
  if (!artifactPath || /^https?:\/\//i.test(artifactPath)) {
    return artifactPath;
  }
  if (artifactPath.includes('/')) {
    return artifactPath;
  }
  if (!entry.packagePath) {
    return artifactPath;
  }
  return `${normalizePath(entry.packagePath)}/${artifactPath}`;
}

function buildPackageAliases(entry: RemoteContractPackage): string[] {
  const aliases = new Set<string>();
  addAlias(aliases, entry.packageName);
  addAlias(aliases, entry.componentKey);
  for (const alias of entry.aliases ?? []) {
    addAlias(aliases, alias);
  }
  return Array.from(aliases);
}

function addAlias(aliases: Set<string>, value: string | null | undefined): void {
  if (value) {
    aliases.add(value);
  }
}

function packageMatchesHint(
  state: RuntimeContractPackageState,
  hint: ContractArtifactHint,
): boolean {
  const entry = state.indexEntry;
  const figmaKey = hint.figmaKey ?? '';
  if (figmaKey && entry.figmaKeys?.includes(figmaKey)) {
    return true;
  }

  const sourceFile = normalizeComparablePath(hint.sourceFile ?? '');
  const sourceCatalogPath = normalizeComparablePath(entry.sourceCatalogPath ?? '');
  if (sourceFile && sourceCatalogPath && sourceFile === sourceCatalogPath) {
    return true;
  }

  const names = [
    hint.componentName ?? '',
    hint.displayName ?? '',
  ].map(normalizeAlias);
  for (const alias of state.aliases) {
    if (names.includes(normalizeAlias(alias))) {
      return true;
    }
  }

  return false;
}

function normalizeAlias(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeComparablePath(value: string): string {
  return normalizePath(value).toLowerCase();
}
