const test=require('node:test'),assert=require('node:assert/strict');
const {captureComponentDependencies}=require('../dist/capture.cjs');

test('direct-child capture leaves room for four children and eight transitive dependencies; legacy limit stays eight',async()=>{
 for(const version of [undefined,1]){
  const nodes=Array.from({length:12},(_,i)=>({id:'child-'+i,type:'INSTANCE',component:{identity:{componentKey:'accepted'}}}));
  const snapshot={selection:['root'],nodes,context:{platform:'desktop',modes:{}}},anatomy=nodes.map(n=>({id:n.id,figmaNodeId:n.id}));let lookups=0;
  global.figma={getNodeByIdAsync:async()=>{lookups++;return null;}};
  try{await captureComponentDependencies(anatomy,snapshot,{},['accepted'],version);
   assert.equal(lookups,version===1?12:8);assert.equal(snapshot.componentDependencyCaptures.length,12);
   assert.equal(snapshot.componentDependencyCaptures.filter(c=>c.failure==='dependency-reference-capture-limit').length,version===1?0:4);
  }finally{delete global.figma;}
 }
});
