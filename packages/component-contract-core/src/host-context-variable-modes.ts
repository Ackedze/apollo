import { effectiveFacts } from './instance-validation';

type BindingCollection = { collectionId: string; collectionKey: string; referencedVariableIds: string[] };
export type HostVariableUsage = { version: 1; complete: boolean; bindings: Record<string, BindingCollection> };
const record = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};
const object = (v: unknown): boolean => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const unknown = (n: Record<string, unknown>, fact: string) => ((n.unknownFacts || []) as string[])
  .some(p => p === fact || fact.startsWith(p + '.') || p.startsWith(fact + '.'));

/** Includes paint/effect aliases and mixed text ranges, not just node bindings. */
function tokenIds(values: unknown[]): { ids: string[]; complete: boolean } {
  const ids = new Set<string>(); let complete = true;
  const add = (id: unknown) => { if (typeof id === 'string' && id.trim()) ids.add(id); else complete = false; };
  const visit = (v: unknown) => {
    if (Array.isArray(v)) { v.forEach(visit); return; }
    if (!v || typeof v !== 'object') return;
    for (const [key, value] of Object.entries(v)) {
      if (key === 'tokenId' && value !== null) add(value);
      else if (key === 'tokenIds') { if (Array.isArray(value)) value.forEach(add); else complete = false; }
      else if (key === 'id' && record(v).type === 'VARIABLE_ALIAS') add(value);
      else visit(value);
    }
    if (record(v).type === 'VARIABLE_ALIAS' && !Object.prototype.hasOwnProperty.call(v, 'id')) complete = false;
  };
  values.forEach(visit); return { ids: Array.from(ids).sort(), complete };
}

/** Observe each binding's collection independently on each library stage.
 * A lookup failure is uncertainty; catalog defaults never supply resolved modes. */
export async function captureHostVariableUsage(node: Record<string, any>,
  resolve: (id: string, modes: Record<string, unknown>) => Promise<BindingCollection | undefined>): Promise<HostVariableUsage> {
  const usage: HostVariableUsage = { version: 1, complete: true, bindings: {} };
  try {
    const values = ['boundVariables', 'fills', 'strokes', 'effects', 'layoutGrids'].map(key => node[key]);
    if (node.type === 'TEXT') values.push(node.getStyledTextSegments(['fills', 'boundVariables']));
    const tokens = tokenIds(values); usage.complete = tokens.complete;
    const visiting = new Set<string>(); let count = 0;
    const visit = async (id: string, depth: number): Promise<void> => {
      if (visiting.has(id) || depth > 16 || ++count > 128) { usage.complete = false; return; }
      if (usage.bindings[id]) return;
      visiting.add(id);
      const collection = await resolve(id, record(node.resolvedVariableModes));
      if (!collection || !Array.isArray(collection.referencedVariableIds)) usage.complete = false;
      else {
        for (const alias of collection.referencedVariableIds) {
          if (typeof alias !== 'string' || !alias) usage.complete = false; else await visit(alias, depth + 1);
        }
        usage.bindings[id] = collection;
      }
      visiting.delete(id);
    };
    for (const id of tokens.ids) await visit(id, 0);
  } catch { usage.complete = false; }
  return usage;
}

/** Comparison projection only. Raw modes, catalogs and reference facts stay intact. */
export function hostContextFacts(node: Record<string, unknown>): Record<string, unknown> | undefined {
  const usage = record(node.hostVariableUsageV1), variable = record(node.variable);
  if (usage.version !== 1 || usage.complete !== true || !object(usage.bindings)
    || !object(variable.bindings) || !object(variable.modes) || !object(variable.modeCatalog)
    || unknown(node, 'hostVariableUsageV1') || unknown(node, 'variable.bindings')) return;
  const tokens = tokenIds([variable.bindings, node.appearance, node.textFillEvidenceV1]);
  if (!tokens.complete || tokens.ids.some(id => !Object.prototype.hasOwnProperty.call(usage.bindings, id))) return;
  const checked = new Set<string>(), visiting = new Set<string>();
  const validChain = (id: string, depth: number): boolean => {
    if (visiting.has(id) || depth > 16) return false;
    if (checked.has(id)) return true;
    const refs = record(usage.bindings[id]).referencedVariableIds;
    if (!Array.isArray(refs)) return false;
    visiting.add(id);
    if (refs.some((alias: unknown) => typeof alias !== 'string' || !Object.prototype.hasOwnProperty.call(usage.bindings, alias)
      || !validChain(alias, depth + 1))) return false;
    visiting.delete(id); checked.add(id); return true;
  };
  if (Object.keys(usage.bindings).length > 128 || Object.keys(usage.bindings).some(id => !validChain(id, 0))) return;
  const modes: Record<string, unknown> = {}, catalog: Record<string, unknown> = {};
  const ids = new Map<string, string>();
  for (const binding of Object.values(usage.bindings)) {
    const collection = record(binding), key = collection.collectionKey, id = collection.collectionId;
    if (typeof key !== 'string' || !/^[a-f0-9]{40}$/i.test(key) || typeof id !== 'string' || !id
      || ids.has(key) && ids.get(key) !== id) return;
    if (!Array.isArray(collection.referencedVariableIds) || collection.referencedVariableIds.some((alias: unknown) =>
      typeof alias !== 'string' || !Object.prototype.hasOwnProperty.call(usage.bindings, alias))) return;
    ids.set(key, id);
    const mode = variable.modes[key], entry = record(variable.modeCatalog[key]);
    if (unknown(node, `variable.modes.${key}`) || unknown(node, `variable.modeCatalog.${key}`)
      || typeof mode !== 'string' || record(node.resolvedModes)[id] !== mode || entry.collectionId !== id
      || !Array.isArray(entry.modes) || entry.modes.filter((m: any) => m?.modeId === mode).length !== 1) return;
    modes[key] = mode; catalog[key] = entry;
  }
  const facts = JSON.parse(JSON.stringify(effectiveFacts(node))) as Record<string, unknown>;
  facts.variable = Object.assign({}, variable, { modes, modeCatalog: catalog });
  // Bindings not represented in ordinary visual facts (e.g. mixed text ranges)
  // still have to agree between the two independent stages.
  facts.hostVariableUsageV1 = usage;
  return facts;
}
