import type { ManualSource, SemanticApiProperty } from './types';

/** One input renderer/materializer, while API expectations and scenario context
 * remain distinct authored entities and never acquire inferred default values. */
export function validationInputs(source?: Partial<Pick<ManualSource, 'semanticApi' | 'validationContext'>>): SemanticApiProperty[] {
  return [
    ...(source?.semanticApi || []).filter(p => p.validationInput),
    ...(Array.isArray(source?.validationContext) ? source.validationContext : []).filter(p => p && typeof p === 'object').map(p => ({
      id: p.id, valueType: p.valueType, domain: p.domain, kind: 'layout' as const, bindings: [],
      validationInput: { version: (p.valueType === 'enum' ? 2 : 1) as 1 | 2, label: `Контекст: ${p.label}`, description: p.description },
    })),
  ];
}
