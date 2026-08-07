import type {
  DiffEntry,
  DiffValueDetails,
  VariableBindingEvidence,
} from '../structure/diff';
import {
  findComponentContractRulesForDiff,
  findComponentContractViolationForDiff,
  type ComponentContractRule,
} from '../contracts/componentRules';
import type {
  AuditItem,
  AuditResource,
  CustomStyleEntry,
  DeprecatedStyleEntry,
  DetachedEntry,
  ThemeAuditEntry,
} from '../types/audit';
import type {
  ApolloStatsReport,
  ApolloStatsViews,
  StatsCategory,
  StatsComponentItem,
  StatsComponentContractRule,
  StatsCustomizationChange,
  StatsCustomizationItem,
  StatsDetachedItem,
  StatsResource,
  StatsStyleItem,
  StatsThemeItem,
} from './types';
import { getAuditPresentationForComponent } from '../contracts/runtimeContractRegistry';

export { buildApolloAgentReport } from './agentReport';

type ResourceResolver = (
  id: string,
  displayName: string | null,
) => StatsResource | null;

export type BuildApolloStatsReportInput = {
  pluginVersion: string;
  user: {
    id: string | null;
    name: string;
  };
  figma: {
    fileKey: string | null;
    fileName: string | null;
    editorType: string;
  };
  scan: {
    channel: string;
    startedAt: Date;
    finishedAt: Date;
    selection: Array<{
      nodeId: string;
      name: string;
      nodeType: string;
      path: string;
      componentKey: string | null;
    }>;
    settings: {
      shellAuditEnabled: boolean;
      experimentalContractV2Enabled: boolean;
    };
    scannedComponents: number;
  };
  views: ApolloStatsViews;
  resolveStyleResource: ResourceResolver;
  resolveTokenResource: ResourceResolver;
};

export function buildApolloStatsReport(
  input: BuildApolloStatsReportInput,
): ApolloStatsReport {
  const userName = input.user.name.trim() || 'Unknown User';
  const userSlug = slugifyUserName(userName);
  const finishedAt = input.scan.finishedAt;
  const categories = {
    deprecatedComponents: category(
      input.views.deprecatedComponents.map(componentItem),
    ),
    deprecatedStyles: category(
      input.views.deprecatedStyles.map(deprecatedStyleItem),
    ),
    customStyles: category(
      input.views.customStyles.map(customStyleItem),
    ),
    updates: category(input.views.updates.map(componentItem)),
    customizations: category(
      input.views.customizations.map((item) =>
        customizationItem(item, input),
      ),
    ),
    localComponents: category(input.views.localComponents.map(componentItem)),
    detachedComponents: category(
      input.views.detachedComponents.map(detachedItem),
    ),
    presets: category(input.views.presets.map(componentItem)),
    technicalComponents: category(
      input.views.technicalComponents.map(componentItem),
    ),
    currentComponents: category(
      input.views.currentComponents.map(componentItem),
    ),
    wrongChannel: category(input.views.wrongChannel.map(componentItem)),
    themization: category(input.views.themization.map(themeItem)),
  };

  const categoryCounts = Object.fromEntries(
    Object.entries(categories).map(([key, value]) => [key, value.count]),
  ) as Record<keyof ApolloStatsViews, number>;
  const customizationProblemCount = categories.customizations.items.filter(
    (item) =>
      item.changes.some(
        (change) =>
          change.assessment?.verdict !== 'expected' &&
          change.assessment?.verdict !== 'allowed',
      ),
  ).length;
  const problemOccurrenceCount = Object.entries(categoryCounts)
    .filter(
      ([key]) => key !== 'currentComponents' && key !== 'customizations',
    )
    .reduce((sum, [, count]) => sum + count, customizationProblemCount);

  return {
    schemaVersion: 1,
    reportId: createReportId(input.user.id, finishedAt),
    generatedAt: finishedAt.toISOString(),
    suggestedFileName: `${userSlug}_${formatLocalTimestamp(finishedAt)}.json`,
    user: {
      id: input.user.id,
      name: userName,
      slug: userSlug,
    },
    plugin: {
      name: 'Apollo',
      version: input.pluginVersion,
    },
    figma: input.figma,
    scan: {
      channel: input.scan.channel,
      startedAt: input.scan.startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: Math.max(
        0,
        finishedAt.getTime() - input.scan.startedAt.getTime(),
      ),
      selection: input.scan.selection,
      settings: input.scan.settings,
    },
    summary: {
      scannedComponents: input.scan.scannedComponents,
      problemOccurrenceCount,
      categoryCounts,
    },
    categories,
  };
}

export function slugifyUserName(value: string): string {
  const slug = value
    .trim()
    .replace(/[^a-zA-Z0-9А-Яа-яЁё._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '');
  return slug || 'Unknown-User';
}

function category<T>(items: T[]): StatsCategory<T> {
  return { count: items.length, items };
}

function componentItem(item: AuditItem): StatsComponentItem {
  const reference = item.reference ?? null;
  const componentName =
    reference?.displayName || reference?.name || item.name || 'Unknown component';
  const variantKey = item.resolvedReferenceVariantKey ?? null;
  const variantName = item.resolvedReferenceVariantName ?? null;
  return {
    node: auditNode(item),
    component: {
      type: 'component',
      name: componentName,
      key: item.componentKey,
      id: null,
      library: item.librarySource ?? null,
      sourceFile: item.librarySourceFile ?? null,
    },
    variant:
      variantKey || variantName
        ? {
            type: 'component-variant',
            name: variantName ?? variantKey ?? 'Unknown variant',
            key: variantKey,
            id: null,
            library: item.librarySource ?? null,
            sourceFile: item.librarySourceFile ?? null,
          }
        : null,
    comparisonIssues: item.comparisonIssues ?? [],
    updateReasons: item.updateReasons ?? [],
    libraryFreshness: item.libraryFreshness ?? null,
    localComponentOwner: item.localComponentOwner
      ? {
          id: item.localComponentOwner.id,
          name: item.localComponentOwner.name,
          type: 'COMPONENT',
          pageName: item.localComponentOwner.pageName,
          path: item.localComponentOwner.fullPath,
          visible: true,
        }
      : null,
  };
}

function customizationItem(
  item: AuditItem,
  input: BuildApolloStatsReportInput,
): StatsCustomizationItem {
  const component = componentItem(item);
  return {
    node: component.node,
    component: component.component,
    variant: component.variant,
    comparisonIssues: component.comparisonIssues,
    updateReasons: component.updateReasons,
    libraryFreshness: component.libraryFreshness,
    localComponentOwner: component.localComponentOwner,
    changes: (item.diffs ?? []).map((diff) =>
      customizationChange(diff, item, input),
    ),
  };
}

function customizationChange(
  diff: DiffEntry,
  item: AuditItem,
  input: BuildApolloStatsReportInput,
): StatsCustomizationChange {
  const property = diff.details?.property ?? inferProperty(diff.message);
  const reference = diff.details?.reference ?? { value: null };
  const actual = diff.details?.actual ?? { value: null };
  const referenceResource = resolveDiffResource(reference, input);
  const actualResource = resolveDiffResource(actual, input);
  const referenceBinding = resolveStatsBinding(reference, referenceResource);
  const actualBinding = resolveStatsBinding(actual, actualResource);
  const componentRules = findComponentContractRulesForDiff(diff).map(
    statsComponentRule,
  );
  const componentContractViolation =
    findComponentContractViolationForDiff(diff);
  const runtimeAssessmentIsAuthoritative =
    diff.assessment && diff.assessment.verdict !== 'unknown';
  const componentKey = item.componentKey ?? 'local';
  const referenceSignature = resourceSignature(
    referenceResource,
    reference.value,
  );
  const actualSignature = resourceSignature(actualResource, actual.value);
  const runtimeAssessment: StatsCustomizationChange['assessment'] =
    diff.assessment
      ? {
          verdict: diff.assessment.verdict,
          source: diff.assessment.source,
          reasonCode: diff.assessment.reasonCode,
          ruleId: diff.assessment.ruleId,
          contractId: diff.assessment.contractId ?? null,
          constraintId: diff.assessment.constraintId ?? null,
          evidence: diff.assessment.evidence ?? null,
          message: diff.assessment.message,
          remediation: diff.assessment.remediation
            ? {
                kind: diff.assessment.remediation.kind,
                nodeId: diff.assessment.remediation.nodeId,
                properties: diff.assessment.remediation.properties,
              }
            : null,
        }
      : null;
  const assessment: StatsCustomizationChange['assessment'] =
    runtimeAssessmentIsAuthoritative || !componentContractViolation
      ? runtimeAssessment
      : {
          verdict: 'violation',
          source: 'component-contract',
          reasonCode: 'component-contract-violation',
          ruleId: componentContractViolation.ruleId,
          message: componentContractViolation.ruleText,
          remediation: null,
        };

  return {
    node: diffNode(diff, item),
    kind: diff.diffKind ?? 'other',
    property,
    message: diff.message,
    reference: {
      value: reference.value,
      resource: referenceResource,
      binding: referenceBinding,
    },
    actual: {
      value: actual.value,
      resource: actualResource,
      binding: actualBinding,
    },
    bindingStatus: diff.details?.bindingStatus ?? null,
    variableMode: diff.details?.variableMode ?? null,
    signature: [
      'component',
      componentKey,
      diff.diffKind ?? 'other',
      property,
      `${referenceSignature}->${actualSignature}`,
    ].join(':'),
    context: {
      actualComponentKey: diff.context.actualComponentKey,
      referenceComponentKey: diff.context.referenceComponentKey,
      referenceOrigin: diff.context.referenceOrigin,
      actualNestedOwnerComponentKey:
        diff.context.actualNestedOwnerComponentKey,
      actualNestedOwnerPath: diff.context.actualNestedOwnerPath,
      actualNestedOwnerRelativePath:
        diff.context.actualNestedOwnerRelativePath,
      nestedOwnerComponentKey: diff.context.nestedOwnerComponentKey,
      nestedOwnerComponentRole: diff.context.nestedOwnerComponentRole,
      nestedOwnerPath: diff.context.nestedOwnerPath,
      nestedOwnerRelativePath: diff.context.nestedOwnerRelativePath,
      actualVariantProperties: diff.context.actualVariantProperties ?? null,
      referenceVariantProperties:
        diff.context.referenceVariantProperties ?? null,
      surfaceContext: diff.context.surfaceContext ?? null,
    },
    componentRules,
    presentation: getAuditPresentationForComponent(
      diff.context.actualComponentKey ??
        diff.context.actualNestedOwnerComponentKey ??
        diff.context.nestedOwnerComponentKey ??
        diff.context.referenceComponentKey ??
        item.componentKey,
      property,
    ),
    assessment,
  };
}

function resolveStatsBinding(
  value: DiffValueDetails,
  resource: StatsResource | null,
): VariableBindingEvidence | null {
  if (value.binding) {
    return value.binding;
  }
  const bindingId = value.bindingId ?? value.resourceId ?? null;
  if (value.resourceType !== 'token' || !bindingId) {
    return null;
  }
  return {
    id: bindingId,
    key: resource?.key ?? null,
    name: resource?.name ?? value.displayName ?? null,
    collectionId: null,
    collectionName: resource?.library ?? null,
    resolvedModeId: null,
    resolvedModeName: null,
    explicitModeId: null,
    explicitModeName: null,
    modeSource: 'unknown',
    modeOwnerNodeId: null,
    modeOwnerName: null,
    modeOwnerPath: null,
  };
}

function statsComponentRule(
  rule: ComponentContractRule,
): StatsComponentContractRule {
  return {
    ruleId: rule.ruleId,
    severity: rule.severity,
    source: rule.source,
    ruleKind: rule.ruleKind ?? null,
    severityScope: rule.severityScope ?? null,
    appliesTo: rule.appliesTo,
    checkType: rule.checkType ?? null,
    matchKind: rule.matchKind ?? null,
    changeScope: rule.changeScope ?? null,
    ruleText: rule.ruleText,
    remediation: rule.remediation ?? null,
    numericConstraint: rule.numericConstraint ?? null,
  };
}

function diffNode(diff: DiffEntry, item: AuditItem) {
  return {
    id: diff.nodeId ?? item.id,
    name: diff.nodeName || item.name,
    type: null,
    pageName: item.pageName,
    path: diff.nodePath || item.fullPath,
    visible: diff.visible ?? true,
  };
}

function resolveDiffResource(
  value: DiffValueDetails,
  input: BuildApolloStatsReportInput,
): StatsResource | null {
  const id = value.resourceId ?? null;
  if (!id || !value.resourceType) {
    return null;
  }
  if (value.resourceType === 'style') {
    return input.resolveStyleResource(id, value.displayName ?? null);
  }
  if (value.resourceType === 'token') {
    return input.resolveTokenResource(id, value.displayName ?? null);
  }
  if (value.resourceType === 'color') {
    return {
      type: 'raw-value',
      name: value.displayName ?? String(value.value ?? 'Raw color'),
      key: null,
      id: null,
      library: null,
      sourceFile: null,
    };
  }
  return null;
}

function deprecatedStyleItem(entry: DeprecatedStyleEntry): StatsStyleItem {
  return {
    node: simpleNode(entry, entry.name, entry.path),
    style: {
      type: 'style',
      name: entry.styleLabel,
      key: entry.styleKey,
      id: entry.styleId,
      library: entry.sourceLibrary ?? null,
      sourceFile: entry.sourceFile,
    },
    usage: entry.reason,
  };
}

function customStyleItem(entry: CustomStyleEntry): StatsStyleItem {
  return {
    node: simpleNode(entry, entry.name, entry.path),
    style: auditResource(entry.resource),
    usage: entry.reason,
  };
}

function detachedItem(entry: DetachedEntry): StatsDetachedItem {
  return {
    node: {
      id: entry.id,
      name: entry.name,
      type: 'FRAME_OR_GROUP',
      pageName: entry.pageName,
      path: entry.path,
      visible: entry.visible,
    },
    component: {
      type: 'component',
      name: entry.componentName ?? entry.name,
      key: entry.componentKey,
      id: null,
      library: entry.libraryName,
      sourceFile: entry.sourceFile ?? null,
    },
  };
}

function themeItem(entry: ThemeAuditEntry): StatsThemeItem {
  return {
    node: {
      id: entry.nodeId ?? entry.id,
      name: entry.name,
      type: entry.nodeType,
      pageName: entry.pageName,
      path: entry.path,
      visible: entry.visible,
    },
    kind: entry.kind,
    recommendation: entry.recommendation,
    component: entry.replacementComponentKey
      ? {
          type: 'component',
          name: entry.name,
          key: entry.replacementComponentKey,
          id: null,
          library: entry.libraryName ?? null,
          sourceFile: null,
        }
      : null,
  };
}

function auditNode(item: AuditItem) {
  return {
    id: item.id,
    name: item.name,
    type: item.nodeType,
    pageName: item.pageName,
    path: item.fullPath,
    visible: item.pathSegments.every((segment) => segment.visible !== false),
  };
}

function simpleNode(
  entry: {
    id: string;
    nodeType: string | null;
    pageName: string;
    visible: boolean;
  },
  name: string,
  path = name,
) {
  return {
    id: entry.id,
    name,
    type: entry.nodeType,
    pageName: entry.pageName,
    path,
    visible: entry.visible,
  };
}

function auditResource(resource: AuditResource): StatsResource {
  return {
    type: resource.type,
    name: resource.name,
    key: resource.key,
    id: resource.id ?? null,
    library: resource.library,
    sourceFile: resource.sourceFile ?? null,
  };
}

function inferProperty(message: string): string {
  const label = message.split(':', 1)[0]?.trim().toLowerCase() ?? 'change';
  return label
    .replace(/\s+\(токен\)$/u, 'Token')
    .replace(/\s+/g, '.');
}

function resourceSignature(
  resource: StatsResource | null,
  value: string | number | null,
): string {
  return resource?.key ?? resource?.id ?? String(value ?? 'null');
}

function createReportId(userId: string | null, date: Date): string {
  const entropy = Math.random().toString(36).slice(2, 10);
  return `apollo-${userId ?? 'anonymous'}-${date.getTime()}-${entropy}`;
}

function formatLocalTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`,
    `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`,
  ].join('_');
}
