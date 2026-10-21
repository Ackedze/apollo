const p=require("../protocol");
const str=(max=120)=>({type:'string',minLength:1,maxLength:max});
const id=Object.assign(str(),{pattern:'^[a-zA-Z0-9._:-]+$'});
const nodeId=Object.assign(str(512),{pattern:'^[a-zA-Z0-9._:-]+(?:;[a-zA-Z0-9._:-]+)*$'});
const sha={type:'string',pattern:'^[a-f0-9]{64}$'};
const nullable=s=>({anyOf:[s,{type:'null'}]});
const enumeration=values=>({enum:values});
const array=(items,max=512,min=0)=>({type:'array',items,minItems:min,maxItems:max});
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const number=(min=-16000,max=16000)=>({type:'number',minimum:min,maximum:max});
const integer=(min=0,max=1000000)=>({type:'integer',minimum:min,maximum:max});
const color={type:'string',pattern:'^#[0-9A-Fa-f]{6}$'};
const nonce={type:'string',pattern:'^[a-f0-9]{32,64}$'};
const identity=object({runId:id,revision:integer(1),specHash:sha,contextHash:sha,target:{const:'figma'}});
const lease=object({sessionNonce:nonce,documentId:id,pageId:id,fileKey:nullable(id),sourceHash:sha});
const gap=object({code:id,message:str(2048)});
const check=object({id,status:enumeration(['passed','failed','unknown','not-applicable']),origin:enumeration(['tool-observation','agent-report','synthetic']),message:str(2048),evidenceHash:nullable(sha)});
const scalar={anyOf:[{type:'string',maxLength:8192},{type:'boolean'}]};
const operations={
 create_root:object({handle:id,name:str(160),width:number(1),height:number(1),background:color}),
 create_frame:object({handle:id,parent:id,name:str(160)}),
 create_instance:object({handle:id,parent:id,mappingId:id}),
 resolve_port:object({handle:id,instance:id,port:id}),
 write_property:object({port:id,value:scalar}),
 clear_slot:object({port:id}),
 clone_template:object({handle:id,port:id,parent:id}),
 append_child:object({parent:id,child:id}),
 set_layout:object({target:id,direction:enumeration(['HORIZONTAL','VERTICAL']),gap:number(0,1000),padding:number(0,1000),width:number(1),height:number(1)}),
 remove_owned:object({target:id}),
 read_tree:object({target:id}),
 check_scope:object({target:id}),
 export_png:object({target:id,scale:number(0.1,1)}),
 focus_result:object({target:id})
};
const op={oneOf:Object.entries(operations).map(([name,args])=>object({operation:{const:name},arguments:args}))};
const operation=object({callId:id,sequence:integer(1),nonce,lease,operations:array(op,24,1)});
const request=object({schemaVersion:{const:'apollo.agent-figma-operation.v2'},identity,callId:id,sequence:integer(1),nonce,lease,operations:array(op,24,1)});
const fact=object({id:nodeId,handle:nullable(id),type:id,parentId:nullable(nodeId),name:{type:'string',maxLength:160},x:nullable({type:'number'}),y:nullable({type:'number'}),width:nullable(number(0)),height:nullable(number(0)),layoutMode:nullable(enumeration(['NONE','HORIZONTAL','VERTICAL'])),itemSpacing:nullable(number(0,1000)),background:nullable(color),visible:{type:'boolean'},characters:nullable({type:'string',maxLength:8192}),references:array(object({name:str(160),value:str(160)}),32),properties:array(object({name:str(160),type:id,value:scalar}),32),children:array(nodeId)});
const rollback=object({status:enumeration(['not-needed','complete','incomplete','not-attempted']),removedIds:array(nodeId),preservedIds:array(nodeId),message:str(2048)});
const semantic=object({versionHash:sha,specHash:sha,revision:integer(1),sourceHash:sha,
 components:array(object({screenNodeId:id,nodeId,choice:id,componentKey:str(120)}),64),
 stacks:array(object({screenNodeId:id,nodeId}),64),
 bodies:array(object({screenNodeId:id,nodeId,children:array(nodeId),limitViolations:array(enumeration(['BELOW_MIN','ABOVE_MAX','HAS_NON_PREFERRED']),3)}),64),
 actions:array(object({actionId:id,groupId:id,nodeId,textNodeId:nodeId,property:str(160),text:{type:'string',maxLength:8192},ownerId:nodeId,representation:enumeration(['inline','overflow']),visible:{type:'boolean'}}),128),
 overflows:array(object({groupId:id,listId:nodeId,hostId:nodeId,bodyId:nodeId,defaultNodeIds:array(nodeId),cellNodeIds:array(nodeId),baselinePreserved:{type:'boolean'},limitViolations:array(enumeration(['BELOW_MIN','ABOVE_MAX','HAS_NON_PREFERRED']),3)}),64)
});
const configuredTarget=object({targetId:str(160),nodeId,parentId:nullable(nodeId),type:id,mainKey:nullable(str(120)),setKey:nullable(str(120)),effectiveVisible:{type:'boolean'},styleKey:nullable(str(120)),styleRangesBound:{type:'boolean'},tokenStatus:enumeration(['passed','unknown','not-applicable']),tokenKeys:array(str(120),32)});
const scalarConfiguration=object({screenNodeId:id,choice:id,mappingId:str(160),targets:array(configuredTarget,32),values:array(object({port:str(160),nodeId,property:nullable(str(160)),type:enumeration(['TEXT','BOOLEAN','VARIANT']),value:scalar,textNodeId:nullable(nodeId),characters:nullable({type:'string',maxLength:8192})}),32)});
const extendedSemantic=object(Object.assign({},semantic.properties,{configurationVersion:{const:'apollo.agent-figma-configuration.v1'},configurations:array(scalarConfiguration,64)}));
const semanticEvidence={anyOf:[semantic,extendedSemantic]};
const observation=object({schemaVersion:{const:'apollo.agent-figma-observation.v3'},identity,callId:id,sequence:integer(1),nonce,lease,status:enumeration(['passed','failed','unknown']),beforeHash:nullable(sha),afterHash:nullable(sha),createdNodeIds:array(nodeId),rootNodeId:nullable(nodeId),facts:array(fact),checks:array(check,256),operations:array(object({index:integer(0,23),operation:enumeration(Object.keys(operations)),status:enumeration(['passed','failed','unknown']),affectedIds:array(nodeId),message:str(2048)}),24),rollback,gaps:array(gap,128),writesPerformed:{type:'boolean'},Ready:{const:false},semantic:nullable(semanticEvidence),export:nullable(object({nodeId,sha256:sha,bytes:integer(1,262144),base64:{type:'string',minLength:4,maxLength:349528,pattern:'^[a-zA-Z0-9+/]*={0,2}$'}})),evidenceHash:sha});
const artifact=object({rootNodeId:nodeId,pageId:id,fileKey:nullable(id),url:nullable({type:'string',pattern:'^https://www[.]figma[.]com/design/[a-zA-Z0-9._:-]+/[^?]*[?]node-id=[a-zA-Z0-9%._:-]+$'}),leaseNonce:nonce,evidenceHash:sha});
const snapshot=object({schemaVersion:{const:'apollo.agent-figma-run-snapshot.v3'},identity,sequence:integer(),status:enumeration(['queued','running','awaiting-operation','question','completed','blocked','failed','cancelled']),capabilities:array(enumeration(Object.keys(operations)),14),progress:array(object({sequence:integer(1),kind:enumeration(['context','agent','tool','check','repair']),message:str(2048)}),256),pendingOperation:nullable(operation),result:nullable(object({message:str(2048),artifact:nullable(artifact),checks:array(check,256),writesPerformed:{type:'boolean'},acceptedWriteOperations:array(enumeration(Object.keys(operations)),14),Ready:{const:false}})),gaps:array(gap,128),snapshotHash:sha});
const bindRequest=object({type:{const:'agent-figma-bind-version'},requestId:id,identity,versionHash:sha});
const bindResponse=object({type:{const:'agent-figma-bind-version-result'},requestId:id,identity,versionHash:nullable(sha),error:nullable(id)});
const openRequest=object({type:{const:'agent-figma-open'},requestId:id,identity});
const openResponse=object({type:{const:'agent-figma-open-result'},requestId:id,identity,lease:nullable(lease),capabilities:array(enumeration(Object.keys(operations)),14),gaps:array(gap,128)});
const operationMessage=object({type:{const:'agent-figma-operation'},requestId:id,request});
const controlTicket=object({requestId:id,nonce,identity,lease,kind:enumeration(['cancel','retain']),reason:nullable(enumeration(['cancel','timeout','failure']))});
const controlRequest=object({type:enumeration(['agent-figma-cancel','agent-figma-retain']),requestId:id,identity,lease,ticket:controlTicket});
const focusRequest=object({type:{const:'agent-figma-focus'},requestId:id,identity,artifact});
const cleanup=object({schemaVersion:{const:'apollo.agent-figma-cleanup.v5'},ticket:controlTicket,origin:enumeration(['native-broker','ui-timeout']),status:enumeration(['complete','incomplete','unknown','preserved']),createdNodeIds:nullable(array(nodeId)),rootNodeId:nullable(nodeId),writesPerformed:nullable({type:'boolean'}),rollback,evidenceHash:sha});
const focusRemainingRequest=object({type:{const:'agent-figma-focus-remaining'},requestId:id,identity,receipt:cleanup});
const retain=object({schemaVersion:{const:'apollo.agent-figma-retain.v5'},ticket:controlTicket,artifact,evidenceHash:sha});
const controlResponse={oneOf:[
 object({type:{const:'agent-figma-cancel-result'},requestId:id,identity,value:nullable(cleanup),error:nullable(id)}),
 object({type:{const:'agent-figma-retain-result'},requestId:id,identity,value:nullable(retain),error:nullable(id)}),
 object({type:{const:'agent-figma-focus-result'},requestId:id,identity,value:nullable({const:true}),error:nullable(id)}),
 object({type:{const:'agent-figma-focus-remaining-result'},requestId:id,identity,value:nullable({const:true}),error:nullable(id)})
]};
const controlHttpRequest=object({identity,lease,kind:enumeration(['cancel','retain']),reason:nullable(enumeration(['cancel','timeout','failure']))});
const controlHttpResponse=object({success:{const:true},ticket:controlTicket});
const controlAck=object({success:{const:true},requestId:id,nonce,accepted:{const:true}});
const stopRequest=object({type:{const:'agent-figma-stop'},requestId:id,identity,lease});
const stopResponse=object({type:{const:'agent-figma-stop-result'},requestId:id,identity,value:object({createdNodeIds:array(nodeId),rootNodeId:nullable(nodeId),writesPerformed:nullable({type:'boolean'})}),error:{type:'null'}});
// This validator uses only the finite JSON Schema vocabulary emitted above.
function matches(s,v,depth=0){
 if(depth>40)return false;
 if(s.anyOf&&!s.anyOf.some(x=>matches(x,v,depth+1)))return false;
 if(s.oneOf&&s.oneOf.filter(x=>matches(x,v,depth+1)).length!==1)return false;
 if(Object.prototype.hasOwnProperty.call(s,'const')&&v!==s.const)return false;
 if(s.enum&&!s.enum.includes(v))return false;
 if(s.type==='null'&&v!==null)return false;
 if(s.type==='boolean'&&typeof v!=='boolean')return false;
 if(s.type==='string'&&(typeof v!=='string'||s.minLength!==undefined&&v.length<s.minLength||s.maxLength!==undefined&&v.length>s.maxLength||s.pattern&&!new RegExp(s.pattern).test(v)))return false;
 if((s.type==='number'||s.type==='integer')&&(typeof v!=='number'||!Number.isFinite(v)||s.type==='integer'&&!Number.isSafeInteger(v)||v<s.minimum||v>s.maximum))return false;
 if(s.type==='array'&&(!Array.isArray(v)||v.length<s.minItems||v.length>s.maxItems||!v.every(x=>matches(s.items,x,depth+1))))return false;
 if(s.type==='object'&&(!p.closed(v,s.required)||!s.required.every(k=>matches(s.properties[k],v[k],depth+1))))return false;
 return true;
}
const valid=(schema,v,max=1048576)=>p.bounded(v,max)&&matches(schema,v);
function validRequest(v){return valid(request,v,262144)&&p.validIdentity(v.identity);}
function validObservation(v,i,op){
 if(!valid(observation,v)||!p.sameIdentity(i,v.identity)||v.callId!==op.callId||v.sequence!==op.sequence||v.nonce!==op.nonce||p.hashWithout(v.lease,'unused')!==p.hashWithout(op.lease,'unused')||v.evidenceHash!==p.hashWithout(v,'evidenceHash'))return false;
 if(new Set(v.createdNodeIds).size!==v.createdNodeIds.length||!v.checks.every(p.validCheck))return false;
 if(v.operations.length>op.operations.length||v.operations.some((x,n)=>x.index!==n||x.operation!==op.operations[n].operation||n<v.operations.length-1&&x.status!=='passed'))return false;
 const mutations=['create_root','create_frame','create_instance','write_property','clear_slot','clone_template','append_child','set_layout','remove_owned'];
 if(v.writesPerformed&&!v.operations.some(x=>mutations.includes(x.operation))&&v.rollback.removedIds.length===0)return false;
 if(v.status==='passed'&&(v.gaps.length||v.rollback.status!=='not-needed'||!v.beforeHash||!v.afterHash||v.operations.length!==op.operations.length||v.operations.some((x,n)=>x.index!==n||x.operation!==op.operations[n].operation||x.status!=='passed')))return false;
 if(!v.writesPerformed&&v.status==='passed'&&v.beforeHash!==v.afterHash)return false;
 if(v.export&&v.export.bytes!==Math.floor(v.export.base64.length*3/4)-(v.export.base64.endsWith('==')?2:v.export.base64.endsWith('=')?1:0))return false;
 return true;
}
function validSnapshot(v,i,after=-1){return !!(valid(snapshot,v,2097152)&&p.sameIdentity(i,v.identity)&&v.sequence>=after&&new Set(v.capabilities).size===v.capabilities.length&&v.progress.every((s,n)=>s.sequence<=v.sequence&&(n===0||s.sequence>v.progress[n-1].sequence))&&(v.status==='awaiting-operation')===(v.pendingOperation!==null)&&(!v.pendingOperation||v.pendingOperation.operations.every(x=>v.capabilities.includes(x.operation)))&&(!v.result||v.result.checks.every(p.validCheck)&&v.result.acceptedWriteOperations.every(x=>v.capabilities.includes(x))&&(!v.result.artifact||i.target==='figma'))&&(v.status!=='completed'||v.result&&v.result.artifact&&v.result.writesPerformed===true&&v.result.checks.some(c=>c.id==='native-readback'&&c.origin==='tool-observation'&&c.status==='passed'&&c.evidenceHash===v.result.artifact.evidenceHash)&&!v.result.checks.some(c=>c.origin==='tool-observation'&&c.status==='failed'))&&v.snapshotHash===p.hashWithout(v,'snapshotHash'));}
const same=(a,b)=>p.hashWithout(a,'unused')===p.hashWithout(b,'unused');
function validTicket(v,i,l,kind){return valid(controlTicket,v)&&p.sameIdentity(v.identity,i)&&same(v.lease,l)&&v.kind===kind&&(kind==='cancel'?v.reason!==null:v.reason===null);}
function validCleanup(v,ticket){if(!valid(cleanup,v)||!validTicket(ticket,ticket.identity,ticket.lease,'cancel')||!same(v.ticket,ticket)||v.evidenceHash!==p.hashWithout(v,'evidenceHash'))return false;
 const ids=v.createdNodeIds,all=v.rollback.removedIds.concat(v.rollback.preservedIds);if(new Set(all).size!==all.length||ids&&new Set(ids).size!==ids.length)return false;
 if(v.origin==='ui-timeout')return v.status==='unknown'&&ids===null&&v.rootNodeId===null&&v.writesPerformed===null&&v.rollback.status==='not-attempted'&&all.length===0;
 if(v.status==='preserved')return v.origin==='native-broker'&&ids!==null&&typeof v.writesPerformed==='boolean'&&v.rollback.status==='not-attempted'&&same(ids.slice().sort(),all.slice().sort())&&(v.rootNodeId===null||v.rollback.preservedIds.includes(v.rootNodeId))&&(v.writesPerformed||ids.length===0&&v.rootNodeId===null);
 if(v.status==='complete')return ids!==null&&typeof v.writesPerformed==='boolean'&&v.rollback.status==='complete'&&v.rollback.preservedIds.length===0&&same(ids.slice().sort(),all.slice().sort())&&(v.rootNodeId===null||v.rollback.removedIds.includes(v.rootNodeId))&&(v.writesPerformed||ids.length===0&&v.rootNodeId===null);
 return v.status==='unknown'||v.status==='incomplete'&&v.rollback.status==='incomplete';
}
function validRetain(v,ticket){return valid(retain,v)&&validTicket(ticket,ticket.identity,ticket.lease,'retain')&&same(v.ticket,ticket)&&v.artifact.pageId===ticket.lease.pageId&&v.artifact.fileKey===ticket.lease.fileKey&&v.artifact.leaseNonce===ticket.lease.sessionNonce&&v.evidenceHash===p.hashWithout(v,'evidenceHash');}
function validRemainingCleanup(v){return !!(v&&v.ticket&&validCleanup(v,v.ticket)&&v.origin==='native-broker'&&(v.status==='incomplete'&&v.rollback.status==='incomplete'||v.status==='preserved'&&v.rollback.status==='not-attempted')&&v.writesPerformed===true&&v.rootNodeId!==null&&v.createdNodeIds?.includes(v.rootNodeId)&&v.rollback.preservedIds.includes(v.rootNodeId)&&!v.rollback.removedIds.includes(v.rootNodeId));}
function unknownCleanup(ticket,message='Native подтверждение отмены не получено.'){const v={schemaVersion:'apollo.agent-figma-cleanup.v5',ticket:p.clone(ticket),origin:'ui-timeout',status:'unknown',createdNodeIds:null,rootNodeId:null,writesPerformed:null,rollback:{status:'not-attempted',removedIds:[],preservedIds:[],message},evidenceHash:''};v.evidenceHash=p.hashWithout(v,'evidenceHash');return v;}
module.exports={operations,schemas:{request,operation,observation,semantic,bindRequest,bindResponse,snapshot,lease,artifact,openRequest,openResponse,operationMessage,controlRequest,focusRequest,focusRemainingRequest,rollback,controlTicket,controlResponse,controlHttpRequest,controlHttpResponse,controlAck,cleanup,retain,stopRequest,stopResponse},matches,valid,validRequest,validObservation,validSnapshot,validTicket,validCleanup,validRetain,validRemainingCleanup,unknownCleanup};
