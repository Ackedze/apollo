import { AvailabilityEvidenceSchema, REQUIREMENTS_VERSION, type AvailabilityEvidence,
  type ComponentBinding, type ContextValues, type Issue, type PatternContract } from './schema';
import { validatePattern } from './validator';
import { resolveDecisions, type Selection } from './decisions';
import { contractHash } from './hash';
import { sourceReceiptMatches, type SourceReceipt } from './sources';

export type AvailabilityRequest = { entryId: string; registrySha256: string; lock: ComponentBinding['lock'];
  semanticRole: string;
  platform: string; target: 'figma' | 'frontend'; requiredInputs: string[]; requiredSlots: string[] };
export type AvailabilityPort = (request: AvailabilityRequest) => unknown;
export type Requirements = {
  schemaVersion: typeof REQUIREMENTS_VERSION; consumer: 'apollo-v4'; status: 'draft'; executionAllowed: false;
  patternLock: { patternId: string; revision: number; contractSha256: string; sources: PatternContract['sources']; sourceReceiptSha256?: string };
  context: ContextValues; target: 'figma' | 'frontend'; platform: string; decisions: Selection[];
  outcomes: PatternContract['outcomes'];
  compositions: PatternContract['compositions']; scenario: PatternContract['scenario'];
  constraints: PatternContract['constraints']; gaps: PatternContract['gaps'];
  availability: { status: 'passed' | 'unresolved' | 'failed'; evidence: AvailabilityEvidence[] };
  sourceVerification: 'passed' | 'unverified'; issues: Issue[];
};

export function checkAvailability(request: AvailabilityRequest, port?: AvailabilityPort): { status: 'passed' | 'unresolved' | 'failed'; issues: Issue[]; evidence?: AvailabilityEvidence } {
  const fail = (code: string, message: string) => ({ status: 'failed' as const,
    issues: [{ level: 'error' as const, code, path: '/availability/' + request.entryId, message }] });
  if (!port) return { status: 'unresolved', issues: [{ level: 'warning', code: 'REGISTRY_UNAVAILABLE', path: '/availability', message: 'A trusted Code Connect registry port is required.' }] };
  let result: unknown;
  try { result = port(request); } catch { return fail('REGISTRY_UNAVAILABLE', 'Registry resolver failed.'); }
  if (result === null || result === undefined) return fail('EXPORT_UNAVAILABLE', 'No confirmed arui-private mapping for this entry.');
  const parsed = AvailabilityEvidenceSchema.safeParse(result);
  if (!parsed.success) return fail('REGISTRY_EVIDENCE', 'Registry evidence is incomplete, unconfirmed or uses an unsupported package.');
  const e = parsed.data;
  if (e.entryId !== request.entryId || e.registrySha256 !== request.registrySha256) return fail('STALE_REGISTRY', 'Registry entry identity or content pin differs.');
  if (contractHash(e.lock) !== contractHash(request.lock)) return fail('STALE_COMPONENT_LOCK', 'Contract revision/hash/representation differs.');
  if (!e.platforms.includes(request.platform)) return fail('PLATFORM_UNAVAILABLE', 'Requested platform is not confirmed.');
  if (!e.targets.includes(request.target)) return fail('TARGET_UNAVAILABLE', 'Requested target mapping is not confirmed.');
  if (!e.semanticRoles.includes(request.semanticRole)) return fail('ROLE_UNAVAILABLE', 'This mapping does not confirm the requested semantic role.');
  if (request.requiredInputs.some(input => !e.inputs.includes(input))) return fail('INPUT_UNAVAILABLE', 'A required semantic input is not confirmed in the mapping.');
  if (request.requiredSlots.some(slot => !e.slots.includes(slot))) return fail('SLOT_UNAVAILABLE', 'A required slot is not confirmed in the mapping.');
  if (new Set(e.code.files.map(file => file.path)).size !== e.code.files.length) return fail('REGISTRY_EVIDENCE', 'Source file pins must be unique.');
  return { status: 'passed', issues: [], evidence: e };
}

/** Proposed semantic port for Generation G03/NEXT-03. Produces requirements,
 * never a CompositionPlan, component props, code imports or Figma operations. */
export function prepareRequirements(input: unknown, context: unknown, options: {
  platform: string; target: 'figma' | 'frontend'; sourceReceipt?: SourceReceipt; availability?: AvailabilityPort;
}): { status: 'invalid' | 'unresolved' | 'draft'; issues: Issue[]; missing?: string[]; requirements?: Requirements } {
  const validation = validatePattern(input), decision = resolveDecisions(input, context);
  if (!validation.pattern || decision.status !== 'selected') return { status: decision.status === 'unresolved' ? 'unresolved' : 'invalid', issues: decision.issues, missing: decision.missing };
  const p = validation.pattern, values = context as ContextValues;
  if (values.platform !== undefined && values.platform !== options.platform) return { status: 'invalid', issues: [{
    level: 'error', code: 'PLATFORM_CONTEXT', path: '/platform', message: 'Preflight platform and selected context must agree.' }] };
  const outcomeIds = new Set(decision.selections.map(selection => selection.outcomeId));
  const compositionIds = new Set(p.outcomes.filter(outcome => outcomeIds.has(outcome.id)).flatMap(outcome => outcome.compositionIds));
  const compositions = p.compositions.filter(composition => compositionIds.has(composition.id));
  const issues = validation.issues.filter(issue => issue.code !== 'ROLE_UNRESOLVED'), evidence: AvailabilityEvidence[] = [];
  let availability: Requirements['availability']['status'] = 'passed';
  const escalate = (next: Requirements['availability']['status']) => {
    if (next === 'failed' || (next === 'unresolved' && availability === 'passed')) availability = next;
  };
  for (const composition of compositions) for (const role of composition.roles) {
    if (role.kind !== 'ui-component') continue;
    if (role.binding?.kind !== 'registry') {
      escalate('unresolved'); issues.push({ level: 'warning', code: 'ROLE_UNRESOLVED',
        path: '/compositions/' + composition.id + '/' + role.id,
        message: 'No confirmed arui-private representation is bound.' }); continue;
    }
    const binding = role.binding;
    const checked = checkAvailability({ entryId: binding.entryId, registrySha256: binding.registrySha256,
      semanticRole: role.semanticRole,
      lock: binding.lock, platform: options.platform, target: options.target,
      requiredInputs: binding.requiredInputs, requiredSlots: binding.requiredSlots }, options.availability);
    escalate(checked.status); issues.push(...checked.issues);
    if (checked.evidence) evidence.push(checked.evidence);
  }
  const sourceVerification = sourceReceiptMatches(p, options.sourceReceipt) ? 'passed' : 'unverified';
  if (sourceVerification === 'unverified') issues.push({ level: 'warning', code: 'SOURCE_UNVERIFIED', path: '/sources', message: 'A matching trusted source receipt is required.' });
  const transitions = p.scenario.transitions.filter(transition => transition.outcomeIds.some(id => outcomeIds.has(id)));
  const requirements: Requirements = {
    schemaVersion: REQUIREMENTS_VERSION, consumer: 'apollo-v4', status: 'draft', executionAllowed: false,
    patternLock: { patternId: p.patternId, revision: p.revision, contractSha256: contractHash(p), sources: p.sources,
      sourceReceiptSha256: sourceVerification === 'passed' ? options.sourceReceipt?.receiptSha256 : undefined },
    context: values, platform: options.platform, target: options.target, decisions: decision.selections,
    outcomes: p.outcomes.filter(outcome => outcomeIds.has(outcome.id)),
    compositions, scenario: Object.assign({}, p.scenario, { transitions }),
    constraints: p.constraints.filter(constraint => constraint.route === 'composition' ? compositionIds.has(constraint.subjectId)
      : constraint.route === 'scenario' ? transitions.some(t => t.id === constraint.subjectId) : true), gaps: p.gaps,
    availability: { status: availability, evidence }, sourceVerification, issues,
  };
  return { status: 'draft', issues, requirements };
}
