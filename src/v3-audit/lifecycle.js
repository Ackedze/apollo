'use strict';
const VERSION='component-lifecycle-v1';
const CATEGORIES=['deprecated','scheduled','parts'];
const INDEXES=CATEGORIES.map(category=>'knowledge/data/design-system_ab/JSONS/indexes/lifecycle/'+category+'.index.json');
const fail=()=>{throw Object.assign(Error('AUDIT_DATA_REQUIRED'),{code:'AUDIT_DATA_REQUIRED',status:503});};
const nonempty=x=>typeof x==='string'&&x.length>0;
function createLifecycleLookup(readJson){
 const indexes=INDEXES.map((id,i)=>{
  const data=readJson(id),category=CATEGORIES[i];
  if(data?.kind!=='component-lifecycle-index'||data.version!==1||data.category!==category||!Array.isArray(data.components)||data.count!==data.components.length||!Array.isArray(data.warnings))fail();
  const byKey=new Map(),owners=new Set();
  for(const record of data.components){
   if(!nonempty(record.key)||owners.has(record.key)||!['active','scheduled','deprecated'].includes(record.status)||!['main','part'].includes(record.role)||!Array.isArray(record.variantKeys)||record.variantKeys.some(k=>!nonempty(k))||!Array.isArray(record.sources)||!record.sources.length||record.sources.some(s=>!['active','scheduled','deprecated'].includes(s.status)||!['main','part'].includes(s.role))||category==='parts'&&record.role!=='part'||category!=='parts'&&record.status!==category)fail();
   owners.add(record.key);
   for(const key of new Set([record.key,...record.variantKeys])){if(!byKey.has(key))byKey.set(key,[]);byKey.get(key).push(record);}
  }
  if(data.warnings.some(w=>!w||!nonempty(w.key)||!Array.isArray(w.fields)||w.fields.some(f=>!nonempty(f))))fail();
  return {id,category,byKey,warnings:data.warnings};
 });
 return function evaluate(nodes,pageId){
  const checks=[];
  for(const node of nodes){
   if(node.type!=='INSTANCE'||node.visible===false)continue;
   const identityAvailable=nonempty(node.main?.key)&&!(node.unavailable||[]).includes('main');
   const keys=identityAvailable?[...new Set([node.main.key,node.main.set?.key].filter(nonempty))]:[];
   const matches=indexes.map(index=>[...new Set(keys.flatMap(key=>index.byKey.get(key)||[]))]);
   const all=matches.flat(),statuses=new Set(all.map(r=>r.status)),roles=new Set(all.map(r=>r.role));
   for(let i=0;i<indexes.length;i++){
    const index=indexes[i],records=matches[i],warnings=index.warnings.filter(w=>records.some(r=>r.key===w.key));
    const row={id:index.category+':'+node.id,category:index.category,targetId:node.id,name:node.name||'',sourceId:index.id,matchedKeys:keys.filter(key=>index.byKey.has(key)),recordKeys:records.map(r=>r.key),indexFacts:records.map(r=>({key:r.key,status:r.status,role:r.role,sourceStatuses:[...new Set(r.sources.map(s=>s.status))],sourceRoles:[...new Set(r.sources.map(s=>s.role))]})),metadataWarnings:warnings,status:'NOT_LISTED',reason:'Ключ не найден в этом индексе. Это не подтверждает соответствие другим правилам.'};
    const statusConflict=statuses.size>1||records.some(r=>r.sources.some(s=>s.status!==r.status))||warnings.some(w=>w.fields.includes('status'));
    const roleConflict=roles.size>1||records.some(r=>r.sources.some(s=>s.role!==r.role))||warnings.some(w=>w.fields.includes('role'));
    if(!identityAvailable){row.status='UNKNOWN';row.reason='Опубликованный ключ компонента недоступен.';}
    else if(records.length>1){row.status='UNKNOWN';row.reason='Ключи соответствуют нескольким записям индекса.';}
    else if(records.length&&(index.category==='parts'?roleConflict:statusConflict)){row.status='UNKNOWN';row.reason='Источники индекса расходятся по '+(index.category==='parts'?'роли':'статусу')+' компонента.';}
    else if(records.length){
     if(index.category==='scheduled'){row.status='WARNING';row.reason='Компонент имеет статус scheduled. Дата удаления и запрет использования индексом не установлены.';}
     else if(index.category==='deprecated'){row.status='ERROR';row.reason='Компонент отмечен как устаревший (deprecated).';}
     else {
      const usage=node.usageContext;row.usageContext=usage||null;
      if(usage?.state==='nested'&&nonempty(usage.owner?.id)&&usage.owner.id!==node.id&&['INSTANCE','COMPONENT'].includes(usage.owner.type)) {row.status='PASS';row.reason='Запчасть вложена в компонент; самостоятельного использования не обнаружено.';}
      else if(usage?.state==='standalone'&&usage.pageId===pageId&&usage.owner===null){row.status='ERROR';row.reason='Запчасть используется самостоятельно: до страницы нет родительского компонента.';}
      else {row.status='UNKNOWN';row.reason='Не удалось подтвердить, используется ли запчасть самостоятельно.';}
     }
    }
    checks.push(row);
   }
  }
  const counts=Object.fromEntries(['ERROR','WARNING','PASS','UNKNOWN','NOT_LISTED'].map(s=>[s,checks.filter(r=>r.status===s).length]));
  return {version:VERSION,checks,coverage:{instances:nodes.filter(n=>n.type==='INSTANCE'&&n.visible!==false).length,total:checks.length,resolved:checks.length-counts.UNKNOWN,counts,basis:'Три индексные проверки на видимый экземпляр; отсутствие ключа не означает соответствие всем правилам DS AI HUB.'}};
 };
}
module.exports={VERSION,CATEGORIES,INDEXES,createLifecycleLookup};
