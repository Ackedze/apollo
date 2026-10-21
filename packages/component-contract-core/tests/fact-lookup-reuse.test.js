const test=require('node:test'),assert=require('node:assert/strict'),core=require('../dist/core.cjs');
const {fixture}=require('./helpers/declared-target.cjs');

test('wide source correspondence bounds fact reads per node and rechecks edits on the next comparison',()=>{
 const f=fixture(core),s=f.snapshot,root=s.nodes[0];s.nodes=[root];root.childIds=[];
 for(let i=0;i<32;i++){
  const id='child-'+i;root.childIds.push(id);
  s.nodes.push({id,parentId:root.id,childIds:[],name:'Repeated',type:'FRAME',unknownFacts:[],component:{propertyReferences:[],sourceIdentity:{version:1,
   sourceNodeId:'source-'+i,ownerComponentKey:'synthetic-variant',ownerMainComponentId:'synthetic-main'}}});
 }
 const reference=JSON.parse(JSON.stringify(core.captureVariantReference(s,'synthetic-variant','synthetic-set')));let reads=0;
 for(const node of s.nodes.slice(1)){
  const source=node.component.sourceIdentity;
  Object.defineProperty(node.component,'sourceIdentity',{enumerable:true,get(){reads++;return source;}});
 }
 assert.equal(core.compareInstanceBoundaries(s,reference).complete,true);
 assert(reads<=2*s.nodes.length,'a wide sibling set must not repeatedly reread every source fact: '+reads);
 const source=s.nodes[1].component.sourceIdentity;source.ownerComponentKey='foreign';
 assert.equal(core.compareInstanceBoundaries(s,reference).complete,false,'another comparison must observe changed evidence');
 source.ownerComponentKey='synthetic-variant';assert.equal(core.compareInstanceBoundaries(s,reference).complete,true);
 s.nodes[2].component.sourceIdentity.sourceNodeId=source.sourceNodeId;
 assert.equal(core.compareInstanceBoundaries(s,reference).complete,false,'duplicate source occurrences stay ambiguous');
});

test('one imported pristine tree is normalized once while every owned layer keeps its independent source identity',()=>{
 const count=32,owner={figmaNodeId:'actual',type:'INSTANCE',parentIndex:null};
 const entries=[owner,...Array.from({length:count},(_,i)=>({figmaNodeId:'Iactual;source-'+i,type:'FRAME',parentIndex:0}))];
 const pristineEntries=[{figmaNodeId:'pristine',type:'INSTANCE',parentIndex:null},
  ...Array.from({length:count},(_,i)=>({figmaNodeId:'Ipristine;source-'+i,type:'FRAME',parentIndex:0}))];
 let reads=0;const topology={complete:true,get entries(){reads++;return pristineEntries;}};
 const main={id:'imported-main',key:'library-key',type:'COMPONENT',remote:true};
 const mains=new Map([['actual',main]]),sources=new Map([[main.id,{mainComponentId:main.id,componentKey:main.key,topology}]]);
 const result=core.captureInstanceSourceIdentities(entries,mains,sources,true);
 assert.equal(result.size,count);assert.equal(result.get('Iactual;source-31').sourceNodeId,'source-31');
 assert(reads<=count+2,'normalizing a shared pristine source must not enumerate its entries for every owned layer: '+reads);
 main.key='changed';assert.equal(core.captureInstanceSourceIdentities(entries,mains,sources,true).size,0);
 main.key='library-key';topology.complete=false;assert.equal(core.captureInstanceSourceIdentities(entries,mains,sources,true).size,0);
});

test('every binding retains its pin failure and a later evaluation must revalidate changed child contracts',()=>{
 const f=fixture(core),parent=f.compile().contract,child=JSON.parse(JSON.stringify(parent));
 child.package.componentId='synthetic.child';
 const d={id:'child',componentId:child.package.componentId,revision:child.package.manualRevision||child.rules[0].revision,
  manualSourceHash:child.package.manualSourceHash,compiledHash:core.stableHash(child),contract:child,
  bindings:Array.from({length:4},(_,i)=>({id:'binding-'+i,targetRole:'missing',relativePath:'',childPath:'part',ownerComponentSetKeys:['synthetic-set'],activeVariant:{property:'Size',values:['56']}}))};
 parent.componentDependencies=[d];
 let reads=0;const documentType=child.documentType;
 Object.defineProperty(child,'documentType',{enumerable:true,get(){reads++;return documentType;}});
 const run=()=>core.evaluateCompiledContract(f.snapshot,parent).dependencyRuns;
 assert(run().every(r=>r.reason!=='dependency-pin-mismatch'));
 assert(reads<=3,'adding bindings must not multiply reads of the same child contract');
 child.package.id='modified-child';
 const failed=run();assert.equal(failed.length,4);assert(failed.every(r=>r.reason==='dependency-pin-mismatch'));
});
