// Explicit real, read-only bridge checks. No private catalog becomes a fixture.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
async function main(){
 const [repoArg,catalogArg]=process.argv.slice(2);if(!repoArg||!catalogArg)throw new Error('Usage: check-generation-code-connect.js <arui-private checkout> <contract catalog>');
 const repo=path.resolve(repoArg),catalog=path.resolve(catalogArg),workspaceRoot=path.dirname(repo),directory=path.join(repo,'tools/code-connect');
 const bridge=require(path.join(directory,'registry/consumer.cjs')),planning=require("../packages/generation-core/dist/planning.cjs");
 const {contractHash:hash}=require("../dist/runtime.cjs");
 const registry=bridge.loadRegistry(),lock=JSON.parse(fs.readFileSync(path.join(directory,'registry/lock.v1.json'),'utf8'));
 const example=JSON.parse(fs.readFileSync(path.join(directory,'examples/pilot.desktop.plan.json'),'utf8'));
 const receipt=bridge.preflight(registry,example,lock,{repo,workspaceRoot});
 assert.equal(receipt.status,'availability-pass');assert.equal(receipt.fullContractParity,'not-confirmed');
 const badLock=JSON.parse(JSON.stringify(lock));badLock.codeCommit='0'.repeat(40);
 assert.throws(()=>bridge.preflight(registry,example,badLock,{repo,workspaceRoot}),e=>e.code==='STALE_MAPPING_LOCK');
 const badNode=JSON.parse(JSON.stringify(example));badNode.props={unavailableProperty:true};
 assert.throws(()=>bridge.preflight(registry,badNode,lock,{repo,workspaceRoot}),e=>e.code==='UNSUPPORTED_PROP');
 const nodes=[],events=[];
 function convert(node,id){
  const n={kind:'component',id,mappingId:node.mappingId,props:{},slots:{}};nodes.push(n);
  if(node.actions){n.actions={port:'elements',items:node.actions.map((a,i)=>{
   const eventId='event'+i;events.push({id:eventId});return{id:'action'+i,label:a.label,eventId,view:a.view,disabled:a.disabled};
  })};}
  if(node.slots)for(const [port,children]of Object.entries(node.slots))n.slots[port]=children.map((child,i)=>convert(child,'child'+i));
  return id;
 }
 const spec={schemaVersion:'apollo.screen-spec.v1-experimental',id:'read-only-producer-example',platform:example.platform,
  viewport:{width:1440,height:900},root:convert(example,'root'),nodes,states:{initial:'ready',values:['ready']},events,transitions:[],
  unresolved:['Producer API example; product screen is not accepted.']};
 assert.deepEqual(planning.validateScreenSpec(spec),[]);
 let sourceGate='not-run',diagnostic='';
 try{
  const context=await require("./generation-code-connect-inputs").createCodeConnectReader({repo,catalog,workspaceRoot,hash})(spec);
  const preflight=planning.preflightPlan(planning.createCompositionPlan(spec,context,hash),context,hash);
  assert.deepEqual(preflight.targets,{figma:'blocked',frontend:'blocked'});sourceGate=preflight.sourceReadiness;
 }catch(error){
  assert.ok(['SOURCE_COMPILE','MAPPING_CONTRACT_STALE','ACTION_PORT_UNSUPPORTED','SLOT_UNSUPPORTED'].includes(error.code||error.message));
  sourceGate='blocked';diagnostic=error.code||error.message;
 }
 console.log(JSON.stringify({targetProduct:'apollo-v4',checksPassed:4,apiAvailability:'confirmed',sourceReadiness:sourceGate,
  diagnostic,actualTargets:{figma:'not-run',frontend:'not-run'},privateToolchain:{rootDependenciesInstalled:fs.existsSync(path.join(repo,'node_modules')),
   codeConnectToolingInstalled:fs.existsSync(path.join(directory,'node_modules')),builtPackageResolved:false}},null,2));
}
if(require.main===module)main().catch(error=>{console.error(error.code||error.message);process.exitCode=1;});
