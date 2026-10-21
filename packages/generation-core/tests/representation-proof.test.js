const test=require('node:test'),assert=require('node:assert/strict'),g=require('../dist/index.cjs');
const {fixture,hash,clone}=require('./planning-fixtures.cjs');
function setup(){const f=fixture(),c=f.context.view.components[0],m=f.context.registry.entries[0],r=c.representations[1];const basis='b'.repeat(64),current='d'.repeat(64),ref={path:'receipts/synthetic.json',sha256:'c'.repeat(64)};
 r.codeEvidence={version:1,sourcePin:{packageName:f.context.code.package.name,packageVersion:f.context.code.package.version,commit:f.context.code.package.commit,registryDigest:basis,mappingId:m.id},availability:{status:'confirmed-source-api',evidenceRefs:[ref]},parity:{status:'not-confirmed',profileIds:[],unresolvedGapIds:['layout-gap']},acceptance:{status:'not-run',receiptRefs:[]},publication:{status:'not-confirmed'}};
 c.evidenceScopeHash='e'.repeat(64);c.generationProfiles=[{id:'pilot',representationId:r.id,platform:'desktop',intent:'synthetic',properties:{}}];m.generationProfileId='pilot';f.context.registry.source={digest:current};
 const o={version:1,componentId:c.pin.componentId,representationId:r.id,scopeHash:c.evidenceScopeHash,basisRegistryDigest:basis,currentRegistryDigest:current,codeHash:hash(f.context.code),verifiedRefs:[ref],acceptedProfileIds:['pilot']};o.receiptHash=hash(o);f.context.representationObservations=[o];return {f,c,m,r,o,ref};}
test('fresh API proof is independent from code profile acceptance and basis digest need not equal current archive registry',()=>{
 const x=setup();assert.deepEqual(g.representationProof(x.f.context,x.c,x.m,hash),{api:true,profile:false});
 Object.assign(x.r.codeEvidence.parity,{status:'accepted-for-profile',profileIds:['pilot'],unresolvedGapIds:[]});Object.assign(x.r.codeEvidence.acceptance,{status:'accepted',receiptRefs:[x.ref]});assert.deepEqual(g.representationProof(x.f.context,x.c,x.m,hash),{api:true,profile:true});
 x.r.codeEvidence.parity.unresolvedGapIds.push('width');assert.equal(g.representationProof(x.f.context,x.c,x.m,hash).profile,false);
});
test('missing, duplicate, stale registry/checkout/scope/ref/receipt observations never supply API or profile acceptance',()=>{
 for(const mutate of [x=>delete x.f.context.representationObservations,x=>x.f.context.representationObservations.push(clone(x.o)),x=>x.o.currentRegistryDigest='f'.repeat(64),x=>x.o.codeHash='f'.repeat(64),x=>x.o.scopeHash='f'.repeat(64),x=>x.o.receiptHash='f'.repeat(64),x=>x.o.verifiedRefs[0].sha256='f'.repeat(64),x=>x.o.version=2]){const x=setup();mutate(x);assert.equal(g.representationProof(x.f.context,x.c,x.m,hash).api,false);}
 const x=setup();x.f.context.view.components[0].sourceStatus='draft';const p=g.preflightPlan(g.createCompositionPlan(x.f.spec,x.f.context,hash),x.f.context,hash);assert.equal(p.sourceReadiness,'blocked');assert.ok(p.diagnostics.some(d=>d.code==='SOURCE_NOT_READY'));assert.ok(p.diagnostics.some(d=>d.code==='CODE_PROFILE_UNACCEPTED'));
});
