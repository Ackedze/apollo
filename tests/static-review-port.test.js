const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path'),os=require('node:os');
const {loadStaticProducerReview}=require("../scripts/static-producer-review-inputs.cjs");
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const digest=v=>sha(JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x));
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'apollo-synthetic-static-review-'));
 const a={schemaVersion:'apollo.code-connect.static-producer.v1-draft',version:1,status:'draft',accepted:false,executionAllowed:false,outputVersion:'apollo.code-connect.static-content.v1-draft',planVersion:'apollo.code-connect.static-review-plan.v1-draft',generationPlanHash:null,generationWireSupport:'not-supported',consumerVector:{path:root+'/vector.json',sha256:sha('synthetic-vector')}};a.artifactDigest=digest(a);
 fs.writeFileSync(root+'/vector.json','synthetic-vector');fs.writeFileSync(root+'/manifest.json',JSON.stringify(a));
 const manifestPin={path:root+'/manifest.json',sha256:sha(fs.readFileSync(root+'/manifest.json'))};
 const report={documentType:'next-03-code-connect-static-source-api-review-handoff',version:1,accepted:false,executionAllowed:false,generationPlanHash:null,producerManifest:{sha256:manifestPin.sha256,artifactDigest:a.artifactDigest},outputs:[]};fs.writeFileSync(root+'/report.json',JSON.stringify(report));
 const args={producerRoot:root,workspaceRoot:root,manifestPin,reportPin:{path:root+'/report.json',sha256:sha(fs.readFileSync(root+'/report.json'))},reviewPath:root+'/unlisted.json'};
 return {args,a,report,root};}
async function run(edit,code){const f=fixture();try{edit(f);await assert.rejects(loadStaticProducerReview(f.args),{code});}finally{fs.rmSync(f.root,{recursive:true});}}
test('review port rejects changed manifest bytes before reading source',()=>run(f=>fs.appendFileSync(f.args.manifestPin.path,' '),'REVIEW_MANIFEST_STALE'));
test('review port rejects changed report bytes before import',()=>run(f=>fs.appendFileSync(f.args.reportPin.path,' '),'REVIEW_REPORT_STALE'));
test('review port rejects unlisted outputs rather than trusting a supplied JSON path',()=>run(()=>{},'REVIEW_OUTPUT_UNPINNED'));
test('review port rejects future manifest version even if its byte/hash pins are supplied',()=>run(f=>{f.a.version=2;delete f.a.artifactDigest;f.a.artifactDigest=digest(f.a);fs.writeFileSync(f.args.manifestPin.path,JSON.stringify(f.a));f.args.manifestPin.sha256=sha(fs.readFileSync(f.args.manifestPin.path));},'REVIEW_MANIFEST_INVALID'));
test('review port rejects future report version with a matching caller hash',()=>run(f=>{f.report.version=2;fs.writeFileSync(f.args.reportPin.path,JSON.stringify(f.report));f.args.reportPin.sha256=sha(fs.readFileSync(f.args.reportPin.path));},'REVIEW_REPORT_INVALID'));
test('review port rejects drifted historical request vector',()=>run(f=>fs.appendFileSync(f.root+'/vector.json',' changed'),'REVIEW_VECTOR_STALE'));
