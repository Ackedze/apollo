const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {readRepresentationEvidence}=require("../scripts/generation-representation-evidence");
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex'),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
test('trusted reader pins source refs and exact accepted scope; build-only or stale receipts do not grant parity',()=>{
 const repo=fs.mkdtempSync(path.join(os.tmpdir(),'apollo-representation-'));
 try{fs.mkdirSync(path.join(repo,'src'));fs.mkdirSync(path.join(repo,'tools/code-connect/reports'),{recursive:true});fs.writeFileSync(path.join(repo,'src/synthetic.tsx'),'synthetic-source');
 const source={path:'src/synthetic.tsx',sha256:sha('synthetic-source')},code={package:{name:'synthetic',commit:'a'.repeat(40)}};
 const e={version:1,sourcePin:{packageName:'synthetic',packageVersion:'1',commit:'a'.repeat(40),registryDigest:'b'.repeat(64),mappingId:'mapping'},availability:{evidenceRefs:[source]},acceptance:{receiptRefs:[]},parity:{profileIds:['pilot']}};
 const c={pin:{componentId:'synthetic'},evidenceScopeHash:'c'.repeat(64),generationProfiles:[{id:'pilot',representationId:'code',platform:'desktop'}],representations:[{id:'code',codeEvidence:e}]};
 const registry={source:{digest:'d'.repeat(64)},package:{files:{[source.path]:source.sha256}},entries:[{id:'mapping',platform:'desktop',pin:c.pin,code:{representationId:'code'}}]},args={view:{components:[c]},registry,code,repo,hash};
 const receipt={schemaVersion:'apollo.code-profile-acceptance.v1',targetProduct:'apollo-v4',status:'accepted',componentId:'synthetic',representationId:'code',scopeHash:c.evidenceScopeHash,sourcePin:e.sourcePin,codeHash:hash(code),profileIds:['pilot'],checks:{compile:'passed',browser:'passed',layout:'passed'}};
 const file=path.join(repo,'tools/code-connect/reports/receipt.json');function write(){const text=JSON.stringify(receipt);fs.writeFileSync(file,text);e.acceptance.receiptRefs=[{path:'tools/code-connect/reports/receipt.json',sha256:sha(text)}];}
 write();const loaded=readRepresentationEvidence(args);assert.deepEqual(loaded.observations[0].acceptedProfileIds,['pilot']);assert.equal(loaded.observations[0].basisRegistryDigest,e.sourcePin.registryDigest);assert.equal(loaded.observations[0].currentRegistryDigest,registry.source.digest);loaded.assertCurrent();
 receipt.checks.layout='not-run';write();assert.deepEqual(readRepresentationEvidence(args).observations[0].acceptedProfileIds,[]);
 receipt.checks.layout='passed';receipt.scopeHash='f'.repeat(64);write();assert.deepEqual(readRepresentationEvidence(args).observations[0].acceptedProfileIds,[]);
 fs.writeFileSync(path.join(repo,'src/synthetic.tsx'),'changed');assert.throws(()=>loaded.assertCurrent(),/CODE_EVIDENCE_STALE/);assert.ok(!readRepresentationEvidence(args).observations[0].verifiedRefs.some(r=>r.path===source.path));
 }finally{fs.rmSync(repo,{recursive:true,force:true});}
});
