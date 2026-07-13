export type ReferenceCatalogSource = {
  id: string;
  fileName: string;
  path: string;
  url: string;
  kind: 'components' | 'tokens' | 'styles' | 'unknown';
  indexUrl?: string;
};

type RemoteReferenceCatalogEntry = {
  id?: string;
  fileName: string;
  path: string;
  source?: {
    kind?: string;
    pageName?: string;
    indexPath?: string;
  };
};

type RemoteReferenceLibrary = {
  name?: string;
  catalogs?: RemoteReferenceCatalogEntry[];
  source?: Record<string, unknown>;
};

export type RemoteReferenceCatalogList = {
  schemaVersion?: number;
  generatedAt?: string;
  baseUrl?: string;
  apollo?: {
    patternRulesPath?: string;
    componentContractIndexPath?: string;
    contractsManifestPath?: string;
  };
  catalogs?: RemoteReferenceCatalogEntry[];
  libraries?: RemoteReferenceLibrary[];
};

export function resolvePatternRulesUrl(
  payload: RemoteReferenceCatalogList,
): string {
  const path = payload.apollo?.patternRulesPath?.trim();
  if (!path) {
    throw new Error('referenceSourcesMVP.json does not define apollo.patternRulesPath');
  }
  return resolveCatalogUrl((payload.baseUrl ?? '').trim(), path);
}

export function resolveComponentContractIndexUrl(
  payload: RemoteReferenceCatalogList,
): string | null {
  const path = (
    payload.apollo?.componentContractIndexPath ??
    payload.apollo?.contractsManifestPath ??
    ''
  ).trim();
  if (!path) {
    return null;
  }
  return resolveCatalogUrl((payload.baseUrl ?? '').trim(), path);
}

export function getReferenceCatalogBaseUrl(
  payload: RemoteReferenceCatalogList,
): string {
  return (payload.baseUrl ?? '').trim();
}

export const apolloReferenceCatalogListUrl =
  'https://ackedze.github.io/design-system_ab/JSONS/referenceSourcesMVP.json';

export function buildReferenceCatalogSources(
  payload: RemoteReferenceCatalogList,
): ReferenceCatalogSource[] {
  const baseUrl = (payload.baseUrl ?? '').trim();
  const entries = normalizeCatalogEntries(payload);
  const requireExplicitIndexPath = (payload.schemaVersion ?? 0) >= 2;
  
  return entries.map((entry, index) => ({
    id: entry.id ?? `catalog${index}`,
    fileName: entry.fileName,
    path: normalizePath(entry.path),
    url: resolveCatalogUrl(baseUrl, entry.path),
    kind: inferCatalogKind(entry),
    indexUrl: buildIndexUrl(baseUrl, entry, requireExplicitIndexPath),
  }));
}

function normalizeCatalogEntries(
  payload: RemoteReferenceCatalogList,
): RemoteReferenceCatalogEntry[] {
  const flatCatalogs = Array.isArray(payload.catalogs) ? payload.catalogs : [];
  const libraryCatalogs: RemoteReferenceCatalogEntry[] = [];

  if (Array.isArray(payload.libraries)) {
    for (const library of payload.libraries) {
      const catalogs = Array.isArray(library.catalogs) ? library.catalogs : [];
      for (const entry of catalogs) {
        libraryCatalogs.push(entry);
      }
    }
  }

  return flatCatalogs.concat(libraryCatalogs);
}

function inferCatalogKind(
  entry: RemoteReferenceCatalogEntry,
): ReferenceCatalogSource['kind'] {
  const explicitKind = entry.source?.kind;
  if (
    explicitKind === 'components' ||
    explicitKind === 'tokens' ||
    explicitKind === 'styles'
  ) {
    return explicitKind;
  }

  const path = normalizePath(entry.path || entry.fileName).toLowerCase();
  if (path.startsWith('tokens/') || path.includes('/tokens/')) {
    return 'tokens';
  }
  if (path.startsWith('styles/') || path.includes('/styles/')) {
    return 'styles';
  }
  if (path.endsWith('.json')) {
    return 'components';
  }
  return 'unknown';
}

function buildIndexUrl(
  baseUrl: string,
  entry: RemoteReferenceCatalogEntry,
  requireExplicitIndexPath: boolean,
): string | undefined {
  if (inferCatalogKind(entry) !== 'components') {
    return undefined;
  }

  const explicitIndexPath = entry.source?.indexPath;
  if (explicitIndexPath) {
    return resolveCatalogUrl(baseUrl, explicitIndexPath);
  }

  if (requireExplicitIndexPath) {
    return undefined;
  }

  if (!/design-system_ab/i.test(baseUrl)) {
    return undefined;
  }

  const normalizedPath = normalizePath(entry.path);
  if (isKnownNonCatalogArtifactPath(normalizedPath)) {
    return undefined;
  }
  const indexPath = `indexes/${normalizedPath.replace(/\.json$/i, '.index.json')}`;
  return resolveCatalogUrl(baseUrl, indexPath);
}

function isKnownNonCatalogArtifactPath(value: string): boolean {
  const fileName = value.split('/').pop()?.toLowerCase() ?? '';
  if (
    fileName === 'agent-context.json' ||
    fileName === 'audit-mapping.json' ||
    fileName === 'composition-contract.json' ||
    fileName === 'contract.generated.json' ||
    fileName === 'contract.overrides.json' ||
    fileName === 'examples.json' ||
    fileName === 'rules.json' ||
    fileName === 'componentcontractindex.json'
  ) {
    return true;
  }
  return fileName.startsWith('apollo-') || fileName.startsWith('patternrules');
}

export function resolveCatalogUrl(baseUrl: string, path: string): string {
  if (!path) return baseUrl;
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  if (!baseUrl) {
    return encodePath(path);
  }
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return `${normalizedBase}${encodePath(normalizedPath)}`;
}

function encodePath(value: string): string {
  if (!value) return '';
  return normalizePath(value)
    .split(/[\\/]/)
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function normalizePath(value: string): string {
  return (value ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^JSONS\//i, '')
    .trim();
}
