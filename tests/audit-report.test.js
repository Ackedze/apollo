const test=require('node:test'),assert=require('node:assert/strict');
const {auditSummary,auditDelivery,createAuditReportBridge,createAuditReportClient}=require("../src/audit-report");
function report(){const evaluations=['compliant','allowed','violation','human-review','not-applicable'].map((classification,i)=>({classification,evaluationId:'e'+i,ruleId:'r'+i,componentScopeId:'s'}));
 const snapshot={source:{componentKey:'key'},nodes:[{id:'root',baseline:{payload:'private capture'}}]};
 return {schemaVersion:'full-schema',auditId:'audit',release:{channel:'local-pilot'},snapshot,warnings:[],components:[{scopeId:'s',auditId:'component',name:'Test',snapshot,release:{channel:'local-pilot'},result:{coverage:{executionComplete:false}}}],result:{engine:{evaluations,dependencyRuns:[{status:'unresolved'}],coverage:{executed:5}},coverage:{executionComplete:false}}};}
test('projection keeps exact findings, counts, coverage and focus without native snapshots',()=>{
 const full=report(),before=JSON.stringify(full),summary=auditSummary(full);
 assert.equal(summary.schemaVersion,'apollo.audit-summary.v1');assert.equal(summary.snapshot,undefined);assert.equal(summary.components[0].snapshot.nodes,undefined);
 assert.equal(summary.components[0].snapshot.source.componentKey,'key');assert.deepEqual(summary.result.coverage,full.result.coverage);
 assert.equal(summary.projection.totalEvaluations,5);assert.equal(summary.projection.counts.compliant,1);
 assert.deepEqual(summary.result.engine.evaluations.map(e=>e.classification),['allowed','violation','human-review']);
 const data=auditDelivery({audit:full,rules:full.result.engine.evaluations.map(e=>({ruleId:e.ruleId,componentScopeId:'s'})),focusTargets:{findings:full.result.engine.evaluations.map(e=>({findingId:e.evaluationId}))}});
 assert.equal(data.rules.length,3);assert.deepEqual(data.focusTargets.findings.map(f=>f.findingId),['e1','e2','e3']);assert.equal(JSON.stringify(full),before);
 assert(!JSON.stringify(summary).includes('private capture'));assert.deepEqual(auditSummary(summary),summary);
});
test('on-demand diagnostics and explanation snapshots are independently correlated and reject stale versions',async()=>{
 let current=report();const messages=[];const client=createAuditReportClient(m=>messages.push(m));
 const bridge=createAuditReportBridge({read:id=>current?.auditId===id?current:null,post:m=>client.accept(m)});
 const full=client.request('audit','full'),request=messages.shift();client.accept({type:'audit-report-result',requestId:request.requestId,auditId:'other',operation:'full',componentAuditId:null,data:report()});
 bridge.accept(request);assert.deepEqual(await full,current);
 const selected=client.request('audit','component','component');bridge.accept(messages.shift());const component=await selected;assert.deepEqual(component.snapshot,current.components[0].snapshot);assert.equal(component.components,undefined);
 const stale=client.request('audit','full');current=null;bridge.accept(messages.shift());await assert.rejects(stale,/STALE/);
 const pending=client.request('audit','full');client.invalidate();await assert.rejects(pending,/устарел/);bridge.accept(messages.shift());
});
test('malformed requests, foreign components, timeouts and unknown replies fail closed',async()=>{
 const replies=[],bridge=createAuditReportBridge({read:()=>report(),post:m=>replies.push(m)}),valid={type:'audit-report-request',requestId:'req',auditId:'audit',operation:'component',componentAuditId:'foreign'};
 bridge.accept(valid);assert.equal(replies.pop().error,'AUDIT_REPORT_COMPONENT_UNAVAILABLE');
 bridge.accept(Object.assign({},valid,{extra:true}));assert.equal(replies.pop().error,'AUDIT_REPORT_REQUEST_INVALID');
 const client=createAuditReportClient(()=>{},{timeoutMs:5});await assert.rejects(client.request('audit','full'),/истекло/);
 assert.equal(client.accept({type:'audit-report-result',requestId:'foreign'}),true);assert.equal(client.accept({type:'other'}),false);
});
