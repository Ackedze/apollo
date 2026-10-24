import { sharedUsageContract } from './dependency-usage';
import type { CompiledContract, PreviewSnapshot } from './types';

const record = (v: any): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v : {};

export function assertNativeRuleFactPolicies(contract: CompiledContract): void {
  contract = sharedUsageContract(contract);
  const facts = new Set(contract.capabilities.facts);
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (typeof (value as any).fact === 'string') facts.add((value as any).fact);
    for (const child of Object.values(value)) visit(child);
  };
  visit(contract.rules);
  for (const [prefix, version] of [['textContentV1.', contract.runtimePolicy.textContentFactsVersion],
    ['nativeTargetPropertiesV1.', contract.runtimePolicy.nativeTargetPropertyFactsVersion]] as const) {
    if (version !== undefined && version !== 1 || [...facts].some(f => f.startsWith(prefix)) && version !== 1
      || version === 1 && contract.package.sourceExportVersion !== (contract.runtimePolicy.declaredTargetConfigurationVersion === 2 ? 'component-contract-editor@0.2.103' : contract.runtimePolicy.declaredTargetConfigurationVersion === 1 ? 'component-contract-editor@0.2.99' : contract.runtimePolicy.declaredTargetIdentityVersion === 3 ? 'component-contract-editor@0.2.95' : 'component-contract-editor@0.2.94'))
      throw new Error('NATIVE_RULE_FACT_POLICY_UNSUPPORTED');
  }
}

/** Only unclipped, uniformly spaced auto-height text proves a rendered line count. */
export function materializeTextContent(snapshot: PreviewSnapshot, contract: CompiledContract): void {
  if (contract.runtimePolicy.textContentFactsVersion !== 1) return;
  for (const node of snapshot.nodes) {
    delete node.textContentV1;
    const prior = (node.unknownFacts || []) as string[];
    node.unknownFacts = prior.filter(p => p !== 'textContentV1' && !p.startsWith('textContentV1.'));
    if (node.type !== 'TEXT') continue;
    const text = record(node.text), facts: Record<string, number> = {};
    const known = (fact: string) => !prior.some(p => p === fact || fact.startsWith(p + '.'));
    if (known('text.characters') && typeof text.characters === 'string') facts.characterCount = Array.from(text.characters).length;
    const lh = record(text.lineHeight);
    const pixels = lh.unit === 'PIXELS' ? lh.value : lh.unit === 'PERCENT' && typeof text.fontSize === 'number' ? text.fontSize * lh.value / 100 : undefined;
    const height = record(node.bounds).height, count = height / pixels;
    if (['text.lineHeight','text.fontSize','bounds.height','text.textAutoResize','text.textTruncation','text.paragraphSpacing','text.maxHeight'].every(known)
      && ['HEIGHT','WIDTH_AND_HEIGHT'].includes(text.textAutoResize) && text.textTruncation === 'DISABLED'
      && text.paragraphSpacing === 0 && text.maxHeight === null && typeof pixels === 'number' && Number.isFinite(pixels) && pixels > 0
      && typeof height === 'number' && Number.isFinite(height) && height >= 0 && Math.abs(count - Math.round(count)) < 0.01) facts.lineCount = Math.round(count);
    node.textContentV1 = facts;
    for (const key of ['characterCount','lineCount']) if (facts[key] === undefined) (node.unknownFacts as string[]).push(`textContentV1.${key}`);
  }
}
