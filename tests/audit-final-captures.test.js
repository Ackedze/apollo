const test=require('node:test'),assert=require('node:assert/strict');
const {verifyFinalCaptures}=require('../src/audit-final-captures');
const captures=()=>Array.from({length:11},(_,id)=>({subject:{id:String(id)},captured:{anatomy:[id]}}));
const tick=()=>new Promise(r=>setTimeout(r,0));
test('all final captures are reread and timed with at most four concurrent reads',async()=>{
 const rows=captures(),pending=[],seen=[],timed=[];let active=0,max=0;
 const task=verifyFinalCaptures(rows,{hash:JSON.stringify,guard:()=>{},time:id=>()=>timed.push(id),check:async c=>{seen.push(c.subject.id);active++;max=Math.max(max,active);await new Promise(r=>pending.push(r));active--;return{anatomy:c.captured.anatomy};}});
 await tick();assert.equal(active,4);while(seen.length<rows.length||active){pending.splice(0).forEach(r=>r());await tick();}await task;
 assert.equal(max,4);assert.equal(new Set(seen).size,11);assert.equal(timed.length,11);
});
for(const cause of ['mutation','read-failure','stop'])test('final capture '+cause+' drains pending siblings and prevents later reads or delivery',async()=>{
 const rows=captures(),pending=[],seen=[],timed=[];let stopped=false;
 const task=verifyFinalCaptures(rows,{hash:JSON.stringify,guard:()=>{if(stopped)throw Error('AUDIT_CANCELLED');},time:id=>()=>timed.push(id),check:async(c,guard)=>{seen.push(c.subject.id);await new Promise(r=>pending.push(r));guard();if(cause==='read-failure'&&c.subject.id==='0')throw Error('first-read-failure');return{anatomy:cause==='mutation'&&c.subject.id==='0'?['changed']:c.captured.anatomy};}});
 const rejection=assert.rejects(task,cause==='mutation'?/AUDIT_CAPTURE_CHANGED/:cause==='stop'?/AUDIT_CANCELLED/:/first-read-failure/);
 await tick();assert.equal(seen.length,4);if(cause==='stop')stopped=true;
 pending[0]();await tick();assert.equal(seen.length,4);pending.slice(1).forEach(r=>r());await rejection;assert.equal(timed.length,4);
});
