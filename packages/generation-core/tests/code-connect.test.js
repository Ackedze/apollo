const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeCodeConnect,codeObservationFromProducer,screenSpecForProducer,createCompositionPlan,preflightPlan}=require('../dist/planning.cjs');
const {producerFixture}=require('./code-connect-fixtures.cjs');
const {hash,clone}=require('./planning-fixtures.cjs');
const normalize=f=>normalizeCodeConnect(f.raw,f.lock,f.context.view,['content','group'],hash);
test('normalization preserves exact producer/archive/manual/compiled pins and independent unaccepted states',()=>{
 const f=producerFixture(),before=JSON.stringify(f.raw),r=normalize(f);
 assert.equal(r.source.digest,f.raw.registryDigest);assert.equal(r.source.lockHash,hash(f.lock));
 assert.equal(r.source.contracts[0].archiveSha256,f.raw.mappings[0].contract.archiveSha256);
 assert.equal(r.source.contracts[0].manualSha256,f.raw.mappings[0].contract.manualSha256);
 assert.equal(r.entries[0].pin.compiledHash,f.context.view.components[0].pin.compiledHash);
 assert.equal(r.entries[0].assurance.fullContractParity,'not-confirmed');assert.equal(r.entries[0].assurance.codeRepresentation,'proposed-for-authoring');
 assert.equal(r.entries[0].assurance.builtPackage,'not-built-in-checkout');assert.equal(r.entries[0].gaps[0].id,'SYNTHETIC-PARITY-GAP');
 assert.equal(r.entries[0].figma.handlerId,'');assert.equal(r.entries[1].actions.figmaHandlerId,undefined);
 assert.equal(JSON.stringify(f.raw),before);assert.equal(Object.isFrozen(r.source.contracts),true);
});
for(const [name,mutate,code]of [
 ['source revision',f=>f.raw.mappings[0].contract.revision++,'MAPPING_CONTRACT_STALE'],
 ['manual source hash',f=>f.raw.mappings[0].contract.manualSourceHash=hash('drift'),'MAPPING_CONTRACT_STALE'],
 ['archive hash',f=>f.raw.mappings[0].contract.archiveSha256=hash('drift'),'STALE_MAPPING_LOCK'],
 ['dependency closure',f=>f.raw.mappings[0].contract.dependencyPins.push({componentId:'missing',revision:1,manualSourceHash:hash('m'),compiledHash:hash('c')}),'DEPENDENCY_PIN_INVALID'],
 ['registry lock',f=>f.lock.registryDigest=hash('drift'),'STALE_MAPPING_LOCK'],
 ['public import',f=>f.raw.mappings[0].code.subpath='arui-private/button','PRODUCER_MAPPING_UNCONFIRMED'],
 ['producer promotion',f=>f.raw.mappings[0].status.fullContractParity='confirmed','PRODUCER_MAPPING_UNCONFIRMED'],
])test('normalization rejects changed '+name,()=>{const f=producerFixture();mutate(f);assert.throws(()=>normalize(f),new RegExp(code));});
test('missing accepted passport API binding is retained as absence, never synthesized from a React prop',()=>{
 const f=producerFixture();f.context.view.components[1].api=[];
 const r=normalize(f);assert.equal(r.entries[1].actions,undefined);assert.throws(()=>screenSpecForProducer(f.spec,f.raw,r,'ready'),/ACTION_PORT_UNSUPPORTED/);
});
test('state-specific producer input preserves action disabled/events and fixed confirmed profile',()=>{
 const f=producerFixture(),r=normalize(f),ready=screenSpecForProducer(f.spec,f.raw,r,'ready'),changed=screenSpecForProducer(f.spec,f.raw,r,'changed');
 assert.equal(ready.slots.Body[0].figma.Size,'56');assert.equal(ready.slots.Body[0].figma.Overflow,'false');
 assert.equal(ready.slots.Body[0].actions[0].disabled,false);assert.equal(changed.slots.Body[0].actions[0].disabled,true);
 assert.equal(ready.slots.Body[0].actions[0].onClick.handlerRef,'event_0');
 delete f.spec.nodes[1].actions.items[0].view;assert.throws(()=>screenSpecForProducer(f.spec,f.raw,r,'ready'),/ACTION_INPUT_REQUIRED/);
});
test('normalized inputs require trusted NEXT-01 observations for the exact spec and every state',()=>{
 const f=producerFixture();f.context.registry=normalize(f);f.context.code=codeObservationFromProducer(f.context.registry);
 const p=createCompositionPlan(f.spec,f.context,hash),codes=c=>preflightPlan(p,c,hash).diagnostics.map(d=>d.code);
 assert.ok(codes(f.context).includes('PRODUCER_PREFLIGHT_REQUIRED'));
 const o={schemaVersion:'apollo.code-connect-observation.v1-experimental',status:'availability-pass',targetProduct:'apollo-v4',fullContractParity:'not-confirmed',
  registryDigest:f.raw.registryDigest,lockHash:hash(f.lock),specHash:hash(f.spec),codeHash:hash(f.context.code),
  stateReceipts:f.spec.states.values.map(state=>({state,preparedHash:hash(state)}))};o.receiptHash=hash(o);f.context.producerObservation=o;
 assert.ok(!codes(f.context).includes('PRODUCER_PREFLIGHT_REQUIRED'));
 o.specHash=hash('another-screen');assert.ok(codes(f.context).includes('PRODUCER_PREFLIGHT_REQUIRED'));
 o.specHash=hash(f.spec);o.receiptHash=hash('corrupt');assert.ok(codes(f.context).includes('PRODUCER_RECEIPT_STALE'));
});
