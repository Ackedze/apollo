const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,hash}=require('./document-audit.test');
const {collect,recheck}=require('../src/document-audit/engine');
const {failureDiagnostic,failureValid}=require('../src/document-audit/protocol');
function scene(){
 const f=fixture(),set=f.node('old-set','COMPONENT_SET',f.sourcePage,{key:'a'.repeat(40),remote:true});
 const old=f.component('old',true,'b'.repeat(40),set),latestSet=f.node('latest-set','COMPONENT_SET',f.sourcePage,{key:set.key,remote:true});
 const latest=f.component('latest',true,old.key,latestSet);f.page.selection=Array.from({length:11},(_,i)=>f.instance('selected-'+i,old));
 const failures=[],calls=[];f.api.importComponentByKeyAsync=async key=>{calls.push(['component',key]);throw Error('Could not find published component');};
 f.api.importComponentSetByKeyAsync=async key=>{calls.push(['set',key]);return latestSet;};
 const capture=()=>collect(f.api,f.context(),{hash,assertCurrent:()=>{},readOperation:read=>read(),onReadFailure:e=>failures.push(e)});
 return{f,set,old,latestSet,latest,failures,calls,capture};
}
test('published set recovers only the exact variant key, once for repeated instances, preserving the first failure',async()=>{
 const s=scene(),o=await s.capture(),fresh=o.checks.find(c=>c.id==='freshness');
 assert.equal(fresh.status,'complete');assert.equal(fresh.findings.length,11);assert(fresh.findings.every(f=>f.status==='update'&&f.componentKey===s.old.key&&f.evidence.latestComponentId===s.latest.id));
 assert.deepEqual(s.calls,[['component',s.old.key],['set',s.set.key]]);assert.equal(s.failures.length,1);await recheck(s.f.api,o.facts,{hash,assertCurrent:()=>{}});
});
test('three distinct variant failures share one set import and retain all eleven occurrence results',async()=>{
 const s=scene(),second=s.f.component('old-second',true,'c'.repeat(40),s.set),third=s.f.component('old-third',true,'d'.repeat(40),s.set);
 s.f.component('latest-second',true,second.key,s.latestSet);s.f.component('latest-third',true,third.key,s.latestSet);
 s.f.page.selection=s.f.page.selection.map((n,i)=>{n.getMainComponentAsync=async()=>i<3?s.old:i<9?second:third;return n;});
 const o=await s.capture(),fresh=o.checks.find(c=>c.id==='freshness');assert.equal(fresh.findings.length,11);assert(fresh.findings.every(f=>f.status==='update'));
 assert.equal(s.calls.filter(c=>c[0]==='set').length,1);assert.equal(s.calls.filter(c=>c[0]==='component').length,3);assert.equal(s.failures.length,3);
});
for(const mismatch of ['missing','duplicate','wrong-set-key','local-set','wrong-type','foreign-parent'])test('set fallback remains UNKNOWN: '+mismatch,async()=>{
 const s=scene();
 if(mismatch==='missing'){s.latest.key='c'.repeat(40);s.latest.name=s.old.name;}
 if(mismatch==='duplicate')s.f.component('duplicate',true,s.old.key,s.latestSet);
 if(mismatch==='wrong-set-key')s.latestSet.key='c'.repeat(40);
 if(mismatch==='local-set')s.latestSet.remote=false;
 if(mismatch==='wrong-type')s.latestSet.type='FRAME';
 if(mismatch==='foreign-parent')s.latest.parent=s.set;
 const o=await s.capture(),fresh=o.checks.find(c=>c.id==='freshness');assert.equal(fresh.status,'incomplete');assert(fresh.findings.every(f=>f.status==='unknown'));
});
for(const cause of ['Permission denied','network offline','unexpected response'])test('no set fallback for '+cause,async()=>{
 const s=scene();s.f.api.importComponentByKeyAsync=async()=>{throw Error(cause);};await s.capture();assert.equal(s.calls.length,0);
});
test('set lookup failure is deduplicated and its diagnostic remains valid',async()=>{
 const s=scene();s.f.api.importComponentSetByKeyAsync=async key=>{s.calls.push(['set',key]);throw Error('Could not find published component set');};
 const o=await s.capture();assert.equal(o.checks.find(c=>c.id==='freshness').status,'incomplete');assert.equal(s.calls.length,2);assert.equal(s.failures.length,2);
 const d=failureDiagnostic(s.failures[1],'run','collect',hash,'set');assert.equal(d.read.operation,'importComponentSetByKeyAsync');assert.equal(failureValid(d),true);
});
test('moving either the old variant or the recovered variant to another set invalidates its evidence',async()=>{
 for(const target of ['old','latest']){const s=scene(),o=await s.capture();s[target].parent=s.f.node('foreign','COMPONENT_SET',s.f.sourcePage,{key:'f'.repeat(40),remote:true});await assert.rejects(recheck(s.f.api,o.facts,{hash,assertCurrent:()=>{}}),/NATIVE_FACTS_CHANGED/);}
});
test('update action repeats the proven set lookup and refuses a different published variant id',async()=>{
 const {buildActionData,performAction}=require('../src/document-audit/actions');
 for(const changed of [false,true]){
  const s=scene(),node=s.f.page.selection[0];let swapped=0,written=0,current=s.old;node.getMainComponentAsync=async()=>current;node.swapComponent=next=>{swapped++;current=next;};
  const o=await s.capture(),actions=buildActionData(o,'run',s.f.context(),hash),action=Array.from(actions.registry.values())[0];assert.equal(action.componentSetKey,s.set.key);
  if(changed)s.latest.id='different-published-version';
  const run=performAction(s.f.api,action,node,{read:f=>f(),guard:()=>{},hash,beforeWrite:async()=>{},onWritten:()=>written++});
  if(changed){await assert.rejects(run,/ACTION_PUBLISHED_IDENTITY_CHANGED/);assert.equal(swapped,0);assert.equal(written,0);}
  else{assert.equal((await run).verified,true);assert.equal(swapped,1);assert.equal(written,1);}
 }
});
test('Stop during set import prevents late recovered evidence and further style reads',async()=>{
 const s=scene();let release,stopped=false,styleReads=0;
 s.f.api.importComponentSetByKeyAsync=()=>new Promise(r=>release=r);s.f.api.getStyleByIdAsync=async()=>{styleReads++;return null;};
 const task=collect(s.f.api,s.f.context(),{hash,assertCurrent:()=>{if(stopped)throw Error('NATIVE_CANCELLED');},readOperation:f=>f()});
 const rejected=assert.rejects(task,/NATIVE_CANCELLED/);while(!release)await new Promise(r=>setTimeout(r,0));stopped=true;release(s.latestSet);await rejected;assert.equal(styleReads,0);
});
test('local Spacers variants retain all eleven occurrences and never read a published version',async()=>{
 const s=scene();s.set.name='Spacers';s.set.remote=false;s.old.remote=false;
 const second=s.f.component('local-second',false,'c'.repeat(40),s.set),third=s.f.component('local-third',false,'d'.repeat(40),s.set);
 s.f.page.selection.forEach((n,i)=>{n.name='Spacers';n.getMainComponentAsync=async()=>i<3?s.old:i<9?second:third;});
 const o=await s.capture(),local=o.checks.find(c=>c.id==='local'),fresh=o.checks.find(c=>c.id==='freshness');
 assert.equal(local.status,'complete');assert.equal(local.findings.length,3);assert(local.findings.every(f=>f.status==='local'));assert.equal(local.findings.reduce((n,f)=>n+f.occurrences.length,0),11);assert.equal(s.calls.length,0);assert.equal(s.failures.length,0);assert.equal(fresh.findings.length,0);
});
