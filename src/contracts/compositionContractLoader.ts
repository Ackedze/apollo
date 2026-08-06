import {
  appendCacheBustingQuery,
  fetchDirect,
} from '../utils/networkFetch';
import {
  setCompositionContractsConfig,
} from './compositionContracts';
import type { CompositionContractsConfig } from './compositionContractTypes';

export async function loadCompositionContractsConfig(
  url: string,
): Promise<CompositionContractsConfig> {
  const cacheBustedUrl = appendCacheBustingQuery(url, 'apolloCompositionContracts');
  const raw = await fetchDirect(cacheBustedUrl);
  const config = setCompositionContractsConfig(JSON.parse(raw));

  console.log('[Apollo] composition contracts loaded', {
    url,
    schemaVersion: config.schemaVersion,
    count: config.contracts.length,
  });
  return config;
}
