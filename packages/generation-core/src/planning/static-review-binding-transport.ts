import type { Hash } from './types';
import type { StaticReviewResult } from './static-review-transport';
import { STATIC_REVIEW_RESULT_VERSION, createStaticReviewResult, sealStaticReviewResult, validateStaticReviewResult } from './static-review-transport';
export const STATIC_BINDING_REQUEST_VERSION = 'apollo.v4-static-review-request.v2-draft';
export const STATIC_BINDING_RESPONSE_VERSION = 'apollo.v4-static-review-response.v2-draft';
export const STATIC_BINDING_RESULT_VERSION = 'apollo.v4-static-review-result.v2-draft';
export type ConsumerBinding = {
 status:'matches'|'unverified'|'stale'|'rejected';receiptHash:string|null;vectorHash:string|null;
 configHash:string|null;buildHash:string|null;checkedFiles:number;diagnosticCode:string|null;
};
export type StaticBindingResult = Omit<StaticReviewResult,'schemaVersion'> & {
 schemaVersion:typeof STATIC_BINDING_RESULT_VERSION;consumerBinding:ConsumerBinding;
};
export function unverifiedConsumerBinding():ConsumerBinding {
 return {status:'unverified',receiptHash:null,vectorHash:null,configHash:null,buildHash:null,checkedFiles:0,diagnosticCode:'CONSUMER_BINDING_PIN_REQUIRED'};
}
export function sealStaticBindingResult(result:StaticBindingResult,hash:Hash):StaticBindingResult {
 const payload=Object.assign({},result);delete (payload as any).resultHash;result.resultHash=hash(payload);return result;
}
/** v1 fields are copied without changing original producer freshness or source gates. */
export function withConsumerBinding(result:StaticReviewResult,binding:ConsumerBinding,hash:Hash):StaticBindingResult {
 const next=Object.assign({},result) as unknown as StaticBindingResult;
 next.schemaVersion=STATIC_BINDING_RESULT_VERSION;next.consumerBinding=Object.assign({},binding);
 return sealStaticBindingResult(next,hash);
}
export function createStaticBindingResult(input:unknown,requestId:string,buildHash:string,hash:Hash):StaticBindingResult {
 return withConsumerBinding(createStaticReviewResult(input,requestId,buildHash,hash),unverifiedConsumerBinding(),hash);
}
export function validateStaticBindingResult(value:unknown,expected:{requestId:string;input:unknown;buildHash:string},hash:Hash):boolean {
 try {
  const v=value as any;
  if(!v||v.schemaVersion!==STATIC_BINDING_RESULT_VERSION||!Object.prototype.hasOwnProperty.call(v,'consumerBinding'))return false;
  const payload=Object.assign({},v);delete payload.resultHash;
  if(v.resultHash!==hash(payload))return false;
  const b=v.consumerBinding,keys=['status','receiptHash','vectorHash','configHash','buildHash','checkedFiles','diagnosticCode'];
  if(!b||Array.isArray(b)||Object.keys(b).length!==keys.length||!keys.every(k=>Object.prototype.hasOwnProperty.call(b,k))
   ||!['matches','unverified','stale','rejected'].includes(b.status)||!Number.isInteger(b.checkedFiles)||b.checkedFiles<0||b.checkedFiles>16384
   ||![b.receiptHash,b.vectorHash,b.configHash,b.buildHash].every(h=>h===null||(typeof h==='string'&&/^[a-f0-9]{64}$/.test(h)))
   ||(b.diagnosticCode!==null&&(typeof b.diagnosticCode!=='string'||!/^CONSUMER_BINDING_[A-Z0-9_]{1,60}$/.test(b.diagnosticCode))))return false;
  if(b.status==='matches') {
   if(v.source?.status!=='observed'||v.freshness?.status!=='stale'||v.freshness?.mismatches!==1||b.checkedFiles<1||[b.receiptHash,b.vectorHash,b.configHash,b.buildHash].some(h=>h===null)||b.buildHash!==expected.buildHash||b.diagnosticCode!==null)return false;
  }else if(b.checkedFiles!==0||[b.receiptHash,b.vectorHash,b.configHash,b.buildHash].some(h=>h!==null)||b.diagnosticCode===null)return false;
  const original=Object.assign({},v,{schemaVersion:STATIC_REVIEW_RESULT_VERSION});delete original.consumerBinding;
  sealStaticReviewResult(original,hash);
  return validateStaticReviewResult(original,expected,hash);
 }catch{return false;}
}
