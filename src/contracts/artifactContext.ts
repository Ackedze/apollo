import { compilePublicArtifact } from './publicArtifact';

export type RuntimeComponentAgentContext = {
  componentKey: string;
  summary: string | null;
  criticalBaselines: string[];
  agentInstructions: string[];
  includedComponents: string[];
  auditInterpretation: Record<string, unknown> | null;
  overrideContext: {
    resetModel: Record<string, unknown> | null;
    publicApi: Record<string, unknown> | null;
  } | null;
};

export type RuntimeAuditPresentation = {
  scope: string | null;
  groupTitle: string | null;
  displayName: string | null;
  priority: number | null;
  resetAction: string | null;
  effectiveBaseline: string | null;
};

export type RuntimeComponentExample = {
  exampleId: string;
  title: string;
  inputChange: Record<string, unknown> | null;
  expectedAudit: Record<string, unknown> | null;
  expectedAgent: Record<string, unknown> | null;
};

export function compactAgentContext(
  payload: any,
  fallbackComponentKey: string,
  overridesPayload?: any,
): RuntimeComponentAgentContext {
  const publicPayload = compilePublicArtifact(payload);
  const publicOverrides = overridesPayload
    ? compilePublicArtifact(overridesPayload)
    : null;
  const summaryValue = publicPayload?.summary ?? null;
  const summary =
    typeof summaryValue === 'string'
      ? summaryValue
      : typeof summaryValue?.purpose === 'string'
        ? summaryValue.purpose
        : null;

  return {
    componentKey: String(
      fallbackComponentKey || publicPayload?.componentKey || '',
    ),
    summary,
    criticalBaselines: stringArray(
      publicPayload?.criticalBaselines,
      16,
    ),
    agentInstructions: stringArray(
      publicPayload?.agentInstructions,
      20,
    ),
    includedComponents: componentNameArray(
      publicPayload?.includedComponents ?? summaryValue?.includedComponents,
      40,
    ),
    auditInterpretation: objectValue(publicPayload?.auditInterpretation),
    overrideContext: publicOverrides
      ? {
          resetModel: compactResetModel(publicOverrides.resetModel),
          publicApi: compactPublicApi(publicOverrides.publicApi),
        }
      : null,
  };
}

function componentNameArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const item of value) {
    const name =
      typeof item === 'string'
        ? item
        : item && typeof item === 'object' && 'name' in item
          ? (item as { name?: unknown }).name
          : null;
    if (typeof name === 'string' && name.trim()) {
      names.push(name);
    }
    if (names.length >= limit) break;
  }
  return names;
}

export function resolveAuditPresentation(
  payload: any,
  property: string,
): RuntimeAuditPresentation | null {
  const publicPayload = compilePublicArtifact(payload);
  const entries = Array.isArray(publicPayload?.classification)
    ? publicPayload.classification
    : [];
  let best: any = null;
  let bestScore = -1;
  for (const entry of entries) {
    const match = objectValue(entry?.match);
    if (!match) continue;
    const exact = typeof match.property === 'string' && match.property === property;
    const prefix =
      typeof match.propertyPrefix === 'string' &&
      property.startsWith(match.propertyPrefix);
    if (!exact && !prefix) continue;
    const score = exact ? 2 : 1;
    if (score >= bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  if (!best) return null;
  return {
    scope: stringOrNull(best.scope),
    groupTitle: stringOrNull(best.groupTitle),
    displayName: stringOrNull(best.displayName),
    priority: typeof best.priority === 'number' ? best.priority : null,
    resetAction: stringOrNull(best.resetAction),
    effectiveBaseline: stringOrNull(best.effectiveBaseline),
  };
}

export function compactExamples(payload: any): RuntimeComponentExample[] {
  const publicPayload = compilePublicArtifact(payload);
  if (!Array.isArray(publicPayload?.examples)) return [];
  return publicPayload.examples.slice(0, 12).map((example: any, index: number) => ({
    exampleId: String(example?.exampleId ?? `example-${index + 1}`),
    title: String(example?.title ?? 'Untitled example'),
    inputChange: objectValue(example?.inputChange),
    expectedAudit: objectValue(example?.expectedAudit),
    expectedAgent: objectValue(example?.expectedAgent),
  }));
}

function objectValue(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : null;
}

function stringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    .slice(0, limit);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function compactResetModel(value: unknown): Record<string, unknown> | null {
  const model = objectValue(value);
  if (!model) return null;
  return {
    componentProperties: stringArray(model.componentProperties, 30),
    layerProperties: stringArray(model.layerProperties, 50),
    dependencyPolicy: stringOrNull(model.dependencyPolicy),
  };
}

function compactPublicApi(value: unknown): Record<string, unknown> | null {
  const api = objectValue(value);
  if (!api) return null;
  const components = Array.isArray(api.components)
    ? api.components.slice(0, 40).map((component: any) => ({
        name: stringOrNull(component?.name),
        key: stringOrNull(component?.key),
        role: stringOrNull(component?.role),
        platform: stringOrNull(component?.platform),
        status: stringOrNull(component?.status),
        generationStatus: stringOrNull(component?.generationStatus),
        allowForNewLayouts:
          typeof component?.allowForNewLayouts === 'boolean'
            ? component.allowForNewLayouts
            : null,
      }))
    : [];
  return {
    components,
    aliases: objectValue(api.aliases),
    codeExports: Array.isArray(api.codeExports) ? api.codeExports.slice(0, 20) : [],
  };
}
