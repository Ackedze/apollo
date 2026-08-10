import type { CheckState } from '../create-check-state';
import { filterIgnoredLocalLibraryItems } from '../filters/ignoredComponentFilters';
import { buildApolloAgentReport, buildApolloStatsReport } from '../stats/report';
import type {
  ApolloAgentReport,
  ApolloStatsReport,
  ApolloStatsViews,
  StatsResource,
} from '../stats/types';
import { computeChangesResults } from './auditViewBuilder';

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
    startedAt: Date;
    finishedAt: Date;
    shellAuditEnabled: boolean;
    experimentalContractV2Enabled: boolean;
  };
  selection: readonly TNode[];
  checkState: CheckState;
  views: AuditResultViews;
  resolveNodePath: (node: TNode) => string;
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
}

export function buildAuditResultViews(checkState: CheckState): AuditResultViews {
  const changes = computeChangesResults(
    checkState.relevanceBuckets.current.concat(
      checkState.contractCustomizationItems ?? [],
    ),
  );
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

  return {
    report,
    agentReport: buildApolloAgentReport(report),
  };
}
