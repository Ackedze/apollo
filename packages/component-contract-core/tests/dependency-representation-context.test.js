const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const core=require('../dist/core.cjs'),capture=require('../dist/capture.cjs');
const H=path.join(__dirname,'helpers');
const {runNativeOccurrenceCapture}=require(path.join(H,'native-occurrence-capture.cjs'));
const {hostModeContract}=require(path.join(H,'host-mode-contract.cjs'));
const clone=x=>JSON.parse(JSON.stringify(x));
function snapshots(s,visit){
 const pending=[s],seen=new Set();
 while(pending.length){const n=pending.pop();if(!n||seen.has(n))continue;seen.add(n);visit(n);
  if(n.instanceContentReferences){pending.push(n.instanceContentReferences.base);for(const a of n.instanceContentReferences.attempts)if(a.reference)pending.push(a.reference);}
  for(const c of n.componentDependencyCaptures||[])if(c.snapshot)pending.push(c.snapshot);
 }
}
async function fixture(channel='desktop',representation='universal',nested=false){
 const invoke=async(figma,actual,request)=>{global.figma=figma;try{return await capture.captureInstanceAudit(actual,request)}finally{delete global.figma}};
 const child=clone((await runNativeOccurrenceCapture(invoke,{dependencies:nested})).result.snapshot);
 snapshots(child,s=>s.context.platform=channel);
 const map=Object.fromEntries(child.nodes.map(n=>[n.id,'nested:'+n.id])),rootId=child.selection[0];
 const outer={id:'outer',parentId:null,childIds:[map[rootId]],order:0,name:'Outer',type:'FRAME',visible:true,semantic:{path:'Outer'},component:{},layout:{},appearance:{},variable:{},unknownFacts:[],resolvedModes:clone(child.context.modes)};
 const nodes=child.nodes.map(n=>{const h=clone(n);h.id=map[n.id];h.parentId=n.id===rootId?'outer':map[n.parentId];h.childIds=n.childIds.map(id=>map[id]);return h});
 nodes.find(n=>n.id===map[rootId]).resolvedModes=clone(child.context.modes);
 const source=clone(child.source);source.rootNodeId='outer-native-root';
 const parent={schemaVersion:child.schemaVersion,generatedAt:child.generatedAt,source,selection:['outer'],context:clone(child.context),nodes:[outer,...nodes]};
 parent.componentDependencyCaptures=[{nodeId:map[rootId],nodeMap:map,snapshot:child},...(child.componentDependencyCaptures||[]).map(c=>({...clone(c),nodeId:map[c.nodeId],nodeMap:c.nodeMap?Object.fromEntries(Object.entries(c.nodeMap).map(([local,id])=>[local,map[id]])):undefined}))];
 const contract=clone(hostModeContract(core,'remove').contract);contract.facts.representations.filter(r=>r.kind==='figma').forEach(r=>r.platform=representation);
 return {parent,child,map,rootId,nodeId:map[rootId],contract};
}
const validate=f=>core.validatedDependencyCapture(f.parent,f.nodeId,f.contract);
for(const channel of ['desktop','mobile-web'])test(channel+' universal evidence remains independently resolvable',async()=>{
 const f=await fixture(channel),before=structuredClone(f.parent),v=validate(f);assert(v.snapshot,v.reason);
 snapshots(v.snapshot,s=>assert.equal(s.context.platform,'universal'));
 const prepared=core.prepareValidationSnapshot(v.snapshot,f.contract);
 assert(prepared.instanceContentResults.length>0);
 assert(prepared.instanceContentResults.every(r=>r.status==='matched'),JSON.stringify(prepared.instanceContentResults));
 assert.deepEqual(core.prepareValidationSnapshot(prepared,f.contract),prepared);
 assert.deepEqual(f.parent,before);
});
test('already universal child under desktop parent retains historical evidence',async()=>{
 const f=await fixture('universal');f.parent.context.platform='desktop';const before=structuredClone(f.parent),v=validate(f);assert(v.snapshot,v.reason);
 assert.deepEqual(v.snapshot.instanceContentReferences,f.child.instanceContentReferences);
 const p=core.prepareValidationSnapshot(v.snapshot,f.contract);assert(p.instanceContentResults.every(r=>r.status==='matched'));
 assert.deepEqual(f.parent,before);
});
test('same specific representation channel is unchanged',async()=>{
 const f=await fixture('desktop','desktop'),v=validate(f);assert(v.snapshot,v.reason);
 const p=core.prepareValidationSnapshot(v.snapshot,f.contract);assert(p.instanceContentResults.every(r=>r.status==='matched'));
});
test('a different specific channel is never projected',async()=>{
 const f=await fixture('mobile-web','desktop');assert.equal(validate(f).reason,'dependency-reference-context-mismatch');
});
test('a consistent foreign captured channel cannot be projected',async()=>{
 const f=await fixture('desktop');f.parent.context.platform='mobile-web';
 assert.equal(validate(f).reason,'dependency-reference-context-mismatch');
});
for(const edge of ['child','base','attempt'])test('missing captured channel at '+edge+' stays rejected',async()=>{
 const f=await fixture();const s=edge==='child'?f.child:edge==='base'?f.child.instanceContentReferences.base:f.child.instanceContentReferences.attempts[0].reference;
 delete s.context.platform;assert.equal(validate(f).reason,'dependency-reference-context-mismatch');
});
for(const edge of ['base','attempt'])test('contradictory evidence channel at '+edge+' stays rejected',async()=>{
 const f=await fixture();const s=edge==='base'?f.child.instanceContentReferences.base:f.child.instanceContentReferences.attempts[0].reference;
 s.context.platform='foreign';assert.equal(validate(f).reason,'dependency-reference-context-mismatch');
});
test('a captured channel marked unknown is not made known',async()=>{
 const f=await fixture();f.child.context.unknownFacts.push('context.platform');assert.equal(validate(f).reason,'dependency-reference-context-mismatch');
});
test('independent mode mismatch remains unresolved',async()=>{
 const f=await fixture(),before=structuredClone(f.parent);f.child.instanceContentReferences.base.context.modes.changed='foreign';const mutated=structuredClone(f.parent),v=validate(f);assert(v.snapshot,v.reason);
 const p=core.prepareValidationSnapshot(v.snapshot,f.contract);assert(p.instanceContentResults.some(r=>r.status==='unresolved'&&r.reason==='original-host-evidence-invalid'));
 assert.deepEqual(f.parent,mutated);assert.notDeepEqual(f.parent,before);
});
test('actual modes mismatch is rejected before projection',async()=>{
 const f=await fixture();f.child.context.modes.foreign='mode';assert.equal(validate(f).reason,'dependency-capture-incomplete');
});
test('native identity mismatch remains rejected',async()=>{
 const f=await fixture(),r=f.child.nodes.find(n=>n.id===f.rootId);r.component.identity.componentKey='foreign';
 f.parent.nodes.find(n=>n.id===f.nodeId).component=clone(r.component);
 assert.equal(validate(f).reason,'dependency-capture-identity-mismatch');
});
test('independent reference identity mismatch remains unresolved',async()=>{
 const f=await fixture();f.child.instanceContentReferences.base.source.componentKey='foreign';
 const v=validate(f);assert(v.snapshot,v.reason);
 const p=core.prepareValidationSnapshot(v.snapshot,f.contract);
 assert(p.instanceContentResults.some(r=>r.status==='unresolved'&&r.reason==='original-host-evidence-invalid'));
});
test('topology mismatch remains rejected',async()=>{
 const f=await fixture();f.parent.nodes=f.parent.nodes.filter(n=>n.id!==f.map[f.child.nodes.at(-1).id]);
 assert.equal(validate(f).reason,'dependency-capture-topology-mismatch');
});
function nestedContract(f,c,platform){
 const contract=clone(f.contract),s=c.snapshot,identity=s.nodes.find(n=>s.selection.includes(n.id)).component.identity;
 for(const r of contract.facts.representations.filter(r=>r.kind==='figma')){r.platform=platform;r.locator={componentKey:identity.componentKey,componentSetKey:identity.componentSetKey};}return contract;
}
test('derived nested captures are copied and keep their own channel',async()=>{
 const f=await fixture('desktop','universal',true),before=structuredClone(f.parent),v=validate(f);assert(v.snapshot,v.reason);
 const nested=v.snapshot.componentDependencyCaptures.find(c=>c.snapshot);assert(nested);assert.equal(v.snapshot.context.platform,'universal');
 assert.equal(v.snapshot.instanceContentReferences.base.context.platform,'universal');assert.equal(nested.snapshot.context.platform,'desktop');assert.deepEqual(f.parent,before);
 nested.snapshot.context.platform='sentinel';assert.deepEqual(f.parent,before);
});
test('a foreign nested captured channel is rejected at its own boundary',async()=>{
 const f=await fixture('desktop','universal',true),nested=f.parent.componentDependencyCaptures.find(c=>c.nodeId!==f.nodeId&&c.snapshot);nested.snapshot.context.platform='foreign';const before=structuredClone(f.parent),v=validate(f);assert(v.snapshot,v.reason);
 const c=v.snapshot.componentDependencyCaptures.find(c=>c.snapshot),parentBefore=structuredClone(v.snapshot);
 assert.equal(core.validatedDependencyCapture(v.snapshot,c.nodeId,nestedContract(f,c,'desktop')).reason,'dependency-reference-context-mismatch');assert.deepEqual(f.parent,before);assert.deepEqual(v.snapshot,parentBefore);
});
for(const channel of ['desktop','mobile-web'])for(const representation of [channel,'universal'])test(channel+' -> universal -> '+representation+' validates each boundary',async()=>{
 const f=await fixture(channel,'universal',true),before=structuredClone(f.parent),outer=validate(f);assert(outer.snapshot,outer.reason);
 const c=outer.snapshot.componentDependencyCaptures.find(c=>c.snapshot),capturedBefore=structuredClone(outer.snapshot),v=core.validatedDependencyCapture(outer.snapshot,c.nodeId,nestedContract(f,c,representation));
 assert(v.snapshot,v.reason);assert.equal(v.snapshot.context.platform,representation);assert.equal(c.snapshot.context.platform,channel);assert.deepEqual(f.parent,before);assert.deepEqual(outer.snapshot,capturedBefore);
});
for(const channel of ['desktop','mobile-web'])test('logical universal parent projects nonempty own '+channel+' reference bundle',async()=>{
 const f=await fixture(channel);f.parent.context.platform='universal';const before=structuredClone(f.parent),v=validate(f);assert(v.snapshot,v.reason);
 const p=core.prepareValidationSnapshot(v.snapshot,f.contract);assert(p.instanceContentResults.length>0);assert(p.instanceContentResults.every(r=>r.status==='matched'));assert.deepEqual(core.prepareValidationSnapshot(p,f.contract),p);assert.deepEqual(f.parent,before);
});
test('unknown logical universal parent never grants a new projection',async()=>{
 for(const marker of ['platform','context.platform']){const f=await fixture();f.parent.context.platform='universal';f.parent.context.unknownFacts.push(marker);const before=structuredClone(f.parent);assert.equal(validate(f).reason,'dependency-reference-context-mismatch');assert.deepEqual(f.parent,before);}
});
for(const missing of [true,false])test((missing?'missing':'unknown')+' nested original channel stays rejected',async()=>{
 const f=await fixture('desktop','universal',true),outer=validate(f);assert(outer.snapshot,outer.reason);const c=outer.snapshot.componentDependencyCaptures.find(c=>c.snapshot);
 if(missing)delete c.snapshot.context.platform;else c.snapshot.context.unknownFacts.push('context.platform');const before=structuredClone(outer.snapshot);
 assert.equal(core.validatedDependencyCapture(outer.snapshot,c.nodeId,nestedContract(f,c,'universal')).reason,'dependency-reference-context-mismatch');assert.deepEqual(outer.snapshot,before);
});
