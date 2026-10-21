const test=require('node:test'),assert=require('node:assert/strict');
const native=require("../src/generation/agent/figma/api");
test('a native children getter is read once per snapshot; stale second reads are avoided',()=>{
 const child={id:'child',type:'TEXT',removed:false};let reads=0;
 const root={id:'root',type:'FRAME',removed:false,get children(){reads++;return reads===1?[child]:[{id:'child',removed:true}];}};
 assert.deepEqual(native.nodes(root).map(r=>r.node.id),['root','child']);assert.equal(reads,1);
});
test('unknown removed/duplicate descendants still refuse the snapshot',()=>{
 for(const children of [[{id:'child',removed:true}],[{id:'child'},{id:'child'}]])assert.throws(()=>native.nodes({id:'root',children}),/FIGMA_SOURCE_TOPOLOGY_UNKNOWN/);
});
test('native text references must be exact and unique',()=>{
 const a={id:'a',type:'TEXT',componentPropertyReferences:{characters:'Label#1'}},b={id:'b',type:'TEXT',componentPropertyReferences:{characters:'Other#2'}};
 assert.equal(native.text({id:'root',children:[a,b]},'Label#1'),a);
 assert.throws(()=>native.text({id:'root',children:[a,b]},'Missing#3'),/FIGMA_TEXT_REFERENCE_UNKNOWN/);
 b.componentPropertyReferences.characters='Label#1';assert.throws(()=>native.text({id:'root',children:[a,b]},'Label#1'),/FIGMA_TEXT_REFERENCE_UNKNOWN/);
});
