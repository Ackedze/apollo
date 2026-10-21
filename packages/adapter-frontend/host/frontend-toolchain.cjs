'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const REPORT='tools/code-connect/reports/NEXT-05-source-build.2026-10-05.json';
const RECIPES='tools/code-connect/reports/NEXT-05-api-recipes.2026-10-05.json';
const REPORT_HASH='dce4d24a90e7ad8baf34f840d74b7488ea7124599633bb2986e0c923b1a57b34';
const RECIPES_HASH='7db2310da5d6684d79f21da519edd08cfe929df8578f2b5d287793f58e5f9f8f';
const fail=code=>{throw new Error(code);};
function inside(root,rel){if(typeof rel!=='string'||path.isAbsolute(rel)||rel.split('/').some(s=>s==='..'||s==='.'||!s))fail('FRONTEND_TOOLCHAIN_PATH_INVALID');const f=path.join(root,rel),real=fs.realpathSync(f);if(!real.startsWith(fs.realpathSync(root)+path.sep))fail('FRONTEND_TOOLCHAIN_PATH_INVALID');return f;}
/** Receipts pin a selective distribution only; no published/full-package claim.
 * Old browser PASS receipts are input integrity checks, never this plan's proof. */
function loadToolchain(repo){
  const refs=new Map();
  const read=(root,rel,expected)=>{const f=inside(root,rel),bytes=fs.readFileSync(f);if(!/^[a-f0-9]{64}$/.test(expected)||sha(bytes)!==expected)fail('FRONTEND_TOOLCHAIN_STALE');refs.set(f,expected);return bytes;};
  const base=JSON.parse(read(repo,REPORT,REPORT_HASH)),recipes=JSON.parse(read(repo,RECIPES,RECIPES_HASH));
  const apollo=path.resolve(__dirname,'../../..'),hash=require(path.join(apollo,'dist/runtime.cjs')).contractHash;
  const producer=require(path.join(apollo,'scripts/generation-current-producer.js')).loadCurrentProducer({repo,hash});
  const refresh=JSON.parse(read(repo,'tools/code-connect/reports/NEXT-02-registry-refresh.2026-10-05.json','86cb0cad5f20a9e5723956815b3856df7456b0f5c1303339c389c5daa94239c1'));
  if(refresh.registry.currentProducerDigest!==producer.snapshot.currentRegistryDigest||refresh.registry.currentInputsDigest!==producer.snapshot.currentInputsDigest||refresh.registry.oldProducerDigest!==producer.snapshot.basisRegistryDigest||hash(refresh.currentInputPackages)!==hash(producer.registry.currentInputs.packages))fail('FRONTEND_PRODUCER_BRIDGE_STALE');
  for(const ref of [refresh.registry.file,refresh.registry.lock,...refresh.files])read(repo,ref.path,ref.sha256);
  read(repo,refresh.registry.authoringBasis.registryPath,refresh.registry.authoringBasis.registrySha256);
  const historyRoot=path.dirname(path.dirname(refresh.registry.authoringBasis.registryPath));
  const history=JSON.parse(read(repo,refresh.registry.historyIndex.path,refresh.registry.historyIndex.sha256));
  function historical(ref){
    const file=path.join(repo,ref.path);
    if(fs.existsSync(file)&&sha(fs.readFileSync(file))===ref.sha256)return read(repo,ref.path,ref.sha256);
    const relative=ref.path.replace(/^tools\/code-connect\//,''),prior=history.files.find(p=>p.path===relative&&p.sha256===ref.sha256);
    if(!prior)fail('FRONTEND_HISTORICAL_EVIDENCE_STALE');return read(repo,historyRoot+'/'+(prior.storedPath||prior.path),ref.sha256);
  }
  // Historical producer pins locate immutable history; current producer/source
  // freshness comes solely from the newly verified snapshot above.
  for(const ref of base.files.concat(base.outputFiles,base.receiptFiles,base.source.originalFiles))historical(ref);
  historical(recipes.source.registry.file);historical(recipes.source.registry.lock);
  const home=path.join(repo,'tools/code-connect/frontend-host'),dist=path.join(home,'.work/source/dist');
  for(const ref of base.source.originalFiles)read(repo,ref.path,ref.sha256);
  for(const ref of base.distribution.filePins)read(dist,ref.path,ref.sha256);
  for(const ref of base.receiptFiles)read(repo,ref.path,ref.sha256);
  for(const ref of recipes.files.concat(recipes.artifacts))read(repo,ref.path,ref.sha256);
  for(const ref of recipes.source.criticalApiEvidence)read(repo,ref.path,ref.sha256);
  const env=JSON.parse(fs.readFileSync(path.join(home,'artifacts/environment-pins.json')));
  read(home,'package.json',env.manifestSha256);read(home,'package-lock.json',env.npmLockSha256);
  read(repo,'yarn.lock',env.sourceYarnLockSha256);
  for(const ref of env.installed)read(home,ref.path+'/package.json',ref.packageJsonSha256);
  if(fs.realpathSync(path.join(home,'node_modules/arui-private'))!==fs.realpathSync(dist))fail('FRONTEND_DISTRIBUTION_MISMATCH');
  if(sha(fs.readFileSync(env.node.executable))!==env.node.executableSha256)fail('FRONTEND_NODE_STALE');
  const chrome=recipes.environment.browser;
  if(sha(fs.readFileSync(chrome.executablePath))!==chrome.executableSha256)fail('FRONTEND_CHROME_STALE');
  const pkg=JSON.parse(fs.readFileSync(path.join(dist,'package.json')));
  if(pkg.name!==base.source.package||pkg.version!==base.source.version)fail('FRONTEND_DISTRIBUTION_MISMATCH');
  function assertFresh(){producer.assertCurrent();for(const [f,pin] of refs)if(sha(fs.readFileSync(f))!==pin)fail('FRONTEND_TOOLCHAIN_STALE');if(sha(fs.readFileSync(env.node.executable))!==env.node.executableSha256||sha(fs.readFileSync(chrome.executablePath))!==chrome.executableSha256)fail('FRONTEND_TOOLCHAIN_STALE');if(fs.realpathSync(path.join(home,'node_modules/arui-private'))!==fs.realpathSync(dist))fail('FRONTEND_DISTRIBUTION_MISMATCH');}
  const recipeRoot=path.join(home,'proposals/desktop-size56-v1/src');
  const versions=Object.fromEntries(['react','react-dom','typescript','vite'].map(name=>[name,JSON.parse(fs.readFileSync(path.join(home,'node_modules',name,'package.json'))).version]));
  return {home,dist,versions,node:env.node.executable,chrome,assertFresh,recipe:fs.readFileSync(path.join(recipeRoot,'recipe.tsx'),'utf8'),application:fs.readFileSync(path.join(recipeRoot,'application.ts'),'utf8'),
    evidence:{version:1,currentProducer:producer.snapshot,historicalBehavior:{basisRegistryDigest:refresh.registry.oldProducerDigest,sourceBuildAndBrowserAcceptance:'historical-only'},kind:'genuine-selective-two-subpath-build',package:pkg.name,packageVersion:pkg.version,commit:base.source.commit,sourceBuildReportHash:REPORT_HASH,recipeReportHash:RECIPES_HASH,distributionHash:sha(JSON.stringify(base.distribution.filePins)),environmentHash:sha(JSON.stringify(env)),publishedDistribution:'not-obtained',fullLibrary:'not-tested',peerGap:env.peerGap},sha};
}
module.exports={loadToolchain,inside,sha};
