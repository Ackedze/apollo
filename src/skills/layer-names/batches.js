const p = require('./run-protocol')(require('./protocol'));
const b = require('./batch-protocol');
const {minimalRoots} = require('../../document-audit/scoped-recheck');

function createBatches({api,hash,post,isBusy,onMutation,fact,protection,observer}) {
  let session = null, journal = null, check = null, verification = null, lastOutcome = null, sequence = 0, writing = false;
  const selection = ()=>minimalRoots(Array.from(api.currentPage.selection)).map(n=>n.id);
  function fresh(s) {
    if (!s || api.currentPage.id !== s.pageId || JSON.stringify(selection()) !== JSON.stringify(s.roots.map(n=>n.id))) throw Error('Выделение или страница изменились. Повторите анализ.');
    const observation=observer?.();
    if(observation?.status!=='available'||observation.scope!=='current-page-nodechange'||observation.pageId!==s.pageId||observation.cleanup!=='confirmed')throw Error('Не удалось наблюдать изменения страницы. Повторите запуск плагина.');
  }
  function manifest(s) {
    return {schemaVersion:b.SCHEMA,sessionId:s.id,status:s.stack.length?'capturing':'ready',pageId:s.pageId,rootIds:s.roots.map(n=>n.id),scopeName:s.scopeName,
      observedCount:s.facts.length,candidateCount:s.nodes.length,skippedCount:s.facts.filter(f=>f.protection).length,batchCount:s.batches.length,completedCount:s.plans.size};
  }
  function pack(s) {
    const digest = hash(s.facts);
    const make = (nodes,index)=>({schemaVersion:p.SCHEMA,snapshotId:hash([digest,index,nodes.map(n=>n.nodeId)]),pageId:s.pageId,rootIds:s.roots.map(n=>n.id),scopeName:s.scopeName,nodes,observedCount:nodes.length,skippedCount:0});
    let nodes = [];
    const push = ()=>{if(nodes.length){const snapshot=make(nodes,s.batches.length);if(!p.snapshotValid(snapshot))throw Error('Не удалось подготовить пачку слоёв.');s.batches.push(snapshot);nodes=[];}};
    for (const node of s.nodes) {
      const next = nodes.concat(node);
      if (nodes.length && (next.length>b.TARGET_CANDIDATES || b.bytes(make(next,s.batches.length))>b.TARGET_BYTES)) push();
      nodes.push(node);
      if (b.bytes(make(nodes,s.batches.length))>b.TARGET_BYTES) throw Error('Контекст одного слоя слишком большой. Проверьте его название.');
    }
    push();
    if(s.batches.length>b.MAX_BATCHES)throw Error('Не удалось подготовить все пачки слоёв.');
  }
  function begin(roots,capture=null) {
    session = null; check = null;
    if (!roots.length || roots.length>100 || roots.some(n=>n.removed || ['PAGE','DOCUMENT'].includes(n.type))) throw Error('Выделите фрейм или слои в Figma.');
    const s = {id:hash(['layer-name-session',Date.now(),++sequence]),pageId:api.currentPage.id,roots,
      scopeName:(roots.length===1?roots[0].name:`Выбрано областей: ${roots.length}`).slice(0,2048)||'Выделенная область',
      facts:[],handles:new Map(),nodes:[],texts:new Map(),stack:roots.slice().reverse().map(node=>({node,path:[],entered:false})),batches:[],plans:new Map(),attempt:null,usedAttempts:new Set(),writeIds:new Set()};
    fresh(s);
    for(const root of roots){let page=root;while(page && page.type!=='PAGE')page=page.parent;if(page?.id!==s.pageId)throw Error('Страница изменилась. Повторите анализ.');}
    if(capture){s.facts=capture.facts;s.handles=capture.handles;s.nodes=capture.payload.nodes;s.stack=[];pack(s);}
    session=s;return manifest(s);
  }
  function captureNext(s) {
    const started=Date.now();let work=0;
    while(s.stack.length && work<96 && Date.now()-started<20) {
      const frame=s.stack[s.stack.length-1],node=frame.node;
      if(!frame.entered){
        if(s.handles.size>=b.MAX_SCOPE)throw Error('В области больше 50 000 слоёв. Уже подготовленные данные не считаются полным анализом.');
        const row=fact(node,hash);s.handles.set(node.id,node);s.facts.push(row);work++;
        frame.entered=true;frame.path=frame.path.concat(node.name);frame.content=[];frame.childIndex=0;
        if(!row.protection)s.nodes.push({nodeId:node.id,type:node.type,parentId:node.parent.id,oldName:node.name,path:frame.path.join(' / ').slice(-2048),texts:[]});
        if(node.visible!==false && 'characters' in node && node.characters.trim())frame.content.push(node.characters.slice(0,160));
        frame.children=node.visible!==false && node.locked!==true && !['COMPONENT','COMPONENT_SET'].includes(node.type) && 'children' in node ? node.children : [];
      }
      if(frame.childIndex<frame.children.length){const child=frame.children[frame.childIndex++];if(!s.handles.has(child.id))s.stack.push({node:child,path:frame.path,entered:false});}
      else {
        s.texts.set(node.id,frame.content);s.stack.pop();const parent=s.stack[s.stack.length-1];
        if(parent?.entered)for(const text of frame.content)if(parent.content.length<12 && !parent.content.includes(text))parent.content.push(text);
      }
    }
    if(!s.stack.length){for(const node of s.nodes)node.texts=s.texts.get(node.nodeId)||[];pack(s);s.texts.clear();}
    return manifest(s);
  }
  function saved(id,purpose) {
    const s = purpose==='undo'?journal?.saved:session;
    if(!s || s.id!==id)throw Error('Предложения устарели. Запустите новую проверку.');fresh(s);return s;
  }
  const same = (left,right)=>hash(left)===hash(right);
  function checkFact(s,old,expectedNames) {
    const expected=Object.assign({},old);if(expectedNames.has(old.id))expected.name=expectedNames.get(old.id);
    const node=s.handles.get(old.id);
    if(!node||node.removed||!same(fact(node,hash),expected))throw Error('Макет изменился после анализа. Обновите предложения.');
  }
  function currentFacts(s,expectedNames) {
    fresh(s);
    // Events arrive asynchronously, including our own renames. Recheck all facts
    // in the same synchronous window as consumption, never trusting an event epoch.
    for(const old of s.facts)checkFact(s,old,expectedNames);
  }
  function startCheck(payload) {
    const {sessionId,purpose,batchIndex,attemptId}=payload,s=saved(sessionId,purpose);
    if(s.stack.length || !['open','read','register','apply','undo','focus','resume'].includes(purpose))throw Error('Проверка области недоступна.');
    if(['open','read','register','focus'].includes(purpose) && (!Number.isInteger(batchIndex)||!s.batches[batchIndex]))throw Error('Неизвестная пачка.');
    if(['read','register'].includes(purpose) && (s.attempt?.id!==attemptId || s.attempt.index!==batchIndex))throw Error('Попытка анализа уже закрыта.');
    if(purpose==='undo' && !journal?.result.verified)throw Error('Нет проверенного переименования для отката.');
    const expectedNames=purpose==='undo'?new Map(journal.result.changes.map(c=>[c.nodeId,c.newName])):new Map();
    check={id:hash(['check',++sequence]),s,purpose,batchIndex,attemptId,cursor:0,expectedNames,done:false};
    return checkNext(check.id);
  }
  function checkNext(id) {
    if(!check || check.id!==id)throw Error('Проверка актуальности устарела.');
    const c=check;fresh(c.s);
    const started=Date.now();let work=0;
    while(c.cursor<c.s.facts.length && work++<96 && Date.now()-started<20){
      checkFact(c.s,c.s.facts[c.cursor++],c.expectedNames);
    }
    c.done=c.cursor===c.s.facts.length;
    return {checkId:c.id,checked:c.cursor,total:c.s.facts.length,done:c.done,token:c.done?c.id:null};
  }
  function consume(payload,purpose,batchIndex=null,attemptId=null) {
    const s=saved(payload.sessionId,purpose),c=check;check=null;
    if(!c || !c.done || c.id!==payload.token || c.s!==s || c.purpose!==purpose || c.batchIndex!==batchIndex || c.attemptId!==attemptId)throw Error('Проверка актуальности устарела. Повторите анализ.');
    if(['read','register'].includes(purpose) && (s.attempt?.id!==attemptId || s.attempt.index!==batchIndex))throw Error('Попытка анализа уже закрыта.');
    currentFacts(s,c.expectedNames);
    return s;
  }
  function context(s,index,ids) {
    const snapshot=s.batches[index];
    if(!Array.isArray(ids)||!ids.length||ids.length>p.MAX_CONTEXT_NODES||new Set(ids).size!==ids.length||!ids.every(id=>snapshot.nodes.some(n=>n.nodeId===id)))throw Error('Запрос контекста выходит за пачку.');
    const facts=new Map(s.facts.map(f=>[f.id,f]));
    const nodes=ids.map(id=>{
      const node=snapshot.nodes.find(n=>n.nodeId===id),row=facts.get(id),counts=new Map();
      for(const childId of row.children||[]){const child=facts.get(childId);if(child && !['hidden-or-locked','component-definition'].includes(child.protection))counts.set(child.type,(counts.get(child.type)||0)+1);}
      return Object.assign({},node,{layoutMode:row.layoutMode||null,geometry:['x','y','width','height'].map(k=>typeof row[k]==='number'&&Number.isFinite(row[k])?row[k]:null),childTypes:Array.from(counts,([type,count])=>({type,count}))});
    });
    const value={snapshotId:snapshot.snapshotId,nodes};if(!p.contextValid(value,snapshot,ids))throw Error('Контекст пачки несовместим.');return value;
  }
  function write(s,changes,restoring,operationId) {
    if(!p.string(operationId,150)||s.writeIds.has(operationId)||s.writeIds.size>=5000)throw Error('Операция записи неизвестна или уже использована.');
    for(const c of changes){const node=s.handles.get(c.nodeId);if(!node||node.removed||protection(node)||node.name!==c.oldName||!(restoring?typeof c.newName==='string':p.name(c.newName)))throw Error('Изменение недоступно. Повторите анализ.');}
    s.writeIds.add(operationId);const failures=[];writing=true;
    try{
      api.commitUndo?.();
      for(const c of changes){try{s.handles.get(c.nodeId).name=c.newName;}catch(_){failures.push(c.nodeId);break;}}
      const applied=changes.filter(c=>s.handles.get(c.nodeId)?.name===c.newName);
      const observed=changes.map(c=>({nodeId:c.nodeId,name:s.handles.get(c.nodeId)?.name??null}));
      const result={changes:applied,observed,requestedCount:changes.length,verified:false,complete:false,failures,undoAvailable:false,remainingUndoCount:0};
      const expectedNames=restoring?new Map(journal.result.changes.map(c=>[c.nodeId,c.newName])):new Map();
      for(const c of applied)expectedNames.set(c.nodeId,c.newName);
      verification={s,result,operationId,expectedNames,cursor:0,valid:true,restoring,previous:journal};
      lastOutcome={sessionId:s.id,operationId,result};
      if(!restoring)journal={saved:s,result};
      session=null;check=null;
      if(observed.some((row,i)=>row.name!==changes[i].oldName)){api.commitUndo?.();onMutation();}
      return {status:'verifying',operationId,result};
    }finally{writing=false;}
  }
  function verifyNext(id,operationId) {
    const v=verification;
    if(!p.string(operationId,150))throw Error('Неизвестная операция записи.');
    if(!v){if(lastOutcome?.sessionId===id && lastOutcome.operationId===operationId)return {status:'done',operationId,result:lastOutcome.result};throw Error('Нет результата для проверки.');}
    if(v.s.id!==id || v.operationId!==operationId)throw Error('Нет результата этой операции.');
    try{fresh(v.s);}catch(_){v.valid=false;}
    const started=Date.now();let work=0;
    while(v.cursor<v.s.facts.length && work++<96 && Date.now()-started<20){
      try{checkFact(v.s,v.s.facts[v.cursor++],v.expectedNames);}catch(_){v.valid=false;}
    }
    if(v.cursor<v.s.facts.length)return {status:'verifying',operationId,result:v.result};
    try{currentFacts(v.s,v.expectedNames);}catch(_){v.valid=false;}
    const r=v.result;r.verified=v.valid;r.complete=v.valid && r.changes.length===r.requestedCount;
    if(v.restoring){
      const restored=new Set(r.changes.map(c=>c.nodeId)),remaining=v.previous.result.changes.filter(c=>!restored.has(c.nodeId));
      journal=remaining.length?{saved:v.s,result:Object.assign({},v.previous.result,{changes:remaining,verified:v.valid})}:null;
    }
    r.remainingUndoCount=journal?.result.changes.length||0;r.undoAvailable=Boolean(journal?.result.verified && r.remainingUndoCount);
    verification=null;return {status:'done',operationId,result:r};
  }
  const keys={
    'batch-next':['sessionId'],'batch-check':['sessionId','purpose','batchIndex','attemptId'],'batch-check-next':['sessionId','checkId'],
    'batch-open':['sessionId','batchIndex','attemptId','token'],'batch-read':['sessionId','batchIndex','attemptId','token','nodeIds'],
    'batch-register':['sessionId','batchIndex','attemptId','token','plan'],'batch-apply':['sessionId','token','operationId','nodeIds'],
    'batch-undo':['sessionId','token','operationId'],'batch-focus':['sessionId','batchIndex','token','nodeId'],'batch-pause':['sessionId','attemptId'],'batch-verify':['sessionId','operationId']
  };
  function accept(m) {
    if(m?.type!=='layer-names-batch-request')return false;
    const reply=(value,error)=>post(Object.assign({type:'layer-names-batch-result',schemaVersion:b.SCHEMA,requestId:m.requestId,operation:m.operation},error?{error}:{result:value}));
    try{
      if(!p.exact(m,['type','schemaVersion','requestId','operation','payload'])||m.schemaVersion!==b.SCHEMA||!p.string(m.requestId,150)||!keys[m.operation]||!p.exact(m.payload,keys[m.operation])||!p.string(m.payload.sessionId))throw Error('Параметры пачки несовместимы.');
      if(isBusy() || writing || verification && m.operation!=='batch-verify')throw Error('Дождитесь завершения другой операции Apollo.');
      const x=m.payload;
      if(m.operation==='batch-verify'){reply(verifyNext(x.sessionId,x.operationId));return true;}
      if(m.operation==='batch-check'){reply(startCheck(x));return true;}
      if(m.operation==='batch-check-next'){if(check?.s.id!==x.sessionId)throw Error('Чужая проверка области.');reply(checkNext(x.checkId));return true;}
      const s=saved(x.sessionId,m.operation==='batch-undo'?'undo':null);
      if(m.operation==='batch-next'){if(!s.stack.length)throw Error('Чтение уже завершено.');reply(captureNext(s));}
      else if(m.operation==='batch-pause'){if(s.attempt?.id===x.attemptId)s.attempt=null;check=null;reply({paused:true});}
      else if(m.operation==='batch-open'){
        consume(x,'open',x.batchIndex,x.attemptId);
        if(!p.string(x.attemptId,150)||s.usedAttempts.has(x.attemptId)||s.usedAttempts.size>=5000||x.batchIndex!==s.plans.size)throw Error('Попытка пачки уже использована или нарушен порядок пачек.');
        s.usedAttempts.add(x.attemptId);s.attempt={id:x.attemptId,index:x.batchIndex};reply(s.batches[x.batchIndex]);
      }else if(m.operation==='batch-read'){consume(x,'read',x.batchIndex,x.attemptId);reply(context(s,x.batchIndex,x.nodeIds));}
      else if(m.operation==='batch-register'){
        consume(x,'register',x.batchIndex,x.attemptId);
        if(s.plans.has(x.batchIndex)||!p.planValid(x.plan,s.batches[x.batchIndex]))throw Error('Предложения пачки несовместимы.');
        s.plans.set(x.batchIndex,JSON.parse(JSON.stringify(x.plan)));s.attempt=null;reply({plan:s.plans.get(x.batchIndex),manifest:manifest(s)});
      }else if(m.operation==='batch-apply'){
        consume(x,'apply');const plans=Array.from(s.plans.values()).flatMap(plan=>plan.changes),ids=x.nodeIds;
        const eligible=new Set(plans.map(c=>c.nodeId));
        if(s.plans.size!==s.batches.length||!Array.isArray(ids)||!ids.length||ids.length>b.MAX_SCOPE||new Set(ids).size!==ids.length||!ids.every(id=>eligible.has(id)))throw Error('Выберите предложения из завершённого анализа.');
        const selected=new Set(ids);reply(write(s,plans.filter(c=>selected.has(c.nodeId)),false,x.operationId));
      }else if(m.operation==='batch-undo'){
        consume(x,'undo');reply(write(s,journal.result.changes.map(c=>({nodeId:c.nodeId,oldName:c.newName,newName:c.oldName})),true,x.operationId));
      }else if(m.operation==='batch-focus'){
        consume(x,'focus',x.batchIndex);if(!s.plans.get(x.batchIndex)?.changes.some(c=>c.nodeId===x.nodeId))throw Error('Слой отсутствует в предложениях.');
        api.viewport.scrollAndZoomIntoView([s.handles.get(x.nodeId)]);reply({focused:true});
      }
    }catch(error){check=null;reply(null,error.message);}
    return true;
  }
  return {begin,accept,reset:()=>{session=null;check=null;},isApplying:()=>writing||Boolean(verification)};
}
module.exports={createBatches};
