// Neutral synthetic records only. No actual captures, source manuals or trust fixtures.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
let moduleDir = process.env.APOLLO_SCENARIO_BOUNDARY_MODULE_DIR;
let ownTemporaryOutput = null;
if (!moduleDir) {
  ownTemporaryOutput = fs.mkdtempSync(path.join(process.env.APOLLO_SCENARIO_BOUNDARY_TEMP_ROOT || os.tmpdir(), 'apollo-scenario-boundary-'));
  const config = path.join(ownTemporaryOutput, 'tsconfig.json');
  fs.writeFileSync(config, JSON.stringify({ compilerOptions: { target: 'ES2020', module: 'CommonJS', strict: true,
    exactOptionalPropertyTypes: true, noUncheckedIndexedAccess: true, types: [], outDir: ownTemporaryOutput },
    files: ['scenario-evidence-types.ts', 'execution-obligations.ts'].map(name => path.resolve(__dirname, '../src', name)) }));
  execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--project', config], { stdio: 'pipe' });
  moduleDir = ownTemporaryOutput;
}
test.after(() => { if (ownTemporaryOutput) fs.rmSync(ownTemporaryOutput, { recursive: true, force: true }); });
const raw = require(path.join(moduleDir, 'scenario-evidence-types.js'));
const coverage = require(path.join(moduleDir, 'execution-obligations.js'));
const clone = value => JSON.parse(JSON.stringify(value));
const ref = () => ({ path: 'synthetic/source.json', sha256: '1'.repeat(64) });
const pin = () => ({ componentId: 'synthetic.component', revision: 1, manualByteSha256: '2'.repeat(64),
  manualSourceHash: '3'.repeat(64), compiledHash: '4'.repeat(64) });
const producer = () => ({ id: 'synthetic.observer', version: 1, pin: ref(), target: 'figma' });
function scope() {
  return { evaluationId: 'evaluation-neutral', target: 'figma', rootSubjectId: 'root-neutral', snapshotId: 'snapshot-neutral',
    representationId: 'representation-neutral', variantIdentity: 'variant-neutral', platform: 'desktop',
    modes: [{ collectionId: 'collection-neutral', modeId: 'mode-neutral' }], stateId: 'default', sessionId: 'session-neutral',
    sourceVector: [pin()], requestHash: '5'.repeat(64), producerVector: [producer()] };
}
const unknown = () => ({ state: 'unknown', reasons: ['not-observed'], scope: scope() });
const known = value => ({ state: 'known', value, scope: scope(), rawEvidenceRefs: [ref()], producerRef: producer(), enumerationRef: ref() });
function evidence() {
  return { schemaVersion: 'apollo.scenario-evidence.v1-draft', scope: scope(),
    actions: { identity: unknown(), priority: unknown(), visibleOrder: unknown(), beforeTransfer: unknown(), transferSequence: unknown(),
      sourceContent: unknown(), visibleIdentity: unknown(), disabled: unknown() },
    trigger: { activations: unknown(), intent: unknown() },
    overflow: { openOutcomes: unknown(), container: unknown(), items: { identity: unknown(), labels: unknown(), icons: unknown(), disabled: unknown() },
      hovers: unknown(), tooltipOutcomes: unknown(), selections: unknown(), beforeSelection: unknown(), afterSelection: unknown() },
    platform: unknown(), loading: { visibleButtons: unknown(), selectedOverflowApi: unknown(), buttonClosure: unknown() },
    canonical: unknown(), applicability: unknown(), overflowDomain: unknown(),
    correspondences: { container: unknown(), renderer: unknown(), tooltip: unknown() }, reasonAuthorities: unknown(),
    immediacyAuthority: unknown(), captureContext: unknown(), eventEnumeration: unknown(), loadingDependencyEvidence: unknown(),
    pendingSourceChoices: { transferOrder: null, immediateBoundary: null, selectedRenderer: null, loadingProhibition: null } };
}
function canonical() {
  return Array.from({ length: 4 }, (_, i) => ({ bindingId: 'binding-' + i, occurrenceId: 'occurrence-' + i, targetSubjectId: 'subject-' + i,
    targetId: 'target-' + i, visible: known(i < 2), role: known(i < 2 ? 'business-action' : 'no-business-binding'),
    actionIdentity: known(i < 2 ? { kind: 'business-action', actionId: 'action-' + i } : { kind: 'source-absent', evidenceRef: ref() }), identityRef: ref() }));
}
function validSubmitted() {
  const e = evidence(); e.canonical = known(canonical()); e.platform = known('desktop');
  e.applicability = known({ rootSubjectId: 'root-neutral', platform: 'desktop', Overflow: false, sourceOverflowLiteral: 'false', transformRef: ref() });
  return e;
}
function obligation(i = 0) {
  return { sourceRuleId: 'synthetic.source-rule', irRuleId: 'synthetic.ir-rule', componentPin: pin(), target: 'figma',
    representationId: 'representation-neutral', rootSubjectId: 'root-neutral', slotTargetId: 'slot-neutral',
    canonicalBindingPath: ['root-neutral', 'binding-' + i], subjectId: 'subject-' + i, stateId: 'default', sessionId: 'session-neutral',
    evaluationId: 'evaluation-neutral', subscope: 'dependency' };
}
const result = o => ({ obligation: clone(o), evidenceRefs: [ref()], observation: 'submitted' });
const has = (value, code) => value.issues.some(x => x.code === code);
function invalidRaw(change, code) {
  const e = validSubmitted(); change(e); const r = raw.validateScenarioEvidence(e);
  assert.equal(r.structuralStatus, 'invalid'); assert.equal(r.authority, 'unverified');
  assert.equal(r.actualFacts, 'unknown'); if (code) assert.ok(has(r, code), JSON.stringify(r.issues));
}

test('an explicitly unknown complete raw shape stays unknown without operator context', () => {
  const r = raw.validateScenarioEvidence(evidence());
  assert.equal(r.structuralStatus, 'valid'); assert.equal(r.authority, 'unverified'); assert.equal(r.actualFacts, 'unknown');
});
test('submitted known canonical observations with two hidden memberships still grant no trust', () => {
  const r = raw.validateScenarioEvidence(validSubmitted());
  assert.equal(r.structuralStatus, 'valid'); assert.equal(r.authority, 'unverified'); assert.equal(r.actualFacts, 'unknown');
});
test('imported operator resolver, Ready, PASS and accepted fields are rejected', () => {
  for (const key of ['evaluationContext', 'accepted', 'sourceReady', 'PASS', 'satisfied']) invalidRaw(e => { e[key] = true; }, 'EXTRA_FIELD');
});
test('known union does not allow malformed or defaulted raw producer references', () => {
  invalidRaw(e => { delete e.platform.producerRef; }, 'MISSING_FIELD');
  invalidRaw(e => { e.platform.rawEvidenceRefs = []; }, 'ARRAY_DOMAIN');
  invalidRaw(e => { e.platform.producerRef.pin.sha256 = 'not-a-pin'; }, 'PIN_REQUIRED');
  invalidRaw(e => { e.platform.accepted = true; }, 'EXTRA_FIELD');
});
test('unknown union rejects a value/false default and requires explicit reasons', () => {
  invalidRaw(e => { e.actions.identity.value = false; }, 'EXTRA_FIELD');
  invalidRaw(e => { e.actions.identity.reasons = []; }, 'ARRAY_DOMAIN');
  invalidRaw(e => { e.actions.identity = null; }, 'RECORD_REQUIRED');
  invalidRaw(e => { e.actions.identity = { state: 'absent', scope: scope() }; }, 'TAG_REQUIRED');
});
test('missing logical observation cannot silently become false', () => {
  invalidRaw(e => { delete e.loading.selectedOverflowApi; }, 'MISSING_FIELD');
});
test('forged metadata inside source/API authority is outside the closed schema', () => {
  const authority = { source: ref(), revision: 1, ruleIds: ['synthetic.source-rule'], platform: 'desktop', target: 'figma',
    representationId: 'representation-neutral', conditionRef: ref(), reviewRef: ref(), accepted: true };
  invalidRaw(e => { e.correspondences.renderer = known(authority); }, 'EXTRA_FIELD');
});
test('source choices remain explicitly unresolved in H1', () => {
  for (const key of ['transferOrder', 'immediateBoundary', 'selectedRenderer', 'loadingProhibition']) invalidRaw(e => { e.pendingSourceChoices[key] = 'invented'; }, 'SOURCE_CHOICE_HELD');
});
test('foreign raw session, state and target scopes are rejected', () => {
  for (const [key, value] of [['sessionId', 'foreign'], ['stateId', 'loading'], ['target', 'frontend']]) invalidRaw(e => { e.platform.scope[key] = value; }, 'OBSERVATION_SCOPE_CONFLICT');
});
test('submitted producer identity must agree with the submitted finite vector without claiming actual provenance', () => {
  invalidRaw(e => { e.platform.producerRef.id = 'foreign'; }, 'PRODUCER_VECTOR_CONFLICT');
  invalidRaw(e => { e.scope.sourceVector.push(pin()); }, 'DUPLICATE_SCOPE_ID');
});
test('literal Overflow strings, explicit observed Boolean and platform cannot contradict', () => {
  invalidRaw(e => { e.applicability.value.Overflow = 'false'; }, 'BOOLEAN_REQUIRED');
  invalidRaw(e => { e.applicability.value.sourceOverflowLiteral = 'true'; }, 'APPLICABILITY_CONFLICT');
  invalidRaw(e => { e.platform.value = 'mobile-web'; }, 'PLATFORM_CONFLICT');
});
test('hidden canonical member cannot disappear or alias another Button', () => {
  invalidRaw(e => { e.canonical.value.pop(); }, 'ARRAY_DOMAIN');
  for (const key of ['occurrenceId', 'targetSubjectId', 'bindingId', 'targetId']) invalidRaw(e => { e.canonical.value[3][key] = e.canonical.value[0][key]; }, 'CANONICAL_ALIAS');
});
test('business role is not inferred from label/order and conflicts with source-absent identity are rejected', () => {
  invalidRaw(e => { e.canonical.value[0].actionIdentity = known({ kind: 'source-absent', evidenceRef: ref() }); }, 'ACTION_ROLE_CONFLICT');
});
test('wrong source membership cannot claim a complete overflow domain', () => {
  invalidRaw(e => { e.overflowDomain = known({ sourceOccurrenceIds: ['occurrence-0', 'occurrence-1', 'occurrence-2', 'foreign'],
    transferredOccurrenceIds: [], items: [], triggerOccurrenceId: unknown(), container: unknown(), captureRef: ref(), enumerationEvidenceRefs: [ref()] }); }, 'SOURCE_MEMBERSHIP_CONFLICT');
});
test('actual empty label is representable raw text, not a source rule decision', () => {
  const e = validSubmitted(); e.actions.sourceContent = known([{ occurrenceId: 'occurrence-0', subjectId: 'subject-0', actionId: 'action-0', label: '', iconPresent: false }]);
  assert.equal(raw.validateScenarioEvidence(e).structuralStatus, 'valid');
});
test('submitted action content cannot borrow another canonical subject or ActionID', () => {
  invalidRaw(e => { e.actions.sourceContent = known([{ occurrenceId:'occurrence-0',subjectId:'subject-1',actionId:'action-0',label:'neutral',iconPresent:false }]); }, 'ACTION_SOURCE_CONFLICT');
  invalidRaw(e => { e.actions.sourceContent = known([{ occurrenceId:'occurrence-0',subjectId:'subject-0',actionId:'action-1',label:'neutral',iconPresent:false }]); }, 'ACTION_IDENTITY_CONFLICT');
});
test('a submitted owned container cannot point at a foreign root', () => {
  invalidRaw(e => { e.overflow.container=known({subjectId:'container-neutral',ownerRootSubjectId:'foreign-root',identityRef:ref(),rendererProfileRef:ref()}); }, 'CONTAINER_OWNER_CONFLICT');
});
test('sequence zero is representable but foreign causal-event context is rejected', () => {
  const event = { eventId: 'event-neutral', sequence: 0, sessionId: 'session-neutral', snapshotId: 'snapshot-neutral', subjectId: 'subject-0', causedBy: unknown(), context: scope() };
  const e = validSubmitted(); e.trigger.activations = known([event]); assert.equal(raw.validateScenarioEvidence(e).structuralStatus, 'valid');
  event.sessionId = 'foreign'; assert.ok(has(raw.validateScenarioEvidence(e), 'EVENT_SCOPE_CONFLICT'));
});
test('accessors and cyclical data are rejected without invoking imported getters', () => {
  let called = false; const e = validSubmitted();
  Object.defineProperty(e.platform, 'producerRef', { enumerable: true, get() { called = true; throw Error('unsafe'); } });
  const r = raw.validateScenarioEvidence(e); assert.equal(r.structuralStatus, 'invalid'); assert.equal(called, false);
  const cyclic = evidence(); cyclic.actions.identity.scope = cyclic;
  assert.equal(raw.validateScenarioEvidence(cyclic).structuralStatus, 'invalid');
});
test('all full obligation identity dimensions distinguish source/target/occurrence/state', () => {
  const original = obligation(), key = coverage.executionObligationKey(original);
  for (const field of ['sourceRuleId', 'irRuleId', 'representationId', 'rootSubjectId', 'slotTargetId', 'subjectId', 'stateId', 'sessionId', 'evaluationId', 'subscope']) {
    const changed = clone(original); changed[field] = field === 'subscope' ? 'item' : 'other';
    assert.notEqual(coverage.executionObligationKey(changed), key, field);
  }
  for (const field of ['manualByteSha256', 'manualSourceHash', 'compiledHash']) {
    const changed = clone(original); changed.componentPin[field] = '9'.repeat(64); assert.notEqual(coverage.executionObligationKey(changed), key, field);
  }
  const differentTarget = clone(original); differentTarget.target = 'frontend'; assert.notEqual(coverage.executionObligationKey(differentTarget), key);
  assert.notEqual(coverage.executionObligationKey(obligation(1)), key);
});
test('tuple JSON avoids delimiter aliases and object property ordering does not alter identity', () => {
  const a = obligation(); a.canonicalBindingPath = ['root|one', 'two']; const b = clone(a); b.canonicalBindingPath = ['root', 'one|two'];
  assert.notEqual(coverage.executionObligationKey(a), coverage.executionObligationKey(b));
  const reordered = Object.fromEntries(Object.entries(a).reverse()); reordered.componentPin = Object.fromEntries(Object.entries(a.componentPin).reverse());
  assert.equal(coverage.executionObligationKey(a), coverage.executionObligationKey(reordered));
});
test('exact independent descriptors match structurally but actual coverage stays unknown', () => {
  const expected = Array.from({ length: 4 }, (_, i) => obligation(i));
  const r = coverage.validateExecutionCoverage(expected, expected.map(result).reverse());
  assert.equal(r.structuralStatus, 'matched'); assert.equal(r.authority, 'unverified'); assert.equal(r.actualCoverage, 'unknown');
});
test('a caller-supplied narrowed expected domain is never proof of complete source coverage', () => {
  const r = coverage.validateExecutionCoverage([obligation()], [result(obligation())]);
  assert.equal(r.structuralStatus,'matched'); assert.equal(r.actualCoverage,'unknown'); assert.equal(r.authority,'unverified');
});
test('one component RuleID result cannot cover two visible Buttons', () => {
  const r = coverage.validateExecutionCoverage([obligation(0), obligation(1)], [result(obligation(0))]);
  assert.equal(r.structuralStatus, 'mismatched'); assert.ok(has(r, 'MISSING_RESULT'));
});
test('all four descriptors remain required, including the two hidden memberships', () => {
  const expected = Array.from({ length: 4 }, (_, i) => obligation(i));
  const r = coverage.validateExecutionCoverage(expected, expected.slice(0, 2).map(result));
  assert.equal(r.structuralStatus, 'mismatched'); assert.equal(r.issues.filter(x => x.code === 'MISSING_RESULT').length, 2);
});
test('duplicate expected descriptors and duplicate submitted results are rejected', () => {
  assert.ok(has(coverage.validateExecutionCoverage([obligation(), obligation()], [result(obligation())]), 'DUPLICATE_EXPECTED'));
  assert.ok(has(coverage.validateExecutionCoverage([obligation()], [result(obligation()), result(obligation())]), 'DUPLICATE_RESULT'));
});
test('foreign, state-swapped, stale-source and wrong-target results cannot satisfy an obligation', () => {
  for (const field of ['subjectId', 'stateId', 'sessionId', 'representationId']) {
    const changed = obligation(); changed[field] = 'foreign'; const r = coverage.validateExecutionCoverage([obligation()], [result(changed)]);
    assert.ok(has(r, 'MISSING_RESULT')); assert.ok(has(r, 'FOREIGN_RESULT'));
  }
  const stale = obligation(); stale.componentPin.compiledHash = '8'.repeat(64);
  assert.ok(has(coverage.validateExecutionCoverage([obligation()], [result(stale)]), 'FOREIGN_RESULT'));
  const foreign = obligation(); foreign.target = 'frontend'; assert.ok(has(coverage.validateExecutionCoverage([obligation()], [result(foreign)]), 'FOREIGN_RESULT'));
});
test('different canonical occurrences cannot alias one subject, or one path point to two subjects', () => {
  const a = obligation(0), b = obligation(1); b.subjectId = a.subjectId;
  assert.ok(has(coverage.validateExecutionCoverage([a, b], [result(a), result(b)]), 'EXPECTED_SUBJECT_ALIAS'));
  const c = obligation(0); c.subjectId = 'foreign'; c.irRuleId = 'another-rule';
  assert.ok(has(coverage.validateExecutionCoverage([a, c], [result(a), result(c)]), 'EXPECTED_CANONICAL_CONFLICT'));
});
test('different rules or source slot aliases may legitimately evaluate the same canonical subject', () => {
  const a = obligation(), b = obligation(); b.irRuleId = 'another-rule'; b.sourceRuleId = 'another-source'; b.slotTargetId = 'another-slot';
  assert.equal(coverage.validateExecutionCoverage([a, b], [result(a), result(b)]).structuralStatus, 'matched');
});
test('forged PASS, NA, Ready and accepted result fields cannot establish trust', () => {
  for (const key of ['status', 'accepted', 'sourceReady', 'satisfied', 'actualCoverage']) {
    const forged = result(obligation()); forged[key] = key === 'status' ? 'passed' : true;
    const r = coverage.validateExecutionCoverage([obligation()], [forged]); assert.equal(r.structuralStatus, 'invalid'); assert.ok(has(r, 'EXTRA_FIELD'));
  }
});
test('malformed identity/reference, empty expected domain and missing results cannot be vacuous PASS', () => {
  const malformed = result(obligation()); malformed.evidenceRefs[0].sha256 = 'bad';
  assert.equal(coverage.validateExecutionCoverage([obligation()], [malformed]).structuralStatus, 'invalid');
  assert.equal(coverage.validateExecutionCoverage([], []).structuralStatus, 'invalid');
  assert.ok(has(coverage.validateExecutionCoverage([obligation()], []), 'MISSING_RESULT'));
  const noPath = obligation(); noPath.canonicalBindingPath = []; assert.throws(() => coverage.executionObligationKey(noPath), /INVALID_EXECUTION_OBLIGATION/);
});
test('result reference accessors cannot execute inside the structural matcher', () => {
  let called = false; const r = result(obligation()); Object.defineProperty(r.evidenceRefs[0], 'path', { enumerable: true,
    get() { called = true; throw Error('unsafe'); } });
  assert.equal(coverage.validateExecutionCoverage([obligation()], [r]).structuralStatus, 'invalid'); assert.equal(called, false);
});

function rejectedDataProbe(make) {
  let calls=0,value;
  const imported=()=>{ calls++; throw Error('imported function must not run'); };
  assert.doesNotThrow(()=>{ value=make(imported); });
  assert.equal(calls,0);
  if (Array.isArray(value)) assert.ok(value.length>0,'explicit invalid diagnostics');
  else { assert.equal(value.structuralStatus,'invalid'); assert.equal(value.authority,'unverified'); }
}
test('R1 sparse canonical path is rejected before iteration or key construction',()=>rejectedDataProbe(()=>{
  const o=obligation();o.canonicalBindingPath=new Array(1);return coverage.validateExecutionObligation(o);
}));
test('R1 sparse expected domain returns invalid diagnostics without throwing',()=>rejectedDataProbe(()=>coverage.validateExecutionCoverage(new Array(1),[])));
test('R1 sparse submitted domain returns invalid diagnostics without throwing',()=>rejectedDataProbe(()=>coverage.validateExecutionCoverage([obligation()],new Array(1))));
test('R1 canonical path index getter is rejected without invocation',()=>rejectedDataProbe(imported=>{
  const o=obligation();Object.defineProperty(o.canonicalBindingPath,'0',{enumerable:true,get:imported});return coverage.validateExecutionObligation(o);
}));
test('R1 submitted-domain index getter is rejected without invocation',()=>rejectedDataProbe(imported=>{
  const a=[result(obligation())];Object.defineProperty(a,'0',{enumerable:true,get:imported});return coverage.validateExecutionCoverage([obligation()],a);
}));
test('R1 raw source-vector index getter is rejected without invocation',()=>rejectedDataProbe(imported=>{
  const s=scope();Object.defineProperty(s.sourceVector,'0',{enumerable:true,get:imported});return raw.validateScenarioScope(s);
}));
test('R1 raw modes array cannot carry an accepted authority flag',()=>rejectedDataProbe(()=>{
  const s=scope();s.modes.accepted=true;return raw.validateScenarioScope(s);
}));
test('R1 canonical path array cannot carry a PASS flag',()=>rejectedDataProbe(()=>{
  const o=obligation();o.canonicalBindingPath.PASS=true;return coverage.validateExecutionObligation(o);
}));
test('R1 evidenceRefs array index getter is rejected without invocation',()=>rejectedDataProbe(imported=>{
  const r=result(obligation());Object.defineProperty(r.evidenceRefs,'0',{enumerable:true,get:imported});return coverage.validateExecutionCoverage([obligation()],[r]);
}));
test('R1 identical sparse canonical paths cannot produce a structural match',()=>rejectedDataProbe(()=>{
  const o=obligation();o.canonicalBindingPath=new Array(1);return coverage.validateExecutionCoverage([o],[{obligation:o,evidenceRefs:[ref()],observation:'submitted'}]);
}));
test('R1 object-valued target never invokes imported toString or valueOf',()=>rejectedDataProbe(imported=>{
  const o=obligation();o.target={toString:imported,valueOf:imported};return coverage.validateExecutionObligation(o);
}));
test('R1 object-valued subscope never invokes imported toString or valueOf',()=>rejectedDataProbe(imported=>{
  const o=obligation();o.subscope={toString:imported,valueOf:imported};return coverage.validateExecutionObligation(o);
}));
test('R1 hidden and symbol array fields are rejected across raw, paths and result domains',()=>{
  for (const field of ['hidden',Symbol('authority')]) {
    rejectedDataProbe(()=>{const s=scope();Object.defineProperty(s.modes,field,{value:true,enumerable:false});return raw.validateScenarioScope(s);});
    rejectedDataProbe(()=>{const o=obligation();Object.defineProperty(o.canonicalBindingPath,field,{value:true,enumerable:false});return coverage.validateExecutionObligation(o);});
    rejectedDataProbe(()=>{const a=[result(obligation())];Object.defineProperty(a,field,{value:true,enumerable:false});return coverage.validateExecutionCoverage([obligation()],a);});
  }
});
test('R1 inherited, non-enumerable and abnormal-prototype indices are invalid',()=>{
  rejectedDataProbe(()=>{const o=obligation();Object.defineProperty(o.canonicalBindingPath,'0',{value:'root-neutral',enumerable:false});return coverage.validateExecutionObligation(o);});
  rejectedDataProbe(()=>{const o=obligation();const a=new Array(1);const prototype=Object.create(Array.prototype);Object.defineProperty(prototype,'0',{value:'root-neutral'});Object.setPrototypeOf(a,prototype);o.canonicalBindingPath=a;return coverage.validateExecutionObligation(o);});
  rejectedDataProbe(()=>{const s=scope();Object.setPrototypeOf(s.producerVector,null);return raw.validateScenarioScope(s);});
});
test('R1 every raw schema array uses the same closed dense-data boundary',()=>{
  for (const field of ['modes','sourceVector','producerVector']) {
    rejectedDataProbe(()=>{const s=scope();s[field]=new Array(1);return raw.validateScenarioScope(s);});
  }
  rejectedDataProbe(()=>{const e=validSubmitted();e.platform.rawEvidenceRefs=new Array(1);return raw.validateScenarioEvidence(e);});
  rejectedDataProbe(()=>{const e=validSubmitted();e.platform.rawEvidenceRefs.accepted=true;return raw.validateScenarioEvidence(e);});
  rejectedDataProbe(()=>{const e=validSubmitted();e.eventEnumeration=known({observedEventIds:new Array(1),expectedSubjects:[],traceIntervalRef:ref(),rawCausalEdges:[]});return raw.validateScenarioEvidence(e);});
});
test('R1 expected-domain getter and array iteration overrides never run',()=>{
  rejectedDataProbe(imported=>{const a=[obligation()];Object.defineProperty(a,'0',{enumerable:true,get:imported});return coverage.validateExecutionCoverage(a,[]);});
  rejectedDataProbe(imported=>{const a=[obligation()];a.forEach=imported;return coverage.validateExecutionCoverage(a,[]);});
});
test('R1 public structural equality does not invoke malformed array or record accessors',()=>{
  let calls=0;const a=['neutral'];Object.defineProperty(a,'0',{enumerable:true,get(){calls++;throw Error('must not run');}});
  assert.equal(raw.structuralDataEqual(a,a),false);
  const b={};Object.defineProperty(b,'value',{enumerable:true,get(){calls++;throw Error('must not run');}});
  assert.equal(raw.structuralDataEqual(b,b),false);assert.equal(calls,0);
  const cyclic={};cyclic.self=cyclic;assert.equal(raw.structuralDataEqual(cyclic,cyclic),false);
});
