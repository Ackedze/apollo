'use strict';
// The UI no longer retries canvas callbacks. Recovery now binds actual MCP targets in the direct service.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {createDirectLandingService,FLOW,readTool}=require(path.resolve(__dirname,'../../../services/apollo-proxy/src/landing/direct-service'));
function fixture(t,attack){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'direct-target-recovery-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const session=crypto.randomUUID();let calls=0;
 const source={id:'fixture',resumePin:'pin',knowledgeVersion:'fixture',skill:{id:'ab-generate-custom-landing',name:'Fixture',version:'0.6.0',sha256:'a'.repeat(64),generation:{workflow:FLOW}},initial:{instructions:{},selectedSkill:{}},assertCurrent(){}};
 const service=createDirectLandingService({root,knowledge:()=>source,isProcessAlive:()=>false,createCli:()=>({async run(input){
  calls++;const data=JSON.parse(input.prompt.split('\n').at(-1));input.onEvent({type:'thread.started',thread_id:session});
  const target={rootNodeId:'40:10',pageId:'1:2',parentNodeId:'1:2',ownerNonce:data.target.ownerNonce};const result={content:[{type:'text',text:JSON.stringify({target,descendantIds:[calls===1?'40:20':'I40:10;40:30']})}]};
  if(calls>1&&['rootNodeId','pageId','parentNodeId','ownerNonce'].includes(attack))target[attack]=attack==='ownerNonce'?'foreign-owner':'99:99';
  result.content[0].text=JSON.stringify({target,descendantIds:[calls===1?'40:20':'I40:10;40:30']});
  if(calls>1&&attack==='missing')result.content[0].text='{"createdNodeIds":["40:10"]}';
  if(calls>1&&attack==='malformed')result.content[0].text='{not JSON';
  if(calls>1&&attack==='isError')result.isError=true;
  if(calls>1&&attack==='structuredError')result.structured_content={error:{message:'Native getter failed'}};
  input.onEvent({type:'item.completed',item:{id:'figma:'+calls,type:'mcp_tool_call',server:'apollo_figma_mcp',tool:'use_figma',status:'completed',result}});
  return {result:{status:calls===1?'needs-structure-approval':'completed',message:'Fixture result',rootNodeId:'40:10',checkpoint:'Same root, refreshed descendants',checks:[],issues:[]},receipt:{usage:{actualInputTokens:1}}};
 }})});
 const c=service.create({id:crypto.randomUUID(),fileKey:'FixtureFile',pageId:'1:2',placement:{mode:'new-section',sectionId:null}});
 return {service,id:c.id,session,async skeleton(){service.submit(c.id,{requestId:crypto.randomUUID(),revision:0,text:'Build'});await service.settled(c.id);return service.poll(c.id);},async content(c){const a=c.execution.structureApproval;service.structureDecision(c.id,{requestId:crypto.randomUUID(),revision:c.revision,approvalId:a.id,structureHash:a.structureHash,decision:'approve',text:''});await service.settled(c.id);return service.poll(c.id);}};
}
test('direct recovery accepts refreshed descendant IDs while preserving the actual owned root and CLI session',async t=>{
 const f=fixture(t),skeleton=await f.skeleton(),after=await f.content(skeleton);assert.equal(after.status,'completed');assert.deepEqual(after.target,skeleton.target);assert.equal(after.execution.sessionId,f.session);assert.equal(after.result.ready,false);
});
for(const field of ['rootNodeId','pageId','parentNodeId','ownerNonce'])test('direct recovery refuses changed target '+field+' and retains the confirmed root/session',async t=>{
 const f=fixture(t,field),before=await f.skeleton(),after=await f.content(before);assert.equal(after.status,'interrupted');assert.equal(after.error.code,'LANDING_TARGET_CHANGED');assert.deepEqual(after.target,before.target);assert.equal(after.execution.sessionId,f.session);assert.equal(after.result.ready,false);
});
for(const attack of ['missing','malformed','isError','structuredError'])test('unconfirmed '+attack+' MCP target cannot complete from a cached root',async t=>{
 const f=fixture(t,attack),before=await f.skeleton(),after=await f.content(before);assert.equal(after.status,'interrupted');assert.equal(after.error.code,'LANDING_TARGET_UNCONFIRMED');assert.deepEqual(after.target,before.target);assert.equal(after.execution.sessionId,f.session);assert.equal(after.usage.length,2);
});
test('MCP target JSON is read from actual tool text with an optional Figma debug suffix',()=>{
 const target={rootNodeId:'40:10',pageId:'1:2',parentNodeId:'1:2',ownerNonce:'owner'};assert.deepEqual(readTool({result:{content:[{type:'text',text:'Not JSON'},{type:'text',text:JSON.stringify({target})+'\nFigma Debug UUID: abc-def'}]}}),{target});assert.equal(readTool({result:{content:[{type:'text',text:'{malformed'}]}}),null);
});
