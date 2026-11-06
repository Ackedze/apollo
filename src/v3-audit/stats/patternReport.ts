import type {
  ApolloBaselineCustomizationReport,
  ApolloLayoutRelation,
  ApolloPatternAuditReport,
  ApolloPatternOccurrence,
  ApolloStatsReport,
  StatsComponentItem,
} from './types';

export function buildApolloPatternAuditReport(
  report: ApolloStatsReport,
  baselineCustomizationReport?: ApolloBaselineCustomizationReport,
  layoutRelations: ApolloLayoutRelation[] = [],
): ApolloPatternAuditReport {
  const items = collectUniqueComponentItems(report);
  const occurrences = buildOccurrences(items);
  const requestedRuleIds: string[] = [];

  return {
    schemaVersion: 1,
    reportKind: 'apollo-pattern-audit-report',
    reportId: `${report.reportId}:patterns`,
    sourceReportId: report.reportId,
    generatedAt: report.generatedAt,
    suggestedFileName: toPatternReportFileName(report.suggestedFileName),
    user: report.user,
    plugin: report.plugin,
    figma: report.figma,
    scan: report.scan,
    summary: {
      scannedComponents: report.summary.scannedComponents,
      occurrenceCount: occurrences.length,
      layoutRelationCount: layoutRelations.length,
      generalChangeCount:
        baselineCustomizationReport?.category.changeCount ?? 0,
      requestedRuleCount: requestedRuleIds.length,
    },
    requestedRuleIds,
    category: baselineCustomizationReport?.category ?? {
      id: 'customizationsWip',
      title: 'Кастомизации [WIP]',
      count: 0,
      changeCount: 0,
      items: [],
    },
    facts: { occurrences, layoutRelations },
  };
}

function collectUniqueComponentItems(
  report: ApolloStatsReport,
): StatsComponentItem[] {
  const candidates: StatsComponentItem[] = [
    ...report.categories.deprecatedComponents.items,
    ...report.categories.updates.items,
    ...report.categories.customizations.items,
    ...report.categories.localComponents.items,
    ...report.categories.presets.items,
    ...report.categories.technicalComponents.items,
    ...report.categories.currentComponents.items,
    ...report.categories.wrongChannel.items,
  ];
  const byNodeId = new Map<string, StatsComponentItem>();
  for (const item of candidates) {
    if (item.node.visible === false || byNodeId.has(item.node.id)) continue;
    byNodeId.set(item.node.id, item);
  }
  return [...byNodeId.values()].sort(compareComponentItemsByPath);
}

function buildOccurrences(
  items: StatsComponentItem[],
): ApolloPatternOccurrence[] {
  const itemsByNodeId = new Map(
    items.map((item) => [item.node.id, item]),
  );
  return items.map((item, documentOrder) => {
    const variantProperties = parseVariantProperties(item.variant?.name ?? null);
    const ancestorItems = Array.isArray(item.node.ancestorNodeIds)
      ? item.node.ancestorNodeIds
          .map((nodeId) => itemsByNodeId.get(nodeId) ?? null)
          .filter(
            (candidate): candidate is StatsComponentItem => candidate !== null,
          )
      : items.filter((candidate) =>
          isAncestorPath(candidate.node.path, item.node.path),
        );
    const ancestors = ancestorItems
      .map((candidate) => ({
        nodeId: candidate.node.id,
        name: candidate.node.name,
        componentName: candidate.component.name,
        componentKey: candidate.component.key,
        variantProperties: parseVariantProperties(
          candidate.variant?.name ?? null,
        ),
      }));
    return {
      node: item.node,
      component: {
        name: item.component.name,
        key: item.component.key,
        library: item.component.library,
        sourceFile: item.component.sourceFile,
      },
      variant: item.variant
        ? {
            name: item.variant.name,
            key: item.variant.key,
            properties: variantProperties,
          }
        : null,
      ancestors,
      documentOrder,
    };
  });
}

export function parseVariantProperties(
  value: string | null,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!value) return result;
  for (const segment of value.split(',')) {
    const separatorIndex = segment.indexOf('=');
    if (separatorIndex <= 0) continue;
    const key = segment.slice(0, separatorIndex).trim();
    const propertyValue = segment.slice(separatorIndex + 1).trim();
    if (key && propertyValue) result[key] = propertyValue;
  }
  return result;
}

function isAncestorPath(candidatePath: string, nodePath: string): boolean {
  return (
    candidatePath.length < nodePath.length &&
    nodePath.startsWith(`${candidatePath} / `)
  );
}

function compareComponentItemsByPath(
  left: StatsComponentItem,
  right: StatsComponentItem,
): number {
  const leftDepth = pathDepth(left.node.path);
  const rightDepth = pathDepth(right.node.path);
  if (leftDepth !== rightDepth) return leftDepth - rightDepth;
  return left.node.path.localeCompare(right.node.path);
}

function pathDepth(value: string): number {
  return value.split(' / ').length;
}

function toPatternReportFileName(value: string): string {
  return value.endsWith('.json')
    ? `${value.slice(0, -5)}_patterns.json`
    : `${value}_patterns.json`;
}
