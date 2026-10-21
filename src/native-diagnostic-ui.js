// Correlation/revision boundary; stale results cannot become an exportable report.
function createNativeDiagnosticUi(send,render){
 let sequence=0,pending='',report=null;
 return{
  request(spec){report=null;pending='native-diagnostic:'+(++sequence);render({busy:true,report:null});send({type:'native-diagnostic-request',requestId:pending,spec:spec??null});},
  accept(message){if(message?.type!=='native-diagnostic-result')return false;if(message.requestId!==pending)return true;pending='';const value=message.report;report=['apollo.native-diagnostic-report.v1','apollo.native-diagnostic-report.v2'].includes(value?.schemaVersion)&&value.provenance==='observed-not-accepted'&&value.mutation==='not-run'&&value.acceptance==='not-run'&&value.live==='not-run'&&value.runtimeCapability==='unknown'&&/^[a-f0-9]{64}$/.test(value.reportHash)?value:null;render({busy:false,report,error:message.error||(!report?'NATIVE_DIAGNOSTIC_RESPONSE_INVALID':null)});return true;},
  invalidate(){pending='';report=null;render({busy:false,report:null});},
  report(){return report;},busy(){return!!pending;}
 };
}
module.exports={createNativeDiagnosticUi};
