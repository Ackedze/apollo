const {parallel}=require('./document-audit/reads');
// Independent final reads overlap; every capture is still compared before delivery.
async function verifyFinalCaptures(captures,{check,hash,guard,time}){
 let failure=null;
 const current=()=>{guard();if(failure)throw failure;};
 await parallel(captures,4,async capture=>{
  current();const end=time(capture.subject.id);
  try{
   const actual=await check(capture,current);current();
   if(hash(actual.anatomy)!==hash(capture.captured.anatomy))throw Error(`Свойства узла ${capture.subject.id} изменились во время захвата. Повторите проверку. (AUDIT_CAPTURE_CHANGED · verify-final-capture)`);
  }catch(error){if(!failure)failure=error;throw failure;}finally{end();}
 });
 current();
}
module.exports={verifyFinalCaptures};
