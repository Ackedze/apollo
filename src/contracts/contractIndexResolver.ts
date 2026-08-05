import { normalizePath } from '../reference/referenceList';
import type { RemoteContractPackage } from './contractIndex';

export type ContractArtifactHint = {
  figmaKey?: string | null;
  componentName?: string | null;
  displayName?: string | null;
  sourceFile?: string | null;
};

export type ResolvableContractPackage = {
  indexEntry: RemoteContractPackage;
  aliases: string[];
};

export type ContractPackageArtifactPaths = {
  rules: string;
  composition: string;
  overrides: string;
  agentContext: string;
  auditMapping: string;
  examples: string;
};

export function buildContractPackageAliases(
  entry: RemoteContractPackage,
): string[] {
  const aliases = new Set<string>();
  addAlias(aliases, entry.packageName);
  addAlias(aliases, entry.componentKey);
  for (const alias of entry.aliases ?? []) {
    addAlias(aliases, alias);
  }
  return Array.from(aliases);
}

export function resolveContractPackageForHint<
  TPackage extends ResolvableContractPackage,
>(
  packages: readonly TPackage[],
  hint: ContractArtifactHint,
): TPackage | null {
  const figmaKey = hint.figmaKey ?? '';
  if (figmaKey) {
    const match = packages.find((state) =>
      state.indexEntry.figmaKeys.includes(figmaKey),
    );
    if (match) return match;
  }

  const sourceFile = normalizeComparablePath(hint.sourceFile ?? '');
  if (sourceFile) {
    const match = packages.find(
      (state) =>
        normalizeComparablePath(state.indexEntry.sourceCatalogPath ?? '') ===
        sourceFile,
    );
    if (match) return match;
  }

  const names = new Set(
    [hint.componentName ?? '', hint.displayName ?? '']
      .map(normalizeAlias)
      .filter(Boolean),
  );
  if (!names.size) return null;
  const matches = packages.filter((state) =>
    state.aliases.some((alias) => names.has(normalizeAlias(alias))),
  );
  if (matches.length > 1) {
    throw new Error(
      `Apollo strict mode: ambiguous contract package alias for ${describeContractArtifactHint(hint)}: ${matches
        .map((state) => state.indexEntry.componentKey)
        .join(', ')}`,
    );
  }
  return matches[0] ?? null;
}

export function resolveContractPackageArtifactPaths(
  entry: RemoteContractPackage,
): ContractPackageArtifactPaths {
  return {
    rules: getContractPackageArtifactPath(
      entry,
      entry.rulesPath ?? entry.rulesFile ?? entry.artifacts.rules ?? '',
    ),
    composition: getContractPackageArtifactPath(
      entry,
      entry.compositionPath ??
        entry.compositionFile ??
        entry.artifacts.composition ??
        '',
    ),
    overrides: getContractPackageArtifactPath(
      entry,
      entry.artifacts.overrides ?? '',
    ),
    agentContext: getContractPackageArtifactPath(
      entry,
      entry.agentContextPath ?? entry.artifacts.agentContext ?? '',
    ),
    auditMapping: getContractPackageArtifactPath(
      entry,
      entry.artifacts.auditMapping ?? '',
    ),
    examples: getContractPackageArtifactPath(
      entry,
      entry.artifacts.examples ?? '',
    ),
  };
}

export function getContractPackageArtifactPath(
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

export function describeContractArtifactHint(
  hint: ContractArtifactHint,
): string {
  return (
    hint.figmaKey ??
    hint.sourceFile ??
    hint.componentName ??
    hint.displayName ??
    'unknown component'
  );
}

function addAlias(
  aliases: Set<string>,
  value: string | null | undefined,
): void {
  if (value) aliases.add(value);
}

function normalizeAlias(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeComparablePath(value: string): string {
  return normalizePath(value).toLowerCase();
}
