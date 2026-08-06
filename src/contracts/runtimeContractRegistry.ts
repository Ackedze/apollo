import {
  resolveAuditPresentation,
  type RuntimeAuditPresentation,
  type RuntimeComponentAgentContext,
  type RuntimeComponentExample,
} from './artifactContext';
import {
  validateRemoteContractIndex,
  type ContractCoveragePolicy,
  type RemoteComponentContractIndex,
  type RemoteContractPackage,
} from './contractIndex';
import {
  compileContractAgentContextArtifact,
  compileContractAuditMappingArtifact,
  compileContractCompositionArtifact,
  compileContractExamplesArtifact,
  compileContractGeneratedApiArtifact,
  compileContractOverridesArtifact,
  compileContractRulesArtifact,
  type RuntimeComponentRuleRegistryEntry,
  type RuntimeCompositionRegistryEntry,
} from './contractArtifactCompiler';
import type {
  RuntimeComponentApiContract,
  RuntimeComponentApiRegistryEntry,
} from './componentApiContracts';
import {
  buildContractPackageAliases,
  describeContractArtifactHint,
  resolveContractPackageArtifactPaths,
  resolveContractPackageForHint,
  type ContractArtifactHint,
} from './contractIndexResolver';
import {
  fetchRemoteContractArtifactPayload,
  fetchRemoteContractIndexPayload,
} from './contractTransport';
import { AsyncResourceLifecycle } from '../services/asyncResourceLifecycle';

export type { ContractArtifactHint } from './contractIndexResolver';

type RuntimeContractPackageState = {
  indexEntry: RemoteContractPackage;
  aliases: string[];
  apiEntry: RuntimeComponentApiRegistryEntry | null;
  rulesEntry: RuntimeComponentRuleRegistryEntry | null;
  compositionEntry: RuntimeCompositionRegistryEntry | null;
  agentContext: RuntimeComponentAgentContext | null;
  auditMapping: any | null;
  overridesPayload: any | null;
  examples: RuntimeComponentExample[] | null;
  artifactsLifecycle: AsyncResourceLifecycle;
  examplesLifecycle: AsyncResourceLifecycle;
};

let remoteContractIndexUrl: string | null = null;
let remoteContractsBaseUrl = '';
let remoteContractsCacheBust = Date.now();
let packageStates: RuntimeContractPackageState[] = [];
let defaultCoveragePolicy: ContractCoveragePolicy = 'none';
const contractIndexLifecycle = new AsyncResourceLifecycle();

const STRICT_REMOTE_CONTRACT_ARTIFACTS = true;

declare global {
  var __APOLLO_TEST_REMOTE_COMPONENT_RULE_REGISTRY__:
    | RuntimeComponentRuleRegistryEntry[]
    | undefined;
  var __APOLLO_TEST_REMOTE_COMPONENT_API_REGISTRY__:
    | RuntimeComponentApiRegistryEntry[]
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
  contractIndexLifecycle.reset();
  packageStates = [];
  defaultCoveragePolicy = 'none';
}

export async function ensureContractArtifactsForHints(
  hints: ContractArtifactHint[],
): Promise<void> {
  await ensureRemoteContractIndexLoaded();
  if (!contractIndexLifecycle.isReady() || !packageStates.length) {
    if (STRICT_REMOTE_CONTRACT_ARTIFACTS && hints.length) {
      throw new Error('Apollo strict mode: remote component contract index is unavailable');
    }
    return;
  }

  const matchedPackages = new Set<RuntimeContractPackageState>();
  for (const hint of hints) {
    const state = resolveContractPackageForHint(packageStates, hint);
    if (state && state.indexEntry.coverage !== 'none') {
      matchedPackages.add(state);
    } else if (!state && defaultCoveragePolicy === 'required') {
      throw new Error(
        `Apollo strict mode: no required contract package for ${describeContractArtifactHint(hint)}`,
      );
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
    apiContractCount: getRemoteComponentApiRegistry().reduce(
      (count, entry) => count + entry.contracts.length,
      0,
    ),
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

export function getRemoteComponentApiRegistry(): RuntimeComponentApiRegistryEntry[] {
  if (Array.isArray(globalThis.__APOLLO_TEST_REMOTE_COMPONENT_API_REGISTRY__)) {
    return globalThis.__APOLLO_TEST_REMOTE_COMPONENT_API_REGISTRY__;
  }
  return packageStates
    .map((state) => state.apiEntry)
    .filter((entry): entry is RuntimeComponentApiRegistryEntry => entry !== null);
}

export function getComponentApiContractByFigmaKey(
  figmaKey: string | null | undefined,
): RuntimeComponentApiContract | null {
  if (!figmaKey) return null;
  for (const entry of getRemoteComponentApiRegistry()) {
    for (const contract of entry.contracts) {
      if (contract.componentKey === figmaKey) return contract;
      if (
        contract.figma.variants.variantKeys.some(
          (variant) => variant.key === figmaKey,
        )
      ) {
        return contract;
      }
    }
  }
  return null;
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
  return getComponentAgentContextsForHints(
    componentKeys.map((figmaKey) => ({ figmaKey })),
  );
}

export function getComponentAgentContextsForHints(
  hints: ContractArtifactHint[],
): RuntimeComponentAgentContext[] {
  const keys = new Set(
    hints
      .map((hint) => hint.figmaKey)
      .filter((key): key is string => Boolean(key)),
  );
  const names = new Set<string>();
  for (const hint of hints) {
    for (const name of [hint.componentName, hint.displayName]) {
      const normalized = normalizeComponentIdentityName(name);
      if (normalized) names.add(normalized);
    }
  }
  if (Array.isArray(globalThis.__APOLLO_TEST_REMOTE_AGENT_CONTEXTS__)) {
    return globalThis.__APOLLO_TEST_REMOTE_AGENT_CONTEXTS__
      .filter(
        (context) =>
          keys.has(context.componentKey) ||
          (context.componentSemantics ?? []).some((semantic) =>
            keys.has(semantic.componentKey) ||
            names.has(normalizeComponentIdentityName(semantic.name)),
          ),
      )
      .map((context) => filterContextSemantics(context, keys, names));
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
    .map((state) =>
      filterContextSemantics(
        state.agentContext as RuntimeComponentAgentContext,
        keys,
        names,
      ),
    );
  const unique = new Map<string, RuntimeComponentAgentContext>();
  for (const context of contexts) {
    if (!unique.has(context.componentKey)) {
      unique.set(context.componentKey, context);
    }
  }
  return Array.from(unique.values());
}

function filterContextSemantics(
  context: RuntimeComponentAgentContext,
  componentKeys: Set<string>,
  componentNames: Set<string> = new Set<string>(),
): RuntimeComponentAgentContext {
  return Object.assign({}, context, {
    componentSemantics: (context.componentSemantics ?? []).filter((semantic) => {
      const normalizedName = normalizeComponentIdentityName(semantic.name);
      return (
        componentKeys.has(semantic.componentKey) ||
        Boolean(normalizedName && componentNames.has(normalizedName))
      );
    }),
  });
}

function normalizeComponentIdentityName(
  value: string | null | undefined,
): string {
  return String(value ?? '')
    .replace(/[🔒🔄❌]/gu, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
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
  const matched = Array.from(
    new Set(
      hints
        .map((hint) => resolveContractPackageForHint(packageStates, hint))
        .filter((state): state is RuntimeContractPackageState => Boolean(state)),
    ),
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

export function getContractPackageKeyForHint(
  hint: ContractArtifactHint,
): string | null {
  const state = resolveContractPackageForHint(packageStates, hint);
  return state?.indexEntry.componentKey ?? null;
}

export async function ensureContractPackageIndexLoaded(): Promise<void> {
  await ensureRemoteContractIndexLoaded();
}

async function ensureRemoteContractIndexLoaded(): Promise<void> {
  if (!remoteContractIndexUrl) {
    return;
  }

  const indexUrl = remoteContractIndexUrl;
  const cacheBust = remoteContractsCacheBust;
  return contractIndexLifecycle.ensure(
    () => loadRemoteContractIndex(indexUrl, cacheBust),
    (index) => applyRemoteContractIndex(index, indexUrl),
  );
}

async function loadRemoteContractIndex(
  indexUrl: string,
  cacheBust: number,
): Promise<RemoteComponentContractIndex> {
  try {
    return validateRemoteContractIndex(
      await fetchRemoteContractIndexPayload(
        indexUrl,
        cacheBust,
      ),
    );
  } catch (error) {
    const payload = {
      url: indexUrl,
      error:
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: string }).message)
          : String(error ?? 'Unknown error'),
    };
    console.warn('[Apollo][contracts] failed to load remote index', payload);
    if (STRICT_REMOTE_CONTRACT_ARTIFACTS) {
      throw new Error(`Apollo strict mode: failed to load remote component contract index: ${payload.error}`);
    }
    throw error;
  }
}

function applyRemoteContractIndex(
  index: RemoteComponentContractIndex,
  indexUrl: string,
): void {
  packageStates = index.packages
    .filter((entry) => Boolean(entry.componentKey || entry.packageName))
    .map((entry) => ({
      indexEntry: entry,
      aliases: buildContractPackageAliases(entry),
      apiEntry: null,
      rulesEntry: null,
      compositionEntry: null,
      agentContext: null,
      auditMapping: null,
      overridesPayload: null,
      examples: null,
      artifactsLifecycle: new AsyncResourceLifecycle({ retryFailed: true }),
      examplesLifecycle: new AsyncResourceLifecycle({ retryFailed: true }),
    }));
  if (index.baseUrl) {
    remoteContractsBaseUrl = index.baseUrl;
  }
  defaultCoveragePolicy = index.coverage.defaultPolicy;

  console.log('[Apollo][contracts] index loaded', {
    url: indexUrl,
    generatedAt: index.generatedAt ?? null,
    packageCount: packageStates.length,
  });
}

async function loadPackageArtifacts(
  state: RuntimeContractPackageState,
): Promise<void> {
  return state.artifactsLifecycle.ensure(async () => {
    try {
      const entry = state.indexEntry;
      const componentKey = entry.componentKey;
      const aliases = state.aliases;
      const artifactPaths = resolveContractPackageArtifactPaths(entry);
      const transportOptions = {
        baseUrl: remoteContractsBaseUrl,
        cacheBust: remoteContractsCacheBust,
      };

      if (artifactPaths.generatedContract) {
        const payload = await fetchRemoteContractArtifactPayload(
          artifactPaths.generatedContract,
          transportOptions,
        );
        state.apiEntry = compileContractGeneratedApiArtifact(
          payload,
          entry,
          aliases,
        );
      } else if (entry.coverage === 'required') {
        throw new Error('required contract package has no generatedContract artifact');
      }

      if (artifactPaths.rules) {
        const payload = await fetchRemoteContractArtifactPayload(
          artifactPaths.rules,
          transportOptions,
        );
        state.rulesEntry = compileContractRulesArtifact(
          payload,
          entry,
          aliases,
        );
      }

      if (artifactPaths.composition) {
        const payload = await fetchRemoteContractArtifactPayload(
          artifactPaths.composition,
          transportOptions,
        );
        state.compositionEntry = compileContractCompositionArtifact(
          payload,
          aliases,
        );
      }

      state.overridesPayload = artifactPaths.overrides
        ? compileContractOverridesArtifact(
            await fetchRemoteContractArtifactPayload(
              artifactPaths.overrides,
              transportOptions,
            ),
          )
        : null;

      if (artifactPaths.agentContext) {
        const payload = await fetchRemoteContractArtifactPayload(
          artifactPaths.agentContext,
          transportOptions,
        );
        state.agentContext = compileContractAgentContextArtifact(
          payload,
          componentKey,
          state.overridesPayload,
        );
      }

      state.auditMapping = artifactPaths.auditMapping
        ? compileContractAuditMappingArtifact(
            await fetchRemoteContractArtifactPayload(
              artifactPaths.auditMapping,
              transportOptions,
            ),
          )
        : null;
    } catch (error) {
      const payload = {
        componentKey: state.indexEntry.componentKey ?? null,
        packageName: state.indexEntry.packageName ?? null,
        error:
          error && typeof error === 'object' && 'message' in error
            ? String((error as { message?: string }).message)
            : String(error ?? 'Unknown error'),
      };
      console.warn(
        '[Apollo][contracts] failed to load package artifacts',
        payload,
      );
      if (state.indexEntry.coverage === 'required') {
        throw new Error(
          `Apollo strict mode: failed to load remote component artifacts: ${payload.error}`,
        );
      }
    }
  });
}

async function loadPackageExamples(
  state: RuntimeContractPackageState,
): Promise<void> {
  return state.examplesLifecycle.ensure(async () => {
    try {
      const path = resolveContractPackageArtifactPaths(
        state.indexEntry,
      ).examples;
      const payload = path
        ? await fetchRemoteContractArtifactPayload(path, {
            baseUrl: remoteContractsBaseUrl,
            cacheBust: remoteContractsCacheBust,
          })
        : null;
      state.examples = compileContractExamplesArtifact(payload);
    } catch (error) {
      state.examples = [];
      console.warn('[Apollo][contracts] optional examples unavailable', {
        componentKey: state.indexEntry.componentKey ?? null,
        error:
          error instanceof Error
            ? error.message
            : String(error ?? 'Unknown error'),
      });
    }
  });
}
