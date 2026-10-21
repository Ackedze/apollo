'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {loadToolchain,inside,sha}=require('./frontend-toolchain.cjs'),{render}=require('./frontend-render.cjs'),{browserVerify}=require('./frontend-browser.cjs');
function run(node,args,cwd,signal,code,onLog){return new Promise((resolve,reject)=>{if(signal.aborted){reject(new Error('GENERATION_SESSION_STALE'));return;}const child=spawn(node,args,{cwd,signal,stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH,HOME:process.env.HOME,LANG:'en_US.UTF-8'}});let bytes=0;const timer=setTimeout(()=>child.kill('SIGTERM'),25000);for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{bytes+=data.length;if(onLog)onLog(data.toString());if(bytes>1024*1024)child.kill('SIGTERM');});child.once('error',()=>{clearTimeout(timer);reject(new Error(signal.aborted?'GENERATION_SESSION_STALE':code));});child.once('close',exit=>{clearTimeout(timer);exit===0?resolve():reject(new Error(signal.aborted?'GENERATION_SESSION_STALE':code));});});}
/** External host only. Profile/command bank are injected server-owned ports.
 * syntheticLocal is a local factory capability, absent from every HTTP DTO. */
function createFrontendHost(options){
 const {apolloRoot,repo,readContext,hash,signal}=options,adapter=require(path.join(apolloRoot,'packages/adapter-frontend/dist/index.cjs')),planning=require(path.join(apolloRoot,'packages/generation-core/dist/planning.cjs'));
 let root=null,profile=null,toolchain=null,prepared=null,compile=null,artifact=null,context=null,currentPlan=null;
 const proof=[],hostPins=new Map([__filename,path.join(apolloRoot,'scripts/generation-current-producer.js'),...['frontend-toolchain.cjs','frontend-render.cjs','frontend-browser.cjs'].map(f=>path.join(__dirname,f)),path.join(apolloRoot,'packages/adapter-frontend/dist/index.cjs'),path.join(apolloRoot,'packages/generation-core/dist/planning.cjs')].map(f=>[f,sha(fs.readFileSync(f))]));
 async function accepted(plan,current){const next=await (options.readAcceptedProfile||(()=>null))(plan,current);return adapter.assertFrontendProfile(plan,current,next,hash,options.syntheticLocal===true);}
 async function guard(plan){for(const [f,pin] of hostPins)if(sha(fs.readFileSync(f))!==pin)throw new Error('FRONTEND_HOST_STALE');if(signal.aborted)throw new Error('GENERATION_SESSION_STALE');const current=await readContext(plan.spec);planning.requirePreflight(plan,current,hash,'frontend');if(hash(await accepted(plan,current))!==hash(profile))throw new Error('FRONTEND_PROFILE_STALE');toolchain.assertFresh();for(const [rel,pin] of Object.entries(current.code.package.files)){if(sha(fs.readFileSync(inside(repo,rel)))!==pin)throw new Error('CODE_FILE_STALE');}const command=inside(options.commandRoot,profile.commandModule.path);if(sha(fs.readFileSync(command))!==profile.commandModule.sha256)throw new Error('FRONTEND_COMMAND_BANK_STALE');if(signal.aborted)throw new Error('GENERATION_SESSION_STALE');}
 return {
  readContext,
  async prepare(plan,current){
   profile=await accepted(plan,current);context=current;currentPlan=plan;
   if(profile.commandModule.probeVersion!==1)throw new Error('FRONTEND_COMMAND_PROBE_UNAVAILABLE');
   toolchain=loadToolchain(repo);
   if(!options.syntheticLocal&&current.registry.source?.digest!==toolchain.evidence.currentProducer.currentRegistryDigest)throw new Error('FRONTEND_PRODUCER_BRIDGE_STALE');
   if(current.code.package.version!==toolchain.evidence.packageVersion||current.code.package.commit!==toolchain.evidence.commit)throw new Error('FRONTEND_DISTRIBUTION_MISMATCH');
   const f=inside(options.commandRoot,profile.commandModule.path),commands=fs.readFileSync(f,'utf8');if(sha(commands)!==profile.commandModule.sha256)throw new Error('FRONTEND_COMMAND_BANK_STALE');
   await guard(plan);prepared=render(plan,profile,toolchain,commands);return prepared;
  },
  async create(input){
   await guard(currentPlan);
   root=fs.mkdtempSync(path.join(os.tmpdir(),'apollo-frontend-'));fs.chmodSync(root,0o700);
   for(const file of input.files){if(!/^[A-Za-z0-9_./-]+$/.test(file.path)||file.path.split('/').includes('..'))throw new Error('FRONTEND_ARTIFACT_PATH_INVALID');const dest=path.join(root,file.path);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,file.text,{flag:'wx'});if(file.path==='src/GeneratedScreen.tsx')proof.push(...input.provenance);}
   fs.symlinkSync(path.join(toolchain.home,'node_modules'),path.join(root,'node_modules'),'dir');
   await run(toolchain.node,[path.join(toolchain.home,'node_modules/typescript/bin/tsc'),'--noEmit','-p',path.join(root,'tsconfig.json')],root,signal,'FRONTEND_TYPECHECK_FAILED',options.onLog);
   await guard(currentPlan);
   await run(toolchain.node,[path.join(toolchain.home,'node_modules/vite/bin/vite.js'),'build','--config',path.join(root,'vite.config.mjs')],root,signal,'FRONTEND_BUILD_FAILED',options.onLog);
   await guard(currentPlan);
   compile={version:1,kind:'fresh-generated-artifact-typecheck-and-bundle',planHash:input.planHash,tsc:'passed',vite:'passed',imports:['arui-private/button-group','arui-private/corporate-content'],toolchain:toolchain.evidence};
  },
  async verify(plan){
   await guard(plan);const browser=await browserVerify(root,plan,profile,toolchain,()=>guard(plan),signal);await guard(plan);
   const facts={planHash:hash(plan),pins:plan.pins,profileHash:hash(profile),compile,browser};fs.writeFileSync(path.join(root,'execution-evidence.json'),JSON.stringify(facts,null,2));
   const checks=browser.observed.map(id=>({id,status:'passed',evidenceHash:hash(browser)}));
   for(const c of context.view.components)for(const id of c.coverage.predicateRuleIds)checks.push({id,componentId:c.pin.componentId,status:'unknown',evidenceHash:hash({id,reason:'no-accepted-DOM-rule-evaluator'})});
   const files=[];function scan(dir,rel=''){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(entry.name==='node_modules')continue;const name=rel+entry.name,absolute=path.join(dir,entry.name);if(entry.isSymbolicLink())throw new Error('FRONTEND_ARTIFACT_PATH_INVALID');if(entry.isDirectory())scan(absolute,name+'/');else {const bytes=fs.readFileSync(absolute);files.push({path:name,sha256:sha(bytes),bytes:bytes.length});}}}scan(root);files.sort((a,b)=>a.path.localeCompare(b.path));
   artifact={version:1,id:crypto.randomBytes(16).toString('hex'),entryPath:'dist/index.html',profileId:profile.profileId,authority:profile.authority.scope,manifestHash:hash(files),files};
   return {status:'incomplete',evidence:{factsHash:hash(facts),checks},diagnostics:[{code:'FRONTEND_NORMATIVE_RULES_UNVERIFIED',stage:'execution',target:'frontend',message:'The artifact compiled and its declared interactions were probed; source rules and cross-representation acceptance remain unverified.'}]};
  },
  artifact(){if(!artifact)throw new Error('FRONTEND_ARTIFACT_UNAVAILABLE');return artifact;},
  transactionProvenance(){return proof.slice();},
  async rollback(){if(root){fs.rmSync(root,{recursive:true,force:true});root=null;}artifact=null;},
  artifactRoot(){return root;},
  async assertFresh(plan){await guard(plan);},
 };
}
module.exports={createFrontendHost};
