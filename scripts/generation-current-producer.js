// Server-owned read-only current input snapshot. No Ready view or target receipt.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function loadCurrentProducer({repo,workspaceRoot=path.dirname(repo),hash}){
 const directory=path.join(repo,'tools/code-connect'),reads=new Map();
 const record=(root,relative,pin)=>{if(typeof relative!=='string'||path.isAbsolute(relative)||relative.includes('\\')||relative.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error('PRODUCER_FILE_PIN_INVALID');const file=fs.realpathSync(relative.startsWith('shared/design-system_ab/experiments/current-contract-packages/')?require(path.join(directory,'registry/contract-inputs.cjs')).resolveInputFile(root,relative):path.join(root,relative)),base=fs.realpathSync(root);if(!file.startsWith(base+path.sep))throw new Error('PRODUCER_FILE_PIN_INVALID');const bytes=fs.readFileSync(file),digest=sha(bytes);if(pin&&digest!==pin)throw new Error('PRODUCER_FILE_PIN_INVALID');reads.set(file,digest);return bytes;};
 for(const name of ['registry/consumer.cjs','registry/source-inventory.cjs','registry/contract-inputs.cjs']){const file=path.join(directory,name);if(fs.existsSync(file)){record(directory,name);delete require.cache[require.resolve(file)];}}
 const bridge=require(path.join(directory,'registry/consumer.cjs')),registry=bridge.loadRegistry(),lock=JSON.parse(record(directory,'registry/lock.v1.json'));
 record(directory,'registry/arui-private-80.7.1.v1.json');bridge.verifyLock(registry,lock);bridge.verifySource(registry,repo,workspaceRoot);
 const planning=require("../packages/generation-core/dist/planning.cjs");planning.verifyCodeConnectInputs(registry,lock,hash);
 for(const ref of registry.source.files.concat(registry.mappingArtifacts))record(repo,ref.path,ref.sha256);
 if(registry.registryVersion==='1.1.0'){
  record(repo,registry.authoringBasis.registryPath,registry.authoringBasis.registrySha256);
  for(const ref of registry.currentInputs.authorities)record(workspaceRoot,ref.path,ref.sha256);
  for(const p of registry.currentInputs.packages){record(workspaceRoot,p.archivePath,p.archiveSha256);record(workspaceRoot,p.manualPath,p.mainManualSha256);}
 }
 const snapshot={version:1,proofScope:'source-api-freshness-only',registryVersion:registry.registryVersion,currentRegistryDigest:registry.registryDigest,
  lockHash:hash(lock),basisRegistryDigest:registry.authoringBasis?.registryDigest||null,currentInputsDigest:registry.currentInputs?hash(registry.currentInputs):null,
  inputPackages:lock.inputPackages||[],codeRepresentations:registry.registryVersion==='1.1.0'?'draft':'historical-proposal',acceptance:'not-run'};
 function assertCurrent(){for(const [file,pin] of reads)if(!fs.existsSync(file)||sha(fs.readFileSync(file))!==pin)throw new Error('PRODUCER_INPUTS_STALE');}
 assertCurrent();return {bridge,registry,lock,snapshot,assertCurrent};
}
module.exports={loadCurrentProducer};
