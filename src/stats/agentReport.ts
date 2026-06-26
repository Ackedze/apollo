import type {
  ApolloAgentFinding,
  ApolloAgentFindingCategory,
  ApolloAgentReport,
  ApolloAgentSeverityHint,
  ApolloStatsReport,
  StatsComponentItem,
  StatsDetachedItem,
  StatsResource,
  StatsStyleItem,
  StatsThemeItem,
} from './types';

const AGENT_CATEGORIES: ApolloAgentFindingCategory[] = [
  'deprecatedComponents',
  'deprecatedStyles',
  'customStyles',
  'updates',
  'customizations',
  'localComponents',
  'detachedComponents',
  'presets',
  'technicalComponents',
  'wrongChannel',
  'themization',
];

const CATEGORY_SEVERITY: Record<
  ApolloAgentFindingCategory,
  ApolloAgentSeverityHint
> = {
  deprecatedComponents: 'high',
  deprecatedStyles: 'medium',
  customStyles: 'medium',
  updates: 'medium',
  customizations: 'medium',
  localComponents: 'high',
  detachedComponents: 'high',
  presets: 'low',
  technicalComponents: 'low',
  wrongChannel: 'high',
  themization: 'high',
};

export function buildApolloAgentReport(
  report: ApolloStatsReport,
): ApolloAgentReport {
  const findings = buildFindings(report);
  const categorySummaries = {} as ApolloAgentReport['categorySummaries'];
  for (const category of AGENT_CATEGORIES) {
    categorySummaries[category] = {
      totalCount: report.categories[category].count,
      includedCount: findings.filter((finding) => finding.category === category)
        .length,
      severityHint: CATEGORY_SEVERITY[category],
    };
  }
  const summary = Object.assign({}, report.summary, {
    includedFindingCount: findings.length,
    omittedCurrentComponentCount: report.categories.currentComponents.count,
  });

  return {
    schemaVersion: 1,
    reportKind: 'apollo-agent-report',
    reportId: `${report.reportId}:agent`,
    sourceReportId: report.reportId,
    generatedAt: report.generatedAt,
    suggestedFileName: toAgentFileName(report.suggestedFileName),
    user: report.user,
    plugin: report.plugin,
    figma: report.figma,
    scan: report.scan,
    summary,
    guidance: {
      purpose:
        'Use this compact Apollo audit report to compare deterministic audit facts with design-system patterns and produce prioritized recommendations.',
      expectedOutput:
        'Return a table-like recommendation list with priority, affected area, evidence, rationale, and suggested next action.',
      notes: [
        'Apollo facts are deterministic audit output; do not reinterpret expected/allowed customization changes as problems.',
        'currentComponents are intentionally omitted from findings and represented only as coverage counts.',
        'Variant/state changes with properties starting with variant. are first-class evidence and should be surfaced explicitly before derived visual changes.',
        'When referenceValue is null, phrase the change as an observed state without a reference baseline rather than as a confirmed pattern violation.',
        'Do not infer additional pattern violations from a nearby pattern unless the change has assessment.ruleId or an exact matched rule for that property.',
        'For customization findings, use change.node as the affected nested layer/component; finding.node is the audited root selection.',
        'Do not invent usage rationale, action examples, or allowed scenarios that are not present in this report or in an exact pattern source quote.',
        'If assessment.ruleId is null, do not write "the pattern confirms" unless an external pattern lookup returned an exact rule for the same property.',
        'If a pattern source states a prohibition, do not rewrite it as conditional permission.',
        'When exact pattern context is available, include the pattern name and link in the recommendation table.',
        'Pattern examples and anti-examples are not rules; treat them as contextual_example unless an explicit rule text covers the same property/change.',
        'You may raise severity only when pattern lookup returns match_kind=exact_rule for the same property/change and the exact rule has severity=error or an explicit prohibition in the source quote.',
        'When pattern lookup returns match_kind=no_rule or found=false, do not use pattern-agent rationale as a rule; still provide an Apollo-based manual-check recommendation without claiming pattern confirmation.',
        'Use node.id and node.path as evidence anchors for manual follow-up in Figma.',
      ],
    },
    categorySummaries,
    findings,
  };
}

function buildFindings(report: ApolloStatsReport): ApolloAgentFinding[] {
  const findings: ApolloAgentFinding[] = [];

  for (const item of report.categories.deprecatedComponents.items) {
    findings.push(
      componentFinding('deprecatedComponents', item, 'Устаревший компонент'),
    );
  }
  for (const item of report.categories.deprecatedStyles.items) {
    findings.push(styleFinding('deprecatedStyles', item, 'Устаревший стиль'));
  }
  for (const item of report.categories.customStyles.items) {
    findings.push(
      styleFinding('customStyles', item, 'Кастомный стиль или raw-значение'),
    );
  }
  for (const item of report.categories.updates.items) {
    findings.push(
      componentFinding('updates', item, 'Компонент требует обновления'),
    );
  }
  for (const item of report.categories.customizations.items) {
      const changes = item.changes.filter(
        (change) =>
          change.assessment?.verdict !== 'expected' &&
          change.assessment?.verdict !== 'allowed',
      );
      if (!changes.length) {
        continue;
      }

      findings.push({
        category: 'customizations' as const,
        severityHint: CATEGORY_SEVERITY.customizations,
        title: 'Неподтверждённая кастомизация',
        node: item.node,
        component: compactResource(item.component),
        variant: compactVariant(item.variant),
        comparisonIssues: item.comparisonIssues,
        changes: changes.map((change) => ({
          node: change.node,
          kind: change.kind,
          property: change.property,
          message: change.message,
          referenceValue: change.reference.value,
          actualValue: change.actual.value,
          referenceResource: compactResource(change.reference.resource),
          actualResource: compactResource(change.actual.resource),
          assessment: change.assessment,
        })),
      });
  }
  for (const item of report.categories.localComponents.items) {
    findings.push(componentFinding('localComponents', item, 'Локальный компонент'));
  }
  for (const item of report.categories.detachedComponents.items) {
    findings.push(detachedFinding(item));
  }
  for (const item of report.categories.presets.items) {
    findings.push(componentFinding('presets', item, 'Preset-компонент'));
  }
  for (const item of report.categories.technicalComponents.items) {
    findings.push(
      componentFinding('technicalComponents', item, 'Технический компонент'),
    );
  }
  for (const item of report.categories.wrongChannel.items) {
    findings.push(
      componentFinding('wrongChannel', item, 'Компонент не из выбранного канала'),
    );
  }
  for (const item of report.categories.themization.items) {
    findings.push(themeFinding(item));
  }

  return findings;
}

function componentFinding(
  category: ApolloAgentFindingCategory,
  item: StatsComponentItem,
  title: string,
): ApolloAgentFinding {
  return {
    category,
    severityHint: CATEGORY_SEVERITY[category],
    title,
    node: item.node,
    component: compactResource(item.component),
    variant: compactVariant(item.variant),
    comparisonIssues: item.comparisonIssues,
  };
}

function styleFinding(
  category: ApolloAgentFindingCategory,
  item: StatsStyleItem,
  title: string,
): ApolloAgentFinding {
  return {
    category,
    severityHint: CATEGORY_SEVERITY[category],
    title,
    node: item.node,
    style: compactResource(item.style),
    usage: item.usage,
  };
}

function detachedFinding(item: StatsDetachedItem): ApolloAgentFinding {
  return {
    category: 'detachedComponents',
    severityHint: CATEGORY_SEVERITY.detachedComponents,
    title: 'Detach компонента',
    node: item.node,
    component: compactResource(item.component),
  };
}

function themeFinding(item: StatsThemeItem): ApolloAgentFinding {
  return {
    category: 'themization',
    severityHint: CATEGORY_SEVERITY.themization,
    title: 'Проблема темизации',
    node: item.node,
    kind: item.kind,
    recommendation: item.recommendation,
    component: compactResource(item.component),
  };
}

function compactResource(
  resource: StatsResource | null,
): Pick<StatsResource, 'name' | 'key' | 'library' | 'sourceFile'> | null {
  if (!resource) {
    return null;
  }
  return {
    name: resource.name,
    key: resource.key,
    library: resource.library,
    sourceFile: resource.sourceFile,
  };
}

function compactVariant(
  resource: StatsResource | null,
): Pick<StatsResource, 'name' | 'key'> | null {
  if (!resource) {
    return null;
  }
  return {
    name: resource.name,
    key: resource.key,
  };
}

function toAgentFileName(fileName: string): string {
  return fileName.endsWith('.json')
    ? fileName.replace(/\.json$/, '_agent.json')
    : `${fileName}_agent.json`;
}
