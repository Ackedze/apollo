// Explicit read-only consumer evidence; unaccepted source never becomes a Ready plan.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
function sourceReadyMappings(registry){return registry.mappings.filter(m=>m.contract.sourcePredicateStatus==='ready'&&m.contract.compiledStatus==='ready');}
async function inspect(repo,catalog){
 const root=path.resolve(__dirname,".."),runtime=require("../dist/runtime.cjs"),core=require(path.join(root,'packages/component-contract-core/dist/core.cjs')),g=require(path.join(root,'packages/generation-core/dist/planning.cjs')),hash=runtime.contractHash;
 const provider=require("./generation-current-producer").loadCurrentProducer({repo,workspaceRoot:path.dirname(repo),hash});
 const {registry,lock}=provider,code={package:{name:registry.source.package,version:registry.source.version,commit:registry.source.commit,files:Object.fromEntries(registry.source.files.concat(registry.mappingArtifacts).map(f=>[f.path,f.sha256]))},publicExports:registry.mappings.map(m=>({module:m.code.subpath,exportName:m.code.export,indexFile:m.code.source.index}))};
 const components=[],entries=[];
 for(const p of registry.currentInputs.packages.filter(p=>p.role==='root')){
  const bytes=fs.readFileSync(path.join(path.dirname(repo),p.archivePath));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),p.archiveSha256);
  const zip=await core.readZip(bytes),source=runtime.sourceFromFiles(zip.filter(e=>/\.json$/i.test(e.name)).map(e=>({name:e.name,text:Buffer.from(e.data).toString('utf8')})));
  const scope=core.representationScopeHash(source.manual,source.variantEvidence);assert.equal(scope,p.representationScopeHash);
  const m=registry.mappings.find(m=>m.contract.componentId===p.componentId),r=source.manual.representations.find(r=>r.id===m.code.proposedRepresentationId);assert.equal(hash(r.codeEvidence),hash(p.codeRepresentation.codeEvidence));
  components.push({pin:{componentId:p.componentId},representations:source.manual.representations,evidenceScopeHash:scope,generationProfiles:source.manual.generation.profiles});
  entries.push({pin:{componentId:p.componentId},code:{representationId:r.id},platform:m.platforms[0]});
 }
 const evidence=require("./generation-representation-evidence").readRepresentationEvidence({view:{components},registry:{entries,package:code.package,source:{digest:registry.registryDigest}},code,repo,hash});
 for(const o of evidence.observations){const p=registry.currentInputs.packages.find(p=>p.componentId===o.componentId);assert.equal(o.basisRegistryDigest,registry.authoringBasis.registryDigest);assert.equal(o.currentRegistryDigest,registry.registryDigest);assert.equal(o.scopeHash,p.representationScopeHash);assert.deepEqual(o.acceptedProfileIds,[]);assert.equal(o.verifiedRefs.length,p.codeRepresentation.codeEvidence.availability.evidenceRefs.length);}
 const readyMappings=sourceReadyMappings(registry),roots=readyMappings.map(m=>({name:path.basename(m.contract.archivePath),archiveSha256:m.contract.archiveSha256}));
 const inventory=await require("./generation-package-inputs").loadPinnedGenerationInputs(catalog,roots),view=g.projectGenerationView(inventory,hash);
 const normalized=g.normalizeCodeConnect(registry,lock,view,readyMappings.map(m=>m.id),hash);
 const draftMappings=registry.mappings.filter(m=>m.contract.sourcePredicateStatus==='draft');assert.equal(draftMappings.length,1);assert.equal(draftMappings[0].kind,'buttons-group');
 let draftGate;try{
  const draftInventory=await require("./generation-package-inputs").loadPinnedGenerationInputs(catalog,draftMappings.map(m=>({name:path.basename(m.contract.archivePath),archiveSha256:m.contract.archiveSha256})));
  g.normalizeCodeConnect(registry,lock,g.projectGenerationView(draftInventory,hash),draftMappings.map(m=>m.id),hash);
  throw Error('unexpected-Ready');
 }catch(e){const code=e.code||e.message;assert.ok(['SOURCE_COMPILE','PRODUCER_VIEW_STALE'].includes(code),code);draftGate={code,status:'blocked',sourceStatus:'draft',compiledStatus:draftMappings[0].contract.compiledStatus};}
 provider.assertCurrent();evidence.assertCurrent();
 return {version:1,kind:'fresh-generation-consumer-input-proof',producer:provider.snapshot,representationObservations:evidence.observations,codeHash:hash(code),
  readySubsetLock:inventory.lock,normalizedReadySubsetHash:hash(normalized),apiAvailability:'confirmed-source-api',source:{acceptedReadySubset:readyMappings.map(m=>({mappingId:m.id,revision:m.contract.revision})),readyDependencySubset:inventory.lock.packages.filter(p=>!readyMappings.some(m=>m.contract.componentId===p.componentId)).map(p=>({componentId:p.componentId,revision:p.revision,compiledHash:p.compiledHash})),buttonsGroup:draftGate},
  frontendProfile:'not-accepted',nativeBindings:'missing',actualTargets:{figma:'not-run',frontend:'not-run'},live:'not-run',release:'not-run',publication:'not-run'};
}
if(require.main===module){const [repo,catalog,out]=process.argv.slice(2);inspect(repo,catalog).then(r=>{if(out)fs.writeFileSync(out,JSON.stringify(r,null,2));console.log('Fresh producer/complete closure/representation refs verified; CC Ready subset normalized, BG Source Draft blocked, no accepted target.');}).catch(e=>{console.error(e.code||e.message);process.exitCode=1;});}
module.exports={inspect,sourceReadyMappings};
