import { resolveAuditPresentation, type RuntimeAuditPresentation, type RuntimeComponentAgentContext } from './artifactContext';
import type { RuntimeComponentApiContract, RuntimeComponentApiRegistryEntry } from './componentApiContracts';
import type { ComponentContractRule } from './componentRules';
export type ContractArtifactHint = { figmaKey?: string | null; componentName?: string | null; displayName?: string | null; sourceFile?: string | null };
export type RuntimeComponentRuleRegistryEntry = { componentKey:string; packageName?:string; aliases:string[]; figmaKeys:string[]; rulesFile:{componentKey:string;rules:ComponentContractRule[]} };
export type RuntimeCompositionRegistryEntry = { contract: any; aliases:string[] };
import { normalizePath } from '../reference/referenceList';
import { validateRemoteContractIndex, type RemoteContractPackage, type ContractCoveragePolicy } from './contractIndex';

const artifactRoles = ['generatedContract', 'rules', 'composition', 'overrides', 'agentContext', 'auditMapping'] as const;
type ArtifactRole = typeof artifactRoles[number];
export type NormalizedAuditPolicyPackage = {
  indexEntry: RemoteContractPackage;
  aliases: string[];
  loadedArtifacts: Record<ArtifactRole, boolean>;
  apiEntry: RuntimeComponentApiRegistryEntry | null;
  rulesEntry: RuntimeComponentRuleRegistryEntry | null;
  compositionEntry: RuntimeCompositionRegistryEntry | null;
  agentContext: RuntimeComponentAgentContext | null;
  auditMapping: any | null;
};
let packageStates: NormalizedAuditPolicyPackage[] = [];
let defaultCoveragePolicy: ContractCoveragePolicy | null = null;
let ready = false;
declare global {
 var __APOLLO_TEST_REMOTE_COMPONENT_RULE_REGISTRY__: RuntimeComponentRuleRegistryEntry[] | undefined;
 var __APOLLO_TEST_REMOTE_COMPONENT_API_REGISTRY__: RuntimeComponentApiRegistryEntry[] | undefined;
 var __APOLLO_TEST_REMOTE_COMPOSITION_CONTRACT_REGISTRY__: RuntimeCompositionRegistryEntry[] | undefined;
 var __APOLLO_TEST_REMOTE_AGENT_CONTEXTS__: RuntimeComponentAgentContext[] | undefined;
 var __APOLLO_TEST_REMOTE_AUDIT_PRESENTATIONS__: Array<{componentKey:string;property:string;presentation:RuntimeAuditPresentation}> | undefined;
}
/** Existing V3 evaluators consume normalized packaged policy, never V4 contracts. */
export function setNormalizedAuditPolicies(value: any): void {
  clearNormalizedAuditPolicies();
  if (!value || value.schemaVersion !== 'apollo.v3-audit-policies.v1' || !Array.isArray(value.packages)) {
    throw Error('AUDIT_RULE_DATA_INVALID');
  }
  // Reuse the V3 index validator: preserve coverage defaults, unique identities
  // and required artifact declarations instead of accepting an empty policy row.
  let index;
  try {
    index = validateRemoteContractIndex({
      schemaVersion: 2, documentType: 'component-contract-index',
      coverage: value.coverage, packages: value.packages.map((row: any) => row?.indexEntry),
    });
  } catch (_error) { throw Error('AUDIT_RULE_DATA_INVALID'); }
  const states = value.packages.map((row: any, i: number) => {
    const entry = index.packages[i];
    if (!Array.isArray(row.aliases) || !row.aliases.every((v: any) => typeof v === 'string' && v.trim()) ||
        !row.loadedArtifacts || artifactRoles.some(role => typeof row.loadedArtifacts[role] !== 'boolean') ||
        ['apiEntry', 'rulesEntry', 'compositionEntry', 'agentContext', 'auditMapping'].some(field =>
          !Object.prototype.hasOwnProperty.call(row, field) || row[field] !== null && (typeof row[field] !== 'object' || Array.isArray(row[field])))) {
      throw Error('AUDIT_RULE_DATA_INVALID');
    }
    for (const role of artifactRoles) {
      if (row.loadedArtifacts[role] && !entry.artifacts[role]) throw Error('AUDIT_RULE_DATA_INVALID');
    }
    if (row.apiEntry && (!row.loadedArtifacts.generatedContract || row.apiEntry.packageComponentKey !== entry.componentKey ||
        !sameKeys(row.apiEntry.figmaKeys, entry.figmaKeys) || !Array.isArray(row.apiEntry.contracts) || !row.apiEntry.contracts.length)) {
      throw Error('AUDIT_RULE_DATA_INVALID');
    }
    if (row.apiEntry) {
      const keys = new Set<string>();
      for (const api of row.apiEntry.contracts) {
        if (typeof api?.componentKey !== 'string' || !Array.isArray(api.figma?.variants?.variantKeys)) throw Error('AUDIT_RULE_DATA_INVALID');
        keys.add(api.componentKey);
        for (const variant of api.figma.variants.variantKeys) {
          if (typeof variant?.key !== 'string') throw Error('AUDIT_RULE_DATA_INVALID');
          keys.add(variant.key);
        }
      }
      if (entry.figmaKeys.some(key => !keys.has(key))) throw Error('AUDIT_RULE_DATA_INVALID');
    }
    if (row.rulesEntry && (!row.loadedArtifacts.rules || row.rulesEntry.componentKey !== entry.componentKey ||
        row.rulesEntry.rulesFile?.componentKey !== entry.componentKey || !sameKeys(row.rulesEntry.figmaKeys, entry.figmaKeys) ||
        !Array.isArray(row.rulesEntry.rulesFile.rules))) throw Error('AUDIT_RULE_DATA_INVALID');
    if (row.compositionEntry && (!row.loadedArtifacts.composition || !row.compositionEntry.contract || !Array.isArray(row.compositionEntry.aliases))) {
      throw Error('AUDIT_RULE_DATA_INVALID');
    }
    if (row.agentContext && (!row.loadedArtifacts.agentContext || row.agentContext.componentKey !== entry.componentKey)) throw Error('AUDIT_RULE_DATA_INVALID');
    if (row.auditMapping && !row.loadedArtifacts.auditMapping) throw Error('AUDIT_RULE_DATA_INVALID');
    return Object.assign({}, row, {indexEntry: entry});
  });
  packageStates = JSON.parse(JSON.stringify(states));
  defaultCoveragePolicy = index.coverage.defaultPolicy;
  ready = true;
}

function sameKeys(actual: unknown, expected: string[]): boolean {
  return Array.isArray(actual) && actual.length === expected.length && new Set(actual).size === expected.length && expected.every(key => actual.includes(key));
}

export function assertAuditPoliciesReady(): void {
  if (!ready) throw Error('AUDIT_RULE_DATA_UNAVAILABLE');
}
export function clearNormalizedAuditPolicies(): void {
  ready = false; packageStates = []; defaultCoveragePolicy = null;
}

/** V3 coverage gate, using actual native/catalog hints, including local dependencies. */
export function assertAuditPolicyCoverage(hints: ContractArtifactHint[]): void {
  assertAuditPoliciesReady();
  if (hints.length && !packageStates.length) throw Error('AUDIT_RULE_INDEX_UNAVAILABLE');
  for (const hint of hints) {
    const state = resolvePackageForHint(hint);
    if (!state) {
      if (defaultCoveragePolicy === 'required') throw Error('AUDIT_REQUIRED_RULE_PACKAGE_MISSING');
      continue;
    }
    const entry = state.indexEntry;
    if (entry.coverage !== 'required') continue;
    if (artifactRoles.some(role => entry.artifacts[role] && !state.loadedArtifacts[role]) ||
        !state.apiEntry || !state.compositionEntry) throw Error('AUDIT_REQUIRED_RULE_ARTIFACT_UNAVAILABLE');
    // A successfully read rules[] may be empty: the V3 compiler returns null.
    // That is valid only with an explicit loaded flag, unlike an unread source.
  }
}

// Same priority as the V3 resolver: Figma key, catalog path, then unique alias.
function resolvePackageForHint(hint: ContractArtifactHint): NormalizedAuditPolicyPackage | null {
  if (hint.figmaKey) {
    const state = packageStates.find(state => state.indexEntry.figmaKeys.includes(hint.figmaKey!));
    if (state) return state;
  }
  if (hint.sourceFile) {
    const source = normalizePath(hint.sourceFile).toLowerCase();
    const state = packageStates.find(state => normalizePath(state.indexEntry.sourceCatalogPath ?? '').toLowerCase() === source);
    if (state) return state;
  }
  const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
  const names = [hint.componentName ?? '', hint.displayName ?? ''].map(normalize).filter(Boolean);
  const matches = packageStates.filter(state => state.aliases.some(alias => names.includes(normalize(alias))));
  if (matches.length > 1) throw Error('AUDIT_RULE_PACKAGE_ALIAS_AMBIGUOUS');
  return matches[0] ?? null;
}

export function getRemoteComponentRuleRegistry():
  RuntimeComponentRuleRegistryEntry[] {
  if (Array.isArray(globalThis.__APOLLO_TEST_REMOTE_COMPONENT_RULE_REGISTRY__)) {
    return globalThis.__APOLLO_TEST_REMOTE_COMPONENT_RULE_REGISTRY__;
  }
  assertAuditPoliciesReady();
  return packageStates
    .filter((state) => state.indexEntry.coverage !== 'none' && state.loadedArtifacts.rules)
    .map((state) => state.rulesEntry)
    .filter((entry): entry is RuntimeComponentRuleRegistryEntry => entry !== null);
}

export function getRemoteComponentApiRegistry(): RuntimeComponentApiRegistryEntry[] {
  if (Array.isArray(globalThis.__APOLLO_TEST_REMOTE_COMPONENT_API_REGISTRY__)) {
    return globalThis.__APOLLO_TEST_REMOTE_COMPONENT_API_REGISTRY__;
  }
  assertAuditPoliciesReady();
  return packageStates
    .filter((state) => state.indexEntry.coverage !== 'none' && state.loadedArtifacts.generatedContract)
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
  assertAuditPoliciesReady();
  return packageStates
    .filter((state) => state.indexEntry.coverage !== 'none' && state.loadedArtifacts.composition)
    .map((state) => state.compositionEntry)
    .filter((entry): entry is RuntimeCompositionRegistryEntry => entry !== null);
}

export function getRemoteComponentAgentContexts(): RuntimeComponentAgentContext[] {
  if (Array.isArray(globalThis.__APOLLO_TEST_REMOTE_AGENT_CONTEXTS__)) {
    return globalThis.__APOLLO_TEST_REMOTE_AGENT_CONTEXTS__;
  }
  assertAuditPoliciesReady();
  return packageStates
    .filter((state) => state.indexEntry.coverage !== 'none' && state.loadedArtifacts.agentContext)
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
  assertAuditPoliciesReady();
  const contexts = packageStates
    .filter((state) => {
      const entry = state.indexEntry;
      return (
        state.indexEntry.coverage !== 'none' && state.loadedArtifacts.agentContext &&
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
  assertAuditPoliciesReady();
  for (const state of packageStates) {
    if (state.indexEntry.coverage === 'none' || !state.loadedArtifacts.auditMapping) continue;
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

