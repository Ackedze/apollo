const test=require('node:test'),assert=require('node:assert/strict');
const {setup,request,wait}=require("./postaction-scoped.test"),{surround,project}=require("./update-scope.fixture.cjs");
for(const selection of ['area','multiple-roots'])test('Update preserves the original '+selection+' under outside Auto Layout ancestors without reading outside content',async()=>{
 let outsideReads=0;const {f,native}=await setup(f=>{surround(f,{onRead:()=>outsideReads++});if(selection==='multiple-roots')f.page.selection=[f.actual,f.peer];});
 try{
  assert.equal(outsideReads,0);const oldIds=new Set(native.result.checks.flatMap(c=>c.findings.flatMap(x=>x.occurrences)));f.page.selection=[];f.emit('selectionchange');f.messages.length=0;
  await f.api.ui.onmessage(request(native,'Составной компонент'));const result=await wait(f,'document-recheck-result'),start=f.messages.find(m=>m.type==='document-recheck-start');
  assert.equal(outsideReads,0);assert.ok(!start.affectedNodeIds.some(id=>id.startsWith('invented-outside')));assert.equal(result.result.context.selectionSignature,native.result.context.selectionSignature);assert.deepEqual(result.result.checks.map(c=>c.id),['local','freshness','theme','detached','customStyles','font']);
  assert.equal(result.result.checks[1].findings.some(x=>x.name==='Составной компонент'&&x.status==='update'),false);assert.ok(result.result.checks[1].findings.some(x=>x.name==='Второй экземпляр'&&x.status==='update'));
  const peer=result.result.checks[1].findings.find(x=>x.name==='Второй экземпляр');assert.ok(result.actionData.items.some(i=>i.findingId===peer.findingId&&i.actions.some(a=>a.kind==='update')));assert.equal(f.writes.filter(x=>x[0]==='swap').length,1);
  if(selection==='multiple-roots')assert.ok(start.affectedNodeIds.every(id=>oldIds.has(id)));
 }finally{f.emit('close');}
});
test('an originally observed Auto Layout peer is recaptured with its changed geometry',async()=>{
 const {f,native,contract}=await setup(f=>{f.area.layoutMode='VERTICAL';const swap=f.actual.swapComponent;f.actual.swapComponent=next=>{swap(next);f.peer.width=112;f.peer.x=10;};});
 try{f.messages.length=0;await f.api.ui.onmessage(request(native,'Составной компонент'));const result=await wait(f,'document-recheck-result');const full=await require("./full-audit.fixture.cjs").fullAudit(f.api,f.messages,result.contract.audit),peer=full.components.find(c=>c.scopeId==='peer');assert.notEqual(peer.auditId,contract.audit.components.find(c=>c.scopeId==='peer').auditId);assert.ok(f.messages.find(m=>m.type==='document-recheck-start').affectedNodeIds.includes('peer'));assert.equal(peer.snapshot.nodes[0].bounds.width,112);assert.ok(result.result.checks[1].findings.some(x=>x.name==='Второй экземпляр'&&x.status==='update'));}finally{f.emit('close');}
});
test('replaced descendants use frozen membership and fresh handles, never removed native getters',async()=>{
 let removedReads=0;const {f,native}=await setup(f=>{
  f.actual.children=[f.raw];const swap=f.actual.swapComponent;
  f.actual.swapComponent=next=>{swap(next);f.actual.children=[];f.raw.removed=true;Object.defineProperty(f.raw,'parent',{get(){removedReads++;throw Error('invented removed native handle');}});f.node('invented-new-descendant','RECTANGLE',f.actual,{visible:true,explicitVariableModes:{},resolvedVariableModes:{},fills:[],strokes:[],effects:[],opacity:1});};
 });try{f.messages.length=0;await f.api.ui.onmessage(request(native,'Составной компонент'));const result=await wait(f,'document-recheck-result');assert.equal(removedReads,0);assert.ok(f.messages.find(m=>m.type==='document-recheck-start').affectedNodeIds.includes(f.raw.id));assert.equal(result.result.checks[1].findings.some(x=>x.name==='Составной компонент'&&x.status==='update'),false);assert.equal(result.result.checks[4].findings.some(x=>x.occurrences.includes(f.raw.id)),false);assert.equal(f.writes.filter(x=>x[0]==='swap').length,1);}finally{f.emit('close');}
});
test('a projected SLOT instance update recaptures original siblings while keeping outside content excluded',async()=>{
 let outsideReads=0;const {f,native}=await setup(f=>{project(f);surround(f,{onRead:()=>outsideReads++});});try{
  const before=native.result.checks[1].findings.find(x=>x.name==='Составной компонент');assert.equal(before.evidence.scope,'projected-slot-root');
  f.messages.length=0;await f.api.ui.onmessage(request(native,'Составной компонент'));const result=await wait(f,'document-recheck-result');assert.equal(outsideReads,0);assert.equal(result.result.checks[1].findings.some(x=>x.name==='Составной компонент'&&x.status==='update'),false);assert.equal(result.result.checks[1].findings.find(x=>x.name==='Второй экземпляр').status,'update');assert.deepEqual(result.result.checks.map(c=>c.id),['local','freshness','theme','detached','customStyles','font']);assert.ok(!f.messages.find(m=>m.type==='document-recheck-start').affectedNodeIds.some(id=>id.startsWith('invented-outside')));
 }finally{f.emit('close');}
});
