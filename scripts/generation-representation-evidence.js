// Read-only host proof. Inputs come from the pinned package inventory, never ScreenSpec.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function readRepresentationEvidence({view,registry,code,repo,hash}) {
  const observations=[],reads=new Map(),base=fs.realpathSync(repo);
  function read(ref,receipt=false){
    if(!ref||!ref.path||ref.path.startsWith('/')||ref.path.includes('\\')||ref.path.split('/').some(p=>!p||p==='.'||p==='..')||! /^[a-f0-9]{64}$/.test(ref.sha256))return null;
    if(receipt ? !/^tools\/code-connect\/reports\/[^/]+\.json$/.test(ref.path) : registry.package.files[ref.path]!==ref.sha256)return null;
    try{
      const file=fs.realpathSync(path.join(base,ref.path)),relative=path.relative(base,file);
      if(relative.startsWith('..')||path.isAbsolute(relative)||!fs.statSync(file).isFile()||fs.statSync(file).size>1024*1024)return null;
      const bytes=fs.readFileSync(file);if(sha(bytes)!==ref.sha256)return null;reads.set(file,ref.sha256);return bytes;
    }catch{return null;}
  }
  for(const c of view.components)for(const r of c.representations){
    const e=r.codeEvidence,m=registry.entries.find(m=>m.pin.componentId===c.pin.componentId&&m.code.representationId===r.id);
    if(!e||!m)continue;
    const verifiedRefs=[],accepted=new Set();
    for(const ref of e.availability.evidenceRefs)if(read(ref))verifiedRefs.push(ref);
    for(const ref of e.acceptance.receiptRefs){
      const bytes=read(ref,true);if(!bytes)continue;
      let receipt;try{receipt=JSON.parse(bytes.toString('utf8'));}catch{continue;}
      // Compile/build availability by itself is insufficient. Layout and browser
      // acceptance belong to the owner and must cover this exact declared scope.
      if(receipt.schemaVersion!=='apollo.code-profile-acceptance.v1'||receipt.targetProduct!=='apollo-v4'||receipt.status!=='accepted'
        ||receipt.componentId!==c.pin.componentId||receipt.representationId!==r.id||receipt.scopeHash!==c.evidenceScopeHash
        ||hash(receipt.sourcePin)!==hash(e.sourcePin)||receipt.codeHash!==hash(code)
        ||receipt.checks?.compile!=='passed'||receipt.checks?.browser!=='passed'||receipt.checks?.layout!=='passed'
        ||!Array.isArray(receipt.profileIds)||!receipt.profileIds.length||new Set(receipt.profileIds).size!==receipt.profileIds.length
        ||receipt.profileIds.some(id=>!e.parity.profileIds.includes(id)||!c.generationProfiles?.some(p=>p.id===id&&p.representationId===r.id&&p.platform===m.platform)))continue;
      verifiedRefs.push(ref);for(const id of receipt.profileIds)accepted.add(id);
    }
    const observation={version:1,componentId:c.pin.componentId,representationId:r.id,scopeHash:c.evidenceScopeHash,
      basisRegistryDigest:e.sourcePin.registryDigest,currentRegistryDigest:registry.source.digest,codeHash:hash(code),
      verifiedRefs:Array.from(new Map(verifiedRefs.map(r=>[r.path,r])).values()),acceptedProfileIds:Array.from(accepted).sort()};
    observation.receiptHash=hash(observation);observations.push(observation);
  }
  return {observations,assertCurrent(){for(const [file,digest] of reads)if(!fs.existsSync(file)||sha(fs.readFileSync(file))!==digest)throw Object.assign(new Error('CODE_EVIDENCE_STALE'),{code:'CODE_EVIDENCE_STALE'});}};
}
module.exports={readRepresentationEvidence};
