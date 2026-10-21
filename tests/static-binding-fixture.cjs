// Synthetic byte-only binding fixture. No captures, contract norms or private catalogs.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const digest=v=>sha(JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x));
function bindingFixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'synthetic-consumer-binding-')),repository=root+'/apollo',producer=root+'/producer',workspace=root;
 const pin=p=>({path:p,sha256:sha(fs.readFileSync(p))}),put=(p,v)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof v==='string'?v:JSON.stringify(v,null,2)+'\n');return pin(p);};
 const configPath=root+'/proxy/static-review-config.json',config={schemaVersion:'apollo.v4-static-review-local-config.v1-draft',manifestPin:{path:'old-producer.json',sha256:sha('old-producer')},reportPin:{path:'old-report.json',sha256:sha('old-report')}};
 put(configPath,config);const configArchivePin=put(root+'/config-archive.json',fs.readFileSync(configPath).toString());
 const sourceFiles=[];const inputPackages=Array.from({length:5},(_,i)=>{const a=put(root+'/sources/package-'+i+'.zip','synthetic archive '+i),m=put(root+'/sources/manual-'+i+'.json',{synthetic:i});sourceFiles.push(a,m);return{componentId:'synthetic.component.'+i,archivePath:path.relative(root,a.path),archiveSha256:a.sha256,manualPath:path.relative(root,m.path),mainManualSha256:m.sha256,dependencyPins:i===4?[{componentId:'synthetic.component.0'}]:[]};});
 const registry={registryDigest:sha('registry'),currentInputs:{packages:inputPackages},authoringBasis:{registryDigest:sha('basis')}},lock={inputPackages};
 const registryPin=put(producer+'/registry.json',registry),lockPin=put(producer+'/lock.json',lock);
 const producerTool=put(producer+'/producer-tool.cjs','// synthetic producer tool'),api=put(producer+'/api.d.ts','export type Synthetic = string;');
 const runtimePins=['dist/runtime.cjs','dist/code.js','dist/ui.html','scripts/static-producer-review-inputs.cjs','packages/generation-core/dist/index.cjs'].map(p=>put(repository+'/'+p,'synthetic '+p));
 runtimePins.push(put(root+'/proxy/static-review-service.js','// synthetic provider'));
 const source=put(repository+'/src/original.ts','export const synthetic = 1;'),addedInput=put(repository+'/src/new-ui.ts','export const syntheticUI = 1;');
 const buildPins=[source,addedInput,runtimePins[3]];
 const buildManifestPin=put(repository+'/dist/build-inputs.json',{documentType:'apollo-v4-local-build-inputs',inputs:buildPins.map(p=>({path:path.relative(repository,p.path),sha256:p.sha256}))});
 const before=[pin(configPath),configArchivePin].concat(sourceFiles,[registryPin,lockPin,producerTool,api],runtimePins,buildPins,[buildManifestPin]);
 const unique=ps=>Array.from(new Map(ps.map(p=>[p.path,p])).values());
 const baselineVectorPin=put(root+'/baseline.json',{files:unique(before),standardBuildInputs:{inputs:[{path:'src/original.ts',sha256:source.sha256}]}});
 const v0Files=unique(before.concat(baselineVectorPin));
 const vector={schemaVersion:'apollo.static-review-consumer-vector.v1-draft',phase:'preselection',files:v0Files,buildInputs:buildPins};
 const v0=put(root+'/v0.json',vector),request=put(root+'/request.json',{preselectionVector:v0});
 const frozen={registry:{path:'registry.json',sha256:registryPin.sha256},lock:{path:'lock.json',sha256:lockPin.sha256},registryDigest:registry.registryDigest,currentInputsDigest:digest(registry.currentInputs),lockDigest:digest(lock),basisRegistryDigest:registry.authoringBasis.registryDigest,inputPackages};
 const a={schemaVersion:'apollo.code-connect.static-producer.v1-draft',version:1,status:'draft',accepted:false,executionAllowed:false,generationPlanHash:null,outputVersion:'apollo.code-connect.static-content.v1-draft',planVersion:'apollo.code-connect.static-review-plan.v1-draft',generationWireSupport:'not-supported',consumerVector:v0,producerFiles:[{path:'producer-tool.cjs',sha256:producerTool.sha256}],apiEvidenceFiles:[{path:'api.d.ts',sha256:api.sha256}],consumerFiles:[{path:path.relative(repository,runtimePins[3].path),sha256:runtimePins[3].sha256}],workspaceConsumerFiles:[{path:path.relative(workspace,configPath),sha256:pin(configPath).sha256}],buildInputs:buildPins.map(p=>({path:path.relative(repository,p.path),sha256:p.sha256})),requestPins:[request],frozen};
 a.artifactDigest=digest(a);const manifestPin=put(producer+'/producer.json',a);
 const outputs=Array.from({length:3},(_,i)=>{
  const spec={synthetic:i},content={synthetic:i},contentHash=digest(content),plan={schemaVersion:'apollo.code-connect.static-review-plan.v1-draft',executionAllowed:false,generationPlanHash:null,spec,content,contentHash};
  const planHash=digest(plan),inputHash=digest(spec),observation={accepted:false,executionAllowed:false,generationPlanHash:null,inputHash,planHash,contentHash,artifactDigest:a.artifactDigest};observation.observationHash=digest(observation);
  const d={schemaVersion:'apollo.code-connect.static-content.v1-draft',status:'draft',accepted:false,executionAllowed:false,apiExpressibility:'not-supported',targetSupport:{figma:'not-supported',frontend:'not-supported'},inputHash,planHash,plan,contentHash,content,apiIntent:null,diagnostics:[],observation,generationSourceRead:{status:'not-supported'},generationPreflight:{executionAllowed:false},gaps:[]};
  return Object.assign(put(producer+'/output-'+i+'.json',d),{inputHash,planHash,contentHash,observationHash:observation.observationHash});
 });
 const report={documentType:'next-03-code-connect-static-source-api-review-handoff',version:1,accepted:false,executionAllowed:false,generationPlanHash:null,producerManifest:{sha256:manifestPin.sha256,artifactDigest:a.artifactDigest},outputs};const reportPin=put(producer+'/basis.json',report);
 config.manifestPin={path:'producer.json',sha256:manifestPin.sha256};config.reportPin={path:'basis.json',sha256:reportPin.sha256};const configPin=put(configPath,config);
 const additions=[{role:'producer',pin:manifestPin},{role:'basis',pin:reportPin}].concat(outputs.map(o=>({role:'output',pin:{path:o.path,sha256:o.sha256}})),[{role:'request',pin:request},{role:'preselection-vector',pin:v0}]);
 const v1Files=v0Files.map(p=>p.path===configPath?configPin:p).concat(additions.map(x=>x.pin));
 const v1=put(root+'/v1.json',{schemaVersion:'apollo.static-review-consumer-vector.v1-draft',phase:'final',files:v1Files,buildInputs:buildPins});
 const closurePins=unique([producerTool,api,runtimePins[3],v0Files.find(p=>p.path===configPath)].concat(buildPins,[request,registryPin,lockPin],sourceFiles));
 const receipt={schemaVersion:'apollo.static-review-consumer-binding.v1-draft',status:'draft',accepted:false,executionAllowed:false,generationPlanHash:null,baselineVectorPin,producer:{manifestPin,basisPin:reportPin,artifactDigest:a.artifactDigest,outputs},preselection:{vectorPin:v0,configArchivePin,configPath,configSha256:configArchivePin.sha256},selection:{configPin,manifestPin,reportPin},final:{vectorPin:v1,buildManifestPin,runtimePins},closurePins,additions};
 const args={receiptPin:put(root+'/receipt.json',receipt),repositoryRoot:repository,workspaceRoot:workspace,producerRoot:producer,configPath,manifestPin,reportPin,buildManifestPath:buildManifestPin.path};
 return{root,repository,producer,workspace,receipt,args,pin,put,v0Files,v1Files,sourceFiles,buildPins,config,outputs,refresh(){args.receiptPin=put(args.receiptPin.path,receipt);},cleanup(){fs.rmSync(root,{recursive:true,force:true});}};
}
module.exports={bindingFixture,sha,digest};
