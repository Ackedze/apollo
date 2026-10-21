import type { Hash, ContractPin } from '../planning/types';
import type { StaticScreenSpec, StaticContentProjection } from '../planning/static-content-types';
import { validateStaticScreenSpec, projectStaticContent } from '../planning/static-content';
import { STATIC_CONTENT_MAPPING, STATIC_GROUP_MAPPING } from '../planning/static-content-types';
import type { AuthoringPackageReview } from './authoring-review';
export type ReviewDiagnostic={code:string;message?:string};
export type ConsumerMismatch={path:string;expectedSha256:string;actualSha256:string|null};
export type HistoricalSourceRead={status:'not-supported';identity:AuthoringPackageReview['identity'];code:'SOURCE_COMPILE';message:string;accepted:false;executionAllowed:false};
/** Supplied by an independently pinned read port; never taken from imported JSON. */
export type StaticProducerReviewBasis={
 artifactDigest:string;registryDigest:string;currentInputsDigest:string;lockDigest:string;
 consumerFilesDigest:string;workspaceConsumerFilesDigest:string;buildInputsDigest:string;
 consumerVector:{path:string;sha256:string};basisRegistryDigest:string;apiEvidenceDigest:string;
 inputPackages:Array<Record<string,unknown>>;
 mappings:Array<{id:string;pin:ContractPin;representationId:string;sourceScopeHash:string|null}>;
 historicalSourceRead:HistoricalSourceRead;sourceReview:AuthoringPackageReview;consumerMismatches:ConsumerMismatch[];
};
export type StaticApiReviewIntent={
 kind:'non-executable-public-api-intent';imports:Array<{module:string;exportName:string}>;
 root:{nodeId:string;mappingId:string;props:Record<string,never>;slots:{body:{codeProp:'children';childNodeIds:string[]}}};
 group:{nodeId:string;mappingId:string;ownedPort:'button-label';props:{size:56;maxVisibleButtons:4;primaryFirst:boolean;showSkeleton:false;elements:Array<{children:string;disabled:boolean;loading:false;dataTestId:string}>}};
 businessPriorityOrder:string[];priorityBinding:'semantic-metadata-only; no public business-priority prop';actionProvenance:StaticContentProjection['provenance'];
};
export type StaticProducerInspection={
 schemaVersion:'apollo.generation-static-producer-inspection.v1-draft';status:'draft';accepted:false;executionAllowed:false;
 importStatus:'inspected'|'stale'|'rejected';generationPlanHash:null;producerPlanHash:string|null;producerContentHash:string|null;producerObservationHash:string|null;
 historicalContent:StaticContentProjection|null;historicalApiIntent:StaticApiReviewIntent|null;apiExpressibility:'bounded-content-expressible'|'not-supported';
 sourceReview:AuthoringPackageReview|null;consumerMismatches:ConsumerMismatch[];targets:{figma:'blocked';frontend:'blocked'};diagnostics:ReviewDiagnostic[];
};
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const hashValue=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function jsonData(v:unknown,path=new Set<object>(),depth=0,budget={count:0}):boolean{
 if(++budget.count>20000||depth>32)return false;
 if(v===null||typeof v==='boolean')return true;
 if(typeof v==='string')return v.length<=2*1024*1024;
 if(typeof v==='number')return Number.isFinite(v);
 if(!v||typeof v!=='object'||path.has(v)||(!Array.isArray(v)&&![Object.prototype,null].includes(Object.getPrototypeOf(v))))return false;
 if(Array.isArray(v)&&(Object.keys(v).length!==v.length||Object.keys(v).some((k,i)=>k!==String(i))))return false;
 path.add(v);
 for(const k of Reflect.ownKeys(v)){if(Array.isArray(v)&&k==='length')continue;const d=Object.getOwnPropertyDescriptor(v,k)!;
  if(typeof k!=='string'||!d.enumerable||!('value'in d)||!jsonData(d.value,path,depth+1,budget))return false;}
 path.delete(v);return true;
}
const gaps=['BG_SOURCE_DRAFT_NONEXECUTABLE_CONTEXT_RULES','STATIC_PROFILE_UNACCEPTED','NATIVE_CANONICAL_BODY_AND_FOUR_OCCURRENCE_CROSSWALK_MISSING',
 'ACTUAL_ALLOCATED_WIDTH_FONT_LOADING_ADDON_READBACK_MISSING','SCOPED_CHECKER_RECEIPTS_UNACCEPTED','STATIC_TARGET_WRITER_NOT_SUPPORTED','PARITY_LIVE_RELEASE_NOT_ACCEPTED'];
function apiIntent(c:StaticContentProjection):StaticApiReviewIntent{
 return {kind:'non-executable-public-api-intent',imports:[{module:'arui-private/corporate-content',exportName:'CorporateContent'},{module:'arui-private/button-group',exportName:'ButtonGroup'}],
 root:{nodeId:c.ownerNodeId,mappingId:STATIC_CONTENT_MAPPING,props:{},slots:{body:{codeProp:'children',childNodeIds:[c.groupNodeId]}}},
 group:{nodeId:c.groupNodeId,mappingId:STATIC_GROUP_MAPPING,ownedPort:'button-label',props:{size:56,maxVisibleButtons:4,primaryFirst:c.actions[0].view==='primary',showSkeleton:false,
 elements:c.actions.map(a=>({children:a.label,disabled:a.disabled,loading:false,dataTestId:a.id}))}},businessPriorityOrder:c.priorityOrder.slice(),
 priorityBinding:'semantic-metadata-only; no public business-priority prop',actionProvenance:copy(c.provenance)};
}
function sourceMatches(b:StaticProducerReviewBasis,hash:Hash):boolean{
 const r=b.sourceReview;
 if(!r||r.schemaVersion!=='apollo.authoring-package-review.v1-draft'||r.status!=='draft'||r.accepted!==false||r.executionAllowed!==false||r.sources.length!==b.inputPackages.length)return false;
 const payload=copy(r);delete (payload as Partial<AuthoringPackageReview>).reviewHash;if(hash(payload)!==r.reviewHash)return false;
 if(new Set(b.inputPackages.map(p=>p.componentId)).size!==b.inputPackages.length)return false;
 for(const p of b.inputPackages){const s=r.sources.find(s=>s.metadata.componentId===p.componentId);
  if(!s||s.archivePath!==p.archivePath||s.archiveSha256!==p.archiveSha256||s.mainPath!==p.manualPath||s.mainSha256!==p.mainManualSha256
   ||s.metadata.contractId!==p.contractId||s.metadata.revision!==p.revision||s.metadata.manualSourceHash!==p.manualSourceHash||s.metadata.compiledHash!==p.compiledHash
   ||!['draft','ready'].includes(s.metadata.compiledStatus)||!Array.isArray(p.dependencyPins))return false;
  const deps=s.metadata.dependencies.map(d=>({componentId:d.componentId,revision:d.revision,manualSourceHash:d.manualSourceHash,compiledHash:d.compiledHash}));
  if(hash(deps)!==hash(p.dependencyPins))return false;
  for(const d of deps){const child=r.sources.find(s=>s.metadata.componentId===d.componentId)?.metadata;if(!child||child.revision!==d.revision||child.manualSourceHash!==d.manualSourceHash||child.compiledHash!==d.compiledHash)return false;}
 }
 return b.mappings.length===2&&new Set(b.mappings.map(m=>m.id)).size===2&&b.mappings.every(m=>[STATIC_CONTENT_MAPPING,STATIC_GROUP_MAPPING].includes(m.id)
  &&r.sources.some(s=>hash(m.pin)===hash({componentId:s.metadata.componentId,contractId:s.metadata.contractId,revision:s.metadata.revision,manualSourceHash:s.metadata.manualSourceHash,compiledHash:s.metadata.compiledHash})));
}
/** Closed deterministic inspection of the producer-owned wire, without a Generation plan or host port. */
export function inspectStaticProducerReview(input:unknown,basis:StaticProducerReviewBasis,hash:Hash):StaticProducerInspection{
 const result:StaticProducerInspection={schemaVersion:'apollo.generation-static-producer-inspection.v1-draft',status:'draft',accepted:false,executionAllowed:false,importStatus:'rejected',generationPlanHash:null,
 producerPlanHash:null,producerContentHash:null,producerObservationHash:null,historicalContent:null,historicalApiIntent:null,apiExpressibility:'not-supported',sourceReview:null,consumerMismatches:[],targets:{figma:'blocked',frontend:'blocked'},diagnostics:[]};
 const reject=(code:string)=>{result.diagnostics.push({code});return result;};
 try{
  if(!jsonData(input)||!jsonData(basis))return reject('REVIEW_JSON_REQUIRED');
  if(!sourceMatches(basis,hash))return reject('REVIEW_SOURCE_STALE');
  const h=basis.historicalSourceRead;
  if(h.status!=='not-supported'||h.code!=='SOURCE_COMPILE'||h.accepted!==false||h.executionAllowed!==false||!h.message)return reject('REVIEW_HISTORICAL_SOURCE_INVALID');
  if(![basis.artifactDigest,basis.registryDigest,basis.currentInputsDigest,basis.lockDigest,basis.consumerFilesDigest,basis.workspaceConsumerFilesDigest,basis.buildInputsDigest,basis.basisRegistryDigest,basis.apiEvidenceDigest,basis.consumerVector.sha256].every(hashValue))return reject('REVIEW_BASIS_INVALID');
  const v=input as any,spec=v?.plan?.spec;
  if(validateStaticScreenSpec(spec).length)return reject('REVIEW_STATIC_SPEC_INVALID');
  const content=projectStaticContent(spec as StaticScreenSpec),pins={specHash:hash(spec),registryDigest:basis.registryDigest,currentInputsDigest:basis.currentInputsDigest,lockDigest:basis.lockDigest,artifactDigest:basis.artifactDigest,
   consumerFilesDigest:basis.consumerFilesDigest,workspaceConsumerFilesDigest:basis.workspaceConsumerFilesDigest,buildInputsDigest:basis.buildInputsDigest};
  const plan={schemaVersion:'apollo.code-connect.static-review-plan.v1-draft',status:'draft',executionAllowed:false,spec:copy(spec),pins,
   components:[STATIC_CONTENT_MAPPING,STATIC_GROUP_MAPPING].map(id=>({nodeId:spec.nodes.find((n:any)=>n.mappingId===id).id,mappingId:id,pin:copy(basis.mappings.find(m=>m.id===id)!.pin)})),
   content,contentHash:hash(content),requirements:{sourceOccurrences:4,visibleProductActions:2,hiddenSourceOccurrences:2,deleteSourceOccurrences:false},generationPlanHash:null};
  const diagnostics:ReviewDiagnostic[]=[];
  if(content.actions.some((a,i)=>i>0&&a.view==='primary'))diagnostics.push({code:'STATIC_VIEW_NOT_SUPPORTED',message:'ButtonGroup forces all later normal text buttons secondary; no per-element View prop.'});
  if(hash(content.displayOrder)!==hash(content.priorityOrder))diagnostics.push({code:'STATIC_PRIORITY_ORDER_MISMATCH',message:'Display and independent highest-first business order conflict; neither order is inferred or silently changed.'});
  const intent=diagnostics.length?null:apiIntent(content);
  const observation={schemaVersion:'apollo.code-connect.static-source-api-observation.v1-draft',accepted:false,executionAllowed:false,scope:'fresh-source-api-and-content-plan-only',artifactDigest:basis.artifactDigest,
   inputHash:hash(spec),planHash:hash(plan),contentHash:hash(content),planSchemaVersion:plan.schemaVersion,generationPlanHash:null,generationSourceReadHash:hash(h),generationWireSupport:'not-supported',planPins:copy(pins),
   consumerVector:copy(basis.consumerVector),consumerFilesDigest:basis.consumerFilesDigest,workspaceConsumerFilesDigest:basis.workspaceConsumerFilesDigest,buildInputsDigest:basis.buildInputsDigest,
   registryDigest:basis.registryDigest,currentInputsDigest:basis.currentInputsDigest,lockDigest:basis.lockDigest,basisRegistryDigest:basis.basisRegistryDigest,inputPackages:copy(basis.inputPackages),
   mappings:basis.mappings.map(m=>({id:m.id,representationId:m.representationId,sourceScopeHash:m.sourceScopeHash,apiAvailability:'confirmed-source-api',representationStatus:'draft',profileId:null,profileAcceptance:'not-accepted',parity:'not-confirmed',acceptance:'not-run'})),apiEvidenceDigest:basis.apiEvidenceDigest};
  const preflight={schemaVersion:'apollo.code-connect.static-review-preflight.v1-draft',status:'draft',executionAllowed:false,generationWireSupport:'not-supported',sourceReadiness:'blocked',targets:{figma:'blocked',frontend:'blocked'},
   diagnostics:[{code:'STATIC_PROTOCOL_DRAFT'},{code:'GENERATION_STATIC_SOURCE_REVIEW_UNSUPPORTED'},{code:h.code,message:h.message},{code:'SOURCE_NOT_READY'},{code:'CODE_PROFILE_UNACCEPTED'},{code:'FIGMA_NATIVE_BINDING_UNACCEPTED'},
    {code:'STATIC_CANONICAL_CROSSWALK_MISSING'},{code:'STATIC_WIDTH_FACTS_MISSING'},{code:'STATIC_CONTEXT_RECEIPTS_UNACCEPTED'},...spec.unresolved.map(()=>({code:'SCREEN_UNRESOLVED'})),...diagnostics]};
  const expected={schemaVersion:'apollo.code-connect.static-content.v1-draft',status:'draft',accepted:false,executionAllowed:false,apiExpressibility:intent?'bounded-content-expressible':'not-supported',targetSupport:{figma:'not-supported',frontend:'not-supported'},
   inputHash:hash(spec),planHash:hash(plan),plan,contentHash:hash(content),content:copy(content),apiIntent:intent,diagnostics,observation:Object.assign({},observation,{observationHash:hash(observation)}),generationSourceRead:copy(h),generationPreflight:preflight,gaps};
  // Reconstructing the entire document closes every nested field, including authority/provenance and unsupported interactive additions.
  if(hash(input)!==hash(expected))return reject('REVIEW_PRODUCER_CONTENT_MISMATCH');
  result.consumerMismatches=copy(basis.consumerMismatches);const stale=result.consumerMismatches.length>0||hash(h.identity)!==hash(basis.sourceReview.identity);
  result.importStatus=stale?'stale':'inspected';result.producerPlanHash=expected.planHash;result.producerContentHash=expected.contentHash;result.producerObservationHash=expected.observation.observationHash;
  result.historicalContent=copy(content);result.historicalApiIntent=copy(intent);result.apiExpressibility=intent?'bounded-content-expressible':'not-supported';result.sourceReview=copy(basis.sourceReview);
  result.diagnostics=[{code:'REVIEW_ONLY'},{code:stale?'REVIEW_CONSUMER_STALE':'REVIEW_BINDINGS_MATCH'},...diagnostics,{code:'SOURCE_NOT_READY'},{code:'STATIC_TARGET_UNSUPPORTED'}];return result;
 }catch{return reject('REVIEW_INPUT_INVALID');}
}
