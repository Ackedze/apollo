import { createHash } from 'node:crypto';
import type { ValidationIssue } from '../../../component-contract-core/src/types';
import { PackageLoadError } from './packages';
import type { Archive, AuthoringSource, RuntimeIdentity, SourceRuntime, ZipReader, PackageLock } from './packages';
export type AuthoringReviewRow = {
  componentId:string;contractId:string;revision:number;manualSourceHash:string;factsHash:string;sourceHash:string;compiledHash:string;
  compiledStatus:'ready'|'draft';sourceExportVersion:string;issues:ValidationIssue[];
  coverage:{predicateRuleIds:string[];pendingRoutes:Array<{ruleId:string;route:string}>;nonExecutableRuleIds:string[]};
  dependencies:PackageLock['packages'][number]['dependencies'];
};
export type AuthoringSourceReview = {schemaVersion:'apollo.authoring-source-review.v1-draft';status:'draft';accepted:false;executionAllowed:false;rootComponentId:string;components:AuthoringReviewRow[]};
export type ReviewSourcePin = {componentId:string;contractId:string;revision:number;archivePath:string;archiveSha256:string;manualPath:string;mainManualSha256:string;manualSourceHash:string;compiledHash:string;dependencyPins:Array<{componentId:string;revision:number;manualSourceHash:string;compiledHash:string}>};
export type ReviewArchive = Archive & {archivePath:string;main:{path:string;bytes:Uint8Array}};
export type AuthoringPackageReview = {
  schemaVersion:'apollo.authoring-package-review.v1-draft';status:'draft';accepted:false;executionAllowed:false;identity:RuntimeIdentity;
  sources:Array<{archive:string;archivePath:string;archiveSha256:string;mainPath:string;mainSha256:string;metadata:AuthoringReviewRow;projectionEvidence:PackageLock['packages'][number]['projectionEvidence']}>;
  reviewHash:string;
};
export type AuthoringReviewRuntime = Pick<SourceRuntime,'RUNTIME_VERSION'|'contractHash'|'sourceFromFiles'> & {reviewAuthoringSource(source:AuthoringSource):AuthoringSourceReview};
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const validHash=(s:unknown)=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const safe=(s:string)=>typeof s==='string'&&!!s&&!s.includes('\\')&&!s.startsWith('/')&&!/^[a-z]:/i.test(s)&&!s.split('/').some(p=>!p||p==='.'||p==='..');
function fail(code:string):never{throw new PackageLoadError(code,'Authoring Draft review inputs failed exact source/closure checks.');}
/** Separate metadata reader. It cannot supply a runtime inventory or Generation lock. */
export async function readAuthoringPackageReview(archives:ReviewArchive[],pins:ReviewSourcePin[],ports:{runtime:AuthoringReviewRuntime;readZip:ZipReader;identity:RuntimeIdentity}):Promise<AuthoringPackageReview>{
  const {runtime,identity}=ports;
  if(!archives.length||archives.length>32||archives.length!==pins.length||new Set(pins.map(p=>p.componentId)).size!==pins.length||identity.profileVersion!==runtime.RUNTIME_VERSION||!identity.coreVersion||!validHash(identity.runtimeSha256)||!validHash(identity.buildInputsSha256))fail('REVIEW_IDENTITY');
  const decoder=new TextDecoder('utf-8',{fatal:true}),records=new Map<string,{archive:ReviewArchive;archiveSha256:string;source:AuthoringSource;pin:ReviewSourcePin;projectionEvidence:PackageLock['packages'][number]['projectionEvidence']}>();
  const caches:Array<{archive:string;entry:string;contract:any}>=[];
  function cache(c:any,archive:string,entry:string,depth=0){if(c?.documentType!=='component-contract')return;if(depth>4||caches.length>=128||!c.package?.componentId||!validHash(c.package.manualSourceHash))fail('REVIEW_CACHE_IDENTITY');caches.push({archive,entry,contract:c});for(const child of c.componentDependencies||[])cache(child.contract,archive,entry+'#'+child.id,depth+1);}
  const names=new Set<string>();
  for(const archive of archives.slice().sort((a,b)=>a.name.localeCompare(b.name))){
    if(!safe(archive.name)||!archive.name.endsWith('.zip')||names.has(archive.name)||!safe(archive.archivePath)||!safe(archive.main.path)||archive.bytes.length>64*1024*1024||archive.main.bytes.length>16*1024*1024)fail('REVIEW_ARCHIVE_INPUT');names.add(archive.name);
    const pin=pins.find(p=>p.archivePath===archive.archivePath);if(!pin||sha(archive.bytes)!==pin.archiveSha256||archive.main.path!==pin.manualPath||sha(archive.main.bytes)!==pin.mainManualSha256)fail('REVIEW_SOURCE_STALE');
    const entries=await ports.readZip(archive.bytes),seen=new Set<string>();if(entries.length>200||entries.reduce((n,e)=>n+e.data.length,0)>128*1024*1024)fail('REVIEW_ENTRY_LIMIT');
    const files:Array<{name:string;text:string}>=[];
    for(const e of entries){if(!safe(e.name)||seen.has(e.name))fail('REVIEW_ENTRY_NAME');seen.add(e.name);if(e.name.endsWith('.json')){const text=decoder.decode(e.data);cache(JSON.parse(text),archive.name,e.name);files.push({name:e.name,text});}}
    const source=runtime.sourceFromFiles(files),main=JSON.parse(decoder.decode(archive.main.bytes));
    if(source.manual.component.componentId!==pin.componentId||source.manual.component.contractId!==pin.contractId||source.manual.metadata.revision!==pin.revision||runtime.contractHash(main)!==runtime.contractHash(source.manual)||runtime.contractHash(main)!==pin.manualSourceHash||records.has(pin.componentId))fail('REVIEW_MAIN_MISMATCH');
    if(runtime.contractHash((source.manual.componentDependencies||[]).map(p=>({componentId:p.componentId,revision:p.revision,manualSourceHash:p.manualSourceHash,compiledHash:p.compiledHash})))!==runtime.contractHash(pin.dependencyPins))fail('REVIEW_DEPENDENCY_PIN');
    records.set(pin.componentId,{archive,archiveSha256:sha(archive.bytes),source,pin,projectionEvidence:[]});
  }
  for(const [id,r] of records){
    const candidates=caches.filter(c=>c.contract.package.componentId===id),matching=candidates.filter(c=>c.contract.package.manualSourceHash===r.pin.manualSourceHash);
    if(candidates.some(c=>c.archive===r.archive.name&&c.contract.package.manualSourceHash!==r.pin.manualSourceHash))fail('REVIEW_CACHE_STALE');
    if(new Set(matching.map(c=>runtime.contractHash(c.contract))).size>1)fail('REVIEW_CACHE_CONFLICT');
    if(matching.length){r.source.projectionStamp={sourceExportVersion:matching[0].contract.package.sourceExportVersion,compiledHash:runtime.contractHash(matching[0].contract)};r.projectionEvidence=matching.map(c=>({archive:c.archive,entry:c.entry,compiledHash:runtime.contractHash(c.contract)}));}
  }
  const linked=new Set<string>();
  function link(id:string,path:Set<string>):AuthoringSource{
    const r=records.get(id);if(!r)fail('REVIEW_DEPENDENCY_MISSING');if(path.has(id)||path.size>4)fail('REVIEW_DEPENDENCY_CYCLE');if(linked.has(id))return r.source;
    const next=new Set(path);next.add(id);
    r.source.dependencies=Array.from(new Set((r.source.manual.componentDependencies||[]).map(p=>p.componentId))).map(id=>link(id,next));linked.add(id);return r.source;
  }
  for(const id of records.keys())link(id,new Set());
  const sources:AuthoringPackageReview['sources']=[];
  for(const [id,r] of Array.from(records).sort(([a],[b])=>a.localeCompare(b))){
    const reviewed=runtime.reviewAuthoringSource(r.source);
    if(reviewed.schemaVersion!=='apollo.authoring-source-review.v1-draft'||reviewed.status!=='draft'||reviewed.accepted!==false||reviewed.executionAllowed!==false||reviewed.rootComponentId!==id)fail('REVIEW_RUNTIME_RESULT');
    const m=reviewed.components.find(c=>c.componentId===id);if(!m||m.compiledHash!==r.pin.compiledHash||m.manualSourceHash!==r.pin.manualSourceHash||m.revision!==r.pin.revision||!['ready','draft'].includes(m.compiledStatus))fail('REVIEW_COMPILE_STALE');
    for(const d of m.dependencies){const child=reviewed.components.find(c=>c.componentId===d.componentId);if(!child||child.revision!==d.revision||child.manualSourceHash!==d.manualSourceHash||child.compiledHash!==d.compiledHash)fail('REVIEW_DEPENDENCY_PIN');}
    sources.push({archive:r.archive.name,archivePath:r.archive.archivePath,archiveSha256:r.archiveSha256,mainPath:r.archive.main.path,mainSha256:sha(r.archive.main.bytes),metadata:m,projectionEvidence:r.projectionEvidence});
  }
  const value={schemaVersion:'apollo.authoring-package-review.v1-draft',status:'draft',accepted:false,executionAllowed:false,identity,sources} as const;
  return JSON.parse(JSON.stringify(Object.assign({},value,{reviewHash:runtime.contractHash(value)})));
}
