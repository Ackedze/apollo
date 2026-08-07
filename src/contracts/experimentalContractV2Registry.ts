import { resolveCatalogUrl } from '../reference/referenceList';
import { appendCacheBustingQuery, fetchDirect } from '../utils/networkFetch';

export type ExperimentalContractV2Package = {
  id: string;
  family: string;
  library: string;
  contractPath: string;
  componentKeys: string[];
  aliases: string[];
  coverage: {
    executableDeterministicSourceRules: number;
    deterministicSourceRules: number;
    unsupported: number;
  };
};

export type ExperimentalContractV2 = {
  schemaVersion: 'apollo.component-contract.v2-experimental';
  documentType: 'component-contract';
  status: string;
  package: {
    id: string;
    family: string;
    library: string;
  };
  capabilities: {
    selectors: string[];
    facts: string[];
    operators: string[];
    remediations: string[];
    unknownCapabilityPolicy: string;
    missingEvidencePolicy: string;
  };
  facts: {
    componentApi: Array<{
      id: string;
      name: string;
      componentKey: string;
      componentKeys?: string[];
      publicApi: {
        properties: Record<string, string[]>;
        allowedCombinations: Array<Record<string, string>>;
      };
    }>;
    selectors: Record<string, unknown>;
    [key: string]: unknown;
  };
  rules: ExperimentalRuleV2[];
  nonExecutableRules: unknown[];
  coverage: {
    summary: Record<string, number>;
  };
};

export type ExperimentalRuleV2 = {
  id: string;
  severity: 'info' | 'warning' | 'error';
  enforcement: 'enforced' | 'classification';
  select: { host: unknown; targets: unknown };
  when: Record<string, unknown>;
  assert: Record<string, unknown> & { op: string };
  verdict: Record<string, string>;
  evidence: string[];
  remediation: Record<string, unknown> | null;
  presentation: { message?: string; group?: string };
  capabilities: {
    selectors: string[];
    facts: string[];
    operators: string[];
    remediations: string[];
  };
};

type ExperimentalContractV2Index = {
  schemaVersion: 'apollo.component-contract-index.v2-experimental';
  documentType: 'component-contract-index';
  status: 'experimental';
  baseUrl: string;
  runtimePolicy: {
    defaultEnabled: false;
    unsupportedRule: 'skip-with-diagnostics';
    unknownEvaluation: 'never-violation';
  };
  packages: ExperimentalContractV2Package[];
};

let indexUrl = '';
let fallbackBaseUrl = '';
let cacheBust = Date.now();
let indexPromise: Promise<void> | null = null;
let contractBaseUrl = '';
let packages: ExperimentalContractV2Package[] = [];
const packageByComponentKey = new Map<string, ExperimentalContractV2Package>();
const contractByPackageId = new Map<string, ExperimentalContractV2>();
const loadPromiseByPackageId = new Map<string, Promise<void>>();

export function configureExperimentalContractV2Source(
  nextIndexUrl: string | null,
  baseUrl: string,
): void {
  indexUrl = nextIndexUrl?.trim() ?? '';
  fallbackBaseUrl = baseUrl.trim();
  cacheBust = Date.now();
  indexPromise = null;
  contractBaseUrl = '';
  packages = [];
  packageByComponentKey.clear();
  contractByPackageId.clear();
  loadPromiseByPackageId.clear();
}

export async function ensureExperimentalContractV2ForKeys(
  componentKeys: Iterable<string>,
): Promise<void> {
  await ensureIndexLoaded();
  const matched = new Set<ExperimentalContractV2Package>();
  for (const componentKey of componentKeys) {
    const entry = packageByComponentKey.get(componentKey);
    if (entry) matched.add(entry);
  }
  await Promise.all(Array.from(matched, (entry) => ensurePackageLoaded(entry)));
  console.log('[Apollo][contracts-v2] artifacts ready', {
    requestedPackages: matched.size,
    loadedPackages: contractByPackageId.size,
    executableRules: Array.from(contractByPackageId.values()).reduce(
      (total, contract) => total + contract.rules.length,
      0,
    ),
    unsupportedRules: Array.from(contractByPackageId.values()).reduce(
      (total, contract) => total + contract.nonExecutableRules.length,
      0,
    ),
  });
}

export function getExperimentalContractV2ForKey(
  componentKey: string | null | undefined,
): ExperimentalContractV2 | null {
  if (!componentKey) return null;
  const entry = packageByComponentKey.get(componentKey);
  return entry ? contractByPackageId.get(entry.id) ?? null : null;
}

export function hasExperimentalContractV2ForKey(
  componentKey: string | null | undefined,
): boolean {
  return Boolean(componentKey && packageByComponentKey.has(componentKey));
}

export function getExperimentalContractV2Diagnostics(): {
  indexedPackages: number;
  indexedComponentKeys: number;
  loadedPackages: number;
} {
  return {
    indexedPackages: packages.length,
    indexedComponentKeys: packageByComponentKey.size,
    loadedPackages: contractByPackageId.size,
  };
}

async function ensureIndexLoaded(): Promise<void> {
  if (packages.length) return;
  if (!indexUrl) {
    throw new Error('Experimental Contract v2 index is not configured');
  }
  if (!indexPromise) {
    indexPromise = (async () => {
      const payload = validateIndex(
        JSON.parse(
          await fetchDirect(
            appendCacheBustingQuery(indexUrl, 'apolloContractV2Index', cacheBust),
          ),
        ),
      );
      contractBaseUrl = payload.baseUrl || fallbackBaseUrl;
      packages = payload.packages;
      for (const entry of packages) {
        for (const componentKey of entry.componentKeys) {
          if (packageByComponentKey.has(componentKey)) {
            throw new Error(`Duplicate Contract v2 component key: ${componentKey}`);
          }
          packageByComponentKey.set(componentKey, entry);
        }
      }
      console.log('[Apollo][contracts-v2] index loaded', {
        url: indexUrl,
        packageCount: packages.length,
        componentKeyCount: packageByComponentKey.size,
      });
    })().catch((error) => {
      indexPromise = null;
      throw error;
    });
  }
  await indexPromise;
}

async function ensurePackageLoaded(
  entry: ExperimentalContractV2Package,
): Promise<void> {
  if (contractByPackageId.has(entry.id)) return;
  let promise = loadPromiseByPackageId.get(entry.id);
  if (!promise) {
    promise = (async () => {
      const url = resolveCatalogUrl(contractBaseUrl, entry.contractPath);
      const contract = validateContract(
        JSON.parse(
          await fetchDirect(
            appendCacheBustingQuery(url, 'apolloContractV2', cacheBust),
          ),
        ),
        entry,
      );
      contractByPackageId.set(entry.id, contract);
    })().finally(() => loadPromiseByPackageId.delete(entry.id));
    loadPromiseByPackageId.set(entry.id, promise);
  }
  await promise;
}

function validateIndex(payload: unknown): ExperimentalContractV2Index {
  const value = asRecord(payload, 'Contract v2 index');
  if (value.schemaVersion !== 'apollo.component-contract-index.v2-experimental') {
    throw new Error('Unsupported experimental Contract v2 index');
  }
  if (value.documentType !== 'component-contract-index') {
    throw new Error('Invalid experimental Contract v2 index documentType');
  }
  const runtimePolicy = asRecord(value.runtimePolicy, 'runtimePolicy');
  if (
    runtimePolicy.defaultEnabled !== false ||
    runtimePolicy.unsupportedRule !== 'skip-with-diagnostics' ||
    runtimePolicy.unknownEvaluation !== 'never-violation'
  ) {
    throw new Error('Unsafe experimental Contract v2 runtime policy');
  }
  if (!Array.isArray(value.packages)) throw new Error('Contract v2 index has no packages');
  return value as ExperimentalContractV2Index;
}

function validateContract(
  payload: unknown,
  entry: ExperimentalContractV2Package,
): ExperimentalContractV2 {
  const value = asRecord(payload, `Contract v2 package ${entry.id}`);
  if (value.schemaVersion !== 'apollo.component-contract.v2-experimental') {
    throw new Error(`Unsupported Contract v2 package: ${entry.id}`);
  }
  const packageMeta = asRecord(value.package, `${entry.id}.package`);
  if (packageMeta.id !== entry.id) throw new Error(`Contract v2 package id mismatch: ${entry.id}`);
  if (!Array.isArray(value.rules) || !Array.isArray(value.nonExecutableRules)) {
    throw new Error(`Contract v2 package has invalid rule lists: ${entry.id}`);
  }
  return value as ExperimentalContractV2;
}

function asRecord(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, any>;
}
