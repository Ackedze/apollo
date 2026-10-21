const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {runNativeOccurrenceCapture}=require("../packages/component-contract-core/tests/helpers/native-occurrence-capture.cjs");
const core=require("../packages/component-contract-core/dist/core.cjs"),authored=require("./authoring-fixtures");
const invoke=async(figma,actual)=>{
 const source=authored.source(),manual=source.manual;manual.component.componentKey='host';manual.component.family='Host';
 manual.representations[0].locator={componentKey:'host'};manual.targets[0].pathHint='Host';
 const roles=[];
 for(let i=0;i<4;i++){const role='button-'+i;roles.push(role);manual.targets.push({id:role,semanticRole:role,label:'Button',pathHint:'Host / @catalog:'+(2+i*2),lineage:[],resolution:'resolved',
  variantHints:[{representationId:'figma',componentKey:'host',pathHint:'Host / @source:100%3A'+(i+2)}]});}
 const rule=JSON.parse(JSON.stringify(manual.rules[0]));Object.assign(rule,{id:'button-size',capability:'composition.members',
  constraints:[{type:'memberCollection',collection:{version:1,ownerTargetRole:'root',memberTargetRoles:roles,representationIds:['figma'],visibleOnly:true,
   assertion:{kind:'propertyDomain',property:'Size',propertyType:'VARIANT',values:['56']}}}],rationale:'Synthetic group members must have Size=56.'});manual.rules.push(rule);
 const nodes=[{nodeId:1,parentId:null,name:'Host',type:'COMPONENT'}];
 for(let i=0;i<4;i++){nodes.push({nodeId:2+i*2,parentId:1,name:'Button',type:'INSTANCE'});nodes.push({nodeId:3+i*2,parentId:2+i*2,name:'Content',type:'FRAME'});}
 source.variantEvidence=core.extractVariantEvidence([{componentKey:'host',figma:{defaultVariantKey:'host',variants:{variantKeys:[{key:'host',properties:{}}]},structureSignature:nodes}}]);
 const messages=[];figma.showUI=()=>{};figma.on=()=>{};figma.ui={postMessage:m=>messages.push(JSON.parse(JSON.stringify(m)))};
 vm.runInNewContext(fs.readFileSync(require.resolve('../dist/code.js'),'utf8'),{figma,__html__:'',TextEncoder,setTimeout,clearTimeout});
 await figma.ui.onmessage({type:'load-contract',source});await figma.ui.onmessage({type:'audit',requestId:'native-source'});
 assert.deepEqual(messages.filter(m=>m.type==='error'),[]);
 const result=messages.find(m=>m.type==='audit-result');assert(result,JSON.stringify(messages));
 const full=await require("./full-audit.fixture.cjs").fullAudit(figma,messages,result.audit);
 const component=full.components[0];assert(component);
 return {snapshot:component.snapshot,matchedBaselineNodes:component.snapshot.nodes.filter(n=>n.baselineProvenance?.status==='matched').length,consumer:component.result};
};
for(const options of [{},{reset:true},{badClone:'missing'}])test('Apollo bundled native capture preserves Size verdict and baseline gaps '+JSON.stringify(options),async()=>{
 const {result,switches}=await runNativeOccurrenceCapture(invoke,options);
 assert.deepEqual(switches,options.reset||options.badClone?[]:[1]);
 const rule=result.consumer.engine.evaluations.find(e=>e.ruleId.startsWith('button-size'));
 assert(rule);assert.equal(rule.classification,options.reset?'compliant':'violation',JSON.stringify(rule));
 assert.equal(result.matchedBaselineNodes,options.badClone?7:9);
 if(options.badClone)assert(result.snapshot.instanceContentResults.some(r=>r.status==='unresolved'));
 else assert(result.snapshot.instanceContentReferences.attempts.every(a=>!a.failure));
});
