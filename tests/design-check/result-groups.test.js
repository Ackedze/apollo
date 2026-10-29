const test = require('node:test'), assert = require('node:assert/strict');
const { buildResultGroups, auditQuality } = require("../../src/design-check/result-groups");
const tabs = ['changes','changesWip','current','update','local','detached','themization','customStyles','deprecatedStyles'].map(id => ({id,title:id}));
function state() { return {auditStale:false,documentAudit:{status:'idle',result:null},tabs:Object.fromEntries(tabs.map(tab=>[tab.id,{status:'not-connected',items:[]}]))}; }
function summary(value) { return buildResultGroups(value,tabs,id=>value.tabs[id]?.items||[]); }
function check(value,id,findings,status='complete',gaps=[]) {
  value.documentAudit.status='available';
  value.documentAudit.result ||= {checks:[]};
  value.documentAudit.result.checks.push({id,status,findings,gaps});
}
test('unchecked groups remain unknown, with no invented total',()=>{
  const result=summary(state());
  assert.equal(result.total,null);assert.deepEqual(result.groups.map(group=>group.count),[null,null,null]);
});
test('repeated native presentation and repeated contract evaluation are counted once',()=>{
  const value=state(),entry={evaluationId:'same',classification:'violation'};
  value.tabs.changes={status:'available',items:[entry],executionComplete:true};
  value.tabs.changesWip={status:'available',items:[entry],executionComplete:true};
  check(value,'freshness',[{findingId:'old',status:'update'},{findingId:'new',status:'current'}]);
  const result=summary(value);assert.equal(result.total,2);assert.equal(result.groups.find(group=>group.id==='components').count,2);
});
test('allowed customizations and current theme/version do not raise the problem counter',()=>{
  const value=state();
  value.tabs.changes={status:'available',items:[{classification:'allowed',evaluationId:'allowed'}],executionComplete:true};
  check(value,'theme',[{findingId:'theme',status:'theme-current'}]);
  check(value,'freshness',[{findingId:'version',status:'current'}]);
  assert.equal(summary(value).total,0);
});
test('unknown findings stay visible and cannot become clean through incomplete coverage',()=>{
  const value=state();check(value,'customStyles',[{findingId:'unknown',status:'unknown'}],'incomplete',['read-timeout']);
  const result=summary(value);assert.equal(result.total,1);assert.equal(result.incomplete,true);assert.equal(result.groups.find(group=>group.id==='styles').count,1);
});
test('refresh replaces resolved findings and preserves a separate remaining finding',()=>{
  const value=state();check(value,'customStyles',[{findingId:'prefix',status:'custom-style'},{findingId:'title',status:'custom-style'}]);
  assert.equal(summary(value).groups.find(group=>group.id==='styles').count,2);
  value.documentAudit.result.checks[0].findings=[{findingId:'title',status:'custom-style'}];
  assert.equal(summary(value).groups.find(group=>group.id==='styles').count,1);assert.equal(summary(value).total,1);
});
test('stale data stays counted and explicitly marked as previous data',()=>{
  const value=state();check(value,'theme',[{findingId:'theme',status:'theme-mismatch'}]);
  value.documentAudit.status='stale';assert.equal(summary(value).stale,true);assert.equal(summary(value).total,1);
});

test('style detach/local tabs do not reuse component detach/local findings',()=>{
  const value=state();check(value,'local',[{findingId:'component-local',status:'local'}]);check(value,'detached',[{findingId:'component-detach',status:'detached'}]);
  const styles=summary(value).groups.find(group=>group.id==='styles');
  assert.deepEqual(styles.categories.map(category=>category.title),['Устаревшие','Кастомы','Детач','Локальные']);
  assert.deepEqual(styles.categories.slice(2).map(category=>category.count),[null,null]);assert.equal(styles.count,null);
});

test('quality mascot stays neutral until a result and uses green only for complete current data',()=>{
 const value=state();assert.equal(auditQuality(summary(value)),'unchecked');
 value.tabs.changes={status:'available',items:[],executionComplete:true};assert.equal(auditQuality(summary(value)),'clean');
 value.tabs.changes.executionComplete=false;assert.equal(auditQuality(summary(value)),'warning');
 value.tabs.changes.executionComplete=true;value.auditStale=true;assert.equal(auditQuality(summary(value)),'unchecked');
 value.auditStale=false;assert.equal(auditQuality(summary(value),true),'unchecked');
});
test('yellow-only findings keep neutral mood; any confirmed red finding takes priority without changing counts',()=>{
 const value=state();check(value,'freshness',[{findingId:'version',status:'update'}]);check(value,'local',[{findingId:'local',status:'local'}]);check(value,'detached',[{findingId:'detach',status:'detached'}]);
 value.tabs.changes={status:'available',items:[{classification:'human-review',evaluationId:'review'}],executionComplete:true};
 const yellow=summary(value);assert.equal(auditQuality(yellow),'warning');assert.equal(yellow.total,4);
 check(value,'customStyles',[{findingId:'fill',status:'custom-style'}]);assert.equal(auditQuality(summary(value)),'violation');assert.equal(summary(value).total,5);
 value.documentAudit.result.checks.pop();value.tabs.changes.items.push({classification:'violation',evaluationId:'red'});assert.equal(auditQuality(summary(value)),'violation');
 value.tabs.changes.executionComplete=false;assert.equal(auditQuality(summary(value)),'violation');
 value.documentAudit.status='stale';assert.equal(auditQuality(summary(value)),'unchecked');
});
test('current theme is clean; theme mismatch is red and unavailable theme remains yellow',()=>{
 for(const [status,expected] of [['theme-current','clean'],['theme-mismatch','violation'],['unknown','warning']]){
  const value=state();check(value,'theme',[{findingId:'theme',status}]);assert.equal(auditQuality(summary(value)),expected);
 }
});

test('coverage identifies the concrete incomplete check and keeps policy limits separate from read failures',()=>{
 const value=state();check(value,'customStyles',[],'incomplete',['v3-catalog-policy-not-connected']);check(value,'font',[],'incomplete',['font-collection-unavailable']);
 const details=summary(value).coverageDetails;assert.equal(details.length,2);assert.match(details.find(x=>x.id==='customStyles').reason,/Дополнительные правила/);assert.match(details.find(x=>x.id==='font').title,/Шрифт/);assert.equal(summary(value).incomplete,true);
});
