/** Empty TEXT can expose the base style value while its bound variable resolves in another mode. */
export async function captureResolvedEmptyText(node: TextNode, mixed: symbol): Promise<{
  text: Record<string, any>; unknownFacts: string[];
}> {
  const result = {text:{} as Record<string,any>,unknownFacts:[] as string[]};
  if (node.characters !== '') return result;
  for (const field of ['fontFamily','letterSpacing'] as const) {
    const fact = field === 'fontFamily' ? 'text.fontName' : 'text.letterSpacing';
    try {
      const binding = node.boundVariables?.[field];
      if (binding === undefined) continue;
      const aliases = Array.isArray(binding) ? binding : [binding];
      if (aliases.length !== 1 || aliases[0]?.type !== 'VARIABLE_ALIAS' || !aliases[0].id) throw new Error('ambiguous binding');
      const variable = await figma.variables.getVariableByIdAsync(aliases[0].id);
      if (!variable) throw new Error('unreadable variable');
      const resolved = variable.resolveForConsumer(node);
      if (field === 'fontFamily') {
        if (resolved.resolvedType !== 'STRING' || typeof resolved.value !== 'string' || !resolved.value.trim()
          || node.fontName === mixed) throw new Error('unresolved font family');
        result.text.fontName = {family:resolved.value,style:(node.fontName as FontName).style};
      } else {
        const spacing = node.letterSpacing;
        if (resolved.resolvedType !== 'FLOAT' || typeof resolved.value !== 'number' || !Number.isFinite(resolved.value)
          || spacing === mixed || !['PIXELS','PERCENT'].includes((spacing as LetterSpacing).unit)) throw new Error('unresolved spacing');
        result.text.letterSpacing = {unit:(spacing as LetterSpacing).unit,value:resolved.value};
      }
    } catch { result.unknownFacts.push(fact); }
  }
  return result;
}
