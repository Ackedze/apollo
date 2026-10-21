// Separate Node-side review port. No GenerationController, host, writer or target readiness is called.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const bindingReader=require("./static-review-consumer-binding.cjs");
const repository=path.resolve(__dirname,"..");
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const digest=value=>sha(JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v));
const fail=code=>{throw Object.assign(new Error(code),{code});};
function safe(root,relative){if(typeof relative!=='string'||path.isAbsolute(relative)||relative.includes('\\')||relative.split('/').some(p=>!p||p==='.'||p==='..'))fail('REVIEW_PIN_PATH');return path.join(root,relative);}
function actual(file){return fs.existsSync(file)?sha(fs.readFileSync(file)):null;}
function pin(root,p,code){const file=root?safe(root,p.path):p.path;if(!/^[a-f0-9]{64}$/.test(p.sha256)||actual(file)!==p.sha256)fail(code);return file;}
function currentBuild(){
 const runtimeFile=path.join(repository,"./dist/runtime.cjs"),buildFile=path.join(repository,"./dist/build-inputs.json");
 const manifest=JSON.parse(fs.readFileSync(buildFile)),runtime=require(runtimeFile);
 if(manifest.documentType!=='apollo-v4-local-build-inputs'||manifest.profileVersion!==runtime.RUNTIME_VERSION||!Array.isArray(manifest.inputs)||!manifest.inputs.length)fail('REVIEW_BUILD_MANIFEST');
 for(const p of manifest.inputs)pin(repository,p,'REVIEW_BUILD_STALE');
 return {runtime,identity:{coreVersion:manifest.runtimeVersion,profileVersion:runtime.RUNTIME_VERSION,runtimeSha256:actual(runtimeFile),buildInputsSha256:actual(buildFile)}};
}
function readPinnedReviewHeader({manifestPin,reportPin}){
 const initialPortPins={script:actual(__filename),generationCore:actual(path.join(repository,"./packages/generation-core/dist/index.cjs")),bindingReader:actual(path.join(__dirname,"./static-review-consumer-binding.cjs"))};
 const manifestFile=pin(null,manifestPin,'REVIEW_MANIFEST_STALE'),reportFile=pin(null,reportPin,'REVIEW_REPORT_STALE');
 const a=JSON.parse(fs.readFileSync(manifestFile)),report=JSON.parse(fs.readFileSync(reportFile));
 const payload=Object.assign({},a);delete payload.artifactDigest;
 if(a.schemaVersion!=='apollo.code-connect.static-producer.v1-draft'||a.version!==1||a.status!=='draft'||a.accepted!==false||a.executionAllowed!==false||a.artifactDigest!==digest(payload)
  ||a.outputVersion!=='apollo.code-connect.static-content.v1-draft'||a.planVersion!=='apollo.code-connect.static-review-plan.v1-draft'||a.generationPlanHash!==null||a.generationWireSupport!=='not-supported')fail('REVIEW_MANIFEST_INVALID');
 if(report.documentType!=='next-03-code-connect-static-source-api-review-handoff'||report.version!==1||report.accepted!==false||report.executionAllowed!==false||report.generationPlanHash!==null||report.producerManifest.sha256!==manifestPin.sha256||report.producerManifest.artifactDigest!==a.artifactDigest)fail('REVIEW_REPORT_INVALID');
 pin(null,a.consumerVector,'REVIEW_VECTOR_STALE');
 return {a,report,initialPortPins};
}
/** Explicit pinned trust inputs. An imported review JSON cannot select or replace its own basis. */
async function loadStaticReviewInputs({producerRoot,workspaceRoot,manifestPin,reportPin,receiptPin,artifactRoots,configPath}){
 const {a,report,initialPortPins}=readPinnedReviewHeader({producerRoot,workspaceRoot,manifestPin,reportPin});
 let consumerBinding;
 try{consumerBinding=bindingReader.loadConsumerBinding({receiptPin,artifactRoots,configPath,producerRoot,workspaceRoot,repositoryRoot:repository,manifestPin,reportPin,buildManifestPath:path.join(repository,"./dist/build-inputs.json")});}
 catch(e){const code=/^CONSUMER_BINDING_[A-Z0-9_]{1,60}$/.test(e.code||'')?e.code:'CONSUMER_BINDING_UNAVAILABLE';consumerBinding={result:bindingReader.bindingUnavailable(code,'rejected'),assertCurrent(){}};}
 for(const p of a.producerFiles)pin(producerRoot,p,'REVIEW_PRODUCER_STALE');for(const p of a.apiEvidenceFiles)pin(producerRoot,p,'REVIEW_API_STALE');
 for(const p of a.requestPins)pin(null,p,'REVIEW_REQUEST_STALE');
 pin(producerRoot,a.frozen.registry,'REVIEW_REGISTRY_STALE');pin(producerRoot,a.frozen.lock,'REVIEW_LOCK_STALE');
 const bridge=require(safe(producerRoot,'tools/code-connect/registry/consumer.cjs'));
 const registry=bridge.loadRegistry(safe(producerRoot,a.frozen.registry.path)),lock=JSON.parse(fs.readFileSync(safe(producerRoot,a.frozen.lock.path)));
 bridge.verifyLock(registry,lock);bridge.verifySource(registry,producerRoot,workspaceRoot);
 if(registry.registryDigest!==a.frozen.registryDigest||digest(registry.currentInputs)!==a.frozen.currentInputsDigest||digest(lock)!==a.frozen.lockDigest||registry.authoringBasis.registryDigest!==a.frozen.basisRegistryDigest||digest(lock.inputPackages)!==digest(a.frozen.inputPackages))fail('REVIEW_SOURCE_BASIS_STALE');
 const mismatches=()=>{
  const rows=[];for(const [root,pins]of [[repository,a.consumerFiles],[workspaceRoot,a.workspaceConsumerFiles],[repository,a.buildInputs]])for(const p of pins){const file=safe(root,p.path),value=actual(file);if(value!==p.sha256)rows.push({path:file,expectedSha256:p.sha256,actualSha256:value});}
  return rows.filter((r,i)=>rows.findIndex(s=>s.path===r.path)===i).sort((a,b)=>a.path.localeCompare(b.path));
 };
 const {runtime,identity}=currentBuild(),gen=require(path.join(repository,"./packages/generation-core/dist/index.cjs")),core=require(path.join(repository,"./packages/component-contract-core/dist/core.cjs"));
 const sources=a.frozen.inputPackages.map(p=>({name:path.basename(p.archivePath),archivePath:p.archivePath,bytes:fs.readFileSync(safe(workspaceRoot,p.archivePath)),main:{path:p.manualPath,bytes:fs.readFileSync(safe(workspaceRoot,p.manualPath))}}));
 const sourceReview=await gen.readAuthoringPackageReview(sources,a.frozen.inputPackages,{runtime,readZip:core.readZip,identity});
 let strictRuntimeProbe;
 try{await gen.loadContractPackages(sources,{runtime,readZip:core.readZip,identity});strictRuntimeProbe={status:'source-loaded',accepted:false,executionAllowed:false};}
 catch(e){if(e.code!=='SOURCE_COMPILE')throw e;strictRuntimeProbe={status:'blocked',code:e.code,message:e.message,accepted:false,executionAllowed:false};}
 const mappings=registry.mappings.filter(m=>['arui-private.corporate-content.desktop','arui-private.buttons-group.desktop'].includes(m.id)).map(m=>({id:m.id,pin:{componentId:m.contract.componentId,contractId:m.contract.contractId,revision:m.contract.revision,manualSourceHash:m.contract.manualSourceHash,compiledHash:m.contract.compiledHash},representationId:m.code.proposedRepresentationId,sourceScopeHash:registry.currentInputs.packages.find(p=>p.componentId===m.contract.componentId).representationScopeHash||null}));
 const basis={artifactDigest:a.artifactDigest,registryDigest:a.frozen.registryDigest,currentInputsDigest:a.frozen.currentInputsDigest,lockDigest:a.frozen.lockDigest,consumerFilesDigest:digest(a.consumerFiles),workspaceConsumerFilesDigest:digest(a.workspaceConsumerFiles),buildInputsDigest:digest(a.buildInputs),consumerVector:a.consumerVector,
  basisRegistryDigest:a.frozen.basisRegistryDigest,apiEvidenceDigest:digest(a.apiEvidenceFiles),inputPackages:a.frozen.inputPackages,mappings,sourceReview,consumerMismatches:mismatches()};
 function assertCurrent(){
 // Close concurrent edits across awaits. Producer/source changes reject; consumer edits reject freshness, preserving a historical document only.
 pin(null,manifestPin,'REVIEW_MANIFEST_STALE');pin(null,reportPin,'REVIEW_REPORT_STALE');
 for(const p of a.producerFiles)pin(producerRoot,p,'REVIEW_PRODUCER_STALE');for(const p of a.apiEvidenceFiles)pin(producerRoot,p,'REVIEW_API_STALE');for(const p of a.requestPins)pin(null,p,'REVIEW_REQUEST_STALE');
 pin(producerRoot,a.frozen.registry,'REVIEW_REGISTRY_STALE');pin(producerRoot,a.frozen.lock,'REVIEW_LOCK_STALE');bridge.verifySource(registry,producerRoot,workspaceRoot);
 if(actual(__filename)!==initialPortPins.script||actual(path.join(__dirname,"./static-review-consumer-binding.cjs"))!==initialPortPins.bindingReader||actual(path.join(repository,"./packages/generation-core/dist/index.cjs"))!==initialPortPins.generationCore)fail('REVIEW_PORT_CHANGED');
 if(digest(currentBuild().identity)!==digest(identity)||digest(mismatches())!==digest(basis.consumerMismatches))fail('REVIEW_READ_CHANGED');
 try{consumerBinding.assertCurrent();}catch(e){consumerBinding.result=bindingReader.bindingUnavailable(/^CONSUMER_BINDING_[A-Z0-9_]{1,60}$/.test(e.code||'')?e.code:'CONSUMER_BINDING_UNAVAILABLE','stale');}
 }
 assertCurrent();return {basis,report,strictRuntimeProbe,assertCurrent,consumerBinding,reviewPortPins:{scriptSha256:actual(__filename),generationCoreSha256:actual(path.join(repository,"./packages/generation-core/dist/index.cjs")),runtimeIdentity:identity}};
}
async function loadStaticProducerReview(config){
 // Preserve early output-pin rejection of the previous standalone reader.
 const {report}=readPinnedReviewHeader(config),output=report.outputs.find(p=>path.resolve(p.path)===path.resolve(config.reviewPath));
 if(!output)fail('REVIEW_OUTPUT_UNPINNED');pin(null,output,'REVIEW_OUTPUT_STALE');
 const ctx=await loadStaticReviewInputs(config),gen=require(path.join(repository,"./packages/generation-core/dist/index.cjs"));
 const input=JSON.parse(fs.readFileSync(config.reviewPath)),basis=Object.assign({},ctx.basis,{historicalSourceRead:output.generationSourceRead});
 const inspection=gen.inspectStaticProducerReview(input,basis,digest);pin(null,output,'REVIEW_OUTPUT_STALE');ctx.assertCurrent();
 const result={schemaVersion:'apollo.v4-static-review-read.v1-draft',status:'draft',accepted:false,executionAllowed:false,inspection,strictRuntimeProbe:ctx.strictRuntimeProbe,reviewPortPins:ctx.reviewPortPins};
 if(config.transportVersion==='apollo.v4-static-review-request.v2-draft'){result.schemaVersion='apollo.v4-static-review-read.v2-draft';result.consumerBinding=ctx.consumerBinding.result;}return result;
}
// Sanitized operator diagnostics only. No prepare/execute/native/target ports.
async function reviewStaticInput(input,config,requestId,buildHash,transportVersion='apollo.v4-static-review-request.v1-draft'){
 const gen=require(require('node:path').join(repository,"./packages/generation-core/dist/index.cjs"));
 const result=gen.createStaticReviewResult(input,requestId,buildHash,digest);
 const finish=binding=>transportVersion===gen.STATIC_BINDING_REQUEST_VERSION?gen.withConsumerBinding(result,binding||bindingReader.bindingUnavailable(),digest):gen.sealStaticReviewResult(result,digest);
 const supported=['apollo.screen-spec.static-content.v1-draft','apollo.code-connect.static-content.v1-draft'].includes(input?.schemaVersion);
 if(!supported)return finish();
 let ctx;try{ctx=await loadStaticReviewInputs(config);}catch(e){const code=/^[A-Z][A-Z0-9_]{1,79}$/.test(e.code||'')?e.code:'STATIC_REVIEW_READ_UNAVAILABLE';result.diagnostics.push({code,field:null});return finish();}
 if(ctx.basis.sourceReview.identity.buildInputsSha256!==buildHash)fail('REVIEW_BUILD_STALE');
 const rows=ctx.basis.sourceReview.sources.map(s=>({componentId:s.metadata.componentId,revision:s.metadata.revision,compiledStatus:s.metadata.compiledStatus,manualSourceHash:s.metadata.manualSourceHash,compiledHash:s.metadata.compiledHash,
 errors:s.metadata.issues.filter(i=>i.level==='error').length,predicates:s.metadata.coverage.predicateRuleIds.length,pending:s.metadata.coverage.pendingRoutes.length,nonExecutable:s.metadata.coverage.nonExecutableRuleIds.length}));
 const errors=rows.reduce((n,c)=>n+c.errors,0),pending=rows.reduce((n,c)=>n+c.pending,0),nonExecutable=rows.reduce((n,c)=>n+c.nonExecutable,0);
 result.source={status:'observed',readiness:errors?'invalid':rows.some(c=>c.compiledStatus==='draft')?'draft':'ready',components:rows};result.coverage={status:'incomplete',errors,pending,nonExecutable};result.api.availability='confirmed-source-api';
 result.freshness={status:ctx.basis.consumerMismatches.length?'stale':'matches',mismatches:ctx.basis.consumerMismatches.length};
 const add=code=>{if(result.diagnostics.length<64&&!result.diagnostics.some(d=>d.code===code&&d.field===null))result.diagnostics.push({code,field:null});};
 if(result.schemaStatus==='valid'){
  const spec=input.schemaVersion==='apollo.screen-spec.static-content.v1-draft'?input:input.plan.spec;
  const output=ctx.report.outputs.find(o=>o.inputHash===digest(spec)&&(input.schemaVersion!=='apollo.code-connect.static-content.v1-draft'||o.planHash===input.planHash));
  if(!output)add('STATIC_PRODUCER_DOCUMENT_REQUIRED');
  else{
   pin(null,output,'REVIEW_OUTPUT_STALE');const pinned=JSON.parse(fs.readFileSync(output.path));
   const document=input.schemaVersion==='apollo.screen-spec.static-content.v1-draft'?pinned:input;
   const basis=Object.assign({},ctx.basis,{historicalSourceRead:output.generationSourceRead});
   const inspected=gen.inspectStaticProducerReview(document,basis,digest);
   if(digest(document)!==digest(pinned)||inspected.importStatus==='rejected')add('REVIEW_PRODUCER_CONTENT_MISMATCH');
   else{result.status='reviewed';result.content=inspected.historicalContent;result.producer={planHash:inspected.producerPlanHash,contentHash:inspected.producerContentHash,observationHash:inspected.producerObservationHash};result.api.expressibility=inspected.apiExpressibility;
    if(inspected.historicalApiIntent)result.intent={kind:'non-executable-public-api-intent',modules:['arui-private/corporate-content','arui-private/button-group']};
    for(const d of inspected.diagnostics)add(d.code);
   }
   pin(null,output,'REVIEW_OUTPUT_STALE');
  }
 }
 for(const code of ['REVIEW_ONLY',ctx.basis.consumerMismatches.length?'REVIEW_CONSUMER_STALE':'REVIEW_BINDINGS_MATCH',...(result.source.readiness==='ready'?[]:['SOURCE_NOT_READY']),...(ctx.strictRuntimeProbe.code?[ctx.strictRuntimeProbe.code]:[]),'STATIC_CONTEXT_RECEIPTS_UNACCEPTED','STATIC_WIDTH_FACTS_MISSING','STATIC_TARGET_UNSUPPORTED'])add(code);
 ctx.assertCurrent();return finish(ctx.consumerBinding.result);
}

module.exports={loadStaticProducerReview,reviewStaticInput};

