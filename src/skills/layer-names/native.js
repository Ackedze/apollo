const p = require('./run-protocol')(require('./protocol'));
const {minimalRoots} = require('../../document-audit/scoped-recheck');
const batchesProtocol = require('./batch-protocol');
const {createBatches} = require('./batches');
const captureBudgetError = message => Object.assign(Error(message),{code:'LAYER_NAMES_CAPTURE_BUDGET'});
function protection(node) {
  for (let n = node, depth = 0; n && n.type !== 'DOCUMENT'; n = n.parent) {
    if (++depth > 100 || n.removed) throw Error('Слой недоступен. Повторите анализ.');
    if (n.visible === false || n.locked === true) return 'hidden-or-locked';
    if (['COMPONENT','COMPONENT_SET'].includes(n.type)) return 'component-definition';
    if (n !== node && n.type === 'INSTANCE') return 'instance-child';
  }
  if (['SLOT','SLICE'].includes(node.type) || /^SLOT(?:\b|[/:])/iu.test(node.name) || node.exportSettings?.length) return 'port-or-export';
  if ('componentPropertyReferences' in node && Object.keys(node.componentPropertyReferences || {}).length) return 'component-property';
  if (typeof node.getPluginDataKeys === 'function' && node.getPluginDataKeys().some(k => /contract|mapping|typed.?port|slot/iu.test(k))) return 'contract-metadata';
  if (['TEXT','TEXT_PATH'].includes(node.type) && node.autoRename !== false) return 'automatic-text-name';
  return null;
}
function fact(node, hash) {
  const value = {id:node.id,type:node.type,name:node.name,parentId:node.parent?.id || null,visible:node.visible,locked:node.locked};
  for (const key of ['x','y','width','height','layoutMode','itemSpacing','paddingTop','paddingBottom','paddingLeft','paddingRight','opacity','slotContentId'])
    if (key in node) value[key] = node[key];
  if ('children' in node) value.children = node.children.map(n => n.id);
  if ('characters' in node) { value.textHash = hash(node.characters); value.autoRename = node.autoRename; }
  if ('exportSettings' in node) value.exports = node.exportSettings;
  if ('componentPropertyReferences' in node) value.propertyReferences = node.componentPropertyReferences;
  value.protection = protection(node);
  return value;
}
function collect(api, roots, hash) {
  if (!roots.length || roots.length > 100 || roots.some(n => n.removed || ['PAGE','DOCUMENT'].includes(n.type))) throw Error('Выделите фрейм или слои в Figma.');
  const facts = [], handles = new Map(), candidates = [], texts = new Map(), deadline = Date.now() + 3000;
  function walk(node, path) {
    if (handles.has(node.id)) return;
    if (handles.size >= p.MAX_NODES || Date.now() > deadline) throw captureBudgetError('Область слишком большая. Выделите один фрейм или меньше слоёв.');
    const row = fact(node, hash); handles.set(node.id, node); facts.push(row);
    const currentPath = path.concat(node.name);
    if (!row.protection) candidates.push({nodeId:node.id,type:node.type,parentId:node.parent.id,oldName:node.name,path:currentPath.join(' / ').slice(-2048),texts:[]});
    const content = [];
    if (node.visible !== false && 'characters' in node && node.characters.trim()) content.push(node.characters.slice(0,160));
    // Hidden areas and library definitions supply no naming candidates or semantic evidence.
    if (node.visible !== false && node.locked !== true && !['COMPONENT','COMPONENT_SET'].includes(node.type) && 'children' in node)
      for (const child of node.children) { walk(child, currentPath); for (const text of texts.get(child.id) || []) if (content.length < 12 && !content.includes(text)) content.push(text); }
    texts.set(node.id, content);
  }
  for (const root of roots) {
    let page = root; while (page && page.type !== 'PAGE') page = page.parent;
    if (page?.id !== api.currentPage.id) throw Error('Страница изменилась. Повторите анализ.');
    walk(root, []);
  }
  if (candidates.length > p.MAX_CANDIDATES) throw captureBudgetError('Слишком много слоёв для одного анализа. Уменьшите выделение.');
  for (const item of candidates) item.texts = texts.get(item.nodeId) || [];
  const payload = {schemaVersion:p.SCHEMA,snapshotId:hash(facts),pageId:api.currentPage.id,rootIds:roots.map(n => n.id),
    scopeName:(roots.length === 1 ? roots[0].name : `Выбрано областей: ${roots.length}`).slice(0,2048) || 'Выделенная область',
    nodes:candidates,observedCount:facts.length,skippedCount:facts.filter(f => f.protection).length};
  if (!p.snapshotValid(payload)) throw Error('Не удалось подготовить контекст слоёв. Уменьшите выделение.');
  if (JSON.stringify(payload).length > 150000) throw captureBudgetError('Контекст слишком большой. Выделите один фрейм или меньше слоёв.');
  return {payload,facts,handles};
}
function createLayerNamesBridge({api,hash,post,isBusy=()=>false,onMutation=()=>{},observer}) {
  let session = null, journal = null, applying = false;
  const batches = createBatches({api,hash,post,isBusy,onMutation,fact,protection,observer});
  function current(saved, expectedNames = new Map()) {
    if (!saved || api.currentPage.id !== saved.capture.payload.pageId) throw Error('Страница изменилась. Повторите анализ.');
    const fresh = collect(api, saved.roots, hash), expected = saved.capture.facts.map(row => {
      const copy = Object.assign({}, row); if (expectedNames.has(row.id)) copy.name = expectedNames.get(row.id); return copy;
    });
    if (hash(fresh.facts) !== hash(expected)) throw Error('Макет изменился после анализа. Обновите предложения.');
    return fresh;
  }
  function write(saved, changes, restoring = false) {
    current(saved);
    const eligible = new Set(saved.capture.payload.nodes.map(n => n.nodeId));
    for (const change of changes) {
      const node = saved.capture.handles.get(change.nodeId);
      if (!node || node.removed || !eligible.has(node.id) || protection(node) || node.name !== change.oldName || !(restoring ? typeof change.newName === 'string' : p.name(change.newName))) throw Error('Изменение недоступно. Повторите анализ.');
    }
    const applied = [], failures = [];
    applying = true;
    try {
      api.commitUndo?.();
      for (const change of changes) {
        try { saved.capture.handles.get(change.nodeId).name = change.newName; }
        catch (_) { failures.push(change.nodeId); break; }
      }
      for (const change of changes) if (saved.capture.handles.get(change.nodeId)?.name === change.newName) applied.push(change);
      let verified = false;
      try { current(saved, new Map(applied.map(c => [c.nodeId,c.newName]))); verified = true; } catch (_) { /* Preserve partial writes and require a fresh analysis. */ }
      const observed = changes.map(change => ({nodeId:change.nodeId,name:saved.capture.handles.get(change.nodeId)?.name ?? null}));
      const result = {changes:applied,observed,requestedCount:changes.length,verified,complete:verified && applied.length === changes.length,failures};
      if (observed.some((row,i) => row.name !== changes[i].oldName)) { journal = {saved,result}; api.commitUndo?.(); onMutation(); }
      session = null;
      return result;
    } finally { applying = false; }
  }
  function accept(message) {
    if (batches.accept(message)) return true;
    if (message?.type !== 'layer-names-request') return false;
    const reply = result => post({type:'layer-names-result',schemaVersion:p.SCHEMA,requestId:message.requestId,operation:message.operation,result});
    try {
      if (!p.exact(message,['type','schemaVersion','requestId','operation','payload']) || message.schemaVersion !== p.SCHEMA || !p.string(message.requestId,150) || !p.exact(message.payload, message.operation === 'capture' ? [] : message.operation === 'register' ? ['snapshotId','plan'] : ['apply','read'].includes(message.operation) ? ['snapshotId','nodeIds'] : message.operation === 'undo' ? [] : ['snapshotId','nodeId'])) throw Error('Параметры навыка несовместимы.');
      if (isBusy() || applying || batches.isApplying()) throw Error('Дождитесь завершения другой операции Apollo.');
      if (message.operation === 'capture') {
        session = null;
        batches.reset();
        const roots = minimalRoots(Array.from(api.currentPage.selection));
        let capture;
        try { capture = collect(api,roots,hash); }
        catch(error) { if(error.code!=='LAYER_NAMES_CAPTURE_BUDGET')throw error;reply(batches.begin(roots));return true; }
        if(capture.payload.nodes.length>batchesProtocol.TARGET_CANDIDATES || batchesProtocol.bytes(capture.payload)>batchesProtocol.TARGET_BYTES){reply(batches.begin(roots,capture));return true;}
        session = {roots,capture,plan:null}; reply(capture.payload);
      } else if (message.operation === 'read') {
        const ids = message.payload.nodeIds;
        if (!session || message.payload.snapshotId !== session.capture.payload.snapshotId || !Array.isArray(ids) || !ids.length || ids.length>p.MAX_CONTEXT_NODES
          || new Set(ids).size!==ids.length || !ids.every(id=>session.capture.payload.nodes.some(n=>n.nodeId===id))) throw Error('Запрос контекста выходит за выбранную область.');
        if (JSON.stringify(minimalRoots(Array.from(api.currentPage.selection)).map(n=>n.id))!==JSON.stringify(session.roots.map(n=>n.id))) throw Error('Выделение изменилось. Повторите анализ.');
        current(session);
        const facts = new Map(session.capture.facts.map(f=>[f.id,f]));
        const nodes = ids.map(id=>{
          const candidate = session.capture.payload.nodes.find(n=>n.nodeId===id), row = facts.get(id), counts = new Map();
          for (const childId of row.children || []) {
            const child = facts.get(childId);
            if (child && !['hidden-or-locked','component-definition'].includes(child.protection)) counts.set(child.type,(counts.get(child.type)||0)+1);
          }
          return Object.assign({},candidate,{layoutMode:row.layoutMode || null,geometry:['x','y','width','height'].map(k=>typeof row[k]==='number' && Number.isFinite(row[k]) ? row[k] : null),childTypes:Array.from(counts,([type,count])=>({type,count}))});
        });
        const context = {snapshotId:session.capture.payload.snapshotId,nodes};
        if (!p.contextValid(context,session.capture.payload,ids)) throw Error('Не удалось подготовить контекст слоёв.');
        reply(context);
      } else if (message.operation === 'register') {
        if (!session || message.payload.snapshotId !== session.capture.payload.snapshotId || !p.planValid(message.payload.plan,session.capture.payload)) throw Error('Предложения несовместимы. Повторите анализ.');
        current(session); session.plan = JSON.parse(JSON.stringify(message.payload.plan)); reply(session.plan);
      } else if (message.operation === 'apply') {
        const ids = message.payload.nodeIds;
        if (!session?.plan || message.payload.snapshotId !== session.capture.payload.snapshotId || !Array.isArray(ids) || !ids.length || ids.length > p.MAX_CANDIDATES || new Set(ids).size !== ids.length || !ids.every(id => session.plan.changes.some(c => c.nodeId === id))) throw Error('Выберите предложения из актуального списка.');
        reply(write(session, session.plan.changes.filter(c => ids.includes(c.nodeId))));
      } else if (message.operation === 'undo') {
        if (!journal?.result.verified) throw Error('Нет проверенного переименования для отката.');
        const previous = journal, expected = new Map(previous.result.changes.map(c => [c.nodeId,c.newName]));
        const fresh = current(previous.saved, expected), saved = {roots:previous.saved.roots,capture:fresh};
        const result = write(saved, previous.result.changes.map(c => ({nodeId:c.nodeId,oldName:c.newName,newName:c.oldName})),true);
        journal = null; reply(result);
      } else if (message.operation === 'focus') {
        if (!session || message.payload.snapshotId !== session.capture.payload.snapshotId || !session.plan?.changes.some(c => c.nodeId === message.payload.nodeId)) throw Error('Предложения устарели. Повторите анализ.');
        current(session); const node = session.capture.handles.get(message.payload.nodeId);
        api.viewport.scrollAndZoomIntoView([node]); reply({focused:true});
      } else throw Error('Неизвестное действие навыка.');
    } catch (error) {
      post({type:'layer-names-result',schemaVersion:p.SCHEMA,requestId:message.requestId,operation:message.operation,error:error.message});
    }
    return true;
  }
  return {accept,isApplying:()=>applying||batches.isApplying()};
}
module.exports = {protection,fact,collect,createLayerNamesBridge};
