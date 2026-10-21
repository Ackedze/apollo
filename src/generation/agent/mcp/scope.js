const p=require("../protocol");
const source=require("../figma/source.json");
const {MCP_NAMESPACE,componentTarget,matchingProperties,supportsActionPlacement,assertMcpComposition}=require("../figma/target");
const {createMappingAdapter}=require("../figma/mapping");
const {createOpaqueId}=require("../../../design-check/opaque-id");
const native=require("../figma/api");
const {failureDiagnostic}=require("../../failure");
const clone=value=>JSON.parse(JSON.stringify(value));
const fail=code=>{throw Error(code);};
const NAMESPACE=MCP_NAMESPACE;

// This is a fixed independent reader/retainer, not an arbitrary-JS dispatcher.
// MCP writes have an explicitly different experimental guarantee from native.
function slotCorrespondence(node,definition,choice,wanted,hash){
 try{
  const slot=native.slot(node,choice.bodyProperty),sourceSlot=native.slot(definition,choice.bodyProperty),prefix=(node.id.startsWith('I')?node.id:'I'+node.id)+';';
  const defaultSource=sourceSlot.children[0],sourceValid=sourceSlot.id===choice.slotSourceId&&sourceSlot.children.length===1&&defaultSource?.id===choice.defaultSourceId&&defaultSource.type===choice.defaultType;
  const refValid=hash(slot.componentPropertyReferences)===hash({slotContentId:choice.bodyProperty})&&slot.id===prefix+choice.slotSourceId;
  const actual=Array.from(slot.children||[],child=>child.id),expected=wanted===null?[prefix+choice.defaultSourceId]:wanted;
  const baseline=n=>native.nodes(n).map(row=>{const value={path:row.path,type:row.node.type};for(const key of ['componentPropertyReferences','visible','fills','strokes','effects','boundVariables','layoutMode','itemSpacing','fontName','fontSize','textStyleId','characters'])if((!['fontName','fontSize','textStyleId','characters'].includes(key)||row.node.type==='TEXT')&&key in row.node&&row.node[key]!==undefined&&typeof row.node[key]!=='symbol')value[key]=clone(row.node[key]);return value;});
  const defaultExact=wanted!==null||slot.children.length===1&&hash(baseline(slot.children[0]))===hash(baseline(defaultSource));
  return{status:sourceValid&&refValid&&hash(actual)===hash(expected)&&defaultExact?'passed':'failed',sourceValid,refValid,defaultExact,slotId:slot.id,actual,expected};
 }catch(error){return{status:'failed',code:error.message};}
}
function createMcpScope({api,hash,post,evaluateRuleIR=null}){
 const runs=new Map(),mapping=source.genericMapping?createMappingAdapter(source.genericMapping):null,sourceHash=hash(source);
 function outside(page,rootId){return Array.from(page.children).filter(n=>n.id!==rootId).map(n=>({id:n.id,type:n.type,x:n.x,y:n.y,width:n.width,height:n.height,visible:n.visible}));}
 function owned(r){
  if(r.stopped||r.root.removed||r.root.parent?.id!==r.page.id||api.currentPage.id!==r.page.id||r.root.getSharedPluginData(NAMESPACE,'owner')!==r.owner)fail('AGENT_MCP_SCOPE_STALE');
  if(hash(outside(r.page,r.root.id))!==r.outsideHash)fail('AGENT_MCP_OUTSIDE_SCOPE_CHANGED');
 }
 function open(identity,version,componentIds,diagnosticContext){
  if(!p.validIdentity(identity)||identity.target!=='figma'||!p.validScreenVersion(version)||version.specHash!==identity.specHash||version.revision!==identity.revision||!componentIds||typeof componentIds!=='object')fail('AGENT_MCP_ADMISSION_INVALID');
  if(runs.has(identity.runId))fail('AGENT_MCP_RUN_REPLAY');
  if(runs.size>=16)fail('AGENT_MCP_RUN_LIMIT');
  // Component admission belongs to the server's frozen data package. This collector
  // owns only the isolated canvas scope; its catalog cannot track hot-loaded mappings.
  const page=api.currentPage,surface=outside(page,null),prior=hash(surface),owner=hash({identity,nonce:createOpaqueId()}),root=api.createFrame();
  Object.assign(diagnosticContext,{rootNodeId:root.id,nodeId:root.id,stage:'mcp-scope-root-layout'});
  // The isolated frame is retained on every failure, including an interrupted
  // remote mutation. No cleanup path removes it or restores nodes from JSON.
  root.x=Math.max(0,...surface.map(n=>n.x+n.width))+80;root.y=0;root.name='Apollo · MCP · '+version.id;root.resize(version.spec.viewport.width,version.spec.viewport.height);page.appendChild(root);diagnosticContext.stage='mcp-scope-owner';root.setSharedPluginData(NAMESPACE,'owner',owner);
  diagnosticContext.stage='mcp-scope-root-background';root.fills=[{type:'SOLID',color:{r:parseInt(version.page.background.slice(1,3),16)/255,g:parseInt(version.page.background.slice(3,5),16)/255,b:parseInt(version.page.background.slice(5,7),16)/255}}];
  const r={identity:clone(identity),version:clone(version),componentIds:clone(componentIds),page,root,rootNodeId:root.id,owner,outsideHash:prior,stopped:false,sequence:0};runs.set(identity.runId,r);owned(r);
  return{schemaVersion:'apollo.mcp-owned-scope.v1',identity:clone(identity),versionHash:version.versionHash,sourceHash,fileKey:typeof api.fileKey==='string'?api.fileKey:null,pageId:page.id,rootNodeId:root.id,ownerNonce:owner,guaranteeProfile:'experimental-mcp-owned-root-post-readback'};
 }
 function find(identity){const r=runs.get(identity?.runId);if(!r||!p.sameIdentity(r.identity,identity))fail('AGENT_MCP_SCOPE_STALE');return r;}
 async function refreshRoot(r){const root=await api.getNodeByIdAsync(r.rootNodeId);if(!root||root.removed)fail('AGENT_MCP_ARTIFACT_UNAVAILABLE');if(root.type!=='FRAME'||root.parent?.id!==r.page.id||root.parent.type!=='PAGE'||root.getSharedPluginData(NAMESPACE,'owner')!==r.owner)fail('AGENT_MCP_SCOPE_STALE');r.root=root;r.page=root.parent;}
 async function capture(identity){
  const r=find(identity);await refreshRoot(r);owned(r);
  // Generation-only receipt: do not walk components, invoke RuleIR or compare the ScreenSpec.
  const root=r.root,value=clone({schemaVersion:'apollo.mcp-fixed-readback.v1',validationMode:'generation-only',identity:clone(identity),versionHash:r.version.versionHash,sourceHash,scope:{pageId:r.page.id,rootNodeId:root.id,ownerNonce:r.owner},sequence:++r.sequence,facts:[{id:root.id,parentId:r.page.id,type:root.type,name:root.name,width:root.width,height:root.height,children:Array.from(root.children,n=>n.id)}],checks:[],normRefs:{},outsideHash:r.outsideHash,Ready:false});
  owned(r);value.evidenceHash=hash(value);if(!p.bounded(value,2097152))fail('AGENT_MCP_READBACK_LIMIT');return value;
 }
 async function read(identity){
  const r=find(identity);await refreshRoot(r);owned(r);const rows=[],nodes=[],queue=[r.root],seen=new Set(),checks=[],normRefs={};
  const add=(id,status,value,message)=>checks.push({id,status,origin:'tool-observation',message,evidenceHash:value===null?null:hash(clone(value))});
  while(queue.length){const n=queue.shift();if(n.removed||seen.has(n.id)||seen.size>=512)fail('AGENT_MCP_NODE_LIMIT');seen.add(n.id);nodes.push(n);const main=n.type==='INSTANCE'?await n.getMainComponentAsync():null;owned(r);
   const row={id:n.id,parentId:n.parent?.id||null,type:n.type,name:n.name,x:n.x,y:n.y,width:n.width,height:n.height,visible:n.visible,children:Array.from(n.children||[],c=>c.id),screenNodeId:n.getSharedPluginData?.(NAMESPACE,'screenNodeId')||null,mainKey:main?.key||null,mainWidth:main?.width??null,mainHeight:main?.height??null,mainLayoutSizingHorizontal:main?.layoutSizingHorizontal||null,mainLayoutSizingVertical:main?.layoutSizingVertical||null,mainSetKey:main?.parent?.type==='COMPONENT_SET'?main.parent.key:null};
   for(const key of ['layoutMode','itemSpacing','layoutSizingHorizontal','layoutSizingVertical','boundVariables','resolvedVariableModes','fills','strokes','opacity','cornerRadius','clipsContent'])if(key in n&&n[key]!==undefined&&n[key]!==api.mixed)row[key]=clone(n[key]);
   if(n.type==='TEXT')for(const key of ['characters','fontName','fontSize','textStyleId'])if(n[key]!==undefined&&n[key]!==api.mixed)row[key]=clone(n[key]);
   let parent=n,visible=true;for(let depth=0;parent&&depth<=512;depth++,parent=parent.parent){visible=visible&&parent.visible!==false;if(parent.id===r.root.id)break;}row.effectiveVisible=visible;row.actionId=n.getSharedPluginData?.(NAMESPACE,'actionId')||null;
   row.properties=Object.entries(n.type==='INSTANCE'?n.componentProperties||{}:{}).map(([name,value])=>({name,type:value.type,value:value.value}));rows.push(row);queue.push.apply(queue,Array.from(n.children||[]));
  }
  const tagged=new Map();for(const row of rows)if(row.screenNodeId){if(tagged.has(row.screenNodeId))fail('AGENT_MCP_DUPLICATE_BINDING');tagged.set(row.screenNodeId,row);}
  const choices=new Map(source.choices.map(c=>[c.id,c]));
  for(const spec of r.version.spec.nodes){const actual=tagged.get(spec.id),node=actual&&nodes.find(n=>n.id===actual.id);
   add('mcp-binding-'+spec.id,actual?'passed':'failed',{specId:spec.id,actualId:actual?.id||null},'Независимое соответствие узла замороженной версии.');if(!actual)continue;
   if(spec.kind==='stack'){const wanted=spec.children.map(id=>tagged.get(id)?.id||null);add('mcp-stack-'+spec.id,actual.layoutMode===(spec.direction==='vertical'?'VERTICAL':'HORIZONTAL')&&actual.itemSpacing===spec.gap&&hash(actual.children)===hash(wanted)?'passed':'failed',{expected:spec,actual},'Проверка направления, отступа и порядка.');continue;}
   if(spec.kind!=='component')continue;
   const target=componentTarget(spec,r.version.spec.platform),choice=choices.get(target.choice);
   add('mcp-source-'+spec.id,actual.type==='INSTANCE'&&choice?.key===actual.mainKey&&matchingProperties(actual.properties,target)?'passed':'failed',{expected:choice?.key||null,actual:actual.mainKey,properties:actual.properties},'Точный библиотечный источник и публичный вариант.');
   const fixedX=actual.mainLayoutSizingHorizontal==='FIXED',fixedY=actual.mainLayoutSizingVertical==='FIXED';
   add('mcp-fixed-size-'+spec.id,(!fixedX||actual.width===actual.mainWidth)&&(!fixedY||actual.height===actual.mainHeight)?'passed':'failed',{actual:{width:actual.width,height:actual.height},source:{width:actual.mainWidth,height:actual.mainHeight,fixedX,fixedY}},'Фиксированные оси сохраняют фактический размер опубликованного варианта.');
   const definition=await node.getMainComponentAsync();owned(r);if(choice?.bodyProperty){const declared=Object.hasOwn(spec.slots||{},'body'),wanted=declared?spec.slots.body.map(id=>tagged.get(id)?.id||null):null,proof=slotCorrespondence(node,definition,choice,wanted,hash);add('mcp-slot-'+spec.id,proof.status,proof,'Точный typed SLOT, inherited source, замена только default payload и порядок содержимого.');}const pairs=[{actual:node,source:definition}],stylePairs=[];let styleStatus='passed';
   while(pairs.length){const pair=pairs.shift();if(stylePairs.length>=512)fail('AGENT_MCP_NODE_LIMIT');const actualStyle={},sourceStyle={};for(const key of ['fills','strokes','effects','opacity','cornerRadius','fontName','fontSize','textStyleId','boundVariables']){if((!['fontName','fontSize','textStyleId'].includes(key)||pair.actual.type==='TEXT')&&key in pair.actual&&pair.actual[key]!==undefined&&pair.actual[key]!==api.mixed)actualStyle[key]=clone(pair.actual[key]);if((!['fontName','fontSize','textStyleId'].includes(key)||pair.source.type==='TEXT')&&key in pair.source&&pair.source[key]!==undefined&&pair.source[key]!==api.mixed)sourceStyle[key]=clone(pair.source[key]);}if(hash(actualStyle)!==hash(sourceStyle))styleStatus='failed';stylePairs.push({nodeId:pair.actual.id,sourceId:pair.source.id,actualHash:hash(actualStyle),sourceHash:hash(sourceStyle)});if(pair.actual.type==='SLOT'||pair.source.type==='SLOT')continue;const aa=Array.from(pair.actual.children||[]),bb=Array.from(pair.source.children||[]);if(aa.length!==bb.length){styleStatus='unknown';continue;}for(let index=0;index<aa.length;index++)pairs.push({actual:aa[index],source:bb[index]});}
   add('mcp-default-style-'+spec.id,styleStatus,stylePairs,'Default paint, Variable bindings и font/style сохраняют опубликованный источник; изменения цвета/стиля не подразумеваются.');
   if(mapping){const selected=mapping.select(spec,r.version.spec.platform);if(selected){
    try{const observed=await mapping.observe(node,selected,api,()=>owned(r));
     for(const portId of Object.keys(spec.props)){const port=await mapping.resolve(node,selected,portId,()=>owned(r));add('mcp-port-'+hash([spec.id,portId]).slice(0,32),mapping.readback(port,spec.props[portId])?'passed':'failed',{port:portId,value:spec.props[portId],nodeId:port.node.id},'Проверка typed public port.');}
     for(const target of observed.filter(t=>t.type==='TEXT'&&t.effectiveVisible))add('mcp-style-'+hash([spec.id,target.targetId]).slice(0,32),target.styleKey&&target.styleRangesBound&&target.tokenStatus==='passed'?'passed':'unknown',target,'Точная style/token identity; совпадение RGB не является доказательством.');
    }catch(error){owned(r);add('mcp-ports-'+spec.id,'failed',{code:error.message},'Native API correspondence не подтверждён.');}
   }}
   if(spec.actions){const subtree=new Set(),q=[actual.id];while(q.length){const id=q.shift();if(subtree.has(id))continue;subtree.add(id);q.push.apply(q,rows.find(n=>n.id===id)?.children||[]);}const actionRows=rows.filter(n=>n.actionId&&subtree.has(n.id)&&n.effectiveVisible),wanted=spec.actions.items.map(a=>a.id),byId=new Map(actionRows.map(n=>[n.actionId,n]));const visibleButtons=choice?.buttonSetKey?rows.filter(n=>subtree.has(n.id)&&n.type==='INSTANCE'&&n.effectiveVisible&&n.mainSetKey===choice.buttonSetKey):[];let good=!!choice?.buttonSetKey&&visibleButtons.length===wanted.length&&visibleButtons.every((n,i)=>n.id===actionRows[i]?.id)&&actionRows.every(n=>n.mainSetKey===choice.buttonSetKey&&n.parentId===actual.id)&&actionRows.length===wanted.length&&byId.size===wanted.length&&actionRows.every((n,i)=>n.actionId===wanted[i]);for(const action of spec.actions.items){const owner=byId.get(action.id),texts=[];if(owner){const queue=[owner.id],visited=new Set();while(queue.length){const id=queue.shift();if(visited.has(id))continue;visited.add(id);const row=rows.find(n=>n.id===id);if(row?.type==='TEXT'&&row.effectiveVisible)texts.push(row.characters);queue.push.apply(queue,row?.children||[]);}}good=good&&owner?.type==='INSTANCE'&&texts.length===1&&texts[0]===action.label;}const status=!supportsActionPlacement(choice,spec.actions)?'unknown':good?'passed':'failed';add('mcp-actions-'+spec.id,status,{expected:spec.actions.items,actual:actionRows.map(n=>({actionId:n.actionId,nodeId:n.id,parentId:n.parentId,mainSetKey:n.mainSetKey})),visibleButtonIds:visibleButtons.map(n=>n.id)},'Точные ID, порядок, эффективная видимость и тексты действий. Overflow размещение требует отдельного доказательства.');}
   const componentId=r.componentIds[spec.mappingId];
   if(evaluateRuleIR&&componentId){try{const result=await evaluateRuleIR(node,componentId,()=>owned(r));for(const evaluation of result.engine.evaluations){const status=['violation','disallowed'].includes(evaluation.classification)?'failed':['compliant','allowed','not-applicable'].includes(evaluation.classification)?'passed':'unknown';const checkId='mcp-rule-'+hash([spec.id,evaluation.ruleId]).slice(0,32);normRefs[checkId]={screenNodeId:spec.id,RuleID:evaluation.ruleId,componentId};add(checkId,status,evaluation,'Authoritative RuleIR '+evaluation.ruleId+': '+evaluation.classification);}if(!result.coverage.executionComplete)add('mcp-coverage-'+spec.id,'unknown',result.coverage,'Полное нормативное покрытие не подтверждено.');}catch(error){owned(r);add('mcp-coverage-'+spec.id,'unknown',null,'Нормативный capture недоступен: '+String(error.message).slice(0,200));}}
  }
  for(const spec of r.version.spec.nodes.filter(n=>n.kind==='stack')){const a=tagged.get(spec.id);if(!a)continue;const children=rows.filter(n=>n.parentId===a.id&&n.visible!==false);add('mcp-bounds-'+spec.id,children.every(c=>c.x>=-.01&&c.y>=-.01&&c.x+c.width<=a.width+.01&&c.y+c.height<=a.height+.01)?'passed':'failed',{parent:a,children},'Дочерние элементы без обрезания.');}
  const fill=Array.isArray(r.root.fills)?r.root.fills.find(f=>f.visible!==false&&f.type==='SOLID'&&(f.opacity===undefined||f.opacity===1)):null;const background=fill?'#'+['r','g','b'].map(k=>Math.round(fill.color[k]*255).toString(16).padStart(2,'0')).join('').toUpperCase():null;add('mcp-root-viewport',r.root.width===r.version.spec.viewport.width&&r.root.height===r.version.spec.viewport.height&&r.root.opacity===1&&background===r.version.page.background.toUpperCase()?'passed':'failed',{width:r.root.width,height:r.root.height,background,expected:r.version.spec.viewport,page:r.version.page},'Независимая проверка viewport и фона корня.');
  add('mcp-binding-set',tagged.size===r.version.spec.nodes.length&&Array.from(tagged.keys()).every(id=>r.version.spec.nodes.some(n=>n.id===id))?'passed':'failed',{actual:Array.from(tagged.keys()),expected:r.version.spec.nodes.map(n=>n.id)},'Точное множество объявленных узлов.');
  add('mcp-root-topology',r.root.children.length===1&&r.root.children[0].id===tagged.get(r.version.spec.root)?.id?'passed':'failed',{children:rows[0].children,declared:r.version.spec.root},'Точный корень ScreenSpec.');
  add('mcp-outside-surface','passed',{outsideHash:r.outsideHash},'Защищённые соседние корни: IDs, геометрия, visibility. Вложенное содержимое соседей этим профилем не доказывается.');
  add('mcp-full-norm-coverage','unknown',null,'Engineering Draft: context-only/global/live obligations и экспериментальный JS profile не дают Ready.');
  owned(r);const value=clone({schemaVersion:'apollo.mcp-fixed-readback.v1',identity:clone(identity),versionHash:r.version.versionHash,sourceHash,scope:{pageId:r.page.id,rootNodeId:r.root.id,ownerNonce:r.owner},sequence:++r.sequence,facts:rows,checks,normRefs,outsideHash:r.outsideHash,Ready:false});value.evidenceHash=hash(value);if(!p.bounded(value,2097152))fail('AGENT_MCP_READBACK_LIMIT');return value;
 }
 function accept(message){
  if(message?.type!=='agent-mcp-scope')return false;
  const reply=value=>post(Object.assign({type:'agent-mcp-scope-result',requestId:message.requestId,identity:message.identity},value));
  const diagnosticContext={phase:'native',stage:'mcp-scope-request',sourceHash,requestId:message.requestId,operation:message.operation};
  if(p.validIdentity(message.identity))Object.assign(diagnosticContext,message.identity);
  void(async()=>{try{
   if(!p.closed(message,['type','requestId','identity','operation','payload'])||!p.validIdentity(message.identity)||typeof message.requestId!=='string'||!/^[a-zA-Z0-9._:-]{1,120}$/.test(message.requestId))fail('AGENT_MCP_REQUEST_INVALID');
   let value;diagnosticContext.stage='mcp-scope-'+message.operation;
   if(message.operation==='open'){if(!p.closed(message.payload,['version','componentIds']))fail('AGENT_MCP_REQUEST_INVALID');value=open(message.identity,message.payload.version,message.payload.componentIds,diagnosticContext);}
   else{const r=find(message.identity);diagnosticContext.rootNodeId=r.rootNodeId;if(!p.closed(message.payload,[]))fail('AGENT_MCP_REQUEST_INVALID');if(message.operation==='capture')value=await capture(message.identity);else if(message.operation==='read'||message.operation==='retain')value=await read(message.identity);else if(message.operation==='stop'){await refreshRoot(r);r.stopped=true;value={preserved:true,rootNodeId:r.root.id,pageId:r.page.id};}else if(message.operation==='focus'){await refreshRoot(r);await api.setCurrentPageAsync(r.page);api.currentPage.selection=[r.root];api.viewport.scrollAndZoomIntoView([r.root]);value=true;}else fail('AGENT_MCP_REQUEST_INVALID');}
   reply({value,error:null});
  }catch(error){const code=typeof error?.message==='string'&&/^AGENT_[A-Z0-9_]{1,113}$/.test(error.message)?error.message:'AGENT_MCP_SCOPE_UNAVAILABLE',diagnostic=failureDiagnostic(code,diagnosticContext,'err:mcp-scope:'+createOpaqueId());reply({value:null,error:JSON.stringify(diagnostic)});}})();return true;
 }
 return{accept,read,capture};
}
module.exports={createMcpScope,assertMcpComposition,supportsActionPlacement,slotCorrespondence};
