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
  baseUrl?: string;
  catalogs?: RemoteReferenceCatalogEntry[];
  source?: Record<string, unknown>;
};

export type RemoteReferenceCatalogManifest = {
  url: string;
};

export type RemoteReferenceCatalogList = {
  schemaVersion?: number;
  generatedAt?: string;
  baseUrl?: string;
  catalogManifests?: RemoteReferenceCatalogManifest[];
  apollo?: {
    patternRulesPath?: string;
    componentContractIndexPath?: string;
    experimentalComponentContractIndexPath?: string;
    contractsManifestPath?: string;
    remediationConfigPath?: string;
    auditPolicyConfigPath?: string;
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

export function resolveExperimentalComponentContractIndexUrl(
  payload: RemoteReferenceCatalogList,
): string | null {
  const path = payload.apollo?.experimentalComponentContractIndexPath?.trim();
  return path
    ? resolveCatalogUrl((payload.baseUrl ?? '').trim(), path)
    : null;
}

export function resolveRemediationConfigUrl(
  payload: RemoteReferenceCatalogList,
): string | null {
  const path = payload.apollo?.remediationConfigPath?.trim();
  if (!path) {
    return null;
  }
  return resolveCatalogUrl((payload.baseUrl ?? '').trim(), path);
}

export function resolveAuditPolicyConfigUrl(
  payload: RemoteReferenceCatalogList,
): string | null {
  const path = payload.apollo?.auditPolicyConfigPath?.trim();
  if (!path) return null;
  return resolveCatalogUrl((payload.baseUrl ?? '').trim(), path);
}

export function getReferenceCatalogBaseUrl(
  payload: RemoteReferenceCatalogList,
): string {
  return (payload.baseUrl ?? '').trim();
}

export const apolloReferenceCatalogListUrl =
  'https://raw.githubusercontent.com/Ackedze/design-system_ab/main/JSONS/referenceSourcesMVP.json';

export function buildReferenceCatalogSources(
  payload: RemoteReferenceCatalogList,
): ReferenceCatalogSource[] {
  if (payload.schemaVersion !== undefined) {
    validateReferenceCatalogList(payload);
  }
  const baseUrl = (payload.baseUrl ?? '').trim();
  const entries = normalizeCatalogEntries(payload);

  return entries.map(({ entry, baseUrl: entryBaseUrl }, index) => ({
    id: entry.id ?? `catalog${index}`,
    fileName: entry.fileName,
    path: normalizePath(entry.path),
    url: resolveCatalogUrl(entryBaseUrl || baseUrl, entry.path),
    kind: inferCatalogKind(entry),
    indexUrl: buildIndexUrl(entryBaseUrl || baseUrl, entry),
  }));
}

export function resolveCatalogManifestUrls(
  payload: RemoteReferenceCatalogList,
): string[] {
  if (!Array.isArray(payload.catalogManifests)) return [];
  return payload.catalogManifests.map((entry, index) => {
    const url = entry?.url?.trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      throw new Error(`Reference manifest catalogManifests[${index}].url must be an absolute HTTP(S) URL`);
    }
    return url;
  });
}

export function validateReferenceCatalogList(
  payload: RemoteReferenceCatalogList,
): void {
  if (payload.schemaVersion !== 2) {
    throw new Error(
      `Unsupported reference manifest schemaVersion: ${String(payload.schemaVersion)}`,
    );
  }
  if (!/^https?:\/\//i.test((payload.baseUrl ?? '').trim())) {
    throw new Error('Reference manifest baseUrl must be an absolute HTTP(S) URL');
  }

  const entries = normalizeCatalogEntries(payload);
  const nestedManifestUrls = resolveCatalogManifestUrls(payload);
  if (!entries.length && !nestedManifestUrls.length) {
    throw new Error('Reference manifest does not contain catalogs');
  }

  const paths = new Set<string>();
  for (const [index, normalized] of entries.entries()) {
    const entry = normalized.entry;
    const entryPath = normalizePath(entry.path);
    if (!entryPath || !entry.fileName) {
      throw new Error(`Reference manifest catalog[${index}] requires fileName and path`);
    }
    if (paths.has(entryPath)) {
      throw new Error(`Reference manifest contains duplicate catalog path: ${entryPath}`);
    }
    paths.add(entryPath);

    const kind = entry.source?.kind;
    if (kind !== 'components' && kind !== 'tokens' && kind !== 'styles') {
      throw new Error(`Reference manifest catalog ${entryPath} has invalid source.kind`);
    }
    if (kind === 'components' && !normalizePath(entry.source?.indexPath ?? '')) {
      throw new Error(`Reference manifest component catalog has no indexPath: ${entryPath}`);
    }
  }
}

function normalizeCatalogEntries(
  payload: RemoteReferenceCatalogList,
): Array<{ entry: RemoteReferenceCatalogEntry; baseUrl: string }> {
  const manifestBaseUrl = (payload.baseUrl ?? '').trim();
  const flatCatalogs = (Array.isArray(payload.catalogs) ? payload.catalogs : []).map(
    (entry) => ({ entry, baseUrl: manifestBaseUrl }),
  );
  const libraryCatalogs: Array<{
    entry: RemoteReferenceCatalogEntry;
    baseUrl: string;
  }> = [];

  if (Array.isArray(payload.libraries)) {
    for (const library of payload.libraries) {
      const libraryBaseUrl = (library.baseUrl ?? manifestBaseUrl).trim();
      if (library.baseUrl !== undefined && !/^https?:\/\//i.test(libraryBaseUrl)) {
        throw new Error(`Reference manifest library ${library.name ?? ''} has invalid baseUrl`);
      }
      const catalogs = Array.isArray(library.catalogs) ? library.catalogs : [];
      for (const entry of catalogs) {
        libraryCatalogs.push({ entry, baseUrl: libraryBaseUrl });
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
