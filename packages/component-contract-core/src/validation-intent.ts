import type { CompiledContract, PreviewSnapshot, JsonValue } from './types';
import { validationInputs } from './validation-inputs';

const subjectOf = (snapshot: PreviewSnapshot) => ({
  rootNodeId: snapshot.source?.rootNodeId || '', pageId: snapshot.source?.pageId || '',
  componentKey: snapshot.source?.componentKey || '', componentSetKey: snapshot.source?.componentSetKey || '',
});

/** Called only with explicit scenario inputs. No observed-value/default fallback. */
export function createValidationIntent(snapshot: PreviewSnapshot, contract: CompiledContract, values: Record<string, JsonValue>): NonNullable<PreviewSnapshot['validationIntent']> {
  return { schemaVersion: 'apollo.validation-intent.v1', origin: 'explicit-scenario-input',
    manualSourceHash: contract.package.manualSourceHash, subject: subjectOf(snapshot), values: { ...values } };
}

/** Untrusted/replayed materialized facts are recomputed from pinned scenario evidence. */
export function materializeValidationIntent(snapshot: PreviewSnapshot, contract: CompiledContract): void {
  if (![1, 2].includes(contract.runtimePolicy.validationIntentVersion || 0)) return;
  const properties = validationInputs(contract.facts).filter(p => p.validationInput?.version === 1 || contract.runtimePolicy.validationIntentVersion === 2 && p.validationInput?.version === 2);
  const roots = snapshot.nodes.filter(n => snapshot.selection.includes(String(n.id)));
  const root = roots.length === 1 ? roots[0] : undefined;
  const subject = subjectOf(snapshot), input = snapshot.validationIntent;
  const identity = (root?.component as any)?.identity;
  const reps = contract.facts.representations.filter(r => r.kind === 'figma' && r.status !== 'deprecated'
    && r.platform === snapshot.context.platform && [r.locator.componentKey, r.locator.componentSetKey].includes(subject.componentSetKey));
  const validIdentity = Boolean(root && Object.values(subject).every(Boolean) && reps.length === 1
    && !snapshot.source?.truncated && !(Array.isArray(root.unknownFacts) ? root.unknownFacts as string[] : []).some(f => ['component', 'component.identity', 'component.identity.componentKey', 'component.identity.componentSetKey'].includes(f))
    && identity?.componentKey === subject.componentKey && identity?.componentSetKey === subject.componentSetKey);
  const reason = !input ? 'expected-input-missing' : input.schemaVersion !== 'apollo.validation-intent.v1' || input.origin !== 'explicit-scenario-input'
    ? 'expected-input-origin-invalid' : input.manualSourceHash !== contract.package.manualSourceHash ? 'expected-input-contract-changed'
      : !validIdentity || !input.subject || Object.entries(subject).some(([key, value]) => (input.subject as any)[key] !== value)
        ? 'expected-input-subject-mismatch' : 'resolved';
  for (const node of snapshot.nodes) {
    delete node.expectedInput;
    delete node.expectedInputEvidence;
    if (node !== root) continue;
    const values: Record<string, JsonValue> = {}, evidence: Record<string, unknown> = {};
    const unknown = new Set((Array.isArray(node.unknownFacts) ? node.unknownFacts : []) as string[]);
    for (const property of properties) {
      const fact = `expectedInput.${property.id}`, value = input?.values?.[property.id];
      const valid = reason === 'resolved' && (property.valueType === 'boolean' && typeof value === 'boolean'
        || property.validationInput?.version === 2 && property.valueType === 'enum' && typeof value === 'string')
        && (!property.domain || property.domain.includes(value));
      if (valid) { values[property.id] = value; unknown.delete(fact); }
      else unknown.add(fact);
      evidence[property.id] = { reason: valid ? 'resolved' : reason === 'resolved' ? 'expected-input-missing-or-invalid' : reason,
        origin: input?.origin || null, manualSourceHash: input?.manualSourceHash || null };
    }
    node.expectedInput = values;
    node.expectedInputEvidence = evidence;
    node.unknownFacts = [...unknown];
  }
}
