const test=require('node:test'),assert=require('node:assert/strict');
const {collectNodes,collectAnatomy}=require('../packages/component-contract-core/dist/capture.cjs');
function scene(failIndex=-1){
 let pending=0,maxPending=0,sequence=0;const created=[],page={id:'page',type:'PAGE'};
 const node=(id,name,type)=>({id,name,type,children:[],visible:true,opacity:1,width:40,height:40,x:0,y:0,resolvedVariableModes:{},componentPropertyReferences:{},componentProperties:{},remove(){this.removed=true;}});
 const root=node('actual','Host','INSTANCE'),host={id:'host',key:'host-key',type:'COMPONENT',parent:page,componentPropertyDefinitions:{}};
 root.parent=page;root.getMainComponentAsync=async()=>host;
 for(let i=0;i<8;i++){
  const main={id:'main-'+i,key:'key-'+i,type:'COMPONENT',remote:true,parent:page,componentPropertyDefinitions:{}};
  main.createInstance=()=>{const ref=node('pristine-'+ ++sequence,'Part','INSTANCE');created.push(ref);ref.parent=page;ref.getMainComponentAsync=async()=>{pending++;maxPending=Math.max(maxPending,pending);try{await new Promise(r=>setTimeout(r,5));if(i===failIndex)throw Error('unavailable source');return main;}finally{pending--;}};const child=node('I'+ref.id+';500:'+i,'Content','FRAME');child.parent=ref;ref.children=[child];return ref;};
  const part=node('part-'+i,'Part','INSTANCE');part.parent=root;part.getMainComponentAsync=async()=>main;const child=node('I'+part.id+';500:'+i,'Content','FRAME');child.parent=part;part.children=[child];root.children.push(part);
 }
 const api={currentPage:page,root:{name:'Synthetic'},mixed:Symbol(),variables:{getVariableCollectionByIdAsync:async()=>null,getVariableByIdAsync:async()=>null},getStyleByIdAsync:async()=>null};
 return{api,root,created,get maxPending(){return maxPending;}};
}
for(const failIndex of [-1,2])test('native source reads are bounded, ordered and cleaned up; failure '+failIndex,async()=>{
 const f=scene(failIndex);global.figma=f.api;
 try{const result=await collectNodes(f.root,'desktop',{}),owners=result.snapshot.source.instanceSourceIdentityCapture.owners;
  assert(f.maxPending>1,'independent remote source reads must overlap');assert(f.maxPending<=6,'bound temporary source instances');
  assert.deepEqual(owners.map(o=>o.componentKey),Array.from({length:8},(_,i)=>'key-'+i));
  assert.equal(owners.filter(o=>o.status==='unavailable').length,failIndex<0?0:1);if(failIndex>=0)assert.equal(owners[failIndex].reason,'pristine-source-capture-unavailable');
  assert(f.created.every(n=>n.removed));assert.equal(f.root.removed,undefined);assert.equal(result.snapshot.source.truncated,false);
  const fresh=await collectAnatomy(f.root,'desktop',{});assert.deepEqual(fresh.anatomy,result.anatomy,'freshness keeps the same facts');
  assert(f.created.every(n=>n.removed));
 }finally{delete global.figma;}
});
