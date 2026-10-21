import type { Hash } from './types';
import type { StaticContentProjection, StaticScreenSpec } from './static-content-types';
import { validateStaticScreenSpec, projectStaticContent } from './static-content';
export const STATIC_REVIEW_RESULT_VERSION='apollo.v4-static-review-result.v1-draft';
export const STATIC_REVIEW_REQUEST_VERSION='apollo.v4-static-review-request.v1-draft';
export type StaticReviewDiagnostic={code:string;field:string|null};
export type StaticReviewResult={
 schemaVersion:typeof STATIC_REVIEW_RESULT_VERSION;requestId:string;inputHash:string;buildHash:string;
 status:'reviewed'|'invalid'|'rejected';accepted:false;executionAllowed:false;generationPlanHash:null;
 schemaStatus:'valid'|'invalid';
 source:{status:'observed'|'unavailable';readiness:'ready'|'draft'|'invalid'|'unverified';components:Array<{componentId:string;revision:number;compiledStatus:'ready'|'draft';manualSourceHash:string;compiledHash:string;errors:number;predicates:number;pending:number;nonExecutable:number}>};
 api:{availability:'confirmed-source-api'|'unverified';expressibility:'bounded-content-expressible'|'not-supported'|'not-inspected'};
 coverage:{status:'incomplete'|'unverified';errors:number;pending:number;nonExecutable:number};
 freshness:{status:'matches'|'stale'|'unverified';mismatches:number};
 producer:{planHash:string|null;contentHash:string|null;observationHash:string|null};
 content:StaticContentProjection|null;
 intent:{kind:'non-executable-public-api-intent';modules:['arui-private/corporate-content','arui-private/button-group']}|null;
 targets:{figma:'blocked';frontend:'blocked'};profile:'unaccepted';native:'unaccepted';scoped:'unaccepted';live:'not-run';release:'not-accepted';
 diagnostics:StaticReviewDiagnostic[];resultHash:string;
};
const record=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const closed=(v:unknown,keys:string[]):v is Record<string,any>=>record(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.prototype.hasOwnProperty.call(v,k));
const sha=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const count=(v:unknown)=>Number.isInteger(v)&&Number(v)>=0&&Number(v)<=8192;
export function staticReviewInputDiagnostics(input:unknown):StaticReviewDiagnostic[]{
 if(!record(input)||!['apollo.screen-spec.static-content.v1-draft','apollo.code-connect.static-content.v1-draft'].includes(input.schemaVersion))return[{code:'STATIC_REVIEW_WIRE_UNSUPPORTED',field:null}];
 const spec=input.schemaVersion==='apollo.screen-spec.static-content.v1-draft'?input:input.plan?.spec;
 const issues=validateStaticScreenSpec(spec).map(d=>({code:d.code,field:null as string|null}));
 if(!record(spec))return issues;
 if(!Number.isInteger(spec.viewport?.height)||spec.viewport.height<1)issues.push({code:'STATIC_PRODUCT_INPUT_REQUIRED',field:'/viewport/height'});
 if(Array.isArray(spec.nodes))spec.nodes.forEach((n:any,i:number)=>{
  if(n?.mappingId!=='arui-private.buttons-group.desktop')return;
  const a=n.staticActions;
  if(!Array.isArray(a?.priorityOrder))issues.push({code:'STATIC_PRIORITY_REQUIRED',field:`/nodes/${i}/staticActions/priorityOrder`});
  if(Array.isArray(a?.items))a.items.forEach((item:any,j:number)=>{
   for(const k of ['id','label','view','disabled','loading']){
    const value=item?.[k],valid=k==='view'?['primary','secondary'].includes(value):k==='disabled'?typeof value==='boolean':k==='loading'?value===false:typeof value==='string'&&!!value.trim();
    if(!valid)issues.push({code:'STATIC_PRODUCT_INPUT_REQUIRED',field:`/nodes/${i}/staticActions/items/${j}/${k}`});
   }
  });
 });
 return issues.filter((d,i)=>issues.findIndex(x=>x.code===d.code&&x.field===d.field)===i).slice(0,64);
}
export function createStaticReviewResult(input:unknown,requestId:string,buildHash:string,hash:Hash):StaticReviewResult{
 const diagnostics=staticReviewInputDiagnostics(input),result:StaticReviewResult={schemaVersion:STATIC_REVIEW_RESULT_VERSION,requestId,inputHash:hash(input),buildHash,status:diagnostics.length?'invalid':'rejected',accepted:false,executionAllowed:false,generationPlanHash:null,schemaStatus:diagnostics.length?'invalid':'valid',
 source:{status:'unavailable',readiness:'unverified',components:[]},api:{availability:'unverified',expressibility:'not-inspected'},coverage:{status:'unverified',errors:0,pending:0,nonExecutable:0},freshness:{status:'unverified',mismatches:0},producer:{planHash:null,contentHash:null,observationHash:null},content:null,intent:null,
 targets:{figma:'blocked',frontend:'blocked'},profile:'unaccepted',native:'unaccepted',scoped:'unaccepted',live:'not-run',release:'not-accepted',diagnostics,resultHash:''};
 return sealStaticReviewResult(result,hash);
}
export function sealStaticReviewResult(result:StaticReviewResult,hash:Hash):StaticReviewResult{const payload=Object.assign({},result) as any;delete payload.resultHash;result.resultHash=hash(payload);return result;}
/** Strict transport DTO: compiled/manual bodies and authority cannot cross this wire. */
export function validateStaticReviewResult(v:unknown,expected:{requestId:string;input:unknown;buildHash:string},hash:Hash):boolean{
 try{
 if(!closed(v,['schemaVersion','requestId','inputHash','buildHash','status','accepted','executionAllowed','generationPlanHash','schemaStatus','source','api','coverage','freshness','producer','content','intent','targets','profile','native','scoped','live','release','diagnostics','resultHash'])||v.schemaVersion!==STATIC_REVIEW_RESULT_VERSION||v.requestId!==expected.requestId||v.inputHash!==hash(expected.input)||v.buildHash!==expected.buildHash||!sha(v.buildHash)||!['reviewed','invalid','rejected'].includes(v.status)||v.accepted!==false||v.executionAllowed!==false||v.generationPlanHash!==null||!['valid','invalid'].includes(v.schemaStatus))return false;
 const payload=Object.assign({},v);delete payload.resultHash;if(!sha(v.resultHash)||v.resultHash!==hash(payload))return false;
 if(!closed(v.source,['status','readiness','components'])||!['observed','unavailable'].includes(v.source.status)||!['ready','draft','invalid','unverified'].includes(v.source.readiness)||!Array.isArray(v.source.components)||v.source.components.length>32)return false;
 for(const c of v.source.components)if(!closed(c,['componentId','revision','compiledStatus','manualSourceHash','compiledHash','errors','predicates','pending','nonExecutable'])||typeof c.componentId!=='string'||!/^[-A-Za-z0-9:._]{1,128}$/.test(c.componentId)||!Number.isInteger(c.revision)||c.revision<1||!['ready','draft'].includes(c.compiledStatus)||!sha(c.manualSourceHash)||!sha(c.compiledHash)||![c.errors,c.predicates,c.pending,c.nonExecutable].every(count))return false;
 if(new Set(v.source.components.map((c:any)=>c.componentId)).size!==v.source.components.length)return false;
 if(!closed(v.api,['availability','expressibility'])||!['confirmed-source-api','unverified'].includes(v.api.availability)||!['bounded-content-expressible','not-supported','not-inspected'].includes(v.api.expressibility)||!closed(v.coverage,['status','errors','pending','nonExecutable'])||!['incomplete','unverified'].includes(v.coverage.status)||![v.coverage.errors,v.coverage.pending,v.coverage.nonExecutable].every(count))return false;
 if(!closed(v.freshness,['status','mismatches'])||!['matches','stale','unverified'].includes(v.freshness.status)||!count(v.freshness.mismatches)||(v.freshness.status==='matches'&&v.freshness.mismatches!==0)||!closed(v.producer,['planHash','contentHash','observationHash'])||!Object.values(v.producer).every(h=>h===null||sha(h)))return false;
 if(!closed(v.targets,['figma','frontend'])||v.targets.figma!=='blocked'||v.targets.frontend!=='blocked'||v.profile!=='unaccepted'||v.native!=='unaccepted'||v.scoped!=='unaccepted'||v.live!=='not-run'||v.release!=='not-accepted')return false;
 if(!Array.isArray(v.diagnostics)||v.diagnostics.length>64||v.diagnostics.some((d:any)=>!closed(d,['code','field'])||typeof d.code!=='string'||! /^[A-Z][A-Z0-9_]{1,79}$/.test(d.code)||(d.field!==null&&(typeof d.field!=='string'||d.field.length>128||!/^\/(viewport\/height|nodes\/\d{1,2}\/staticActions\/(priorityOrder|items\/\d{1,2}\/(id|label|view|disabled|loading)))$/.test(d.field)))))return false;
 const issues=staticReviewInputDiagnostics(expected.input);if(v.schemaStatus!==(issues.length?'invalid':'valid')||(issues.length&&(v.status!=='invalid'||v.content!==null||v.intent!==null)))return false;
 const rows=v.source.components as any[],totals={errors:rows.reduce((n,c)=>n+c.errors,0),pending:rows.reduce((n,c)=>n+c.pending,0),nonExecutable:rows.reduce((n,c)=>n+c.nonExecutable,0)};
 if(v.coverage.errors!==totals.errors||v.coverage.pending!==totals.pending||v.coverage.nonExecutable!==totals.nonExecutable)return false;
 if(v.source.status==='unavailable'){
  if(rows.length||v.source.readiness!=='unverified'||v.coverage.status!=='unverified'||v.api.availability!=='unverified'||v.freshness.status!=='unverified')return false;
 }else{
  const readiness=totals.errors?'invalid':rows.some(c=>c.compiledStatus==='draft')||totals.pending||totals.nonExecutable?'draft':'ready';
  if(!rows.length||v.source.readiness!==readiness||v.coverage.status!=='incomplete')return false;
 }
 if((v.producer.planHash===null)!==(v.producer.contentHash===null)||(v.producer.planHash===null)!==(v.producer.observationHash===null)||(v.content===null)!==(v.producer.planHash===null)||(v.status==='reviewed')!==(v.content!==null))return false;
 if(v.api.expressibility!=='not-inspected'&&v.content===null)return false;
 if(v.content!==null){const input=expected.input as any,spec=input.schemaVersion==='apollo.screen-spec.static-content.v1-draft'?input:input.plan?.spec;if(validateStaticScreenSpec(spec).length||hash(v.content)!==hash(projectStaticContent(spec as StaticScreenSpec))||v.producer.contentHash!==hash(v.content)||!sha(v.producer.planHash)||!sha(v.producer.observationHash))return false;}
 if(v.intent!==null&&(!closed(v.intent,['kind','modules'])||v.intent.kind!=='non-executable-public-api-intent'||JSON.stringify(v.intent.modules)!==JSON.stringify(['arui-private/corporate-content','arui-private/button-group'])||v.content===null||v.api.expressibility!=='bounded-content-expressible'))return false;
 return true;
 }catch{return false;}
}
