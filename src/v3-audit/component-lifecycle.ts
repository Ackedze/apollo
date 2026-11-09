import type { AuditDataManifest, createAuditDataClient } from './data-client';
import type { LibraryComponentFreshness } from './services/libraryComponentFreshness';
const { INDEXES, VERSION, createLifecycleLookup } = require('./lifecycle');

export const lifecycleUrls: string[] = INDEXES.map((id: string) =>
  'https://ackedze.github.io/design-system_ab/' + id.slice('knowledge/data/design-system_ab/'.length));
export type ComponentLifecycle = {
  version: string;
  status: 'deprecated' | 'scheduled' | 'not-listed' | 'unknown';
  checks: Array<{
    category: string; status: string; reason: string; sourceId: string;
    sha256: string; matchedKeys: string[]; recordKeys: string[];
    [key: string]: unknown;
  }>;
};
let current: { dataId: string; evaluate: ReturnType<typeof createLifecycleLookup>; hashes: Map<string, string> } | null = null;

/** Reuse the agent audit's exact key/conflict rules against the same pinned package. */
export async function prepareComponentLifecycle(
  data: ReturnType<typeof createAuditDataClient>, manifest: AuditDataManifest, guard: () => void,
): Promise<void> {
  guard();
  if (current?.dataId === manifest.dataId) return;
  const documents = await Promise.all(lifecycleUrls.map(async url => {
    const text = await data.readText(url); guard();
    try { return JSON.parse(text); }
    catch (_error) { throw Error('AUDIT_DATA_LIFECYCLE_INVALID'); }
  }));
  guard();
  const hashes = new Map<string, string>();
  for (let i = 0; i < lifecycleUrls.length; i++) {
    const pin = manifest.files.find(file => file.urls.includes(lifecycleUrls[i]));
    if (!pin) throw Error('AUDIT_DATA_CLOSURE_INCOMPLETE');
    hashes.set(INDEXES[i], pin.sha256);
  }
  let evaluate;
  try { evaluate = createLifecycleLookup((id: string) => documents[INDEXES.indexOf(id)]); }
  catch (_error) { throw Error('AUDIT_DATA_LIFECYCLE_INVALID'); }
  guard();
  current = { dataId: manifest.dataId, evaluate, hashes };
}

export function getComponentLifecycle(componentKey: string | null, targetId: string): ComponentLifecycle {
  if (!current) throw Error('AUDIT_DATA_LIFECYCLE_REQUIRED');
  const checks = current.evaluate([{ id: targetId, type: 'INSTANCE', main: { key: componentKey } }], '')
    .checks.filter((row: any) => row.category !== 'parts')
    .map((row: any) => Object.assign({}, row, { sha256: current!.hashes.get(row.sourceId) }));
  const status = checks.some((row: any) => row.status === 'UNKNOWN') ? 'unknown'
    : checks.some((row: any) => row.category === 'deprecated' && row.status === 'ERROR') ? 'deprecated'
    : checks.some((row: any) => row.category === 'scheduled' && row.status === 'WARNING') ? 'scheduled' : 'not-listed';
  return { version: VERSION, status, checks };
}

export function componentRelevance(
  lifecycle: ComponentLifecycle, freshness: LibraryComponentFreshness | null,
  technical: boolean, hasReference: boolean,
): 'deprecated' | 'update' | 'technical' | 'current' | 'unknown' {
  if (lifecycle.status === 'deprecated') return 'deprecated';
  if (technical) return 'technical';
  if (lifecycle.status === 'scheduled' || freshness?.status === 'update-available') return 'update';
  return lifecycle.status === 'unknown' || !hasReference ? 'unknown' : 'current';
}
