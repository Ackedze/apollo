// Node-only build metadata; no source/catalog payload is checked into fixtures.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
async function prepareDiagnosticInputs(root,env=process.env){
 if(env.APOLLO_NATIVE_DIAGNOSTICS===undefined||env.APOLLO_NATIVE_DIAGNOSTICS==='0')return null;
 if(env.APOLLO_NATIVE_DIAGNOSTICS!=='1')throw Error('APOLLO_NATIVE_DIAGNOSTICS must be 0 or 1.');
 if(!env.APOLLO_CODE_CONNECT_REPO?.trim()||!env.APOLLO_CONTRACT_CATALOG_PATH?.trim())throw Error('NATIVE_DIAGNOSTIC_SOURCE_CONFIG_REQUIRED: set APOLLO_CODE_CONNECT_REPO and APOLLO_CONTRACT_CATALOG_PATH.');
 const runtime=require(path.join(root,'dist/runtime.cjs')),hash=runtime.contractHash;
 const repo=path.resolve(root,env.APOLLO_CODE_CONNECT_REPO),catalog=path.resolve(root,env.APOLLO_CONTRACT_CATALOG_PATH);
 const full=await require("./prepare-native-recipe-proposals.cjs").prepare(repo,catalog);
 const recipes=full.proposals.map(p=>({mappingId:p.mappingId,componentId:p.componentId,platform:p.platform,source:p.source,representation:p.representation,definition:p.definition,
  slot:p.slot?{targetId:p.slot.targetId,propertyIdentity:p.slot.propertyIdentity,sourceNodeId:p.slot.sourceNodeId}:null,
  actions:p.actions?{occurrences:p.actions.occurrences.map(o=>({targetId:o.targetId,componentSetKey:o.componentSetKey,dependencyPin:o.dependencyPin,sourceAddresses:o.sourceAddresses,properties:o.sourceBindings.map(b=>b.ownedOccurrence.sourceProperty)}))}:null}));
 const probe=recipes.find(r=>r.slot&&r.platform==='desktop');if(!probe)throw Error('NATIVE_DIAGNOSTIC_INPUTS_UNAVAILABLE');
 const probeSpec={schemaVersion:'apollo.screen-spec.v1-experimental',id:'native-readonly-context',platform:'desktop',viewport:{width:1,height:1},root:'observation',nodes:[{kind:'component',id:'observation',mappingId:probe.mappingId,props:{},slots:{body:[]}}],states:{initial:'observation',values:['observation']},events:[],transitions:[],unresolved:['Read-only input observation; no product plan or target execution.']};
 return{version:1,scope:'read-only-native-observation',producer:full.producer,recipes,probeSpec,runtimeSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'dist/runtime.cjs'))).digest('hex'),recipeHash:hash(recipes),buildRecipeSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'build.js'))).digest('hex'),typingsVersion:full.apiEvidence.installed.version,accepted:false};
}
module.exports={prepareDiagnosticInputs};
