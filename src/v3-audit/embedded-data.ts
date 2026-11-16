import type { StyleCatalog, TokenCatalog } from './reference/libraryTypes';
import { validateAuditPolicyConfig } from './policies/auditPolicyConfig';
import { isSharedShellRootKey } from './policies/shellComponentAuditPolicy';
import { validateRemediationConfig } from './remediation/remediationConfig';
import type { LibraryComponent } from './reference/libraryTypes';
import type { AuditChannel } from './services/channelAudit';
import { sha256Hex } from './utils/sha256';

const platforms = ['Desktop', 'MobileWeb', 'iOS', 'Android'] as const;
type PlatformCoverage = { expected: number; loaded: number; unclassified: number; gaps: readonly unknown[] };
type Parent = {
  type: 'component';
  name: string;
  library: string;
  status: 'active' | 'scheduled' | 'deprecated';
  role: 'main' | 'part';
  platforms: readonly AuditChannel[];
  sources: readonly number[];
  conflicts?: readonly unknown[];
  counterparts?: Partial<Record<AuditChannel,string>>;
};
type Variant = { type: 'variant'; name: string; componentKey: string; platforms?: readonly AuditChannel[]; counterparts?: Partial<Record<AuditChannel,string>> };
type IndexedComponent = Parent | Variant | { type: 'ambiguous' };
type IndexSource = { id: number; catalogPath: string; kind?: string };
type ThemingPair = {
  sourceKey: string;
  targetKey: string;
  platform: AuditChannel;
  state: string;
  mapped: Record<string, {targetKey:string;properties:Record<string,string>}>;
};
type ResourceStatus = { status: 'active' | 'deprecated' | 'scheduled' | 'unknown'; closed: boolean;
  observations?: readonly { source: number }[];
};
const typographyCatalogChannels: ReadonlyMap<string, readonly AuditChannel[]> = new Map([
  ['101 _ Web Typography.json', ['Desktop', 'MobileWeb']],
  ['102 _ Android Typography.json', ['Android']],
  ['103 _ iOS Typography.json', ['iOS']],
]);
export type OfflineIndexInput = {
  manifest: { schema: string; version: number; coverage: Record<AuditChannel, PlatformCoverage> };
  components: { rows: Record<string, IndexedComponent> };
  sources: { sources: readonly IndexSource[] };
  theming: { pairs: readonly ThemingPair[] };
  resources: { styles: Record<string,ResourceStatus>; tokens: Record<string,ResourceStatus> };
  styleCatalogs: StyleCatalog[];
  tokenCatalogs: TokenCatalog[];
  policy: unknown;
  remediations: unknown;
};

function own<T>(rows: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(rows, key) ? rows[key] : undefined;
}

export function createOfflineAuditIndex(input: OfflineIndexInput, dataId: string) {
  if (input.manifest.schema !== 'apollo.offline-audit-index.v1' || input.manifest.version !== 1 ||
      !/^[a-f0-9]{64}$/.test(dataId)) throw Error('AUDIT_EMBEDDED_DATA_INVALID');
  const sourceById = new Map(input.sources.sources.map(source => [source.id, source]));
  const rows = input.components.rows;
  const inventoriesComplete = platforms.every(platform => {
    const item = input.manifest.coverage[platform];
    return item && Number.isSafeInteger(item.expected) && item.expected > 0 &&
      item.loaded === item.expected && item.unclassified === 0 && item.gaps.length === 0;
  });

  function find(key: string | null) {
    if (!key) return { state: 'unknown' as const, reason: 'Ключ компонента недоступен.' };
    const row = own(rows, key);
    if (!row) return inventoriesComplete ? { state: 'outside' as const } :
      { state: 'unknown' as const, reason: 'Часть подключённых источников не покрыта индексом.' };
    const parentKey = row.type === 'variant' ? row.componentKey : key;
    const parent = own(rows, parentKey);
    if (!parent || parent.type !== 'component' || parent.conflicts?.length) {
      return { state: 'unknown' as const, reason: 'Неоднозначное соответствие ключа в индексе Athena.' };
    }
    let channels = row.type === 'variant' ? row.platforms ?? parent.platforms : parent.platforms;
    if (!channels.length) {
      const sharedPath = parent.library === 'Icons' ? 'icons/' : parent.library === 'Logotypes' ? 'logotypes/' : null;
      if (!sharedPath || parent.sources.length === 0 ||
          !parent.sources.every(id => sourceById.get(id)?.catalogPath.startsWith(sharedPath))) {
        return { state: 'unknown' as const, reason: 'Платформа компонента недоступна.' };
      }
      channels = platforms;
    }
    const reference: LibraryComponent = {
      key: parentKey, name: parent.name, names: [parent.name], displayName: parent.name,
      status: parent.status === 'active' ? 'current' : parent.status === 'scheduled' ? 'update' : 'deprecated',
      role: parent.role === 'part' ? 'Part' : 'Main',
      source: parent.library, sourceFile: sourceById.get(parent.sources[0])?.catalogPath,
    };
    return { state: 'found' as const, key, parentKey, reference, channels, variantName: row.type === 'variant' ? row.name : null };
  }

  function replacement(key: string, parentKey: string, platform: AuditChannel) {
    const pairs = input.theming.pairs.filter(pair => pair.sourceKey === parentKey && pair.platform === platform);
    if (pairs.length !== 1 || pairs[0].state !== 'verified-family') return null;
    const pair = pairs[0], targetKey = key === parentKey ? null : own(pair.mapped, key)?.targetKey;
    if (!targetKey) return null;
    const target = find(targetKey);
    return target.state === 'found' && target.parentKey === pair.targetKey && target.channels.includes(platform) &&
      target.reference.status === 'current' ? target : null;
  }
  function counterpart(key: string, channel: AuditChannel) {
    const row = own(rows,key);
    const targetKey = row && row.type !== 'ambiguous' ? row.counterparts?.[channel] : null;
    if (!targetKey) return null;
    const target = find(targetKey);
    return target.state === 'found' && target.channels.includes(channel) && target.reference.status === 'current' ? target : null;
  }
  function isSharedShellComponent(key: string): boolean {
    if (isSharedShellRootKey(key)) return true;
    const variant = own(rows, key);
    if (variant?.type !== 'variant' || !isSharedShellRootKey(variant.componentKey)) return false;
    const parent = own(rows, variant.componentKey);
    return parent?.type === 'component' && !parent.conflicts?.length;
  }
  const policy = validateAuditPolicyConfig(input.policy);
  const remediations = validateRemediationConfig(input.remediations);
  const typographyChannelCache = new Map<string, readonly AuditChannel[] | undefined>();
  function typographyChannels(kind: 'styles' | 'tokens', key: string) {
    const id = kind + ':' + key;
    if (typographyChannelCache.has(id)) return typographyChannelCache.get(id);
    const sightings = own(input.resources[kind], key)?.observations;
    const channelSets = Array.isArray(sightings) ? sightings.map(observation => {
      const source = sourceById.get(observation?.source);
      if (source?.kind !== kind || !source.catalogPath?.startsWith(kind + '/')) return undefined;
      return typographyCatalogChannels.get(source.catalogPath.slice(kind.length + 1));
    }) : [];
    // An unclassified source cannot prove that a resource belongs to another channel.
    const channels = channelSets.length && channelSets.every(Boolean)
      ? platforms.filter(channel => channelSets.some(available => available?.includes(channel)))
      : undefined;
    typographyChannelCache.set(id, channels);
    return channels;
  }
  return { dataId, inventoriesComplete, find, replacement, counterpart, isSharedShellComponent, policy, remediations,
    styleCatalogs: input.styleCatalogs, tokenCatalogs: input.tokenCatalogs,
    typographyChannels,
    styleStatus: (key:string) => own(input.resources.styles,key)?.status,
    tokenStatus: (key:string) => own(input.resources.tokens,key)?.status,
  };
}

export type OfflineAuditIndex = ReturnType<typeof createOfflineAuditIndex>;

export async function readOfflineAuditIndex(value: unknown, guard: () => void) {
  const reply = value as { source?: unknown; text?: unknown } | null;
  if (!reply || (reply.source !== 'proxy' && reply.source !== 'repository') ||
    typeof reply.text !== 'string' || reply.text.length > 32 * 1024 * 1024) throw Error('AUDIT_ATHENA_INDEX_INVALID');
  let data;
  try { data = JSON.parse(reply.text); } catch { throw Error('AUDIT_ATHENA_INDEX_INVALID'); }
  const input = data?.payload as OfflineIndexInput | undefined;
  const map = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value);
  if (data?.schema !== 'apollo.embedded-audit.v1' || typeof data.dataId !== 'string' ||
    !/^[a-f0-9]{64}$/.test(data.dataId) || input?.manifest?.schema !== 'apollo.offline-audit-index.v1' ||
    input.manifest.version !== 1 || !map(input.manifest.coverage) || !map(input.components?.rows) ||
    !Array.isArray(input.sources?.sources) || !Array.isArray(input.theming?.pairs) ||
    !map(input.resources?.styles) || !map(input.resources?.tokens) ||
    !Array.isArray(input.styleCatalogs) || !Array.isArray(input.tokenCatalogs)) throw Error('AUDIT_ATHENA_INDEX_INVALID');
  const coverage = platforms.map(platform => {
    const row = input.manifest.coverage[platform];
    if (!row || ![row.expected,row.loaded,row.unclassified].every(n => Number.isSafeInteger(n) && n >= 0) ||
      row.loaded > row.expected || !Array.isArray(row.gaps)) throw Error('AUDIT_ATHENA_INDEX_INVALID');
    return { platform, loaded:row.loaded, expected:row.expected, unclassified:row.unclassified };
  });
  if (await sha256Hex(JSON.stringify(input), guard) !== data.dataId) throw Error('AUDIT_ATHENA_INDEX_INVALID');
  guard();
  try {
    const index = createOfflineAuditIndex(input, data.dataId);
    const summary = { source:reply.source, dataId:index.dataId, coverage,
      styleCatalogs:input.styleCatalogs.length, tokenCatalogs:input.tokenCatalogs.length };
    return { index, summary };
  } catch { throw Error('AUDIT_ATHENA_INDEX_INVALID'); }
}
