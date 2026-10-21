const test=require('node:test'),assert=require('node:assert/strict');
const {captureInstanceAudit}=require('../dist/capture.cjs');
const {runNativeOccurrenceCapture}=require('./helpers/native-occurrence-capture.cjs');
const invoke=async(figma,actual,request)=>{global.figma=figma;try{return await captureInstanceAudit(actual,request);}finally{delete global.figma;}};
for(const options of [{},{rename:true},{reorder:true},{rename:true,reorder:true},{escaped:true},{remote:true,reorder:true},{reset:true}])
 test('native occurrence captures independently without sibling guesses '+JSON.stringify(options),async()=>{
  const {result,switches}=await runNativeOccurrenceCapture(invoke,options),s=result.snapshot;
  assert.equal(result.matchedBaselineNodes,9);assert.deepEqual(switches,options.reset?[]:[1]);
  assert(s.instanceContentReferences.attempts.every(a=>!a.failure));
  assert(s.instanceContentResults.every(r=>r.status==='matched'));
  if(!options.rename&&!options.reset)assert(s.instanceBoundaries[0].actualPath.includes('@source:'));
  const content=s.nodes.find(n=>n.appearance.opacity===.4);assert.equal(content.baseline.effective.appearance.opacity,1);
 });
for(const badClone of ['missing','foreign','duplicate','stale','cycle','topology-drift','unreadable-edge'])test('native occurrence cannot repair unavailable evidence '+badClone,async()=>{
 const {result,switches}=await runNativeOccurrenceCapture(invoke,{badClone});
 assert.deepEqual(switches,[]);assert.equal(result.snapshot.instanceContentReferences.attempts[0].failure,'replacement-identity-or-port-mismatch');
 assert(result.snapshot.instanceContentResults.some(r=>r.status==='unresolved'));assert(result.unmatchedBaselineNodeIds.length>0);
});
