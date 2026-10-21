const test=require('node:test'),assert=require('node:assert/strict');
const {collectNodes,captureInstanceContentReferences}=require('../dist/capture.cjs');
const {materializeEffectiveBaseline,captureVariantReference}=require('../dist/core.cjs');
const {runNativeOccurrenceCapture}=require('./helpers/native-occurrence-capture.cjs');
for(const options of [{},{remote:true,reorder:true},{escaped:true}])test('path resolution uses provenance without reading unrelated live visual or variable facts '+JSON.stringify(options),async()=>{
 await runNativeOccurrenceCapture(async(figma,actual)=>{
  global.figma=figma;const main=await actual.getMainComponentAsync(),reference=main.createInstance(),page=figma.createPage(),restore=[];
  page.appendChild(reference);
  try{
   const base=(await collectNodes(reference,'desktop',{})).snapshot,current=(await collectNodes(actual,'desktop',{})).snapshot;
   for(const snapshot of [base,current]){snapshot.source.componentKey=main.key;snapshot.source.componentSetKey='';}
   const materialized=materializeEffectiveBaseline(current,base,true);
   materialized.snapshot.variantReference=captureVariantReference(base,main.key,'',Object.keys(main.componentPropertyDefinitions));
   // These facts have already been captured. Finding the same occurrence must
   // not read them again; full reference snapshots still capture their own facts.
   let forbiddenReads=0;
   const visit=node=>{for(const key of ['opacity','resolvedVariableModes']){
    const descriptor=Object.getOwnPropertyDescriptor(node,key);restore.push(()=>descriptor?Object.defineProperty(node,key,descriptor):delete node[key]);
    Object.defineProperty(node,key,{configurable:true,get(){forbiddenReads++;throw Error('unrelated fact read during path resolution');}});
   }for(const child of node.children||[])visit(child);};visit(actual);
   await captureInstanceContentReferences(actual,reference,page,materialized.snapshot,base,true);
   assert.equal(forbiddenReads,0);assert(materialized.snapshot.instanceContentReferences.attempts.length>0);
   assert(materialized.snapshot.instanceContentReferences.attempts.every(a=>!a.failure));
   assert(materialized.snapshot.instanceContentResults.every(r=>r.status==='matched'));
   const captured=materialized.snapshot.instanceContentReferences.attempts[0].reference;
   assert.equal(captured.source.geometryCaptureVersion,1);assert(captured.nodes.some(n=>n.appearance&&n.variable&&n.baseline));
   return materialized;
  }finally{for(const reset of restore.reverse())reset();reference.remove();page.remove();delete global.figma;}
 },options);
});
