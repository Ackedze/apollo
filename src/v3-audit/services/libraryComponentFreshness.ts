export type LibraryComponentFreshnessStatus =
  | 'current'
  | 'update-available'
  | 'not-applicable'
  | 'unknown';

export type LibraryComponentFreshnessReason =
  | 'remote-component-current'
  | 'remote-component-update-available'
  | 'local-component'
  | 'instance-sublayer'
  | 'main-component-unavailable'
  | 'component-key-missing'
  | 'component-import-failed'
  | 'component-key-mismatch';

export type LibraryComponentFreshnessScope =
  | 'independent-instance'
  | 'projected-slot-root'
  | 'instance-sublayer';

export interface LibraryNodeAncestor {
  readonly type: string;
  readonly parent: LibraryNodeAncestor | null;
}

export interface LibraryInstanceScopeReader {
  readonly parent: LibraryNodeAncestor | null;
}

export interface LibraryComponentIdentity {
  id: string;
  key: string;
  remote: boolean;
}

export interface LibraryInstanceIdentityReader {
  getMainComponentAsync(): Promise<LibraryComponentIdentity | null>;
}

export interface LibraryComponentFreshness {
  status: LibraryComponentFreshnessStatus;
  reason: LibraryComponentFreshnessReason;
  componentKey: string | null;
  currentComponentId: string | null;
  latestComponentId: string | null;
}

export interface LibraryComponentFreshnessChecker {
  check(
    instance: LibraryInstanceIdentityReader,
    scope?: LibraryComponentFreshnessScope,
  ): Promise<LibraryComponentFreshness>;
  getStats(): LibraryComponentFreshnessStats;
}

export interface LibraryComponentFreshnessStats {
  checks: number;
  importCacheHits: number;
  importCacheMisses: number;
}

type ImportPublishedComponent = (
  componentKey: string,
) => Promise<LibraryComponentIdentity>;

export function createLibraryComponentFreshnessChecker(
  importPublishedComponent: ImportPublishedComponent,
): LibraryComponentFreshnessChecker {
  const latestByKey = new Map<
    string,
    Promise<LibraryComponentIdentity>
  >();
  let checks = 0;
  let importCacheHits = 0;
  let importCacheMisses = 0;

  const importLatest = (
    componentKey: string,
  ): Promise<LibraryComponentIdentity> => {
    const cached = latestByKey.get(componentKey);
    if (cached) {
      importCacheHits += 1;
      return cached;
    }

    importCacheMisses += 1;
    const pending = importPublishedComponent(componentKey);
    latestByKey.set(componentKey, pending);
    return pending;
  };

  return {
    async check(
      instance: LibraryInstanceIdentityReader,
      scope: LibraryComponentFreshnessScope = 'independent-instance',
    ): Promise<LibraryComponentFreshness> {
      checks += 1;
      if (scope === 'instance-sublayer') {
        return freshnessResult(
          'not-applicable',
          'instance-sublayer',
          null,
          null,
          null,
        );
      }

      let current: LibraryComponentIdentity | null = null;
      try {
        current = await instance.getMainComponentAsync();
      } catch (_error) {
        return freshnessResult(
          'unknown',
          'main-component-unavailable',
          null,
          null,
          null,
        );
      }

      if (!current) {
        return freshnessResult(
          'unknown',
          'main-component-unavailable',
          null,
          null,
          null,
        );
      }

      if (!current.remote) {
        return freshnessResult(
          'not-applicable',
          'local-component',
          current.key || null,
          current.id,
          null,
        );
      }

      const componentKey = current.key.trim();
      if (!componentKey) {
        return freshnessResult(
          'unknown',
          'component-key-missing',
          null,
          current.id,
          null,
        );
      }

      let latest: LibraryComponentIdentity;
      try {
        latest = await importLatest(componentKey);
      } catch (_error) {
        return freshnessResult(
          'unknown',
          'component-import-failed',
          componentKey,
          current.id,
          null,
        );
      }

      if (latest.key !== componentKey) {
        return freshnessResult(
          'unknown',
          'component-key-mismatch',
          componentKey,
          current.id,
          latest.id,
        );
      }

      if (latest.id !== current.id) {
        return freshnessResult(
          'update-available',
          'remote-component-update-available',
          componentKey,
          current.id,
          latest.id,
        );
      }

      return freshnessResult(
        'current',
        'remote-component-current',
        componentKey,
        current.id,
        latest.id,
      );
    },
    getStats(): LibraryComponentFreshnessStats {
      return {
        checks,
        importCacheHits,
        importCacheMisses,
      };
    },
  };
}

export function getLibraryComponentFreshnessScope(
  node: LibraryInstanceScopeReader,
): LibraryComponentFreshnessScope {
  let ancestor = node.parent;
  while (ancestor) {
    if (ancestor.type === 'SLOT') return 'projected-slot-root';
    if (ancestor.type === 'INSTANCE') return 'instance-sublayer';
    ancestor = ancestor.parent;
  }
  return 'independent-instance';
}

function freshnessResult(
  status: LibraryComponentFreshnessStatus,
  reason: LibraryComponentFreshnessReason,
  componentKey: string | null,
  currentComponentId: string | null,
  latestComponentId: string | null,
): LibraryComponentFreshness {
  return {
    status,
    reason,
    componentKey,
    currentComponentId,
    latestComponentId,
  };
}
