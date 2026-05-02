export type ComponentKeyCacheOptions = {
  retryIfMissing?: boolean;
};

export async function resolveCachedComponentKey(
  nodeId: string,
  cache: Map<string, string | null>,
  load: () => Promise<string | null>,
  options?: ComponentKeyCacheOptions,
): Promise<string | null> {
  const retryIfMissing = options?.retryIfMissing === true;

  if (cache.has(nodeId)) {
    const cached = cache.get(nodeId) ?? null;
    if (cached || !retryIfMissing) {
      return cached;
    }
  }

  const key = await load();
  cache.set(nodeId, key ?? null);
  return key ?? null;
}
