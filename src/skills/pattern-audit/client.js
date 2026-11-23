'use strict';
const {createFigmaAuditClient}=require('../../figma-audit/client');
function saveJson(value,name){
 const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');
 a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function createPatternAuditClient(options={}){
 const endpoint=options.endpoint||'http://localhost:3001/skills/pattern-audit',request=options.request||fetch;
 const patternRequest=async(url,init)=>{const response=await request(url,init);if(response.status===404&&url===endpoint+'/status')throw Error('В этой версии Proxy нет проверки паттернов. Установи совместимую локальную сборку Proxy.');return response;};
 const client=createFigmaAuditClient(Object.assign({},options,{endpoint,request:patternRequest,cancelOnSelectionChange:false}));
 return Object.assign(client,{
  downloadReport(){
   const state=client.getState(),run=state.report||state.run;if(!run)return;
   saveJson({tool:'pattern-audit',state:{status:state.status,stale:state.stale,error:state.error},result:run},'apollo-patterns-'+run.snapshotId+'.json');
  },
  async downloadInput(){
   const run=client.getState().run;if(!run||run.step<1)throw Error('Вход агента ещё не подготовлен.');
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
   try{
    const response=await request(endpoint+'/runs/'+encodeURIComponent(run.runId)+'/input?requestId='+encodeURIComponent(run.requestId),{signal:controller.signal});
    const body=await response.json();
    if(!response.ok||body.success!==true||body.input?.kind!=='apollo.pattern-audit-input.v1'||body.input.runId!==run.runId||body.input.requestId!==run.requestId)throw Error('Не удалось скачать исходные данные агента. '+(body.code||'Повторите попытку.'));
    if(client.getState().run?.runId!==run.runId)throw Error('Началась другая проверка. Скачайте её данные заново.');
    saveJson(body.input,'apollo-patterns-input-'+run.snapshotId+'.json');
   }finally{clearTimeout(timer);}
  }
 });
}
module.exports={createPatternAuditClient};
