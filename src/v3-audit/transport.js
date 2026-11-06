const VERSION='apollo.v3-audit-transport.v1',BRIDGE='apollo.v3-audit-bridge.v1';
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9:_-]{1,160}$/.test(value);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.prototype.hasOwnProperty.call(value,key));
function dataRequest(message){
 const keys=['type','schemaVersion','requestId','ownerRequestId','operation'];
 return message?.schemaVersion===VERSION&&id(message.requestId)&&id(message.ownerRequestId)&&message.type==='v3-audit-data-request'&&
  (message.operation==='manifest'?exact(message,keys):message.operation==='asset'&&exact(message,keys.concat('dataId','fileId'))&&hash(message.dataId)&&hash(message.fileId));
}
function command(message){
 if(!message||message.schemaVersion!==BRIDGE||!id(message.requestId))return false;
 const keys=['type','schemaVersion','requestId'];
 if(['v3-audit-cancel','v3-audit-invalidate'].includes(message.type))return exact(message,keys);
 if(message.type==='v3-audit-run')return exact(message,keys.concat('kind','channel','pageType','shellAuditEnabled'))&&['components','texts'].includes(message.kind)&&['Desktop','MobileWeb','iOS','Android'].includes(message.channel)&&typeof message.shellAuditEnabled==='boolean'&&(message.pageType===null||['form','details','data-list','landing','dashboard','other'].includes(message.pageType));
 if(!id(message.runId))return false;
 if(message.type==='v3-audit-verify')return exact(message,keys.concat('runId'));
 const field=message.type==='v3-audit-focus'?'focusActionId':message.type==='v3-audit-action'?'actionId':null;
 return!!field&&exact(message,keys.concat('runId',field))&&id(message[field]);
}
module.exports={VERSION,BRIDGE,id,hash,exact,dataRequest,command};
