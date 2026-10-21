import type { Conditions, ContextValues, PatternContract } from './schema';
export const MAX_CONTEXT_CASES = 4096;
export function domain(field: PatternContract['context']['fields'][number]): Array<boolean | string> {
  return field.type === 'boolean' ? [false, true] : field.values;
}
export function enumerate(fields: PatternContract['context']['fields']): ContextValues[] | null {
  if (fields.reduce((count, field) => count * domain(field).length, 1) > MAX_CONTEXT_CASES) return null;
  let cases: ContextValues[] = [{}];
  for (const field of fields) {
    const next: ContextValues[] = [];
    for (const context of cases) for (const value of domain(field)) next.push(Object.assign({}, context, { [field.id]: value }));
    cases = next;
  }
  return cases;
}
export function matches(when: Conditions, context: ContextValues): boolean {
  return Object.entries(when).every(([id, condition]) => {
    if (!Object.prototype.hasOwnProperty.call(context, id)) return false;
    return condition.op === 'any' || (condition.op === 'eq'
      ? context[id] === condition.value : condition.values.includes(context[id]));
  });
}
