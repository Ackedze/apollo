import type { JsonValue } from './types';

export type VariableModeCatalogEntry = {
  id: string;
  key: string;
  name: string;
  defaultModeId: string;
  modes: ReadonlyArray<{ modeId: string; name: string }>;
};

/** Normalize only Figma's resolved mode evidence; a catalog default is not evidence. */
export function captureResolvedVariableModes(
  resolved: Record<string, string>,
  collections: ReadonlyArray<VariableModeCatalogEntry>,
): { modes: Record<string, JsonValue>; modeCatalog: Record<string, JsonValue>; unknownFacts: string[] } {
  const modes: Record<string, JsonValue> = {};
  const modeCatalog: Record<string, JsonValue> = {};
  const unknownFacts: string[] = [];
  const byKey = new Map<string, VariableModeCatalogEntry[]>();
  for (const collection of collections) {
    if (!/^[a-f0-9]{40}$/i.test(collection.key)) continue;
    byKey.set(collection.key, [...(byKey.get(collection.key) || []), collection]);
  }
  for (const [key, candidates] of byKey) {
    const collection = candidates[0];
    if (candidates.length !== 1) {
      unknownFacts.push(`variable.modes.${key}`);
      continue;
    }
    if (typeof collection.name !== 'string' || !Array.isArray(collection.modes) ||
      collection.modes.some(mode => !mode || typeof mode.modeId !== 'string' || typeof mode.name !== 'string')) {
      unknownFacts.push(`variable.modes.${key}`);
      continue;
    }
    modeCatalog[key] = {
      collectionId: collection.id,
      collectionName: collection.name,
      defaultModeId: collection.defaultModeId,
      modes: collection.modes.map(mode => ({ modeId: mode.modeId, name: mode.name })),
    };
    const modeId = resolved[collection.id];
    if (typeof modeId === 'string' && collection.modes.filter(mode => mode.modeId === modeId).length === 1) {
      modes[key] = modeId;
    } else {
      unknownFacts.push(`variable.modes.${key}`);
    }
  }
  return { modes, modeCatalog, unknownFacts };
}
