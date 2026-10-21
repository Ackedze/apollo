/** Paint summary keeps identity visible; raw evidence is never truncated. */
export function paintDiagnosticSummary(value: unknown): string | null {
  if (!Array.isArray(value) || !value.length || !value.every((item) => item && typeof item === 'object' && typeof item.type === 'string')) return null;
  return value.map((paint, index) => {
    if (String(paint.type).startsWith('GRADIENT_')) {
      return [
        `${value.length > 1 ? `${index + 1}. ` : ''}${paint.type}`,
        ...(Array.isArray(paint.gradientStops) ? paint.gradientStops.map((stop: Record<string, any>, i: number) =>
          `Stop ${i + 1} @ ${stop.position}: RGBA (0–1) ${JSON.stringify(stop.color)} · Token ID: ${stop.tokenId === null ? 'нет привязки' : stop.tokenId || 'нет данных'}`)
          : ['Stops: нет данных']),
        `Transform: ${paint.gradientTransform ? JSON.stringify(paint.gradientTransform) : 'нет данных'}`,
        ...(paint.blendMode === undefined ? [] : [`Blend: ${paint.blendMode}`]),
        ...(paint.opacity === undefined ? [] : [`Opacity: ${paint.opacity}`]),
        ...(paint.visible === false ? ['Скрыта'] : []),
      ].join('\n');
    }
    const color = paint.color;
    const hex = color && ['r', 'g', 'b'].every((key) => typeof color[key] === 'number')
      ? `#${['r', 'g', 'b'].map((key) => Math.round(color[key]).toString(16).padStart(2, '0')).join('').toUpperCase()}` : '';
    return [
      `${value.length > 1 ? `${index + 1}. ` : ''}${paint.type}${hex ? ` · ${hex}` : ''}`,
      `Token ID: ${typeof paint.tokenId === 'string' && paint.tokenId ? paint.tokenId : 'нет привязки в снимке'}`,
      ...(paint.opacity === undefined ? [] : [`Opacity: ${paint.opacity}`]),
      ...(paint.visible === false ? ['Скрыта'] : []),
    ].join('\n');
  }).join('\n\n');
}
