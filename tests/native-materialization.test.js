const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,hash,bridge,request}=require('./document-audit.test');
const {collect,recheck}=require('../src/document-audit/engine');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){for(let i=0;i<500;i++){const value=check();if(value)return value;await wait(2);}throw Error('Expected audit event');}
function scene(){
 const f=fixture(),main=f.component('old',true,'key');f.component('latest-key',true,'key');
 const root=f.instance('selected',main);f.page.selection=[root];
 const text=f.node('text','TEXT',root,{characters:'Synthetic',fills:[{type:'SOLID',color:{r:1,g:0,b:0}}],fillStyleId:'old-style'});
 f.api.getStyleByIdAsync=async id=>({id,key:'a'.repeat(40),type:'PAINT',name:'Synthetic'});return{f,text};
}
test('published import materializes bindings before style capture, without a stale result or extra import',async()=>{
 const {f,text}=scene(),imported=f.api.importComponentByKeyAsync,events=[];
 f.api.importComponentByKeyAsync=async key=>{const main=await imported(key);text.fillStyleId='new-style';text.fills=[{type:'SOLID',color:{r:0,g:1,b:0}}];return main;};
 const observation=await collect(f.api,f.context(),{hash,assertCurrent:()=>{},onTrace:(event,data)=>events.push({event,data})});
 await recheck(f.api,observation.facts,{hash,assertCurrent:()=>{}});
 assert.deepEqual(f.calls,['key']);assert.equal(observation.checks.find(c=>c.id==='customStyles').checked,2);
 assert.equal(observation.facts.find(f=>f.kind==='styles'&&f.id===text.id).value.fillStyleId,'new-style');
 assert.ok(events.some(e=>e.event==='phase-drift'&&e.data.nodeId===text.id&&e.data.changedFields.includes('fillStyleId')));
});
test('a lazy resource lookup settles before findings and their exact style snapshot are captured',async()=>{
 const {f,text}=scene(),lookup=f.api.getStyleByIdAsync;let reads=0;
 f.api.getStyleByIdAsync=async id=>{reads++;const style=await lookup(id);if(id==='old-style')text.fillStyleId='new-style';return style;};
 const o=await collect(f.api,f.context(),{hash,assertCurrent:()=>{}});await recheck(f.api,o.facts,{hash,assertCurrent:()=>{}});
 assert.equal(o.facts.find(f=>f.kind==='styles'&&f.id===text.id).value.fillStyleId,'new-style');assert.equal(reads,3); // old/new once, plus strict resource reread
});
test('lazy binding resolution automatically recaptures before committing a native result',async()=>{
 const {f,text}=scene(),lookup=f.api.getStyleByIdAsync;let materialized=false;
 f.api.getStyleByIdAsync=async id=>{const style=await lookup(id);if(!materialized){materialized=true;text.fillStyleId='new-style';}return style;};
 const b=bridge(f);try{
  b.accept(request(f,'lazy'));await until(()=>f.messages.find(m=>m.type==='document-audit-result'));
  assert.equal(f.messages.some(m=>m.diagnostic?.code==='NATIVE_FACTS_CHANGED'),false);
  assert.equal(f.messages.filter(m=>m.type==='document-audit-result').length,1);assert.equal(f.messages.some(m=>m.type==='document-audit-error'),false);
 }finally{b.stop();}
});
test('a resource that keeps changing during evidence collection still rejects the mixed snapshot',async()=>{
 const {f,text}=scene(),lookup=f.api.getStyleByIdAsync;let changes=0;
 f.api.getStyleByIdAsync=async id=>{const style=await lookup(id);text.fillStyleId='style-'+(++changes);return style;};
 await assert.rejects(collect(f.api,f.context(),{hash,assertCurrent:()=>{}}),e=>e.message==='NATIVE_FACTS_CHANGED'&&e.nativeFailure.stage==='style-resource-resolution'&&e.nativeFailure.nodeId===text.id);
});
test('console trace is bounded, carries chronology and hashes, and excludes document values',()=>{
 const {createAuditTrace}=require('../src/document-audit/trace'),output=[],trace=createAuditTrace(event=>output.push(event),()=>123);
 for(let i=0;i<150;i++)trace('read-start',{nodeId:'synthetic-'+i,characters:'PRIVATE',value:'PRIVATE'});
 trace('facts-changed',{nodeId:'synthetic',expectedHash:'a'.repeat(64),actualHash:'b'.repeat(64),changedFields:['fillStyleId'],message:'PRIVATE'});
 assert.equal(output.length,1);assert.equal(output[0].timeline.length,24);assert.equal(output[0].sequence,151);assert.equal(JSON.stringify(output).includes('PRIVATE'),false);assert.ok(output[0].timeline.every(x=>x.sequence>127));
});
test('source definitions added by local discovery stay outside the selected style scope',async()=>{
 const f=fixture(),main=f.component('local',false),outside=f.node('outside','RECTANGLE',main,{fills:[{type:'SOLID',color:{r:1,g:0,b:0}}]});
 f.page.selection=[f.instance('selected',main)];const o=await collect(f.api,f.context(),{hash,assertCurrent:()=>{}}),styles=o.checks.find(c=>c.id==='customStyles');
 assert.ok(o.nodes.has(outside.id));assert.equal(styles.checked,1);assert.equal(styles.findings.some(x=>x.name===outside.name),false);
});
test('Stop during a pending import prevents subsequent style reads and late delivery',async()=>{
 const {f}=scene();let release,started=false,styleReads=0;
 f.api.importComponentByKeyAsync=()=>{started=true;return new Promise(resolve=>release=()=>resolve(f.nodes.get('latest-key')));};
 f.api.getStyleByIdAsync=async()=>{styleReads++;return null;};const b=bridge(f);
 try{b.accept(request(f,'stop'));await until(()=>started);b.accept({type:'document-audit-cancel',schemaVersion:'apollo.document-audit.v1',requestId:'stop'});release();await wait(30);assert.equal(styleReads,0);assert.equal(f.messages.some(m=>m.type==='document-audit-result'),false);}finally{b.stop();}
});
test('a real later fill change still fails the unchanged strict fact comparison',async()=>{
 const {f,text}=scene(),o=await collect(f.api,f.context(),{hash,assertCurrent:()=>{}});text.fills=[{type:'SOLID',color:{r:0,g:0,b:1}}];
 await assert.rejects(recheck(f.api,o.facts,{hash,assertCurrent:()=>{}}),e=>e.message==='NATIVE_FACTS_CHANGED'&&e.nativeFailure.nodeId===text.id&&e.nativeFailure.changedFields.includes('fills.0.color.b'));
});
test('materialization trace stays bounded while every selected style fact is still captured and rechecked',async()=>{
 const {f}=scene(),events=[],texts=[];
 for(let i=0;i<24;i++)texts.push(f.node('lazy-'+i,'TEXT',f.page.selection[0],{characters:'Synthetic',fills:[{type:'SOLID',color:{r:1,g:0,b:0}}],fillStyleId:'old-'+i}));
 f.api.getStyleByIdAsync=async id=>{const text=texts.find(n=>n.fillStyleId===id);if(text&&id.startsWith('old-'))text.fillStyleId=id.replace('old-','new-');return{id,key:'a'.repeat(40),type:'PAINT',name:'Synthetic'};};
 const o=await collect(f.api,f.context(),{hash,assertCurrent:()=>{},onTrace:(event,data)=>events.push({event,data})});await recheck(f.api,o.facts,{hash,assertCurrent:()=>{}});
 assert.equal(events.filter(e=>e.event==='phase-drift'&&e.data.stage==='style-resource-loading').length,8);
 assert.equal(events.find(e=>e.event==='phase-summary'&&e.data.stage==='style-resource-loading').data.count,24);
 assert.equal(o.facts.filter(f=>f.kind==='styles').length,26);
 texts[23].fillStyleId='changed-after-capture';await assert.rejects(recheck(f.api,o.facts,{hash,assertCurrent:()=>{}}),/NATIVE_FACTS_CHANGED/);
});
test('tracing preserves exact facts and findings with at most two extra text-segment reads per node',async()=>{
 const observations=[];
 for(const enabled of [false,true]){
  const {f}=scene();let segments=0;
  for(let i=0;i<20;i++){
   const n=f.node('text-'+i,'TEXT',f.page.selection[0],{characters:'Synthetic',fills:[],textStyleId:''});
   n.getStyledTextSegments=fields=>{segments++;const row={start:0,end:9};for(const field of fields)row[field]=n[field];return[row];};
  }
  const o=await collect(f.api,f.context(),{hash,assertCurrent:()=>{},onTrace:enabled?()=>{}:null});observations.push({segments,checks:o.checks.map(c=>Object.assign({},c,{findings:c.findings.slice().sort((a,b)=>a.findingId.localeCompare(b.findingId))})),facts:o.facts});
 }
 // Parallel completion order is independent of tracing; compare every value by identity.
 const byIdentity=(a,b)=>(a.kind+':'+a.id).localeCompare(b.kind+':'+b.id);
 assert.deepEqual(observations[0].facts.slice().sort(byIdentity),observations[1].facts.slice().sort(byIdentity));assert.deepEqual(observations[0].checks,observations[1].checks);
 assert(observations[1].segments-observations[0].segments<=40,'diagnostic tracing must not add a third full text traversal');
});
