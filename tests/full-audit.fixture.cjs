const assert=require('node:assert/strict');let seq=0;
// Capture assertions explicitly request full diagnostics; UI transport stays compact.
async function fullAudit(api,messages,summary){
 const requestId='test-full:'+ ++seq;
 await api.ui.onmessage({type:'audit-report-request',requestId,auditId:summary.auditId,operation:'full',componentAuditId:null});
 const reply=messages.find(m=>m.type==='audit-report-result'&&m.requestId===requestId);
 assert(reply,'full diagnostics reply');assert.equal(reply.error,undefined);return reply.data;
}
module.exports={fullAudit};
