import { runV3Audit, captureV3Texts, type V3AuditOptions } from './entry';
import type { createAuditDataClient } from './data-client';
import type { FindingActionRegistry } from './remediation/findingActionRegistry';

const SCHEMA='apollo.v3-audit-bridge.v1';
const requestId=(v:any)=>typeof v==='string'&&/^[a-zA-Z0-9:_-]{1,160}$/.test(v);
function pageOf(node:BaseNode):PageNode|null {
  let current:BaseNode|null=node;
  while(current&&current.type!=='PAGE')current=current.parent;
  return current?.type==='PAGE'?current:null;
}
function itemForUi(item:any) {
  const copy=Object.assign({},item);
  if(copy.reference) {
    const r=copy.reference;
    copy.reference={key:r.key,name:r.name,displayName:r.displayName,status:r.status,source:r.source,sourceFile:r.sourceFile,role:r.role};
  }
  return copy;
}
/** Retain native reference trees in the session; UI receives presentation metadata. */
export function auditResultForUi(result:any) {
  if(!result.views)return result;
  const views:any={};
  for(const [key,value]of Object.entries(result.views.visibleViews)) {
    views[key]=Array.isArray(value)?value.map(itemForUi):Object.fromEntries(Object.entries(value as any).map(([k,items])=>[k,(items as any[]).map(itemForUi)]));
  }
  return {schemaVersion:result.schemaVersion,runId:result.runId,dataId:result.dataId,
    visibleViews:views,report:result.report,textReport:result.textReport,baseChecks:result.baseChecks||[],textTargets:result.textTargets||[],mutationAvailable:result.mutationAvailable===true};
}

export function createV3AuditBridge(options:{
  data:ReturnType<typeof createAuditDataClient>;
  pluginVersion:string;
  post(message:any):void;
  readRevision():unknown;
  isUnavailable():boolean;
  onGuard?(guard:()=>void):void;
  onBusy?(busy:boolean):void;
  findingActions?:FindingActionRegistry;
  prepareRoots?(roots:SceneNode[],guard:()=>void):Promise<void>;
  assertPublishReady?():void;
  finish?(guard:()=>void,publish:()=>void):Promise<void>;
  prepareResult?(result:any,context:{guard:()=>void;rootIds:string[];pageId:string;revision:unknown}):Promise<void>;
}) {
  let sequence=0,active:{requestId:string;ticket:number;cancelled:boolean;invalidated:boolean;terminal:boolean;reject:(error:Error)=>void}|null=null;
  async function run(message:any) {
    if(active||options.isUnavailable()){options.post({type:'v3-audit-error',schemaVersion:SCHEMA,requestId:message.requestId,code:'AUDIT_BUSY'});return;}
    const rootIds=message.rootIds;
    if(!Array.isArray(rootIds)||!rootIds.length||rootIds.length>10000||new Set(rootIds).size!==rootIds.length
      ||!rootIds.every((v:any)=>typeof v==='string'&&v.length<=200)||!['Desktop','MobileWeb','iOS','Android'].includes(message.channel)
      ||typeof message.shellAuditEnabled!=='boolean'||!['components','texts'].includes(message.kind)
      ||message.pageType!==null&&!['form','details','data-list','landing','dashboard','other'].includes(message.pageType)) {
      options.post({type:'v3-audit-error',schemaVersion:SCHEMA,requestId:message.requestId,code:'AUDIT_REQUEST_INVALID'});return;
    }
    let reject!:(error:Error)=>void;
    const cancelled=new Promise<never>((_,fail)=>{reject=fail;});
    const work={requestId:message.requestId,ticket:++sequence,cancelled:false,invalidated:false,terminal:false,reject};active=work;
    const pageId=figma.currentPage.id,revision=options.readRevision();
    const guard=()=>{
      if(work.invalidated)throw Error('AUDIT_SOURCE_CHANGED');
      if(active!==work||work.cancelled)throw Error('AUDIT_CANCELLED');
      if(figma.currentPage.id!==pageId||options.readRevision()!==revision)throw Error('AUDIT_SOURCE_CHANGED');
    };
    options.onGuard?.(guard);options.onBusy?.(true);
    try {
      const capture=async()=>{
      const roots:SceneNode[]=[];
      for(const id of rootIds) {guard();const n=await figma.getNodeByIdAsync(id);guard();if(!n||!('visible'in n)||n.removed||pageOf(n)?.id!==pageId)throw Error('AUDIT_SCOPE_UNAVAILABLE');roots.push(n as SceneNode);}
      await options.prepareRoots?.(roots,guard);guard();
      const runOptions:V3AuditOptions={runId:work.requestId,channel:message.channel,pageType:message.pageType,
        shellAuditEnabled:message.shellAuditEnabled,pluginVersion:options.pluginVersion,selection:roots,data:options.data,
        findingActions:options.findingActions,
        assertCurrent:guard,onProgress:progress=>{guard();options.post({type:'v3-audit-progress',schemaVersion:SCHEMA,requestId:work.requestId,progress});}};
      const result=await(message.kind==='texts'?captureV3Texts(runOptions):runV3Audit(runOptions));guard();
      await options.prepareResult?.(result,{guard,rootIds:rootIds.slice(),pageId,revision});guard();return result;
      };
      // These are reads. Stop abandons waiting; any late continuation still
      // carries this exact work guard and cannot publish or own the next run.
      const result=await Promise.race([capture(),cancelled]);guard();
      const publish=()=>{guard();options.assertPublishReady?.();guard();work.terminal=true;
       options.post({type:'v3-audit-result',schemaVersion:SCHEMA,requestId:work.requestId,kind:message.kind,result:auditResultForUi(result)});
      };
      if(options.finish)await Promise.race([options.finish(guard,publish),cancelled]);else publish();
    } catch(error) {
      const code=(error as Error).message;
      work.terminal=true;
      options.post({type:work.cancelled?'v3-audit-cancelled':'v3-audit-error',schemaVersion:SCHEMA,requestId:work.requestId,
        code:/^AUDIT_[A-Z_]+$/.test(code)?code:'AUDIT_FAILED'});
    } finally {if(active===work){active=null;options.onBusy?.(false);}}
  }
  return {
    busy:()=>Boolean(active),
    cancel(){if(active&&!active.cancelled&&!active.terminal){active.cancelled=true;options.post({type:'v3-audit-cancelling',schemaVersion:SCHEMA,requestId:active.requestId});active.reject(Error('AUDIT_CANCELLED'));}},
    invalidate(){sequence++;if(active&&!active.terminal){active.invalidated=true;active.reject(Error('AUDIT_SOURCE_CHANGED'));}},
    accept(message:any){
      if(!['v3-audit-run','v3-audit-cancel'].includes(message?.type))return false;
      if(message.schemaVersion!==SCHEMA||!requestId(message.requestId))return true;
      if(message.type==='v3-audit-cancel'){if(active?.requestId===message.requestId)this.cancel();return true;}
      void run(message);return true;
    },
  };
}
