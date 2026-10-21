import type { JsonValue } from './types';

/** Read actual Figma fields only: no semantic defaults or loading inference. */
export function captureSupplementalFacts(node: Record<string, unknown>, mixed: unknown) {
  const text: Record<string, JsonValue> = {};
  const parent: Record<string, JsonValue> = {};
  const unknownFacts: string[] = [];
  const read = (source: Record<string, unknown>, key: string, output: Record<string, JsonValue>, fact: string) => {
    let value: unknown;
    try { value = source[key]; } catch { value = undefined; }
    if (value === mixed || value === undefined || (typeof value === 'number' && !Number.isFinite(value))) unknownFacts.push(fact);
    else if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) output[key] = value as JsonValue;
    else unknownFacts.push(fact);
  };
  if (node.type === 'TEXT') {
    for (const key of ['textAutoResize', 'textAlignHorizontal', 'textAlignVertical', 'textTruncation', 'maxLines', 'paragraphSpacing', 'maxHeight']) read(node, key, text, `text.${key}`);
  }
  const sourceParent = node.parent as Record<string, unknown> | undefined;
  if (sourceParent && !['PAGE', 'DOCUMENT'].includes(String(sourceParent.type))) {
    const layout: Record<string, JsonValue> = {};
    read(sourceParent, 'layoutMode', layout, 'parent.layout.mode');
    if ('layoutMode' in layout) { layout.mode = layout.layoutMode; delete layout.layoutMode; }
    parent.layout = layout;
    read(sourceParent, 'clipsContent', parent, 'parent.clipsContent');
  } else if (sourceParent && ['PAGE', 'DOCUMENT'].includes(String(sourceParent.type))) {
    // A known canvas parent is not an unknown Auto Layout container.
    parent.layout = { mode: 'NONE' };
  } else unknownFacts.push('parent');
  return { text, parent, unknownFacts };
}
