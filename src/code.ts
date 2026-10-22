import { createCurrentPageDiagnosticObserver } from "./generation/native/observer";
import { createNativeDiagnostic, type DiagnosticInputs } from "./generation/native/diagnostic";
import { createNativeDiagnosticBridge } from "./generation/native/diagnostic-bridge";
declare const __APOLLO_NATIVE_DIAGNOSTIC_INPUTS__: DiagnosticInputs | null;
declare const __APOLLO_NATIVE_BUILD_INPUTS_SHA__: string;
import { GenerationController } from "./generation/controller";
import { createGenerationFrontendPort } from "./generation/frontend/port";
import { createGenerationProxyPort } from "./generation/proxy/port";
import { createGenerationFigmaHost } from "./generation/figma/host";
import { createGenerationNativeCapture } from "./generation/figma/capture";
import { readAcceptedNativeBinding, acceptedPrimitivePolicy } from "./generation/native/bindings";
import { captureInstanceAudit, collectAnatomy } from "../packages/component-contract-core/src/figma-capture";
import { selectedTargetPathHint } from "../packages/component-contract-core/src/occurrence-address";
import { applyAuditPlatform } from './audit-platform';
import { snapshotPaths } from "../packages/component-contract-core/src/snapshot-topology";
import { allowedComponentPropertyNames } from "../packages/component-contract-core/src/instance-validation";
import { nativeSlotCapturePlan } from "../packages/component-contract-core/src/native-slot-capture";
import { scanArea, selectionSignature, AREA_IDENTITY_BUDGET_MS } from "./area-scan";
import { collectContractOwnedParts } from "./area-ownership";
import { validatedDependencyCapture, resolveFixedNestedBinding } from "../packages/component-contract-core/src/component-dependencies";
const runtime = require("./runtime"), engine = require('@apollo/predicate-engine');
const {auditDelivery,createAuditReportBridge}=require("./audit-report");
declare const __html__: string;
const { createUiMainBridge } = require("./design-check/ui-protocol");
declare const __APOLLO_AGENT_NATIVE_SCOPE__: any;
const {createAgentNativeBroker}=require("./generation/agent/native");
const {createAgentFigmaBroker}=require("./generation/agent/figma/embedded");
import {createAgentFigmaPolicy} from "./generation/agent/figma/policy";
const {createAgentDraftStorage}=require("./generation/agent/storage");
const {createMcpScope}=require("./generation/agent/mcp/scope");
const { createSessionBridge } = require("./generation/session/protocol");
const { createDocumentAuditBridge } = require("./document-audit/bridge");
const {createLayerNamesBridge}=require("./skills/layer-names/native");
const {resolveNativeNode,currentPageTarget}=require("./canvas-target");
const {contractFocusTargets}=require("./audit-focus");
const {boundedRead}=require("./document-audit/reads");
const {minimalRoots}=require("./document-audit/scoped-recheck");
const {createNotificationProof,observationNodes}=require("./document-audit/notification-proof");
const { collectAuditDisplayMetadata } = require("./audit-display-resources");
const {createCatalogPort}=require("./v3-binding/catalog-port");
const {createCatalogReaders}=require("./v3-binding/catalog-readers");
import {createBindingAdapter} from "./v3-binding/adapter";
const {findReferenceCandidate}=require("./v3-binding/reference-candidate");
const catalogPort=createCatalogPort(post);
const catalogReaders=createCatalogReaders(catalogPort,figma,engine.stableHash);
const { DISPLAY_METADATA_BUDGET_MS } = require("./document-audit/budgets");
const designCheckUiBridge = createUiMainBridge({ storage: figma.clientStorage, resize: (width: number, height: number) => figma.ui.resize(width, height), post });
const agentDraftStorage=createAgentDraftStorage({storage:figma.clientStorage,post});
const generationSessionBridge = createSessionBridge({ storage: figma.clientStorage, post });
// Only Proxy supplies fresh canonical source and Code Connect evidence.
const generationProxy = createGenerationProxyPort(post, runtime.contractHash);
const generationFigmaHost = createGenerationFigmaHost({ api: figma, hash: runtime.contractHash, readContext: generationProxy.readContext,
  readBinding: readAcceptedNativeBinding, primitives: acceptedPrimitivePolicy,
  capture: createGenerationNativeCapture(runtime, async mapping => {
    const reply = await requestContracts('generation-native:' + (++nativeScopeSequence), [{ componentKey: mapping.figma.componentKey }]);
    return reply;
  }) });
const generationFrontend = createGenerationFrontendPort(post,runtime.contractHash,generationProxy.readContext);
const generationController = new GenerationController({ hash: runtime.contractHash, readContext: generationProxy.readContext, figma: generationFigmaHost,frontend:generationFrontend.host });
let nativeDiagnosticEpoch = 0;
const nativePageObserver = createCurrentPageDiagnosticObserver(figma,invalidateNativeDiagnostic);
const nativeDiagnostic = createNativeDiagnostic({api:figma, hash:runtime.contractHash, inputs:__APOLLO_NATIVE_DIAGNOSTIC_INPUTS__, buildInputsSha256:__APOLLO_NATIVE_BUILD_INPUTS_SHA__, readContext:generationProxy.readContext, epoch:()=>nativeDiagnosticEpoch, observer:()=>nativePageObserver.snapshot()});
const nativeDiagnosticBridge = createNativeDiagnosticBridge(post,nativeDiagnostic);
const agentNativeBroker=createAgentNativeBroker({api:figma,scope:__APOLLO_AGENT_NATIVE_SCOPE__,hash:engine.stableHash,epoch:()=>nativeDiagnosticEpoch,observer:()=>nativePageObserver.snapshot(),post});
const agentFigmaBroker=createAgentFigmaBroker({api:figma,hash:engine.stableHash,post,policy:createAgentFigmaPolicy({api:figma,flushDraft:()=>agentDraftStorage.flush(),evaluateRuleIR:require("./generation/agent/figma/rule-ir").createReadOnlyRuleIR({contracts:require("./generation/agent/figma/principal-contracts.json")})})});
const agentMcpScope=createMcpScope({api:figma,hash:engine.stableHash,post,evaluateRuleIR:require("./generation/agent/figma/rule-ir").createReadOnlyRuleIR({contracts:require("./generation/agent/figma/principal-contracts.json")})});
function invalidateNativeDiagnostic(){nativeDiagnosticEpoch++;agentNativeBroker.invalidate();nativeDiagnosticBridge.invalidate();post({type:'native-diagnostic-invalidated'});}
let nativeScopeSequence = 0;
let busy = false, generation = 0, lastAudit: any = null, selectionId = '', localMode = false;
const localContracts = new Map<string, any>(), focusNodes = new Map<string, string>();
const pending = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void; timer: any }>();
let activeArea: {requestId:string; pageId:string; cancelling:boolean} | null = null, auditPageId = '', lastAreaRequestId='';
let areaPage: PageNode | null = null, areaObservedIds = new Set<string>(), verifyLastArea: ((operationGuard?:()=>void)=>Promise<void>) | null = null;
let contractFocusRegistry=new Map<string,any>(),contractFocusTask:any=null,lastAuditRevision:number|null=null,areaSession:any=null,areaNotificationProof:any=null;
function invalidateArea(){areaNotificationProof?.close();areaNotificationProof=null;generation++;if(lastAudit)post({type:'audit-invalidated',auditId:lastAudit.auditId});}
function observeArea(event:NodeChangeEvent){if(documentAuditBridge.isActionApplying())return;if(event.nodeChanges?.some(change=>areaObservedIds.has(change.id)||('node' in change&&change.node&&'parent' in change.node&&change.node.parent&&areaObservedIds.has(change.node.parent.id)))){if(documentAuditBridge.observeRefreshChange())return;if(areaNotificationProof)void areaNotificationProof.notify();else invalidateArea();}}
function bindAreaPage(){if(areaPage&&typeof areaPage.off==='function')areaPage.off('nodechange',observeArea);areaPage=figma.currentPage;if(typeof areaPage.on==='function')areaPage.on('nodechange',observeArea);}

const documentAuditBridge = createDocumentAuditBridge({ api: figma, hash: engine.stableHash, post, observeSelection: false, isBusy:()=>busy||Boolean(contractFocusTask), onMutation:()=>{invalidateArea();invalidateNativeDiagnostic();generationController.invalidate();generationProxy.invalidate();generationFrontend.invalidate();}, onRecheckStart:beginScopedRecheck, bindingAdapter:createBindingAdapter(catalogReaders.readCatalogs,(nodeId,property,context,data)=>{if(data)return findReferenceCandidate(data,nodeId,property);if(lastAuditRevision!==generation||areaNotificationProof?.hasPending()||auditPageId!==context.pageId||!areaSession||selectionSignature(areaSession.roots)!==context.selectionSignature)return null;return findReferenceCandidate(areaSession,nodeId,property);},catalogReaders.verifyCatalog), focus: (node: SceneNode) => {
  selectionId = selectionSignature([node]); figma.currentPage.selection = [node]; figma.viewport.scrollAndZoomIntoView([node]);
} });
const layerNamesBridge=createLayerNamesBridge({api:figma,hash:engine.stableHash,post,observer:()=>nativePageObserver.snapshot(),isBusy:()=>busy||Boolean(contractFocusTask)||documentAuditBridge.isActionBusy(),onMutation:()=>{documentAuditBridge.invalidate();invalidateArea();invalidateNativeDiagnostic();generationController.invalidate();generationProxy.invalidate();generationFrontend.invalidate();}});
function post(value: any) { figma.ui.postMessage(value); }
const auditReportBridge=createAuditReportBridge({post,read:(id:string)=>{
  if(busy||documentAuditBridge.isActionBusy()||lastAuditRevision!==generation||areaNotificationProof?.hasPending()||auditPageId!==figma.currentPage.id||lastAudit?.auditId!==id)throw Error('AUDIT_REPORT_STALE');
  return lastAudit;
}});
function refreshSelection() {
  documentAuditBridge.selectionChanged();
  invalidateNativeDiagnostic();
  const nodes = figma.currentPage.selection, id = selectionSignature(nodes), invalidated = selectionId !== id;
  if (invalidated) {
    selectionId = id;
    // Selection remains an input to the next area audit. Generation-native RPCs
    // retain their own existing selection-bound invalidation contract.
    for (const [requestId,request] of pending) if(requestId.startsWith('generation-native:')) {clearTimeout(request.timer);request.reject(new Error('Выделение изменилось. Повторите проверку.'));pending.delete(requestId);}
  }
  post({ type: 'selection', pageId: figma.currentPage.id, id, name: nodes.length === 1 ? nodes[0].name : nodes.length ? `Выбрано областей: ${nodes.length}` : '', valid: nodes.length > 0, invalidated });
}
function requestContracts(requestId: string, components: any[], releaseId?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('Прокси не ответил. Проверьте ApolloProxyControl и повторите аудит.')); }, 30000);
    pending.set(requestId, { resolve, reject, timer });
    post({ type: 'resolve-contracts', requestId, components, releaseId });
  });
}
function registerLocal(source: any) {
  const loaded = runtime.loadAuthoringSource(source), contract = loaded.contract;
  const release = { channel: 'local-file', contractId: contract.package.id, contractHash: engine.stableHash(contract),
    sourceHash: loaded.sourceHash, manualSourceHash: contract.package.manualSourceHash };
  localContracts.set(contract.package.id, { contract, release, data: require("./contract-data").contractRecord(loaded.source.manual,contract.package.manualSourceHash) });
  for (const child of source.dependencies) registerLocal(child);
  return loaded;
}
const contractDataBridge = require("./contract-data").createContractDataBridge({post,readState:()=>({mode:localMode?'local':'proxy',contracts:localMode?Array.from(localContracts.values(),item=>item.data):[]})});
function resolveItem(identity: any, items: any[]) {
  const matches = items.filter(item => {
    const keys = runtime.collectContractKeys(item.contract);
    return (identity.componentKey && keys.has(identity.componentKey)) || (identity.componentSetKey && keys.has(identity.componentSetKey));
  });
  if (matches.length > 1) throw new Error('Ключи компонента разрешились в разные контракты.');
  return matches[0];
}
function appendUiRules(contract: any, scopeId: string, rules: any[], snapshot?: any) {
  const paths = snapshot && snapshotPaths(snapshot);
  for (const rule of contract.rules) {
    const collectionId = rule.presentation.collectionId;
    const collection = collectionId && contract.facts.memberCollections?.find((c: any) => c.id === collectionId)?.collection;
    const dependencyId = /^dependencies\.(.+)\.changed$/.exec(rule.assert?.actual?.fact || '')?.[1];
    const binding = dependencyId && contract.facts.dependencyBindings?.find((b: any) => b.id === dependencyId && b.identityLock === true);
    let identityBinding;
    if (binding && paths) {
      const target = contract.facts.targets?.find((t: any) => t.semanticRole === binding.targetRole);
      const hint = target && selectedTargetPathHint(target, snapshot.source.representationId, snapshot.source.componentKey, true);
      const targetPath = hint?.split(' / ').slice(1).join(' / ');
      if (targetPath && Array.from(paths.values()).includes([targetPath,binding.relativePath].filter(Boolean).join(' / '))) identityBinding = {id:binding.id, ownerPath:[targetPath,binding.relativePath].filter(Boolean).join(' / '), portNames:binding.portNames};
    }
    rules.push({ ruleId: rule.ruleId, title: rule.presentation.title, effect: rule.effect, assert: rule.assert,
      componentScopeId: scopeId, displayContext: {collectionId,collection,identityBinding,dependency: rule.presentation.dependency && Object.assign({}, rule.presentation.dependency, {componentName: contract.componentDependencies?.find((p: any) => p.id === rule.presentation.dependency.contractDependencyId)?.contract?.facts?.component?.family})} });
  }
  for (const pin of contract.componentDependencies || []) appendUiRules(pin.contract, scopeId, rules);
}
function checkCapture(scope: any, contract: any, captured: any) {
  const plan = nativeSlotCapturePlan(contract), omissions = captured.snapshot.source?.nativeSlotCaptureScope?.omissions || [];
  const captureScope = omissions.length ? { manualSourceHash: contract.package.manualSourceHash,
    // Reuse the representation proved by capture; another adapter can expose the same port.
    boundaries: (plan?.boundaries || []).filter(boundary => boundary.representationId === captured.snapshot.source.representationId
      && omissions.some((entry: any) => entry.targetId === boundary.targetId && entry.property === boundary.property && entry.path === boundary.path)) } : undefined;
  return collectAnatomy(scope, captured.snapshot.context.platform, Object.assign({}, scope.resolvedVariableModes), captureScope);
}
async function audit(requestId: string, options:any={}) {
  if (busy) throw new Error('Проверка уже выполняется.');
  const roots:SceneNode[] = options.roots||Array.from(figma.currentPage.selection);
  if (!roots.length) throw new Error('Выделите область или слой, чтобы проверить компоненты.');
  const timingStarted = Date.now();
  const timings = { schemaVersion: 'apollo.audit-timings.v1',
    scope: options.quiet ? 'scoped-contract-audit-before-merge' : 'contract-area-audit-before-delivery',
    clock: 'Date.now', totalMs: 0, stages: [] as {stage:string;durationMs:number;scopeId?:string}[] };
  const time = (stage:string, scopeId?:string) => {
    const started = Date.now();
    return () => timings.stages.push(Object.assign({stage,durationMs:Math.max(0,Date.now()-started)},scopeId ? {scopeId} : {}));
  };
  busy = true;if(!options.quiet){lastAudit = null; focusNodes.clear();}
  const current = generation, pageId=figma.currentPage.id, fileMode = localMode;
  activeArea={requestId,pageId,cancelling:false};areaObservedIds=new Set([...(options.quiet&&areaSession?areaSession.scan.nodes.keys():[]),...roots.map(n=>n.id)]);
  const assertCurrent = () => {options.guard?.(); if (generation !== current || figma.currentPage.id!==pageId || roots.some(node => node.removed)) throw new Error('Область или её свойства изменились во время захвата. Повторите проверку. (AUDIT_CONTEXT_CHANGED)'); };
  const progress=(message:string)=>{assertCurrent();options.onProgress?.(message);if(!options.quiet)post({type:'audit-progress',requestId,message});};
  try {
    progress('Собираем ключи компонентов в выделенной области…');
    let endStage = time('scan');
    const scan = await scanArea(roots, assertCurrent);endStage();areaObservedIds=new Set([...(options.quiet&&areaSession?areaSession.scan.nodes.keys():[]),...scan.nodes.keys()]);
    const components: any[] = [], notChecked: any[] = [], governedComponents: any[] = [], rules: any[] = [], warnings: string[] = [];
    let items = Array.from(localContracts.values()), releaseId: string | undefined = fileMode ? undefined : options.releaseId;
    const identityId = (identity: any) => JSON.stringify([identity.componentKey, identity.componentSetKey]);
    const resolutions = new Map<string, any>();
    if (!fileMode && scan.selection.components.some(component => component.componentKey || component.componentSetKey)) {
      const requested = new Map<string, any>();
      for (const component of scan.selection.components) if (component.componentKey || component.componentSetKey)
        requested.set(identityId(component), { componentKey: component.componentKey, componentSetKey: component.componentSetKey });
      progress('Получаем контракты компонентов через Proxy…');
      endStage = time('resolve-contracts');
      const response = await requestContracts(requestId + ':resolve', Array.from(requested.values()), releaseId);
      endStage();
      endStage = time('compile-contracts');
      assertCurrent();
      if (!response?.releaseId || !Array.isArray(response.contracts) || !Array.isArray(response.resolutions)) throw new Error('Некорректный ответ прокси на запрос контрактов.');
      releaseId = response.releaseId;
      items = response.contracts.map((item: any) => {
        if (item.release?.evaluationMode !== undefined && item.release?.channel !== 'local-pilot') throw new Error('Draft-проверка допускается только локальным пакетом Proxy.');
        const evaluationOptions = item.release?.evaluationMode === undefined ? {} : { evaluationMode: item.release.evaluationMode };
        const loaded = runtime.loadAuthoringSource(item.source, evaluationOptions), contract = loaded.contract;
        if (item.release?.id !== releaseId || item.release.contractId !== contract.package.id || item.release.sourceHash !== loaded.sourceHash
          || item.release.manualSourceHash !== contract.package.manualSourceHash || item.release.contractHash !== engine.stableHash(contract)) throw new Error('Авторский контракт не совпадает с версией пакета прокси.');
        return { contract, release: item.release, evaluationOptions };
      });
      if (new Set(items.map(item => item.contract.package.id)).size !== items.length) throw new Error('Прокси вернул повторяющиеся контракты.');
      for (const resolution of response.resolutions) {
        const key = identityId(resolution);
        if (!requested.has(key) || resolutions.has(key) || !['resolved', 'not-found', 'identity-conflict'].includes(resolution.status)) throw new Error('Некорректное разрешение ключей компонента.');
        const matched = resolution.status === 'identity-conflict' ? undefined : resolveItem(resolution, items);
        if ((resolution.status === 'resolved' && (!matched || matched.contract.package.id !== resolution.contractId))
          || (resolution.status === 'not-found' && matched)) throw new Error('Ответ прокси не соответствует ключам компонента.');
        resolutions.set(key, resolution);
      }
      if (resolutions.size !== requested.size) throw new Error('Прокси не ответил по всем ключам компонентов.');
      endStage();
    }
    const covered = new Map<string, any>(), ownedParts = new Map<string, any>(), captures: any[] = [];
    for (const identity of scan.selection.components) {
      assertCurrent();
      if (covered.has(identity.nodeId)) { governedComponents.push(Object.assign({}, identity, covered.get(identity.nodeId))); continue; }
      const gap = (reason: string, message: string) => notChecked.push(Object.assign({}, identity, { reason, message }));
      if (!identity.componentKey && !identity.componentSetKey) {
        const failure=identity.identityRead,code=failure?.code||'AREA_IDENTITY_UNAVAILABLE';
        const reason=code==='AREA_IDENTITY_READ_TIMEOUT'?'identity-read-timeout':code==='AREA_IDENTITY_READ_FAILED'?'identity-read-failed':'identity-unavailable';
        const message=reason==='identity-read-timeout'?'Figma не вернула исходный компонент за время определения ключей.':reason==='identity-read-failed'?'Figma отклонила чтение исходного компонента.':'Исходный компонент или его библиотечный ключ недоступен.';
        gap(reason, `${message} (${code} · узел ${identity.nodeId})`); continue;
      }
      if (resolutions.get(identityId(identity))?.status === 'identity-conflict') { gap('identity-conflict', 'Ключ компонента и ключ набора относятся к разным контрактам.'); continue; }
      const item = resolveItem(identity, items);
      if (!item) {
        const ownership = identity.type === 'INSTANCE' && ownedParts.get(identity.nodeId);
        if (ownership) { governedComponents.push(Object.assign({}, identity, ownership)); continue; }
        gap('contract-not-found', 'В прокси нет главного контракта этого компонента.'); continue;
      }
      if (identity.type !== 'INSTANCE') { gap('component-definition', 'Выбрано определение компонента: проверка экземпляра по независимому эталону не выполнена.'); continue; }
      const subject = scan.nodes.get(identity.nodeId) as InstanceNode, contract = item.contract;
      progress(`Проверяем ${identity.name} · ${components.length + notChecked.length + governedComponents.length + 1}/${scan.selection.components.length}`);
      let captured: any;
      const endCapture = time('capture', subject.id);
      try {
        captured = await captureInstanceAudit(subject, { componentKey: contract.facts.component.componentKey,
          acceptedComponentKeys: Array.from(runtime.collectContractKeys(contract)), componentDependencyKeys: runtime.componentDependencyKeys(contract),
          directChildDependenciesVersion: contract.runtimePolicy.directChildDependenciesVersion,
          instanceMainComponentAliasesVersion: contract.runtimePolicy.instanceMainComponentAliasesVersion,
          representations: contract.facts.representations, allowedComponentProperties: allowedComponentPropertyNames(contract), platform: contract.facts.component.platform,
          manualSourceHash: contract.package.manualSourceHash, expectedRootNodeId: subject.id, nativeSlotCapturePlan: nativeSlotCapturePlan(contract), includePreview: false,
          onTiming:(stage,durationMs)=>timings.stages.push({stage:`capture.${stage}`,durationMs,scopeId:subject.id}),
          captureTransitionContext: contract.runtimePolicy.transitionFactsVersion === 1 });
      } catch (error) { assertCurrent(); gap('capture-failed', error instanceof Error ? error.message : String(error)); continue; }
      finally { endCapture(); }
      assertCurrent();
      endStage = time('verify-capture', subject.id);
      const check = await checkCapture(subject, contract, captured);
      if (engine.stableHash(captured.anatomy) !== engine.stableHash(check.anatomy)) throw new Error(`Свойства узла ${subject.id} изменились во время захвата. Повторите проверку. (AUDIT_CAPTURE_CHANGED · verify-capture)`);
      endStage();
      endStage = time('evaluate', subject.id);
      applyAuditPlatform(captured.snapshot, contract, options.platform);
      const result = runtime.auditContractSnapshot(captured.snapshot, contract, item.evaluationOptions), scopeId = subject.id;
      endStage();
      endStage = time('index-component', subject.id);
      const auditId = engine.stableHash({ root: scopeId, generation: current, snapshot: engine.snapshotHash(captured.snapshot), contract: engine.stableHash(contract) });
      const component = { scopeId, name: identity.name, library: contract.package.library, auditId, release: item.release, result, snapshot: captured.snapshot, warnings: captured.warnings };
      components.push(component); captures.push({ subject, contract, captured });
      const map = new Map<string, string>(); captured.anatomy.forEach((node: any) => { if (node.figmaNodeId) map.set(node.id, node.figmaNodeId); });
      for (const entry of result.engine.evaluations) {
        const id = map.get(entry.focusNodeId || entry.subjectNodeId);
        if (id) focusNodes.set(engine.stableHash([scopeId, entry.evaluationId]), id);
      }
      for (const run of result.engine.dependencyRuns || []) if (run.status === 'executed' && run.nodeId && map.has(run.nodeId)) {
        covered.set(map.get(run.nodeId)!, { byScopeId: scopeId, dependencyId: run.dependencyId, reason: 'pinned-dependency-executed' });
      }
      function registerParts(snapshot: any, ownerContract: any, nodeMap: Record<string, string>) {
        const ownerNodeId = map.get(nodeMap[snapshot.selection[0]]);
        if (!ownerNodeId) return;
        for (const part of collectContractOwnedParts(snapshot, ownerContract)) {
          const id = map.get(nodeMap[part.snapshotNodeId]);
          if (id) ownedParts.set(id, Object.assign({}, part, { byScopeId: scopeId, ownerNodeId }));
        }
      }
      const localMap: Record<string, string> = {};
      captured.snapshot.nodes.forEach((node: any) => { localMap[node.id] = node.id; });
      registerParts(captured.snapshot, contract, localMap);
      for (const run of result.engine.dependencyRuns || []) if (run.status === 'executed' && run.nodeId) {
        const pin = contract.componentDependencies?.find((pin: any) => pin.id === run.dependencyId
          && pin.componentId === run.componentId && pin.compiledHash === run.compiledHash);
        if (!pin?.contract) continue;
        const child = validatedDependencyCapture(captured.snapshot, run.nodeId, pin.contract);
        if (child.snapshot && child.nodeMap) registerParts(child.snapshot, pin.contract, child.nodeMap);
      }
      appendUiRules(contract, scopeId, rules, captured.snapshot);
      for (const warning of captured.warnings) warnings.push(identity.name + ': ' + warning);
      endStage();
    }
    // Read labels before the final capture/freshness checks, so asynchronous
    // metadata lookup cannot open an unchecked mutation window before delivery.
    // The scoped caller reads labels once for the merged report, before its final checks.
    endStage = time('display-metadata');
    const displayMetadata = options.quiet ? null : await collectAuditDisplayMetadata(figma, { components }, {budgetMs:DISPLAY_METADATA_BUDGET_MS,resolveNames:catalogReaders.resolveNames,resolveModeNames:catalogReaders.resolveModeNames});
    endStage();
    if (releaseId) {
      endStage = time('verify-release');
      progress('Подтверждаем версию контрактов через Proxy…');
      const verified = await requestContracts(requestId + ':verify', [], releaseId);
      if (verified.releaseId !== releaseId) throw new Error('Версия контрактов изменилась. Повторите проверку.');
      endStage();
    }
    // Recheck every earlier scope after later asynchronous captures, plus the
    // visible membership and identity of the entire selected area.
    for (const capture of captures) {
      assertCurrent();
      endStage = time('verify-final-capture', capture.subject.id);
      const check = await checkCapture(capture.subject, capture.contract, capture.captured);
      if (engine.stableHash(check.anatomy) !== engine.stableHash(capture.captured.anatomy)) throw new Error(`Свойства узла ${capture.subject.id} изменились во время захвата. Повторите проверку. (AUDIT_CAPTURE_CHANGED · verify-final-capture)`);
      endStage();
    }
    endStage = time('final-scan');
    const finalScan = await scanArea(roots, assertCurrent);
    if (engine.stableHash(finalScan.topology) !== engine.stableHash(scan.topology)) throw new Error('Состав или свойства выбранной области изменились. Повторите проверку. (AUDIT_TOPOLOGY_CHANGED · final-scan)');
    assertCurrent();
    endStage();
    endStage = time('aggregate');
    if (scan.selection.issues.some(issue=>issue==='area-node-limit'||issue==='area-component-limit')) warnings.push('Обход области остановлен на лимите. Проверка неполная.');
    if (scan.selection.issues.includes('area-identity-read-timeout')) warnings.push(`Figma не завершила чтение источников компонентов за ${AREA_IDENTITY_BUDGET_MS/1000} с. Проверка неполная. (AREA_IDENTITY_READ_TIMEOUT)`);
    if (scan.selection.issues.includes('area-identity-read-failed')) warnings.push('Figma отклонила чтение части источников компонентов. Проверка неполная. (AREA_IDENTITY_READ_FAILED)');
    const result = runtime.aggregateAreaResult(components, notChecked, scan.selection, governedComponents);
    const auditId = engine.stableHash({ selection: scan.selection, components: components.map(component => component.auditId), generation: current });
    const report:any = { schemaVersion: 'apollo.area-audit.v1-experimental', mode: 'selected-area', auditId,
      release: { id: releaseId, channel: fileMode ? 'local-file' : 'local-pilot' }, selection: scan.selection,
      components, notChecked, governedComponents, result, warnings };
    if(components.length===1)report.snapshot=components[0].snapshot;
    endStage();
    // Diagnostics are outside canonical snapshots and audit identity. Delivery/render time is excluded.
    report.timings = timings;
    timings.totalMs = Math.max(0,Date.now()-timingStarted);
    const data={audit:report,rules,displayMetadata,scan,captures,roots,platform:options.platform};
    if(options.quiet)return data;
    auditPageId=pageId;lastAudit=report;lastAuditRevision=current;areaSession=data;
    verifyLastArea=async(operationGuard=()=>{})=>{operationGuard();assertCurrent();for(const capture of captures){operationGuard();const check=await checkCapture(capture.subject,capture.contract,capture.captured);assertCurrent();if(engine.stableHash(check.anatomy)!==engine.stableHash(capture.captured.anatomy))throw Error('Результат устарел. Повторите проверку.');operationGuard();}operationGuard();const checked=await scanArea(roots,()=>{assertCurrent();operationGuard();});assertCurrent();operationGuard();if(engine.stableHash(checked.topology)!==engine.stableHash(scan.topology))throw Error('Результат устарел. Повторите проверку.');};
    setAreaNotificationProof(scan.nodes,verifyLastArea,()=>{if(generation!==current||lastAudit!==report||figma.currentPage.id!==pageId)throw Error('NATIVE_CONTEXT_CHANGED');});
    endStage = time('focus-targets');
    const focus=buildContractFocus(components,captures,pageId,auditId);contractFocusRegistry=focus.registry;
    endStage();
    timings.totalMs = Math.max(0,Date.now()-timingStarted);
    post(Object.assign({type:'audit-result',requestId},auditDelivery({audit:lastAudit,rules,displayMetadata,focusTargets:focus.sidecar})));
  } finally { busy = false;lastAreaRequestId=requestId;const stopped=activeArea?.cancelling===true;activeArea=null;if(options.quiet&&areaSession)areaObservedIds=new Set(areaSession.scan.nodes.keys());if(stopped)post({type:'audit-cancelled',requestId}); }
}
function buildContractFocus(components:any[],captures:any[],pageId:string,auditId:string){return contractFocusTargets({components,captures,pageId,auditId,hash:engine.stableHash,dependencyMap:(entry:any,capture:any)=>{let snapshot=capture.captured.snapshot,contract=capture.contract,dep=entry.dependency;let map:any=Object.fromEntries(snapshot.nodes.map((n:any)=>[n.id,n.id]));for(let depth=0;dep&&depth<8;depth++){const pins=(contract.componentDependencies||[]).filter((p:any)=>p.id===dep.dependencyId&&p.componentId===dep.componentId&&p.compiledHash===dep.compiledHash);if(pins.length!==1||!pins[0].contract)return null;const pin=pins[0],bindings=pin.bindings.filter((b:any)=>b.id===dep.bindingId);if(bindings.length!==1)return null;const resolved=resolveFixedNestedBinding(snapshot,pin,bindings[0],false,contract);if(resolved.status!=='active'||!resolved.nodeId||!resolved.identityValid)return null;const child=validatedDependencyCapture(snapshot,resolved.nodeId,pin.contract);if(!child.snapshot||!child.nodeMap)return null;const composed:any={};for(const [id,parentId] of Object.entries(child.nodeMap))if(map[parentId as string])composed[id]=map[parentId as string];map=composed;snapshot=child.snapshot;contract=pin.contract;dep=dep.nested;}return dep?null:map;}});}
function setAreaNotificationProof(nodes:Map<string,SceneNode>,verify:any,guard:()=>void){areaNotificationProof?.close();areaNotificationProof=createNotificationProof({nodes:observationNodes(nodes.values()),hash:engine.stableHash,guard,verify:async(g:()=>void)=>{g();await verify(g);g();},onError:()=>invalidateArea()});}
function beginScopedRecheck(plan:any,requestId:string){
 areaNotificationProof?.close();areaNotificationProof=null;
 const previous=areaSession,report=lastAudit,revision=++generation,pageId=figma.currentPage.id;
 invalidateNativeDiagnostic();generationController.invalidate();generationProxy.invalidate();generationFrontend.invalidate();
 const guard=()=>{if(generation!==revision||figma.currentPage.id!==pageId||lastAudit!==report&&lastAudit!==candidate?.audit)throw Error('NATIVE_CONTEXT_CHANGED');};
 const affectedScopes=new Set<string>();
 if(previous&&report){
  // Swap may remove native child handles. Use the accepted topology for the old
  // membership; only the fresh capture may establish replacement descendants.
  const parents=new Map<string,string>(previous.scan.topology.filter((row:any[])=>row.length===8).map((row:any[])=>[row[0],row[1]]));
  const wasBelow=(id:string,ancestor:string)=>{const seen=new Set<string>();while(id&&!seen.has(id)){if(id===ancestor)return true;seen.add(id);id=parents.get(id)||'';}return false;};
  for(const capture of previous.captures)if(Array.from(plan.ids).some((id:any)=>wasBelow(id,capture.subject.id)))affectedScopes.add(capture.subject.id);
  // A captured host owns its dependency rules, so re-evaluate that whole contract scope.
  for(const id of affectedScopes){const node=previous.scan.nodes.get(id);if(node)plan.roots.push(node);}
  plan.roots=minimalRoots(plan.roots);for(const id of previous.scan.nodes.keys())if(plan.roots.some((root:any)=>wasBelow(id,root.id)))plan.ids.add(id);
  plan.includeCurrent();areaObservedIds=new Set(previous.scan.nodes.keys());
 }
 let candidate:any=null;
 const verify=async(operationGuard:()=>void)=>{
  guard();operationGuard();
  if(!candidate)return;
  for(const capture of candidate.captures){guard();operationGuard();const check=await checkCapture(capture.subject,capture.contract,capture.captured);guard();operationGuard();if(engine.stableHash(check.anatomy)!==engine.stableHash(capture.captured.anatomy))throw Error('NATIVE_FACTS_CHANGED');}
  const checked=await scanArea(previous.roots,()=>{guard();operationGuard();});guard();operationGuard();
  const sort=(topology:any[])=>topology.slice().sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if(engine.stableHash(sort(checked.topology))!==engine.stableHash(sort(candidate.scan.topology)))throw Error('NATIVE_FACTS_CHANGED');
 };
 return{guard,verifyNotification:verify,run:async(operationGuard:()=>void,progress:(message:string)=>void=()=>{})=>{
  guard();operationGuard();if(!previous||!report)return null;
  const fresh=plan.roots.length?await audit(requestId,{roots:plan.roots,quiet:true,releaseId:report.release.id,platform:previous.platform,onProgress:progress,guard:()=>{guard();operationGuard();}}):null;guard();operationGuard();if(fresh&&fresh.audit.release.id!==report.release.id)throw Error('NATIVE_CONTEXT_CHANGED');
  const incomplete=new Set<string>();
  for(const id of affectedScopes)if(!fresh?.audit.components.some((c:any)=>c.scopeId===id&&c.result.coverage?.executionComplete))incomplete.add(id);
  const components=previous.audit.components.filter((c:any)=>!affectedScopes.has(c.scopeId)||incomplete.has(c.scopeId));
  if(fresh)components.push(...fresh.audit.components.filter((c:any)=>!incomplete.has(c.scopeId)));
  const captures=previous.captures.filter((c:any)=>!affectedScopes.has(c.subject.id));if(fresh)captures.push(...fresh.captures.filter((c:any)=>!incomplete.has(c.subject.id)));
  const notChecked=previous.audit.notChecked.filter((c:any)=>!plan.ids.has(c.nodeId));if(fresh)notChecked.push(...fresh.audit.notChecked);
  const governedComponents=previous.audit.governedComponents.filter((c:any)=>!plan.ids.has(c.nodeId)&&!affectedScopes.has(c.byScopeId));if(fresh)governedComponents.push(...fresh.audit.governedComponents);
  const nodes=new Map(previous.scan.nodes);for(const id of plan.ids)nodes.delete(id);if(fresh)for(const [id,n]of fresh.scan.nodes)nodes.set(id,n);
  const identities=previous.scan.selection.components.filter((c:any)=>!plan.ids.has(c.nodeId));if(fresh)identities.push(...fresh.scan.selection.components);
  const topology=previous.scan.topology.filter((row:any)=>!plan.ids.has(row[0]));if(fresh)topology.push(...fresh.scan.topology);
  const selection=Object.assign({},previous.scan.selection,{scannedNodes:nodes.size,components:identities,issues:Array.from(new Set([...previous.scan.selection.issues,...fresh?.scan.selection.issues||[]]))});selection.complete=selection.issues.length===0;
  const scan={selection,nodes,topology},rules=previous.rules.filter((r:any)=>!affectedScopes.has(r.componentScopeId)||incomplete.has(r.componentScopeId));if(fresh)rules.push(...fresh.rules.filter((r:any)=>!incomplete.has(r.componentScopeId)));
  const result=runtime.aggregateAreaResult(components,notChecked,selection,governedComponents),auditId=engine.stableHash([requestId,components.map((c:any)=>c.auditId)]);
  if(incomplete.size){
   result.coverage.executionComplete=false;
   // Original compliant observations in failed scopes are not current PASS evidence.
   result.engine.evaluations=result.engine.evaluations.map((e:any)=>incomplete.has(e.componentScopeId)&&['compliant','allowed','not-applicable'].includes(e.classification)?Object.assign({},e,{classification:'human-review',recheck:{status:'stale',previousClassification:e.classification}}):e);
   const counts:Record<string,number>={};for(const e of result.engine.evaluations)counts[e.classification]=(counts[e.classification]||0)+1;result.engine.coverage.byClassification=counts;
  }
  const warnings=previous.audit.warnings.slice();if(incomplete.size)warnings.push('Перепроверка части компонентов не завершена. Их прежние нарушения сохранены, переходы отключены.');if(plan.unknown.size)warnings.push('Влияние Theme на часть исходной области не удалось доказать. Перепроверены только исходно наблюдавшиеся объекты; вся страница не сканировалась.');
  const scopedAudit=Object.assign({},report,{auditId,components,notChecked,governedComponents,selection,result,warnings});if(components.length===1)scopedAudit.snapshot=components[0].snapshot;else delete scopedAudit.snapshot;
  delete scopedAudit.timings;
  if(fresh)scopedAudit.timings=fresh.audit.timings;
  progress('Читаем названия токенов и стилей…');
  const displayMetadata=await collectAuditDisplayMetadata(figma,{components},{budgetMs:DISPLAY_METADATA_BUDGET_MS,resolveNames:catalogReaders.resolveNames,resolveModeNames:catalogReaders.resolveModeNames});guard();operationGuard();
  const focus=buildContractFocus(components.filter((c:any)=>!incomplete.has(c.scopeId)),captures,pageId,auditId);
  candidate={audit:scopedAudit,rules,displayMetadata,focusTargets:focus.sidecar,staleScopeIds:Array.from(incomplete),scan,captures,roots:previous.roots,focusRegistry:focus.registry};return candidate;
 },verify,commit:(data:any,operationGuard:()=>void)=>{
  guard();operationGuard();if(!data)return null;lastAudit=data.audit;lastAuditRevision=revision;areaSession=data;contractFocusRegistry=data.focusRegistry;areaObservedIds=new Set(data.scan.nodes.keys());auditPageId=pageId;
  // The commit changes the report identity; retain the same revision guard for future focus.
  verifyLastArea=async(g=()=>{})=>{g();if(generation!==revision||figma.currentPage.id!==pageId||lastAudit!==data.audit)throw Error('NATIVE_RESULT_STALE');for(const c of data.captures){const check=await checkCapture(c.subject,c.contract,c.captured);g();if(generation!==revision||engine.stableHash(check.anatomy)!==engine.stableHash(c.captured.anatomy))throw Error('NATIVE_FACTS_CHANGED');}const checked=await scanArea(data.roots,g);g();const normalize=(rows:any[])=>rows.slice().sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));if(generation!==revision||engine.stableHash(normalize(checked.topology))!==engine.stableHash(normalize(data.scan.topology)))throw Error('NATIVE_FACTS_CHANGED');};
  setAreaNotificationProof(data.scan.nodes,verifyLastArea,()=>{if(generation!==revision||lastAudit!==data.audit||figma.currentPage.id!==pageId)throw Error('NATIVE_CONTEXT_CHANGED');});
  return auditDelivery({audit:data.audit,rules:data.rules,displayMetadata:data.displayMetadata,focusTargets:data.focusTargets,staleScopeIds:data.staleScopeIds});
 },fail:()=>{if(generation===revision)invalidateArea();for(const [id,p]of pending)if(id.startsWith(requestId+':')){clearTimeout(p.timer);pending.delete(id);p.reject(Error('Перепроверка остановлена.'));}}};
}
figma.skipInvisibleInstanceChildren = false;
figma.showUI(__html__, { width: 800, height: 860, themeColors: true });
figma.on('selectionchange', refreshSelection);
bindAreaPage();figma.on('currentpagechange',()=>{invalidateArea();bindAreaPage();refreshSelection();});figma.on('close',()=>{if(areaPage&&typeof areaPage.off==='function')areaPage.off('nodechange',observeArea);});
async function focusAuditFinding(message:any){
  const report=lastAudit,revision=lastAuditRevision;
  const reply=(success:boolean,text='',nodeId?:string)=>post({type:'audit-focus-result',requestId:message.requestId,auditId:message.auditId,targetId:message.targetId,success,message:text,nodeId});
  if(Object.keys(message).sort().join(',')!=='auditId,evaluationId,requestId,targetId,type'||[message.requestId,message.auditId,message.evaluationId,message.targetId].some((v:any)=>typeof v!=='string'||!v||v.length>150)){reply(false,'Параметры перехода несовместимы.');return;}
  const registered=contractFocusRegistry.get(message.targetId);
  if(revision!==generation||areaNotificationProof?.hasPending()||contractFocusTask||documentAuditBridge.isActionBusy()||!report||report.auditId!==message.auditId||!registered||registered.findingId!==message.evaluationId||auditPageId!==figma.currentPage.id){reply(false,'Нет актуального подтверждённого объекта для перехода. Повторите проверку.');return;}
  const task={requestId:message.requestId,report,deadline:Date.now()+15000};contractFocusTask=task;
  const guard=()=>{if(generation!==revision||areaNotificationProof?.hasPending()||Date.now()>task.deadline||contractFocusTask!==task||lastAudit!==report||report.auditId!==message.auditId||auditPageId!==figma.currentPage.id||documentAuditBridge.isActionBusy())throw Error('Переход устарел. Повторите проверку.');};
  const timer=setTimeout(()=>{if(contractFocusTask===task){contractFocusTask=null;reply(false,'Переход остановлен по таймауту. Повторите проверку.');}},15000);
  try{guard();if(verifyLastArea)await verifyLastArea(guard);guard();const node=await resolveNativeNode(figma,registered.target.nodeId,{read:(fn:any)=>boundedRead(fn,1200,guard),guard});guard();if(!currentPageTarget(node,registered.target.pageId))throw Error('Объект недоступен на проверенной странице.');guard();selectionId=selectionSignature([node]);guard();figma.currentPage.selection=[node];guard();figma.viewport.scrollAndZoomIntoView([node]);guard();reply(true,'Объект выбран в макете.',node.id);}
  catch(e){if(contractFocusTask===task)reply(false,e instanceof Error?e.message:String(e));}
  finally{clearTimeout(timer);if(contractFocusTask===task)contractFocusTask=null;}
}
// Official current-page subscription; no global document observer or page loads.
nativePageObserver.start();
documentAuditBridge.start();
figma.ui.onmessage = async (message: any) => {
  if (catalogPort.accept(message) || contractDataBridge.accept(message) || auditReportBridge.accept(message)) return;
  if (layerNamesBridge.accept(message)) return;
  if (designCheckUiBridge.accept(message)) return;
  if (generationSessionBridge.accept(message)) return;
  if (agentMcpScope.accept(message)||agentDraftStorage.accept(message)||agentNativeBroker.accept(message)||agentFigmaBroker.accept(message)) return;
  if (documentAuditBridge.accept(message)) return;
  if (!message || typeof message.type !== 'string') return;
  if(message.type==='audit-focus'){void focusAuditFinding(message);return;}
  if(message.type==='audit-focus-cancel'){if(Object.keys(message).length===2&&typeof message.requestId==='string'&&message.requestId.length<=150){if(contractFocusTask?.requestId===message.requestId)contractFocusTask=null;post({type:'audit-focus-cancelled',requestId:message.requestId});}return;}
  if(message.type==='audit-context-invalidated'){if(Object.keys(message).length===2&&lastAudit?.auditId===message.auditId)invalidateArea();return;}
  try {
    if(documentAuditBridge.isActionBusy()&&['audit','load-contract','use-proxy','generation-prepare','generation-execute','native-diagnostic-request','focus','focus-scope'].includes(message.type))throw new Error('Дождитесь завершения действия с макетом.');
    // Resolve RPC before busy checks: preparation is waiting for this response.
    if (generationFrontend.accept(message)||generationProxy.accept(message)) return;
    if (message.type === 'contracts-resolved') {
      const request = pending.get(message.requestId); if (!request) return;
      clearTimeout(request.timer); pending.delete(message.requestId);
      if (message.error) request.reject(new Error(message.error)); else request.resolve(message.data);
      return;
    }
    if (message.type === 'generation-invalidate') { invalidateNativeDiagnostic(); generationController.invalidate(); generationProxy.invalidate(); generationFrontend.invalidate(); return; }
    if (message.type === 'native-diagnostic-request') {
      if(busy){post({type:'native-diagnostic-result',requestId:message.requestId,error:'NATIVE_DIAGNOSTIC_BUSY'});return;}
      busy=true;try{await nativeDiagnosticBridge.handle(message);}finally{busy=false;}return;
    }
    if (message.type === 'generation-prepare' || message.type === 'generation-execute') {
      if (busy) throw new Error('Дождитесь завершения текущей операции.');
      busy = true;
      try {
        const result = message.type === 'generation-prepare'
          ? await generationController.prepare(message.spec)
          : await generationController.execute(message.sessionId, message.targets);
        post({ type: 'generation-result', requestId: message.requestId, result });
      } catch (error) {
        post({ type: 'generation-error', requestId: message.requestId, message: error instanceof Error ? error.message : String(error) });
      } finally { busy = false; }
      return;
    }
    if (message.type === 'ready') { void catalogReaders.initialize(); refreshSelection(); return; }
    if (message.type === 'use-proxy') {
      if (busy) throw new Error('Дождитесь завершения проверки.');
      generationController.invalidate(); generationProxy.invalidate(); generationFrontend.invalidate(); localMode = false; localContracts.clear(); generation++; lastAudit = null; focusNodes.clear();
      post({ type: 'source-mode', mode: 'proxy' }); return;
    }
    if (message.type === 'load-contract') {
      if (busy) throw new Error('Дождитесь завершения проверки.');
      const loaded = runtime.loadAuthoringSource(message.source), next = loaded.contract;
      if (message.release && (message.release.contractHash !== engine.stableHash(next) || message.release.sourceHash !== loaded.sourceHash
        || message.release.manualSourceHash !== next.package.manualSourceHash)) throw new Error('Авторский контракт не совпадает с выбранной версией пакета.');
      generationController.invalidate(); generationProxy.invalidate(); generationFrontend.invalidate(); localContracts.clear(); registerLocal(message.source); localMode = true;
      generation++; lastAudit = null; focusNodes.clear();
      post({ type: 'contract-loaded', name: next.package.family || next.facts.component.family || next.package.id, revision: loaded.source.manual.metadata.revision });
      refreshSelection(); return;
    }
    if(message.type==='audit-cancel'){if(activeArea&&activeArea.requestId===message.requestId){activeArea.cancelling=true;generation++;for(const [id,request] of pending)if(id.startsWith(message.requestId+':')){clearTimeout(request.timer);pending.delete(id);request.reject(new Error('Проверка области остановлена.'));}}else if(!activeArea&&lastAreaRequestId===message.requestId)post({type:'audit-cancelled',requestId:message.requestId});return;}
    if (message.type === 'audit') { if (message.platform !== undefined && !['desktop','mobile-web','ios','android'].includes(message.platform)) throw new Error('Некорректная платформа проверки.'); await audit(message.requestId,{platform:message.platform}); void documentAuditBridge.refreshBindings(message.requestId+':native'); return; }
    if (message.type === 'focus' || message.type === 'focus-scope') {
      if (!lastAudit || message.auditId !== lastAudit.auditId || auditPageId!==figma.currentPage.id) throw new Error('Результат устарел. Повторите проверку.');
      if(verifyLastArea)await verifyLastArea();
      const id = message.type === 'focus' ? focusNodes.get(message.evaluationId) : lastAudit.selection.components.find((component: any) => component.nodeId === message.nodeId)?.nodeId;
      const node = id && await resolveNativeNode(figma,id);
      if (!currentPageTarget(node,figma.currentPage.id)) throw new Error('Узел больше недоступен. Повторите проверку.');
      let page: BaseNode | null = node;
      while (page && page.type !== 'PAGE') page = page.parent;
      if (page?.id !== figma.currentPage.id) throw new Error('Результат относится к другой странице.');
      selectionId = selectionSignature([node as SceneNode]);
      figma.currentPage.selection = [node as SceneNode]; figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
    }
  } catch (error) { if(message.type==='audit'&&activeArea?.cancelling)return;post({ type: 'error', requestId: message.requestId, message: error instanceof Error ? error.message : String(error) }); }
};
