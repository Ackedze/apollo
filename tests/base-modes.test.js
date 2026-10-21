const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {collect,recheck}=require("../src/document-audit/engine");
const {resultValid}=require("../src/document-audit/protocol");
const {mergeObservation}=require("../src/document-audit/scoped-recheck");
const {buildResultGroups,auditQuality}=require("../src/design-check/result-groups");
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function fixture(mode=null){
 const page={id:'page',type:'PAGE',name:'Страница',children:[],selection:[],explicitVariableModes:{theme:'corp'},parent:{id:'document',type:'DOCUMENT'}};
 for(const key of ['visible','resolvedVariableModes'])Object.defineProperty(page,key,{get(){throw Error('PAGE has no '+key);}});
 const node={id:'selected',type:'FRAME',name:'Область',parent:page,visible:true,children:[],explicitVariableModes:{},resolvedVariableModes:{theme:'corp',font:'alpha'},fills:[],strokes:[],effects:[],opacity:1};page.children=[node];page.selection=[node];
 const collections=new Map([['theme',{id:'theme',key:'theme-key',remote:true,name:'Theme',defaultModeId:'other',modes:[{modeId:'corp',name:'Corp'},{modeId:'other',name:'Default'}]}],['font',{id:'font',key:'font-key',remote:true,name:'Font',defaultModeId:'alpha',modes:[{modeId:'alpha',name:'AlfaSans'},{modeId:'sf',name:'System (SF)'}]}]]);
 if(mode!==null)page.explicitVariableModes.font=mode;
 const nodes=new Map([[page.id,page],[node.id,node]]),api={currentPage:page,variables:{getVariableCollectionByIdAsync:async id=>collections.get(id)||null},getNodeByIdAsync:async id=>nodes.get(id)||null};
 const context={pageId:page.id,selectionSignature:node.id,platform:'Desktop'};
 return {page,node,collections,api,context,capture:options=>collect(api,context,Object.assign({hash,assertCurrent:()=>{}},options))};
}
const font=o=>o.checks.find(c=>c.id==='font'),theme=o=>o.checks.find(c=>c.id==='theme');
function summary(o){const state={auditStale:false,documentAudit:{status:'available',result:{checks:o.checks}},tabs:{themization:{status:'not-connected'}}};return buildResultGroups(state,[{id:'themization',title:'Темизация'}],()=>[]);}
for(const mode of [null,'alpha','sf'])test('page Font explicit/default mode: '+mode,async()=>{
 const f=fixture(mode),o=await f.capture(),c=font(o),finding=c.findings[0];
 assert.equal(c.status,'complete');assert.equal(finding.status,mode==='sf'?'font-mismatch':'font-current');assert.equal(finding.evidence.modeSource,mode===null?'default':'explicit');
 assert.equal(finding.targets[0].kind,'page-anchor');assert.equal(theme(o).findings[0].status,'theme-current');assert.equal(summary(o).theme.count,mode==='sf'?1:0);
 assert.equal(auditQuality(summary(o)),mode==='sf'?'violation':'clean');
 const r={runId:'run',context:f.context,checks:o.checks,observedAt:1,coverage:'native-subsets-only'};assert.equal(resultValid(r),true);
});
test('default System (SF) is a violation, including Auto',async()=>{const f=fixture();f.collections.get('font').defaultModeId='sf';const o=await f.capture();assert.equal(font(o).findings[0].status,'font-mismatch');assert.equal(font(o).findings[0].evidence.modeSource,'default');});
test('confirmed Corp stays outside the counter despite unavailable unrelated collections',async()=>{
 const f=fixture();f.node.resolvedVariableModes.unavailable='mode';const o=await f.capture();assert.equal(theme(o).status,'incomplete');assert.equal(theme(o).findings[0].status,'theme-current');assert.equal(summary(o).theme.count,0);assert.equal(summary(o).incomplete,true);assert.equal(auditQuality(summary(o)),'warning');
});
test('two confirmed Base violations count as two; correction removes only the resolved one',async()=>{
 const f=fixture('sf');f.page.explicitVariableModes.theme='other';const before=await f.capture();assert.equal(summary(before).theme.count,2);
 f.page.explicitVariableModes.theme='corp';const after=await f.capture();assert.equal(summary(after).theme.count,1);assert.equal(font(after).findings[0].status,'font-mismatch');
 f.page.explicitVariableModes.font='alpha';assert.equal(summary(await f.capture()).theme.count,0);
});
test('independent Font collections are checked without duplicating the Font error card',async()=>{
 const f=fixture();const other=Object.assign({},f.collections.get('font'),{id:'font2',key:'font-key2',defaultModeId:'sf'});f.collections.set('font2',other);f.node.resolvedVariableModes.font2='sf';const c=font(await f.capture());assert.equal(c.findings.length,1);assert.equal(c.findings[0].status,'font-mismatch');assert.equal(c.findings[0].evidence.checkedCollections,2);
});
test('published Font aliases use exact remote/key identity',async()=>{
 const f=fixture('sf');f.collections.set('alias',Object.assign({},f.collections.get('font'),{id:'alias'}));f.node.resolvedVariableModes={theme:'corp',alias:'alpha'};const c=font(await f.capture());assert.equal(c.findings[0].status,'font-mismatch');assert.equal(c.findings[0].evidence.checkedCollections,1);
});
for(const conflict of ['explicit','default','actual-name'])test('conflicting Font alias evidence remains unknown: '+conflict,async()=>{
 const f=fixture();f.collections.set('alias',Object.assign({},f.collections.get('font'),{id:'alias',modes:f.collections.get('font').modes.map(m=>Object.assign({},m))}));f.node.resolvedVariableModes.alias='alpha';
 if(conflict==='explicit'){f.page.explicitVariableModes.font='sf';f.page.explicitVariableModes.alias='alpha';}
 if(conflict==='default')f.collections.get('alias').defaultModeId='sf';
 if(conflict==='actual-name')f.collections.get('alias').modes[0].name='Different';
 const o=await f.capture();assert.equal(font(o).status,'incomplete');assert.equal(font(o).findings[0].status,'unknown');assert.equal(auditQuality(summary(o)),'warning');
});
for(const unavailable of ['collection','mode','default'])test('unavailable Font never becomes clean or a confirmed violation: '+unavailable,async()=>{
 const f=fixture();if(unavailable==='collection')f.collections.delete('font');if(unavailable==='mode')f.collections.get('font').modes=[];if(unavailable==='default')delete f.collections.get('font').defaultModeId;
 const o=await f.capture();assert.equal(font(o).findings[0].status,'unknown');assert.equal(font(o).status,'incomplete');assert.equal(auditQuality(summary(o)),'warning');
});
test('verified System (SF) remains an error when the expected mode cannot be read',async()=>{const f=fixture('sf');f.collections.get('font').modes=f.collections.get('font').modes.filter(m=>m.modeId==='sf');const c=font(await f.capture());assert.equal(c.findings[0].status,'font-mismatch');assert.equal(c.findings[0].evidence.expectedModeId,null);});
test('collection default changes invalidate captured Font facts',async()=>{const f=fixture(),o=await f.capture();f.collections.get('font').defaultModeId='sf';await assert.rejects(recheck(f.api,o.facts,{hash,assertCurrent:()=>{}}),/NATIVE_FACTS_CHANGED/);});
test('scoped refresh updates Font even when Theme has no affected scene nodes',async()=>{
 const f=fixture('sf'),old=await f.capture();f.page.explicitVariableModes.font='alpha';const fresh=await f.capture({scoped:true}),merged=mergeObservation(old,fresh,{ids:new Set(),action:{kind:'theme'}});
 assert.equal(font(merged).findings.length,1);assert.equal(font(merged).findings[0].status,'font-current');assert.equal(summary(merged).theme.count,0);
});
test('partial refresh cannot erase an unread previous Font violation through a different clean Font collection',async()=>{
 const f=fixture();f.collections.get('font').defaultModeId='sf';f.collections.set('font2',Object.assign({},f.collections.get('font'),{id:'font2',key:'different-font-key',defaultModeId:'alpha'}));f.node.resolvedVariableModes.font2='alpha';
 const old=await f.capture();assert.equal(font(old).findings[0].status,'font-mismatch');f.collections.delete('font');const fresh=await f.capture({scoped:true});
 const merged=mergeObservation(old,fresh,{ids:new Set(),action:{kind:'theme'}});assert.equal(font(merged).findings.some(f=>f.status==='font-mismatch'),true);assert.ok(merged.staleFindingIds.includes(font(old).findings[0].findingId));
});
test('native platform exclusions stay unchanged',async()=>{const f=fixture('sf');f.context.platform='iOS';const o=await f.capture();assert.equal(theme(o).status,'not-applicable');assert.equal(font(o).status,'not-applicable');assert.equal(font(o).findings.length,0);});
test('new bounded Font protocol still rejects duplicate checks, unknown enums and additional fields',async()=>{
 const f=fixture('sf'),o=await f.capture(),r={runId:'run',context:f.context,checks:o.checks,observedAt:1,coverage:'native-subsets-only'};
 for(const change of [v=>v.checks.push(v.checks[5]),v=>v.checks[5].id='invented',v=>v.checks[5].findings[0].status='invented',v=>v.checks[5].findings[0].unsafe=true]){const bad=JSON.parse(JSON.stringify(r));change(bad);assert.equal(resultValid(bad),false);}
});
