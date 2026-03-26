export type ReferenceCatalogSource = {
  id: string;
  fileName: string;
  url: string;
};

type RemoteReferenceCatalogEntry = {
  id?: string;
  fileName: string;
  path: string;
};

export type RemoteReferenceCatalogList = {
  baseUrl?: string;
  catalogs: RemoteReferenceCatalogEntry[];
};

export const apolloReferenceCatalogListUrl =
  'https://ackedze.github.io/apollo/JSONS/referenceSourcesMVP.json';

export function buildReferenceCatalogSources(
  payload: RemoteReferenceCatalogList,
): ReferenceCatalogSource[] {
  const baseUrl = (payload.baseUrl ?? '').trim();
  
  return (payload.catalogs ?? []).map((entry, index) => ({
    id: entry.id ?? `catalog${index}`,
    fileName: entry.fileName,
    url: resolveCatalogUrl(baseUrl, entry.path),
  }));
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
  return value
    .split(/[\\/]/)
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}
