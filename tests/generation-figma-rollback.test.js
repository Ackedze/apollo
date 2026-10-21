const test=require('node:test'),assert=require('node:assert/strict');
const {setup,executeFigma,hash,createNativeRollbackJournal}=require("./generation-figma-host.fixtures.cjs");
function journalSetup(){
 const s=setup(),owned=new Map(),roots=[];
 function own(id,parent=s.page){const n=s.node('FRAME',id);parent.appendChild(n);owned.set(n.id,n);roots.push(n);return n;}
 function foreign(id,parent){const n=s.node('FRAME',id);parent.appendChild(n);return n;}
 const a=own('journal-a'),b=own('journal-b');
 const journal=createNativeRollbackJournal(owned,()=>roots);
 return Object.assign(s,{owned,roots,own,foreign,a,b,journal});
}
function codes(r){return Array.from(r.diagnostics,d=>d.code);}
test('unknown foreign subtree is preserved in place; nested owned roots cannot cascade through it',()=>{
 const s=journalSetup(),nested=s.own('journal-nested',s.a),f=s.foreign('foreign-container',nested),child=s.node('TEXT','foreign-child');f.appendChild(child);
 const mixed=s.own('generated-inside-foreign',f);f.relativeTransform=[[0,-1,21],[1,0,34]];
 const before={parent:f.parent,index:f.parent.children.indexOf(f),matrix:JSON.stringify(f.relativeTransform),world:JSON.stringify(f.absoluteTransform),childParent:child.parent};
 Object.defineProperty(f,'children',{get(){throw Error('FOREIGN_SUBTREE_MUST_STAY_OPAQUE');}});
 s.page.appendChild=()=>{throw Error('SPECULATIVE_REHOME_FORBIDDEN');};
 const r=s.journal.rollback();assert.equal(r.status,'incomplete');assert.ok(codes(r).includes('FIGMA_ROLLBACK_FOREIGN_PRESERVED'));
 assert.equal(f.removed,false);assert.equal(child.removed,false);assert.equal(mixed.removed,false);assert.equal(f.parent,before.parent);
 assert.equal(f.parent.children.indexOf(f),before.index);assert.equal(JSON.stringify(f.relativeTransform),before.matrix);assert.equal(JSON.stringify(f.absoluteTransform),before.world);assert.equal(child.parent,before.childParent);
 assert.equal(nested.removed,false);assert.equal(s.a.removed,false);assert.equal(s.b.removed,true);assert.ok(!s.calls.some(c=>['remove:foreign-container','remove:foreign-child','remove:generated-inside-foreign','remove:journal-a','remove:journal-nested'].includes(c)));
});
test('synchronous pre-mutation journal restores exact foreign parent/order/local and absolute transform',async()=>{
 const s=journalSetup();s.a.relativeTransform=[[1,0,100],[0,1,200]];s.b.relativeTransform=[[1,0,300],[0,1,400]];
 const left=s.own('left-anchor',s.a),f=s.foreign('known-foreign',s.a),child=s.node('TEXT','known-child');f.appendChild(child);const right=s.own('right-anchor',s.a);
 f.relativeTransform=[[0,-1,11],[1,0,23]];child.relativeTransform=[[1,0,4],[0,1,6]];
 const original={ids:s.a.children.map(n=>n.id),relative:JSON.stringify(f.relativeTransform),absolute:JSON.stringify(f.absoluteTransform),childAbsolute:JSON.stringify(child.absoluteTransform)};
 await s.journal.write(()=>{s.b.insertChild(0,f);f.relativeTransform=[[1,0,55],[0,1,77]];});
 const r=s.journal.rollback();assert.equal(r.status,'incomplete');assert.ok(codes(r).includes('FIGMA_ROLLBACK_FOREIGN_RESTORED'));
 assert.equal(f.parent,s.a);assert.equal(JSON.stringify(f.relativeTransform),original.relative);assert.equal(JSON.stringify(f.absoluteTransform),original.absolute);assert.equal(JSON.stringify(child.absoluteTransform),original.childAbsolute);
 assert.equal(f.removed,false);assert.equal(child.parent,f);assert.equal(s.a.removed,false);
 assert.deepEqual(s.a.children.map(n=>n.id),original.ids);assert.equal(left.removed,false);assert.equal(right.removed,false);
});
test('two journalled foreign siblings restore source order instead of reverse recovery order',async()=>{
 const s=journalSetup(),f1=s.foreign('known-one',s.a),f2=s.foreign('known-two',s.a);
 await s.journal.write(()=>{s.b.appendChild(f2);s.b.appendChild(f1);});
 const r=s.journal.rollback();assert.equal(r.status,'incomplete');assert.deepEqual(s.a.children.map(n=>n.id),['known-one','known-two']);assert.equal(f1.parent,s.a);assert.equal(f2.parent,s.a);
 assert.equal(r.diagnostics.filter(d=>d.code==='FIGMA_ROLLBACK_FOREIGN_RESTORED').length,2);
});
test('Auto Layout ancestor sibling anchors retain the known final world transform',async()=>{
 const s=journalSetup(),outer=s.own('layout-outer');outer.appendChild(s.b);outer.appendChild(s.a);
 Object.defineProperty(s.a,'absoluteTransform',{configurable:true,get(){return [[1,0,outer.children.indexOf(s.a)*80],[0,1,0]];}});
 const f=s.foreign('layout-foreign',s.a);f.relativeTransform=[[1,0,7],[0,1,9]];const world=JSON.stringify(f.absoluteTransform);
 await s.journal.write(()=>s.b.appendChild(f));const r=s.journal.rollback();
 assert.equal(r.status,'incomplete');assert.ok(codes(r).includes('FIGMA_ROLLBACK_FOREIGN_RESTORED'));assert.equal(f.parent,s.a);assert.equal(JSON.stringify(f.absoluteTransform),world);
 assert.deepEqual(outer.children.map(n=>n.id),['journal-b','journal-a']);assert.equal(s.b.removed,false);assert.equal(outer.removed,false);
});
for(const mode of ['insert-before','insert-after','transform'])test('failed known recovery '+mode+' retains both original and current ancestors and retries safely',async()=>{
 const s=journalSetup(),f=s.foreign('retry-foreign',s.a),child=s.node('TEXT','retry-child');f.appendChild(child);
 await s.journal.write(()=>{s.b.appendChild(f);f.relativeTransform=[[1,0,44],[0,1,55]];});
 const insert=s.a.insertChild;let fault=true;
 if(mode!=='transform')s.a.insertChild=function(i,n){if(mode==='insert-after')insert.call(this,i,n);if(fault)throw Error('FAULT_INSERT');return insert.call(this,i,n);};
 else {
  const descriptor=Object.getOwnPropertyDescriptor(f,'relativeTransform');Object.defineProperty(f,'relativeTransform',{configurable:true,get:descriptor.get,set(value){if(fault)throw Error('FAULT_TRANSFORM');descriptor.set.call(this,value);}});
 }
 let r=s.journal.rollback();assert.equal(r.status,'incomplete');assert.ok(codes(r).some(c=>c==='FIGMA_ROLLBACK_RESTORE_FAILED'||c==='FIGMA_ROLLBACK_RESTORE_UNCONFIRMED'));
 assert.equal(f.removed,false);assert.equal(child.removed,false);assert.equal(s.a.removed,false);if(f.parent===s.b)assert.equal(s.b.removed,false);
 fault=false;r=s.journal.rollback();assert.equal(r.status,'incomplete');assert.equal(f.parent,s.a);assert.deepEqual(JSON.parse(JSON.stringify(f.relativeTransform)),[[1,0,0],[0,1,0]]);assert.equal(f.removed,false);assert.equal(child.parent,f);
});
test('missing/removed original parent does not invent a fallback page or delete the foreign subtree',async()=>{
 const s=journalSetup(),f=s.foreign('missing-parent-foreign',s.a);
 await s.journal.write(()=>s.b.appendChild(f));s.a.remove();
 const r=s.journal.rollback();assert.equal(r.status,'incomplete');assert.ok(codes(r).includes('FIGMA_ROLLBACK_PARENT_UNAVAILABLE'));assert.equal(f.parent,s.b);assert.equal(f.removed,false);assert.equal(s.b.removed,false);
});
test('missing foreign parent pointer cannot bypass the actual child-list deletion fence',()=>{
 const s=journalSetup(),f=s.foreign('missing-pointer-foreign',s.a);f.parent=null;
 const r=s.journal.rollback();assert.equal(r.status,'incomplete');assert.equal(s.a.removed,false);assert.equal(f.removed,false);assert.ok(!s.calls.includes('remove:journal-a'));
});
test('new sibling/user parent transform changes prevent exact restoration without overwriting edits',async()=>{
 for(const mode of ['sibling','parent-transform']){
  const s=journalSetup(),f=s.foreign('edited-foreign',s.a);await s.journal.write(()=>s.b.appendChild(f));
  const extra=mode==='sibling'?s.foreign('new-user-sibling',s.a):null;if(mode==='parent-transform')s.a.relativeTransform=[[1,0,900],[0,1,800]];
  const r=s.journal.rollback();assert.equal(r.status,'incomplete');assert.ok(codes(r).includes(mode==='sibling'?'FIGMA_ROLLBACK_ORDER_CHANGED':'FIGMA_ROLLBACK_TRANSFORM_CHANGED'));
  assert.equal(f.parent,s.b);assert.equal(f.removed,false);assert.equal(s.a.removed,false);assert.equal(s.b.removed,false);if(extra)assert.equal(extra.removed,false);
 }
});
test('external relationship/transform edits after the journal remain intact',async()=>{
 const s=journalSetup(),f=s.foreign('drift-foreign',s.a);await s.journal.write(()=>s.b.appendChild(f));
 s.b.insertChild(0,f);f.relativeTransform=[[1,0,72],[0,1,96]];f.characters='new-user-text';
 const r=s.journal.rollback();assert.equal(r.status,'incomplete');assert.ok(codes(r).includes('FIGMA_ROLLBACK_FOREIGN_DRIFT'));assert.equal(f.parent,s.b);assert.deepEqual(f.relativeTransform,[[1,0,72],[0,1,96]]);assert.equal(f.characters,'new-user-text');assert.equal(f.removed,false);
});
test('async drift is not attributed to a host write and concurrent rollback does no deletion',async()=>{
 const s=journalSetup(),f=s.foreign('async-foreign',s.a);let release;const gate=new Promise(r=>release=r);
 const pending=s.journal.write(async()=>{await gate;});
 let r=s.journal.rollback();assert.equal(r.status,'incomplete');assert.deepEqual(codes(r),['FIGMA_ROLLBACK_WRITE_ACTIVE']);assert.ok(!s.calls.some(c=>c.startsWith('remove:')));
 s.b.appendChild(f);f.relativeTransform=[[1,0,17],[0,1,19]];release();await pending;
 r=s.journal.rollback();assert.equal(r.status,'incomplete');assert.ok(codes(r).includes('FIGMA_ROLLBACK_FOREIGN_DRIFT'));assert.equal(f.parent,s.b);assert.deepEqual(f.relativeTransform,[[1,0,17],[0,1,19]]);assert.equal(f.removed,false);
});
test('foreign content introduced by a failed nested remove fences the later ancestor deletion',()=>{
 const s=journalSetup(),nested=s.own('failing-nested',s.a),f=s.node('FRAME','late-foreign'),child=s.node('TEXT','late-child');f.appendChild(child);
 nested.remove=()=>{s.calls.push('fault-remove-nested');nested.appendChild(f);throw Error('FAULT_REMOVE_AFTER_FOREIGN_DRIFT');};
 const r=s.journal.rollback();assert.equal(r.status,'incomplete');assert.ok(codes(r).includes('FIGMA_ROLLBACK_REMOVE_FAILED'));
 assert.equal(f.removed,false);assert.equal(child.removed,false);assert.equal(nested.removed,false);assert.equal(s.a.removed,false);assert.ok(!s.calls.includes('remove:journal-a'));assert.ok(!s.calls.includes('remove:late-foreign'));
});
test('failed removal cannot report complete; own-only retry cleans up then permits a new transaction',()=>{
 const s=journalSetup(),remove=s.a.remove;let fail=true;s.a.remove=function(){if(fail)throw Error('FAULT_REMOVE');return remove.call(this);};
 let r=s.journal.rollback();assert.equal(r.status,'incomplete');assert.ok(codes(r).includes('FIGMA_ROLLBACK_REMOVE_FAILED'));assert.equal(s.a.removed,false);assert.throws(()=>s.journal.reset(),/FIGMA_NATIVE_TRANSACTION_ACTIVE/);
 fail=false;r=s.journal.rollback();assert.equal(r.status,'complete');assert.ok(Array.from(s.owned.values()).every(n=>n.removed));s.journal.reset();
});
test('transaction-owned orphan descendants clean up; owned descendants in an opaque foreign parent stay intact',()=>{
 for(const mode of ['page','foreign-parent']){
  const s=journalSetup(),orphan=s.node('FRAME','owned-orphan');s.owned.set(orphan.id,orphan);
  let foreign=null;if(mode==='page')s.page.appendChild(orphan);else{foreign=s.node('FRAME','opaque-parent');s.page.appendChild(foreign);foreign.appendChild(orphan);Object.defineProperty(orphan,'children',{get(){throw Error('OPAQUE_OWNED_SUBTREE_MUST_NOT_BE_SCANNED');}});}
  const r=s.journal.rollback();assert.equal(r.status,mode==='page'?'complete':'incomplete');assert.equal(orphan.removed,mode==='page');
  if(foreign){assert.equal(foreign.removed,false);assert.equal(orphan.parent,foreign);assert.ok(codes(r).includes('FIGMA_ROLLBACK_OWNED_RETAINED'));}
 }
});
test('retained unknown foreign content remains incomplete on retry; user move allows safe cleanup without claiming restored',()=>{
 const s=journalSetup(),f=s.foreign('unknown-retry',s.a);let r=s.journal.rollback();assert.equal(r.status,'incomplete');assert.throws(()=>s.journal.reset(),/FIGMA_NATIVE_TRANSACTION_ACTIVE/);
 r=s.journal.rollback();assert.equal(r.status,'incomplete');assert.equal(f.parent,s.a);
 s.page.appendChild(f);r=s.journal.rollback();assert.equal(r.status,'incomplete');assert.equal(f.removed,false);assert.equal(f.parent,s.page);assert.ok(Array.from(s.owned.values()).every(n=>n.removed));
 assert.equal(s.journal.rollback().status,'incomplete');s.journal.reset();
});
test('unreadable bounded scope or a node limit stops deletion before speculative cascade',()=>{
 for(const mode of ['unreadable','limit']){
  const s=journalSetup(),f=s.foreign('unreadable-foreign',s.a);
  if(mode==='unreadable')Object.defineProperty(s.a,'children',{get(){throw Error('FAULT_CHILDREN');}});
  else for(let i=0;i<5000;i++)s.a.appendChild(s.node('TEXT','wide-'+i));
  const r=s.journal.rollback();assert.equal(r.status,'incomplete');assert.ok(codes(r).includes('FIGMA_ROLLBACK_SCOPE_UNREADABLE'));assert.equal(f.removed,false);assert.equal(s.a.removed,false);assert.ok(!s.calls.some(c=>c.startsWith('remove:')));
 }
});
test('adapter preserves incomplete recovery diagnostics instead of turning preservation into complete rollback',async()=>{
 const s=setup({captureFailure:true}),foreign=s.node('FRAME','integration-foreign'),child=s.node('TEXT','integration-child');foreign.appendChild(child);
 const capture=s.host.captureAndVerify;s.host.captureAndVerify=async(...args)=>{s.created[0].appendChild(foreign);return capture(...args);};
 const r=await executeFigma(s.plan,hash,s.host);assert.equal(r.status,'failed');assert.equal(r.rollback,'incomplete');assert.ok(codes(r).includes('FIGMA_ROLLBACK_FOREIGN_PRESERVED'));assert.equal(foreign.parent,s.created[0]);assert.equal(child.parent,foreign);assert.equal(foreign.removed,false);assert.equal(child.removed,false);
 await assert.rejects(s.host.resolve(s.f.context.registry.entries,s.plan),/FIGMA_NATIVE_TRANSACTION_ACTIVE/);
 s.page.appendChild(foreign);assert.equal((await s.host.rollback()).status,'incomplete');assert.ok(s.created.every(n=>n.removed));await s.host.resolve(s.f.context.registry.entries,s.plan);
});
test('adapter retains structured rollback errors and rejects malformed recovery outcomes',async()=>{
 for(const mode of ['throw','invalid']){
  const s=setup({failConfigure:true});s.host.rollback=async()=>{if(mode==='invalid')return{status:'pretend-complete',diagnostics:[]};const e=Error('FIGMA_ROLLBACK_INCOMPLETE');e.diagnostics=[{code:'FIGMA_ROLLBACK_RESTORE_FAILED',stage:'execution',target:'figma',nodeId:'synthetic-foreign',message:'Synthetic recovery failure.'}];throw e;};
  const r=await executeFigma(s.plan,hash,s.host);assert.equal(r.rollback,'incomplete');assert.ok(codes(r).includes(mode==='throw'?'FIGMA_ROLLBACK_RESTORE_FAILED':'FIGMA_ROLLBACK_RESULT_INVALID'));
 }
});
