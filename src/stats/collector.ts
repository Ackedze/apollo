import type { ApolloStatsReport } from './types';

const DEFAULT_COLLECTOR_URL =
  'https://dwjnndpxzqizrcwpasrs.supabase.co/functions/v1/apollo-stats';

export async function submitApolloStatsReport(
  report: ApolloStatsReport,
  collectorUrl = DEFAULT_COLLECTOR_URL,
): Promise<void> {
  try {
    const response = await fetch(collectorUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(report),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = (await response.json()) as {
      path?: string;
      commitUrl?: string | null;
    };
    console.log('[Apollo] stats report uploaded', {
      reportId: report.reportId,
      path: result.path ?? null,
      commitUrl: result.commitUrl ?? null,
    });
  } catch (error) {
    console.warn('[Apollo] stats upload failed', {
      reportId: report.reportId,
      collectorUrl,
      error,
    });
  }
}
