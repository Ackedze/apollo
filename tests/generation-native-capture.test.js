const test=require('node:test'),assert=require('node:assert/strict'),esbuild=require('esbuild'),path=require('node:path'),vm=require('node:vm');
const runtime=require("../dist/runtime.cjs"),core=require("../packages/component-contract-core/dist/core.cjs");
const {runNativeOccurrenceCapture}=require("../packages/component-contract-core/tests/helpers/native-occurrence-capture.cjs");
const {hostModeContract}=require("../packages/component-contract-core/tests/helpers/host-mode-contract.cjs");
const sourceFixture=require("./authoring-fixtures");
const source=esbuild.buildSync({entryPoints:[path.join(__dirname,"../src/generation/figma/capture.ts")],bundle:true,platform:'browser',format:'cjs',write:false}).outputFiles[0].text;
function port(figma,resolver){const m={exports:{}};vm.runInNewContext(source,{module:m,exports:m.exports,figma,TextEncoder,setTimeout,clearTimeout});return m.exports.createGenerationNativeCapture(runtime,resolver);}
test('capture scope comes from validated authoring source and exact release/pin identity',async()=>{
 const source=sourceFixture.source(),loaded=runtime.loadAuthoringSource(source),c=loaded.contract;
 const mapping={figma:{componentKey:c.facts.component.componentKey},pin:{componentId:c.package.componentId,revision:source.manual.metadata.revision,contractId:c.package.id,compiledHash:runtime.contractHash(c),manualSourceHash:c.package.manualSourceHash}};
 const reply={releaseId:'synthetic-release',resolutions:[{componentKey:mapping.figma.componentKey,status:'resolved',contractId:c.package.id}],contracts:[{source,release:{id:'synthetic-release',contractId:c.package.id,contractHash:mapping.pin.compiledHash,sourceHash:loaded.sourceHash,manualSourceHash:c.package.manualSourceHash}}]};
 assert.equal(c.package.manualRevision,undefined,'legacy standalone projection omits package revision');
 assert.deepEqual(await port({},async()=>reply).loadScope(mapping,{}),c);
 mapping.pin.revision++;await assert.rejects(port({},async()=>reply).loadScope(mapping,{}),/FIGMA_CAPTURE_SCOPE_STALE/);mapping.pin.revision--;
 reply.contracts[0].release.contractHash='0'.repeat(64);await assert.rejects(port({},async()=>reply).loadScope(mapping,{}),/FIGMA_CAPTURE_SCOPE_STALE/);
 reply.resolutions[0].status='not-found';await assert.rejects(port({},async()=>reply).loadScope(mapping,{}),/FIGMA_CAPTURE_SCOPE_UNAVAILABLE/);
});
test('native capture preserves canonical engine verdict, evidence hashes and drift guard',async()=>{
 const f=hostModeContract(core,'remove');
 const {result}=await runNativeOccurrenceCapture(async(figma,actual)=>{
  const mapping={pin:{compiledHash:runtime.contractHash(f.contract)}};
  const observed=await port(figma).capture(actual,mapping,f.contract);
  assert.deepEqual(observed.facts.result.engine,runtime.auditContractSnapshot(observed.facts.snapshot,f.contract).engine);
  assert.ok(observed.checks.length);assert.ok(observed.checks.every(c=>/^[a-f0-9]{64}$/.test(c.evidenceHash)));
  await observed.assertCurrent();actual.opacity=.4;await assert.rejects(observed.assertCurrent(),/FIGMA_CAPTURE_STALE/);actual.opacity=1;
  return observed;
 },{modeCatalogDrift:'remove',modePair:true,selectedIndex:0});
 assert.ok(result.checks.some(c=>c.id.startsWith('synthetic.primary-position')));
});
