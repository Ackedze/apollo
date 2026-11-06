import { createCheckState } from './create-check-state';
import { ensureReferenceCatalogsForChannel, ensureReferenceCatalogsForKeys, ensureReferenceCatalogsLoaded, findComponent, getTokenCatalogs, reportMissingReference, resolveStructure, resolveStructureForInstance } from './reference/library';
import type { LibraryComponent } from './reference/libraryTypes';
import type { DSStructureNode } from './types/structures';
import type { PathSegment, RelevanceStatus } from './types/audit';
import type { ApolloPageType } from './types/pageContext';
import type { StatsResource } from './stats/types';
import type { VariableMetadata } from './structure/diff';
import type { VariableCollectionMetadata } from './rules/componentRules';
import type { AuditChannel } from './services/channelAudit';
import { configureAuditPackageReader } from './utils/networkFetch';
import { assertAuditPoliciesReady, assertAuditPolicyCoverage, setNormalizedAuditPolicies } from './rules/runtimeContractRegistry';
import { createCooperativeYield } from './utils/promisePool';
import { buildNodePath, extractAliasKey } from './utils/nodeHelpers';
import { getDetachedLibraryComponentKey } from './services/detachedComponentSource';
import { ensureColorTokenValueIndexLoaded } from './services/colorTokenValueIndex';
import { ensureStyleMetadataLoaded, isKnownStyleId, resolveStyleMetadata, extractStyleKey, getStyleMetadataFromKnownKey } from './services/styleMetadata';
import { findExactPaintStyleMatches, findExactTypographyStyleMatches, getNodePaintFingerprint, getNodeTypographyFingerprint, getPaintStyleFingerprint } from './services/styleMetadata';
import { createAuditTraversalContext } from './services/auditTraversalContext';
import { collectAuditTargets } from './services/auditTargetCollector';
import { buildAuditResultViews, prepareAuditReport } from './services/auditResults';
import { collectApolloTextFacts, buildApolloTextAuditReport } from './stats/textReport';
import { collectApolloLayoutRelations } from './stats/layoutRelations';
import { FindingActionRegistry } from './remediation/findingActionRegistry';
import { attachFindingActions } from './remediation/findingActionResolver';
import { findColorTokenValueCandidates } from './services/colorTokenValueIndex';
import { checkPageBase } from './page-font';
import type { createAuditDataClient } from './data-client';

export type V3AuditProgress = { stage:string; message:string; checked?:number };
export type V3AuditOptions = {
  runId:string;
  channel:AuditChannel;
  pageType:ApolloPageType|null;
  shellAuditEnabled:boolean;
  pluginVersion:string;
  selection:readonly SceneNode[];
  data:ReturnType<typeof createAuditDataClient>;
  assertCurrent():void;
  onProgress(progress:V3AuditProgress):void;
  findingActions?:FindingActionRegistry;
};
let activeDataId:string|null=null;

async function prepareData(options:V3AuditOptions,components:boolean) {
  const guard=options.assertCurrent;
  guard();options.onProgress({stage:'data',message:'Подключаем данные проверки…'});
  const manifest=await options.data.open(guard);guard();
  if(activeDataId && activeDataId!==manifest.dataId)throw Error('AUDIT_DATA_CHANGED_RELOAD_REQUIRED');
  configureAuditPackageReader(async url=>{guard();const text=await options.data.readText(url);guard();return text;});
  const policies=await options.data.readPolicies();guard();setNormalizedAuditPolicies(policies);assertAuditPoliciesReady();
  activeDataId=manifest.dataId;
  if(components) {
    options.onProgress({stage:'indexes',message:'Подготавливаем индексы, стили и токены…'});
    await ensureReferenceCatalogsForChannel(options.channel);guard();
    options.onProgress({stage:'tokens',message:'Подготавливаем токены…'});
    await ensureTokenLabelMapLoaded(guard);guard();
    if(!tokenLabelMap?.size)throw Error('AUDIT_TOKEN_DATA_UNAVAILABLE');
    await ensureStyleMetadataLoaded();guard();
    await ensureColorTokenValueIndexLoaded();guard();
  }
  return manifest.dataId;
}

async function reports(options:V3AuditOptions,checkState:ReturnType<typeof createCheckState>,startedAt:Date) {
  const views=buildAuditResultViews(checkState),guard=options.assertCurrent;
  const layoutRelations=await collectApolloLayoutRelations(options.selection,buildNodePath,guard);guard();
  const bundle=await prepareAuditReport({
    pluginVersion:options.pluginVersion,
    user:{id:figma.currentUser?.id??null,name:figma.currentUser?.name??'Unknown User'},
    figma:{fileKey:figma.fileKey??null,fileName:figma.root.name??null,editorType:figma.editorType},
    scan:{channel:options.channel,pageType:options.pageType,startedAt,finishedAt:new Date(),shellAuditEnabled:options.shellAuditEnabled,experimentalContractV2Enabled:false},
    selection:options.selection,checkState,views,resolveNodePath:buildNodePath,layoutRelations,
    resolveComponentKey:getComponentKey,resolveStyleResource:resolveStyleStatsResource,resolveTokenResource:resolveTokenStatsResource,
  });guard();
  options.onProgress({stage:'texts',message:'Собираем тексты и контекст компонентов…'});
  const facts=await collectApolloTextFacts(options.selection,buildNodePath,async node=>{guard();const key=await getComponentKey(node);guard();return key;},guard);guard();
  const textReport=buildApolloTextAuditReport(bundle.report,facts);
  await options.data.assertCurrent();guard();
  return {views,report:bundle.report,textReport};
}

/** Native audit port: the V3 collector and comparators run against packaged data. */
export async function runV3Audit(options:V3AuditOptions) {
  if(!options.selection.length)throw Error('AUDIT_SELECTION_REQUIRED');
  const startedAt=new Date(),guard=options.assertCurrent;
  const dataId=await prepareData(options,true);guard();
  const traversal=createAuditTraversalContext({
    importComponentByKey:key=>figma.importComponentByKeyAsync(key),
    customStyleOptions:{tokenLabelMap:tokenLabelMap!,isKnownStyleId,resolveStyleMetadata},
    deprecatedStyleOptions:{resolveStyleMetadata},
  });
  const keys=await collectComponentKeys(options.selection,traversal.componentKeyCache,guard);guard();
  await ensureReferenceCatalogsForKeys(keys);guard();
  const state=createCheckState();
  options.onProgress({stage:'components',message:'Проверяем компоненты…',checked:0});
  const seen=new Set<string>();
  await collectAuditTargets(options.selection,state,options.channel,traversal,
    {shellAuditEnabled:options.shellAuditEnabled,dependencyConcurrency:4},
    {getComponentKeyCached:async(node,cache,settings)=>{
      guard();const key=await getComponentKeyCached(node,cache,settings);guard();
      let reference=key?findComponent(key):null;
      if(key&&!reference){await ensureReferenceCatalogsForKeys([key]);guard();reference=findComponent(key);}
      assertAuditPolicyCoverage([{figmaKey:key,componentName:reference?.name??node.name,
        displayName:reference?.displayName,sourceFile:reference?.sourceFile}]);
      if(!seen.has(node.id)){seen.add(node.id);options.onProgress({stage:'components',message:`Проверяем ${node.name}`,checked:seen.size});}
      return key;
    },buildNodeSegments,getReferenceStructureCached,isInsideLocalComponentContext,
    resolveTokenLabel:resolveTokenLabelForDiff,isPaintToken:isColorTokenForPaintDiff,
    resolveVariableMetadata:resolveVariableMetadataForDiff,resolveVariableCollectionMetadata:resolveVariableCollectionMetadataForDiff,
    normalizeRelevanceStatus,reportMissingReference,debugDiffPipeline:()=>{},throwIfCancelled:guard,
    getNodeById:async id=>{guard();const node=await figma.getNodeByIdAsync(id);guard();return node;}});
  guard();options.onProgress({stage:'base',message:'Проверяем тему и шрифт страницы…'});
  const rootIds=new Set(options.selection.map(node=>node.id)),selectedNodes:SceneNode[]=[],checkpoint=createCooperativeYield(guard);
  for(const node of traversal.sceneNodeById.values()){
    await checkpoint();let ancestor:BaseNode|null=node;const seen=new Set<string>();
    while(ancestor&&!seen.has(ancestor.id)){if(rootIds.has(ancestor.id)){selectedNodes.push(node);break;}seen.add(ancestor.id);ancestor=ancestor.parent;}
  }
  const baseChecks=await checkPageBase(figma,options.channel,options.selection,guard,selectedNodes);guard();
  options.onProgress({stage:'actions',message:'Подготавливаем исправления…'});
  await attachFindingActions(state,options.channel,options.findingActions??new FindingActionRegistry(),{
    getNodeById:async id=>{guard();const node=traversal.sceneNodeById.get(id)??await figma.getNodeByIdAsync(id);guard();return node;},
    findExactPaintStyleMatches,findExactTypographyStyleMatches,findColorTokenValueCandidates,getNodePaintFingerprint,getNodeTypographyFingerprint,getPaintStyleFingerprint,
  },guard);guard();
  options.onProgress({stage:'results',message:'Подготавливаем результаты…'});
  const result=await reports(options,state,startedAt);guard();
  return Object.assign({schemaVersion:'apollo.v3-audit-result.v1',runId:options.runId,dataId,checkState:state,baseChecks},result);
}

export async function captureV3Texts(options:V3AuditOptions) {
  if(!options.selection.length)throw Error('AUDIT_SELECTION_REQUIRED');
  const startedAt=new Date(),dataId=await prepareData(options,false);
  const result=await reports(options,createCheckState(),startedAt);
  return {runId:options.runId,dataId,textReport:result.textReport};
}

// Native helpers retained from the V3 entry point.
export { getComponentKey,getReferenceStructure,resolveVariableMetadataForDiff };


type TokenLabelEntry = {
  label: string;
  library?: string;
  sourceFile?: string;
  resolvedType?: string;
  variableKey?: string;
  variableId?: string;
  collectionId?: string;
  collectionName?: string;
  modeNames?: Record<string, string>;
};


let tokenLabelMap: Map<string, TokenLabelEntry> | null = null;

let variableCollectionMetadataMap: Map<
  string,
  VariableCollectionMetadata
> | null = null;

let tokenLabelLoadPromise: Promise<void> | null = null;


async function collectComponentKeys(
  selection: readonly SceneNode[],
  componentKeyCache: Map<string, string | null>,
  throwIfCancelled: () => void,
): Promise<Set<string>> {
  const keys = new Set<string>();
  const checkpoint = createCooperativeYield(throwIfCancelled);

  const isNodeVisibleSafe = (candidate: SceneNode): boolean => {
    try {
      return 'visible' in candidate
        ? (candidate as SceneNode & { visible: boolean }).visible !== false
        : true;
    } catch (_error) {
      return false;
    }
  };

  const visit = async (node: SceneNode): Promise<void> => {
    await checkpoint();

    if (!isNodeVisibleSafe(node)) {
      return;
    }

    if (node.type === 'INSTANCE' || node.type === 'COMPONENT') {
      const key = await getComponentKeyCached(node, componentKeyCache);
      if (key) {
        keys.add(key);
      }
    }

    const detachedComponentKey = getDetachedLibraryComponentKey(node);
    if (detachedComponentKey) {
      keys.add(detachedComponentKey);
    }

    if ('children' in node && node.children.length > 0) {
      for (const child of node.children) {
        await visit(child as SceneNode);
      }
    }
  };

  for (const node of selection) {
    await visit(node);
  }

  return keys;
}


async function getComponentKey(node: SceneNode): Promise<string | null> {
  if (node.type === 'INSTANCE') {
    const mainComponent = await node.getMainComponentAsync();
    return mainComponent ? mainComponent.key : null;
  }

  if (node.type === 'COMPONENT') {
    return node.key ?? null;
  }

  return null;
}


async function getComponentKeyCached(
  node: SceneNode,
  cache: Map<string, string | null>,
  options?: {
    retryIfMissing?: boolean;
  },
): Promise<string | null> {
  return resolveCachedComponentKey(
    node.id,
    cache,
    () => getComponentKey(node),
    options,
  );
}


async function isInsideLocalComponentContext(
  node: SceneNode,
  _componentKeyCache: Map<string, string | null>,
  localComponentContextCache: Map<string, boolean>,
): Promise<boolean> {
  let current = node.parent as BaseNode | null;

  while (current) {
    const currentId = current.id;
    if (localComponentContextCache.has(currentId)) {
      return localComponentContextCache.get(currentId) === true;
    }

    let isLocalContext = false;

    if (current.type === 'COMPONENT') {
      isLocalContext = !(current as ComponentNode).remote;
    } else if (current.type === 'INSTANCE') {
      const mainComponent = await (current as InstanceNode).getMainComponentAsync();
      isLocalContext = Boolean(mainComponent && !mainComponent.remote);
    }

    if (isLocalContext) {
      localComponentContextCache.set(currentId, true);
      return true;
    }

    if (current.type === 'PAGE' || current.type === 'DOCUMENT') {
      localComponentContextCache.set(currentId, false);
      return false;
    }

    current = current.parent as BaseNode | null;
  }

  return false;
}


function getReferenceStructure(
  ref: LibraryComponent | null | undefined,
  variantKey: string | null,
  variantProperties?: Record<string, string> | null,
) {
  if (!ref) return null;
  const structure =
    variantProperties && Object.keys(variantProperties).length
      ? resolveStructureForInstance(ref, {
          componentKey: variantKey ?? '',
          variantProperties,
        })
      : resolveStructure(ref, variantKey);
  if (structure && structure.length > 0) {
    return structure;
  }
  return null;
}


function getReferenceStructureCached(
  ref: LibraryComponent | null | undefined,
  variantKey: string | null,
  variantProperties: Record<string, string> | null | undefined,
  cache: Map<string, DSStructureNode[] | null>,
): DSStructureNode[] | null {
  if (!ref) return null;
  const normalizedVariantProperties = variantProperties
    ? Object.entries(variantProperties)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}=${value}`)
        .join('|')
    : '';
  const cacheKey = `${ref.key ?? ref.displayName ?? 'unknown'}:${variantKey ?? 'default'}:${normalizedVariantProperties}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) ?? null;
  }
  const structure = getReferenceStructure(ref, variantKey, variantProperties ?? null);
  cache.set(cacheKey, structure);
  return structure;
}


function buildNodeSegments(node: SceneNode): PathSegment[] {
  const segments: PathSegment[] = [];

  let current: BaseNode | null = node;

  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    const nodeType = current.type;
    let isVisible = true;
    try {
      const hasVisibleFlag = 'visible' in current;
      isVisible = hasVisibleFlag
        ? (current as SceneNode & { visible: boolean }).visible !== false
        : true;
    } catch (_error) {
      isVisible = false;
    }
    segments.push({
      id: current.id,
      label: current.name,
      nodeType,
      visible: isVisible,
    });
    current = current.parent as BaseNode | null;
  }
  return segments.reverse();
}


function normalizeRelevanceStatus(
  status: LibraryComponent['status'] | undefined,
): RelevanceStatus {
  switch (status) {
    case 'deprecated':
      return 'deprecated';
    case 'update':
    case 'changed':
      return 'update';
    case 'current':
      return 'current';
    default:
      return 'unknown';
  }
}


/**
 * Строит ассоциативные карты для токенов и цветов по всем загруженным токен-каталогам
 * и сохраняет их в память, чтобы позже подставлять читаемые названия и библиотеку.
 */
async function ensureTokenLabelMapLoaded(guard:()=>void=()=>{}): Promise<void> {
  guard();
  if (tokenLabelMap) return;
  if (tokenLabelLoadPromise) {
    try{await tokenLabelLoadPromise;guard();return;}
    catch(error){guard();return ensureTokenLabelMapLoaded(guard);}
  }
  tokenLabelLoadPromise = (async () => {
    try {
      await ensureReferenceCatalogsLoaded();
      guard();const checkpoint=createCooperativeYield(guard);
      const catalogs = getTokenCatalogs();
      const map = new Map<string, TokenLabelEntry>();
      const collectionMap = new Map<string, VariableCollectionMetadata>();
      for (const catalog of catalogs) {
        await checkpoint();
        const catalogLibrary =
          catalog.meta?.library ?? catalog.meta?.fileName ?? '';
        const collections = catalog.collections ?? [];
        for (const collection of collections) {
          await checkpoint();
          if (!collection) continue;
          const collectionName =
            collection.name ?? catalogLibrary ?? catalog.meta?.fileName ?? '';
          const modeNames: Record<string, string> = {};
          for (const mode of collection.modes ?? []) {
            if (
              mode &&
              typeof mode.modeId === 'string' &&
              typeof mode.name === 'string'
            ) {
              modeNames[mode.modeId] = mode.name;
            }
          }
          if (typeof collection.id === 'string' && collection.id) {
            const collectionMetadata: VariableCollectionMetadata = {
              collectionId: collection.id,
              collectionName: collectionName || null,
              modeNames,
            };
            registerVariableCollectionMetadata(
              collectionMap,
              collection.id,
              collectionMetadata,
            );
            registerVariableCollectionMetadata(
              collectionMap,
              collection.key,
              collectionMetadata,
            );
          }
          const variables = collection.variables ?? [];
          for (const variable of variables) {
            await checkpoint();
            if (!variable || (!variable.key && !variable.id)) continue;
            const label = buildTokenLabel(
              variable.groupName ?? 'Без группы',
              variable.tokenName ?? variable.name ?? '',
            );
            const entry: TokenLabelEntry = {
              label,
              library: collectionName || catalogLibrary,
              sourceFile: catalog.meta?.fileName ?? undefined,
              resolvedType:
                typeof variable.resolvedType === 'string'
                  ? variable.resolvedType
                  : undefined,
              variableKey:
                typeof variable.key === 'string' ? variable.key : undefined,
              variableId:
                typeof variable.id === 'string' ? variable.id : undefined,
              collectionId:
                typeof variable.variableCollectionId === 'string'
                  ? variable.variableCollectionId
                  : typeof collection.id === 'string'
                    ? collection.id
                    : undefined,
              collectionName: collectionName || undefined,
              modeNames,
            };
            registerTokenLabelKey(map, variable.key, entry);
            registerTokenLabelKey(map, variable.id, entry);
          }
        }
      }
      guard();tokenLabelMap = map;
      variableCollectionMetadataMap = collectionMap;
    } catch (error) {
      guard();
      console.warn('[Apollo] failed to load token catalogs', error);
      tokenLabelMap = new Map();
      variableCollectionMetadataMap = new Map();
    } finally {
      tokenLabelLoadPromise = null;
    }
  })();
  return tokenLabelLoadPromise;
}


function buildTokenLabel(
  groupName: string,
  tokenName: string,
): string {
  const segments: string[] = [];
  if (groupName && groupName !== 'Без группы') {
    segments.push(groupName);
  }
  if (tokenName) {
    segments.push(tokenName);
  }
  return segments.join('/');
}


function registerTokenLabelKey(
  map: Map<string, TokenLabelEntry>,
  rawKey: string | null | undefined,
  entry: TokenLabelEntry,
) {
  if (!rawKey) return;
  map.set(rawKey, entry);
  const aliasKey = extractAliasKey(rawKey);
  if (aliasKey) {
    map.set(aliasKey, entry);
  }
}


function resolveTokenLabelForDiff(token: string): string | null {
  const directLabel = tokenLabelMap?.get(token);
  if (directLabel) return directLabel.label;
  const aliasKey = extractAliasKey(token);
  if (!aliasKey) return token;
  const label = tokenLabelMap?.get(aliasKey);
  return label?.label ?? token;
}


function resolveVariableMetadataForDiff(
  bindingId: string,
): VariableMetadata | null {
  const aliasKey = extractAliasKey(bindingId);
  const metadata =
    tokenLabelMap?.get(bindingId) ??
    (aliasKey ? tokenLabelMap?.get(aliasKey) : null) ??
    null;
  if (!metadata) return null;
  return {
    variableId: metadata.variableId ?? null,
    variableKey: metadata.variableKey ?? aliasKey,
    variableName: metadata.label ?? null,
    collectionId: metadata.collectionId ?? null,
    collectionName: metadata.collectionName ?? metadata.library ?? null,
    modeNames: metadata.modeNames ?? {},
  };
}


function resolveVariableCollectionMetadataForDiff(
  collectionId: string,
): VariableCollectionMetadata | null {
  const collectionKey = extractVariableCollectionKey(collectionId);
  return (
    variableCollectionMetadataMap?.get(collectionId) ??
    (collectionKey
      ? variableCollectionMetadataMap?.get(collectionKey) ?? null
      : null)
  );
}


function registerVariableCollectionMetadata(
  map: Map<string, VariableCollectionMetadata>,
  rawKey: string | null | undefined,
  metadata: VariableCollectionMetadata,
): void {
  for (const lookupKey of getVariableCollectionLookupKeys(rawKey)) {
    map.set(lookupKey, metadata);
  }
}


function resolveTokenStatsResource(
  tokenId: string,
  displayName: string | null,
): StatsResource | null {
  const tokenKey = extractAliasKey(tokenId);
  if (!tokenKey) {
    return null;
  }
  const metadata = tokenLabelMap?.get(tokenId) ?? tokenLabelMap?.get(tokenKey);
  return {
    type: 'token',
    name: metadata?.label ?? displayName ?? tokenKey,
    key: metadata?.variableKey ?? tokenKey,
    id: tokenId,
    library: metadata?.library ?? null,
    sourceFile: metadata?.sourceFile ?? null,
  };
}


function resolveStyleStatsResource(
  styleId: string,
  displayName: string | null,
): StatsResource | null {
  const styleKey = extractStyleKey(styleId) ?? styleId;
  const metadata = getStyleMetadataFromKnownKey(styleKey);
  return {
    type: 'style',
    name: metadata?.label ?? displayName ?? styleKey,
    key: metadata?.key ?? styleKey,
    id: styleId,
    library: metadata?.library ?? null,
    sourceFile: metadata?.sourceFile ?? null,
  };
}


function isColorTokenForPaintDiff(token: string): boolean {
  const directEntry = tokenLabelMap?.get(token);
  if (directEntry?.resolvedType) {
    return directEntry.resolvedType === 'COLOR';
  }

  const aliasKey = extractAliasKey(token);
  if (!aliasKey) {
    return true;
  }

  const tokenEntry = tokenLabelMap?.get(aliasKey);
  if (!tokenEntry?.resolvedType) {
    return true;
  }

  return tokenEntry.resolvedType === 'COLOR';
}
type ComponentKeyCacheOptions = {
  retryIfMissing?: boolean;
};

async function resolveCachedComponentKey(
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

function extractVariableCollectionKey(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const withoutPrefix = value.replace(/^VariableCollectionId:/, '');
  const key = withoutPrefix.split('/')[0];
  return key || null;
}

function getVariableCollectionLookupKeys(
  value: string | null | undefined,
): string[] {
  if (!value) return [];
  const keys = [value];
  const collectionKey = extractVariableCollectionKey(value);
  if (collectionKey && collectionKey !== value) keys.push(collectionKey);
  return keys;
}

