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
        'Values of properties starting with variant. are component state labels, not user-facing copy. Do not apply copywriting/status wording patterns to them unless an exact rule targets the same variant property and value change.',
        'Status model wording rules apply to visible text/content fields, not to component variant labels such as variant.Type=Processing.',
        'When referenceValue is null, phrase the change as an observed state without a reference baseline rather than as a confirmed pattern violation.',
        'Do not infer additional pattern violations from a nearby pattern unless the change has assessment.ruleId or an exact matched rule for that property.',
        'For customization findings, use change.node as the affected nested layer/component; finding.node is the audited root selection.',
        'For customization findings, each item in finding.changes is an independent recommendation candidate. If one finding contains several changes, evaluate every change separately instead of selecting only the first or most visible change.',
        'Every change with assessment.verdict=violation must appear in the main recommendation table as its own row, even when the same finding also contains another pattern violation.',
        'Every change with a componentRules entry where ruleKind=design-rule, severity=error, and matchKind=exact_component_rule must appear in the main recommendation table as its own row. Use the component contract ruleId as the evidence when no pattern link exists.',
        'If the recommendation table is shortened, never omit high-priority exact pattern violations or component-contract design-rule violations.',
        'When rendering values, use change.referenceValue and change.actualValue as the human-readable values. Raw technical ids are preserved separately in referenceRawValue and actualRawValue for evidence only.',
        'Do not invent usage rationale, action examples, or allowed scenarios that are not present in this report or in an exact pattern source quote.',
        'If assessment.ruleId is null, do not write "the pattern confirms" unless an external pattern lookup returned an exact rule for the same property.',
        'If a pattern source states a prohibition, do not rewrite it as conditional permission.',
        'When exact pattern context is available, include the pattern name and link in the recommendation table.',
        'Pattern examples and anti-examples are not rules; treat them as contextual_example unless an explicit rule text covers the same property/change.',
        'You may raise severity only when pattern lookup returns match_kind=exact_rule for the same property/change and the exact rule has severity=error or an explicit prohibition in the source quote.',
        'You may also raise severity when change.componentRules contains a component-contract design-rule with severity=error and matchKind=exact_component_rule for the same property/change.',
        'Do not raise severity for change.componentRules with severity=info; mention them as classification/context notes for the same change instead of treating them as violations.',
        'Do not omit a reported customization only because all matched componentRules are info-level. Surface it as an informational explanation, a manual-check item, or merge it explicitly with a related violation.',
        'If assessment.ruleId is null but change.componentRules contains matched info rules, do not say there is no context; say the component rule explains classification but does not confirm a violation.',
        'When pattern lookup returns match_kind=no_rule or found=false, do not use pattern-agent rationale as a rule; still provide an Apollo-based manual-check recommendation without claiming pattern confirmation.',
        'The presets category is informational. Preset usage is allowed by default and must not be reported as a violation unless there is a separate customization finding or exact rule for the changed preset property.',
        'Do not recommend replacing preset components with base components solely because the component appears in the presets category.',
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
          referenceValue: agentDisplayValue(
            change.reference.value,
            change.reference.resource,
          ),
          actualValue: agentDisplayValue(
            change.actual.value,
            change.actual.resource,
          ),
          referenceRawValue: change.reference.value,
          actualRawValue: change.actual.value,
          referenceDisplayValue: agentDisplayValue(
            change.reference.value,
            change.reference.resource,
          ),
          actualDisplayValue: agentDisplayValue(
            change.actual.value,
            change.actual.resource,
          ),
          referenceResource: compactResource(change.reference.resource),
          actualResource: compactResource(change.actual.resource),
          componentRules: change.componentRules,
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

function agentDisplayValue(
  value: string | number | null,
  resource: StatsResource | null,
): string | number | null {
  if (resource?.name) {
    return resource.name;
  }
  return value;
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
