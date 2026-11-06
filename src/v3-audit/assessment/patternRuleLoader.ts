import {
  appendCacheBustingQuery,
  fetchDirect,
} from '../utils/networkFetch';
import {
  setPatternRulesConfig,
  type PatternRulesConfig,
} from './patternRules';

export async function loadPatternRulesConfig(
  url: string,
): Promise<PatternRulesConfig> {
  const cacheBustedUrl = appendCacheBustingQuery(url, 'apolloPatternRules');
  const raw = await fetchDirect(cacheBustedUrl);
  const config = setPatternRulesConfig(JSON.parse(raw));

  console.log('[Apollo] pattern rules loaded', {
    url,
    schemaVersion: config.schemaVersion,
    count: config.rules.length,
  });

  return config;
}
