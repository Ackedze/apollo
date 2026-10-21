const test=require('node:test'),assert=require('node:assert/strict');
const {captureInstanceAudit}=require('../dist/capture.cjs');
const core=require('../dist/core.cjs');
const {runNativeOccurrenceCapture}=require('./helpers/native-occurrence-capture.cjs');
const invoke=async(figma,actual,request)=>{global.figma=figma;try{return await captureInstanceAudit(actual,request);}finally{delete global.figma;}};
for(const stage of ['resolve-instance','read-main-component','create-reference-instance','append-reference-instance','read-variable-modes','capture-reference'])
 test('native dependency failure identifies stage and preserves later captures: '+stage,async()=>{
  const {result}=await runNativeOccurrenceCapture(invoke,{reset:true,dependencies:true,dependencyStage:stage});
  const captures=result.snapshot.componentDependencyCaptures;assert.equal(captures.length,4);
  assert.equal(captures[0].failure,'dependency-reference-capture-failed');assert.equal(captures[0].snapshot,undefined);
  assert.deepEqual(captures[0].failureDetails,{version:1,stage,errorName:'TypeError',message:'synthetic dependency '+stage});
  assert(captures.slice(1).every(c=>c.snapshot&&!c.failure&&!c.failureDetails));
 });
test('all failed dependencies retain separate diagnostics without invented references',async()=>{
 const {result}=await runNativeOccurrenceCapture(invoke,{reset:true,dependencies:true,dependencyStage:'create-reference-instance',failAll:true});
 assert.equal(result.snapshot.componentDependencyCaptures.length,4);
 assert(result.snapshot.componentDependencyCaptures.every(c=>c.failureDetails.stage==='create-reference-instance'&&!c.snapshot&&!c.nodeMap));
});
test('diagnostic errors are bounded without stacks, coercion or throwable getters',()=>{
 const error={name:'Type\nError',message:'x'.repeat(1000),stack:'private stack',toString(){throw Error('must not coerce');}};
 const d=core.dependencyCaptureFailureDetails('capture-actual',error);
 assert.equal(d.errorName,'Type Error');assert.equal(d.message.length,360);assert.equal(d.stack,undefined);
 const hostile={get name(){throw Error('getter');},get message(){throw Error('getter');}};
 assert.deepEqual(core.dependencyCaptureFailureDetails('capture-actual',hostile),{version:1,stage:'capture-actual',errorName:'Error',message:'Ошибка без текста.'});
 assert.equal(core.dependencyCaptureFailureDetails('capture-actual','native string').message,'native string');
 for(const bad of [null,{},Object.assign({},d,{version:2}),Object.assign({},d,{stage:'toString'}),Object.assign({},d,{message:[]})])assert.equal(core.dependencyCaptureFailureLabel(bad),'');
 assert(core.dependencyCaptureFailureLabel(d).includes('захват фактов экземпляра'));
});
