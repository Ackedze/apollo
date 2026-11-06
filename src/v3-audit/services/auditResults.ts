import type { CheckState } from '../create-check-state';
import { filterIgnoredLocalLibraryItems } from '../filters/ignoredComponentFilters';
import {
  buildApolloAgentReport,
  buildApolloBaselineCustomizationReport,
  buildApolloStatsReport,
} from '../stats/report';
import { buildApolloPatternAuditReport } from '../stats/patternReport';
import type {
  ApolloAgentReport,
  ApolloBaselineCustomizationReport,
  ApolloLayoutRelation,
  ApolloPatternAuditReport,
  ApolloStatsReport,
  ApolloStatsViews,
  StatsResource,
} from '../stats/types';
import {
  computeBaselineChangeResults,
  computeChangesResults,
} from './auditViewBuilder';
import type { ApolloPageType } from '../types/pageContext';

export interface AuditResultViews {
  visibleViews: {
    relevance: CheckState['relevanceBuckets'];
    themization: CheckState['themizationEntries'];
    wrongChannel: CheckState['wrongChannelEntries'];
    local: CheckState['localLibraryItems'];
    deprecatedStyles: CheckState['deprecatedStyleEntries'];
    customStyles: CheckState['customStyleEntries'];
    detached: CheckState['detachedEntries'];
    presets: CheckState['presetItems'];
    changesWip: ApolloStatsViews['customizations'];
    changes: ApolloStatsViews['customizations'];
  };
  statsViews: ApolloStatsViews;
}

export interface AuditReportSelectionNode {
  id: string;
  name: string;
  type: string;
}

export interface PrepareAuditReportInput<TNode extends AuditReportSelectionNode> {
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
    pageType: ApolloPageType | null;
    startedAt: Date;
    finishedAt: Date;
    shellAuditEnabled: boolean;
    experimentalContractV2Enabled: boolean;
  };
  selection: readonly TNode[];
  checkState: CheckState;
  views: AuditResultViews;
  resolveNodePath: (node: TNode) => string;
  layoutRelations?: ApolloLayoutRelation[];
  resolveComponentKey: (node: TNode) => Promise<string | null>;
  resolveStyleResource: (
    id: string,
    displayName: string | null,
  ) => StatsResource | null;
  resolveTokenResource: (
    id: string,
    displayName: string | null,
  ) => StatsResource | null;
}

export interface AuditReportBundle {
  report: ApolloStatsReport;
  agentReport: ApolloAgentReport;
  baselineCustomizationReport: ApolloBaselineCustomizationReport;
  patternReport: ApolloPatternAuditReport;
}

export function buildAuditResultViews(checkState: CheckState): AuditResultViews {
  const baselineChangeCandidates = Object.values(checkState.relevanceBuckets).flat();
  const changesWip = computeBaselineChangeResults(baselineChangeCandidates);
  const changeCandidates = checkState.relevanceBuckets.current.concat(
    checkState.contractCustomizationItems ?? [],
  );
  const changes = computeChangesResults(changeCandidates);
  const probedItems = Object.values(checkState.relevanceBuckets)
    .flat()
    .filter((item) => item.name.includes('CardSwiperMobile'));
  if (probedItems.length) {
    console.log(`[Apollo][probe] contract-v2-lifecycle ${JSON.stringify({
      stage: 'audit-views-built',
      cardSwiperItems: probedItems.map((item) => ({
        nodeId: item.id,
        name: item.name,
        relevance: item.relevance,
        rawDiffCount: item.diffs.length,
        rawDiffs: item.diffs.map((diff) => ({
          nodeId: diff.nodeId ?? null,
          property: diff.details?.property ?? null,
          ruleId: diff.assessment?.ruleId ?? null,
          visible: diff.visible !== false,
        })),
        isChangeCandidate: changeCandidates.includes(item),
        isVisibleChange: changes.includes(item),
      })),
      visibleChangeNodeIds: changes.map((item) => item.id),
    })}`);
  }
  const local = filterIgnoredLocalLibraryItems(checkState.localLibraryItems);

  return {
    visibleViews: {
      relevance: checkState.relevanceBuckets,
      themization: checkState.themizationEntries,
      wrongChannel: checkState.wrongChannelEntries,
      local,
      deprecatedStyles: checkState.deprecatedStyleEntries,
      customStyles: checkState.customStyleEntries,
      detached: checkState.detachedEntries,
      presets: checkState.presetItems,
      changesWip,
      changes,
    },
    statsViews: {
      deprecatedComponents: checkState.relevanceBuckets.deprecated,
      deprecatedStyles: checkState.deprecatedStyleEntries,
      customStyles: checkState.customStyleEntries,
      updates: checkState.relevanceBuckets.update,
      customizations: changes,
      localComponents: local,
      detachedComponents: checkState.detachedEntries,
      presets: checkState.presetItems,
      technicalComponents: checkState.relevanceBuckets.technical,
      currentComponents: checkState.relevanceBuckets.current,
      wrongChannel: checkState.wrongChannelEntries,
      themization: checkState.themizationEntries,
    },
  };
}

export async function prepareAuditReport<TNode extends AuditReportSelectionNode>(
  input: PrepareAuditReportInput<TNode>,
): Promise<AuditReportBundle> {
  const selection = await Promise.all(
    input.selection.map(async (node) => ({
      nodeId: node.id,
      name: node.name,
      nodeType: node.type,
      path: input.resolveNodePath(node),
      componentKey:
        node.type === 'INSTANCE' || node.type === 'COMPONENT'
          ? await input.resolveComponentKey(node)
          : null,
    })),
  );
  const report = buildApolloStatsReport({
    pluginVersion: input.pluginVersion,
    user: input.user,
    figma: input.figma,
    scan: {
      channel: input.scan.channel,
      pageType: input.scan.pageType,
      startedAt: input.scan.startedAt,
      finishedAt: input.scan.finishedAt,
      selection,
      settings: {
        shellAuditEnabled: input.scan.shellAuditEnabled,
        experimentalContractV2Enabled: input.scan.experimentalContractV2Enabled,
      },
      scannedComponents: input.checkState.totalItems,
    },
    views: input.views.statsViews,
    resolveStyleResource: input.resolveStyleResource,
    resolveTokenResource: input.resolveTokenResource,
  });

  const agentReport = buildApolloAgentReport(report);
  const baselineCustomizationReport = buildApolloBaselineCustomizationReport(
    report,
    input.views.visibleViews.changesWip,
    {
      pluginVersion: input.pluginVersion,
      user: input.user,
      figma: input.figma,
      scan: {
        channel: input.scan.channel,
        pageType: input.scan.pageType,
        startedAt: input.scan.startedAt,
        finishedAt: input.scan.finishedAt,
        selection,
        settings: {
          shellAuditEnabled: input.scan.shellAuditEnabled,
          experimentalContractV2Enabled: input.scan.experimentalContractV2Enabled,
        },
        scannedComponents: input.checkState.totalItems,
      },
      views: input.views.statsViews,
      resolveStyleResource: input.resolveStyleResource,
      resolveTokenResource: input.resolveTokenResource,
    },
  );
  const patternReport = buildApolloPatternAuditReport(
    report,
    baselineCustomizationReport,
    input.layoutRelations ?? [],
  );

  return {
    report,
    agentReport,
    baselineCustomizationReport,
    patternReport,
  };
}
