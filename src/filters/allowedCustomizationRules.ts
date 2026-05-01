import { findComponent } from '../reference/library';
import type { DiffEntry } from '../structure/diff';
import { traceAudit } from '../utils/auditInstrumentation';

export type AllowedCustomizationProperty =
  | 'fill'
  | 'stroke'
  | 'textStyle'
  | 'itemSpacing'
  | 'paddingLeft'
  | 'paddingRight'
  | 'opacity';

export type AllowedCustomizationRule = {
  id: string;
  libraryName?: string;
  componentName?: string;
  matchNodePathWhenComponentNameMismatch?: boolean;
  nestedComponentName?: string;
  nestedOwnerPathIncludes?: string;
  nestedOwnerRelativePath?: string;
  nodePathIncludes?: string;
  layerName?: string;
  property: AllowedCustomizationProperty;
  from?: string | number;
  to?: string | number;
  toTokenized?: boolean;
  toAnyNumber?: boolean;
  allowAnyActual?: boolean;
  contextComponentName?: string;
  reason: string;
};

export type AllowedCustomizationContext = {
  libraryName: string | null;
  componentName: string;
  referenceComponentName?: string | null;
};

type ParsedCustomizationDiff = {
  property: AllowedCustomizationProperty;
  expected: string | number;
  actual: string | number;
};

const allowedCustomizationRules: AllowedCustomizationRule[] = [
  {
    id: 'status-direct-fill-tokenized',
    componentName: 'Status',
    property: 'fill',
    toTokenized: true,
    reason: 'allowed tokenized fill overrides inside Status',
  },
  {
    id: 'status-nested-fill-tokenized',
    nestedComponentName: 'Status',
    nestedOwnerPathIncludes: 'Status',
    property: 'fill',
    toTokenized: true,
    reason: 'allowed tokenized fill overrides inside nested Status',
  },
  {
    id: 'status-badge-paintme-fill',
    libraryName: 'Web :: Core',
    componentName: 'StatusBadge',
    layerName: 'PaintMe',
    property: 'fill',
    from: 'status/info',
    toTokenized: true,
    reason: 'allowed tokenized PaintMe recolor in StatusBadge',
  },
  {
    id: 'status-badge-paintme-fill-nested',
    nestedComponentName: 'StatusBadge',
    nestedOwnerPathIncludes: 'StatusBadge',
    layerName: 'PaintMe',
    property: 'fill',
    from: 'status/info',
    toTokenized: true,
    reason: 'allowed tokenized PaintMe recolor in nested StatusBadge',
  },
  {
    id: 'top-addon-paintme-fill',
    libraryName: 'Web :: Corp Components',
    componentName: 'TopAddon',
    layerName: 'PaintMe',
    property: 'fill',
    from: 'status/info',
    toTokenized: true,
    reason: 'allowed tokenized PaintMe recolor in TopAddon',
  },
  {
    id: 'top-addon-paintme-fill-nested',
    nestedComponentName: 'TopAddon',
    nestedOwnerPathIncludes: 'TopAddon',
    layerName: 'PaintMe',
    property: 'fill',
    from: 'status/info',
    toTokenized: true,
    reason: 'allowed tokenized PaintMe recolor in nested TopAddon',
  },
  {
    id: 'button-paintme-fill',
    libraryName: 'Web :: Core',
    componentName: '[D] Button',
    layerName: 'PaintMe',
    property: 'fill',
    from: 'status/info',
    to: 'Button/Desktop/Colors/Primary/text',
    reason: 'allowed host-controlled paint override in Button',
  },
  {
    id: 'amount-major-fill',
    libraryName: 'Web :: Core',
    componentName: 'Amount',
    layerName: 'Major',
    property: 'fill',
    from: 'text/primary',
    toTokenized: true,
    reason: 'allowed tokenized text tone override in Amount',
  },
  {
    id: 'amount-minor-fill',
    libraryName: 'Web :: Core',
    componentName: 'Amount',
    layerName: 'Minor',
    property: 'fill',
    from: 'text/primary',
    toTokenized: true,
    reason: 'allowed tokenized text tone override in Amount',
  },
  {
    id: 'amount-currency-fill',
    libraryName: 'Web :: Core',
    componentName: 'Amount',
    layerName: 'Currency',
    property: 'fill',
    from: 'text/primary',
    toTokenized: true,
    reason: 'allowed tokenized text tone override in Amount',
  },
  {
    id: 'amount-major-fill-nested',
    nestedComponentName: 'Amount',
    nestedOwnerPathIncludes: 'Amount',
    layerName: 'Major',
    property: 'fill',
    from: 'text/primary',
    toTokenized: true,
    reason: 'allowed tokenized text tone override in nested Amount',
  },
  {
    id: 'amount-minor-fill-nested',
    nestedComponentName: 'Amount',
    nestedOwnerPathIncludes: 'Amount',
    layerName: 'Minor',
    property: 'fill',
    from: 'text/primary',
    toTokenized: true,
    reason: 'allowed tokenized text tone override in nested Amount',
  },
  {
    id: 'amount-currency-fill-nested',
    nestedComponentName: 'Amount',
    nestedOwnerPathIncludes: 'Amount',
    layerName: 'Currency',
    property: 'fill',
    from: 'text/primary',
    toTokenized: true,
    reason: 'allowed tokenized text tone override in nested Amount',
  },
  {
    id: 'payment-masked-major-fill',
    libraryName: 'Web :: Corp Components',
    componentName: 'PaymentMaskedNumber',
    layerName: 'Major',
    property: 'fill',
    from: 'text/primary',
    toTokenized: true,
    reason: 'allowed text tone override in PaymentMaskedNumber',
  },
  {
    id: 'payment-masked-minor-fill',
    libraryName: 'Web :: Corp Components',
    componentName: 'PaymentMaskedNumber',
    layerName: 'Minor',
    property: 'fill',
    from: 'text/primary',
    toTokenized: true,
    reason: 'allowed text tone override in PaymentMaskedNumber',
  },
  {
    id: 'payment-masked-major-fill-nested',
    nestedComponentName: 'PaymentMaskedNumber',
    nestedOwnerPathIncludes: 'PaymentMaskedNumber',
    layerName: 'Major',
    property: 'fill',
    from: 'text/primary',
    toTokenized: true,
    reason: 'allowed text tone override in nested PaymentMaskedNumber',
  },
  {
    id: 'payment-masked-minor-fill-nested',
    nestedComponentName: 'PaymentMaskedNumber',
    nestedOwnerPathIncludes: 'PaymentMaskedNumber',
    layerName: 'Minor',
    property: 'fill',
    from: 'text/primary',
    toTokenized: true,
    reason: 'allowed text tone override in nested PaymentMaskedNumber',
  },
  {
    id: 'head-cell-paintme-fill',
    libraryName: 'Web :: Corp Components',
    componentName: '[D] HeadCell',
    layerName: 'PaintMe',
    property: 'fill',
    from: 'status/info',
    to: 'neutral-translucent/500',
    reason: 'allowed indicator color override in HeadCell',
  },
  {
    id: 'header-bgcolor-fill',
    libraryName: 'Web :: Corp Components',
    componentName: '[D] Header',
    layerName: 'BgColor',
    property: 'fill',
    from: 'neutral/100',
    to: 'neutral-translucent/200',
    reason: 'allowed nested IconView background override in Header',
  },
  {
    id: 'icons-tokenized-fill',
    libraryName: 'Icons',
    property: 'fill',
    from: '#747474',
    toTokenized: true,
    reason: 'allowed tokenized icon recolor in Icons library',
  },
  {
    id: 'link-spacing',
    libraryName: 'Web :: Core',
    componentName: 'Link',
    layerName: 'Link',
    property: 'itemSpacing',
    from: 4,
    to: 6,
    reason: 'allowed Link spacing override',
  },
  {
    id: 'link-spacing-nested',
    nestedComponentName: 'Link',
    nestedOwnerPathIncludes: 'Link',
    layerName: 'Link',
    property: 'itemSpacing',
    from: 4,
    to: 6,
    reason: 'allowed nested Link spacing override',
  },
  {
    id: 'link-label-style',
    libraryName: 'Web :: Core',
    componentName: 'Link',
    layerName: 'Label',
    property: 'textStyle',
    from: 'Paragraph/14–20 Primary Small',
    to: 'Action/14–20 Primary Small',
    reason: 'allowed Link label typography override',
  },
  {
    id: 'link-label-style-nested',
    nestedComponentName: 'Link',
    nestedOwnerPathIncludes: 'Link',
    layerName: 'Label',
    property: 'textStyle',
    from: 'Paragraph/14–20 Primary Small',
    to: 'Action/14–20 Primary Small',
    reason: 'allowed nested Link label typography override',
  },
  {
    id: 'tabs-view-items-spacing',
    libraryName: 'Web :: Corp Components',
    componentName: '[D] TabsView',
    layerName: 'Items',
    property: 'itemSpacing',
    from: 24,
    to: 32,
    reason: 'allowed Items spacing override in TabsView',
  },
  {
    id: 'tabs-view-tabprimary-spacing',
    libraryName: 'Web :: Corp Components',
    componentName: '[D] TabsView',
    nestedComponentName: 'TabPrimary',
    layerName: 'TabPrimary',
    property: 'itemSpacing',
    from: 12,
    to: 16,
    reason: 'allowed TabPrimary spacing override in TabsView',
  },
  {
    id: 'tabs-view-tabprimary-label-style',
    libraryName: 'Web :: Corp Components',
    componentName: '[D] TabsView',
    nestedComponentName: 'TabPrimary',
    layerName: 'Label',
    property: 'textStyle',
    from: 'Paragraph/18–24 Primary Large',
    to: 'Action/18–24 Primary Large',
    reason: 'allowed TabPrimary label typography override in TabsView',
  },
  {
    id: 'progress-bar-root-padding-right',
    libraryName: 'Web :: Core ProgressBars',
    componentName: 'ProgressBar',
    property: 'paddingRight',
    from: 0,
    toAnyNumber: true,
    reason: 'allowed root ProgressBar right padding override',
  },
  {
    id: 'progress-bar-root-padding-left',
    libraryName: 'Web :: Core ProgressBars',
    componentName: 'ProgressBar',
    property: 'paddingLeft',
    from: 0,
    toAnyNumber: true,
    reason: 'allowed root ProgressBar left padding override',
  },
  {
    id: 'progress-bar-fill-padding-right',
    libraryName: 'Web :: Core ProgressBars',
    componentName: 'ProgressBar',
    layerName: 'Fill',
    property: 'paddingRight',
    from: 10,
    toAnyNumber: true,
    reason: 'allowed Fill padding override in ProgressBar',
  },
  {
    id: 'progress-bar-fill-color',
    libraryName: 'Web :: Core ProgressBars',
    componentName: 'ProgressBar',
    layerName: 'Fill',
    property: 'fill',
    from: 'accent/primary',
    toTokenized: true,
    reason: 'allowed Fill color override in ProgressBar',
  },
  {
    id: 'body-cell-text-minus-style',
    libraryName: 'Web :: Corp Components',
    componentName: '[D] BodyCell :: Basic',
    matchNodePathWhenComponentNameMismatch: true,
    nodePathIncludes: '[D] BodyCell :: Basic',
    layerName: 'Minus',
    property: 'textStyle',
    from: 'Paragraph/16–20 Component Primary',
    allowAnyActual: true,
    reason: 'allowed Minus typography override in BodyCell Amount/Text context',
  },
  {
    id: 'body-cell-text-minus-fill',
    libraryName: 'Web :: Corp Components',
    componentName: '[D] BodyCell :: Basic',
    matchNodePathWhenComponentNameMismatch: true,
    nodePathIncludes: '[D] BodyCell :: Basic',
    layerName: 'Minus',
    property: 'fill',
    from: 'text/primary',
    toTokenized: true,
    reason: 'allowed Minus color override in BodyCell Amount/Text context',
  },
  {
    id: 'body-cell-text-major-fill',
    libraryName: 'Web :: Corp Components',
    componentName: '[D] BodyCell :: Basic',
    matchNodePathWhenComponentNameMismatch: true,
    nodePathIncludes: '[D] BodyCell :: Basic',
    layerName: 'Major',
    property: 'fill',
    from: 'text/primary',
    toTokenized: true,
    reason: 'allowed Major color override in BodyCell Amount/Text context',
  },
  {
    id: 'body-cell-text-minor-fill',
    libraryName: 'Web :: Corp Components',
    componentName: '[D] BodyCell :: Basic',
    matchNodePathWhenComponentNameMismatch: true,
    nodePathIncludes: '[D] BodyCell :: Basic',
    layerName: 'Minor',
    property: 'fill',
    from: 'text/primary',
    toTokenized: true,
    reason: 'allowed Minor color override in BodyCell Amount/Text context',
  },
  {
    id: 'body-cell-text-currency-fill',
    libraryName: 'Web :: Corp Components',
    componentName: '[D] BodyCell :: Basic',
    matchNodePathWhenComponentNameMismatch: true,
    nodePathIncludes: '[D] BodyCell :: Basic',
    layerName: 'Currency',
    property: 'fill',
    from: 'text/primary',
    toTokenized: true,
    reason: 'allowed Currency color override in BodyCell Amount/Text context',
  },
  {
    id: 'body-cell-content-spacing',
    libraryName: 'Web :: Corp Components',
    componentName: '[D] BodyCell :: Basic',
    matchNodePathWhenComponentNameMismatch: true,
    nodePathIncludes: '[D] BodyCell :: Basic',
    layerName: 'Content',
    property: 'itemSpacing',
    from: 6,
    to: 0,
    reason: 'allowed Content spacing override in BodyCell text context',
  },
  {
    id: 'title-view-button-paintme-fill',
    libraryName: 'Web :: Corp Components',
    componentName: '[D] TitleView',
    nestedComponentName: '[D] Button',
    nestedOwnerPathIncludes: '[D] Button',
    nestedOwnerRelativePath: 'PaintMe',
    layerName: 'PaintMe',
    property: 'fill',
    from: 'status/info',
    toTokenized: true,
    reason: 'allowed nested Button icon recolor in TitleView',
  },
  {
    id: 'link-label-fill-tokenized',
    libraryName: 'Web :: Core',
    componentName: 'Link',
    layerName: 'Label',
    property: 'fill',
    from: 'text/info',
    toTokenized: true,
    reason: 'allowed tokenized label recolor in Link',
  },
  {
    id: 'link-label-fill-tokenized-nested',
    nestedComponentName: 'Link',
    nestedOwnerPathIncludes: 'Link',
    layerName: 'Label',
    property: 'fill',
    from: 'text/info',
    toTokenized: true,
    reason: 'allowed tokenized nested Link label recolor',
  },
  {
    id: 'link-paintme-fill-tokenized',
    libraryName: 'Web :: Core',
    componentName: 'Link',
    layerName: 'PaintMe',
    property: 'fill',
    from: 'text/info',
    toTokenized: true,
    reason: 'allowed tokenized icon recolor in Link',
  },
  {
    id: 'link-paintme-fill-tokenized-nested',
    nestedComponentName: 'Link',
    nestedOwnerPathIncludes: 'Link',
    layerName: 'PaintMe',
    property: 'fill',
    from: 'text/info',
    toTokenized: true,
    reason: 'allowed tokenized nested Link icon recolor',
  },
  {
    id: 'link-underline-stroke-tokenized',
    libraryName: 'Web :: Core',
    componentName: 'Link',
    layerName: 'Underline',
    property: 'stroke',
    from: 'decorative/purple',
    toTokenized: true,
    reason: 'allowed tokenized underline recolor in Link',
  },
  {
    id: 'link-underline-stroke-tokenized-nested',
    nestedComponentName: 'Link',
    nestedOwnerPathIncludes: 'Link',
    layerName: 'Underline',
    property: 'stroke',
    from: 'decorative/purple',
    toTokenized: true,
    reason: 'allowed tokenized nested Link underline recolor',
  },
  {
    id: 'filter-tag-paintme-fill',
    libraryName: 'Web :: Core',
    componentName: '[D] FilterTag',
    layerName: 'PaintMe',
    property: 'fill',
    from: 'text/info',
    toTokenized: true,
    reason: 'allowed tokenized PaintMe recolor in FilterTag',
  },
];

export function applyAllowedCustomizationRules(
  diffs: DiffEntry[],
  context: AllowedCustomizationContext,
): DiffEntry[] {
  if (!Array.isArray(diffs) || !diffs.length) {
    return [];
  }

  const componentAliases = new Set<string>();
  addNameAliases(componentAliases, context.componentName);
  addNameAliases(componentAliases, context.referenceComponentName ?? null);

  return diffs.filter((diff) => {
    const parsedDiff = parseCustomizationDiff(diff.message);
    if (!parsedDiff) {
      return true;
    }

    const nestedComponentName = resolveNestedComponentName(diff);
    const rule = allowedCustomizationRules.find((candidate) =>
      matchesAllowedCustomizationRule(candidate, {
        diff,
        parsedDiff,
        context,
        componentAliases,
        nestedComponentName,
      }),
    );

    if (!rule) {
      return true;
    }

    traceAudit('allowed-customization', {
      nodeId: diff.nodeId ?? null,
      nodeName: diff.nodeName,
      libraryName: context.libraryName,
      componentName: context.referenceComponentName ?? context.componentName,
      categoryDecision: 'allowed-customization',
      matchedRule: rule.id,
      property: parsedDiff.property,
      expected: parsedDiff.expected,
      actual: parsedDiff.actual,
      reason: rule.reason,
    });

    return false;
  });
}

function matchesAllowedCustomizationRule(
  rule: AllowedCustomizationRule,
  payload: {
    diff: DiffEntry;
    parsedDiff: ParsedCustomizationDiff;
    context: AllowedCustomizationContext;
    componentAliases: Set<string>;
    nestedComponentName: string | null;
  },
): boolean {
  const { diff, parsedDiff, context, componentAliases, nestedComponentName } = payload;

  if (rule.libraryName && context.libraryName !== rule.libraryName) {
    return false;
  }

  const componentNameMatched = rule.componentName
    ? componentAliases.has(normalizeName(rule.componentName))
    : false;
  const nodePathMatched = matchesPathPart(diff.nodePath, rule.nodePathIncludes);

  if (rule.componentName && !componentNameMatched) {
    if (!(rule.matchNodePathWhenComponentNameMismatch && nodePathMatched)) {
      return false;
    }
  }

  if (
    rule.contextComponentName &&
    !componentAliases.has(normalizeName(rule.contextComponentName))
  ) {
    return false;
  }

  if (
    rule.nestedComponentName &&
    normalizeName(nestedComponentName) !== normalizeName(rule.nestedComponentName) &&
    !matchesPathPart(diff.context.nestedOwnerPath, rule.nestedOwnerPathIncludes)
  ) {
    return false;
  }

  if (
    rule.nestedOwnerPathIncludes &&
    !matchesPathPart(diff.context.nestedOwnerPath, rule.nestedOwnerPathIncludes)
  ) {
    return false;
  }

  if (
    rule.nestedOwnerRelativePath &&
    !matchesPathPart(diff.context.nestedOwnerRelativePath, rule.nestedOwnerRelativePath)
  ) {
    return false;
  }

  if (
    rule.nodePathIncludes &&
    !rule.matchNodePathWhenComponentNameMismatch &&
    !nodePathMatched
  ) {
    return false;
  }

  if (rule.layerName && !isMatchingLayerName(diff.nodeName, rule.layerName)) {
    return false;
  }

  if (parsedDiff.property !== rule.property) {
    return false;
  }

  if (rule.from !== undefined && !valuesEqual(parsedDiff.expected, rule.from)) {
    return false;
  }

  if (rule.to !== undefined && !valuesEqual(parsedDiff.actual, rule.to)) {
    return false;
  }

  if (rule.toTokenized && !isTokenizedValue(parsedDiff.actual)) {
    return false;
  }

  if (rule.toAnyNumber && typeof parsedDiff.actual !== 'number') {
    return false;
  }

  if (
    !rule.allowAnyActual &&
    rule.to === undefined &&
    !rule.toTokenized &&
    !rule.toAnyNumber
  ) {
    return false;
  }

  return true;
}

function parseCustomizationDiff(message: string | null | undefined): ParsedCustomizationDiff | null {
  const normalizedMessage = String(message ?? '').trim();
  if (!normalizedMessage) {
    return null;
  }

  const matchers: Array<[RegExp, AllowedCustomizationProperty]> = [
    [/^заливка:\s*(.+?)\s*→\s*(.+)$/u, 'fill'],
    [/^обводка:\s*(.+?)\s*→\s*(.+)$/u, 'stroke'],
    [/^Стиль текст:\s*(.+?)\s*→\s*(.+)$/u, 'textStyle'],
    [/^Отступ между элементами:\s*(.+?)\s*→\s*(.+)$/u, 'itemSpacing'],
    [/^Паддинг left:\s*(.+?)\s*→\s*(.+)$/u, 'paddingLeft'],
    [/^Паддинг right:\s*(.+?)\s*→\s*(.+)$/u, 'paddingRight'],
    [/^Прозрачность:\s*(.+?)\s*→\s*(.+)$/u, 'opacity'],
  ];

  for (const [pattern, property] of matchers) {
    const match = normalizedMessage.match(pattern);
    if (!match) {
      continue;
    }

    return {
      property,
      expected: parseValue(match[1]),
      actual: parseValue(match[2]),
    };
  }

  return null;
}

function parseValue(value: string | null | undefined): string | number {
  const normalized = String(value ?? '').trim();
  const numeric = Number(normalized);

  if (normalized && Number.isFinite(numeric) && /^[-+]?\d+(\.\d+)?$/.test(normalized)) {
    return numeric;
  }

  return normalized;
}

function valuesEqual(left: string | number, right: string | number): boolean {
  if (typeof left === 'number' || typeof right === 'number') {
    return Number(left) === Number(right);
  }

  return String(left).trim() === String(right).trim();
}

function resolveNestedComponentName(diff: DiffEntry): string | null {
  const componentKey = diff.context.nestedOwnerComponentKey ?? null;
  if (!componentKey) {
    return null;
  }

  const component = findComponent(componentKey);
  return component?.displayName ?? component?.name ?? component?.names?.[0] ?? null;
}

function isMatchingLayerName(actualName: string | null | undefined, expectedName: string): boolean {
  return normalizeName(actualName) === normalizeName(expectedName);
}

function matchesPathPart(
  actualPath: string | null | undefined,
  expectedPart: string | null | undefined,
): boolean {
  const normalizedExpected = normalizeName(expectedPart);
  if (!normalizedExpected) {
    return true;
  }

  return normalizeName(actualPath).includes(normalizedExpected);
}

function normalizeName(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/^[^0-9A-Za-zА-Яа-я\[]+\s*/u, '')
    .trim()
    .toLowerCase();
}

function addNameAliases(target: Set<string>, value: string | null | undefined): void {
  const normalized = normalizeName(value);
  if (!normalized) {
    return;
  }

  target.add(normalized);
}

function isTokenizedValue(value: string | number): boolean {
  if (typeof value === 'number') {
    return false;
  }

  const normalized = value.trim();
  if (!normalized || normalized === '—') {
    return false;
  }

  if (normalized.startsWith('#') || normalized.startsWith('rgba(')) {
    return false;
  }

  return /[A-Za-zА-Яа-я]/u.test(normalized);
}
