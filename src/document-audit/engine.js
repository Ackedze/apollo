const {resolveNativeNode}=require("../canvas-target");
// Native evidence only. No reference loader, contract engine or corrective action.
const {getDetachedLibraryComponentKey,detachedValue}=require("./detached");
const {styleValue,variableValue,linkedStyleValue,describeNativeStyles}=require("./styles");
const {parallel,boundedRead}=require("./reads");
const LIMITS={selection:10000,definitions:1000,source:10000,page:10000,findings:1800,imports:300,collections:300,concurrency:12,readMs:1200};
const signature=nodes=>nodes.map(n=>n.id).sort().join('|');
function pageOf(node){let n=node,seen=new Set();while(n&&!seen.has(n.id)){seen.add(n.id);if(n.type==='PAGE')return n;n=n.parent;}return null;}
function visible(node){let n=node,seen=new Set();while(n&&n.type!=='PAGE'&&!seen.has(n.id)){seen.add(n.id);if(n.visible===false||n.removed)return false;n=n.parent;}return true;}
function nodeValue(n){const scene=n.type!=='PAGE'&&n.type!=='DOCUMENT';return {id:n.id,type:n.type,name:String(n.name||n.type),parent:n.parent?.id||null,pageId:pageOf(n)?.id||null,visible:scene?n.visible!==false:null,removed:!!n.removed,children:scene&&'children' in n?Array.from(n.children).map(x=>x.id):[],resolvedModes:null};}
function mainValue(n){return n?{id:n.id,key:typeof n.key==='string'?n.key:null,remote:typeof n.remote==='boolean'?n.remote:null,pageId:pageOf(n)?.id||null,name:String(n.name||'Компонент')}:null;}
function collectionValue(c){return c?{id:c.id,name:String(c.name),key:typeof c.key==='string'?c.key:null,remote:typeof c.remote==='boolean'?c.remote:null,defaultModeId:typeof c.defaultModeId==='string'?c.defaultModeId:null,modes:c.modes.map(m=>({modeId:m.modeId,name:m.name}))}:null;}
async function collect(api,context,{hash,assertCurrent,limits={},roots:capturedRoots,onProgress=async()=>{},readTimeoutMs,scoped=false}){
 const bound=Object.assign({},LIMITS,limits),facts=new Map(),targets=new Map(),nodes=new Map(),mainCache=new Map(),published=new Map();
 const checks=[{id:'local',scope:'visible-selected-area-and-local-source-definitions',status:'complete',findings:[],gaps:[],checked:0,categoryComplete:false},{id:'freshness',scope:'published-version-at-run; independent-instances-and-local-source-dependencies',status:'complete',findings:[],gaps:[],checked:0,categoryComplete:false},{id:'theme',scope:'current-page-explicit-theme-mode; Desktop/MobileWeb',status:'complete',findings:[],gaps:[],checked:0,categoryComplete:false}];
 checks.push({id:'detached',scope:'visible-selected-area; native-library-detachedInfo-only',status:'complete',findings:[],gaps:[],checked:0,categoryComplete:false});
 checks.push({id:'customStyles',scope:'visible-selected-area; native-unbound-paints-effects-typography; no DS-membership or detach-history claim',status:'complete',findings:[],gaps:[],checked:0,categoryComplete:false});
 checks.push({id:'font',scope:'current-page-Font-mode; explicit-or-collection-default; Desktop/MobileWeb',status:'complete',findings:[],gaps:[],checked:0,categoryComplete:false});
 const finished=new Set(['detached']);
 const [local,fresh,theme,detached,styles,font]=checks;const versions=[],versionSeen=new Set();
 const queueVersion=args=>{const id=args[0].id+':'+(args[1]?.id||'')+':'+args[3];if(!versionSeen.has(id)){versionSeen.add(id);versions.push(args);}};
 const units=new Map(checks.map(c=>[c.id,new Set()])),modeGraph=new Map(),resolvedStyles=new Map();
 const observation=()=>({checks,facts:Array.from(facts.values()),targets,nodes,units,modeGraph,resolvedStyles});
 const read=fn=>boundedRead(fn,readTimeoutMs?readTimeoutMs():bound.readMs,assertCurrent);
 let progressQueue=Promise.resolve();
 const checkpoint=()=>{const o=observation(),snapshot={checks:JSON.parse(JSON.stringify(o.checks)).map(c=>{if(!finished.has(c.id))c.status='running';return c;}),facts:o.facts,targets:new Map(o.targets),nodes:new Map(o.nodes),units:new Map(Array.from(o.units,([id,values])=>[id,new Set(values)])),modeGraph:new Map(o.modeGraph),resolvedStyles:new Map(o.resolvedStyles)};progressQueue=progressQueue.then(async()=>{assertCurrent();await onProgress(snapshot);assertCurrent();});return progressQueue;};
 function gap(c,reason){c.status='incomplete';if(!c.gaps.includes(reason)&&c.gaps.length<1900)c.gaps.push(reason);}
 function remember(n){if(!n||n.removed)return;nodes.set(n.id,n);facts.set('node:'+n.id,{kind:'node',id:n.id,value:nodeValue(n)});}
 async function main(n){
  if(!mainCache.has(n.id))mainCache.set(n.id,(async()=>{
   let m=null,available=true;try{m=['COMPONENT','COMPONENT_SET'].includes(n.type)?n:await read(()=>n.getMainComponentAsync());}catch(_){available=false;}
   assertCurrent();if(available)facts.set('main:'+n.id,{kind:'main',id:n.id,value:mainValue(m)});return m;
  })());return mainCache.get(n.id);
 }
 function target(n,kind){if(!n||n.removed||pageOf(n)?.id!==context.pageId||!visible(n))return null;remember(n);const id=hash([n.id,kind]);const t={id,kind,nodeId:n.id,pageId:context.pageId};targets.set(id,t);return t;}
 function finding(c,status,n,message,{owner=null,occurrences=[],componentKey=null,evidence={}}={}){
  if(c.findings.length>=bound.findings){gap(c,'finding-limit');return null;}
  const focus=[];for(const id of occurrences){const t=target(nodes.get(id),'occurrence');if(t&&!focus.some(x=>x.id===t.id))focus.push(t);}
  const pageCheck=c.id==='theme'||c.id==='font';
  if(owner){const t=target(owner,'owner');if(t&&!focus.some(x=>x.id===t.id))focus.push(t);}else if(!focus.length){const t=target(n,pageCheck?'page-anchor':'occurrence');if(t)focus.push(t);}
  const f={findingId:hash([c.id,status,n?.id||context.pageId,owner?.id||null]),status,name:String(pageCheck?'Страница: '+api.currentPage.name:n?.name||'Текущая страница').slice(0,500),message,componentKey:componentKey||null,owner:owner?{id:owner.id,name:String(owner.name||'Локальный компонент').slice(0,500),pageId:pageOf(owner)?.id||'unavailable'}:null,occurrences:Array.from(new Set(occurrences)).slice(0,1000),targets:focus,evidence};c.findings.push(f);return f;
 }
 async function version(n,owner=null,occurrences=[],scope='independent-instance'){
  assertCurrent();if(scope==='instance-sublayer')return;
  const m=await main(n);fresh.checked++;units.get(fresh.id).add(n.id);
  const common={owner,occurrences,componentKey:m?.key||null,evidence:{scope,sourceNodeId:owner?n.id:null,currentComponentId:m?.id||null,latestComponentId:null}};
  if(!m||typeof m.remote!=='boolean'){gap(fresh,'main-component-unavailable');finding(fresh,'unknown',n,'Не удалось прочитать исходный компонент. Повторите проверку.',common);return;}
  if(!m.remote)return;
  const key=typeof m.key==='string'?m.key.trim():'';
  if(readTimeoutMs&&readTimeoutMs()<=0){gap(fresh,'published-read-timeout');finding(fresh,'unknown',n,'Чтение опубликованной версии не завершено в этом запуске.',common);return;}
  if(!key){gap(fresh,'component-key-missing');finding(fresh,'unknown',n,'Не удалось определить библиотечный ключ компонента.',common);return;}
  if(!published.has(key)){
   if(published.size>=bound.imports){gap(fresh,'published-import-limit');finding(fresh,'unknown',n,'Достигнут лимит чтения опубликованных компонентов.',common);return;}
   published.set(key,Promise.resolve().then(()=>api.importComponentByKeyAsync(key)));
  }
  let latest;try{latest=await read(()=>published.get(key));}catch(_){assertCurrent();gap(fresh,'component-import-failed');finding(fresh,'unknown',n,'Опубликованная версия недоступна. Проверьте доступ к библиотеке и повторите проверку.',common);return;}
  assertCurrent();common.evidence.latestComponentId=latest?.id||null;
  if(!latest||latest.key!==key||latest.remote!==true||typeof latest.id!=='string'){gap(fresh,'component-import-identity-mismatch');finding(fresh,'unknown',n,'Опубликованный компонент не совпал с библиотечным ключом.',common);return;}
  facts.set('identity:'+latest.id,{kind:'identity',id:latest.id,value:mainValue(latest)});
  finding(fresh,latest.id===m.id?'current':'update',n,latest.id===m.id?'Экземпляр использует опубликованную версию. Соответствие дизайн-системе проверяется отдельно.':'Доступна новая опубликованная версия компонента.',common);
 }
 const selected=capturedRoots||Array.from(api.currentPage.selection),selectedIds=new Set(selected.map(n=>n.id));
 const roots=selected.filter(n=>{let p=n.parent;while(p&&p.type!=='PAGE'){if(selectedIds.has(p.id))return false;p=p.parent;}return true;});
 if(!roots.length){gap(local,'empty-selection');gap(fresh,'empty-selection');gap(detached,'empty-selection');gap(styles,'empty-selection');}
 const stack=roots.slice().reverse(),seen=new Set(),owners=new Map();
 async function locality(n,occurrences){
  local.checked++;units.get(local.id).add(n.id);const m=await main(n);
  if(!m||typeof m.remote!=='boolean'){gap(local,'main-component-unavailable');finding(local,'unknown',n,'Не удалось определить, локальный это компонент или библиотечный.',{occurrences});return;}
  if(m.remote===false){
   let owner=owners.get(m.id);if(!owner){owner={node:m,occurrences:new Set(),done:new Set()};owners.set(m.id,owner);}
   occurrences.forEach(id=>{ if(owner.occurrences.size < 1000)owner.occurrences.add(id); else if(!owner.occurrences.has(id)){gap(local,'occurrence-limit');gap(fresh,'occurrence-limit');} });
  }
 }
 const subjects=[];
 while(stack.length){assertCurrent();const n=stack.pop();if(!n||seen.has(n.id))continue;if(seen.size>=bound.selection){gap(local,'selection-node-limit');gap(fresh,'selection-node-limit');gap(detached,'selection-node-limit');break;}seen.add(n.id);if(!visible(n))continue;remember(n);
  if(['INSTANCE','COMPONENT','COMPONENT_SET'].includes(n.type))subjects.push(n);
  if(n.type==='FRAME'||n.type==='GROUP'){
   detached.checked++;units.get(detached.id).add(n.id);let key=null;try{key=getDetachedLibraryComponentKey(n);facts.set('detached:'+n.id,{kind:'detached',id:n.id,value:detachedValue(n)});}catch(_){gap(detached,'detached-provenance-unavailable');}
   if(key)finding(detached,'detached',n,'Компонент отвязан от библиотеки. Происхождение подтверждено Figma.',{occurrences:[n.id],componentKey:key,evidence:{source:'native-detachedInfo',type:'library',componentKey:key}});
  }
  if('children' in n)stack.push(...Array.from(n.children).reverse());
  if(seen.size%128===0)await new Promise(resolve=>setTimeout(resolve,0));
 }
 // Resolved collection identities plus explicit ancestor overrides prove PAGE inheritance.
 for(const n of nodes.values()){
  if(n.type==='PAGE'||n.type==='DOCUMENT')continue;
  const chain=[],overridden=new Set();let complete=true,p=n,seenModes=new Set();
  while(p&&p.type!=='PAGE'&&p.type!=='DOCUMENT'&&!seenModes.has(p.id)){
   seenModes.add(p.id);
   try{const explicit=p.explicitVariableModes;if(!explicit||typeof explicit!=='object'){complete=false;break;}
    const value=Object.assign({},explicit);chain.push({id:p.id,value});Object.keys(value).forEach(id=>overridden.add(id));
    facts.set('explicitModes:'+p.id,{kind:'explicitModes',id:p.id,value});
   }catch(_){complete=false;break;}p=p.parent;
  }
  let resolved=[];try{if(!n.resolvedVariableModes)complete=false;else resolved=Object.keys(n.resolvedVariableModes);}catch(_){complete=false;}
  modeGraph.set(n.id,{complete,resolved,overridden:Array.from(overridden),chain});
 }
 // Theme and provenance finish before any published-version RPC. Running checks
 // carry explicit coverage rather than hiding independently established findings.
 local.status='running';fresh.status='running';theme.status='running';styles.status='running';
 async function checkStyles(){
 styles.status=roots.length?'complete':'incomplete';const styleCache=new Map(),variableCache=new Map();
 await parallel(Array.from(nodes.values()).filter(n=>n.type!=='PAGE'&&n.type!=='DOCUMENT'),bound.concurrency,async n=>{
  if(n.type==='SECTION')return;styles.checked++;units.get(styles.id).add(n.id);let diagnostic;
  try{const value=styleValue(n);facts.set('styles:'+n.id,{kind:'styles',id:n.id,value});diagnostic=await describeNativeStyles(api,n,{read,styleCache,variableCache});}
  catch(_){gap(styles,'native-style-read-unavailable');finding(styles,'unknown',n,'Не удалось прочитать связь со стилем. Её состояние не подтверждено.',{occurrences:[n.id],evidence:{nativeStyleRead:'unavailable'}});return;}
  assertCurrent();
  resolvedStyles.set(n.id,diagnostic.resolved);
  for(const reason of diagnostic.gaps)gap(styles,reason);
  for(const resource of diagnostic.resources)if(resource.value)facts.set(resource.kind+':'+resource.id,resource);
  for(const entry of diagnostic.findings){const f=finding(styles,entry.status,n,entry.status==='unknown'?'Связанный стиль или токен недоступен. Его состояние не подтверждено.':'Не задана связь со стилем или переменной: '+({fills:'заливка',strokes:'обводка',effects:'эффекты',typography:'типографика'}[entry.property])+'.',{occurrences:[n.id],evidence:entry.evidence});if(f)f.findingId=hash(['customStyles',n.id,entry.property]);}
 });
 // Native binding state is not a replacement for v3's catalog and policy gates.
 // Exact library/context exceptions require authority that this subset lacks.
 if(styles.findings.length)gap(styles,'v3-catalog-policy-not-connected');
 finished.add('customStyles');await checkpoint();
 }
 async function checkLocal(){
  local.status=roots.length?'complete':'incomplete';
 await parallel(subjects,bound.concurrency,async n=>{
  await locality(n,[n.id]);
  if(n.type==='INSTANCE'){let p=n.parent,scope='independent-instance';while(p&&p.type!=='PAGE'){if(p.type==='SLOT'){scope='projected-slot-root';break;}if(p.type==='INSTANCE'){scope='instance-sublayer';break;}p=p.parent;}queueVersion([n,null,[n.id],scope]);}
 });
 let sourceCount=0,rounds=0;
 while(Array.from(owners.values()).some(o=>o.occurrences.size>o.done.size)){
  assertCurrent();if(owners.size>bound.definitions||++rounds>bound.definitions){gap(local,'source-definition-limit');gap(fresh,'source-definition-limit');break;}
  for(const owner of Array.from(owners.values())){
   const todo=Array.from(owner.occurrences).filter(id=>!owner.done.has(id));if(!todo.length)continue;todo.forEach(id=>owner.done.add(id));remember(owner.node);
   const children=Array.from(owner.node.children||[]).reverse(),visited=new Set(),dependencyNodes=[];
   while(children.length){assertCurrent();const n=children.pop();if(visited.has(n.id))continue;visited.add(n.id);if(++sourceCount>bound.source){gap(local,'source-node-limit');gap(fresh,'source-node-limit');children.length=0;break;}if(!visible(n))continue;remember(n);
    if(['INSTANCE','COMPONENT','COMPONENT_SET'].includes(n.type)){dependencyNodes.push(n);if(n.type==='INSTANCE')continue;}
    if('children' in n)children.push(...Array.from(n.children).reverse());
   }
   await parallel(dependencyNodes,bound.concurrency,async n=>{
    if(n.type!=='INSTANCE'){await locality(n,Array.from(owner.occurrences));return;}
    const m=await main(n);
    if(!m||typeof m.remote!=='boolean'){gap(local,'source-main-unavailable');gap(fresh,'source-main-unavailable');finding(local,'unknown',n,'Не удалось прочитать зависимость локального определения.',{owner:owner.node,occurrences:Array.from(owner.occurrences)});return;}
    if(m.remote)queueVersion([n,owner.node,Array.from(owner.occurrences),'local-source-dependency']);else await locality(n,Array.from(owner.occurrences));
   });
  }
  if(sourceCount>bound.source)break;
 }
 for(const owner of owners.values())finding(local,'local',owner.node,'Определение находится в текущем файле. Наличие ключа или записи в каталоге не меняет его локальность.',{owner:owner.node,occurrences:Array.from(owner.occurrences),componentKey:owner.node.key||null,evidence:{nativeRemote:false}});
 finished.add('local');await checkpoint();
 }
 await Promise.all([checkTheme().then(()=>{finished.add('theme');finished.add('font');return checkpoint();}),checkStyles(),checkLocal()]);
 fresh.status=fresh.gaps.length?'incomplete':'complete';
 await parallel(versions,bound.concurrency,async args=>{await version(...args);});
 // Late-discovered occurrences share the source-owner diagnostic, without duplicate entries.
 for(const f of fresh.findings)if(f.owner&&owners.has(f.owner.id)){
  const o=owners.get(f.owner.id);f.occurrences=Array.from(o.occurrences);f.targets=f.occurrences.map(id=>target(nodes.get(id),'occurrence')).filter(Boolean);const own=target(o.node,'owner');if(own)f.targets.push(own);
 }
 return observation();
 async function checkTheme(){
 theme.status='complete';font.status='complete';
 if(['iOS','Android'].includes(context.platform)){theme.status='not-applicable';font.status='not-applicable';}
 else{
  const page=api.currentPage,groups=new Map(),collectionIds=new Set();remember(page);
  const explicit=Object.assign({},page.explicitVariableModes||{});
  facts.set('pageModes:'+page.id,{kind:'pageModes',id:page.id,value:explicit});
  async function collection(id){
   if(collectionIds.has(id))return;
   if(collectionIds.size>=bound.collections){gap(theme,'collection-limit');gap(font,'collection-limit');return;}
   collectionIds.add(id);let c=null;
   try{c=await read(()=>api.variables.getVariableCollectionByIdAsync(id));}catch(_){/* recorded as unavailable below */}
   assertCurrent();facts.set('collection:'+id,{kind:'collection',id,value:collectionValue(c)});
   if(!c){gap(theme,'variable-collection-unavailable');gap(font,'variable-collection-unavailable');return;}
   // Different native IDs can represent the same published collection. Only an exact
   // native remote/key identity proves that relationship; no ID suffix/name guessing.
   const identity=c.remote===true&&typeof c.key==='string'&&c.key?'published:'+c.key:'id:'+c.id;
   let group=groups.get(identity);if(!group){group={aliases:new Set(),collections:[]};groups.set(identity,group);}
   group.aliases.add(id);group.aliases.add(c.id);group.collections.push(c);
  }
  // PAGE supports explicit modes, not SceneNode resolved modes. Explicit collections
  // are relevant even when no selected node uses variables or the page is empty.
  for(const id of Object.keys(explicit)){assertCurrent();await collection(id);}
  for(const n of nodes.values())if(n.type!=='PAGE'&&n.type!=='DOCUMENT'){const modes=Object.assign({},n.resolvedVariableModes||{});if(Object.keys(modes).length)facts.set('sceneModes:'+n.id,{kind:'sceneModes',id:n.id,value:modes});for(const id of Object.keys(modes))await collection(id);}
  const knownTheme=Array.from(groups.values()).some(g=>g.collections.some(c=>String(c.name).trim().toLowerCase()==='theme'));
  const knownFont=Array.from(groups.values()).some(g=>g.collections.some(c=>String(c.name).trim().toLowerCase()==='font'));
  const tree=knownTheme&&knownFont||scoped?[]:Array.from(page.children).reverse(),pageSeen=new Set();
  while(tree.length){assertCurrent();const n=tree.pop();if(pageSeen.has(n.id))continue;if(pageSeen.size>=bound.page){if(!knownTheme)gap(theme,'page-node-limit');if(!knownFont)gap(font,'page-node-limit');break;}pageSeen.add(n.id);
   for(const id of Object.keys(n.resolvedVariableModes||{}))await collection(id);
   if('children' in n)tree.push(...Array.from(n.children).reverse());
  }
  theme.checked=1+(knownTheme?0:pageSeen.size);font.checked=1+(knownFont?0:pageSeen.size);
  units.get(theme.id).add(page.id);units.get(font.id).add(page.id);for(const id of pageSeen){if(!knownTheme)units.get(theme.id).add(id);if(!knownFont)units.get(font.id).add(id);}
  const normalize=name=>String(name).trim().toLowerCase().replace(/\s+/g,' ');
  const themeGroups=Array.from(groups.values()).filter(g=>g.collections.some(c=>normalize(c.name)==='theme'));
  const anchor=roots.find(visible)||Array.from(nodes.values()).find(n=>n.type!=='PAGE'&&visible(n)&&pageOf(n)?.id===context.pageId);
  if(themeGroups.length!==1){gap(theme,themeGroups.length?'theme-collection-ambiguous':'theme-collection-unavailable');finding(theme,'unknown',anchor,'Не удалось однозначно определить коллекцию Theme на текущей странице.',{evidence:{pageId:page.id,collectionCount:themeGroups.length}});}
  else{
   const group=themeGroups[0],collections=group.collections,c=collections[0];
   const corp=collections.map(c=>c.modes.filter(m=>m.name==='Corp'));
   const corpIds=new Set(corp.flatMap(m=>m.map(x=>x.modeId)));
   const actualIds=new Set(Array.from(group.aliases).filter(id=>Object.hasOwn(explicit,id)).map(id=>explicit[id]));
   const actual=actualIds.size===1?Array.from(actualIds)[0]:null;
   const evidence={pageId:page.id,collectionId:c.id,collectionKey:c.key||null,collectionRemote:c.remote===true,collectionName:c.name,aliasCount:group.aliases.size,collectionAliases:Array.from(group.aliases).slice(0,8)};
   let message='';
   if(collections.some(c=>normalize(c.name)!=='theme')){gap(theme,'theme-collection-identity-conflict');message='Представления коллекции Theme противоречат друг другу.';}
   else if(corp.some(m=>m.length!==1)||corpIds.size!==1){gap(theme,corp.some(m=>m.length!==1)?'corp-mode-unavailable':'corp-mode-alias-conflict');message='В коллекции Theme не найден однозначный режим Corp.';}
   else if(actualIds.size>1){gap(theme,'page-theme-mode-alias-conflict');message='На странице заданы конфликтующие режимы одной коллекции Theme.';}
   else if(actual!==null&&collections.some(c=>c.modes.filter(m=>m.modeId===actual).length!==1)){gap(theme,'page-theme-mode-unavailable');message='Не удалось подтвердить режим Theme, заданный на странице.';}
   else if(actual!==null&&new Set(collections.map(c=>c.modes.find(m=>m.modeId===actual)?.name)).size!==1){gap(theme,'page-theme-mode-alias-conflict');message='Названия заданного режима Theme противоречат друг другу.';}
   if(message)finding(theme,'unknown',anchor,message||'Поиск темизации страницы не завершён. Проверьте доступ к переменным и повторите проверку.',{evidence});
   else{
    const expected=Array.from(corpIds)[0],matches=actual===expected;
    evidence.expectedModeId=expected;evidence.actualModeId=actual;evidence.actualModeName=actual===null?null:c.modes.find(m=>m.modeId===actual).name;
    finding(theme,matches?'theme-current':'theme-mismatch',anchor,matches?'На текущей странице явно выбран режим Corp.':'На текущей странице не выбран явный режим Corp.',{evidence});
   }
  }
  const fontGroups=Array.from(groups.values()).filter(g=>g.collections.some(c=>normalize(c.name)==='font')),modes=[],unknown=[];
  for(const group of fontGroups){
   const collections=group.collections,c=collections[0],actualIds=new Set(Array.from(group.aliases).filter(id=>Object.hasOwn(explicit,id)).map(id=>explicit[id]));
   const defaults=new Set(collections.map(c=>c.defaultModeId)),expected=collections.map(c=>c.modes.filter(m=>normalize(m.name)==='alfasans'));
   const expectedIds=new Set(expected.flatMap(ms=>ms.map(m=>m.modeId))),actual=actualIds.size===1?Array.from(actualIds)[0]:actualIds.size===0&&defaults.size===1?Array.from(defaults)[0]:null;
   const actualModes=collections.map(c=>c.modes.filter(m=>m.modeId===actual));
   if(collections.some(c=>normalize(c.name)!=='font')||actualIds.size>1||actual===null||actualModes.some(ms=>ms.length!==1)||new Set(actualModes.map(ms=>ms[0]?.name)).size!==1){unknown.push(c.id);gap(font,'font-mode-unavailable-or-conflicting');continue;}
   const name=actualModes[0][0].name;
   if(!['alfasans','system (sf)'].includes(normalize(name))){unknown.push(c.id);gap(font,'font-mode-unrecognized');continue;}
   modes.push({collectionId:c.id,collectionKey:c.key||null,collectionIdentity:c.remote===true&&c.key?'published:'+c.key:'id:'+c.id,collectionName:c.name,actualModeId:actual,actualModeName:name,expectedModeId:expected.every(ms=>ms.length===1)&&expectedIds.size===1?Array.from(expectedIds)[0]:null,modeSource:actualIds.size?'explicit':'default'});
  }
  const mismatches=modes.filter(m=>normalize(m.actualModeName)==='system (sf)'),chosen=mismatches[0]||modes[0];
  if(!fontGroups.length)gap(font,'font-collection-unavailable');
  if(chosen&&(mismatches.length||!unknown.length)){
   const evidence=Object.assign({pageId:page.id,property:'Font',checkedCollections:fontGroups.length,mismatchedCollections:mismatches.length,verifiedCollections:modes.map(m=>m.collectionIdentity).slice(0,8)},chosen);
   finding(font,mismatches.length?'font-mismatch':'font-current',anchor,mismatches.length?'На текущей странице выбран System (SF). Выбери AlfaSans в коллекции Font.':'На текущей странице выбран AlfaSans.',{evidence});
  }else finding(font,'unknown',anchor,'Не удалось подтвердить режим Font на текущей странице.',{evidence:{pageId:page.id,property:'Font',collectionCount:fontGroups.length}});
 }
 }

}
async function recheck(api,facts,{hash,assertCurrent,timeoutMs=1200,concurrency=16}){
 const nodes=new Map();
 const read=fn=>boundedRead(fn,timeoutMs,assertCurrent);
 const node=id=>{if(!nodes.has(id))nodes.set(id,resolveNativeNode(api,id,{read,guard:assertCurrent}));return nodes.get(id);};
 await parallel(facts,concurrency,async f=>{assertCurrent();let value;
  if(f.kind==='style'){value=linkedStyleValue(await read(()=>api.getStyleByIdAsync(f.id)));}
  else if(f.kind==='variable'){value=variableValue(await read(()=>api.variables.getVariableByIdAsync(f.id)));}
  else if(f.kind==='collection'){try{value=collectionValue(await read(()=>api.variables.getVariableCollectionByIdAsync(f.id)));}catch(_){value=null;}}
  else{const n=await node(f.id);if(!n||n.removed)throw Error('NATIVE_FACTS_CHANGED');
   if(f.kind==='node')value=nodeValue(n);
   else if(f.kind==='identity')value=mainValue(n);
   else if(f.kind==='pageModes')value=Object.assign({},n.explicitVariableModes||{});
   else if(f.kind==='explicitModes')value=Object.assign({},n.explicitVariableModes||{});
   else if(f.kind==='sceneModes')value=Object.assign({},n.resolvedVariableModes||{});
   else if(f.kind==='detached')value=detachedValue(n);
   else if(f.kind==='styles')value=styleValue(n);
   else{let m=null;try{m=['COMPONENT','COMPONENT_SET'].includes(n.type)?n:await read(()=>n.getMainComponentAsync());}catch(e){if(e.message==='NATIVE_READ_TIMEOUT')throw e;}value=mainValue(m);}
  }
  assertCurrent();if(hash(value)!==hash(f.value))throw Error('NATIVE_FACTS_CHANGED');
 });
}
module.exports={LIMITS,signature,pageOf,collect,recheck};
