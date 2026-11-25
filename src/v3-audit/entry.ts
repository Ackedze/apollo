import { createCheckState } from './create-check-state';
import { prepareComponentLifecycle, getComponentLifecycle } from './component-lifecycle';
import { reconcileLibraryUpdateResults, excludeLibraryUpdatesFromCurrent } from './services/libraryUpdateResults';
import { ensureReferenceCatalogsForChannel, ensureReferenceCatalogsForKeys, ensureReferenceCatalogsLoaded, findComponent, getTokenCatalogs, reportMissingReference, resolveStructure, resolveStructureForInstance } from './reference/library';
import type { LibraryComponent } from './reference/libraryTypes';
import type { DSStructureNode } from './types/structures';
import type { AuditItem, PathSegment, RelevanceStatus } from './types/audit';
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
import { createColorTokenValueReader, ensureColorTokenValueIndexLoaded } from './services/colorTokenValueIndex';
import { ensureStyleMetadataLoaded, isKnownStyleId, resolveStyleMetadata, extractStyleKey, getStyleMetadataFromKnownKey } from './services/styleMetadata';
import { createStyleCatalogReaders, findExactPaintStyleMatches, findExactTypographyStyleMatches, getNodePaintFingerprint, getNodeTypographyFingerprint, getPaintStyleFingerprint } from './services/styleMetadata';
import { createAuditTraversalContext } from './services/auditTraversalContext';
import { collectAuditTargets } from './services/auditTargetCollector';
import { buildAuditResultViews, prepareAuditReport, prepareStatsAuditReport } from './services/auditResults';
import { collectApolloTextFacts, buildApolloTextAuditReport } from './stats/textReport';
import type { ApolloTextScope } from './stats/types';
import { slugifyUserName } from './stats/report';
import { collectApolloLayoutRelations } from './stats/layoutRelations';
import { FindingActionRegistry } from './remediation/findingActionRegistry';
import { attachFindingActions } from './remediation/findingActionResolver';
import { findColorTokenValueCandidates, readColorTokenPreview } from './services/colorTokenValueIndex';
import { checkPageBase } from './page-font';
import type { OfflineAuditIndex } from './embedded-data';
import { getForcedAuditCategory, getForcedAuditCategoryReason } from './policies/componentAuditPolicy';
import { shouldIgnoreRawTypography } from './policies/auditPolicyConfig';
import { collectWrongChannelTypography } from './services/typographyChannelAudit';
import { getLibraryComponentFreshnessScope } from './services/libraryComponentFreshness';
import { buildCorporateThemizationEntry } from './services/themeAudit';
import { getPageName } from './utils/nodeHelpers';
import type { createAuditDataClient } from './data-client';
import type { AuditSceneSnapshot } from './source-observation';
import { untimed, type createComponentTimings } from './component-timings';
import {evaluateLiquidGlass,excludeResultNavigationBars,type LiquidGlassData} from './liquid-glass';

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
  snapshot?:AuditSceneSnapshot;
  liquidGlass?:LiquidGlassData;
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
    await prepareComponentLifecycle(options.data,manifest,guard);guard();
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

export type V3AuditRunOptions = Omit<V3AuditOptions,'data'> & {componentTimings?:ReturnType<typeof createComponentTimings>};

export async function prepareV3AuditReports(
  options:V3AuditRunOptions,
  checkState:ReturnType<typeof createCheckState>,
  startedAt:Date,
  resources = { resolveStyleResource:resolveStyleStatsResource, resolveTokenResource:resolveTokenStatsResource, resolveComponentKey:getComponentKey },
  statsOnly = false,
) {
  const views=buildAuditResultViews(checkState),guard=options.assertCurrent;
  const layoutRelations=statsOnly?undefined:await collectApolloLayoutRelations(options.selection,buildNodePath,guard);guard();
  const input={
    pluginVersion:options.pluginVersion,
    user:{id:figma.currentUser?.id??null,name:figma.currentUser?.name??'Unknown User'},
    figma:{fileKey:figma.fileKey??null,fileName:figma.root.name??null,editorType:figma.editorType},
    scan:{channel:options.channel,pageType:options.pageType,startedAt,finishedAt:new Date(),shellAuditEnabled:options.shellAuditEnabled,experimentalContractV2Enabled:false},
    selection:options.selection,checkState,views,resolveNodePath:buildNodePath,layoutRelations,
    resolveComponentKey:resources.resolveComponentKey,resolveStyleResource:resources.resolveStyleResource,resolveTokenResource:resources.resolveTokenResource,
  };
  const report=statsOnly?await prepareStatsAuditReport(input):(await prepareAuditReport(input)).report;guard();
  options.onProgress({stage:'texts',message:'Собираем тексты и контекст компонентов…'});
  const facts=await collectApolloTextFacts(options.selection,buildNodePath,async node=>{guard();const key=await resources.resolveComponentKey(node);guard();return key;},guard,options.snapshot);guard();
  const textReport=buildApolloTextAuditReport(report,facts);
  guard();
  return {views,report,textReport};
}

/** Native component audit entry for the embedded and packaged data readers. */
export async function runV3Audit(options:V3AuditOptions | (V3AuditRunOptions & {offlineIndex:OfflineAuditIndex})) {
  if(!options.selection.length)throw Error('AUDIT_SELECTION_REQUIRED');
  if('offlineIndex' in options)return runOfflineComponentAudit(options,options.offlineIndex);
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
  // Source-definition updates bypass the rendered classifier; retain the same lifecycle priority.
  for (const item of state.relevanceBuckets.update.slice()) {
    if (item.catalogLifecycle) continue;
    item.catalogLifecycle = getComponentLifecycle(item.componentKey, item.id);
    if (item.catalogLifecycle.status === 'scheduled' && !item.updateReasons?.includes('catalog-lifecycle')) {
      item.updateReasons = (item.updateReasons ?? []).concat('catalog-lifecycle');
    }
    const updates = reconcileLibraryUpdateResults(state.relevanceBuckets.update, [], [item]);
    state.relevanceBuckets.update = updates.currentItems.concat(updates.updateItems);
    state.relevanceBuckets.unknown = excludeLibraryUpdatesFromCurrent(state.relevanceBuckets.unknown, [item]);
    if (item.catalogLifecycle.status === 'deprecated') {
      item.relevance = 'deprecated';
      state.relevanceBuckets.update = state.relevanceBuckets.update.filter(candidate => candidate !== item);
      const reconciled = reconcileLibraryUpdateResults(state.relevanceBuckets.deprecated, [], [item]);
      state.relevanceBuckets.deprecated = reconciled.currentItems.concat(reconciled.updateItems);
    }
  }
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
    findExactPaintStyleMatches,findExactTypographyStyleMatches,findColorTokenValueCandidates,readColorTokenPreview,getNodePaintFingerprint,getNodeTypographyFingerprint,getPaintStyleFingerprint,
  },guard);guard();
  options.onProgress({stage:'results',message:'Подготавливаем результаты…'});
  const result=await prepareV3AuditReports(options,state,startedAt);guard();await options.data.assertCurrent();guard();
  return Object.assign({schemaVersion:'apollo.v3-audit-result.v1',runId:options.runId,dataId,checkState:state,baseChecks},result);
}

async function runOfflineComponentAudit(options:V3AuditRunOptions,index:OfflineAuditIndex) {
  const guard=options.assertCurrent,startedAt=new Date(),state=createCheckState();
  const snapshot=options.snapshot;
  const timings=options.componentTimings,measure=timings?.measure??untimed;
  const measureSync=timings?.measureSync??untimed;
  const readMain=(node:InstanceNode)=>measure('figmaGetMainComponentAsync',()=>node.getMainComponentAsync());
  const getMainComponent=(node:InstanceNode)=>snapshot?snapshot.getMainComponent(node,readMain):readMain(node);
  const resolveComponentKey=(node:BaseNode)=>node.type==='INSTANCE'
    ?getMainComponent(node).then(main=>main?.key??null)
    :getComponentKey(node);
  const checkpoint=createCooperativeYield(guard);
  guard();options.onProgress({stage:'indexes',message:'Подготавливаем индексы Athena…'});
  const readStyleByIdAsync=timings&&typeof figma.getStyleByIdAsync==='function'
    ?(id:string)=>measure('figmaGetStyleByIdAsync',()=>figma.getStyleByIdAsync(id)):undefined;
  const style=createStyleCatalogReaders(index.styleCatalogs,index.styleStatus,readStyleByIdAsync);
  const colorTokenReader=createColorTokenValueReader(index.tokenCatalogs,key=>index.tokenStatus(key)==='active');
  const availableColorKeys = new Set<string>();
  const labels=new Map<string,TokenLabelEntry>();
  for(const catalog of index.tokenCatalogs)for(const collection of catalog.collections??[])for(const variable of collection?.variables??[]){
    await checkpoint();
    if (variable.key && variable.resolvedType === 'COLOR' && variable.hiddenFromPublishing !== true) availableColorKeys.add(variable.key);
    const entry:TokenLabelEntry={label:buildTokenLabel(variable.groupName??'Без группы',variable.tokenName??variable.name??''),
      variableKey:variable.key,variableId:variable.id,library:collection?.name,sourceFile:catalog.meta?.fileName};
    registerTokenLabelKey(labels,variable.key,entry);registerTokenLabelKey(labels,variable.id,entry);
  }
  const tokenById=(id:string)=>labels.get(id)??labels.get(extractAliasKey(id)??'');
  const tokenByKey=(key:string|null)=>{
    const resource=key?labels.get(key):undefined;
    return resource?.variableKey===key?resource:undefined;
  };
  const tokenLookups=new Map<string,Promise<TokenLabelEntry|undefined>>();
  const resolveNativeToken=(id:string)=>{
    if(typeof figma.variables?.getVariableByIdAsync!=='function') return Promise.resolve(undefined);
    const cached=tokenLookups.get(id);
    if(cached) return cached;
    const lookup=(async()=>{
      try{
        const variable=await measure('figmaGetVariableByIdAsync',()=>figma.variables.getVariableByIdAsync(id));
        return tokenByKey(variable?.key??null);
      }catch{return undefined;}
    })();
    tokenLookups.set(id,lookup);
    return lookup;
  };
  const getReference=(key:string|null)=>{const found=index.find(key);return found.state==='found'?found.reference:null;};
  const traversal=createAuditTraversalContext({importComponentByKey:key=>measure('figmaImportComponentByKeyAsync',()=>figma.importComponentByKeyAsync(key)),
    customStyleOptions:{tokenLabelMap:labels,resolveStyleMetadata:style.resolveStyleMetadata,
      resolveComponentKey:snapshot?resolveComponentKey:undefined,readStyleByIdAsync,
      isKnownStyleId:async id=>Boolean(await style.resolveStyleMetadata(id)),referenceByKey:getReference,
      ignoreRawTypography:params=>shouldIgnoreRawTypography(params,index.policy)},
    deprecatedStyleOptions:{resolveStyleMetadata:style.resolveStyleMetadata,async resolveTokenStatus(id){
      const resource=tokenById(id)??await resolveNativeToken(id);
      guard();
      const key=resource?.variableKey,status=key?index.tokenStatus(key):undefined;
      return key&&resource&&(status==='deprecated'||status==='scheduled')?{key,label:resource.label,library:resource.library,sourceFile:resource.sourceFile,status}:null;
    }} });
  const freshness=traversal.libraryComponentFreshnessChecker;
  traversal.libraryComponentFreshnessChecker={getStats:()=>freshness.getStats(),async check(instance,scope){
    const identityReader={getMainComponentAsync:()=>getMainComponent(instance as InstanceNode)};
    const result=await measure('libraryFreshness',()=>freshness.check(identityReader,scope));guard();
    if(result.status==='update-available')return Object.assign({},result,{status:'unknown' as const,reason:'publication-unconfirmed' as const});
    return result;
  }};
  const safeKey=async(node:BaseNode)=>{
    guard();
    let key=null;
    try{key=await resolveComponentKey(node);}catch{}
    guard();
    return key;
  };
  const getKey:typeof getComponentKeyCached=(node,cache,settings)=>resolveCachedComponentKey(node.id,cache,()=>safeKey(node),settings);
  const nodeLookups=new Map<string,Promise<BaseNode|null>>();
  const getNodeById=async(id:string)=>{
    guard();
    const captured=traversal.sceneNodeById.get(id);
    if(captured)return captured;
    let pending=nodeLookups.get(id);
    if(!pending){
      pending=measure('figmaGetNodeByIdAsync',()=>figma.getNodeByIdAsync(id));
      nodeLookups.set(id,pending);
      void pending.catch(()=>nodeLookups.delete(id));
    }
    const node=await pending;guard();return node;
  };
  const liquidGlassFamilies=new Map<string,string>();
  timings?.start();
  await collectAuditTargets(options.selection,state,options.channel,traversal,{shellAuditEnabled:options.shellAuditEnabled,dependencyConcurrency:4},{
    getComponentKeyCached:getKey,buildNodeSegments,getNodeById,throwIfCancelled:guard,indexed:{
      snapshot,timings,getMainComponent,
      isSharedShellKey:options.shellAuditEnabled?undefined:index.isSharedShellComponent,
      referenceByKey:getReference,
      wrongChannel:item=>{const found=index.find(item.componentKey);return found.state==='found'&&!found.channels.includes(options.channel);},
      wrongChannelTypography:node=>collectWrongChannelTypography(node,options.channel,async(type,id)=>{
        if(type==='style'){
          const metadata=await style.resolveStyleMetadata(id);
          const channels=metadata&&index.typographyChannels('styles',metadata.key);
          return metadata&&channels?{channels,resource:{type,key:metadata.key,name:metadata.label,
            library:metadata.library??null,sourceFile:metadata.sourceFile}}:null;
        }
        // A numerical ID from a catalog export is not evidence of the binding in this file.
        const key=id.startsWith('VariableID:')?extractAliasKey(id):null;
        const token=tokenByKey(key)??await resolveNativeToken(id);
        const channels=token?.variableKey&&index.typographyChannels('tokens',token.variableKey);
        return token?.variableKey&&channels?{channels,resource:{type,key:token.variableKey,name:token.label,
          library:token.sourceFile??token.library??null,sourceFile:token.sourceFile}}:null;
      },guard),
      themization(node,item){
        const found=index.find(item.componentKey);if(found.state!=='found')return null;
        return buildCorporateThemizationEntry(node,found.reference,()=>{
          if(node.type!=='INSTANCE')return null;
          const target=index.replacement(found.key,found.parentKey,options.channel);
          return target?{key:target.key,name:target.reference.displayName}:null;
        });
      },
      async classifyComponent(node,definition){
        const key=await getKey(node,traversal.componentKeyCache,{retryIfMissing:true});
        const found=index.find(key),reference=found.state==='found'?found.reference:null;
        const forcedCategory=getForcedAuditCategory(reference);
        const libraryFreshness=node.type==='INSTANCE'?await traversal.libraryComponentFreshnessChecker.check(node,getLibraryComponentFreshnessScope(node)):null;
        guard();
        let parent=node.parent;
        while(parent&&parent.type!=='PAGE'&&parent.type!=='COMPONENT'&&parent.type!=='INSTANCE')parent=parent.parent;
        const standalonePart=reference?.role==='Part'&&parent?.type==='PAGE';
        const relevance=reference?.status==='deprecated'?'deprecated':forcedCategory??(reference?.status==='update'?'update':standalonePart?'technical':found.state==='unknown'?'unknown':'current');
        const item:AuditItem={id:node.id,name:node.name,nodeType:node.type,pageName:getPageName(node),pathSegments:buildNodeSegments(node),
          fullPath:buildNodePath(node),componentKey:key,reference,relevance,librarySource:reference?.source??null,librarySourceFile:reference?.sourceFile??null,
          isLocal:found.state==='outside'&&!!(definition||key),diffs:[],comparisonIssues:found.state==='unknown'?[found.reason]:[],libraryFreshness,forcedCategory,
          forcedCategoryReason:forcedCategory?getForcedAuditCategoryReason(forcedCategory,reference):null,
          updateReasons:reference?.status==='update'?['catalog-lifecycle']:[],
          resolvedReferenceVariantName:found.state==='found'?found.variantName:null,
          resolvedReferenceVariantKey:found.state==='found'&&found.variantName?key:null};
        if(node.type==='INSTANCE'&&options.channel==='iOS'&&options.liquidGlass?.registry){
          let main:ComponentNode|null=null;
          try{main=await getMainComponent(node);}catch{guard();}
          const finding=await evaluateLiquidGlass(node,main,options.liquidGlass,options.channel);guard();
          if(finding&&snapshot?.isVisible(node)!==false){
            if(finding.status==='violation')liquidGlassFamilies.set(node.id,finding.assessment.familyKey);
            const entry=Object.assign({},item,{liquidGlassStatus:finding.status,liquidGlassReason:finding.assessment.reason});
            state.liquidGlassEntries.push(entry);
          }
        }
        measureSync('componentProgress',()=>options.onProgress({stage:'components',message:`Проверяем ${node.name}`,checked:state.totalItems+1}));
        return item;
      },
    },
  }).finally(()=>timings?.finish());
  guard();
  state.liquidGlassEntries=excludeResultNavigationBars(state.liquidGlassEntries,liquidGlassFamilies,traversal.sceneNodeById);
  state.relevanceBuckets.current=state.relevanceBuckets.current.filter(item=>!item.isLocal);
  options.onProgress({stage:'base',message:'Проверяем тему и шрифт страницы…'});
  const baseChecks=await checkPageBase(figma,options.channel,options.selection,guard,Array.from(traversal.sceneNodeById.values()),snapshot?.shouldSkipShared);guard();
  options.onProgress({stage:'actions',message:'Подготавливаем исправления…'});
  await attachFindingActions(state,options.channel,options.findingActions??new FindingActionRegistry(),{
    getNodeById,findExactPaintStyleMatches:style.findExactPaintStyleMatches,
    findExactTypographyStyleMatches:node=>style.findExactTypographyStyleMatches(node).filter(candidate=>
      index.typographyChannels('styles',candidate.key)?.includes(options.channel)!==false),
    findColorTokenValueCandidates:colorTokenReader.findColorTokenValueCandidates,readColorTokenPreview:colorTokenReader.readColorTokenPreview,
    isActiveColorToken:key=>availableColorKeys.has(key)&&index.tokenStatus(key)==='active',
    getNodePaintFingerprint,getNodeTypographyFingerprint,getPaintStyleFingerprint,
    channelCounterpart:(key,platform)=>{
      if(!key)return null;
      const target=index.counterpart(key,platform==='Mobile Web'?'MobileWeb':'Desktop');
      return target?{platform,componentKey:target.key,componentName:target.reference.displayName,library:target.reference.source??null}:null;
    },
    componentRemediation:key=>key?index.remediations.components[key]??null:null,
    styleRemediation:key=>key?index.remediations.styles[key]??null:null,
  },guard);guard();
  options.onProgress({stage:'results',message:'Подготавливаем результаты…'});
  const result=await prepareV3AuditReports(options,state,startedAt,{
    resolveComponentKey:safeKey,
    resolveStyleResource:(id,name)=>{
      const key=extractStyleKey(id)??id,metadata=style.byKey(key);
      return metadata?{type:'style',id,key,name:metadata.label||name||id,library:metadata.library??null,sourceFile:metadata.sourceFile??null}:null;
    },
    resolveTokenResource:(id,name)=>{
      const metadata=tokenById(id);
      return metadata?{type:'token',id,key:metadata.variableKey??null,name:metadata.label||name||id,library:metadata.library??null,sourceFile:metadata.sourceFile??null}:null;
    },
  },true);guard();
  const liquidGlass={status:options.channel!=='iOS'?'not-applicable':options.liquidGlass?.registry?'connected':'unavailable',
    error:options.liquidGlass?.error??null,registryId:options.liquidGlass?.registry?.registryId??null};
  Object.assign(result.report,{liquidGlass:Object.assign({},liquidGlass,{findings:state.liquidGlassEntries})});
  return Object.assign({schemaVersion:'apollo.v3-audit-result.v1',runId:options.runId,dataId:index.dataId,checkState:state,baseChecks,
    liquidGlass,offlineCoverage:{gaps:index.inventoriesComplete?[]:['component-index-coverage-partial']}},result);
}

export async function captureV3Texts(options:V3AuditOptions) {
  if(!options.selection.length)throw Error('AUDIT_SELECTION_REQUIRED');
  const guard=options.assertCurrent,startedAt=new Date();
  options.onProgress({stage:'data',message:'Сверяем пакет данных…'});
  const {dataId}=await options.data.open(guard);guard();
  options.onProgress({stage:'texts',message:'Собираем тексты и контекст компонентов…'});
  const scopes:ApolloTextScope[]=[];
  const componentKey=async (node:SceneNode) => {
    if(node.type==='INSTANCE'&&options.snapshot)return (await options.snapshot.getMainComponent(node))?.key??null;
    return getComponentKey(node);
  };
  const facts=await collectApolloTextFacts(options.selection,buildNodePath,componentKey,guard,options.snapshot,scopes);
  const selection=await Promise.all(options.selection.map(async node=>({
    nodeId:node.id,name:node.name,nodeType:node.type,path:buildNodePath(node),componentKey:await componentKey(node),
  })));
  guard();
  const finishedAt=new Date(),userId=figma.currentUser?.id??null;
  const name=figma.currentUser?.name?.trim()||'Unknown User',slug=slugifyUserName(name);
  const pad=(value:number)=>String(value).padStart(2,'0');
  const date=`${pad(finishedAt.getDate())}-${pad(finishedAt.getMonth()+1)}-${finishedAt.getFullYear()}`;
  const time=`${pad(finishedAt.getHours())}-${pad(finishedAt.getMinutes())}-${pad(finishedAt.getSeconds())}`;
  const textReport=buildApolloTextAuditReport({
    reportId:`apollo-${userId??'anonymous'}-${finishedAt.getTime()}-${Math.random().toString(36).slice(2,10)}`,
    generatedAt:finishedAt.toISOString(),
    suggestedFileName:`${slug}_${date}_${time}.json`,
    user:{id:userId,name,slug},
    plugin:{name:'Apollo',version:options.pluginVersion},
    figma:{fileKey:figma.fileKey??null,fileName:figma.root.name??null,editorType:figma.editorType},
    scan:{channel:options.channel,pageType:options.pageType,startedAt:startedAt.toISOString(),finishedAt:finishedAt.toISOString(),
      durationMs:Math.max(0,finishedAt.getTime()-startedAt.getTime()),selection,
      settings:{shellAuditEnabled:options.shellAuditEnabled,experimentalContractV2Enabled:false}},
  },facts);
  textReport.facts.scopes=scopes;
  await options.data.assertCurrent();guard();
  return {runId:options.runId,dataId,textReport};
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


async function getComponentKey(node: BaseNode): Promise<string | null> {
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

