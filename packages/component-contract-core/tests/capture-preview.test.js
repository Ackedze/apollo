const test=require('node:test'),assert=require('node:assert/strict');
const {captureInstanceAudit}=require('../dist/capture.cjs');
const {runNativeOccurrenceCapture}=require('./helpers/native-occurrence-capture.cjs');
async function capture(includePreview, fail=false) {
  let exports=0;
  const observed=await runNativeOccurrenceCapture(async(figma,actual,request)=>{
    actual.exportAsync=async()=>{exports++;if(fail)throw Error('synthetic PNG failure');return new Uint8Array([1]);};
    if(includePreview!==undefined)request.includePreview=includePreview;
    const NativeDate=Date;
    global.Date=class extends NativeDate { constructor(...args){super(...(args.length?args:[0]));} static now(){return 100;} };
    global.figma=figma;
    try {
      if(fail&&includePreview!==false){await assert.rejects(captureInstanceAudit(actual,request),/synthetic PNG failure/);return {failed:true};}
      return await captureInstanceAudit(actual,request);
    }finally{delete global.figma;global.Date=NativeDate;}
  },{reset:true});
  return {result:observed.result,exports};
}
test('preview remains enabled by default and explicit opt-out preserves every captured fact',async()=>{
  const normal=await capture(),disabled=await capture(false);
  assert.equal(normal.exports,1);assert.match(normal.result.imageDataUrl,/^data:image\/png;base64,/);
  assert.equal(disabled.exports,0);assert.equal(disabled.result.imageDataUrl,'');
  normal.result.imageDataUrl='';assert.deepEqual(disabled.result,normal.result);
});
test('default preview failure cleans references; opt-out never calls the failing renderer',async()=>{
  const normal=await capture(undefined,true),disabled=await capture(false,true);
  assert.equal(normal.exports,1);assert.equal(normal.result.failed,true);
  assert.equal(disabled.exports,0);assert.equal(disabled.result.imageDataUrl,'');
});
