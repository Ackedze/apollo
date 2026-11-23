const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module'),esbuild=require('esbuild');
const filename=path.resolve(__dirname,"../../src/design-check/DocumentAudit.tsx"),m=new Module(filename,module);m.paths=module.paths;m._compile(esbuild.buildSync({entryPoints:[filename],bundle:true,external:['react','react-dom'],platform:'node',format:'cjs',write:false}).outputFiles[0].text,filename);
const {documentCoverageMessage}=m.exports,check=gaps=>({id:'customStyles',status:'incomplete',gaps});
test('unconnected additional policies do not claim an unavailable style or an exceeded scan limit',()=>{
 const message=documentCoverageMessage(check(['v3-catalog-policy-not-connected']));assert.equal(message.className,'document-audit-coverage');assert.match(message.text,/Дополнительные правила/);assert.doesNotMatch(message.text,/недоступн|лимит|неполная/);
});
test('incomplete coverage names the actual unavailable data, timeout or scan limit',()=>{
 for(const [gap,text] of [['linked-style-unavailable',/стилем или токеном/],['checker-timeout',/вовремя/],['finding-limit',/лимит этой проверки/]]){const message=documentCoverageMessage(check(['v3-catalog-policy-not-connected',gap]));assert.equal(message.className,'document-audit-warning');assert.match(message.text,text);}
 assert.equal(documentCoverageMessage({id:'customStyles',status:'complete',gaps:[]}),null);
});
test('obsolete styles route to the existing Styles tab with actual style identity and honest missing-index coverage',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const finding={findingId:'obsolete',status:'deprecated-style',name:'Synthetic layer',message:'Устаревший стиль: Synthetic style',owner:null,occurrences:['layer'],targets:[{id:'target',nodeId:'layer',kind:'occurrence',pageId:'page'}],evidence:{property:'fills',styleName:'Synthetic style',library:'Synthetic style library',styleKey:'a'.repeat(40)}};
 const obsolete={id:'deprecatedStyles',status:'complete',gaps:[],checked:1,scope:'native',findings:[finding]},state={result:{checks:[obsolete]}};
 assert.equal(m.exports.documentCheckForTab(state,'deprecatedStyles'),obsolete);
 const markup=renderToStaticMarkup(React.createElement(m.exports.DocumentAuditCards,{check:obsolete,tab:'deprecatedStyles',actionsEnabled:false,onFocus:()=>{}}));
 assert.match(markup,/Устаревший стиль: Synthetic style/);assert.match(markup,/Synthetic style library/);assert.match(markup,/disabled=""/);assert.match(markup,/Применённый стиль/);
 const missing=documentCoverageMessage(Object.assign({},obsolete,{status:'incomplete',gaps:['deprecated-style-index-unavailable'],findings:[]}));
 assert.match(missing.text,/Актуальность индекса устаревших стилей не подтверждена/);assert.match(missing.text,/Причина сохранена в диагностике/);
 const {buildResultGroups,auditQuality}=require('../../src/design-check/result-groups');
 const full={documentAudit:{status:'available',result:{checks:[obsolete]}},tabs:{},auditStale:false};
 const summary=buildResultGroups(full,[{id:'deprecatedStyles',title:'Устаревшие'}],()=>[]);assert.equal(summary.groups[0].count,1);assert.equal(auditQuality(summary),'violation');
 full.documentAudit.result.checks=[Object.assign({},obsolete,{status:'incomplete',findings:[Object.assign({},finding,{status:'unknown'})]})];assert.equal(auditQuality(buildResultGroups(full,[{id:'deprecatedStyles'}],()=>[])),'warning');
});
