const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const C=path.resolve(__dirname,'..'),core=require('../dist/core.cjs'),captureApi=require('../dist/capture.cjs');
function fixture(core){
  const f=require(path.join(C,'tests/helpers/declared-target.cjs')).fixture(core);
  const original=f.manual.rules[0];
  f.manual.rules=[['root','root'],['child','title.target']].map(([name,targetId])=>({...structuredClone(original),
    id:'synthetic.blend-'+name,targetId,capability:'appearance.blendMode',permission:'forbidden',
    constraints:[{type:'propertyForbidden',fact:'appearance.blendMode'}],status:'reviewed'}));
  for(const n of f.snapshot.nodes)n.appearance={blendMode:n.id==='root'?'PASS_THROUGH':'NORMAL'};
  const reference=structuredClone(f.snapshot);
  f.snapshot=core.materializeEffectiveBaseline(f.snapshot,reference,true).snapshot;
  const compile=()=>core.compileManualSource(f.manual,f.evidence);
  return {f,reference,run:()=>{const compiled=compile();assert(!compiled.issues.some(i=>i.level==='error'));return core.evaluateCompiledContract(f.snapshot,compiled.contract);}};
}
function verdict(result,name){const rows=result.evaluations.filter(e=>e.ruleId==='synthetic.blend-'+name+'.1.1');assert.equal(rows.length,1);return rows[0].classification;}
async function capture(captureApi){
  const main={id:'synthetic-main',key:'synthetic-variant',parent:{type:'COMPONENT_SET',key:'synthetic-set',componentPropertyDefinitions:{}}};
  const page={type:'PAGE',id:'page'};let reference,temporary;
  const make=(id,actual)=>({id,type:'INSTANCE',name:'Plate',parent:page,visible:true,width:100,height:56,opacity:1,
    blendMode:actual?'MULTIPLY':'PASS_THROUGH',children:[],resolvedVariableModes:{},componentProperties:{},
    getMainComponentAsync:async()=>main,exportAsync:async()=>new Uint8Array([1]),remove(){this.removed=true;}});
  main.createInstance=()=>reference=make('reference',false);
  const subject=make('actual',true);
  global.figma={mixed:Symbol('mixed'),fileKey:'synthetic-file',root:{name:'Synthetic'},currentPage:page,
    base64Encode:b=>Buffer.from(b).toString('base64'),
    createPage(){return temporary={id:'temporary',type:'PAGE',appendChild(n){n.parent=this;},remove(){this.removed=true;}};}};
  try{const result=await captureApi.captureInstanceAudit(subject,{componentKey:'synthetic-set',acceptedComponentKeys:[],allowedComponentProperties:[],platform:'desktop',manualSourceHash:'synthetic'});
    assert.equal(reference.removed,true);assert.equal(temporary.removed,true);assert.equal(subject.removed,undefined);return result;
  }finally{delete global.figma;}
}

test('blend mode capture retains independent actual and reference values',async()=>{
 const result=await capture(captureApi);assert.equal(result.snapshot.nodes[0].appearance.blendMode,'MULTIPLY');
 assert.equal(result.snapshot.nodes[0].baseline.effective.appearance.blendMode,'PASS_THROUGH');
});
for(const [name,mutate,root,child,truth] of [
 ['pristine',()=>{},'compliant','compliant'],
 ['root override',s=>s.nodes[0].appearance.blendMode='MULTIPLY','violation','compliant'],
 ['nested override',s=>s.nodes[2].appearance.blendMode='SCREEN','compliant','violation'],
 ['root reset',s=>{s.nodes[0].appearance.blendMode='MULTIPLY';s.nodes[0].appearance.blendMode='PASS_THROUGH';},'compliant','compliant'],
 ['nested reset',s=>{s.nodes[2].appearance.blendMode='SCREEN';s.nodes[2].appearance.blendMode='NORMAL';},'compliant','compliant'],
 ['missing baseline',s=>delete s.nodes[0].baseline.effective.appearance.blendMode,'human-review','compliant','unknown'],
 ['missing actual',s=>delete s.nodes[0].appearance.blendMode,'human-review','compliant','unknown']
])test('blend mode '+name,()=>{const x=fixture(core);mutate(x.f.snapshot);const r=x.run();
 assert.equal(verdict(r,'root'),root);assert.equal(verdict(r,'child'),child);
 if(truth)assert.equal(r.evaluations.find(e=>e.ruleId==='synthetic.blend-root.1.1').trace.truth,truth);
});
