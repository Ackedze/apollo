const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),esbuild=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {buildV3Groups,nativeMetrics}=require('../src/v3-audit/ui-model'),{auditQuality}=require('../src/design-check/result-groups');
function category(result,id){return buildV3Groups(result).groups.flatMap(group=>group.categories).find(category=>category.id===id);}
function load(file){const output=esbuild.buildSync({entryPoints:[path.join(__dirname,'../src',file)],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react-dom','react-dom/server'],outfile:'test.cjs',logLevel:'silent'});const module={exports:{}};new Function('require','module','exports',output.outputFiles.find(file=>file.path.endsWith('.cjs')).text)(require,module,module.exports);return module.exports;}
test('retired component categories do not become errors while missing evidence remains incomplete',()=>{
 const item={id:'component',relevance:'unknown',comparisonIssues:['Reference unavailable']};
 const result={visibleViews:{relevance:{unknown:[item],technical:[{id:'technical'}],current:[{id:'current'}]},presets:[{id:'preset'}],changesWip:[{id:'raw',diffs:[{nodeId:'child'}]}]}};
 const summary=buildV3Groups(result),components=summary.groups.find(group=>group.id==='components');
 assert.deepEqual(components.categories.map(category=>category.id),['deprecated','update','detached','local','wrongChannel','changes']);assert.equal(components.count,0);assert.equal(summary.total,0);assert.equal(summary.incomplete,true);assert.equal(auditQuality(summary),'warning');assert.equal(nativeMetrics(result).checks.find(check=>check.id==='v3:unknown').status,'incomplete');assert.equal(summary.coverageDetails[0].title,'Компоненты');
});
test('bound custom styles and unbound values have disjoint local/detached rows; deprecated stays available',()=>{
 const styles=[{id:'raw',reason:'fill',resource:{type:'raw-value',name:'Raw fill'}},{id:'style',reason:'effect',resource:{type:'style',name:'Local shadow'}},{id:'token',reason:'fill',resource:{type:'token',name:'Own token'}}];
 const result={visibleViews:{customStyles:styles,deprecatedStyles:[{id:'old',reason:'fill',styleLabel:'Deprecated color'}]}};
 const group=buildV3Groups(result).groups.find(group=>group.id==='styles');assert.deepEqual(group.categories.map(category=>category.title),['Устаревшие','Без токена','Локальные','Не тот канал']);assert.deepEqual(group.categories.map(category=>category.count),[1,1,2,0]);assert.equal(group.count,4);assert.equal(new Set(group.categories.flatMap(category=>category.entries).map(row=>row.id)).size,4);assert.deepEqual(category(result,'detachedStyles').entries[0].messages,[]);
});
test('warning-only accepted and retained results keep a yellow mascot; one red finding wins',()=>{
 const result={visibleViews:{relevance:{update:[{id:'update'}]},detached:[{id:'detached'}]},baseChecks:[{id:'theme',classification:'compliant',message:'Corp'}]};
 for(const stale of [false,true])assert.equal(auditQuality(buildV3Groups(result,{}, {stale})),'warning');
 result.visibleViews.relevance.deprecated=[{id:'deprecated'}];assert.equal(auditQuality(buildV3Groups(result)),'violation');assert.equal(auditQuality(buildV3Groups(null)),'unchecked');assert.equal(auditQuality(buildV3Groups(result),true),'unchecked');
});
test('V3 cards expose one labelled binding dropdown and hold focus/action guards',()=>{
 const {V3Findings}=load('v3-audit/V3Findings.tsx');const actions=Array.from({length:27},(_,i)=>({id:'binding-'+i,kind:'bind-variable',label:'Привязать',targetName:'Token/'+i,targetLibrary:'Interface Dynamic'}));
 const result={visibleViews:{customStyles:[{id:'layer',name:'Color',reason:'fill',focusActionId:'held-focus',resource:{type:'raw-value',name:'Raw fill'},actions}]}};
 const props={category:category(result,'detachedStyles'),client:{},runId:'accepted',stale:false,busy:false,mutationAvailable:true};
 let html=renderToStaticMarkup(React.createElement(V3Findings,props));assert.equal((html.match(/<select/g)||[]).length,0);assert.match(html,/Привязать/);assert.match(html,/aria-expanded="false"/);assert.match(html,/data-finding-focus="true"/);assert.match(html,/aria-label="Нарушение"/);assert.doesNotMatch(html,/Raw fill/);
 html=renderToStaticMarkup(React.createElement(V3Findings,Object.assign({},props,{stale:true})));assert.match(html,/<button[^>]*disabled[^>]*aria-expanded/);assert.doesNotMatch(html,/<button[^>]*disabled[^>]*aria-label="Показать в макете"/);
});
test('overview disables empty groups and Base while positive findings remain reachable',()=>{
 const {AuditOverview}=load('design-check/AuditOverview.tsx'),summary=buildV3Groups({visibleViews:{relevance:{update:[{id:'update'}]}},baseChecks:[{id:'theme',classification:'compliant',message:'Corp'}]});
 const previous=globalThis.document;globalThis.document={visibilityState:'visible'};let html;try{html=renderToStaticMarkup(React.createElement(AuditOverview,{progress:'',summary,busy:false,checkedScope:'Area',onOpen(){},onBase(){}}));}finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
 assert.match(html,/<button[^>]*disabled[^>]*aria-label="Токены: 0/);assert.match(html,/<button[^>]*disabled[^>]*aria-label="База: 0/);const component=html.match(/<button[^>]*aria-label="Компоненты: 1[^>]*>/)[0];assert(!component.includes('disabled'));assert.match(html,/quality-warning/);
});
test('overview keeps null, zero and unconnected groups disabled; connected findings stay reachable',()=>{
 const {AuditOverview}=load('design-check/AuditOverview.tsx'),previous=globalThis.document;
 globalThis.document={visibilityState:'visible'};
 try{
  for(const [count,connected,disabled] of [[null,false,true],[null,true,true],[0,true,true],[1,false,true],[1,true,false]]){
   const summary={groups:[{id:'components',title:'Компоненты',count,connected,categories:[]},{id:'patterns',title:'Паттерны',count:1,connected:true,categories:[]}],theme:null,total:count,stale:false,incomplete:false};
   const html=renderToStaticMarkup(React.createElement(AuditOverview,{progress:'',summary,busy:false,checkedScope:'Area',onOpen(){},onBase(){}}));
   assert.doesNotMatch(html,/aria-label="Паттерны:/);
   const button=html.match(/<button[^>]*aria-label="Компоненты:[^>]*>/)[0];
   assert.equal(button.includes('disabled'),disabled,JSON.stringify({count,connected}));
  }
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('overview circles use the most severe finding in each group', () => {
 const {AuditOverview} = load('design-check/AuditOverview.tsx');
 const warning = {id:'scheduled',reason:'fill',scheduled:true};
 const violation = {id:'deprecated',reason:'fill'};
 const result = {
  visibleViews:{deprecatedStyles:[warning, violation],relevance:{update:[{id:'component-update'}]}},
  baseChecks:[{id:'font',classification:'warning',message:'Check the font'}],
 };
 function tones(stale = false) {
  const html = renderToStaticMarkup(React.createElement(AuditOverview, {
   newNavigation:true, summary:buildV3Groups(result, {}, {stale}), progress:'', busy:false,
   checkedScope:'Area', onOpen(){}, onBase(){},
  }));
  return Object.fromEntries(Array.from(html.matchAll(/<button[^>]*data-tone="([^"]+)"[^>]*aria-label="([^":]+):/g),
   ([,tone,title])=>[title,tone]));
 }
 assert.deepEqual(tones(true), {'База':'attention','Токены':'critical','Компоненты':'attention'});
 result.visibleViews.deprecatedStyles = [warning];
 result.visibleViews.relevance = {deprecated:[{id:'component-deprecated'}]};
 result.baseChecks = [];
 assert.deepEqual(tones(), {'База':'neutral','Токены':'attention','Компоненты':'critical'});
 result.visibleViews.deprecatedStyles = [];
 result.visibleViews.customStyles = [{
  id:'unknown-stop',reason:'fill',status:'incomplete',resource:{type:'raw-value'},
  gradientStop:{paintIndex:0,stopIndex:1,position:.65},
 }];
 assert.equal(tones()['Токены'],'attention');
 result.visibleViews.customStyles = [];
 assert.equal(tones()['Токены'],'neutral');
});
