import type { CompiledContract, PreviewSnapshot } from './types';

/** Only opted-in contracts default to audit. Historical packages keep their exact semantics. */
export function validationMode(snapshot: PreviewSnapshot | undefined): 'component-audit' | 'specification' | 'unknown' {
  if (!snapshot) return 'unknown';
  const request = snapshot.validationRequest;
  if (request === undefined) return 'component-audit';
  return request?.version === 1 && ['component-audit', 'specification'].includes(request.mode) ? request.mode : 'unknown';
}

export function materializeValidationMode(snapshot: PreviewSnapshot, contract: CompiledContract): void {
  if (contract.runtimePolicy.validationModeVersion !== 1) return;
  const mode = validationMode(snapshot);
  for (const node of snapshot.nodes) {
    // Never trust derived facts from an imported or previously evaluated snapshot.
    node.validationScopeV1 = mode === 'unknown' ? {} : { mode, isRoot: snapshot.selection.includes(String(node.id)) };
    const unknown = new Set((Array.isArray(node.unknownFacts) ? node.unknownFacts : []) as string[]);
    for (const fact of [...unknown]) if (fact === 'validationScopeV1' || fact.startsWith('validationScopeV1.')) unknown.delete(fact);
    if (mode === 'unknown') unknown.add('validationScopeV1');
    node.unknownFacts = [...unknown];
  }
}
