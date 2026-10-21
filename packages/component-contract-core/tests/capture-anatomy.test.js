const test=require('node:test'),assert=require('node:assert/strict');
const {collectNodes,collectAnatomy,captureInstanceAudit}=require('../dist/capture.cjs');
const {runNativeOccurrenceCapture}=require('./helpers/native-occurrence-capture.cjs');
test('freshness projection preserves every anatomy fact and notices changes',async()=>{
 await runNativeOccurrenceCapture(async(figma,actual,request)=>{
  global.figma=figma;try{
   const before=await collectNodes(actual,'desktop',{}),check=await collectAnatomy(actual,'desktop',{});
   assert.deepEqual(check.anatomy,before.anatomy);assert.equal(check.snapshot,undefined);
   actual.opacity=.47;const after=await collectAnatomy(actual,'desktop',{});
   assert.notDeepEqual(after.anatomy,check.anatomy);assert.equal(after.anatomy[0].properties.appearance.opacity,.47);
   const stages=[];request.includePreview=false;request.onTiming=(stage,ms)=>stages.push({stage,ms});
   const captured=await captureInstanceAudit(actual,request);
   assert.deepEqual(stages.map(s=>s.stage),['reference','actual','baseline','content-references','dependencies']);
   assert(stages.every(s=>s.ms>=0));assert.equal(captured.snapshot.timings,undefined);
  }finally{delete global.figma;}
 },{reset:true});
});
