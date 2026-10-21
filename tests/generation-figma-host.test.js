// Synthetic Plugin API/recipe boundary, not accepted production native bindings.
const test=require('node:test'),assert=require('node:assert/strict');
const {setup,executeFigma,hash,clone,planning}=require("./generation-figma-host.fixtures.cjs");
test('missing source/native recipes give exact input diagnostics before imports and canvas writes',async()=>{
 const s=setup({missingBindings:true}),r=await executeFigma(s.plan,hash,s.host);
 assert.equal(r.status,'blocked');assert.equal(r.rollback,'not-needed');assert.equal(s.created.length,0);assert.deepEqual(s.calls,[]);
 for(const code of ['FIGMA_NATIVE_BINDING_MISSING','FIGMA_SLOT_BINDING_MISSING','FIGMA_OWNED_ACTION_BINDING_MISSING','FIGMA_SCENARIO_BINDING_MISSING','FIGMA_CAPTURE_SCOPE_MISSING'])assert.ok(r.diagnostics.some(d=>d.code===code),code);
 assert.ok(r.diagnostics.some(d=>d.message.includes('targetId=body')&&d.message.includes('property=Body')));
});
test('native transaction creates actual API instances and retains incomplete live status',async()=>{
 const s=setup(),r=await executeFigma(s.plan,hash,s.host);
 assert.equal(r.status,'created',JSON.stringify(r.diagnostics));assert.equal(r.verification,'incomplete');assert.equal(r.rollback,'not-needed');
 assert.equal(r.provenance.length,4);assert.equal(new Set(r.provenance.map(p=>p.artifactId)).size,4);
 assert.equal(s.created.filter(n=>n.type==='INSTANCE').length,2);assert.ok(s.calls.some(c=>c.startsWith('capture:')));
 assert.ok(r.verificationEvidence.checks.some(c=>c.id==='event.first'&&c.status==='unknown'));assert.ok(s.reads()>10);
});
test('partial setProperties failure records partial provenance and removes only new roots',async()=>{
 const s=setup({failConfigure:true}),existing=s.node('FRAME','existing');s.page.appendChild(existing);
 const r=await executeFigma(s.plan,hash,s.host);assert.equal(r.status,'failed');assert.equal(r.rollback,'complete');
 assert.ok(r.provenance.some(p=>p.planNodeId==='content'));assert.ok(s.created.every(n=>n.removed));assert.equal(existing.removed,false);
});
test('fresh pin drift after a write stops generation and rolls back partial canvas',async()=>{
 let changed=false;const s=setup({onRead({created,f}){if(created.length&&!changed){changed=true;f.context.code.package.files['src/button-group/typings.ts']=hash('changed-source');}}});
 const r=await executeFigma(s.plan,hash,s.host);assert.equal(r.status,'failed');assert.equal(r.rollback,'complete');assert.ok(s.created.every(n=>n.removed));
 assert.ok(r.diagnostics.some(d=>d.code==='GENERATION_PREFLIGHT_BLOCKED'));
});
test('definition/recipe drift stops before begin; required fonts load before any canvas write',async()=>{
 const s=setup({onRead({reads,defs}){if(reads===3)Object.values(defs)[0].width=777;}}),r=await executeFigma(s.plan,hash,s.host);
 assert.equal(r.status,'blocked');assert.equal(s.created.length,0);assert.ok(r.diagnostics.some(d=>d.code==='FIGMA_NATIVE_DEFINITION_STALE'));
 const font=setup({fontFailure:true}),f=await executeFigma(font.plan,hash,font.host);assert.equal(f.status,'blocked');assert.equal(font.created.length,0);assert.ok(f.diagnostics.some(d=>d.code==='FIGMA_FONT_UNAVAILABLE'));
 const b=setup({onRead({reads,bindings}){if(reads===3)bindings.content.recipeHash=hash('updated-binding');}}),br=await executeFigma(b.plan,hash,b.host);assert.equal(br.status,'blocked');assert.ok(br.diagnostics.some(d=>d.code==='FIGMA_NATIVE_BINDING_STALE'));
});
test('failed canonical verification rolls back while preserving a foreign node reparented by the user',async()=>{
 const s=setup({captureFailure:true}),foreign=s.node('TEXT','foreign');foreign.absoluteTransform=[[1,0,65],[0,1,80]];
 const original=s.host.captureAndVerify;s.host.captureAndVerify=async(...args)=>{s.created[0].appendChild(foreign);return original(...args);};
 const r=await executeFigma(s.plan,hash,s.host);assert.equal(r.status,'failed');assert.equal(r.rollback,'incomplete');assert.equal(foreign.removed,false);assert.equal(foreign.parent,s.created[0]);assert.deepEqual(foreign.relativeTransform,[[1,0,65],[0,1,80]]);
 assert.equal(s.created[0].removed,false);assert.ok(r.diagnostics.some(d=>d.code==='FIGMA_ROLLBACK_FOREIGN_PRESERVED'));
});
test('general append cannot fill an instance or move an existing canvas node',async()=>{
 const s=setup();await s.host.resolve(s.f.context.registry.entries,s.plan);const root=await s.host.begin(s.plan.spec.viewport,hash(s.plan));
 const id=await s.host.createInstance(s.f.context.registry.entries[0],{},'content'),foreign=s.node('FRAME','existing');s.page.appendChild(foreign);
 await assert.rejects(s.host.append(id,[]),/FIGMA_NATIVE_APPEND/);await assert.rejects(s.host.append(root,[foreign.id]),/FIGMA_NATIVE_OWNERSHIP/);
 await s.host.rollback();assert.equal(foreign.removed,false);
});
test('text primitive requires an accepted style before mutation; closed primitives use typed API',async()=>{
 const s=setup(),spec=clone(s.plan.spec);spec.nodes=[{kind:'stack',id:'layout',direction:'vertical',gap:16,children:['text']},{kind:'text',id:'text',text:'Synthetic text'}];spec.root='layout';spec.events=[];spec.transitions=[];spec.states={initial:'initial',values:['initial']};
 s.plan=planning.createCompositionPlan(spec,s.f.context,hash);
 const blocked=await executeFigma(s.plan,hash,s.host);assert.equal(blocked.status,'blocked');assert.equal(s.created.length,0);assert.ok(blocked.diagnostics.some(d=>d.code==='FIGMA_PRIMITIVE_STYLE_MISSING'));
 const p=setup({primitives:{id:'synthetic-style',evidenceHash:hash('style'),textStyleId:'synthetic-text-style',fontName:{family:'Synthetic',style:'Regular'}}});
 p.plan=planning.createCompositionPlan(spec,p.f.context,hash);const r=await executeFigma(p.plan,hash,p.host);assert.equal(r.status,'created',JSON.stringify(r.diagnostics));assert.equal(p.created.find(n=>n.type==='TEXT').characters,'Synthetic text');assert.equal(p.created.find(n=>n.type==='FRAME'&&n.layoutMode).itemSpacing,16);
});
test('partial provenance failure cannot skip required rollback',async()=>{
 const s=setup({failConfigure:true});s.host.transactionProvenance=()=>{throw new Error('PROVENANCE_UNAVAILABLE');};
 const r=await executeFigma(s.plan,hash,s.host);assert.equal(r.rollback,'complete');assert.ok(s.created.every(n=>n.removed));assert.ok(r.diagnostics.some(d=>d.code==='FIGMA_PARTIAL_PROVENANCE_UNAVAILABLE'));
});
