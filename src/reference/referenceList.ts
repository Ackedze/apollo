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
  baseUrl?: string;
  catalogs?: RemoteReferenceCatalogEntry[];
  libraries?: RemoteReferenceLibrary[];
};

export const apolloReferenceCatalogListUrl =
  'https://ackedze.github.io/design-system_ab/JSONS/referenceSourcesMVP.json';

export function buildReferenceCatalogSources(
  payload: RemoteReferenceCatalogList,
): ReferenceCatalogSource[] {
  const baseUrl = (payload.baseUrl ?? '').trim();
  const entries = normalizeCatalogEntries(payload);
  
  return entries.map((entry, index) => ({
    id: entry.id ?? `catalog${index}`,
    fileName: entry.fileName,
    path: normalizePath(entry.path),
    url: resolveCatalogUrl(baseUrl, entry.path),
    kind: inferCatalogKind(entry),
    indexUrl: buildIndexUrl(baseUrl, entry),
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
): string | undefined {
  if (inferCatalogKind(entry) !== 'components') {
    return undefined;
  }

  const explicitIndexPath = entry.source?.indexPath;
  if (explicitIndexPath) {
    return resolveCatalogUrl(baseUrl, explicitIndexPath);
  }

  if (!/design-system_ab/i.test(baseUrl)) {
    return undefined;
  }

  const normalizedPath = normalizePath(entry.path);
  const indexPath = `indexes/${normalizedPath.replace(/\.json$/i, '.index.json')}`;
  return resolveCatalogUrl(baseUrl, indexPath);
}

function resolveCatalogUrl(baseUrl: string, path: string): string {
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
