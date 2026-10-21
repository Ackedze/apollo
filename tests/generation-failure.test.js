const test=require('node:test'),assert=require('node:assert/strict');
const {failureDiagnostic,readFailure,failureText}=require("../src/generation/failure");
test('same error type has distinct occurrence IDs and exact trusted operation context',()=>{
 const a=failureDiagnostic('FIGMA_PORT_UNAVAILABLE',{phase:'native',stage:'resolve_port',runId:'run:1',callId:'call:3',nativeSequence:3,modelStep:2,operationIndex:0,nodeId:'12:34',handle:'amount-rub',mappingId:'amount.default',port:'content.label'},'err:one');
 const b=failureDiagnostic('FIGMA_PORT_UNAVAILABLE',{nodeId:'12:35'},'err:two');assert.equal(a.code,b.code);assert.notEqual(a.errorId,b.errorId);assert.equal(a.operationIndex,0);assert.equal(a.nodeId,'12:34');assert.equal(a.handle,'amount-rub');assert.equal(a.nodeStatus,'known');
 const raw='Сборка остановлена. Диагностика: '+JSON.stringify(a);assert.deepEqual(readFailure(raw),a);assert(failureText(raw).includes('узел: 12:34'));assert(failureText(raw).includes('операция (с 0): 0'));
});
test('unknown nodes remain explicit, public context excludes private values and malformed IDs',()=>{
 const a=failureDiagnostic('AGENT_PROCESS_FAILED',{phase:'model',modelStep:1,stderr:'SECRET',prompt:'SECRET',nodeId:'/Users/private',mappingId:'label with spaces'},'err:unit');
 assert.equal(a.nodeId,null);assert.equal(a.nodeStatus,'unresolved');assert(!JSON.stringify(a).includes('SECRET'));assert(!JSON.stringify(a).includes('/Users'));assert(failureText(JSON.stringify(a)).includes('не установлен'));assert.equal(readFailure('AGENT_PROCESS_FAILED'),null);assert.equal(readFailure('{"schemaVersion":"unknown"}'),null);
});

test('nested native node IDs retain semicolons through diagnostics and rendering',()=>{const id='I12:34;56:78;90:12',v=failureDiagnostic('FIGMA_EXTERNAL_CHANGE',{nodeId:id,rootNodeId:'12:34'},'err:nested');assert.equal(v.nodeId,id);assert.equal(v.nodeStatus,'known');assert.equal(readFailure(JSON.stringify(v)).nodeId,id);assert(failureText(JSON.stringify(v)).includes(id));for(const invalid of ['a;;b',';a','a;','/Users/private','x'.repeat(513)])assert.equal(failureDiagnostic('FIGMA_EXTERNAL_CHANGE',{nodeId:invalid},'err:invalid').nodeId,null);});
