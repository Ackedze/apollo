export const CAPABILITY_SETS: Readonly<Record<string, readonly string[]>> = {
  'fill@1': [
    'appearance.fill',
    'appearance.fillStyleId',
  ],
  'stroke@1': [
    'appearance.stroke',
    'appearance.strokeStyleId',
    'appearance.strokeWeight',
    'appearance.strokeAlign',
    'appearance.dashPattern',
  ],
  'radius@1': [
    'appearance.radius',
  ],
  'effects@1': [
    'appearance.effects',
    'appearance.effectStyleId',
  ],
  'visual-style@1': [
    'appearance.fill',
    'appearance.stroke',
    'appearance.opacity',
    'appearance.radius',
    'appearance.effects',
  ],
  'auto-layout@1': [
    'layout.mode',
    'layout.padding.top',
    'layout.padding.right',
    'layout.padding.bottom',
    'layout.padding.left',
    'layout.itemSpacing',
    'layout.primaryAxisAlignItems',
    'layout.counterAxisAlignItems',
    'layout.sizingHorizontal',
    'layout.sizingVertical',
  ],
};

export const CAPABILITY_SET_LABELS: Readonly<Record<string, string>> = {
  'fill@1': 'Заливка',
  'stroke@1': 'Обводка',
  'auto-layout@1': 'Автолейаут',
  'radius@1': 'Скругление',
  'effects@1': 'Эффекты',
  'visual-style@1': 'Внешний вид',
};

export function capabilitiesForSet(capabilitySet?: string): readonly string[] {
  return capabilitySet ? (CAPABILITY_SETS[capabilitySet] || []) : [];
}

/** One mapping shared by compilation and authoring compatibility checks. */
export function factForCapability(capability: string): string {
  if (capability.startsWith('component-property.')) return `component.properties.${capability.slice('component-property.'.length)}`;
  if (capability === 'visibility') return 'visible';
  if (capability === 'token.binding') return 'variable.bindings';
  return capability;
}

export function capabilitySetLabel(capabilitySet?: string): string {
  return capabilitySet ? (CAPABILITY_SET_LABELS[capabilitySet] || capabilitySet) : '';
}
