/** Pure H1 identity diagnostics, never actual runtime coverage or source admission. */
import { isPlainRecord, readDenseDataArray, validateComponentPin, type ComponentPin, type StructuralIssue, type Target } from './scenario-evidence-types';

export type ExecutionObligationV1 = Readonly<{
  sourceRuleId: string; irRuleId: string; componentPin: ComponentPin;
  target: Target; representationId: string; rootSubjectId: string; slotTargetId: string;
  canonicalBindingPath: ReadonlyArray<string>; subjectId: string; stateId: string;
  sessionId: string; evaluationId: string; subscope: 'root' | 'item' | 'event' | 'transition' | 'dependency';
}>;
export type StructuralResultV1 = Readonly<{
  obligation: ExecutionObligationV1; evidenceRefs: ReadonlyArray<Readonly<{ path: string; sha256: string }>>;
  observation: 'submitted' | 'unknown';
}>;
export type StructuralCoverage = Readonly<{
  structuralStatus: 'matched' | 'mismatched' | 'invalid'; issues: ReadonlyArray<StructuralIssue>;
  expectedCount: number; submittedCount: number; authority: 'unverified'; actualCoverage: 'unknown';
}>;
function own(value: object, key: PropertyKey): boolean { return Object.prototype.hasOwnProperty.call(value,key); }
const fields = ['sourceRuleId','irRuleId','componentPin','target','representationId','rootSubjectId','slotTargetId',
  'canonicalBindingPath','subjectId','stateId','sessionId','evaluationId','subscope'] as const;
function issue(issues: StructuralIssue[],code: string,path: string,message: string): void { issues.push({code,path,message}); }
function closedRecord(value: unknown,keys: ReadonlyArray<string>,path: string,issues: StructuralIssue[]): value is Record<string,unknown> {
  const before=issues.length;
  if (!isPlainRecord(value)) { issue(issues,'RECORD_REQUIRED',path,'Expected a closed plain data record.'); return false; }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if (typeof key!=='string'||!keys.includes(key)) issue(issues,'EXTRA_FIELD',path+'/'+String(key),'Unaccepted field, outcome or authority flag.');
    else if (!descriptor?.enumerable||!own(descriptor,'value')) issue(issues,'DATA_PROPERTY_REQUIRED',path+'/'+key,'No accessors or hidden properties.');
  }
  for (const key of keys) if (!own(value,key)) issue(issues,'MISSING_FIELD',path+'/'+key,'All identity dimensions are explicit.');
  return issues.length===before;
}
export function validateExecutionObligation(value: unknown): ReadonlyArray<StructuralIssue> {
  const issues: StructuralIssue[]=[];
  if (!closedRecord(value,fields,'',issues) || issues.length) return issues;
  for (const key of fields) if (key!=='componentPin'&&key!=='canonicalBindingPath') {
    const v=value[key]; if (typeof v!=='string'||!v.trim()) issue(issues,'IDENTITY_REQUIRED','/'+key,'No omitted/null/default identity.');
  }
  issues.push(...validateComponentPin(value.componentPin).map(x=>({code:x.code,path:'/componentPin'+x.path,message:x.message})));
  if (typeof value.target!=='string'||!['figma','frontend'].includes(value.target)) issue(issues,'TARGET_REQUIRED','/target','Unsupported target.');
  if (typeof value.subscope!=='string'||!['root','item','event','transition','dependency'].includes(value.subscope)) issue(issues,'SUBSCOPE_REQUIRED','/subscope','Unsupported subscope.');
  const path=readDenseDataArray(value.canonicalBindingPath,'/canonicalBindingPath');issues.push(...path.issues);
  if (path.values && (!path.values.length||path.values.some(x=>typeof x!=='string'||!x.trim()))) issue(issues,'BINDING_PATH_REQUIRED','/canonicalBindingPath','Explicit source-qualified root/binding path required.');
  return issues;
}
/** JSON tuple avoids delimiter aliases; this is identity only, never authority. */
export function executionObligationKey(value: ExecutionObligationV1): string {
  const errors=validateExecutionObligation(value);
  if (errors.length) throw new Error('INVALID_EXECUTION_OBLIGATION');
  const p=value.componentPin;
  return JSON.stringify([value.sourceRuleId,value.irRuleId,[p.componentId,p.revision,p.manualByteSha256,p.manualSourceHash,p.compiledHash],
    value.target,value.representationId,value.rootSubjectId,value.slotTargetId,value.canonicalBindingPath,
    value.subjectId,value.stateId,value.sessionId,value.evaluationId,value.subscope]);
}
function validateResult(value: unknown): ReadonlyArray<StructuralIssue> {
  const issues: StructuralIssue[]=[];
  if (!closedRecord(value,['obligation','evidenceRefs','observation'],'',issues)||issues.length) return issues;
  issues.push(...validateExecutionObligation(value.obligation).map(x=>({code:x.code,path:'/obligation'+x.path,message:x.message})));
  if (value.observation!=='submitted'&&value.observation!=='unknown') issue(issues,'OBSERVATION_REQUIRED','/observation','A result cannot declare PASS/NA/trust.');
  const refs=readDenseDataArray(value.evidenceRefs,'/evidenceRefs');issues.push(...refs.issues);
  if (refs.values && !refs.values.length) issue(issues,'EVIDENCE_REFS_REQUIRED','/evidenceRefs','Explicit original evidence references required.');
  if (refs.values) for (let i=0;i<refs.values.length;i++) {
    const r=refs.values[i],path='/evidenceRefs/'+i;
    if (!closedRecord(r,['path','sha256'],path,issues)) continue;
    if (typeof r.path!=='string'||!r.path.trim()||typeof r.sha256!=='string'||!/^[a-f0-9]{64}$/.test(r.sha256)) issue(issues,'EVIDENCE_PIN_REQUIRED',path,'Malformed evidence reference.');
  }
  return issues;
}
/** Caller supplies its complete expected source-derived multiset separately.
 * H1 cannot prove that expected descriptors themselves enumerate the real source. */
export function validateExecutionCoverage(expected: unknown,submitted: unknown): StructuralCoverage {
  const issues: StructuralIssue[]=[];
  const expectedData=readDenseDataArray(expected,'/expected'),submittedData=readDenseDataArray(submitted,'/submitted');
  issues.push(...expectedData.issues,...submittedData.issues);
  if (!expectedData.values || !expectedData.values.length || !submittedData.values) {
    issue(issues,'EXPLICIT_DOMAINS_REQUIRED','','Expected nonempty independent descriptors and submitted result array.');
    return {structuralStatus:'invalid',issues,expectedCount:expectedData.declaredLength,submittedCount:submittedData.declaredLength,authority:'unverified',actualCoverage:'unknown'};
  }
  expectedData.values.forEach((x,i)=>issues.push(...validateExecutionObligation(x).map(v=>({code:v.code,path:'/expected/'+i+v.path,message:v.message}))));
  submittedData.values.forEach((x,i)=>issues.push(...validateResult(x).map(v=>({code:v.code,path:'/submitted/'+i+v.path,message:v.message}))));
  if (issues.length) return {structuralStatus:'invalid',issues,expectedCount:expectedData.declaredLength,submittedCount:submittedData.declaredLength,authority:'unverified',actualCoverage:'unknown'};
  const descriptors=expectedData.values as ExecutionObligationV1[],results=submittedData.values as StructuralResultV1[];
  const expectedMap=new Map<string,number>(),submittedMap=new Map<string,number>();
  const subjects=new Map<string,string>(),canonicalSubjects=new Map<string,string>();
  for (const [index,descriptor] of descriptors.entries()) {
    const key=executionObligationKey(descriptor); expectedMap.set(key,(expectedMap.get(key)||0)+1);
    // Across different rules for one occurrence, a subject is expected to be reused.
    // Across different canonical source paths in one root/state/session, it is not.
    const subject=JSON.stringify([descriptor.target,descriptor.representationId,descriptor.rootSubjectId,descriptor.subjectId,descriptor.stateId,descriptor.sessionId,descriptor.evaluationId]);
    const canonical=JSON.stringify(descriptor.canonicalBindingPath);
    const canonicalScope=JSON.stringify([descriptor.target,descriptor.representationId,descriptor.rootSubjectId,descriptor.stateId,descriptor.sessionId,descriptor.evaluationId,descriptor.canonicalBindingPath]);
    const priorSubject=canonicalSubjects.get(canonicalScope);
    if (priorSubject!==undefined&&priorSubject!==descriptor.subjectId) issue(issues,'EXPECTED_CANONICAL_CONFLICT','/expected/'+index,'One canonical source path points to contradictory subjects.');
    canonicalSubjects.set(canonicalScope,descriptor.subjectId);
    const prior=subjects.get(subject);
    if (prior!==undefined&&prior!==canonical) issue(issues,'EXPECTED_SUBJECT_ALIAS','/expected/'+index,'Different canonical source occurrences share one original subject.');
    subjects.set(subject,canonical);
  }
  for (const result of results) {
    const key=executionObligationKey(result.obligation); submittedMap.set(key,(submittedMap.get(key)||0)+1);
  }
  for (const [key,count] of expectedMap) {
    if (count!==1) issue(issues,'DUPLICATE_EXPECTED','','Expected obligation identity is duplicated.');
    const actual=submittedMap.get(key)||0;
    if (actual===0) issue(issues,'MISSING_RESULT','','An exact occurrence/target/state/source obligation is missing.');
    if (actual>1) issue(issues,'DUPLICATE_RESULT','','One exact obligation has multiple submitted results.');
  }
  for (const [key,count] of submittedMap) {
    if (!expectedMap.has(key)) issue(issues,'FOREIGN_RESULT','','Wrong source pin/target/occurrence/state/session or unclaimed obligation.');
    if (count>1&&!expectedMap.has(key)) issue(issues,'DUPLICATE_RESULT','','Foreign result is duplicated.');
  }
  // Intentionally no status/Ready/coverage trust fields can be accepted from the host.
  return {structuralStatus:issues.length?'mismatched':'matched',issues,expectedCount:descriptors.length,
    submittedCount:results.length,authority:'unverified',actualCoverage:'unknown'};
}
