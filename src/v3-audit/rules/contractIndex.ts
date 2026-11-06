export type ContractCoveragePolicy = 'required' | 'optional' | 'none';

export type RemoteContractPackage = {
  componentKey: string;
  packageName?: string;
  packagePath: string;
  baseUrl?: string;
  coverage: ContractCoveragePolicy;
  aliases?: string[];
  figmaKeys: string[];
  sourceCatalogPath?: string;
  artifacts: {
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

export type RemoteComponentContractIndex = {
  schemaVersion: 2;
  documentType: 'component-contract-index';
  baseUrl?: string;
  generatedAt?: string;
  coverage: {
    defaultPolicy: ContractCoveragePolicy;
  };
  packages: RemoteContractPackage[];
};

type JsonRecord = Record<string, unknown>;

export function validateRemoteContractIndex(
  payload: unknown,
): RemoteComponentContractIndex {
  const index = asRecord(payload, 'componentContractIndex.json');
  if (index.schemaVersion !== 2) {
    throw new Error('componentContractIndex.json must use schemaVersion 2');
  }
  if (index.documentType !== 'component-contract-index') {
    throw new Error('componentContractIndex.json has invalid documentType');
  }
  if (index.baseUrl !== undefined && !isAbsoluteHttpUrl(index.baseUrl)) {
    throw new Error('componentContractIndex.json baseUrl must be an absolute HTTP(S) URL');
  }
  const coverage = asRecord(index.coverage, 'componentContractIndex.json.coverage');
  const defaultPolicy = requireCoveragePolicy(
    coverage.defaultPolicy,
    'coverage.defaultPolicy',
  );
  if (!Array.isArray(index.packages)) {
    throw new Error('componentContractIndex.json requires packages[]');
  }

  const componentKeys = new Set<string>();
  const figmaKeys = new Set<string>();
  const sourceCatalogPaths = new Set<string>();
  const packages = index.packages.map((value, packageIndex) => {
    const label = `packages[${packageIndex}]`;
    const entry = asRecord(value, label);
    const componentKey = requireString(entry.componentKey, `${label}.componentKey`);
    if (componentKeys.has(componentKey)) {
      throw new Error(`componentContractIndex.json contains duplicate componentKey: ${componentKey}`);
    }
    componentKeys.add(componentKey);

    const policy = requireCoveragePolicy(entry.coverage, `${label}.coverage`);
    const packagePath = requireSafePath(entry.packagePath, `${label}.packagePath`);
    const artifacts = asRecord(entry.artifacts, `${label}.artifacts`);
    const normalizedArtifacts = normalizeArtifacts(artifacts, label);
    if (policy === 'required') {
      if (
        !normalizedArtifacts.generatedContract ||
        !normalizedArtifacts.rules ||
        !normalizedArtifacts.composition
      ) {
        throw new Error(
          `${label} requires generatedContract, rules and composition artifacts`,
        );
      }
    }

    if (!Array.isArray(entry.figmaKeys) || entry.figmaKeys.length === 0) {
      throw new Error(`${label}.figmaKeys must not be empty`);
    }
    const packageFigmaKeys = entry.figmaKeys.map((value) => {
      const figmaKey = requireString(value, `${label}.figmaKeys[]`);
      if (figmaKeys.has(figmaKey)) {
        throw new Error(`componentContractIndex.json contains duplicate Figma key: ${figmaKey}`);
      }
      figmaKeys.add(figmaKey);
      return figmaKey;
    });

    const sourceCatalogPath = optionalSafePath(
      entry.sourceCatalogPath,
      `${label}.sourceCatalogPath`,
    );
    if (sourceCatalogPath) {
      const comparablePath = sourceCatalogPath.toLowerCase();
      if (sourceCatalogPaths.has(comparablePath)) {
        throw new Error(
          `componentContractIndex.json contains duplicate sourceCatalogPath: ${sourceCatalogPath}`,
        );
      }
      sourceCatalogPaths.add(comparablePath);
    }

    return {
      componentKey,
      packageName: optionalString(entry.packageName, `${label}.packageName`),
      packagePath,
      baseUrl: optionalAbsoluteHttpUrl(entry.baseUrl, `${label}.baseUrl`),
      coverage: policy,
      aliases: optionalStringArray(entry.aliases, `${label}.aliases`),
      figmaKeys: packageFigmaKeys,
      sourceCatalogPath,
      artifacts: normalizedArtifacts,
      rulesPath: optionalSafePath(entry.rulesPath, `${label}.rulesPath`),
      rulesFile: optionalSafePath(entry.rulesFile, `${label}.rulesFile`),
      compositionPath: optionalSafePath(entry.compositionPath, `${label}.compositionPath`),
      compositionFile: optionalSafePath(entry.compositionFile, `${label}.compositionFile`),
      agentContextPath: optionalSafePath(entry.agentContextPath, `${label}.agentContextPath`),
    };
  });

  return {
    schemaVersion: 2,
    documentType: 'component-contract-index',
    baseUrl: optionalString(index.baseUrl, 'baseUrl'),
    generatedAt: optionalString(index.generatedAt, 'generatedAt'),
    coverage: { defaultPolicy },
    packages,
  };
}

function normalizeArtifacts(
  artifacts: JsonRecord,
  packageLabel: string,
): RemoteContractPackage['artifacts'] {
  const result: RemoteContractPackage['artifacts'] = {};
  const keys = [
    'rules',
    'composition',
    'agentContext',
    'auditMapping',
    'overrides',
    'generatedContract',
    'examples',
  ] as const;
  for (const key of keys) {
    const value = optionalSafePath(artifacts[key], `${packageLabel}.artifacts.${key}`);
    if (value) result[key] = value;
  }
  return result;
}

function asRecord(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function requireCoveragePolicy(
  value: unknown,
  label: string,
): ContractCoveragePolicy {
  if (value !== 'required' && value !== 'optional' && value !== 'none') {
    throw new Error(`${label} must be required, optional or none`);
  }
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requireString(value, label);
}

function requireSafePath(value: unknown, label: string): string {
  return assertSafePath(requireString(value, label), label);
}

function optionalSafePath(value: unknown, label: string): string | undefined {
  const result = optionalString(value, label);
  return result ? assertSafePath(result, label) : undefined;
}

function assertSafePath(value: string, label: string): string {
  const normalized = value.replace(/\\/g, '/');
  if (
    /^(?:https?:)?\/\//i.test(normalized) ||
    normalized.startsWith('/') ||
    normalized.split('/').includes('..')
  ) {
    throw new Error(`${label} must be a safe relative path`);
  }
  return normalized;
}

function optionalStringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((item) => requireString(item, `${label}[]`));
}

function optionalAbsoluteHttpUrl(value: unknown, label: string): string | undefined {
  const result = optionalString(value, label);
  if (result !== undefined && !isAbsoluteHttpUrl(result)) {
    throw new Error(`${label} must be an absolute HTTP(S) URL`);
  }
  return result;
}

function isAbsoluteHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}
