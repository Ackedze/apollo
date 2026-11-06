const final=new Set(['compliant','allowed','not-applicable']);
const titles={changes:'Кастомы',unknown:'Не удалось проверить',deprecated:'Устаревшие',update:'Пора менять',detached:'Детач',local:'Локальные',wrongChannel:'Не тот канал',presets:'Пресеты',technical:'Технические',current:'В каталоге',changesWip:'Все отличия от эталона',customStyles:'Локальные',detachedStyles:'Без стиля или токена',deprecatedStyles:'Устаревшие',themization:'База'};
const groups=[{id:'styles',title:'Стили и токены',tabs:['customStyles','detachedStyles','deprecatedStyles'],description:'Стили, цвета и привязки к токенам.'},{id:'components',title:'Компоненты',tabs:['changes','deprecated','update','detached','local','wrongChannel'],description:'Библиотечные связи, версии и правила компонентов.'},{id:'patterns',title:'Паттерны',tabs:[],description:'Сочетание компонентов и проектировочные паттерны.'}];
function classification(diffs){return diffs.some(diff=>diff.assessment?.verdict==='violation')?'violation':diffs.some(diff=>!diff.assessment||diff.assessment.verdict==='unknown')?'unknown':'allowed';}
function location(item){return item.fullPath||item.path||item.name||'Слой';}
function source(item){return item.librarySource||item.libraryName||item.sourceLibrary||item.resource?.library||item.reference?.source||null;}
function row(id,item,status,title,extra={}){return Object.assign({id,item,incomplete:item.status==='incomplete'||(item.gaps||[]).length>0,classification:status,title,location:location(item),library:source(item),focusActionId:item.focusActionId||null,actions:item.actions||[]},extra);}
function value(detail){
 if(!detail)return null;
 for(const candidate of [detail.displayName,detail.binding?.name,detail.resource?.name,detail.value]){
  if(typeof candidate==='number')return String(candidate);
  if(typeof candidate==='string'&&candidate.trim())return candidate.trim();
  if(typeof candidate==='boolean')return candidate?'True':'False';
 }
 return detail.value===null?'Нет значения':null;
}
const labels={View:'Вью',Size:'Размер',fill:'Заливка',stroke:'Обводка','text.style':'Типографика','styles.text':'Типографика','text.fontSize':'Размер шрифта','text.lineHeight':'Межстрочный интервал','layout.width':'Ширина','layout.height':'Высота',opacity:'Непрозрачность'};
function comparisons(diff){
 const semantic=diff.assessment?.semanticVariantChanges;
 if(Array.isArray(semantic)&&semantic.length)return semantic.map(change=>({property:labels[change.property]||change.property,before:String(change.expected),after:String(change.actual)}));
 const details=diff.details;if(!details?.reference||!details?.actual)return[];
 const property=labels[details.property]||(details.property?.startsWith('variant.')?details.property.slice(8):details.property)||'Значение';
 const before=value(details.reference),after=value(details.actual);
 if(before!==null||after!==null)return[{property,before:before??'Значение не получено',after:after??'Значение не получено'}];
 return[];
}
function changedRows(items,raw=false,showExpected=true){
 const rows=[];
 for(const item of items){
  const nodes=new Map();
  for(const diff of item.diffs||[]){
   if(diff.visible===false||!raw&&['allowed','expected'].includes(diff.assessment?.verdict))continue;
   const key=diff.nodeId||diff.nodePath||diff.nodeName||item.id;
   if(!nodes.has(key))nodes.set(key,[]);nodes.get(key).push(diff);
  }
  for(const[key,diffs]of nodes){
   const status=raw?'observation':classification(diffs),first=diffs[0];
   const title=raw?'Отличия от библиотечного эталона.':status==='allowed'?'Допустимые настройки.':status==='unknown'?'Часть изменений не удалось проверить.':diffs.find(diff=>diff.assessment?.verdict==='violation')?.assessment.message||'Изменены свойства компонента.';
   rows.push(row((raw?'baseline:':'change:')+item.id+':'+key,item,status,title,{diffs,incomplete:!raw&&diffs.some(diff=>!diff.assessment||diff.assessment.verdict==='unknown'||diff.assessment.status==='incomplete'||(diff.assessment.gaps||[]).length>0),focusActionId:first.focusActionId||item.focusActionId,actions:[]}));
  }
 }
 return rows;
}
function category(id,entries,connected){const issues=id==='changesWip'?[]:entries.filter(entry=>!final.has(entry.classification));return{id,title:titles[id],entries,issues,connected,count:connected?issues.length:null,incomplete:entries.some(entry=>entry.incomplete||entry.classification==='unknown')};}
function customizationItems(views,relevance){
 const items=new Map(),seen=new Map();
 const add=(item,diffs,deduplicate)=>{
  if(!items.has(item.id)){items.set(item.id,Object.assign({},item,{diffs:[]}));seen.set(item.id,new Set());}
  for(const diff of diffs){
   // Rule assessments and typed evidence are part of the finding's identity.
   const key=JSON.stringify(diff);
   if(deduplicate&&seen.get(item.id).has(key))continue;
   seen.get(item.id).add(key);items.get(item.id).diffs.push(diff);
  }
 };
 for(const item of views.changes||[])add(item,item.diffs||[],false);
 for(const item of (relevance.update||[]).concat(relevance.deprecated||[]))add(item,(item.diffs||[]).filter(diff=>diff.assessment?.verdict==='violation'),true);
 return Array.from(items.values());
}
function buildV3Groups(result,settings={},state={}){
 const views=result?.visibleViews||{},relevance=views.relevance||{},all=Object.values(relevance).flat(),unknown=[];
 const local=Array.from(new Map((views.local||[]).concat(all.filter(item=>item.relevance==='unknown')).filter(item=>!item.reference&&typeof item.componentKey==='string'&&item.componentKey.trim()&&!(item.comparisonIssues||[]).length&&!(item.gaps||[]).length&&item.status!=='incomplete').map(item=>[item.id,item])).values());
 for(const item of all){
  const reasons=(item.comparisonIssues||[]).slice();
  if(item.relevance==='unknown')reasons.push('Не удалось сопоставить компонент с подключённым каталогом.');
  if(item.libraryFreshness?.status==='unknown')reasons.push('Не удалось подтвердить опубликованную версию компонента.');
  if(reasons.length)unknown.push(row('coverage:'+item.id,item,'unknown','Проверка компонента неполная.',{messages:Array.from(new Set(reasons))}));
 }
 const data={
  changes:changedRows(customizationItems(views,relevance),false,settings.showExpectedCustomizations!==false),unknown,
  changesWip:changedRows(views.changesWip||[],true),
  deprecated:(relevance.deprecated||[]).filter(item=>!['update','changed'].includes(item.reference?.status)).map(item=>row('deprecated:'+item.id,item,'violation','Используется устаревший компонент.')),
  update:(relevance.update||[]).concat((relevance.deprecated||[]).filter(item=>['update','changed'].includes(item.reference?.status))).map(item=>row('update:'+item.id,item,'warning','Пора заменить компонент актуальной версией.')),
  current:(relevance.current||[]).map(item=>row('current:'+item.id,item,'compliant','Компонент найден в библиотечном каталоге.')),
  technical:(relevance.technical||[]).map(item=>row('technical:'+item.id,item,'warning','Проверь применение технического компонента.')),
  presets:(views.presets||[]).map(item=>row('preset:'+item.id,item,'warning','Проверь применение пресета.')),
  detached:(views.detached||[]).map(item=>row('detached:'+item.id,item,'warning',item.componentName?`Компонент ${item.componentName} раздетачен.`:'Компонент раздетачен.')),
  local:local.map(item=>row('local:'+item.id,item,'warning','Компонент вне подключённых каталогов DS.',{incomplete:item.relevance==='unknown'||item.status==='incomplete'||(item.gaps||[]).length>0})),
  wrongChannel:(views.wrongChannel||[]).map(item=>row('channel:'+item.id,item,'violation','Компонент не соответствует выбранной платформе.')),
  deprecatedStyles:(views.deprecatedStyles||[]).map(item=>row('deprecated-style:'+item.id+':'+item.reason,item,'violation','Используется устаревший стиль.',{messages:[item.styleLabel||'Название стиля недоступно']})),
  customStyles:(views.customStyles||[]).filter(item=>item.resource?.type!=='raw-value').map(item=>row('style:'+item.id+':'+item.reason,item,'violation','Стиль или токен вне подключённой библиотеки.',{messages:item.resource?.name?[item.resource.name]:[]})),
  detachedStyles:(views.customStyles||[]).filter(item=>item.resource?.type==='raw-value').map(item=>row('style:'+item.id+':'+item.reason,item,'violation',item.reason==='typography'?'Типографика без стиля.':item.reason==='fill'?'Заливка без стиля или токена.':item.reason==='stroke'?'Обводка без стиля или токена.':'Эффект без стиля.',{messages:item.resource?.name&&!/^Raw /.test(item.resource.name)?[item.resource.name]:[]})),
  themization:(result?.baseChecks||[]).filter(item=>!final.has(item.classification)).map(item=>row('base:'+item.id,item,item.classification,item.message,{displayName:item.id==='font'?'Шрифт страницы':'Темизация страницы',messages:item.status==='incomplete'||(item.gaps||[]).length?['Часть данных не удалось подтвердить. Проверка неполная.']:[]})).concat((views.themization||[]).map(item=>row('theme:'+item.id,item,'violation',item.recommendation?`Замени на ${item.recommendation}`:'Компонент для выбранной темы.',{displayName:item.name}))),
 };
 const categories=Object.fromEntries(Object.keys(titles).map(id=>[id,category(id,data[id]||[],!!result)]));
 const visible=groups.map(group=>Object.assign({},group,{categories:group.tabs.filter(id=>!(settings.hideCustomizations&&['changes','changesWip'].includes(id))).map(id=>categories[id]),connected:!!result&&group.tabs.length>0}));
 for(const group of visible)group.count=group.connected?new Set(group.categories.flatMap(category=>category.issues.map(row=>row.id))).size:null;
 const theme=['iOS','Android'].includes(settings.pickerLabel)?null:categories.themization;
 const active=visible.flatMap(group=>group.categories).concat(theme?[theme]:[]),issues=active.flatMap(category=>category.issues),coverage=active.concat(categories.unknown);
 return{groups:visible,theme,total:result?new Set(issues.map(row=>row.id)).size:null,stale:!!state.stale,unconfirmed:categories.unknown,incomplete:coverage.some(category=>category.incomplete),coverageDetails:coverage.filter(category=>category.incomplete).map(category=>({id:category.id,title:category.id==='unknown'?'Компоненты':category.title,reason:category.id==='unknown'?'Не удалось подтвердить часть компонентов. Причины сохранены в диагностике проверки.':'Есть изменения, для которых пока не удалось подтвердить правило. Подробности — в карточках.'}))};
}
function nativeMetrics(result,settings){const summary=buildV3Groups(result,settings),categories=summary.groups.flatMap(group=>group.categories).concat(summary.theme?[summary.theme]:[],summary.unconfirmed?[summary.unconfirmed]:[]);return{checks:categories.filter(category=>category.id!=='changesWip').map(category=>({id:'v3:'+category.id,status:category.incomplete?'incomplete':'complete',checked:category.entries.length,gaps:Array.from(new Set(category.entries.flatMap(row=>row.item.gaps||[]))),findings:category.entries.map(row=>({status:row.classification,componentKey:row.item.componentKey||null}))}))};}
module.exports={buildV3Groups,nativeMetrics,comparisons,titles};
